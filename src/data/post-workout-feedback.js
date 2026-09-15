const COMPLETIONS = new Set(['complete', 'partial', 'skipped']);

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const minutes = (seconds) => Math.round((seconds || 0) / 60);

export function createWorkoutFeedback(input, now = () => new Date().toISOString()) {
  const valid = input && typeof input.activityId === 'string' && input.activityId.trim()
    && validDate(input.date) && Number.isInteger(input.rpe)
    && input.rpe >= 1 && input.rpe <= 10 && COMPLETIONS.has(input.completion)
    && typeof input.pain === 'boolean';
  if (!valid) throw new TypeError('Feedback post-séance invalide.');
  return Object.freeze({
    version: 1,
    activityId: input.activityId.trim(),
    sessionId: typeof input.sessionId === 'string' && input.sessionId.trim() ? input.sessionId.trim() : null,
    date: input.date,
    rpe: input.rpe,
    completion: input.completion,
    pain: input.pain,
    note: String(input.note || '').trim(),
    validatedAt: now(),
  });
}

function adjustmentFor(feedback) {
  if (feedback.pain) return { ratio: 0.7, easy: true, reason: 'douleur signalée' };
  if (feedback.rpe >= 9) return { ratio: 0.8, easy: false, reason: `RPE ${feedback.rpe}` };
  if (feedback.completion !== 'complete') return { ratio: 0.85, easy: false, reason: 'séance réalisée partiellement' };
  return null;
}

function isDemanding(session, afterDate) {
  if (!session?.planned || session.done || session.date <= afterDate || session.type === 'REPOS') return false;
  const zone = String(session.zone || '').toUpperCase();
  return session.type === 'PPG' || (session.load || 0) >= 60 || /Z3|Z4|Z5|SEUIL/.test(zone);
}

export function applyWorkoutFeedback(plan = [], feedbacks = [], completedSessions = []) {
  const latest = [...feedbacks]
    .filter((item) => item?.activityId && validDate(item.date))
    .sort((a, b) => String(b.validatedAt).localeCompare(String(a.validatedAt)))[0];
  const adjustment = latest ? adjustmentFor(latest) : null;
  if (!latest || !adjustment) return { sessions: plan, summary: null };
  const hasCompletedActivity = completedSessions.some((session) => (
    session?.done && session.activityId === latest.activityId
  ));
  if (!hasCompletedActivity) return { sessions: plan, summary: null };

  const targetIndex = plan.findIndex((session) => isDemanding(session, latest.date) && !session.feedbackAdjusted);
  if (targetIndex < 0) return { sessions: plan, summary: null };
  const target = plan[targetIndex];
  const nextDuration = Math.max(15 * 60, Math.round((target.durationSec || 0) * adjustment.ratio / 60) * 60);
  const nextLoad = Math.max(1, Math.round((target.load || 0) * adjustment.ratio));
  const changed = {
    ...target,
    durationSec: nextDuration,
    durationLabel: `${minutes(nextDuration)}′`,
    load: nextLoad,
    zone: adjustment.easy ? 'Z1–Z2' : target.zone,
    feedbackAdjusted: true,
    feedbackSourceActivityId: latest.activityId,
    brief: `${target.brief ? `${target.brief} ` : ''}Adaptée après ${adjustment.reason}.`,
  };
  const sessions = plan.map((session, index) => (index === targetIndex ? changed : session));
  return {
    sessions,
    summary: Object.freeze({
      activityId: latest.activityId,
      sessionId: target.id,
      sessionTitle: target.title,
      sessionDate: target.date,
      message: `${adjustment.reason === `RPE ${latest.rpe}` ? `Ton RPE ${latest.rpe}` : `Ta ${adjustment.reason}`} a adapté ${target.title} : ${minutes(target.durationSec)} → ${minutes(nextDuration)} min${adjustment.easy ? ', en endurance facile' : ''}.`,
    }),
  };
}
