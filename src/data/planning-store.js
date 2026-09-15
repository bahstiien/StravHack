import { browserStorage } from './workout-store.js';

export const PLANNING_STORAGE_KEYS = Object.freeze({
  decisions: 'denivele.planning.decisions.v1',
  availability: 'denivele.planning.availability.v1',
  exceptions: 'denivele.planning.exceptions.v1',
  drafts: 'denivele.planning.drafts.v1',
});

const VERSION = 1;
const STATUSES = new Set(['VALIDÉE', 'REFUSÉE', 'DÉPLACÉE', 'MODIFIÉE', 'ANNULÉE']);
const ACTIONS = new Set(['validate', 'reject', 'reschedule', 'modify', 'cancel']);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
  const [year, month, day] = v.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

function validDecision(d) {
  const common = isObject(d) && typeof d.sessionId === 'string' && d.sessionId.length > 0
    && ACTIONS.has(d.action) && STATUSES.has(d.status)
    && typeof d.updatedAt === 'string' && !Number.isNaN(Date.parse(d.updatedAt));
  if (!common) return false;
  if (d.action === 'reschedule') return isDate(d.originalDate) && isDate(d.scheduledDate);
  if (d.action === 'modify') return isObject(d.changes);
  return true;
}

function validAvailability(data) {
  return isObject(data) && Object.entries(data).every(([day, value]) =>
    /^[0-6]$/.test(day) && isObject(value) && typeof value.available === 'boolean'
    && (value.maxDurationMin == null || (Number.isFinite(value.maxDurationMin) && value.maxDurationMin >= 0))
    && (value.durationMin == null || (Number.isFinite(value.durationMin) && value.durationMin >= 0))
    && (value.equipment == null || Array.isArray(value.equipment)));
}

function validExceptions(data) {
  return Array.isArray(data) && data.every((value) => isObject(value) && isDate(value.date));
}

function read(storage, key, validate, fallback) {
  if (!storage) return fallback;
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    return parsed?.version === VERSION && validate(parsed.data) ? parsed.data : fallback;
  } catch { return fallback; }
}

function write(storage, key, data, validate) {
  if (!storage) return { ok: false, reason: 'Stockage indisponible.' };
  if (!validate(data)) return { ok: false, reason: 'Données de planning invalides.' };
  try {
    storage.setItem(key, JSON.stringify({ version: VERSION, data }));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `Planning non sauvegardé (${error.name || 'erreur de stockage'}).` };
  }
}

export const loadDecisions = (storage = browserStorage()) => read(storage, PLANNING_STORAGE_KEYS.decisions, (v) => Array.isArray(v) && v.every(validDecision), []);
export const saveDecisions = (data, storage = browserStorage()) => write(storage, PLANNING_STORAGE_KEYS.decisions, data, (v) => Array.isArray(v) && v.every(validDecision));
export const loadAvailability = (storage = browserStorage()) => read(storage, PLANNING_STORAGE_KEYS.availability, validAvailability, {});
export const saveAvailability = (data, storage = browserStorage()) => write(storage, PLANNING_STORAGE_KEYS.availability, data, validAvailability);
export const loadExceptions = (storage = browserStorage()) => read(storage, PLANNING_STORAGE_KEYS.exceptions, validExceptions, []);
export const saveExceptions = (data, storage = browserStorage()) => write(storage, PLANNING_STORAGE_KEYS.exceptions, data, validExceptions);
export const loadDrafts = (storage = browserStorage()) => read(storage, PLANNING_STORAGE_KEYS.drafts, isObject, {});
export const saveDrafts = (data, storage = browserStorage()) => write(storage, PLANNING_STORAGE_KEYS.drafts, data, isObject);

export function loadPlanningState(storage = browserStorage()) {
  return {
    decisions: loadDecisions(storage), availability: loadAvailability(storage),
    exceptions: loadExceptions(storage), drafts: loadDrafts(storage),
  };
}
