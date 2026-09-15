// Le commentaire de séance.
//
// Quatre entrées, dans cet ordre de priorité — c'est l'ordre dans lequel un
// entraîneur regarde une séance :
//
//   1. le contexte    ce que tu avais dans les jambes en arrivant (charge des
//                     jours précédents, ratio aigu/chronique, FC de repos)
//   2. le contenu     ce que la séance était censée être (structure des tours)
//   3. l'exécution    ce qu'elle a réellement été (tenue des reps, dérive, FC)
//   4. la suite       ce qu'on change au plan à cause de ce qui précède
//
// Tout est calculé à partir des faits du snapshot. Rien n'est écrit d'avance :
// si les chiffres changent, le commentaire change.

const DAY = 86400000;

function parse(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const fmtPace = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km` : '—');
const pct = (n) => `${n > 0 ? '+' : ''}${String(n).replace('.', ',')} %`;

/* ── 1. Contexte ──────────────────────────────────────────────────────────── */

/**
 * Charge cumulée sur les N jours qui précèdent une date (la date exclue).
 * C'est « ce que tu avais dans les jambes en arrivant ».
 */
export function loadBefore(sessions, date, days = 3) {
  const at = parse(date).getTime();
  return (sessions || [])
    .filter((s) => {
      const t = parse(s.date).getTime();
      return t < at && t >= at - days * DAY;
    })
    .reduce((a, s) => a + (s.load || 0), 0);
}

/** Jours pleins écoulés depuis la dernière séance avec de la charge. */
export function daysSinceLastLoad(sessions, date) {
  const at = parse(date).getTime();
  const prev = (sessions || [])
    .filter((s) => s.load > 0 && parse(s.date).getTime() < at)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prev) return null;
  return Math.round((at - parse(prev.date).getTime()) / DAY);
}

/** Le relevé Coros (ratio aigu/chronique) du jour de la séance. */
export function loadStateOn(loadHistory, date) {
  const key = String(date).slice(0, 10);
  return (loadHistory || []).find((l) => l.date === key) || null;
}

/* ── 2 & 3. Contenu et exécution ──────────────────────────────────────────── */

/**
 * Sépare travail et récupération sur le plus grand écart d'allure.
 *
 * La médiane ne suffit pas : sur 10 reps + échauffement + récups + retour au
 * calme, elle tombe au milieu du groupe lent et ramasse le retour au calme avec
 * les répétitions. Les allures d'une séance à intervalles forment deux paquets
 * nettement séparés — on coupe donc au plus grand trou entre deux allures
 * consécutives, ce qui trouve la frontière quelle que soit la séance.
 */
function splitOnGap(usable) {
  const paces = usable.map((l) => l.paceSecPerKm).sort((a, b) => a - b);
  let gap = 0;
  let cut = paces[0];
  for (let i = 0; i < paces.length - 1; i++) {
    const g = paces[i + 1] - paces[i];
    if (g > gap) { gap = g; cut = paces[i]; }
  }
  // Deux paquets trop proches : ce n'est pas une séance à intervalles.
  // 25″/km sépare une pyramide 1-2-3 km (dont les blocs n'ont ni la même
  // longueur ni la même allure) d'un footing régulier, sans retenir ce dernier.
  if (gap < 25) return null;

  const reps = usable.filter((l) => l.paceSecPerKm <= cut);
  const recoveries = usable.filter((l) => l.paceSecPerKm > cut);
  // Moins de trois blocs rapides : une fin de footing enlevée, pas une séance.
  if (reps.length < 3) return null;
  return { reps, recoveries };
}

export function splitLaps(laps) {
  // L'index d'origine est conservé : c'est lui qui distingue une récupération
  // (entre deux répétitions) d'un échauffement ou d'un retour au calme, qui
  // sont lents pour de tout autres raisons.
  const usable = (laps || [])
    .map((l, i) => ({ ...l, _i: i }))
    .filter((l) => l.paceSecPerKm > 0 && l.timeSec >= 45);
  if (usable.length < 4) return { reps: [], recoveries: [] };
  return splitOnGap(usable) || { reps: [], recoveries: [] };
}

/** Tenue des répétitions : dérive d'allure entre le premier et le dernier tiers. */
export function repFade(reps) {
  if (reps.length < 3) return null;
  const third = Math.max(1, Math.floor(reps.length / 3));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const start = avg(reps.slice(0, third).map((r) => r.paceSecPerKm));
  const end = avg(reps.slice(-third).map((r) => r.paceSecPerKm));
  if (!start) return null;
  return {
    pctSlower: Math.round(((end - start) / start) * 1000) / 10,
    secSlower: Math.round(end - start),
    firstPace: Math.round(start),
    lastPace: Math.round(end),
  };
}

/** Montée de FC entre les premières et les dernières reps, à allure égale. */
export function hrDrift(reps) {
  const withHr = reps.filter((r) => r.avgHr > 0);
  if (withHr.length < 3) return null;
  const third = Math.max(1, Math.floor(withHr.length / 3));
  const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  return avg(withHr.slice(-third).map((r) => r.avgHr)) - avg(withHr.slice(0, third).map((r) => r.avgHr));
}

/* ── Le commentaire ───────────────────────────────────────────────────────── */

/**
 * @param {object} session   la séance du snapshot
 * @param {object} ctx       { sessions, activities, load, restingHr, fitness }
 * @returns {{context:string, execution:string, next:string, flag:'ok'|'watch'|'alert'}|null}
 */
export function commentSession(session, ctx) {
  if (!session || session.type === 'REPOS') return commentRest(session, ctx);

  const activity = ctx.activities?.find((a) => a.id === session.activityId);
  const laps = ctx.laps?.[session.corosId] || [];
  const { reps, recoveries } = splitLaps(laps);
  const fade = repFade(reps);
  const drift = hrDrift(reps);

  const before = loadBefore(ctx.sessions, session.date, 3);
  const gap = daysSinceLastLoad(ctx.sessions, session.date);
  const state = loadStateOn(ctx.load, session.date);
  const rhr = restingHrContext(ctx.restingHr, session.date);

  return {
    context: contextLine({ before, gap, state, rhr, session }),
    execution: executionLine({ session, activity, reps, recoveries, fade, drift, ctx }),
    next: nextLine({ session, fade, drift, state, reps, ctx, contDrift: activity?.driftPct }),
    flag: flagFor({ fade, drift, state, rhr, contDrift: activity?.driftPct }),
  };
}

function commentRest(session, ctx) {
  if (!session) return null;
  const before = loadBefore(ctx.sessions, session.date, 3);
  const gap = daysSinceLastLoad(ctx.sessions, session.date);
  const state = loadStateOn(ctx.load, session.date);

  if (before >= 250) {
    return {
      context: `${before} de charge sur les trois jours précédents.`,
      execution: 'Repos — au bon endroit.',
      next: 'Prochaine séance de qualité seulement si la FC de repos est revenue à la normale.',
      flag: 'ok',
    };
  }
  if (gap != null && gap >= 3) {
    return {
      context: `${gap} jours sans charge.`,
      execution: 'Repos — mais ça commence à faire long.',
      next: state && state.ratio < 0.6
        ? `Ratio de charge à ${state.ratio.toFixed(2)} : tu perds du terrain. Remets une séance.`
        : 'Reprends par du footing, pas par de l’intensité.',
      flag: gap >= 5 ? 'watch' : 'ok',
    };
  }
  return {
    context: before ? `${before} de charge sur trois jours.` : 'Semaine calme.',
    execution: 'Repos.',
    next: 'Rien à adapter.',
    flag: 'ok',
  };
}

function contextLine({ before, gap, state, rhr, session }) {
  const bits = [];

  if (gap === 1) bits.push('Au lendemain de la veille');
  else if (gap != null && gap >= 4) bits.push(`Après ${gap} jours sans courir`);
  else if (before >= 250) bits.push(`Sur ${before} de charge en trois jours`);
  else if (before > 0) bits.push(`${before} de charge dans les jambes`);

  if (state) {
    const r = state.ratio.toFixed(2).replace('.', ',');
    if (state.ratio >= 0.95) bits.push(`ratio aigu/chronique à ${r} — tu es au plafond`);
    else if (state.ratio <= 0.5) bits.push(`ratio à ${r} — tu es frais, peut-être trop`);
    else bits.push(`ratio à ${r}`);
  }

  if (rhr?.elevated) {
    bits.push(`FC de repos à ${rhr.value} contre ${rhr.baseline} de moyenne`);
  }

  return bits.length ? `${bits.join(', ')}.` : 'Pas de contexte de charge pour cette date.';
}

function executionLine({ session, activity, reps, recoveries, fade, drift, ctx }) {
  // Séance à intervalles : le sujet, c'est la tenue des reps.
  if (reps.length >= 3 && fade) {
    const structure = describeStructure(reps, recoveries);
    const held = fade.pctSlower <= 1.5;
    const slipped = fade.pctSlower >= 4;

    const core = held
      ? `${structure} tenus du début à la fin (${fmtPace(fade.firstPace)} → ${fmtPace(fade.lastPace)}).`
      : slipped
        ? `${structure}, mais ${fade.secSlower}″/km perdues entre le début et la fin (${fmtPace(fade.firstPace)} → ${fmtPace(fade.lastPace)}).`
        : `${structure}, ${fade.secSlower}″/km d'écart entre les premières et les dernières (${fmtPace(fade.firstPace)} → ${fmtPace(fade.lastPace)}).`;

    if (drift != null && drift >= 12 && !slipped) {
      return `${core} L'allure a tenu mais la FC a pris ${drift} battements : c'est le cœur qui a payé, pas les jambes.`;
    }
    if (drift != null && drift >= 12) {
      return `${core} Et ${drift} battements de plus sur les dernières : tu as payé sur les deux tableaux.`;
    }
    if (held && drift != null && drift <= 6) {
      return `${core} FC quasi stable (+${drift}) : la séance était à ta main.`;
    }
    return core;
  }

  // Séance continue : le sujet, c'est la dérive cardiaque.
  const d = activity?.driftPct;
  const thr = ctx.fitness?.thresholdPaceSecPerKm;
  const pace = session.durationSec && session.distanceM
    ? Math.round(session.durationSec / (session.distanceM / 1000))
    : activity?.paceSecPerKm;

  const hard = thr && pace && pace < thr + 25;
  const bits = [];
  if (pace) bits.push(`Continue à ${fmtPace(pace)}`);
  if (hard) bits.push('soit au-dessus de ton allure seuil sur toute la durée');
  if (d != null) bits.push(`dérive cardiaque ${pct(d)}`);

  if (!bits.length) return 'Pas de détail de tours transmis par la montre pour cette séance.';
  let line = `${bits.join(', ')}.`;
  if (d != null && d >= 8) line += ' Tu as fini bien plus cher que tu n’as commencé.';
  else if (d != null && d <= 3) line += ' Bien tenue.';
  return line;
}

/** 2′ plutôt que 120″ dès que la durée est ronde en minutes. */
function blockLabel(sec) {
  const s = Math.round(sec);
  if (s >= 60 && s % 60 <= 5) return `${Math.round(s / 60)}′`;
  if (s >= 90) return `${Math.floor(s / 60)}′${String(s % 60).padStart(2, '0')}`;
  return `${s}″`;
}

const median = (nums) => {
  const a = [...nums].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

function describeStructure(reps, recoveries) {
  const n = reps.length;
  const dur = median(reps.map((r) => r.timeSec));
  const dists = reps.map((r) => r.distanceM);
  const varied = Math.max(...dists) - Math.min(...dists) > median(dists) * 0.4;

  // Seules les récupérations *entre* deux répétitions comptent — l'échauffement
  // et le retour au calme sont aussi des tours lents, et les inclure donnait
  // des « récup 18′ » sur une séance qui récupère 5 minutes.
  const first = Math.min(...reps.map((r) => r._i));
  const last = Math.max(...reps.map((r) => r._i));
  const between = recoveries.filter((r) => r._i > first && r._i < last);
  const rec = between.length ? ` / ${blockLabel(median(between.map((r) => r.timeSec)))}` : '';

  if (varied) return `${n} blocs de longueurs différentes`;
  return `${n} × ${blockLabel(dur)}${rec}`;
}

/**
 * L'adaptation du plan.
 *
 * C'est la partie qui compte : un commentaire qui constate sans rien changer ne
 * sert à rien. Chaque cas dit quoi faire de la *prochaine* séance de qualité.
 */
function nextLine({ session, fade, drift, state, reps, ctx, contDrift }) {
  const ratio = state?.ratio;

  if (fade && fade.pctSlower >= 6) {
    return `Le volume de la séance est au-dessus de ce que tu tiens aujourd'hui. Prochaine fois : même allure de départ, deux répétitions de moins — mieux vaut 8 tenues que 10 qui s'effondrent.`;
  }
  if (fade && fade.pctSlower >= 3) {
    return `Départ trop rapide de ${fade.secSlower}″. Prochaine fois : pars à ${fmtPace(fade.lastPace)} et garde ${fmtPace(fade.firstPace)} pour les deux dernières.`;
  }
  if (fade && fade.pctSlower <= 1 && reps.length >= 3) {
    const target = Math.max(1, fade.firstPace - 4);
    return `Séance trop confortable pour progresser : tu l'as finie comme tu l'as commencée. Prochaine fois, une répétition de plus ou ${fmtPace(target)} sur les reps.`;
  }
  if (drift != null && drift >= 12) {
    return `FC qui monte sans que l'allure bouge : c'est de la fatigue, pas un manque de forme. Allège la prochaine séance de qualité de 48 h.`;
  }
  // Séance continue : la dérive cardiaque est le seul signal d'exécution.
  if (!reps.length && contDrift != null && contDrift >= 8) {
    return `Dérive à ${pct(contDrift)} sur une séance continue : tu es parti au-dessus de ce que tu pouvais tenir. Même parcours 15″/km plus lentement la prochaine fois.`;
  }
  if (!reps.length && contDrift != null && contDrift <= 3 && session.durationSec >= 3000) {
    return `Dérive contenue sur ${Math.round(session.durationSec / 60)}′ : l'endurance de base est là. Tu peux allonger la prochaine sortie.`;
  }
  if (ratio != null && ratio >= 0.95) {
    return `Ratio de charge à ${ratio.toFixed(2).replace('.', ',')} : tu es à la limite haute. La prochaine séance dure, pas intense.`;
  }
  if (ratio != null && ratio <= 0.5) {
    return `Ratio à ${ratio.toFixed(2).replace('.', ',')} : tu as de la marge. Tu peux charger la prochaine séance de qualité sans risque.`;
  }
  if (session.type === 'PPG') {
    return 'PPG bien placée. Garde-la à 48 h d’une séance de qualité.';
  }
  return 'Rien à changer au plan.';
}

function restingHrContext(history, date) {
  if (!history?.length) return null;
  const key = String(date).slice(0, 10);
  const idx = history.findIndex((h) => h.date === key);
  if (idx < 0) return null;

  // Référence : les 14 jours antérieurs disponibles.
  const past = history.slice(idx + 1, idx + 15).map((h) => h.bpm).filter(Boolean);
  if (past.length < 5) return null;
  const baseline = Math.round(past.reduce((a, b) => a + b, 0) / past.length);
  const value = history[idx].bpm;
  return { value, baseline, elevated: value - baseline >= 4 };
}

function flagFor({ fade, drift, state, rhr, contDrift }) {
  if (fade && fade.pctSlower >= 6) return 'alert';
  if (drift != null && drift >= 14) return 'alert';
  if (rhr?.elevated) return 'alert';
  if (contDrift != null && contDrift >= 8) return 'watch';
  if (fade && fade.pctSlower >= 3) return 'watch';
  if (state && state.ratio >= 0.95) return 'watch';
  return 'ok';
}

/** Le mot de la semaine, à partir des commentaires de ses séances. */
export function commentWeek(days, ctx) {
  const sessions = days.map((d) => d.session).filter((s) => s.load > 0);
  if (!sessions.length) return 'Aucune séance enregistrée sur cette semaine.';

  const total = sessions.reduce((a, s) => a + s.load, 0);
  // Une séance planifiée n'a pas de tours à analyser : son intensité est
  // déclarée par le plan. Une séance passée se juge sur ce qu'elle contenait.
  const quality = sessions.filter((s) => (s.planned
    ? s.intensity === 'quality'
    : splitLaps(ctx.laps?.[s.corosId] || []).reps.length >= 3)).length;
  const planned = sessions.every((s) => s.planned);

  const last = days.at(-1)?.session?.date;
  const state = loadStateOn(ctx.load, last);
  const ratio = state ? state.ratio.toFixed(2).replace('.', ',') : null;

  if (planned) {
    return quality >= 2
      ? `${sessions.length} séances prévues pour ${total} de charge, dont ${quality} de qualité. Le club plus une : c'est le plafond avant de tomber sur les jambes.`
      : `${sessions.length} séances prévues pour ${total} de charge. Une seule intensité — le club — et tout le reste en aérobie.`;
  }
  if (quality >= 2) {
    return `${sessions.length} séances, ${total} de charge, dont ${quality} de qualité${ratio ? ` — ratio à ${ratio} en fin de semaine` : ''}. C'est le maximum tenable sans troisième jour de repos.`;
  }
  if (quality === 1) {
    return `${sessions.length} séances pour ${total} de charge, une seule de qualité${ratio ? `, ratio à ${ratio}` : ''}. La marge est là pour en ajouter une deuxième.`;
  }
  return `${sessions.length} séances, ${total} de charge, aucune intensité${ratio ? ` — ratio à ${ratio}` : ''}. Semaine d'entretien, pas de progression.`;
}
