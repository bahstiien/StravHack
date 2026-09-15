// Ce que le questionnaire répond à l'écran.
//
// Une recommandation qui ne s'explique pas n'est pas une recommandation, c'est
// une note. Ce fichier ne décide de rien : il met en français ce que le moteur
// a établi, et il refuse d'afficher un statut sans les éléments observables qui
// l'ont produit.

import {
  FATIGUE_SUMMARY_LABELS, SLEEP_LABELS, MOTIVATION_LABELS, areaSpoken, areaLabel,
  sorenessLabel, momentLabel,
} from './checkin-model.js';
import { STATUS, STATUS_LABELS, RULE_CODES } from './checkin-engine.js';

const fmtMinutes = (value) => {
  if (value == null) return '—';
  if (value === 0) return 'indisponible';
  if (value < 60) return `${value} min`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

/** « courbatures légères aux mollets », ou « rien à signaler ». */
export function legsSentence(answers) {
  const { level, areas } = answers.soreness;
  if (!level || level === 'none') return 'rien à signaler';
  const where = areas.length
    ? ` ${areas.map((id) => areaSpoken(id) || areaLabel(id)).filter(Boolean).join(', ')}`
    : '';
  return `courbatures ${sorenessLabel(level)}${where}`;
}

export function painSentence(answers) {
  const { pain } = answers;
  if (!pain.present) return 'aucune';
  const where = pain.area ? `${areaSpoken(pain.area) || areaLabel(pain.area)}`.replace(/^aux? /, '') : 'zone non précisée';
  const intensity = pain.intensity ? ` ${pain.intensity}/10` : '';
  const when = pain.moments.length ? `, ${pain.moments.map(momentLabel).join(' et ')}` : '';
  return `${where}${intensity}${when}`;
}

/** Les six lignes de la synthèse, dans l'ordre du questionnaire. */
export function summaryLines(answers) {
  return [
    { label: 'Temps', value: fmtMinutes(answers.availableMinutes) },
    { label: 'Fatigue', value: FATIGUE_SUMMARY_LABELS[answers.fatigue] ?? '—' },
    { label: 'Sommeil', value: sleepValue(answers) },
    { label: 'Jambes', value: legsSentence(answers) },
    { label: 'Motivation', value: MOTIVATION_LABELS[answers.motivation] ?? '—' },
    { label: 'Douleur', value: painSentence(answers) },
  ];
}

/**
 * « bon », et « bon · 7 h 15 » quand la durée est connue.
 *
 * Le libellé féminin du questionnaire (« bonne nuit ») devient masculin ici :
 * la ligne dit « Sommeil : bon », pas « Sommeil : bonne ».
 */
function sleepValue(answers) {
  const MASCULIN = { 1: 'très mauvais', 2: 'mauvais', 3: 'correct', 4: 'bon', 5: 'excellent' };
  const quality = MASCULIN[answers.sleepQuality] ?? SLEEP_LABELS[answers.sleepQuality] ?? '—';
  if (!Number.isFinite(answers.sleepMinutes) || answers.sleepMinutes <= 0) return quality;
  const h = Math.floor(answers.sleepMinutes / 60);
  const m = answers.sleepMinutes % 60;
  return `${quality} · ${h} h ${String(m).padStart(2, '0')}`;
}

/** Le bloc texte du cahier des charges, tel quel. */
export function summaryText(answers) {
  return ['DISPONIBILITÉ DU JOUR', '', ...summaryLines(answers).map((l) => `${l.label} : ${l.value}`)].join('\n');
}

/**
 * Les phrases d'ouverture par statut.
 *
 * Chacune est écrite pour être suivie des raisons, jamais pour tenir seule :
 * c'est la concaténation des deux qui fait l'explication.
 */
const OPENINGS = {
  [STATUS.KEEP]: 'Rien ne s’oppose à la séance prévue.',
  [STATUS.NO_SESSION]: 'Aucune séance n’est prévue aujourd’hui.',
  [STATUS.SHORTEN]: 'La séance tient, mais pas dans son format prévu.',
  [STATUS.ADAPT]: 'La séance reste possible, à condition d’en changer le contenu.',
  [STATUS.MOVE]: 'Aujourd’hui ne convient pas à cette séance.',
  [STATUS.RECOVER]: 'Les signaux de récupération sont trop dégradés pour s’entraîner comme prévu.',
  [STATUS.MEDICAL]: 'Ce que tu décris dépasse ce qu’une application peut évaluer.',
};

/** La conduite à tenir, en une phrase, adossée à la séance du jour. */
function guidance(recommendation, context) {
  const { effects, status } = recommendation;
  const titre = context?.plannedTitle;

  if (status === STATUS.MEDICAL) {
    return 'Ne poursuis pas la séance et prends l’avis d’un professionnel de santé. '
      + 'Cette application constate ce que tu déclares, elle n’en identifie pas la cause.';
  }
  if (status === STATUS.RECOVER) {
    return 'Mobilité, marche, ou rien du tout : la séance d’aujourd’hui ne rapportera pas ce qu’elle coûte.';
  }
  if (status === STATUS.MOVE) {
    return titre
      ? `Déplace « ${titre} » sur un jour compatible plutôt que de la faire à moitié.`
      : 'Déplace la séance sur un jour compatible.';
  }
  if (status === STATUS.ADAPT) {
    const bits = [];
    if (effects.shorten && effects.targetMinutes) bits.push(`ramène-la à ${effects.targetMinutes} minutes`);
    if (effects.avoidAreas.length) {
      bits.push(`épargne ${effects.avoidAreas.map((id) => areaSpoken(id) || areaLabel(id)).filter(Boolean).join(', ')}`);
    }
    if (effects.removePlyo) bits.push('laisse la pliométrie de côté');
    return bits.length
      ? `Garde le travail qui reste disponible : ${bits.join(', ')}.`
      : 'Garde le travail compatible et remplace ce qui ne l’est pas.';
  }
  if (status === STATUS.SHORTEN) {
    return effects.targetMinutes
      ? `Conserve l’essentiel sur ${effects.targetMinutes} minutes : la mise en route, puis le bloc principal.`
      : 'Conserve l’essentiel : la mise en route, puis le bloc principal.';
  }
  if (status === STATUS.NO_SESSION) {
    return 'Tes réponses sont conservées : elles serviront à lire la tendance des prochains jours.';
  }
  return 'Fais-la comme elle est prévue.';
}

/**
 * L'explication complète.
 *
 * @returns {{title:string, opening:string, paragraph:string, bullets:string[], note:string}}
 */
export function explain(recommendation, { answers, context } = {}) {
  const opening = OPENINGS[recommendation.status] ?? '';
  // Les raisons qui ne font que constater que tout va bien n'ont pas à
  // encombrer un paragraphe qui annonce une adaptation.
  const informative = recommendation.reasons.filter((reason) => (
    recommendation.status === STATUS.KEEP || recommendation.status === STATUS.NO_SESSION
      ? true
      : ![RULE_CODES.TIME_ENOUGH, RULE_CODES.ALL_CLEAR].includes(reason.code)
  ));
  const observed = informative.map((reason) => reason.text);

  return {
    title: STATUS_LABELS[recommendation.status],
    opening,
    paragraph: [opening, observed[0], guidance(recommendation, context)].filter(Boolean).join(' '),
    bullets: observed,
    note: recommendation.dataNote,
    summary: answers ? summaryLines(answers) : [],
  };
}
