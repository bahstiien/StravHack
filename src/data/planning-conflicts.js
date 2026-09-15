import { effectiveAvailability } from './planning-availability.js';

const DAY = 86400000;
const at = (date) => new Date(`${date}T12:00:00`).getTime();
const warning = (code, sessionIds, message, date) => ({ code, severity: 'avertissement', blocking: false, sessionIds, date, message });

function monday(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function adjustedLoad(original, session) {
  if (session.load == null) return 0;
  if (session.durationSec > 0 && original?.durationSec > 0 && session.durationSec !== original.durationSec) {
    return Math.round((original.load || 0) * session.durationSec / original.durationSec);
  }
  return session.load;
}

function applyOne(session, decision) {
  if (decision.action === 'validate') return { ...session, status: 'VALIDÉE', locked: true };
  if (decision.action === 'reschedule') return { ...session, date: decision.scheduledDate, status: 'DÉPLACÉE', locked: true, originalDate: decision.originalDate };
  if (decision.action === 'modify') {
    const changed = { ...session, ...decision.changes, status: 'MODIFIÉE', locked: true, original: decision.original || session };
    return { ...changed, load: adjustedLoad(session, changed) };
  }
  if (decision.action === 'cancel') return null;
  return session;
}

export function detectPlanningConflicts(sessions, availability = {}, exceptions = [], options = {}) {
  const conflicts = [];
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const session of sorted) {
    if (session.done || session.status === 'RÉALISÉE') continue;
    const avail = effectiveAvailability(session.date, availability, exceptions);
    if (!avail.available) conflicts.push(warning('JOUR_INDISPONIBLE', [session.id], 'Séance placée un jour indisponible.', session.date));
    const maxDurationMin = avail.maxDurationMin ?? avail.durationMin;
    if (maxDurationMin != null && (session.durationSec || 0) > maxDurationMin * 60) conflicts.push(warning('DUREE_DEPASSEE', [session.id], 'La séance dépasse le temps disponible.', session.date));
    const missing = Array.isArray(avail.equipment)
      ? (session.equipment || []).filter((item) => !avail.equipment.includes(item))
      : [];
    if (missing.length) conflicts.push(warning('MATERIEL_INDISPONIBLE', [session.id], `Matériel indisponible : ${missing.join(', ')}.`, session.date));
  }
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const sameDay = sorted.filter((s) => s.date === current.date);
    if (sameDay.length > 1 && sameDay[0].id === current.id) conflicts.push(warning('PLUSIEURS_SEANCES_MEME_JOUR', sameDay.map((s) => s.id), 'Plusieurs séances sont prévues le même jour.', current.date));
    for (let j = i + 1; j < sorted.length; j += 1) {
      const next = sorted[j];
      const gap = (at(next.date) - at(current.date)) / DAY;
      if (gap > 2) break;
      if (gap <= 1 && current.intensity === 'quality' && next.intensity === 'quality') conflicts.push(warning('SEANCES_QUALITE_CONSECUTIVES', [current.id, next.id], 'Deux séances exigeantes sont consécutives.', next.date));
      if (gap <= 1 && current.type === 'PPG' && current.heavyLegs && next.isClub) conflicts.push(warning('PPG_JAMBES_AVANT_CLUB', [current.id, next.id], 'Cette PPG jambes précède la séance club.', current.date));
      if (gap <= 1 && current.type === 'PPG' && current.heavyLegs && (next.isLongRun || /sortie longue/i.test(next.title || ''))) conflicts.push(warning('PPG_JAMBES_AVANT_SORTIE_LONGUE', [current.id, next.id], 'Cette PPG jambes précède la sortie longue.', current.date));
      if (gap <= 1 && ((current.isLongRun && next.intensity === 'quality') || (next.isLongRun && current.intensity === 'quality'))) conflicts.push(warning('SORTIE_LONGUE_PROCHE_INTENSITE', [current.id, next.id], 'La sortie longue est trop proche d’une séance intense.', next.date));
    }
  }
  const totals = weeklyLoads(sorted);
  for (const [week, load] of Object.entries(totals)) {
    const limit = options.weeklyLoadLimit ?? sorted.find((s) => monday(s.date) === week)?.weekTarget;
    if (limit && load > limit * 1.1) conflicts.push(warning('CHARGE_HEBDOMADAIRE_EXCESSIVE', sorted.filter((s) => monday(s.date) === week).map((s) => s.id), `Charge hebdomadaire excessive (${load} UC).`, week));
  }
  return conflicts;
}

export function weeklyLoads(sessions) {
  return sessions.reduce((loads, session) => ({ ...loads, [monday(session.date)]: (loads[monday(session.date)] || 0) + (session.load || 0) }), {});
}

export function applyDecisionLayer(autoPlan = [], decisions = [], actualSessions = [], availability = {}, exceptions = [], options = {}) {
  const actualIds = new Set(actualSessions.map((s) => s.id));
  const actualDates = new Set(actualSessions.map((s) => String(s.date).slice(0, 10)));
  // Une activité réelle gagne toujours sur sa proposition correspondante : on
  // ne montre jamais le doublon « réalisée + encore à faire » après une synchro.
  const byId = new Map(autoPlan
    .filter((session) => !actualIds.has(session.id) && !actualDates.has(session.date)
      && !actualSessions.some((actual) => actual.activityId && actual.activityId === session.activityId))
    .map((session) => [session.id, { ...session, status: session.status || 'PROPOSÉE' }]));
  const history = [];
  for (const decision of decisions) {
    history.push({ ...decision });
    let current = byId.get(decision.sessionId);
    // Le générateur peut changer ou ne plus émettre la date d'origine au
    // prochain chargement. Une décision verrouillée garde donc son instantané
    // original comme point d'ancrage, sauf si le réel a depuis pris sa place.
    if (!current && decision.original && !['reject', 'cancel'].includes(decision.action)) {
      const targetDate = decision.scheduledDate || decision.original.date;
      if (!actualDates.has(targetDate)) {
        current = { ...decision.original, status: 'PROPOSÉE' };
        byId.set(decision.sessionId, current);
      }
    }
    if (!current || current.done || current.activityId || actualIds.has(decision.sessionId)) continue;
    if (decision.action === 'reject' || decision.action === 'cancel') byId.delete(decision.sessionId);
    else byId.set(decision.sessionId, applyOne(current, decision));
  }
  const actual = actualSessions.map((session) => ({ ...session, done: true, planned: false, status: 'RÉALISÉE', locked: true }));
  const sessions = [...actual, ...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { sessions, conflicts: detectPlanningConflicts(sessions, availability, exceptions, options), history, weeklyLoad: weeklyLoads(sessions) };
}
