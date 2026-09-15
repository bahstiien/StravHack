const DATE = /^###\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(.+?)\s*$/;
const EFFORT = /^\s*-\s+(\d+)\s*[×x]\s*(\d+)\s*s,\s*récupération\s+(\d+)\s*s\s*$/i;
const WARMUP = /^\s*-\s*Échauffement\s*:\s*(\d+)\s*min\s*$/i;
const COOLDOWN = /^\s*-\s*Retour au calme\s*:\s*(\d+)\s*min\s*$/i;
const CLUB_DAY = 2;

function mondayOf(dateIso) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== dateIso) throw new Error(`Date de séance invalide : ${dateIso}`);
  if (date.getUTCDay() !== CLUB_DAY) throw new Error(`La séance du ${dateIso} ne tombe pas un mardi.`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function finish(session) {
  if (!session) return null;
  if (!session.sets.length) throw new Error(`La séance du ${session.date} ne contient aucun effort.`);
  return {
    date: session.date,
    name: session.name,
    warmupMin: session.warmupMin,
    cooldownMin: session.cooldownMin,
    sets: session.sets.map((set) => ({ ...set })),
  };
}

export function parseClubSessionsMarkdown(markdown) {
  const calendar = String(markdown).split(/^## Calendrier\s*$/m)[1];
  if (!calendar) throw new Error('Section « Calendrier » introuvable dans le Markdown des séances club.');

  const sessions = [];
  let current = null;
  for (const line of calendar.split(/\r?\n/)) {
    const heading = line.match(DATE);
    if (heading) {
      const completed = finish(current);
      if (completed) sessions.push(completed);
      current = { date: heading[1], name: heading[2], warmupMin: 20, cooldownMin: 10, sets: [] };
      continue;
    }
    if (/^###\s+/.test(line)) throw new Error(`Titre de séance invalide : ${line.trim()}`);
    if (!current) continue;
    const warmup = line.match(WARMUP);
    const cooldown = line.match(COOLDOWN);
    const effort = line.match(EFFORT);
    if (warmup) current = { ...current, warmupMin: Number(warmup[1]) };
    if (cooldown) current = { ...current, cooldownMin: Number(cooldown[1]) };
    if (effort) current = {
      ...current,
      sets: [...current.sets, { n: Number(effort[1]), work: Number(effort[2]), rec: Number(effort[3]) }],
    };
  }
  const completed = finish(current);
  if (completed) sessions.push(completed);
  if (!sessions.length) throw new Error('Aucune séance valide dans la section « Calendrier ».');

  const weeks = new Set();
  for (const session of sessions) {
    const week = mondayOf(session.date);
    if (weeks.has(week)) throw new Error(`Plusieurs séances club sont définies pour la semaine du ${week}.`);
    weeks.add(week);
  }

  return { day: CLUB_DAY, sessions: sessions.map((session) => ({ ...session, sets: session.sets.map((set) => ({ ...set })) })) };
}
