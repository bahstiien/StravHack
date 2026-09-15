// Demo data — the content authored in the design canvas, lifted into the
// domain model. This is what the app shows when no Coros data is available,
// so the UI is never empty and every screen stays reviewable offline.

export const ATHLETE = {
  name: 'Bastien',
  device: 'COROS APEX 2 PRO',
  hrRest: 48,
  hrMax: 188,
  zones: [128, 145, 160, 172, 188], // upper bound of Z1..Z5
  goal: { name: 'CCC', date: '2026-08-28' },
};

/** Synthetic 0..1 series standing in for a real Coros stream. */
function series(kind) {
  const out = [];
  for (let i = 0; i < 72; i++) {
    const p = i / 71;
    let v;
    if (kind === 'vma') {
      if (p < 0.2) v = 0.30 + p * 1.2;
      else if (p > 0.86) v = 0.42 - (p - 0.86) * 0.5;
      else { const ph = ((i - 14) % 6) / 6; v = (ph < 0.45 ? 0.86 : 0.58) + (p - 0.2) * 0.14; }
    } else if (kind === 'seuil') {
      const blocks = [[0.22, 0.40], [0.42, 0.58], [0.62, 0.80]];
      v = 0.34 + p * 0.08;
      blocks.forEach((r, k) => { if (p >= r[0] && p <= r[1]) v = 0.74 + k * 0.05; });
      if (p > 0.86) v = 0.36;
    } else {
      v = 0.42 + 0.16 * Math.sin(p * 7.5) + p * 0.12;
    }
    out.push(Math.max(0.06, Math.min(1, v)));
  }
  return out;
}

function alt(kind) {
  const out = [];
  for (let i = 0; i < 72; i++) {
    const p = i / 71;
    const v = kind === 'long'
      ? 0.15 + 0.6 * Math.sin(p * Math.PI * 0.92)
      : kind === 'vma'
        ? 0.12 + 0.42 * (0.5 + 0.5 * Math.sin(p * Math.PI * 9.5))
        : 0.12 + 0.22 * Math.sin(p * Math.PI * 3.2);
    out.push(Math.max(0.04, v));
  }
  return out;
}

export const SESSIONS = [
  {
    id: 's-0907', date: '2026-09-07', type: 'PPG', title: 'Renfo unipodal lesté',
    meta: '45′ · 6 exercices · gilet 6 kg', done: true, load: 38, zone: 'FORCE',
    durationLabel: '45′',
    brief: 'Séance courte, gilet 6 kg. Objectif force, pas cardio : si tu es essoufflé, tu vas trop vite.',
    coach: 'Faite. 6 exercices sur 6.',
    steps: [
      { i: '01', label: 'Échauffement mobilité', detail: '8′ · hanches, chevilles, chaîne postérieure' },
      { i: '02', label: 'Fentes bulgares lestées', detail: '4 × 8 / jambe · gilet 6 kg · r=90″' },
      { i: '03', label: 'Montées de box excentriques', detail: '3 × 10 / jambe · descente 4 s' },
      { i: '04', label: 'Extensions mollets genou fléchi', detail: '4 × 15 · charge 12 kg' },
      { i: '05', label: 'Gainage latéral dynamique', detail: '3 × 45″ / côté' },
    ],
  },
  {
    id: 's-0908', date: '2026-09-08', type: 'TRAIL', title: 'Seuil 3 × 12′',
    meta: '1h18 · 420 D+ · 4:38/km moy.', done: true, load: 96, dplus: 420, zone: 'Z4',
    activityId: 'a-0908', durationLabel: '1h18',
    brief: 'Allure semi-marathon, pas plus. Le seuil se court par le bas : si le bloc 1 est trop rapide, la séance est ratée.',
    coach: 'Faite. Bloc 3 à +11 s/km — voir l’analyse.',
    steps: [
      { i: '01', label: 'Échauffement progressif', detail: '20′ Z1–Z2 + 3 lignes droites' },
      { i: '02', label: 'Bloc 1', detail: '12′ @ 4:15/km · FC cible 162–168' },
      { i: '03', label: 'Récupération', detail: '3′ trot souple' },
      { i: '04', label: 'Bloc 2', detail: '12′ @ 4:15/km' },
      { i: '05', label: 'Récupération', detail: '3′ trot souple' },
      { i: '06', label: 'Bloc 3', detail: '12′ @ 4:15/km · ne pas accélérer' },
      { i: '07', label: 'Retour au calme', detail: '12′ Z1' },
    ],
  },
  {
    id: 's-0909', date: '2026-09-09', type: 'REPOS', title: 'Repos complet',
    meta: 'Marche 30′ maximum. Rien d’autre.', done: true, load: 0, zone: '—',
    durationLabel: '—',
    brief: 'Rien. Pas de vélo « tranquille », pas de PPG « légère ». La progression se fait ici.',
    coach: 'Marche 30′ maximum si tu tiens pas en place.',
    steps: [
      { i: '01', label: 'Sommeil', detail: 'Cible 8 h. C’est la séance du jour.' },
      { i: '02', label: 'Alimentation', detail: 'Glucides à hauteur de la semaine à venir' },
    ],
  },
  {
    id: 's-0910', date: '2026-09-10', type: 'TRAIL', title: 'VMA côte 10 × 45″',
    meta: '1h12 · 680 D+ · pente 12 %', done: true, load: 82, dplus: 680, zone: 'Z5',
    activityId: 'a-0910', durationLabel: '1h12',
    brief: 'Pente 10–12 %. Effort maximal contrôlé, retour en marchant. Le but est la puissance, pas la souffrance.',
    coach: 'Faite. Les 3 dernières reps ont lâché de 6 %.',
    steps: [
      { i: '01', label: 'Échauffement', detail: '25′ Z1 jusqu’au pied de la côte' },
      { i: '02', label: '10 × 45″ en côte', detail: 'Effort 9/10 · retour marche 1′45' },
      { i: '03', label: 'Retour au calme', detail: '15′ Z1 en descente souple' },
    ],
  },
  {
    id: 's-0911', date: '2026-09-11', type: 'PPG', title: 'Gainage + proprioception',
    meta: '30′ · 5 exercices · à jeun', done: false, load: 24, zone: 'TRONC',
    durationLabel: '30′',
    brief: 'À jeun, 30 minutes. C’est la séance que tout le monde saute. Pas toi.',
    coach: 'Aujourd’hui. Tu as 30 minutes, pas 30 excuses.',
    steps: [
      { i: '01', label: 'Gainage latéral dynamique', detail: '3 × 45″ / côté' },
      { i: '02', label: 'Équilibre unipodal yeux fermés', detail: '3 × 40″ / jambe' },
      { i: '03', label: 'Dead bug lent', detail: '3 × 10 / côté · 4 s par répétition' },
      { i: '04', label: 'Mobilité chevilles au mur', detail: '2 × 12 / côté' },
      { i: '05', label: 'Respiration diaphragmatique', detail: '3′ allongé' },
    ],
  },
  {
    id: 's-0912', date: '2026-09-12', type: 'TRAIL', title: 'Sortie longue 2h30',
    meta: '2h30 · 1 400 D+ · Z2 stricte', done: false, load: 140, dplus: 1400, zone: 'Z2',
    durationLabel: '2h30',
    brief: 'Z2 stricte, bâtons, sac de course avec 1,5 L. On teste le ravitaillement de la CCC : 60 g de glucides par heure.',
    coach: 'La séance la plus importante de la semaine. Ne la transforme pas en course.',
    steps: [
      { i: '01', label: 'Montée en Z2', detail: '70′ · marche dès que la FC dépasse 145' },
      { i: '02', label: 'Crête', detail: '35′ · alternance course / marche' },
      { i: '03', label: 'Descente technique', detail: '45′ · travail de pose de pied' },
      { i: '04', label: 'Nutrition', detail: '60 g glucides / h · 500 ml / h' },
    ],
  },
  {
    id: 's-0913', date: '2026-09-13', type: 'TRAIL', title: 'Footing de récupération',
    meta: '50′ · plat · Z1', done: false, load: 30, dplus: 80, zone: 'Z1',
    durationLabel: '50′',
    brief: '50 minutes, plat, Z1. Si tu regardes ta montre plus de deux fois, c’est que tu cours trop vite.',
    coach: 'Récupération active. Aucun intérêt à aller plus vite.',
    steps: [
      { i: '01', label: 'Footing plat', detail: '50′ · FC sous 135' },
      { i: '02', label: 'Étirements longs', detail: '8′ · mollets, ischios, psoas' },
    ],
  },

  // Semaine 38 — assimilation
  {
    id: 's-0914', date: '2026-09-14', type: 'REPOS', title: 'Repos complet',
    meta: 'Tu viens d’encaisser 410 de charge.', done: false, load: 0, zone: '—',
    durationLabel: '—', brief: 'Semaine d’assimilation. Le repos est la séance.',
    coach: 'Rien aujourd’hui.', steps: [],
  },
  {
    id: 's-0915', date: '2026-09-15', type: 'PPG', title: 'Mobilité + excentrique léger',
    meta: '35′ · 5 exercices · sans charge', done: false, load: 20, zone: 'MOBILITÉ',
    durationLabel: '35′', brief: 'Sans charge. On entretient, on ne construit pas.',
    coach: 'Léger, vraiment léger.', steps: [],
  },
  {
    id: 's-0916', date: '2026-09-16', type: 'TRAIL', title: 'Footing sensations 1h',
    meta: '1h · 250 D+ · Z1–Z2', done: false, load: 44, dplus: 250, zone: 'Z2',
    durationLabel: '1h', brief: 'Au ressenti. Pas de plan d’allure.',
    coach: 'Si les jambes sont lourdes, tu rentres.', steps: [],
  },
  {
    id: 's-0917', date: '2026-09-17', type: 'TRAIL', title: '6 × 2′ allure course',
    meta: '1h05 · 380 D+ · r=2′', done: false, load: 70, dplus: 380, zone: 'Z4',
    durationLabel: '1h05', brief: 'Allure objectif CCC sur terrain roulant.',
    coach: 'La seule intensité de la semaine.', steps: [],
  },
  {
    id: 's-0918', date: '2026-09-18', type: 'REPOS', title: 'Repos ou marche',
    meta: 'Au ressenti. Pas de montre.', done: false, load: 0, zone: '—',
    durationLabel: '—', brief: 'Pas de montre. C’est l’exercice.',
    coach: 'Au ressenti.', steps: [],
  },
  {
    id: 's-0919', date: '2026-09-19', type: 'TRAIL', title: 'Sortie moyenne 1h45',
    meta: '1h45 · 900 D+ · Z2', done: false, load: 92, dplus: 900, zone: 'Z2',
    durationLabel: '1h45', brief: 'Z2 stricte, bâtons. Moitié du volume de samedi dernier.',
    coach: 'Volume réduit, qualité d’allure identique.', steps: [],
  },
  {
    id: 's-0920', date: '2026-09-20', type: 'PPG', title: 'Renfo pieds + chevilles',
    meta: '25′ · 4 exercices', done: false, load: 18, zone: 'FORCE',
    durationLabel: '25′', brief: 'Le pied est le seul contact avec le terrain.',
    coach: '25 minutes, pas une de plus.', steps: [],
  },
];

export const ACTIVITIES = [
  {
    id: 'a-0910', date: '2026-09-10T06:42:00', title: 'VMA côte 10 × 45″',
    location: 'Col de Porte', device: ATHLETE.device, kind: 'vma',
    durationSec: 4324, distanceM: 13200, elevationGainM: 680,
    hrAvg: 148, hrMax: 182, paceSecPerKm: null, driftPct: 2.1,
    verdict: 'Reps 8 à 10 : −6 % de vitesse. Tu as tenu, mais la fin manque de jus. On garde 10 reps la semaine prochaine.',
    metrics: [
      { k: 'DURÉE', v: '1h12' }, { k: 'DISTANCE', v: '13,2 km' }, { k: 'D+', v: '680 m' },
      { k: 'FC MOY', v: '148' }, { k: 'FC MAX', v: '182' }, { k: 'DÉRIVE', v: '+2,1 %' },
    ],
    intervals: [
      { name: 'R1–R3', dur: '45″', pace: '6:02/km', hr: '171', delta: '—' },
      { name: 'R4–R6', dur: '45″', pace: '6:05/km', hr: '176', delta: '+3″' },
      { name: 'R7–R8', dur: '45″', pace: '6:14/km', hr: '179', delta: '+12″' },
      { name: 'R9–R10', dur: '45″', pace: '6:26/km', hr: '182', delta: '+24″' },
    ],
    zones: [
      { z: 'Z1', pct: 18, time: '13′00' }, { z: 'Z2', pct: 34, time: '24′30' },
      { z: 'Z3', pct: 14, time: '10′05' }, { z: 'Z4', pct: 22, time: '15′50' },
      { z: 'Z5', pct: 12, time: '8′39' },
    ],
    streams: { hr: series('vma'), altitude: alt('vma') },
  },
  {
    id: 'a-0908', date: '2026-09-08T18:10:00', title: 'Seuil 3 × 12′',
    location: 'Boucle du lac', device: ATHLETE.device, kind: 'seuil',
    durationSec: 4702, distanceM: 16400, elevationGainM: 420,
    hrAvg: 156, hrMax: 176, paceSecPerKm: 278, driftPct: 4.2,
    verdict: 'Bloc 3 payé cash : +11 s/km. Parti trop vite, comme la semaine dernière. Le seuil se court par le bas.',
    metrics: [
      { k: 'DURÉE', v: '1h18' }, { k: 'DISTANCE', v: '16,4 km' }, { k: 'D+', v: '420 m' },
      { k: 'ALLURE', v: '4:38/km' }, { k: 'FC MOY', v: '156' }, { k: 'DÉRIVE', v: '+4,2 %' },
    ],
    intervals: [
      { name: 'Bloc 1', dur: '12:00', pace: '4:12/km', hr: '164', delta: '—' },
      { name: 'Bloc 2', dur: '12:00', pace: '4:17/km', hr: '169', delta: '+5″' },
      { name: 'Bloc 3', dur: '12:00', pace: '4:23/km', hr: '174', delta: '+11″' },
    ],
    zones: [
      { z: 'Z1', pct: 12, time: '9′24' }, { z: 'Z2', pct: 26, time: '20′22' },
      { z: 'Z3', pct: 16, time: '12′32' }, { z: 'Z4', pct: 42, time: '32′54' },
      { z: 'Z5', pct: 4, time: '3′10' },
    ],
    streams: { hr: series('seuil'), altitude: alt('seuil') },
  },
  {
    id: 'a-0906', date: '2026-09-06T07:55:00', title: 'Sortie longue 2h40',
    location: 'Crête du Charmant Som', device: ATHLETE.device, kind: 'long',
    durationSec: 9670, distanceM: 24800, elevationGainM: 1320,
    hrAvg: 132, hrMax: 152, paceSecPerKm: 390, driftPct: 1.4,
    verdict: 'Propre. 84 % du temps sous le seuil aérobie et une dérive à +1,4 % : c’est exactement la commande.',
    metrics: [
      { k: 'DURÉE', v: '2h41' }, { k: 'DISTANCE', v: '24,8 km' }, { k: 'D+', v: '1 320 m' },
      { k: 'ALLURE', v: '6:30/km' }, { k: 'FC MOY', v: '132' }, { k: 'DÉRIVE', v: '+1,4 %' },
    ],
    intervals: [
      { name: '0–500 D+', dur: '38:20', pace: '6:02/km', hr: '128', delta: '—' },
      { name: '500–900', dur: '45:10', pace: '6:35/km', hr: '131', delta: '+33″' },
      { name: '900–1320', dur: '49:40', pace: '6:48/km', hr: '134', delta: '+46″' },
      { name: 'Descente', dur: '28:00', pace: '5:12/km', hr: '136', delta: '−50″' },
    ],
    zones: [
      { z: 'Z1', pct: 32, time: '51′30' }, { z: 'Z2', pct: 52, time: '1h23' },
      { z: 'Z3', pct: 12, time: '19′20' }, { z: 'Z4', pct: 4, time: '6′20' },
      { z: 'Z5', pct: 0, time: '0′' },
    ],
    streams: { hr: series('long'), altitude: alt('long') },
  },
];

export const EXERCISES = [
  {
    id: 'e1', cat: 'FORCE', name: 'Fentes bulgares lestées',
    zone: 'Quadriceps · unipodal · stabilité de hanche', sets: '4 × 8 / jambe', tempo: '3–1–1',
    why: 'Le trail se court sur une jambe à la fois. La fente bulgare charge le quadriceps en appui unipodal, exactement ce que la descente réclame après 2 h de course.',
    cues: [
      'Genou avant qui reste derrière la pointe de pied.',
      'Buste vertical : si tu penches, tu charges les lombaires.',
      'Descente en 3 secondes, remontée explosive.',
    ],
  },
  {
    id: 'e2', cat: 'EXCENTRIQUE', name: 'Montées de box excentriques',
    zone: 'Chaîne postérieure · ischio-jambiers', sets: '3 × 10 / jambe', tempo: '1–0–4',
    why: 'La descente de trail est un travail excentrique pur. On l’entraîne à froid, en salle, pour que tes quadriceps ne cèdent pas au 30e kilomètre.',
    cues: [
      'La descente dure 4 secondes, montre en main.',
      'Pas de rebond en bas.',
      'Arrête la série dès que le contrôle part.',
    ],
  },
  {
    id: 'e3', cat: 'GAINAGE', name: 'Gainage latéral dynamique',
    zone: 'Tronc · obliques · transverse', sets: '3 × 45″ / côté', tempo: 'continu',
    why: 'Un tronc qui lâche, c’est un bassin qui bascule et une foulée qui coûte 4 % de plus. 45 secondes propres valent mieux que 2 minutes affaissées.',
    cues: [
      'Bassin haut, jamais de creux lombaire.',
      'Épaule empilée au-dessus du coude.',
      'Respire : pas d’apnée.',
    ],
  },
  {
    id: 'e4', cat: 'PLIOMÉTRIE', name: 'Sauts de haies pieds joints',
    zone: 'Mollets · raideur du tendon d’Achille', sets: '5 × 8', tempo: 'contact court',
    why: 'Le rendement en côte vient de la raideur tendineuse. Contacts brefs, peu de volume, jamais en fin de semaine chargée.',
    cues: [
      'Temps de contact sous 200 ms.',
      'Avant-pied uniquement.',
      'Stop dès que le bruit du contact s’alourdit.',
    ],
  },
  {
    id: 'e5', cat: 'FORCE', name: 'Extensions mollets genou fléchi',
    zone: 'Soléaire · stabilisation de cheville', sets: '4 × 15', tempo: '2–1–2',
    why: 'Le soléaire encaisse la majorité de la charge en montée raide. C’est le muscle le plus négligé et le plus souvent blessé chez le traileur.',
    cues: [
      'Genou fléchi à 30° pour cibler le soléaire.',
      'Amplitude complète, talon sous le niveau de la marche.',
      'Charge progressive : +2 kg par semaine max.',
    ],
  },
  {
    id: 'e6', cat: 'MOBILITÉ', name: 'Mobilité chevilles au mur',
    zone: 'Cheville · dorsiflexion', sets: '2 × 12 / côté', tempo: 'lent',
    why: 'Sans 35° de dorsiflexion, tu compenses au genou dans les montées techniques. Deux minutes par jour suffisent.',
    cues: [
      'Talon collé au sol.',
      'Genou qui part vers le petit doigt de pied.',
      'Sans douleur à l’avant de la cheville.',
    ],
  },
];

export const RPE_NOTES = {
  low: 'Trop facile pour une séance de qualité. Si c’était censé être dur, tu n’as pas poussé.',
  mid: 'Cohérent avec la charge mesurée. On enchaîne.',
  high: 'RPE 9+ sur une séance de ce niveau de charge : ton corps te dit que la semaine est pleine. Samedi sera raccourci.',
};

/** @returns {import('./model.js').Snapshot} */
export function fixtureSnapshot() {
  return {
    athlete: ATHLETE,
    sessions: SESSIONS,
    activities: ACTIVITIES,
    exercises: EXERCISES,
    meta: { source: 'fixtures', fetchedAt: new Date().toISOString() },
  };
}
