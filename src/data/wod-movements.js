// Le catalogue de mouvements du générateur de WOD.
//
// Une donnée, pas une règle : ce fichier dit ce qu'un mouvement *est* — ce
// qu'il demande comme matériel, ce qu'il sollicite, ce qu'il coûte aux
// articulations — et jamais comment on l'assemble. L'assemblage est dans
// wod.js, qui ne connaît rien d'autre que ces champs.
//
// Les identifiants de matériel reprennent ceux de `ppg-library.json` quand ils
// existent (`halteres`, `banc-step`, `kettlebell`…) pour qu'un matériel coché
// dans Réglages vaille ici aussi. Le reste — rameur, sled, box — est propre au
// CrossFit et au HYROX et n'a pas d'équivalent dans la bibliothèque PPG.

/**
 * Le matériel que le générateur connaît en plus de celui de la bibliothèque PPG.
 * `always: true` marque le poids du corps, qui n'est jamais décochable.
 */
export const WOD_EQUIPMENT = [
  { id: 'poids-du-corps', label: 'Poids du corps / aucun matériel', always: true },
  { id: 'corde-a-sauter', label: 'Corde à sauter' },
  { id: 'espace-course', label: 'Espace pour courir' },
  { id: 'box', label: 'Box / caisson' },
  { id: 'wall-ball', label: 'Wall ball' },
  { id: 'rameur', label: 'Rameur' },
  { id: 'ski-erg', label: 'SkiErg' },
  { id: 'velo-assaut', label: 'Vélo assaut' },
  { id: 'sled', label: 'Traîneau (sled)' },
  { id: 'sac-de-sable', label: 'Sac de sable' },
  { id: 'barre-traction', label: 'Barre de traction' },
];

/**
 * Les libellés du matériel de la bibliothèque PPG.
 *
 * Ils vivent ici et pas dans `ppg-library.json` parce que le générateur doit
 * pouvoir nommer un matériel même quand la bibliothèque n'est pas chargée —
 * afficher « poids-du-corps » à quelqu'un qui se prépare à s'entraîner n'est
 * pas une option.
 */
const PPG_EQUIPMENT_LABELS = {
  'poids-du-corps': 'Poids du corps / aucun matériel',
  'banc-step': 'Banc ou marche',
  halteres: 'Haltères',
  elastique: 'Élastique',
  kettlebell: 'Kettlebell',
  'swiss-ball': 'Swiss ball',
  rouleau: 'Rouleau de massage',
  'gilet-leste': 'Gilet lesté',
  barre: 'Barre',
  salle: 'Machines de salle',
};

/** Le nom lisible d'un identifiant de matériel, d'où qu'il vienne. */
export function equipmentLabel(id) {
  return WOD_EQUIPMENT.find((e) => e.id === id)?.label
    ?? PPG_EQUIPMENT_LABELS[id]
    ?? id;
}

/** Les zones du corps qu'on peut demander d'épargner. */
export const BODY_ZONES = [
  { id: 'genou', label: 'Genoux' },
  { id: 'cheville', label: 'Chevilles' },
  { id: 'hanche', label: 'Hanches' },
  { id: 'lombaires', label: 'Bas du dos' },
  { id: 'dos', label: 'Dos / haut du dos' },
  { id: 'epaule', label: 'Épaules' },
  { id: 'coude', label: 'Coudes' },
  { id: 'poignet', label: 'Poignets' },
];

/**
 * Mots-clés reconnus dans le texte libre des contraintes.
 *
 * Une saisie libre ne sert à rien si personne ne la lit. On n'essaie pas de
 * comprendre la phrase : on cherche les mots qui désignent une zone, et une
 * zone nommée est une zone épargnée. Ce qui n'est pas reconnu reste affiché
 * dans la séance, à l'attention de qui s'entraîne.
 */
export const ZONE_KEYWORDS = {
  genou: ['genou', 'genoux', 'rotule', 'croise', 'menisque'],
  cheville: ['cheville', 'chevilles', 'entorse', 'achille', 'mollet', 'mollets'],
  hanche: ['hanche', 'hanches', 'psoas', 'aine', 'fessier', 'fessiers'],
  lombaires: ['lombaire', 'lombaires', 'bas du dos', 'hernie', 'sciatique', 'dos'],
  dos: ['dorsal', 'dorsaux', 'trapeze', 'omoplate', 'cervicale', 'cervicales', 'nuque'],
  epaule: ['epaule', 'epaules', 'coiffe', 'rotateur', 'acromion'],
  coude: ['coude', 'coudes', 'epicondylite'],
  poignet: ['poignet', 'poignets', 'carpien', 'main', 'mains'],
};

/**
 * @typedef  {Object} Movement
 * @property {string}   id
 * @property {string}   name
 * @property {string[]} needs        matériel requis — TOUT doit être disponible
 * @property {string[]} groups       chaînes sollicitées (voir GROUP_LABELS)
 * @property {string[]} zones        articulations mises à contribution
 * @property {'crossfit'|'hyrox'|'both'} discipline
 * @property {'haut'|'faible'}  impact  articulaire, pas cardiaque
 * @property {1|2|3}    skill        niveau minimal requis
 * @property {string[]} roles        'echauffement' | 'wod' | 'retour-au-calme'
 * @property {'reps'|'distance'|'calories'|'temps'} mode
 * @property {[number, number, number]} dose  débutant, intermédiaire, avancé
 * @property {[string, string, string]} [charge] charge indicative par niveau
 * @property {string}   easier       variante plus facile
 * @property {string}   harder       variante plus difficile
 * @property {string}   [note]       consigne de sécurité propre au mouvement
 * @property {string}   [libraryId]  exercice de ppg-library.json qui illustre le
 *                                   même geste — sert à afficher son visuel
 */

export const GROUP_LABELS = {
  cardio: 'Cardio',
  jambes: 'Jambes',
  'chaine-posterieure': 'Chaîne postérieure',
  poussee: 'Poussée',
  tirage: 'Tirage',
  gainage: 'Gainage',
  mobilite: 'Mobilité',
};

/** @type {Movement[]} */
export const MOVEMENTS = [
  // ── Cardio / monostructurel ───────────────────────────────────────────────
  {
    id: 'course', name: 'Course', needs: ['espace-course'],
    groups: ['cardio', 'jambes'], zones: ['genou', 'cheville'],
    discipline: 'both', impact: 'haut', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'distance', dose: [200, 400, 600],
    easier: 'Marche rapide, ou moitié de la distance',
    harder: 'Même distance avec gilet lesté ou en côte',
  },
  {
    id: 'navettes', name: 'Navettes 20 m', needs: ['espace-course'],
    groups: ['cardio', 'jambes'], zones: ['genou', 'cheville'],
    discipline: 'hyrox', impact: 'haut', skill: 1, roles: ['wod'],
    mode: 'distance', dose: [160, 240, 320],
    easier: 'Navettes en marche rapide, demi-tours larges',
    harder: 'Demi-tours avec touche au sol à chaque extrémité',
    note: 'Les demi-tours chargent le genou : décélère avant, ne pivote pas sur un appui bloqué.',
  },
  {
    id: 'rameur', name: 'Rameur', needs: ['rameur'],
    groups: ['cardio', 'tirage'], zones: ['lombaires', 'dos'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'distance', dose: [250, 400, 500],
    easier: 'Distance réduite de moitié, cadence libre',
    harder: 'Même distance à cadence imposée (24–26 coups/min)',
    note: 'Jambes d’abord, puis tronc, puis bras — jamais le dos en premier.',
  },
  {
    id: 'ski-erg', name: 'SkiErg', needs: ['ski-erg'],
    groups: ['cardio', 'tirage', 'gainage'], zones: ['epaule', 'lombaires'],
    discipline: 'hyrox', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'distance', dose: [250, 400, 500],
    easier: 'Distance réduite, amplitude courte',
    harder: 'Distance pleine, finition mains sous les hanches',
  },
  {
    id: 'velo-assaut', name: 'Vélo assaut', needs: ['velo-assaut'],
    groups: ['cardio', 'jambes'], zones: [],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'calories', dose: [8, 12, 15],
    easier: 'Moitié des calories, bras relâchés',
    harder: 'Mêmes calories en poussant sur les bras',
  },
  {
    id: 'corde-simple', name: 'Corde à sauter', needs: ['corde-a-sauter'],
    groups: ['cardio'], zones: ['cheville'],
    discipline: 'crossfit', impact: 'haut', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'reps', dose: [40, 60, 80],
    easier: 'Sauts sur place sans corde, même durée',
    harder: 'Double unders sur le même nombre de sauts',
  },
  {
    id: 'double-unders', name: 'Double unders', needs: ['corde-a-sauter'],
    groups: ['cardio'], zones: ['cheville', 'poignet'],
    discipline: 'crossfit', impact: 'haut', skill: 3, roles: ['wod'],
    mode: 'reps', dose: [20, 30, 50],
    easier: 'Sauts simples, double du nombre de répétitions',
    harder: 'Séries non interrompues de 20 minimum',
  },
  {
    id: 'burpees', name: 'Burpees', needs: ['poids-du-corps'],
    groups: ['cardio', 'poussee', 'gainage'], zones: ['epaule', 'poignet', 'genou'],
    discipline: 'both', impact: 'haut', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [8, 12, 15],
    easier: 'Burpees en step-back, sans saut final',
    harder: 'Burpees avec saut groupé ou touche cible',
    note: 'Pose les mains avant le buste, ne t’effondre pas sur la poitrine.',
  },
  {
    id: 'burpees-broad-jump', name: 'Burpees broad jump', needs: ['poids-du-corps', 'espace-course'],
    groups: ['cardio', 'jambes', 'poussee'], zones: ['genou', 'cheville', 'epaule'],
    discipline: 'hyrox', impact: 'haut', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [8, 10, 12],
    easier: 'Burpees step-back puis deux pas en avant',
    harder: 'Saut en longueur maximal à chaque répétition',
  },
  {
    id: 'montees-genoux', name: 'Montées de genoux', needs: ['poids-du-corps'],
    groups: ['cardio'], zones: ['cheville'],
    discipline: 'both', impact: 'haut', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'temps', dose: [30, 40, 45],
    easier: 'Marche sur place avec montée de genou alternée',
    harder: 'Cadence rapide, genoux au-dessus des hanches',
  },
  {
    id: 'talons-fesses', name: 'Talons-fesses', needs: ['poids-du-corps'],
    groups: ['cardio'], zones: ['genou'],
    discipline: 'both', impact: 'haut', skill: 1, roles: ['echauffement'],
    mode: 'temps', dose: [30, 30, 40],
    easier: 'Version marchée',
    harder: 'Cadence rapide sur l’avant du pied',
  },

  // ── Jambes ────────────────────────────────────────────────────────────────
  {
    id: 'air-squat', name: 'Air squat', needs: ['poids-du-corps'],
    groups: ['jambes'], zones: ['genou', 'hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'reps', dose: [15, 20, 25],
    easier: 'Squat sur chaise, amplitude réduite',
    harder: 'Squat sauté, ou tempo 3 s à la descente',
  },
  {
    id: 'squat-gobelet', name: 'Squat gobelet', needs: ['kettlebell'],
    groups: ['jambes'], zones: ['genou', 'lombaires'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [12, 15, 20], charge: ['8–12 kg', '12–16 kg', '16–24 kg'],
    easier: 'Air squat sans charge',
    harder: 'Pause de 2 s en bas à chaque répétition',
  },
  {
    id: 'squat-gobelet-haltere', name: 'Squat gobelet haltère', needs: ['halteres'],
    groups: ['jambes'], zones: ['genou', 'lombaires'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [12, 15, 20], charge: ['8–10 kg', '10–15 kg', '15–22 kg'],
    easier: 'Air squat sans charge',
    harder: 'Deux haltères en position rack',
    libraryId: '1760',
  },
  {
    id: 'fentes-marchees', name: 'Fentes marchées lestées', needs: ['halteres'],
    groups: ['jambes'], zones: ['genou', 'hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [16, 20, 24], charge: ['2 × 5 kg', '2 × 8 kg', '2 × 12 kg'],
    easier: 'Fentes alternées sur place, sans charge',
    harder: 'Fentes marchées haltères bras tendus au-dessus de la tête',
    note: 'Le genou avant reste au-dessus du pied, le genou arrière frôle le sol sans le percuter.',
    libraryId: '0336',
  },
  {
    id: 'fentes-sautees', name: 'Fentes sautées', needs: ['poids-du-corps'],
    groups: ['jambes'], zones: ['genou', 'cheville'],
    discipline: 'crossfit', impact: 'haut', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [12, 16, 20],
    easier: 'Fentes alternées marchées',
    harder: 'Fentes sautées avec gilet lesté',
    libraryId: '3582',
  },
  {
    id: 'wall-ball', name: 'Wall ball', needs: ['wall-ball'],
    groups: ['jambes', 'poussee', 'cardio'], zones: ['epaule', 'genou'],
    discipline: 'crossfit', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [12, 15, 20], charge: ['4 kg', '6 kg', '9 kg'],
    easier: 'Squat + lancer sans cible haute, ballon léger',
    harder: 'Cible haute, séries non interrompues de 15',
  },
  {
    id: 'box-jump', name: 'Box jump', needs: ['box'],
    groups: ['jambes'], zones: ['genou', 'cheville'],
    discipline: 'crossfit', impact: 'haut', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [10, 12, 15], charge: ['40 cm', '50 cm', '60 cm'],
    easier: 'Montées sur box une jambe après l’autre (step-up)',
    harder: 'Réception haute et extension complète de hanche',
    note: 'Redescends en marchant : l’enchaînement de réceptions en descente est ce qui abîme le tendon rotulien.',
  },
  {
    id: 'step-up-leste', name: 'Montées de banc lestées', needs: ['banc-step', 'halteres'],
    groups: ['jambes'], zones: ['genou'],
    discipline: 'hyrox', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [16, 20, 24], charge: ['2 × 5 kg', '2 × 8 kg', '2 × 12 kg'],
    easier: 'Montées de banc sans charge, marche basse',
    harder: 'Montées avec sac de sable sur l’épaule',
    libraryId: '0431',
  },
  {
    id: 'squat-sumo-elastique', name: 'Squat sumo à l’élastique', needs: ['elastique'],
    groups: ['jambes'], zones: ['genou', 'hanche'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'reps', dose: [15, 20, 25],
    easier: 'Squat sumo sans élastique',
    harder: 'Élastique plus résistant, pause basse de 2 s',
    libraryId: '1004',
  },
  {
    id: 'thruster', name: 'Thruster', needs: ['barre'],
    groups: ['jambes', 'poussee'], zones: ['epaule', 'genou', 'poignet'],
    discipline: 'crossfit', impact: 'faible', skill: 3, roles: ['wod'],
    mode: 'reps', dose: [8, 10, 12], charge: ['20 kg', '30 kg', '40 kg'],
    easier: 'Thruster aux haltères, charge légère',
    harder: 'Barre chargée, séries non interrompues',
    note: 'Le mouvement est continu : la barre ne s’arrête pas à l’épaule.',
  },
  {
    id: 'front-squat', name: 'Squat avant', needs: ['barre'],
    groups: ['jambes'], zones: ['genou', 'poignet', 'epaule'],
    discipline: 'crossfit', impact: 'faible', skill: 3, roles: ['wod'],
    mode: 'reps', dose: [6, 8, 10], charge: ['30 kg', '45 kg', '60 kg'],
    easier: 'Squat gobelet à la kettlebell',
    harder: 'Charge lourde, pause de 2 s en bas',
  },
  {
    id: 'presse-jambes', name: 'Presse à cuisses', needs: ['salle'],
    groups: ['jambes'], zones: ['genou'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [12, 15, 20], charge: ['légère', 'modérée', 'lourde'],
    easier: 'Amplitude réduite, charge légère',
    harder: 'Une jambe à la fois',
  },
  {
    id: 'sled-push', name: 'Sled push', needs: ['sled', 'espace-course'],
    groups: ['jambes'], zones: ['genou', 'cheville'],
    discipline: 'hyrox', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'distance', dose: [20, 25, 30], charge: ['+25 kg', '+50 kg', '+75 kg'],
    easier: 'Traîneau à vide, distance réduite',
    harder: 'Charge pleine, poussée basse sans arrêt',
  },
  {
    id: 'sled-pull', name: 'Sled pull', needs: ['sled', 'espace-course'],
    groups: ['tirage', 'jambes'], zones: ['dos', 'lombaires'],
    discipline: 'hyrox', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'distance', dose: [20, 25, 30], charge: ['+15 kg', '+30 kg', '+50 kg'],
    easier: 'Traction à la corde à vide, appuis larges',
    harder: 'Charge pleine, tirage bras tendus en reculant',
  },

  // ── Chaîne postérieure ────────────────────────────────────────────────────
  {
    id: 'kb-swing', name: 'Kettlebell swing', needs: ['kettlebell'],
    groups: ['chaine-posterieure', 'cardio'], zones: ['lombaires', 'hanche'],
    discipline: 'crossfit', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [15, 20, 25], charge: ['12 kg', '16 kg', '24 kg'],
    easier: 'Swing russe à hauteur d’épaule, charge légère',
    harder: 'Swing américain jusqu’au-dessus de la tête',
    note: 'C’est une extension de hanche, pas un soulevé de bras : le dos reste plat.',
  },
  {
    id: 'souleve-de-terre', name: 'Soulevé de terre', needs: ['barre'],
    groups: ['chaine-posterieure'], zones: ['lombaires', 'dos', 'hanche'],
    discipline: 'crossfit', impact: 'faible', skill: 3, roles: ['wod'],
    mode: 'reps', dose: [6, 8, 10], charge: ['40 kg', '60 kg', '80 kg'],
    easier: 'Soulevé de terre roumain aux haltères',
    harder: 'Charge lourde, arrêt complet au sol à chaque répétition',
    note: 'Arrête la série dès que le bas du dos s’arrondit — pas une répétition de plus.',
  },
  {
    id: 'souleve-roumain-halteres', name: 'Soulevé de terre roumain (haltères)', needs: ['halteres'],
    groups: ['chaine-posterieure'], zones: ['lombaires', 'hanche'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [10, 12, 15], charge: ['2 × 6 kg', '2 × 10 kg', '2 × 16 kg'],
    easier: 'Sans charge, mains glissant le long des cuisses',
    harder: 'Sur une jambe, en alternant',
    libraryId: '1459',
  },
  {
    id: 'hip-thrust', name: 'Hip thrust au banc', needs: ['banc-step'],
    groups: ['chaine-posterieure'], zones: ['hanche', 'lombaires'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [15, 20, 25],
    easier: 'Pont fessier au sol',
    harder: 'Hip thrust une jambe, ou lesté',
  },
  {
    id: 'pont-fessier', name: 'Pont fessier', needs: ['poids-du-corps'],
    groups: ['chaine-posterieure'], zones: ['hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'reps', dose: [15, 20, 25],
    easier: 'Amplitude réduite, appui deux pieds',
    harder: 'Pont fessier une jambe, pause 2 s en haut',
    libraryId: '3013',
  },

  // ── Poussée ───────────────────────────────────────────────────────────────
  {
    id: 'pompes', name: 'Pompes', needs: ['poids-du-corps'],
    groups: ['poussee', 'gainage'], zones: ['epaule', 'poignet', 'coude'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'reps', dose: [10, 15, 20],
    easier: 'Pompes sur les genoux, ou mains surélevées',
    harder: 'Pieds surélevés, ou tempo 3 s à la descente',
  },
  {
    id: 'dips-banc', name: 'Dips sur banc', needs: ['banc-step'],
    groups: ['poussee'], zones: ['epaule', 'coude'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [10, 15, 20],
    easier: 'Genoux fléchis, pieds proches',
    harder: 'Jambes tendues, pieds surélevés',
  },
  {
    id: 'developpe-halteres', name: 'Développé militaire haltères', needs: ['halteres'],
    groups: ['poussee'], zones: ['epaule', 'poignet'],
    discipline: 'crossfit', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [8, 12, 15], charge: ['2 × 5 kg', '2 × 8 kg', '2 × 12 kg'],
    easier: 'Charge légère, un bras à la fois',
    harder: 'Push press haltères, charge pleine',
  },
  {
    id: 'push-press-barre', name: 'Push press', needs: ['barre'],
    groups: ['poussee'], zones: ['epaule', 'lombaires', 'poignet'],
    discipline: 'crossfit', impact: 'faible', skill: 3, roles: ['wod'],
    mode: 'reps', dose: [6, 8, 10], charge: ['20 kg', '30 kg', '40 kg'],
    easier: 'Push press aux haltères',
    harder: 'Réception en fente (push jerk)',
  },
  {
    id: 'pompes-elastique', name: 'Pompes avec élastique', needs: ['elastique'],
    groups: ['poussee', 'gainage'], zones: ['epaule', 'poignet'],
    discipline: 'crossfit', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [8, 12, 15],
    easier: 'Pompes sans élastique',
    harder: 'Élastique plus résistant, tempo lent',
  },

  // ── Tirage ────────────────────────────────────────────────────────────────
  {
    id: 'tractions', name: 'Tractions', needs: ['barre-traction'],
    groups: ['tirage'], zones: ['epaule', 'coude', 'dos'],
    discipline: 'crossfit', impact: 'faible', skill: 3, roles: ['wod'],
    mode: 'reps', dose: [3, 6, 10],
    easier: 'Tractions à l’élastique, ou tractions australiennes',
    harder: 'Tractions strictes lestées',
  },
  {
    id: 'rowing-haltere', name: 'Rowing haltère', needs: ['halteres'],
    groups: ['tirage'], zones: ['dos', 'lombaires', 'coude'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [10, 12, 15], charge: ['6 kg', '10 kg', '16 kg'],
    easier: 'Un bras en appui sur un banc, charge légère',
    harder: 'Deux haltères, buste à 45°',
  },
  {
    id: 'tirage-elastique', name: 'Tirage horizontal à l’élastique', needs: ['elastique'],
    groups: ['tirage'], zones: ['dos', 'epaule'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'reps', dose: [15, 20, 25],
    easier: 'Élastique léger, amplitude courte',
    harder: 'Élastique lourd, pause 2 s en contraction',
  },
  {
    id: 'tirage-machine', name: 'Tirage vertical machine', needs: ['salle'],
    groups: ['tirage'], zones: ['dos', 'epaule'],
    discipline: 'crossfit', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [10, 12, 15], charge: ['légère', 'modérée', 'lourde'],
    easier: 'Charge légère, amplitude complète',
    harder: 'Prise serrée, tempo 3 s au retour',
  },
  {
    id: 'farmer-carry', name: 'Farmer carry', needs: ['halteres', 'espace-course'],
    groups: ['tirage', 'gainage'], zones: ['epaule', 'lombaires'],
    discipline: 'hyrox', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'distance', dose: [40, 60, 80], charge: ['2 × 8 kg', '2 × 12 kg', '2 × 20 kg'],
    easier: 'Charge légère, distance réduite',
    harder: 'Charge lourde sans repose au sol',
  },
  {
    id: 'sandbag-lunges', name: 'Fentes avec sac de sable', needs: ['sac-de-sable', 'espace-course'],
    groups: ['jambes', 'gainage'], zones: ['genou', 'lombaires', 'epaule'],
    discipline: 'hyrox', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'distance', dose: [20, 30, 40], charge: ['10 kg', '20 kg', '30 kg'],
    easier: 'Fentes marchées sans charge',
    harder: 'Sac sur la nuque, sans repose',
  },

  // ── Gainage ───────────────────────────────────────────────────────────────
  {
    id: 'planche', name: 'Gainage ventral', needs: ['poids-du-corps'],
    groups: ['gainage'], zones: ['lombaires', 'epaule'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'wod', 'retour-au-calme'],
    mode: 'temps', dose: [30, 45, 60],
    easier: 'Gainage sur les genoux, ou mains surélevées',
    harder: 'Gainage lesté, ou bras tendus alternés',
  },
  {
    id: 'planche-laterale', name: 'Gainage latéral (par côté)', needs: ['poids-du-corps'],
    groups: ['gainage'], zones: ['lombaires', 'epaule'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['wod', 'retour-au-calme'],
    mode: 'temps', dose: [20, 30, 40],
    easier: 'Appui sur le genou du dessous',
    harder: 'Jambe du dessus levée, bras tendu',
    libraryId: '3544',
  },
  {
    id: 'hollow-hold', name: 'Hollow hold', needs: ['poids-du-corps'],
    groups: ['gainage'], zones: ['lombaires'],
    discipline: 'crossfit', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'temps', dose: [20, 30, 45],
    easier: 'Genoux fléchis, bras le long du corps',
    harder: 'Bras et jambes tendus, bas du dos plaqué',
  },
  {
    id: 'mountain-climbers', name: 'Mountain climbers', needs: ['poids-du-corps'],
    groups: ['gainage', 'cardio'], zones: ['epaule', 'poignet', 'hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'wod'],
    mode: 'temps', dose: [30, 40, 50],
    easier: 'Cadence lente, mains surélevées',
    harder: 'Cadence rapide, bassin bas',
  },
  {
    id: 'releves-jambes', name: 'Relevés de jambes au sol', needs: ['poids-du-corps'],
    groups: ['gainage'], zones: ['lombaires', 'hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['wod'],
    mode: 'reps', dose: [12, 15, 20],
    easier: 'Genoux fléchis, amplitude réduite',
    harder: 'Jambes tendues, descente lente de 3 s',
  },
  {
    id: 'rollout-swiss-ball', name: 'Rollout au swiss ball', needs: ['swiss-ball'],
    groups: ['gainage'], zones: ['lombaires', 'epaule'],
    discipline: 'crossfit', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'reps', dose: [8, 10, 12],
    easier: 'Amplitude courte, genoux au sol',
    harder: 'Amplitude complète, bras tendus',
  },
  {
    id: 'gainage-leste', name: 'Gainage lesté', needs: ['gilet-leste'],
    groups: ['gainage'], zones: ['lombaires', 'epaule'],
    discipline: 'crossfit', impact: 'faible', skill: 2, roles: ['wod'],
    mode: 'temps', dose: [25, 35, 50],
    easier: 'Gainage sans gilet',
    harder: 'Gilet plus lourd, bras tendus',
  },

  // ── Mobilité ──────────────────────────────────────────────────────────────
  {
    id: 'mobilite-hanche', name: 'Ouverture de hanche (fente basse)', needs: ['poids-du-corps'],
    groups: ['mobilite'], zones: ['hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'retour-au-calme', 'wod'],
    mode: 'temps', dose: [40, 45, 50],
    easier: 'Genou arrière posé sur un tapis, amplitude réduite',
    harder: 'Bras levés côté genou avant, bassin rétroversé',
  },
  {
    id: 'mobilite-cheville', name: 'Mobilité de cheville au mur', needs: ['poids-du-corps'],
    groups: ['mobilite'], zones: ['cheville'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'retour-au-calme'],
    mode: 'temps', dose: [40, 45, 45],
    easier: 'Talon décollé toléré, amplitude courte',
    harder: 'Talon au sol, genou qui franchit les orteils',
    libraryId: '1407',
  },
  {
    id: 'chat-vache', name: 'Chat-vache', needs: ['poids-du-corps'],
    groups: ['mobilite'], zones: ['lombaires', 'dos'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'retour-au-calme'],
    mode: 'temps', dose: [40, 45, 45],
    easier: 'Amplitude réduite, respiration lente',
    harder: 'Amplitude complète, 4 s par phase',
  },
  {
    id: 'cercles-epaules', name: 'Cercles d’épaules et rotations', needs: ['poids-du-corps'],
    groups: ['mobilite'], zones: ['epaule'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'retour-au-calme'],
    mode: 'temps', dose: [30, 40, 40],
    easier: 'Cercles courts, bras fléchis',
    harder: 'Passages d’épaule avec un bâton',
  },
  {
    id: 'etirement-ischios', name: 'Étirement actif des ischio-jambiers', needs: ['poids-du-corps'],
    groups: ['mobilite'], zones: ['hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['echauffement', 'retour-au-calme'],
    mode: 'temps', dose: [40, 45, 45],
    easier: 'Jambe légèrement fléchie',
    harder: 'Jambe tendue, bassin en antéversion',
    libraryId: '1511',
  },
  {
    id: 'rouleau-quadriceps', name: 'Rouleau : quadriceps et bandelette', needs: ['rouleau'],
    groups: ['mobilite'], zones: ['genou', 'hanche'],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['retour-au-calme'],
    mode: 'temps', dose: [45, 60, 60],
    easier: 'Pression allégée, appui sur les avant-bras',
    harder: 'Passage lent avec arrêt sur les points sensibles',
  },
  {
    id: 'respiration', name: 'Respiration diaphragmatique', needs: ['poids-du-corps'],
    groups: ['mobilite'], zones: [],
    discipline: 'both', impact: 'faible', skill: 1, roles: ['retour-au-calme'],
    mode: 'temps', dose: [60, 60, 90],
    easier: 'Allongé, une main sur le ventre',
    harder: 'Expiration allongée sur 8 s',
  },
];

/** Index par identifiant — évite un `find` linéaire à chaque appel. */
export const MOVEMENT_BY_ID = new Map(MOVEMENTS.map((m) => [m.id, m]));
