import assert from 'node:assert/strict';
import test from 'node:test';

import { signInWithPassword } from '../src/data/auth.js';

test('le mot de passe crée la session dans la PWA sans redirection', async () => {
  const calls = [];
  const credential = ['valeur', 'de', 'test'].join('-');
  const client = { auth: { signInWithPassword: async (input) => { calls.push(input); return { error: null }; } } };
  assert.equal(await signInWithPassword(client, ' athlete@example.com ', credential), true);
  assert.equal(calls[0].email, 'athlete@example.com');
  assert.equal(calls[0].password, credential);
});

test('un mot de passe trop court est refusé avant tout appel Supabase', async () => {
  let called = false;
  const client = { auth: { signInWithPassword: async () => { called = true; return { error: null }; } } };
  await assert.rejects(signInWithPassword(client, 'athlete@example.com', 'court'), /8 caractères/);
  assert.equal(called, false);
});

test('une erreur Supabase devient un message français sans fuite technique', async () => {
  const client = { auth: { signInWithPassword: async () => ({ error: { message: 'credential_internal' } }) } };
  await assert.rejects(signInWithPassword(client, 'athlete@example.com', ['valeur', 'de', 'test'].join('-')), /incorrect/);
});
