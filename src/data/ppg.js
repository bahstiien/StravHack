// La séance de PPG, composée à partir de la bibliothèque.
//
// Une séance de renforcement pour un traileur n'est pas une liste d'exercices
// au hasard : c'est un ordre. Mobilité pour ouvrir, force pendant que le
// système nerveux est frais, excentrique tant que le contrôle est bon,
// pliométrie seulement si la semaine le permet, gainage pour finir, mobilité
// pour refermer. C'est cet ordre que compose() respecte.

import { canDo } from './goals.js';

/**
 * Deux profils, parce que deux séances par semaine ne peuvent pas être la même.
 *
 * `entretien` tombe au lendemain du club : le système nerveux est encore chargé,
 * on ne remet pas de la force lourde dessus. Mobilité, gainage, un seul exercice
 * de force — c'est de la récupération active, pas une séance de plus.
 *
 * `developpement` tombe à 48 h de la sortie longue, quand les jambes sont
 * reposées : c'est là que la force, l'excentrique et la pliométrie ont leur
 * place et produisent quelque chose.
 */
const PROFILES = {
  entretien: {
    label: 'Entretien',
    blocks: [
      { role: 'MOBILITÉ', slot: 'ouverture', count: 2 },
      { role: 'GAINAGE', slot: 'corps', count: 2 },
      { role: 'FORCE', slot: 'corps', count: 1 },
      { role: 'MOBILITÉ', slot: 'fermeture', count: 1 },
    ],
    allowPlyo: false,
  },
  developpement: {
    label: 'Développement',
    blocks: [
      { role: 'MOBILITÉ', slot: 'ouverture', count: 1 },
      { role: 'FORCE', slot: 'corps', count: 2 },
      { role: 'EXCENTRIQUE', slot: 'corps', count: 1 },
      { role: 'PLIOMÉTRIE', slot: 'corps', count: 1 },
      { role: 'GAINAGE', slot: 'fin', count: 2 },
      { role: 'MOBILITÉ', slot: 'fermeture', count: 1 },
    ],
    allowPlyo: true,
  },
};

/** Minutes approximatives par exercice, série et repos compris. */
const MINUTES = { FORCE: 6, EXCENTRIQUE: 6, PLIOMÉTRIE: 5, GAINAGE: 4, MOBILITÉ: 3 };

/**
 * Rotation déterministe.
 *
 * Deux séances de suite ne doivent pas proposer les mêmes exercices, mais le
 * plan est recalculé à chaque ouverture : un tirage aléatoire changerait la
 * séance à chaque rafraîchissement. On décale donc la sélection avec la date,
 * ce qui varie d'une semaine à l'autre et reste stable dans la journée.
 */
function rotate(list, seed) {
  if (!list.length) return list;
  const offset = seed % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function seedFrom(dateIso) {
  return [...String(dateIso)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
}

/**
 * @param {object} o
 * @param {Array}  o.library    exercices disponibles (déjà chargés)
 * @param {string[]} o.equipment matériel coché dans Réglages
 * @param {string} o.date       date de la séance — sert de graine de rotation
 * @param {boolean} [o.allowPlyo] false en semaine chargée ou en affûtage
 * @param {number} [o.targetMin] durée visée
 */
export function composePpg({
  library, equipment, date, allowPlyo = true, targetMin = 30, profile = 'developpement',
  exclude = [],
}) {
  // `exclude` porte les exercices déjà retenus pour l'autre séance de la même
  // semaine : deux séances à 48 h d'écart qui proposent le même gainage, c'est
  // une séance et demie, pas deux.
  const skip = new Set(exclude);
  const usable = (library || []).filter((e) => canDo(e, equipment) && !skip.has(e.id));
  if (!usable.length) return null;

  const spec = PROFILES[profile] || PROFILES.developpement;
  // Les deux verrous se cumulent : le profil peut refuser la pliométrie, et la
  // semaine aussi.
  const plyoOk = allowPlyo && spec.allowPlyo;

  const seed = seedFrom(date);
  const picked = [];
  const used = new Set();

  for (const block of spec.blocks) {
    if (block.role === 'PLIOMÉTRIE' && !plyoOk) continue;

    const pool = rotate(usable.filter((e) => e.cat === block.role && !used.has(e.id)), seed);

    // Deux exercices du même bloc ne doivent pas viser le même muscle : deux
    // squats à la suite laissent les mollets et la chaîne latérale de côté,
    // alors que ce sont eux qui lâchent en fin de course.
    const targets = new Set();
    for (const e of pool) {
      if (picked.filter((x) => x.cat === block.role && x.slot === block.slot).length >= block.count) break;
      if (targets.has(e.target)) continue;
      targets.add(e.target);
      used.add(e.id);
      picked.push({ ...e, slot: block.slot });
    }
    // Pas assez de cibles distinctes : on complète sans la contrainte.
    for (const e of pool) {
      if (picked.filter((x) => x.cat === block.role && x.slot === block.slot).length >= block.count) break;
      if (used.has(e.id)) continue;
      used.add(e.id);
      picked.push({ ...e, slot: block.slot });
    }
  }

  // On rogne par la fin — la mobilité de fermeture, puis le gainage — plutôt
  // que de raboter partout : une séance courte doit garder son corps.
  let total = picked.reduce((a, e) => a + MINUTES[e.cat], 0);
  while (total > targetMin && picked.length > 3) {
    // findIndex renvoie -1 quand il ne trouve rien, et -1 est *vrai* : un `||`
    // ici aurait gardé l'index -1 au lieu de basculer sur le dernier élément.
    const found = picked.findIndex((e) => e.slot === 'fermeture');
    const idx = found >= 0 ? found : picked.length - 1;
    const removed = picked.splice(idx, 1)[0];
    total -= MINUTES[removed.cat];
  }

  return {
    exercises: picked,
    minutes: total,
    profile,
    profileLabel: spec.label,
    steps: picked.map((e, i) => ({
      i: String(i + 1).padStart(2, '0'),
      label: e.name,
      detail: `${e.sets} · tempo ${e.tempo}`,
      exerciseId: e.id,
    })),
  };
}

/** Les rôles réellement couverts — sert à écrire le titre de la séance. */
export function describePpg(session) {
  if (!session?.exercises?.length) return 'Renforcement';
  const roles = [...new Set(session.exercises.map((e) => e.cat))];
  if (session.profile === 'entretien') return 'PPG entretien';
  if (roles.includes('PLIOMÉTRIE')) return 'PPG force + pliométrie';
  if (roles.includes('EXCENTRIQUE')) return 'PPG force + excentrique';
  return 'PPG force + gainage';
}
