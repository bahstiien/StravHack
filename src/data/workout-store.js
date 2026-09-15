// La persistance de la séance en cours et de l'historique.
//
// Une séance guidée dure quarante minutes sur un téléphone : l'écran se
// verrouille, l'onglet est recyclé, quelqu'un rafraîchit sans faire exprès. Si
// la progression ne vit que dans l'état React, elle est perdue à chaque fois.
// On écrit donc la définition et l'état d'exécution à chaque changement, et on
// propose de reprendre au retour.
//
// Le stockage est injectable pour que ce fichier soit testable sans navigateur,
// et *toutes* les écritures peuvent échouer sans que ce soit une anomalie :
// navigation privée, quota plein, stockage bloqué. Une sauvegarde ratée n'arrête
// pas la séance — elle l'affiche.

import { validateDefinition } from './workout-plan.js';

const RUN_KEY = 'denivele.guided.run.v1';
const HISTORY_KEY = 'denivele.guided.history.v1';

/** Au-delà, une séance « en cours » retrouvée n'en est plus une. */
export const MAX_RUN_AGE_MS = 12 * 3600 * 1000;

/** Les bilans gardés — assez pour relire sa semaine, pas pour remplir le quota. */
const HISTORY_MAX = 50;

/** Le stockage du navigateur, ou rien du tout si on ne peut pas y toucher. */
export function browserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Enregistre la séance en cours.
 *
 * `now` est un paramètre et pas un appel à `Date.now()` caché à l'intérieur :
 * c'est ce qui rend l'expiration vérifiable autrement qu'en attendant douze
 * heures, et c'est la même discipline que dans le moteur.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function saveRun({ definition, state, now = Date.now() }, storage = browserStorage()) {
  if (!storage) return { ok: false, reason: 'Stockage indisponible sur cet appareil.' };
  try {
    storage.setItem(RUN_KEY, JSON.stringify({ savedAt: now, definition, state }));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Progression non sauvegardée (${err.name || 'erreur de stockage'}).` };
  }
}

/**
 * Relit la séance en cours.
 *
 * Trois choses peuvent avoir mal tourné et sont traitées pareil — on ne propose
 * rien plutôt que de proposer une reprise cassée : le stockage est illisible,
 * la séance est trop vieille, ou la définition ne passe plus la validation
 * (une version antérieure de l'app, un format qui n'existe plus).
 *
 * @returns {{definition: object, state: object, savedAt: number}|null}
 */
export function loadRun(storage = browserStorage(), now = Date.now()) {
  if (!storage) return null;
  try {
    const brut = storage.getItem(RUN_KEY);
    if (!brut) return null;

    const payload = JSON.parse(brut);
    if (!payload?.definition || !payload?.state) return null;
    if (!payload.savedAt || now - payload.savedAt > MAX_RUN_AGE_MS) return null;
    if (payload.state.status === 'finished' || payload.state.status === 'abandoned') return null;
    if (!validateDefinition(payload.definition).ok) return null;

    return payload;
  } catch {
    return null;
  }
}

/** Oublie la séance en cours. */
export function clearRun(storage = browserStorage()) {
  if (!storage) return { ok: false, reason: 'Stockage indisponible.' };
  try {
    storage.removeItem(RUN_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Ajoute un bilan à l'historique, le plus récent d'abord.
 *
 * @returns {{ok: true, count: number} | {ok: false, reason: string}}
 */
export function saveResult(result, storage = browserStorage()) {
  if (!storage) return { ok: false, reason: 'Stockage indisponible : le bilan n’a pas pu être enregistré.' };
  try {
    const history = loadHistory(storage).filter((r) => r.id !== result.id);
    const next = [result, ...history].slice(0, HISTORY_MAX);
    storage.setItem(HISTORY_KEY, JSON.stringify(next));
    return { ok: true, count: next.length };
  } catch (err) {
    return { ok: false, reason: `Bilan non enregistré (${err.name || 'erreur de stockage'}).` };
  }
}

/** L'historique des bilans, le plus récent d'abord. */
export function loadHistory(storage = browserStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Un stockage en mémoire — pour les tests, et pour se passer du navigateur. */
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

/** Un stockage qui refuse d'écrire — pour éprouver le chemin d'erreur. */
export function failingStorage() {
  return {
    getItem: () => null,
    setItem: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; },
    removeItem: () => {},
  };
}
