// Le plan, toujours deux semaines d'avance.
//
// Trois contraintes, dans cet ordre :
//
//   1. Le mardi est au club. C'est une donnée d'entrée, pas une variable : on
//      ne choisit ni son contenu ni sa charge. Tout le reste se construit
//      autour, à commencer par les 48 h de part et d'autre.
//   2. La charge de la semaine part de ce que tu as réellement encaissé les
//      semaines précédentes, pas d'un idéal. On monte de 8 % par semaine, et
//      une semaine sur quatre redescend à 70 %.
//   3. Les allures viennent de ton seuil mesuré par la Coros (4:01/km), pas
//      d'un pourcentage de FC max.
//
// Le plan est recalculé à chaque ouverture : si la semaine écoulée a été plus
// lourde ou plus légère que prévu, les deux semaines suivantes bougent.

import { phaseFor, longRunCeilingMin, weeklyElevationTarget } from './goals.js';
import { composePpg, describePpg } from './ppg.js';
import { loadLevelProfile, normalizeLoadLevel } from './load-level.js';

const DAY = 86400000;

const parse = (ymd) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return new Date(x.getTime() - ((x.getDay() + 6) % 7) * DAY);
};
const fmtPace = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`;
const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)}′`);

/**
 * Charge par minute selon l'intensité — calibré sur ses propres séances :
 * 2h08 de sortie longue = 246, 58′ à 4:46 = 151, 1h29 avec 10 × 2′ = 267.
 */
const LOAD_RATE = { easy: 1.8, steady: 2.2, quality: 3.0, ppg: 0.8 };

/**
 * Totaux hebdomadaires réellement encaissés, **semaines terminées seulement**.
 *
 * La semaine en cours est exclue : un lundi soir elle ne contient qu'une
 * séance, et la compter comme une semaine pleine effondre la référence. C'est
 * exactement ce qui est arrivé — 88 de charge un lundi ont fait tomber la
 * médiane de 404 à 234, et le plan a supprimé deux séances pour « saturation ».
 */
export function weeklyHistory(sessions, today = new Date()) {
  const currentWeek = iso(monday(today));
  const weeks = new Map();
  for (const s of sessions || []) {
    if (!(s.load > 0) || s.planned) continue;
    const key = iso(monday(parse(s.date)));
    if (key >= currentWeek) continue;
    weeks.set(key, (weeks.get(key) || 0) + s.load);
  }
  return [...weeks.entries()].sort().map(([week, load]) => ({ week, load }));
}

/**
 * Charge visée pour une semaine à venir.
 *
 * La référence est la médiane des quatre dernières semaines, pas la moyenne :
 * une semaine de vacances à 110 ferait chuter une moyenne et casserait la
 * progression alors qu'elle ne dit rien de ce qu'il peut encaisser.
 */
export function weeklyTarget(history, weekIndex, ratio) {
  const recent = history.slice(-4).map((w) => w.load).sort((a, b) => a - b);
  if (!recent.length) return { load: 350, easyWeek: false };
  const median = recent[Math.floor(recent.length / 2)];

  // Ratio aigu/chronique bas = de la marge, ratio haut = on ne monte pas.
  const room = ratio == null ? 1.05 : ratio >= 0.9 ? 0.95 : ratio <= 0.65 ? 1.08 : 1.03;

  // Une semaine sur quatre est une semaine d'assimilation.
  const easyWeek = weekIndex > 0 && weekIndex % 4 === 3;
  const target = median * Math.pow(room, weekIndex + 1) * (easyWeek ? 0.7 : 1);

  return { load: Math.round(target), easyWeek };
}

/* ── Les gabarits de séance ───────────────────────────────────────────────── */

const fmtBlock = (sec) => (sec >= 60 && sec % 60 === 0 ? `${sec / 60}′`
  : sec >= 60 ? `${Math.floor(sec / 60)}′${sec % 60}`
    : `${sec}″`);

/** Déplie `blocks` / `sets` en une liste de répétitions. */
function clubReps(content) {
  if (content?.blocks) return content.blocks;
  if (content?.sets) {
    return content.sets.flatMap((set) => Array.from({ length: set.n }, () => ({ work: set.work, rec: set.rec })));
  }
  return [];
}

/** Résumé lisible : « 5 × 30″/30″ + 5 × 45″/45″ » ou « 2-3-4-5-4-3-2′ ». */
function clubShape(content) {
  if (content?.sets) {
    return content.sets.map((s) => `${s.n} × ${fmtBlock(s.work)}/${fmtBlock(s.rec)}`).join(' + ');
  }
  if (content?.blocks) {
    return `${content.blocks.map((b) => b.work / 60).join('-')}′ · récup ${fmtBlock(content.blocks[0].rec)}`;
  }
  return null;
}

/**
 * Charge et durée d'une séance de club au contenu connu.
 *
 * Le travail est compté au tarif « qualité », l'échauffement, les récupérations
 * et le retour au calme au tarif « facile ». Quand le contenu est inconnu, on
 * retombe sur la médiane des mardis passés — voir buildPlan.
 */
function clubFromContent(content) {
  const reps = clubReps(content);
  if (!reps.length) return null;
  const workSec = reps.reduce((a, r) => a + r.work, 0);
  const recSec = reps.reduce((a, r) => a + (r.rec || 0), 0);
  const easySec = recSec + ((content.warmupMin ?? 20) + (content.cooldownMin ?? 10)) * 60;
  return {
    load: Math.round((workSec / 60) * 3.4 + (easySec / 60) * LOAD_RATE.easy),
    durationSec: workSec + easySec,
    reps,
  };
}

function clubSession(date, load, thr, durationSec, content) {
  const shape = clubShape(content);
  const reps = clubReps(content);

  const steps = [
    { i: '01', label: 'Échauffement', detail: `${content?.warmupMin ?? 20}′ à ${fmtPace(thr + 80)} + 3 lignes droites` },
  ];
  if (content?.sets) {
    content.sets.forEach((set, i) => steps.push({
      i: String(i + 2).padStart(2, '0'),
      label: `${set.n} × ${fmtBlock(set.work)}`,
      detail: `récupération ${fmtBlock(set.rec)} · ${fmtPace(Math.max(190, thr - (set.work <= 45 ? 25 : 12)))}`,
    }));
  } else if (content?.blocks) {
    steps.push({
      i: '02',
      label: `Pyramide ${content.blocks.map((b) => b.work / 60).join('-')}′`,
      detail: `récupération ${fmtBlock(content.blocks[0].rec)} · ${fmtPace(thr - 10)} sur les blocs courts, ${fmtPace(thr)} sur le 5′`,
    });
  } else {
    steps.push({ i: '02', label: 'Séance collective', detail: 'Contenu annoncé par le club' });
  }
  steps.push({
    i: String(steps.length + 1).padStart(2, '0'),
    label: 'Retour au calme',
    detail: `${content?.cooldownMin ?? 10}′ à ${fmtPace(thr + 100)}, même si le groupe s’arrête net`,
  });

  const work = reps.length ? Math.round(reps.reduce((a, r) => a + r.work, 0) / 60) : null;

  return {
    type: 'TRAIL',
    title: content?.name ? `Club — ${content.name}` : 'Séance club',
    // Repéré par un drapeau, pas par son titre : celui-ci change avec le
    // contenu annoncé par le club.
    isClub: true,
    zone: 'Z4–Z5', intensity: 'quality', load,
    // La durée du club est une observation, pas un calcul : on ne la déduit pas
    // de la charge, sinon une séance d'1h29 s'affiche en 57 minutes.
    fixedDurationSec: durationSec,
    clubShape: shape,
    brief: shape
      ? `${shape}. ${work} minutes de travail effectif. C’est l’unique intensité de la semaine — tout le reste se range autour.`
      : 'Séance du club, contenu encore inconnu. C’est l’unique intensité de la semaine.',
    coach: reps.length && reps[0].work <= 45
      ? 'Séries courtes : c’est la vitesse qui compte, pas l’essoufflement. Si tu ne tiens plus l’allure, tu arrêtes la série.'
      : 'Si le contenu est plus dur que prévu, c’est le dimanche qu’on raccourcit, pas le jeudi.',
    steps,
  };
}

function longRun(date, load, thr, elevTarget, phase, elevCeiling) {
  const min = Math.round(load / LOAD_RATE.easy);
  // Le D+ de la sortie longue porte l'essentiel du dénivelé de la semaine,
  // mais deux plafonds s'appliquent avant celui de l'objectif : ce qu'on peut
  // grimper en Z2 dans le temps imparti (≈ 600 m/h), et ce qu'on grimpe
  // réellement aujourd'hui, majoré de 35 %. Sans eux, une CCC à 6 100 m
  // demandait 2 349 m de D+ sur une sortie d'1 h 39.
  const dplus = elevTarget
    ? Math.round(Math.min(elevTarget * 0.7, (min / 60) * 600, elevCeiling))
    : null;

  const steps = [
    { i: '01', label: 'Première heure', detail: `${fmtPace(thr + 100)} — volontairement trop lent` },
    { i: '02', label: 'Corps de séance', detail: `${fmtPace(thr + 90)} stable` },
  ];
  if (dplus) {
    steps.push({ i: '03', label: 'Dénivelé', detail: `${dplus} m D+ · marche dès que la FC dépasse la Z2` });
  }
  steps.push({
    i: String(steps.length + 1).padStart(2, '0'),
    label: 'Nutrition',
    detail: '60 g de glucides par heure, à tester dès maintenant',
  });

  return {
    type: 'TRAIL',
    title: `Sortie longue ${fmtDur(min)}`,
    zone: 'Z2', intensity: 'easy', load,
    dplus: dplus || undefined,
    brief: `${fmtDur(min)} à ${fmtPace(thr + 95)}${dplus ? ` avec ${dplus} m D+` : ''}. Allure de conversation du début à la fin : si tu finis plus vite que tu n’as commencé, c’est que tu es parti trop lentement — l’inverse, c’est que tu l’as courue.`,
    coach: phase?.phase === 'affûtage'
      ? 'Affûtage : cette sortie sert à entretenir, pas à construire. Tu dois finir avec l’impression d’en avoir sous le pied.'
      : phase?.phase === 'spécifique'
        ? 'Bloc spécifique : c’est la sortie qui ressemble le plus à la course. Bâtons, sac, ravitaillement — tout se teste ici.'
        : 'La séance la plus importante de la semaine, et la plus facile à saboter.',
    steps,
  };
}

function enduranceRun(date, load, thr) {
  const min = Math.round(load / LOAD_RATE.steady);
  return {
    type: 'TRAIL', title: `Footing ${fmtDur(min)}`, zone: 'Z2', intensity: 'steady',
    load,
    brief: `${fmtDur(min)} à ${fmtPace(thr + 70)}. Entre la séance du club et la sortie longue : ni l’une ni l’autre, juste du volume propre.`,
    coach: 'Aucune raison d’accélérer. Le bénéfice est dans la régularité.',
    steps: [
      { i: '01', label: 'Footing', detail: `${fmtDur(min)} à ${fmtPace(thr + 70)}` },
      { i: '02', label: 'Lignes droites', detail: '4 × 20″ en accélération progressive, récup complète' },
    ],
  };
}

function secondQuality(date, load, thr) {
  const min = Math.round(load / LOAD_RATE.quality);
  return {
    type: 'TRAIL', title: '3 × 8′ au seuil', zone: 'Z4', intensity: 'quality',
    load,
    brief: `Seuil à ${fmtPace(thr)}. Deuxième séance de qualité de la semaine : elle n’existe que parce que la charge le permet. Au moindre doute, tu la transformes en footing.`,
    coach: 'Le seuil se court par le bas. Si le bloc 1 est trop rapide, la séance est ratée avant d’avoir commencé.',
    steps: [
      { i: '01', label: 'Échauffement', detail: `20′ à ${fmtPace(thr + 80)} + 3 lignes droites` },
      { i: '02', label: '3 × 8′', detail: `${fmtPace(thr)} · récupération 3′ à ${fmtPace(thr + 100)}` },
      { i: '03', label: 'Retour au calme', detail: `${fmtDur(Math.max(10, min - 44))} facile` },
    ],
  };
}

/**
 * La séance de PPG, composée depuis la bibliothèque.
 *
 * Le contenu dépend du matériel coché dans Réglages : sans banc, pas de fente
 * bulgare ni de drop jump ; sans haltères, tout passe au poids de corps. La
 * pliométrie disparaît en semaine chargée ou en affûtage — c'est l'exercice le
 * plus traumatisant du lot.
 */
function ppgSession(date, load, composed, allowPlyo) {

  if (!composed) {
    return {
      type: 'PPG', title: 'Renfo + gainage', zone: 'FORCE', intensity: 'ppg', load,
      brief: 'Aucun exercice ne correspond au matériel coché dans Réglages.',
      coach: 'Coche au moins « poids du corps » dans Réglages.',
      steps: [],
    };
  }

  const roles = [...new Set(composed.exercises.map((e) => e.cat))];
  return {
    type: 'PPG',
    title: describePpg(composed),
    zone: roles.includes('PLIOMÉTRIE') ? 'FORCE · PLIO' : 'FORCE',
    intensity: 'ppg',
    load,
    fixedDurationSec: composed.minutes * 60,
    ppgExercises: composed.exercises,
    ppgProfile: composed.profile,
    brief: `${composed.exercises.length} exercices, ${composed.minutes} minutes : `
      + `${roles.map((r) => r.toLowerCase()).join(', ')}. `
      + (composed.profile === 'entretien'
        ? 'Au lendemain du club : on entretient, on ne construit pas.'
        : 'C’est la séance que tout le monde saute, et celle qui tient les descentes en fin de course.'),
    coach: composed.profile === 'entretien'
      ? 'Récupération active. Si tu forces ici, tu paies dimanche.'
      : allowPlyo
        ? 'À 48 h de la sortie longue : les jambes sont fraîches, c’est le moment.'
        : 'Pas de pliométrie cette semaine : la charge ne le permet pas.',
    steps: composed.steps,
  };
}

function restDay(date, reason) {
  return {
    type: 'REPOS', title: 'Repos', zone: '—', intensity: 'rest', load: 0,
    brief: reason,
    coach: reason,
    steps: [],
  };
}

/* ── Construction ─────────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {Array}  o.sessions   l'historique réel
 * @param {Array}  o.load       relevé de charge Coros (ratio aigu/chronique)
 * @param {object} o.fitness    { thresholdPaceSecPerKm }
 * @param {Date}   o.today
 * @param {number} [o.weeks]    nombre de semaines d'avance (2 par défaut)
 * @param {number} [o.clubDay]  jour du club, 2 = mardi
 * @returns {Array} séances planifiées, au même format que l'historique
 */
export function buildPlan({
  sessions, load, fitness, goals, club, ppgLibrary, equipment,
  today = new Date(), weeks = 2, clubDay = club?.day ?? 2, loadLevel = 4,
}) {
  const level = normalizeLoadLevel(loadLevel);
  const levelProfile = loadLevelProfile(level);
  const thr = fitness?.thresholdPaceSecPerKm || 241;
  const longPace = thr + 95;
  const clubByDate = new Map((club?.sessions || []).map((c) => [c.date, c]));

  // L'objectif prioritaire : le plus proche à venir. Un B ou un C ne déforme
  // pas la semaine, il se court dedans — seul un A commande l'affûtage.
  const nextGoal = (goals || [])
    .filter((g) => g.date && g.date >= iso(today) && g.distanceKm)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const history = weeklyHistory(sessions, today);
  const ratio = load?.[0]?.ratio ?? null;

  // La charge du club est la seule qu'on ne décide pas. On l'estime sur la
  // médiane des mardis passés plutôt que sur le dernier : une « rentrée des
  // classes » à 267 est un pic, et construire tout le plan dessus écraserait
  // le reste de la semaine pour rien.
  // Seuls les mardis *courus* comptent : une séance de musculation ou de cardio
  // en salle tombée un mardi n'est pas la séance du club, et l'inclure faisait
  // chuter l'estimation de 172 à 76.
  const isClubCandidate = (s) => s.load > 0 && !s.planned
    && s.type === 'TRAIL' && parse(s.date).getDay() === clubDay;

  const pastClub = (sessions || [])
    .filter(isClubCandidate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map((s) => s.load)
    .sort((a, b) => a - b);
  const clubDurations = (sessions || [])
    .filter((s) => isClubCandidate(s) && s.durationSec)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map((s) => s.durationSec)
    .sort((a, b) => a - b);
  const clubDuration = clubDurations.length
    ? Math.round(clubDurations.length % 2
      ? clubDurations[(clubDurations.length - 1) / 2]
      : (clubDurations[clubDurations.length / 2 - 1] + clubDurations[clubDurations.length / 2]) / 2)
    : 75 * 60;

  const clubLoad = pastClub.length
    ? Math.round(pastClub.length % 2
      ? pastClub[(pastClub.length - 1) / 2]
      : (pastClub[pastClub.length / 2 - 1] + pastClub[pastClub.length / 2]) / 2)
    : 200;

  // Durée de la sortie longue : elle monte de 10′ par semaine depuis la plus
  // longue des six dernières semaines, plancher 1h15, plafond 3h. C'est une
  // *contrainte*, pas un reste : une sortie longue calculée sur le reliquat du
  // budget hebdomadaire donne des « sorties longues » de 58 minutes.
  const pastLongest = Math.max(75 * 60, ...(sessions || [])
    .filter((s) => s.type === 'TRAIL' && !s.planned && s.durationSec
      && parse(s.date).getTime() > today.getTime() - 42 * DAY)
    .map((s) => s.durationSec));

  // Le dénivelé le plus élevé encaissé sur les six dernières semaines : on ne
  // monte pas de zéro à 2 000 m parce qu'une course l'exige.
  const recentElev = Math.max(300, ...(sessions || [])
    .filter((s) => !s.planned && s.dplus
      && parse(s.date).getTime() > today.getTime() - 42 * DAY)
    .map((s) => s.dplus));
  const elevCeiling = Math.round(recentElev * 1.35);

  const done = new Set((sessions || []).filter((s) => s.load > 0).map((s) => s.date));
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  const plan = [];
  const firstMonday = monday(start);

  for (let w = 0; w < weeks + 1; w++) {
    const weekStart = new Date(firstMonday.getTime() + w * 7 * DAY);
    const base = weeklyTarget(history, w, ratio);

    // La phase de préparation prime sur la progression de charge : à quinze
    // jours d'un objectif, on enlève du volume même si le ratio autorise à en
    // ajouter. C'est tout l'intérêt d'avoir une date.
    const phase = nextGoal ? phaseFor(nextGoal, weekStart, longPace) : null;
    const phasedTarget = phase && phase.phase !== 'passé'
      ? { load: Math.round(base.load * phase.loadFactor), easyWeek: base.easyWeek && phase.loadFactor >= 1 }
      : base;
    const target = {
      ...phasedTarget,
      load: Math.round(phasedTarget.load * levelProfile.factor),
    };

    // Deux séances sont non négociables : le club (imposé) et la sortie longue
    // (c'est elle qui fait le trail). On les sert d'abord, le reste se partage
    // ce qui subsiste.
    const ceiling = phase ? longRunCeilingMin(phase) : 180;
    const longLevelFactor = [0.55, 0.7, 0.85, 1, 1.08, 1.16, 1.22, 1.3][level - 1];
    const longMin = Math.min(ceiling, (Math.round(pastLongest / 60) + 10 * (w + 1)) * longLevelFactor)
      * (target.easyWeek ? 0.7 : 1);
    const longLoad = Math.round(longMin * LOAD_RATE.easy);
    const elevTarget = phase ? weeklyElevationTarget(phase) : null;

    // Ce qui a déjà été couru cette semaine est déjà dans la banque : on le
    // retranche du budget au lieu de planifier par-dessus.
    const weekEnd = iso(new Date(weekStart.getTime() + 6 * DAY));
    const alreadyDone = (sessions || [])
      .filter((s) => !s.planned && s.load > 0 && s.date >= iso(weekStart) && s.date <= weekEnd)
      .reduce((a, s) => a + s.load, 0);

    // Le contenu du club de cette semaine-là est connu ? Sa charge réelle vaut
    // mieux qu'une médiane pour dimensionner le reste.
    const weekClubDate = iso(new Date(weekStart.getTime() + ((clubDay + 6) % 7) * DAY));
    const weekClubLoad = clubFromContent(clubByDate.get(weekClubDate))?.load ?? clubLoad;

    // Deux séances de PPG par semaine, toujours — elles ne sont pas la variable
    // d'ajustement.
    //
    // Leur charge s'ajoute au budget course au lieu de le manger. Deux raisons :
    // le coût aérobie du renforcement est marginal (la Coros compte 19 pour 33
    // minutes de musculation), et les semaines qui servent de référence n'en
    // contenaient aucune — les soustraire du budget revenait à supprimer le
    // footing du jeudi pour financer du gainage.
    const ppgLoad = 24;

    const rest = target.load - alreadyDone - weekClubLoad - longLoad;
    // Le club et la sortie longue suffisent déjà à remplir la semaine : c'est
    // une information, pas une erreur — on le dit au lieu d'ajouter du volume.
    const saturated = rest < 60;
    const canDoSecondQuality = level >= 5 && rest >= 160 && !target.easyWeek;
    const weekendBlock = level >= 7
      && !target.easyWeek
      && !['affûtage', 'pré-affûtage', 'course'].includes(phase?.phase);
    const weekendBlockBonus = weekendBlock ? Math.round(longLoad * (level === 8 ? 0.12 : 0.08)) : 0;

    // Composées ensemble pour que la seconde ne reprenne pas les exercices de la
    // première.
    const wedDate = iso(new Date(weekStart.getTime() + 2 * DAY));
    const friDate = iso(new Date(weekStart.getTime() + 4 * DAY));
    const plyoOk = !target.easyWeek
      && !['affûtage', 'pré-affûtage', 'course'].includes(phase?.phase);

    const wedPpg = composePpg({
      library: ppgLibrary, equipment: equipment || ['poids-du-corps'],
      date: wedDate, allowPlyo: false, targetMin: 25, profile: 'entretien',
    });
    const friPpg = composePpg({
      library: ppgLibrary, equipment: equipment || ['poids-du-corps'],
      date: friDate, allowPlyo: plyoOk, targetMin: 35, profile: 'developpement',
      exclude: (wedPpg?.exercises || []).map((e) => e.id),
    });

    const budget = {
      long: longLoad,
      ppg: ppgLoad,
      second: canDoSecondQuality ? Math.round((rest - 24) * 0.85) : 0,
      endurance: !canDoSecondQuality && !saturated ? Math.max(0, rest - 24) : 0,
      saturated,
    };

    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart.getTime() + d * DAY);
      const key = iso(date);

      // On ne planifie ni le passé ni un jour déjà couru.
      if (date < start || done.has(key)) continue;

      const dow = date.getDay();
      let tpl;

      if (dow === clubDay) {
        const content = clubByDate.get(key);
        const derived = content ? clubFromContent(content) : null;
        tpl = level <= 2
          ? enduranceRun(key, Math.max(35, Math.round((derived?.load ?? clubLoad) * (level === 1 ? 0.3 : 0.45))), thr)
          : clubSession(key, derived?.load ?? clubLoad, thr, derived?.durationSec ?? clubDuration, content);
      } else if (dow === 0) {
        const sundayLoad = weekendBlock
          ? Math.round(budget.long * (level === 8 ? 0.64 : 0.63))
          : budget.long;
        tpl = longRun(key, sundayLoad, thr, elevTarget, phase, elevCeiling * (w + 1));
        if (weekendBlock) tpl = {
          ...tpl, title: `Bloc montagne · dimanche ${fmtDur(Math.round(tpl.load / LOAD_RATE.easy))}`,
          weekendBlock: true, blockId: `mountain-${iso(weekStart)}`,
          dplus: tpl.dplus || Math.round(Math.min(elevCeiling * (w + 1), recentElev * (level === 8 ? 1.2 : 1.05))),
        };
      } else if (dow === 4) {
        tpl = canDoSecondQuality
          ? secondQuality(key, budget.second, thr)
          : budget.endurance >= 40
            ? enduranceRun(key, budget.endurance, thr)
            : restDay(key, 'Le club et la sortie longue remplissent déjà la semaine. Ajouter du volume ici, c’est prendre sur dimanche.');
      } else if (dow === 5) {
        if (weekendBlock) tpl = restDay(key, 'Veille du bloc montagne : repos et préparation du matériel.');
        else if (level === 1) tpl = restDay(key, 'Niveau récupération : pas de renforcement cette semaine.');
        else tpl = ppgSession(key, budget.ppg, friPpg, plyoOk && level >= 4);
      } else if (dow === 6 && weekendBlock) {
          const saturdayLoad = Math.round(budget.long * (level === 8 ? 0.48 : 0.45));
          tpl = longRun(key, saturdayLoad, thr, elevTarget, phase, elevCeiling * (w + 1));
          tpl = {
            ...tpl, title: `Bloc montagne · samedi ${fmtDur(Math.round(saturdayLoad / LOAD_RATE.easy))}`,
            weekendBlock: true, blockId: `mountain-${iso(weekStart)}`,
            dplus: tpl.dplus || Math.round(Math.min(elevCeiling * (w + 1), recentElev * (level === 8 ? 1 : 0.85))),
          };
      } else if (dow === 1) {
        tpl = restDay(key, 'Veille de club. Rien, pas même un footing « pour se délier ».');
      } else if (dow === 3) {
        // Lendemain de club : une PPG légère est de la récupération active, pas
        // une séance de plus. Mobilité, gainage, un seul exercice de force.
        tpl = level === 1
          ? restDay(key, 'Niveau récupération : uniquement des footings faciles.')
          : ppgSession(key, budget.ppg, wedPpg, false);
      } else {
        tpl = restDay(key, 'Repos ou marche, au ressenti.');
      }

      const min = tpl.fixedDurationSec
        ? Math.round(tpl.fixedDurationSec / 60)
        : tpl.load ? Math.round(tpl.load / LOAD_RATE[tpl.intensity]) : 0;
      plan.push({
        ...tpl,
        id: `plan-${key}`,
        date: key,
        planned: true,
        done: false,
        weekTarget: target.load + weekendBlockBonus,
        easyWeek: target.easyWeek,
        phase: phase?.phase ?? null,
        phaseLabel: phase?.label ?? null,
        weeksOut: phase?.weeksOut ?? null,
        goalName: phase?.goal?.name ?? null,
        loadLevel: level,
        loadLevelLabel: levelProfile.label,
        elevTarget,
        durationSec: min * 60,
        durationLabel: min ? fmtDur(min) : '—',
        meta: tpl.load
          ? `${fmtDur(min)} · ${tpl.load} de charge visée`
          : 'Rien de prévu.',
      });
    }
  }

  // Deux semaines pleines à partir d'aujourd'hui, pas un jour de plus.
  const horizon = iso(new Date(start.getTime() + (weeks * 7 - 1) * DAY));
  return plan.filter((p) => p.date <= horizon).sort((a, b) => a.date.localeCompare(b.date));
}

/** Le résumé du plan, pour l'en-tête de la semaine à venir. */
export function planSummary(plan, weekStartIso) {
  const week = plan.filter((p) => {
    const start = parse(weekStartIso).getTime();
    const t = parse(p.date).getTime();
    return t >= start && t < start + 7 * DAY;
  });
  if (!week.length) return null;

  const total = week.reduce((a, p) => a + p.load, 0);
  const club = week.find((p) => p.isClub);
  const quality = week.filter((p) => p.intensity === 'quality').length;

  return {
    total,
    target: week[0].weekTarget,
    easyWeek: week[0].easyWeek,
    quality,
    clubShare: club && total ? Math.round((club.load / total) * 100) : 0,
    saturated: week.some((p) => p.type === 'REPOS' && /saturée|remplissent/.test(p.brief || '')),
    phase: week[0].phase,
    phaseLabel: week[0].phaseLabel,
    weeksOut: week[0].weeksOut,
    goalName: week[0].goalName,
    elevTarget: week[0].elevTarget,
    clubTitle: club?.title,
  };
}
