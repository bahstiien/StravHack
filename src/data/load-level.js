export const LOAD_LEVELS = Object.freeze([
  { level: 1, label: 'Récupération', description: 'Uniquement des footings faciles, sans intensité ni renforcement.', factor: 0.55 },
  { level: 2, label: 'Facile', description: 'Footings faciles et PPG d’entretien.', factor: 0.7 },
  { level: 3, label: 'Modéré', description: 'Une séance de qualité et une sortie longue maîtrisée.', factor: 0.85 },
  { level: 4, label: 'Équilibré', description: 'La charge recommandée à partir de ton historique.', factor: 1 },
  { level: 5, label: 'Soutenu', description: 'Plus de volume et une deuxième qualité si la récupération le permet.', factor: 1.12 },
  { level: 6, label: 'Élevé', description: 'Volume, qualité et dénivelé renforcés.', factor: 1.25 },
  { level: 7, label: 'Bloc montagne', description: 'Un week-end montagne samedi–dimanche, avec fatigue cumulée.', factor: 1.4 },
  { level: 8, label: 'Très intense', description: 'Bloc montagne maximal et forte charge, réservé aux semaines solides.', factor: 1.6 },
]);

export function normalizeLoadLevel(value) {
  if (value == null || value === '') return 4;
  const number = Number(value);
  if (!Number.isFinite(number)) return 4;
  return Math.min(8, Math.max(1, Math.round(number)));
}

export function loadLevelProfile(value) {
  return LOAD_LEVELS[normalizeLoadLevel(value) - 1];
}
