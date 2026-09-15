// Les tests de la logique de génération.
//
// La logique est dans src/data/wod.js, sans React et sans DOM : elle est donc
// testable telle quelle avec le lanceur de Node, sans rien installer.
//
//   npm test
//
// Ce qui est vérifié ici est ce qui casse une séance sans qu'on le voie :
// une durée qui ne tombe pas juste, un mouvement qui suppose du matériel qu'on
// n'a pas, une contrainte articulaire ignorée. Le reste — le nom de la séance,
// l'ordre des cartes — n'a pas besoin d'un test.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DURATIONS, SESSION_TYPES, LEVELS, GOALS,
  defaultWodParams, validateWodParams, generateWod, validateWodSession,
  doseFor, wodCountFor, parseConstraintZones,
} from '../src/data/wod.js';

import { MOVEMENT_BY_ID, WOD_EQUIPMENT } from '../src/data/wod-movements.js';

const ALL_EQUIPMENT = [
  'poids-du-corps', 'banc-step', 'halteres', 'elastique', 'kettlebell',
  'swiss-ball', 'rouleau', 'gilet-leste', 'barre', 'salle',
  ...WOD_EQUIPMENT.map((e) => e.id),
];

const base = (over = {}) => ({
  durationMin: 40,
  equipment: ALL_EQUIPMENT,
  type: 'mixte',
  level: 'intermediaire',
  goal: 'conditionnement',
  constraints: { pain: '', injuries: '', avoid: '' },
  seed: 1,
  ...over,
});

/** Toutes les combinaisons — 5 × 4 × 3 × 6 = 360 séances. */
function everyCombination(over = {}) {
  const out = [];
  for (const durationMin of DURATIONS) {
    for (const type of SESSION_TYPES.map((t) => t.id)) {
      for (const level of LEVELS.map((l) => l.id)) {
        for (const goal of GOALS.map((g) => g.id)) {
          out.push(base({ durationMin, type, level, goal, ...over }));
        }
      }
    }
  }
  return out;
}

const ok = (params) => {
  const res = generateWod(params);
  assert.equal(res.ok, true, `génération impossible : ${res.error}`);
  return res.session;
};

const movementsOf = (session) => session.blocks.flatMap((b) => b.movements);

// ── Durée ───────────────────────────────────────────────────────────────────

test('les cinq durées possibles sont acceptées et rien d’autre', () => {
  assert.deepEqual(DURATIONS, [20, 30, 40, 50, 60]);
  for (const d of DURATIONS) {
    assert.equal(validateWodParams(base({ durationMin: d })).ok, true);
  }
  for (const bad of [0, 15, 25, 45, 90, null, undefined, '40', NaN]) {
    const res = validateWodParams(base({ durationMin: bad }));
    assert.equal(res.ok, false, `${bad} aurait dû être refusé`);
    assert.ok(res.errors.durationMin, 'l’erreur doit porter sur la durée');
  }
});

test('la somme des blocs vaut exactement la durée demandée, dans tous les cas', () => {
  for (const params of everyCombination()) {
    const s = ok(params);
    const sum = s.blocks.reduce((a, b) => a + b.minutes, 0);
    assert.equal(
      sum, params.durationMin,
      `${params.durationMin} min / ${params.type} / ${params.level} / ${params.goal} → ${sum} min`,
    );
    assert.equal(s.totalMin, params.durationMin);
  }
});

test('la vérification de durée affichée dit la vérité', () => {
  for (const params of everyCombination()) {
    const s = ok(params);
    // « 6 min d'échauffement + 14 min WOD 1 + … = 40 min »
    const [left, right] = s.durationCheck.split('=');
    assert.ok(right, 'la vérification doit contenir un « = »');
    assert.equal(Number(right.replace(/[^\d]/g, '')), params.durationMin);

    const parts = left.split('+').map((p) => Number(p.trim().match(/^\d+/)?.[0]));
    assert.ok(parts.every(Number.isFinite), `parts illisibles : ${left}`);
    assert.equal(parts.reduce((a, b) => a + b, 0), params.durationMin);
    assert.equal(parts.length, s.blocks.length);
  }
});

test('le nombre de WOD suit la durée', () => {
  const attendu = {
    20: [1, 1], 30: [1, 2], 40: [2, 2], 50: [2, 3], 60: [2, 3],
  };
  for (const params of everyCombination()) {
    const n = params.durationMin;
    const s = ok(params);
    const wods = s.blocks.filter((b) => b.kind === 'wod');
    const [min, max] = attendu[n];
    assert.ok(
      wods.length >= min && wods.length <= max,
      `${n} min → ${wods.length} WOD, attendu entre ${min} et ${max}`,
    );
    assert.equal(wods.length, wodCountFor(n, params.level, params.seed));
  }
});

test('toute séance a un échauffement et un retour au calme', () => {
  for (const params of everyCombination()) {
    const s = ok(params);
    assert.equal(s.blocks[0].kind, 'echauffement');
    assert.equal(s.blocks.at(-1).kind, 'retour-au-calme');
    assert.ok(s.blocks[0].minutes >= 4, 'un échauffement de moins de 4 min n’en est pas un');
    assert.ok(s.blocks.at(-1).minutes >= 3);
  }
});

test('deux WOD consécutifs sont séparés par une récupération', () => {
  for (const params of everyCombination()) {
    const s = ok(params);
    const kinds = s.blocks.map((b) => b.kind);
    for (let i = 0; i < kinds.length - 1; i += 1) {
      if (kinds[i] === 'wod' && kinds[i + 1] === 'wod') {
        assert.fail(`deux WOD collés dans ${params.durationMin} min / ${params.level}`);
      }
    }
  }
});

// ── Matériel ────────────────────────────────────────────────────────────────

test('aucun mouvement ne suppose du matériel non coché', () => {
  const jeux = [
    ['poids-du-corps'],
    ['poids-du-corps', 'halteres'],
    ['poids-du-corps', 'kettlebell', 'corde-a-sauter'],
    ['poids-du-corps', 'rameur', 'box', 'wall-ball'],
    ['poids-du-corps', 'espace-course', 'sled', 'sac-de-sable'],
    ALL_EQUIPMENT,
  ];
  for (const equipment of jeux) {
    for (const params of everyCombination({ equipment })) {
      const s = ok(params);
      for (const mv of movementsOf(s)) {
        const src = MOVEMENT_BY_ID.get(mv.id);
        assert.ok(src, `mouvement inconnu : ${mv.id}`);
        for (const need of src.needs) {
          assert.ok(
            equipment.includes(need),
            `${mv.name} demande « ${need} », absent de [${equipment.join(', ')}]`,
          );
        }
      }
      // Le matériel annoncé en tête de séance est celui réellement utilisé.
      const utilise = new Set(movementsOf(s).flatMap((m) => MOVEMENT_BY_ID.get(m.id).needs));
      assert.deepEqual(
        [...s.equipmentIds].sort(),
        [...utilise].sort(),
        'la liste « matériel utilisé » doit correspondre aux mouvements retenus',
      );
    }
  }
});

test('le mode sans matériel ne propose que du poids du corps', () => {
  for (const params of everyCombination({ equipment: ['poids-du-corps'] })) {
    const s = ok(params);
    for (const mv of movementsOf(s)) {
      assert.deepEqual(
        MOVEMENT_BY_ID.get(mv.id).needs, ['poids-du-corps'],
        `${mv.name} n’est pas un mouvement au poids du corps`,
      );
    }
    assert.deepEqual(s.equipmentIds, ['poids-du-corps']);
  }
});

test('le poids du corps est toujours réintégré, même si on l’oublie', () => {
  const res = validateWodParams(base({ equipment: ['halteres'] }));
  assert.equal(res.ok, true);
  assert.ok(res.value.equipment.includes('poids-du-corps'));
});

test('une liste de matériel vide est refusée', () => {
  for (const bad of [[], null, undefined, 'halteres']) {
    const res = validateWodParams(base({ equipment: bad }));
    assert.equal(res.ok, false, `${JSON.stringify(bad)} aurait dû être refusé`);
    assert.ok(res.errors.equipment);
  }
});

// ── Niveau ──────────────────────────────────────────────────────────────────

test('un débutant ne reçoit aucun mouvement technique', () => {
  for (const params of everyCombination({ level: 'debutant' })) {
    const s = ok(params);
    for (const mv of movementsOf(s)) {
      assert.equal(
        MOVEMENT_BY_ID.get(mv.id).skill, 1,
        `${mv.name} (technicité ${MOVEMENT_BY_ID.get(mv.id).skill}) n’a rien à faire chez un débutant`,
      );
    }
  }
});

test('un intermédiaire ne reçoit pas de mouvement de niveau avancé', () => {
  for (const params of everyCombination({ level: 'intermediaire' })) {
    for (const mv of movementsOf(ok(params))) {
      assert.ok(MOVEMENT_BY_ID.get(mv.id).skill <= 2, `${mv.name} est trop technique`);
    }
  }
});

test('le volume croît avec le niveau', () => {
  for (const m of MOVEMENT_BY_ID.values()) {
    const d = doseFor(m, 'debutant');
    const i = doseFor(m, 'intermediaire');
    const a = doseFor(m, 'avance');
    assert.ok(d.value <= i.value && i.value <= a.value, `${m.name} : ${d.value}/${i.value}/${a.value}`);
    for (const dose of [d, i, a]) {
      assert.ok(dose.label.length > 0, `${m.name} : volume vide`);
      assert.ok(dose.value > 0, `${m.name} : volume nul`);
    }
  }
});

test('l’intensité cible est un RPE cohérent et plus basse chez le débutant', () => {
  for (const params of everyCombination()) {
    const s = ok(params);
    assert.ok(s.rpe.min >= 1 && s.rpe.max <= 10 && s.rpe.min <= s.rpe.max, JSON.stringify(s.rpe));
    for (const b of s.blocks) {
      assert.ok(b.rpe.min >= 1 && b.rpe.max <= 10 && b.rpe.min <= b.rpe.max, `${b.title} : ${JSON.stringify(b.rpe)}`);
    }
  }
  const deb = ok(base({ level: 'debutant' }));
  const avc = ok(base({ level: 'avance' }));
  assert.ok(deb.rpe.max < avc.rpe.max, 'un débutant ne vise pas le RPE d’un avancé');
});

// ── Contraintes ─────────────────────────────────────────────────────────────

test('les zones nommées dans les contraintes sont épargnées', () => {
  const cas = [
    { texte: 'douleur au genou droit', zone: 'genou' },
    { texte: 'tendinite de l’épaule', zone: 'epaule' },
    { texte: 'hernie discale, bas du dos fragile', zone: 'lombaires' },
    { texte: 'entorse de cheville il y a trois semaines', zone: 'cheville' },
    { texte: 'canal carpien au poignet', zone: 'poignet' },
  ];
  for (const { texte, zone } of cas) {
    const zones = parseConstraintZones({ pain: texte, injuries: '', avoid: '' });
    assert.ok(zones.includes(zone), `« ${texte} » aurait dû désigner ${zone}`);

    for (const params of everyCombination({ constraints: { pain: texte, injuries: '', avoid: '' } })) {
      const s = ok(params);
      for (const mv of movementsOf(s)) {
        assert.ok(
          !MOVEMENT_BY_ID.get(mv.id).zones.includes(zone),
          `${mv.name} sollicite « ${zone} », exclu par « ${texte} »`,
        );
      }
      assert.ok(s.constraints.zones.includes(zone));
    }
  }
});

test('un genou ou une cheville douloureuse retire aussi les mouvements à impact', () => {
  for (const zone of ['genou', 'cheville']) {
    for (const params of everyCombination({ constraints: { pain: zone, injuries: '', avoid: '' } })) {
      for (const mv of movementsOf(ok(params))) {
        assert.equal(MOVEMENT_BY_ID.get(mv.id).impact, 'faible', `${mv.name} est un mouvement à impact`);
      }
    }
  }
});

test('un mouvement nommé dans « à éviter » n’apparaît jamais', () => {
  for (const nom of ['burpees', 'Box jump', 'gainage', 'squat']) {
    for (const params of everyCombination({ constraints: { pain: '', injuries: '', avoid: nom } })) {
      for (const mv of movementsOf(ok(params))) {
        assert.ok(
          !mv.name.toLowerCase().includes(nom.toLowerCase()),
          `« ${mv.name} » a été retenu alors que « ${nom} » est exclu`,
        );
      }
    }
  }
});

test('le texte des contraintes est conservé dans la séance', () => {
  const s = ok(base({ constraints: { pain: 'genou gauche', injuries: 'entorse 2024', avoid: 'box jump' } }));
  assert.equal(s.constraints.notes.length, 3);
  assert.ok(s.constraints.notes.some((n) => n.includes('genou gauche')));
});

test('des contraintes qui ne laissent rien donnent une erreur lisible, pas un plantage', () => {
  const res = generateWod(base({
    equipment: ['poids-du-corps'],
    constraints: {
      pain: 'genou, cheville, hanche, épaule, poignet, coude, bas du dos, nuque',
      injuries: '', avoid: '',
    },
  }));
  assert.equal(res.ok, false);
  assert.equal(typeof res.error, 'string');
  assert.ok(res.error.length > 10, 'le message doit être une phrase, pas un code');
  assert.ok(res.code);
});

// ── Type et objectif ────────────────────────────────────────────────────────

test('une séance HYROX n’emprunte pas de format purement CrossFit', () => {
  for (const params of everyCombination({ type: 'hyrox' })) {
    const s = ok(params);
    assert.equal(s.typeId, 'hyrox');
    for (const b of s.blocks.filter((x) => x.kind === 'wod')) {
      assert.ok(['hyrox-sim', 'hyrox-compromis', 'for-time', 'intervalles'].includes(b.formatId), b.formatId);
    }
  }
});

test('une séance mixte contient les deux disciplines dès qu’il y a deux WOD', () => {
  for (const durationMin of [40, 50, 60]) {
    const s = ok(base({ durationMin, type: 'mixte', equipment: ALL_EQUIPMENT }));
    const familles = new Set(s.blocks.filter((b) => b.kind === 'wod').map((b) => b.family));
    assert.ok(familles.size >= 2, `mixte en ${durationMin} min → ${[...familles].join(', ')}`);
  }
});

test('l’objectif est repris tel quel et pilote le format', () => {
  for (const g of GOALS) {
    const s = ok(base({ goal: g.id }));
    assert.equal(s.goalId, g.id);
    assert.equal(s.goalLabel, g.label);
  }
  // La mobilité ne se travaille pas à coups de burpees.
  for (const params of everyCombination({ goal: 'mobilite' })) {
    for (const b of ok(params).blocks.filter((x) => x.kind === 'wod')) {
      assert.ok(b.rpe.max <= 7, `objectif mobilité mais RPE ${b.rpe.max}`);
    }
  }
});

// ── Contenu des blocs ───────────────────────────────────────────────────────

test('chaque WOD annonce son format, son score et ses consignes de sécurité', () => {
  for (const params of everyCombination()) {
    for (const b of ok(params).blocks.filter((x) => x.kind === 'wod')) {
      assert.ok(b.formatLabel && b.formatLabel.length > 2, 'format manquant');
      assert.ok(b.prescription && b.prescription.length > 5, 'prescription manquante');
      assert.ok(b.score && b.score.length > 3, `score à noter manquant sur ${b.title}`);
      assert.ok(Array.isArray(b.safety) && b.safety.length > 0, 'consigne de sécurité manquante');
      assert.ok(b.movements.length >= 2, `${b.title} : ${b.movements.length} mouvement(s)`);
    }
  }
});

test('chaque mouvement porte un volume, une variante facile et une variante difficile', () => {
  for (const params of everyCombination()) {
    for (const mv of movementsOf(ok(params))) {
      assert.ok(mv.volume && mv.volume.length > 0, `${mv.name} : volume manquant`);
      assert.ok(mv.easier && mv.easier.length > 3, `${mv.name} : variante facile manquante`);
      assert.ok(mv.harder && mv.harder.length > 3, `${mv.name} : variante difficile manquante`);
      assert.equal(typeof mv.charge, 'string');
    }
  }
});

test('un même mouvement n’est pas répété dans un même bloc', () => {
  for (const params of everyCombination()) {
    for (const b of ok(params).blocks) {
      const ids = b.movements.map((m) => m.id);
      assert.equal(new Set(ids).size, ids.length, `doublon dans ${b.title} : ${ids.join(', ')}`);
    }
  }
});

test('deux WOD consécutifs ne visent pas la même chaîne dominante', () => {
  let compares = 0;
  for (const params of everyCombination({ equipment: ALL_EQUIPMENT })) {
    const wods = ok(params).blocks.filter((b) => b.kind === 'wod');
    for (let i = 1; i < wods.length; i += 1) {
      compares += 1;
      assert.notEqual(
        wods[i].dominantGroup, wods[i - 1].dominantGroup,
        `${params.durationMin} min / ${params.type} : deux blocs « ${wods[i].dominantGroup} » à la suite`,
      );
    }
  }
  assert.ok(compares > 100, 'le test doit avoir réellement comparé des blocs');
});

// ── Déterminisme et régénération ────────────────────────────────────────────

test('à graine égale la séance est identique, à graine différente elle change', () => {
  const a = ok(base({ seed: 7 }));
  const b = ok(base({ seed: 7 }));
  assert.deepEqual(a, b);

  const differentes = [...Array(12).keys()].map((i) => ok(base({ seed: i + 1 })));
  const signatures = new Set(differentes.map((s) => movementsOf(s).map((m) => m.id).join('|')));
  assert.ok(signatures.size >= 6, `régénérer ne renouvelle pas assez : ${signatures.size} séances distinctes sur 12`);
});

test('la séance porte un nom, et deux graines donnent rarement le même', () => {
  const noms = new Set([...Array(12).keys()].map((i) => ok(base({ seed: i + 1 })).name));
  assert.ok(noms.size >= 5, `${noms.size} noms distincts sur 12`);
});

// ── Validation de la sortie ─────────────────────────────────────────────────

test('toute séance produite passe la validation de sortie', () => {
  for (const params of everyCombination()) {
    const s = ok(params);
    const res = validateWodSession(s, params.durationMin);
    assert.equal(res.ok, true, `${params.durationMin}/${params.type}/${params.level} : ${res.errors.join(' · ')}`);
  }
});

test('la validation de sortie refuse une séance falsifiée', () => {
  const s = ok(base());
  const faussee = { ...s, blocks: s.blocks.map((b, i) => (i === 0 ? { ...b, minutes: b.minutes + 5 } : b)) };
  const res = validateWodSession(faussee, 40);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('durée') || e.includes('Durée')));

  assert.equal(validateWodSession(null, 40).ok, false);
  assert.equal(validateWodSession({ blocks: [] }, 40).ok, false);
});

// ── Paramètres ──────────────────────────────────────────────────────────────

test('les valeurs par défaut sont valides et reprennent le matériel de l’app', () => {
  const p = defaultWodParams(['poids-du-corps', 'halteres', 'banc-step']);
  assert.equal(validateWodParams(p).ok, true);
  assert.ok(p.equipment.includes('halteres'));
  assert.equal(validateWodParams(defaultWodParams()).ok, true);
  assert.equal(validateWodParams(defaultWodParams([])).ok, true);
});

test('type, niveau et objectif inconnus sont refusés', () => {
  for (const [champ, valeur] of [['type', 'zumba'], ['level', 'expert'], ['goal', 'bronzage']]) {
    const res = validateWodParams(base({ [champ]: valeur }));
    assert.equal(res.ok, false, `${champ}=${valeur} aurait dû être refusé`);
    assert.ok(res.errors[champ], `l’erreur doit porter sur ${champ}`);
  }
});

test('generateWod refuse des paramètres invalides sans lever d’exception', () => {
  const res = generateWod(base({ durationMin: 37 }));
  assert.equal(res.ok, false);
  assert.ok(res.errors.durationMin);
  assert.equal(generateWod(null).ok, false);
  assert.equal(generateWod('40 minutes').ok, false);
});
