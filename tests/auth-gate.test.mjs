import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyEmailCode } from '../src/data/auth.js';

test('le code e-mail crée la session dans le contexte courant', async () => {
  const calls = [];
  const client = { auth: { verifyOtp: async (input) => { calls.push(input); return { error: null }; } } };
  assert.equal(await verifyEmailCode(client, ' athlete@example.com ', '12 34 56'), true);
  assert.deepEqual(calls, [{ email: 'athlete@example.com', token: '123456', type: 'email' }]);
});

test('un code incorrect est refusé avant tout appel Supabase', async () => {
  let called = false;
  const client = { auth: { verifyOtp: async () => { called = true; return { error: null }; } } };
  await assert.rejects(verifyEmailCode(client, 'athlete@example.com', '123'), /6 chiffres/);
  assert.equal(called, false);
});

test('une erreur Supabase devient un message français sans fuite technique', async () => {
  const client = { auth: { verifyOtp: async () => ({ error: { message: 'token_expired_internal' } }) } };
  await assert.rejects(verifyEmailCode(client, 'athlete@example.com', '123456'), /invalide ou expiré/);
});
