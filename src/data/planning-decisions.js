const NOW = () => new Date().toISOString();
// Ce qu'une décision « modifier » a le droit de changer.
//
// Les cinq derniers champs décrivent le *contenu* d'une séance, pas ses
// paramètres : ils sont là pour l'adaptation issue du questionnaire quotidien,
// qui ne peut pas se contenter de raccourcir une durée en laissant la liste
// d'exercices annoncer une pliométrie qu'on vient justement de retirer.
const EDITABLE = new Set(['durationSec', 'durationMin', 'preferredTime', 'time', 'type', 'intensity', 'zone', 'distanceM', 'distanceKm', 'distance', 'dplus', 'repetitions', 'blocks', 'ppgContent', 'comment', 'equipment', 'heavyLegs', 'title', 'brief', 'coach', 'steps', 'ppgExercises']);

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function assertEditable(session) {
  if (!session?.id) throw new Error('Séance invalide.');
  if (session.done || session.status === 'RÉALISÉE' || session.activityId) throw new Error('Une séance réalisée ne peut plus être modifiée.');
}

function base(session, action, status, options = {}) {
  assertEditable(session);
  return {
    sessionId: session.id, action, status,
    originalDate: session.date,
    original: structuredClone(session),
    updatedAt: options.now || NOW(),
  };
}

export function validateSession(session, options = {}) {
  return base(session, 'validate', 'VALIDÉE', options);
}

export function rejectSession(session, options = {}) {
  return { ...base(session, 'reject', 'REFUSÉE', options), reason: options.reason || '', replacementStrategy: options.replacementStrategy || 'none' };
}

export function rescheduleSession(session, scheduledDate, options = {}) {
  if (!validDate(scheduledDate)) throw new Error('Nouvelle date invalide.');
  return { ...base(session, 'reschedule', 'DÉPLACÉE', options), scheduledDate, reason: options.reason || '' };
}

export function modifySession(session, changes, options = {}) {
  assertEditable(session);
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Modifications invalides.');
  if (Object.keys(changes).some((key) => !EDITABLE.has(key))) throw new Error('Paramètre de séance non modifiable.');
  if (changes.durationSec != null && (!Number.isFinite(changes.durationSec) || changes.durationSec <= 0)) throw new Error('La durée doit être positive.');
  if (changes.durationMin != null && (!Number.isFinite(changes.durationMin) || changes.durationMin <= 0)) throw new Error('La durée doit être positive.');
  for (const field of ['distanceM', 'distance', 'dplus', 'repetitions', 'blocks']) {
    if (typeof changes[field] === 'number' && changes[field] < 0) throw new Error(`${field} doit être positif.`);
  }
  const normalized = {
    ...changes,
    ...(changes.durationMin != null ? { durationSec: changes.durationMin * 60 } : {}),
    ...(changes.distanceKm != null ? { distanceM: changes.distanceKm * 1000 } : {}),
  };
  return { ...base(session, 'modify', 'MODIFIÉE', options), changes: structuredClone(normalized) };
}

export function cancelSession(session, options = {}) {
  return { ...base(session, 'cancel', 'ANNULÉE', options), reason: options.reason || '' };
}

export const restoreProposal = (decisions, sessionId) => (decisions || []).filter((d) => d.sessionId !== sessionId);
export const undoLastDecision = (decisions) => (decisions || []).slice(0, -1);
