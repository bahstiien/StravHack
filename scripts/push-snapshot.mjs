#!/usr/bin/env node
// public/coros-snapshot.json  ->  Supabase, table athlete_snapshots.
//
// L'app pousse déjà l'instantané depuis le navigateur, mais seulement quand
// elle n'en trouve aucun en base : un relevé plus frais resterait sur le disque.
// Ce script fait le même insert en ligne de commande, après un sync Coros.
//
//   npm run push:snapshot
//   npm run push:snapshot -- --in public/coros-snapshot.json --source coros
//
// L'authentification passe par l'environnement — jamais par un fichier, jamais
// par un argument de ligne de commande qui finirait dans l'historique du shell :
//
//   SUPABASE_EMAIL + SUPABASE_PASSWORD   connexion comme l'app ; la RLS
//                                        rattache la ligne à ton compte.
//   SUPABASE_SERVICE_ROLE_KEY            contourne la RLS ; exige alors
//                                        SUPABASE_USER_ID (l'uuid auth.users).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// .env.local porte l'URL et la clé publique du projet ; Vite le lit pour l'app,
// Node ne le lit pas tout seul.
function readEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8').split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const eq = line.indexOf('=');
        if (eq < 0) return null;
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')];
      })
      .filter(Boolean),
  );
}

const file = readEnvFile('.env.local');
const env = (key) => process.env[key] || file[key];

const url = env('VITE_SUPABASE_URL') || env('SUPABASE_URL');
const publishableKey = env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_ANON_KEY');
const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
const email = env('SUPABASE_EMAIL');
const password = env('SUPABASE_PASSWORD');

const fail = (message) => { console.error(message); process.exit(1); };

if (!url) fail('VITE_SUPABASE_URL absente : renseigne .env.local ou exporte la variable.');

const source = arg('source', 'coros');
const input = resolve(ROOT, arg('in', 'public/coros-snapshot.json'));
if (!existsSync(input)) fail(`Instantané introuvable : ${input}\nLance d'abord "npm run build:snapshot".`);

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(input, 'utf8'));
} catch (err) {
  fail(`${input} n'est pas un JSON valide : ${err.message}`);
}

const fetchedAt = snapshot?.meta?.fetchedAt ?? null;

async function authenticate() {
  if (serviceRoleKey) {
    const userId = env('SUPABASE_USER_ID');
    if (!userId) fail('SUPABASE_SERVICE_ROLE_KEY fournie sans SUPABASE_USER_ID : la clé de service ignore la RLS, il faut donc dire à quel compte la ligne appartient.');
    const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    return { client, userId, as: `service_role (user ${userId})` };
  }

  if (!publishableKey) fail('Clé publique absente : renseigne VITE_SUPABASE_PUBLISHABLE_KEY dans .env.local.');
  if (!email || !password) {
    fail([
      'Aucune authentification disponible.',
      '',
      'Exporte les identifiants de ton compte de l\'app :',
      '  $env:SUPABASE_EMAIL = "…"',
      '  $env:SUPABASE_PASSWORD = "…"',
      '',
      'ou, pour un compte de service : SUPABASE_SERVICE_ROLE_KEY + SUPABASE_USER_ID.',
    ].join('\n'));
  }

  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) fail(`Connexion refusée : ${error.message}`);
  return { client, userId: data.user.id, as: data.user.email };
}

const { client, userId, as } = await authenticate();

const { error } = await client.from('athlete_snapshots').insert({
  user_id: userId,
  source,
  payload: snapshot,
  source_fetched_at: fetchedAt,
});

// L'index unique (user_id, source, source_fetched_at) rend l'envoi rejouable :
// repousser le même relevé n'est pas une erreur, c'est un non-événement.
if (error?.code === '23505') {
  console.log(`Relevé du ${fetchedAt} déjà en base pour ${as} — rien à pousser.`);
} else if (error) {
  fail(`Échec de l'envoi : ${error.message}`);
} else {
  const counts = `${snapshot.activities?.length ?? 0} activités, ${snapshot.sessions?.length ?? 0} jours`;
  console.log(`${counts} — relevé du ${fetchedAt} poussé dans athlete_snapshots (source "${source}", compte ${as}).`);
}

await client.auth.signOut().catch(() => {});
