// La persistance du questionnaire quotidien.
//
// Même discipline que le planning : une clé versionnée, une validation à la
// lecture, et rien qui puisse jeter. Les informations de douleur et de
// récupération sont sensibles — elles ne quittent jamais l'appareil, et
// l'historique se supprime depuis les réglages.

import { browserStorage } from './workout-store.js';
import { CHECKIN_VERSION, validateAnswers } from './checkin-model.js';

export const CHECKIN_STORAGE_KEYS = Object.freeze({
  history: 'denivele.checkin.history.v1',
  draft: 'denivele.checkin.draft.v1',
});

/** Quatre mois de questionnaires : assez pour une tendance, pas pour saturer. */
export const HISTORY_MAX_DAYS = 120;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

/**
 * Une entrée relue est-elle exploitable ?
 *
 * On revalide les réponses avec le même validateur que la saisie : une entrée
 * écrite par une version antérieure et devenue incohérente est écartée
 * individuellement, sans emporter le reste de l'historique.
 */
function validEntry(entry, date) {
  return isObject(entry)
    && entry.version === CHECKIN_VERSION
    && entry.date === date
    && isDate(entry.date)
    && typeof entry.updatedAt === 'string' && !Number.isNaN(Date.parse(entry.updatedAt))
    && isObject(entry.answers)
    && validateAnswers(entry.answers).ok
    && (entry.recommendation == null || isObject(entry.recommendation))
    && (entry.context == null || isObject(entry.context))
    && (entry.userDecision == null || isObject(entry.userDecision))
    && (entry.revisions == null || Array.isArray(entry.revisions));
}

function readRaw(storage, key) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    return parsed?.version === CHECKIN_VERSION ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(storage, key, data, subject) {
  if (!storage) return { ok: false, reason: `Stockage indisponible : le ${subject} n’a pas été enregistré.` };
  try {
    storage.setItem(key, JSON.stringify({ version: CHECKIN_VERSION, data }));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `${subject} non enregistré (${error.name || 'erreur de stockage'}).` };
  }
}

/** L'historique complet, indexé par date. Toujours un objet, même cassé. */
export function loadCheckinHistory(storage = browserStorage()) {
  const data = readRaw(storage, CHECKIN_STORAGE_KEYS.history);
  if (!isObject(data)) return {};
  const out = {};
  for (const [date, entry] of Object.entries(data)) {
    if (isDate(date) && validEntry(entry, date)) out[date] = entry;
  }
  return out;
}

/** Le questionnaire d'une date, ou rien. */
export function loadCheckinFor(date, storage = browserStorage()) {
  return loadCheckinHistory(storage)[date] ?? null;
}

/**
 * Enregistre — ou remplace — le questionnaire d'une journée.
 *
 * Le plafond retire les jours les plus anciens, jamais les plus récents : une
 * tendance se lit depuis aujourd'hui.
 */
export function saveCheckinEntry(entry, storage = browserStorage()) {
  if (!entry || !isDate(entry.date)) {
    return { ok: false, reason: 'Questionnaire non enregistré (date invalide).' };
  }
  const history = { ...loadCheckinHistory(storage), [entry.date]: entry };
  const kept = Object.keys(history).sort().slice(-HISTORY_MAX_DAYS);
  const trimmed = Object.fromEntries(kept.map((date) => [date, history[date]]));
  return write(storage, CHECKIN_STORAGE_KEYS.history, trimmed, 'Questionnaire');
}

/** Oublie tout l'historique — action explicite, depuis les réglages. */
export function clearCheckinHistory(storage = browserStorage()) {
  if (!storage) return { ok: false, reason: 'Stockage indisponible.' };
  try {
    storage.removeItem(CHECKIN_STORAGE_KEYS.history);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * Le brouillon : un seul, celui du jour.
 *
 * Un questionnaire abandonné à la troisième question hier n'a aucune raison de
 * revenir aujourd'hui — la date en fait partie, et une date qui ne correspond
 * pas rend le brouillon invisible sans qu'on ait à le nettoyer.
 */
export function saveCheckinDraft(draft, storage = browserStorage()) {
  if (!draft || !isDate(draft.date)) {
    return { ok: false, reason: 'Brouillon non enregistré (date invalide).' };
  }
  return write(storage, CHECKIN_STORAGE_KEYS.draft, {
    date: draft.date,
    step: Number.isInteger(draft.step) ? draft.step : 0,
    answers: draft.answers ?? {},
    updatedAt: draft.updatedAt || new Date().toISOString(),
  }, 'Brouillon');
}

export function loadCheckinDraft(date, storage = browserStorage()) {
  const data = readRaw(storage, CHECKIN_STORAGE_KEYS.draft);
  if (!isObject(data) || data.date !== date) return null;
  if (!Number.isInteger(data.step) || !isObject(data.answers)) return null;
  if (typeof data.updatedAt !== 'string' || Number.isNaN(Date.parse(data.updatedAt))) return null;
  return data;
}

export function clearCheckinDraft(storage = browserStorage()) {
  if (!storage) return { ok: false, reason: 'Stockage indisponible.' };
  try {
    storage.removeItem(CHECKIN_STORAGE_KEYS.draft);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/** Les questionnaires les plus récents d'abord — pour l'historique affiché. */
export function recentCheckins(limit = 14, storage = browserStorage()) {
  const history = loadCheckinHistory(storage);
  return Object.keys(history).sort().reverse().slice(0, limit)
    .map((date) => history[date]);
}
