#!/usr/bin/env node
// data/coros-raw.json + data/strava-raw.json  ->  public/coros-snapshot.json
//
// Ligne de commande sur server/localSnapshot.js ; le bouton SYNCHRONISER de
// l'app appelle exactement le même code par POST /api/sync.
//
//   npm run build:snapshot

import { writeLocalSnapshot, buildLocalSnapshot } from '../server/localSnapshot.js';

const fmtPace = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km` : '—');

try {
  const r = writeLocalSnapshot();
  const { snapshot } = r;
  console.log(`${r.activityCount} activités, ${r.sessionCount} jours → ${r.path}`);
  console.log(`FC repos ${snapshot.athlete.hrRest} · FC max ${snapshot.athlete.hrMax} · VO2max ${snapshot.athlete.vo2max} · seuil ${fmtPace(snapshot.athlete.thresholdPaceSecPerKm)}`);
  for (const a of snapshot.activities.filter((x) => x.intervals.length)) {
    console.log(`  ${a.date}  ${a.title} — ${a.intervals.length} reps`);
  }
} catch (err) {
  console.error(`Échec : ${err.message}`);
  process.exitCode = 1;
}
