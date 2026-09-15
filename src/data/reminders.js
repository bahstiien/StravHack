const DAY = 86400000;
const PRIORITY = { urgent: 3, high: 2, normal: 1, low: 0 };
const QUIET_DAY_IDS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const atLocalTime = (date, time = '00:00') => {
  const [year, month, day] = String(date).slice(0, 10).split('-').map(Number);
  const [hour, minute] = String(time).split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0);
};
const expires = (date, days = 1) => new Date(atLocalTime(date).getTime() + days * DAY).toISOString();
const reminder = (type, subject, values) => ({ type, dedupeKey: `${type}:${subject}`, ...values });

export function isQuietDay(date, quietDays = []) {
  const day = date.getDay();
  return quietDays.some((value) => Number(value) === day || String(value).toLowerCase() === QUIET_DAY_IDS[day]);
}

export function deduplicateReminders(reminders, now = new Date()) {
  const active = (reminders || []).filter((item) => !item.expiresAt || new Date(item.expiresAt) > now);
  const byKey = active.reduce((result, item) => {
    const old = result[item.dedupeKey];
    if (!old || (PRIORITY[item.priority] || 0) > (PRIORITY[old.priority] || 0)) return { ...result, [item.dedupeKey]: item };
    return result;
  }, {});
  return Object.values(byKey).sort((a, b) => (PRIORITY[b.priority] || 0) - (PRIORITY[a.priority] || 0));
}

export function generateReminders({
  now = new Date(), settings = {}, sessions = [], checkins = [], conflicts = [], feedback = [],
  load = [], plan = sessions, goals = [], planningChanges = [],
} = {}) {
  if (settings.enabled === false || isQuietDay(now, settings.quietDays)) return [];
  const today = isoDate(now);
  const items = [];
  const add = (type, subject, values) => items.push(reminder(type, subject, values));

  for (const session of sessions) {
    if (!session.planned || session.done) continue;
    if (session.date === today) {
      const start = atLocalTime(session.date, session.startTime || settings.preferredTime || '18:00');
      // Les anciens réglages utilisaient workoutLeadMinutes. Le contrat
      // synchronisé utilise désormais beforeSessionMinutes et a priorité.
      const lead = Number(settings.beforeSessionMinutes ?? settings.workoutLeadMinutes ?? 120) * 60000;
      if (now >= new Date(start.getTime() - lead) && now <= start) add('upcoming-workout', session.id, { reason: 'Une séance est prévue prochainement.', action: 'Consulter et préparer la séance.', href: '/planning/semaine', priority: 'normal', expiresAt: new Date(start.getTime() + 2 * 3600000).toISOString() });
    } else if (session.date < today && atLocalTime(session.date).getTime() >= now.getTime() - 2 * DAY) {
      add('missed-workout', session.id, { reason: 'La séance planifiée n’a pas été réalisée.', action: 'Confirmer, déplacer ou refuser la séance.', href: '/planning/carnet', priority: 'high', expiresAt: expires(today, 1) });
    }
  }
  if (settings.dailyCheckin !== false && !checkins.some((item) => item.date === today)) add('daily-checkin', today, { reason: 'Le questionnaire quotidien n’est pas rempli.', action: 'Renseigner votre état du jour.', href: '/checkin', priority: 'normal', expiresAt: expires(today, 1) });
  if (settings.planningAlerts !== false) {
    for (const conflict of conflicts.filter((item) => item.date === today || item.date > today)) add('planning-conflict', conflict.id || conflict.code, { reason: conflict.message || 'Une disponibilité entre en conflit avec le planning.', action: 'Vérifier le conflit et adapter la séance.', href: '/planning/semaine', priority: 'high', expiresAt: expires(conflict.date || today, 2) });
    for (const change of planningChanges.filter((item) => item.important)) add('planning-change', change.id, { reason: change.reason || 'Le planning a changé de façon importante.', action: 'Consulter les changements.', href: '/planning/semaine', priority: 'high', expiresAt: expires(today, 2) });
  }
  if (settings.recoveryAlerts !== false) {
    const painful = feedback.filter((item) => Number(item.pain) >= 4).sort((a, b) => b.date.localeCompare(a.date));
    if (painful.length >= 2) add('persistent-pain', painful[0].sessionId || 'pain', { reason: 'Une douleur significative persiste sur plusieurs retours.', action: 'Réduire la charge et réévaluer la douleur.', href: '/planning/carnet', priority: 'urgent', expiresAt: expires(today, 2) });
    if (Number(load?.[0]?.ratio) >= 1.1) add('insufficient-recovery', today, { reason: 'La charge récente indique une récupération insuffisante.', action: 'Consulter l’analyse avant de vous entraîner.', href: '/analyse', priority: 'urgent', expiresAt: expires(today, 1) });
  }
  // goalAlerts reste lu pour les préférences locales créées avant la
  // synchronisation Supabase.
  if ((settings.goalReminders ?? settings.goalAlerts) !== false) {
    const horizon = new Date(now.getTime() + 14 * DAY);
    const block = plan.find((item) => item.weekendBlock && atLocalTime(item.date) >= now && atLocalTime(item.date) <= horizon);
    if (block) add('mountain-weekend', block.blockId || block.id, { reason: 'Un week-end bloc montagne approche.', action: 'Préparer matériel, parcours et ravitaillement.', href: '/planning/mois', priority: 'normal', expiresAt: expires(block.date, 1) });
    const taper = plan.find((item) => item.phase === 'affûtage' && atLocalTime(item.date) >= now && atLocalTime(item.date) <= horizon);
    if (taper) add('taper-start', taper.date, { reason: 'La phase d’affûtage commence bientôt.', action: 'Consulter la baisse de charge prévue.', href: '/planning/projection', priority: 'normal', expiresAt: expires(taper.date, 7) });
    for (const goal of goals.filter((item) => item.date >= today && atLocalTime(item.date) <= horizon)) add('goal-approaching', goal.id, { reason: `${goal.name || 'Votre objectif'} approche.`, action: 'Vérifier la projection et la préparation.', href: '/planning/projection', priority: goal.priority === 'A' ? 'high' : 'normal', expiresAt: expires(goal.date, 1) });
  }
  return deduplicateReminders(items, now);
}
