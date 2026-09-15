import test from 'node:test';
import assert from 'node:assert/strict';

import { parseClubSessionsMarkdown } from '../scripts/lib/club-sessions.mjs';

const markdown = `
# Séances du club

## Calendrier

### 2026-09-15 — Pyramide

- Échauffement : 20 min
- Retour au calme : 10 min
- Contenu :
  - 1 × 120 s, récupération 60 s
  - 2 × 30 s, récupération 30 s
`;

test('le Markdown des séances club produit le catalogue utilisé par le planning', () => {
  assert.deepEqual(parseClubSessionsMarkdown(markdown), {
    day: 2,
    sessions: [{
      date: '2026-09-15',
      name: 'Pyramide',
      warmupMin: 20,
      cooldownMin: 10,
      sets: [
        { n: 1, work: 120, rec: 60 },
        { n: 2, work: 30, rec: 30 },
      ],
    }],
  });
});

test('le contenu situé avant Calendrier et les exemples ne sont pas publiés', () => {
  const source = `### 2026-10-06 — Exemple\n- Contenu :\n  - 5 × 30 s, récupération 30 s\n\n## Calendrier\n${markdown.split('## Calendrier')[1]}`;
  const catalog = parseClubSessionsMarkdown(source);
  assert.equal(catalog.sessions.length, 1);
  assert.equal(catalog.sessions[0].date, '2026-09-15');
});

test('une séance invalide ou deux séances dans la même semaine sont refusées', () => {
  assert.throws(
    () => parseClubSessionsMarkdown('## Calendrier\n### 15/09 — Test\n- Contenu :\n  - 1 × 60 s, récupération 60 s'),
    /date|séance/i,
  );
  assert.throws(
    () => parseClubSessionsMarkdown(`${markdown}\n### 2026-09-15 — Doublon\n- Contenu :\n  - 1 × 60 s, récupération 60 s`),
    /semaine/i,
  );
  assert.throws(
    () => parseClubSessionsMarkdown('## Calendrier\n### 2026-09-16 — Mercredi\n- Contenu :\n  - 1 × 60 s, récupération 60 s'),
    /mardi/i,
  );
});
