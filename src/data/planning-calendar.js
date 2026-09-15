const DAY = 86400000;

const dateKey = (value) => String(value || '').slice(0, 10);
const monthKey = (value) => dateKey(value).slice(0, 7);
const parseDate = (value) => {
  const [year, month, day] = dateKey(value).split('-').map(Number);
  return new Date(year, month - 1, day);
};
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const mondayKey = (value) => {
  const date = parseDate(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return isoDate(date);
};
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function aggregate(sessions, keyFor) {
  return (sessions || []).reduce((groups, session) => {
    const key = keyFor(session.date);
    if (!key) return groups;
    const previous = groups[key] || {
      key, sessions: [], load: 0, durationSec: 0, distanceKm: 0,
      elevationGainM: 0, hasWeekendBlock: false,
    };
    return {
      ...groups,
      [key]: {
        ...previous,
        sessions: [...previous.sessions, session],
        load: previous.load + number(session.load),
        durationSec: previous.durationSec + number(session.durationSec),
        distanceKm: previous.distanceKm + number(session.distanceKm ?? (session.distanceM == null ? 0 : session.distanceM / 1000)),
        elevationGainM: previous.elevationGainM + number(session.dplus ?? session.elevationGainM),
        hasWeekendBlock: previous.hasWeekendBlock || Boolean(session.weekendBlock),
      },
    };
  }, {});
}

export const groupSessionsByDay = (sessions) => aggregate(sessions, dateKey);
export const groupSessionsByWeek = (sessions) => aggregate(sessions, mondayKey);
export const groupSessionsByMonth = (sessions) => aggregate(sessions, monthKey);

export function monthlyStats(sessions, monthDate, { today = new Date() } = {}) {
  const key = typeof monthDate === 'string' ? monthDate.slice(0, 7) : monthKey(isoDate(monthDate));
  const todayKey = isoDate(today);
  const month = (sessions || []).filter((session) => monthKey(session.date) === key);
  const completed = month.filter((session) => session.done || (!session.planned && number(session.load) > 0) || session.status === 'RÉALISÉE');
  const missed = month.filter((session) => session.planned && !session.done && dateKey(session.date) <= todayKey
    && ['REFUSÉE', 'ANNULÉE', 'MANQUÉE'].includes(session.status));
  const sum = (list, field) => list.reduce((total, item) => total + number(field(item)), 0);
  return {
    plannedLoad: sum(month.filter((session) => session.planned), (session) => session.load),
    completedLoad: sum(completed, (session) => session.load),
    completedSessions: completed.length,
    missedSessions: missed.length,
    durationSec: sum(completed, (session) => session.durationSec),
    distanceKm: sum(completed, (session) => session.distanceKm ?? (session.distanceM == null ? 0 : session.distanceM / 1000)),
    elevationGainM: sum(completed, (session) => session.dplus ?? session.elevationGainM),
  };
}

export const calculateMonthlyStats = monthlyStats;

export function projectToGoal(plan, goals, { today = new Date() } = {}) {
  const todayKey = isoDate(today);
  const goal = (goals || []).filter((item) => item.priority === 'A' && item.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!goal) return null;
  const relevant = (plan || []).filter((session) => session.date >= todayKey && session.date <= goal.date);
  const weeks = Object.values(groupSessionsByWeek(relevant)).sort((a, b) => a.key.localeCompare(b.key));
  const first = relevant.find((session) => session.phase) || null;
  const milestones = [];
  for (const week of weeks) {
    const sample = week.sessions.find((session) => session.phase) || week.sessions[0];
    if (week.sessions.some((session) => session.easyWeek)) milestones.push({ kind: 'assimilation', date: week.key, label: 'Semaine d’assimilation' });
    const block = week.sessions.find((session) => session.weekendBlock);
    if (block) milestones.push({ kind: 'weekend-block', date: block.date, label: 'Week-end bloc montagne', blockId: block.blockId });
    if (sample?.phase === 'affûtage') milestones.push({ kind: 'taper', date: week.key, label: sample.phaseLabel || 'Affûtage' });
    if (sample?.phase === 'course') milestones.push({ kind: 'race', date: week.key, label: sample.phaseLabel || 'Semaine de course' });
  }
  return {
    goal,
    weeksRemaining: Math.max(0, Math.ceil((parseDate(goal.date) - parseDate(todayKey)) / (7 * DAY))),
    currentPhase: first?.phase ?? null,
    currentPhaseLabel: first?.phaseLabel ?? null,
    weeks,
    milestones,
  };
}

export const buildGoalProjection = ({ sessions, goals, today = new Date() }) => projectToGoal(sessions, goals, { today });
