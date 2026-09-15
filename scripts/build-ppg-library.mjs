#!/usr/bin/env node
// .cache/exercises.json  ->  data/ppg-library.json  +  public/ppg-library.json
//
// Source : hasaneyldrm/exercises-dataset (MIT pour les données et la structure).
// Le jeu complet fait 1 324 exercices et 17 Mo ; l'app n'en a pas besoin. On en
// garde une sélection trail — jambes, mollets, chaîne postérieure, tronc — avec
// les consignes françaises du dataset, qui sont complètes et bien écrites.
//
// Ce que ce script ajoute par-dessus le dataset, et qui n'y est pas :
//   - un nom français (les noms du dataset sont anglais) ;
//   - un rôle trail (FORCE / EXCENTRIQUE / GAINAGE / PLIOMÉTRIE / MOBILITÉ) ;
//   - la raison pour laquelle un traileur fait cet exercice ;
//   - une dose et un tempo par défaut.
//
// Les médias (images/GIF) sont © Gym visual, redistribués par le dépôt source
// avec son autorisation. On ne les recopie PAS ici : on pointe les URL du dépôt,
// exactement comme sa propre page de démonstration. Rien n'est redistribué par
// ce projet. Pour un usage public, prendre une licence chez Gym visual.
//
//   npm run build:ppg

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT } from '../server/config.js';

const SRC = resolve(ROOT, '.cache/exercises.json');
const RAW = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';
const OUT = resolve(ROOT, 'data/ppg-library.json');
const PUBLIC = resolve(ROOT, 'public/ppg-library.json');

/** Matériel du dataset -> matériel que l'utilisateur coche dans Réglages. */
const EQUIPMENT = {
  'body weight': 'poids-du-corps',
  dumbbell: 'halteres',
  band: 'elastique',
  'resistance band': 'elastique',
  kettlebell: 'kettlebell',
  'stability ball': 'swiss-ball',
  'bosu ball': 'swiss-ball',
  roller: 'rouleau',
  'wheel roller': 'rouleau',
  weighted: 'gilet-leste',
  barbell: 'barre',
  'ez barbell': 'barre',
  'olympic barbell': 'barre',
};

/**
 * La sélection.
 *
 * `needs` liste le matériel supplémentaire que l'exercice suppose sans que le
 * dataset le déclare — une fente bulgare a besoin d'un banc même si elle est
 * classée « poids de corps ».
 */
const CURATION = [
  // ── FORCE ────────────────────────────────────────────────────────────────
  { src: 'dumbbell single leg split squat', fr: 'Fente bulgare lestée', role: 'FORCE', needs: ['banc-step'],
    dose: '4 × 8 / jambe', tempo: '3–1–1',
    why: 'Le trail se court sur une jambe à la fois. La fente bulgare charge le quadriceps en appui unipodal, exactement ce que la descente réclame après deux heures de course.' },
  { src: 'band single leg split squat', fr: 'Fente bulgare à l’élastique', role: 'FORCE', needs: ['banc-step'],
    dose: '3 × 10 / jambe', tempo: '3–0–1',
    why: 'Même schéma que la version lestée, avec une résistance qui monte en fin d’amplitude — utile quand tu n’as pas de charge sous la main.' },
  { src: 'forward lunge (male)', fr: 'Fente avant', role: 'FORCE',
    dose: '3 × 12 / jambe', tempo: '2–0–1',
    why: 'Le geste de base de l’appui unipodal. À maîtriser à vide avant d’ajouter la moindre charge.' },
  { src: 'walking lunge', fr: 'Fentes marchées', role: 'FORCE',
    dose: '3 × 20 pas', tempo: 'continu',
    why: 'Enchaîner les appuis sans temps mort reproduit la fatigue d’une longue descente mieux qu’une série statique.' },
  { src: 'dumbbell goblet squat', fr: 'Squat gobelet', role: 'FORCE',
    dose: '4 × 10', tempo: '3–0–1',
    why: 'Le squat le plus sûr à charger seul : la charge devant force le buste à rester droit.' },
  { src: 'dumbbell single leg squat', fr: 'Squat unipodal lesté', role: 'FORCE',
    dose: '3 × 6 / jambe', tempo: '3–1–1',
    why: 'Force et équilibre dans le même geste. Si tu vacilles, c’est la stabilité de hanche qui manque — et c’est elle qui lâche en fin de course.' },
  { src: 'dumbbell step-up', fr: 'Montées de marche lestées', role: 'FORCE', needs: ['banc-step'],
    dose: '4 × 10 / jambe', tempo: '2–0–2',
    why: 'La montée sèche, sans élan : c’est le geste de la côte raide, celui où les bâtons ne sauvent rien.' },
  { src: 'band step-up', fr: 'Montées de marche à l’élastique', role: 'FORCE', needs: ['banc-step'],
    dose: '3 × 12 / jambe', tempo: '2–0–2',
    why: 'Version sans charge libre, avec une résistance qui croît au moment où le genou passe devant.' },
  { src: 'dumbbell lunge', fr: 'Fentes lestées', role: 'FORCE',
    dose: '4 × 10 / jambe', tempo: '2–1–1',
    why: 'Charge la fente sans complexifier l’équilibre — la progression logique après les fentes à vide.' },
  { src: 'band squat', fr: 'Squat à l’élastique', role: 'FORCE',
    dose: '3 × 15', tempo: '2–0–1',
    why: 'Résistance maximale en haut du mouvement, là où le fessier travaille : utile pour la relance en sortie de montée.' },
  { src: 'curtsey squat', fr: 'Squat croisé', role: 'FORCE',
    dose: '3 × 12 / jambe', tempo: '2–0–1',
    why: 'Cible le moyen fessier, le muscle qui empêche le bassin de basculer sur terrain dévers.' },

  // ── MOLLETS ──────────────────────────────────────────────────────────────
  { src: 'dumbbell single leg calf raise', fr: 'Extensions mollets unipodales lestées', role: 'FORCE',
    dose: '4 × 12 / jambe', tempo: '2–1–2',
    why: 'Le mollet encaisse chaque foulée seul. En bipodal tu triches toujours avec la jambe forte.' },
  { src: 'dumbbell seated one leg calf raise', fr: 'Mollets assis une jambe', role: 'FORCE',
    dose: '4 × 15 / jambe', tempo: '2–1–2',
    why: 'Genou fléchi, c’est le soléaire qui travaille — le muscle le plus sollicité en montée raide, et le plus souvent blessé chez le traileur.' },
  { src: 'bodyweight standing calf raise', fr: 'Extensions mollets debout', role: 'FORCE',
    dose: '3 × 20', tempo: '2–1–2',
    why: 'Le point de départ, partout, sans matériel. Amplitude complète : talon sous le niveau de la marche.' },
  { src: 'band single leg calf raise', fr: 'Mollets une jambe à l’élastique', role: 'FORCE',
    dose: '3 × 15 / jambe', tempo: '2–1–2',
    why: 'Charge progressive sans haltère, pratique en déplacement.' },
  { src: 'donkey calf raise', fr: 'Mollets buste penché', role: 'FORCE',
    dose: '3 × 15', tempo: '2–1–2',
    why: 'La flexion de hanche étire les gastrocnémiens avant l’effort : amplitude supérieure à la version debout.' },

  // ── EXCENTRIQUE ──────────────────────────────────────────────────────────
  { src: 'dumbbell single leg deadlift', fr: 'Soulevé de terre unipodal', role: 'EXCENTRIQUE',
    dose: '3 × 8 / jambe', tempo: '4–0–1',
    why: 'Ischio-jambiers et équilibre en même temps. La descente lente est tout l’intérêt : c’est elle qui prépare la descente de trail.' },
  { src: 'dumbbell romanian deadlift', fr: 'Soulevé de terre roumain', role: 'EXCENTRIQUE',
    dose: '4 × 8', tempo: '4–0–1',
    why: 'La chaîne postérieure en excentrique pur. Descendre en quatre secondes, montre en main.' },
  { src: 'dumbbell single leg deadlift with stepbox support', fr: 'SDT unipodal avec appui', role: 'EXCENTRIQUE', needs: ['banc-step'],
    dose: '3 × 10 / jambe', tempo: '4–0–1',
    why: 'L’appui arrière enlève le problème d’équilibre et laisse toute l’attention sur la descente.' },
  { src: 'band straight leg deadlift', fr: 'SDT jambes tendues à l’élastique', role: 'EXCENTRIQUE',
    dose: '3 × 12', tempo: '3–0–1',
    why: 'Version sans charge lourde pour les semaines chargées, où l’on veut le geste sans le coût.' },
  { src: 'box jump down with one leg stabilization', fr: 'Réception unipodale depuis une marche', role: 'EXCENTRIQUE', needs: ['banc-step'],
    dose: '4 × 6 / jambe', tempo: 'réception contrôlée',
    why: 'La descente de trail est un enchaînement de réceptions. Ici on les entraîne à froid, une par une, en contrôlant l’amorti.' },

  // ── GAINAGE ──────────────────────────────────────────────────────────────
  { src: 'dead bug', fr: 'Dead bug', role: 'GAINAGE',
    dose: '3 × 10 / côté', tempo: '4 s par répétition',
    why: 'Apprend au tronc à rester fixe pendant que les membres bougent — exactement ce qu’on lui demande en courant.' },
  { src: 'bodyweight incline side plank', fr: 'Gainage latéral incliné', role: 'GAINAGE',
    dose: '3 × 45″ / côté', tempo: 'continu',
    why: 'Un tronc qui lâche, c’est un bassin qui bascule et une foulée qui coûte 4 % de plus. 45 secondes propres valent mieux que deux minutes affaissées.' },
  { src: 'side bridge hip abduction', fr: 'Gainage latéral avec abduction', role: 'GAINAGE',
    dose: '3 × 12 / côté', tempo: '2–1–2',
    why: 'Ajoute le moyen fessier au gainage latéral : le duo exact qui tient le bassin sur sentier dévers.' },
  { src: 'front plank with twist', fr: 'Gainage avec rotation', role: 'GAINAGE',
    dose: '3 × 10 / côté', tempo: 'lent',
    why: 'La rotation contrôlée entraîne les obliques sans casser l’alignement — le gainage statique seul ne suffit pas.' },
  { src: 'glute bridge march', fr: 'Pont fessier alterné', role: 'GAINAGE',
    dose: '3 × 12 / jambe', tempo: '2–1–2',
    why: 'Fessier et stabilité lombaire en appui unipodal, sans charge. À faire avant les séances de côte.' },
  { src: 'low glute bridge on floor', fr: 'Pont fessier au sol', role: 'GAINAGE',
    dose: '3 × 15', tempo: '2–2–2',
    why: 'Réveille le fessier avant la séance. Le plus simple, et celui qu’on saute toujours.' },
  { src: 'russian twist', fr: 'Russian twist', role: 'GAINAGE',
    dose: '3 × 20', tempo: 'continu',
    why: 'Obliques en rotation chargée. À doser : ce n’est pas la priorité d’un traileur, mais ça complète.' },
  { src: 'reverse plank with leg lift', fr: 'Gainage inversé avec levée de jambe', role: 'GAINAGE',
    dose: '3 × 8 / jambe', tempo: '2–1–2',
    why: 'La face postérieure du tronc, celle que le gainage ventral oublie.' },

  // ── PLIOMÉTRIE ───────────────────────────────────────────────────────────
  { src: 'jump squat', fr: 'Squat sauté', role: 'PLIOMÉTRIE',
    dose: '4 × 8', tempo: 'contact court',
    why: 'Le rendement en côte vient de la raideur tendineuse. Contacts brefs, peu de volume, jamais en fin de semaine chargée.' },
  { src: 'lunge with jump', fr: 'Fentes sautées', role: 'PLIOMÉTRIE',
    dose: '4 × 6 / jambe', tempo: 'contact court',
    why: 'Pliométrie en appui unipodal : le plus proche de la foulée de course.' },
  { src: 'bodyweight drop jump squat', fr: 'Drop jump', role: 'PLIOMÉTRIE', needs: ['banc-step'],
    dose: '5 × 5', tempo: 'contact < 200 ms',
    why: 'Le meilleur exercice de raideur tendineuse — et le plus traumatisant. Jamais plus d’une fois par semaine.' },
  { src: 'forward jump', fr: 'Saut horizontal', role: 'PLIOMÉTRIE',
    dose: '4 × 5', tempo: 'explosif',
    why: 'Puissance horizontale, celle qui sert à relancer sur le plat après une montée.' },
  { src: 'dumbbell plyo squat', fr: 'Squat pliométrique lesté', role: 'PLIOMÉTRIE',
    dose: '4 × 6', tempo: 'explosif',
    why: 'Pliométrie chargée, à réserver aux semaines fraîches — le coût articulaire monte vite.' },

  // ── MOBILITÉ ─────────────────────────────────────────────────────────────
  { src: 'calf push stretch with hands against wall', fr: 'Mobilité cheville au mur', role: 'MOBILITÉ',
    dose: '2 × 12 / côté', tempo: 'lent',
    why: 'Sans 35° de dorsiflexion, tu compenses au genou dans les montées techniques. Deux minutes par jour suffisent.' },
  { src: 'calf stretch with hands against wall', fr: 'Étirement mollet au mur', role: 'MOBILITÉ',
    dose: '3 × 30″ / côté', tempo: 'statique',
    why: 'Après une séance de côte ou une longue descente, pas avant.' },
  { src: 'hamstring stretch', fr: 'Étirement ischio-jambiers', role: 'MOBILITÉ',
    dose: '3 × 30″ / côté', tempo: 'statique',
    why: 'Des ischios courts limitent l’amplitude de foulée et tirent sur le bassin.' },
  { src: 'lying (side) quads stretch', fr: 'Étirement quadriceps allongé', role: 'MOBILITÉ',
    dose: '3 × 30″ / côté', tempo: 'statique',
    why: 'Position allongée : pas d’équilibre à gérer, donc un étirement réellement relâché.' },
  { src: 'all fours squad stretch', fr: 'Étirement quadriceps à quatre pattes', role: 'MOBILITÉ',
    dose: '2 × 45″ / côté', tempo: 'statique',
    why: 'Étire aussi le psoas, raccourci par les heures assises autant que par la course.' },
  { src: 'iron cross stretch', fr: 'Étirement fessier croisé', role: 'MOBILITÉ',
    dose: '2 × 45″ / côté', tempo: 'statique',
    why: 'Fessier et bandelette : les deux coupables habituels d’un genou douloureux en descente.' },
  { src: 'rocking frog stretch', fr: 'Étirement grenouille', role: 'MOBILITÉ',
    dose: '2 × 45″', tempo: 'lent',
    why: 'Ouvre les adducteurs, qui verrouillent la hanche sur les pas larges en terrain accidenté.' },
  { src: 'exercise ball hip flexor stretch', fr: 'Étirement psoas sur ballon', role: 'MOBILITÉ',
    dose: '2 × 45″ / côté', tempo: 'statique',
    why: 'Le psoas se raccourcit en montée. Sur ballon, l’étirement est soutenu sans forcer le bas du dos.' },
  { src: 'roller back stretch', fr: 'Rouleau — chaîne dorsale', role: 'MOBILITÉ',
    dose: '2 × 60″', tempo: 'lent',
    why: 'Rend au dos la mobilité que le sac à dos lui prend sur les longues sorties.' },
];

if (!existsSync(SRC)) {
  console.error(`Dataset absent : ${SRC}`);
  console.error('Télécharge-le d’abord :');
  console.error('  curl -sL -o .cache/exercises.json \\');
  console.error('    https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json');
  process.exit(1);
}

const all = JSON.parse(readFileSync(SRC, 'utf8'));
const byName = new Map(all.map((e) => [e.name.toLowerCase(), e]));

const exercises = [];
const missing = [];

for (const c of CURATION) {
  const e = byName.get(c.src.toLowerCase());
  if (!e) { missing.push(c.src); continue; }

  const equipment = EQUIPMENT[e.equipment] || 'salle';
  const steps = e.instruction_steps?.fr?.length ? e.instruction_steps.fr : [];

  exercises.push({
    id: e.id,
    name: c.fr,
    sourceName: e.name,
    cat: c.role,
    zone: [e.muscle_group, ...(e.secondary_muscles || [])]
      .filter((v, i, a) => v && a.indexOf(v) === i).join(' · '),
    target: e.target,
    bodyPart: e.body_part,
    equipment,
    // Matériel implicite que le dataset ne déclare pas (un banc pour une fente
    // bulgare, une marche pour un drop jump).
    needs: [equipment, ...(c.needs || [])].filter((v, i, a) => a.indexOf(v) === i),
    sets: c.dose,
    tempo: c.tempo,
    why: c.why,
    // Les consignes viennent du dataset, en français, telles quelles.
    cues: steps,
    // Chemins relatifs dans le dépôt (« videos/1757-gKozT8X.gif ») -> URL absolues.
    imageUrl: e.image ? `${RAW}/${e.image}` : null,
    gifUrl: e.gif_url ? `${RAW}/${e.gif_url}` : null,
    attribution: e.attribution || null,
  });
}

if (missing.length) {
  console.warn(`⚠ ${missing.length} exercice(s) introuvable(s) dans le dataset :`);
  missing.forEach((m) => console.warn(`   ${m}`));
}

const library = {
  _note: 'Sélection trail extraite de hasaneyldrm/exercises-dataset (MIT). Les consignes '
    + 'françaises viennent du dataset ; le nom français, le rôle, la raison et la dose sont '
    + 'propres à cette app. Les visuels (© Gym visual) sont chargés depuis le dépôt source, '
    + 'pas recopiés ici — pour un usage public, prendre une licence chez Gym visual.',
  mediaAttribution: '© Gym visual — https://gymvisual.com/',
  source: 'https://github.com/hasaneyldrm/exercises-dataset',
  builtAt: new Date().toISOString(),
  equipment: [
    { id: 'poids-du-corps', label: 'Poids du corps', always: true },
    { id: 'banc-step', label: 'Banc ou marche' },
    { id: 'halteres', label: 'Haltères' },
    { id: 'elastique', label: 'Élastique' },
    { id: 'kettlebell', label: 'Kettlebell' },
    { id: 'swiss-ball', label: 'Swiss ball' },
    { id: 'rouleau', label: 'Rouleau de massage' },
    { id: 'gilet-leste', label: 'Gilet lesté' },
    { id: 'barre', label: 'Barre' },
    { id: 'salle', label: 'Machines de salle' },
  ],
  exercises,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(library, null, 2), 'utf8');
mkdirSync(dirname(PUBLIC), { recursive: true });
copyFileSync(OUT, PUBLIC);

const byRole = {};
const byEquip = {};
for (const e of exercises) {
  byRole[e.cat] = (byRole[e.cat] || 0) + 1;
  e.needs.forEach((n) => { byEquip[n] = (byEquip[n] || 0) + 1; });
}
console.log(`${exercises.length} exercices → ${OUT}`);
console.log('  par rôle     :', Object.entries(byRole).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('  par matériel :', Object.entries(byEquip).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
