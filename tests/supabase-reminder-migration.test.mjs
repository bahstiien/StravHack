import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260915143000_allow_reminder_preferences.sql', import.meta.url);

test('reminder preferences migration keeps the constrained document type allow-list', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const expectedTypes = [
    'goals', 'equipment', 'planning_decisions', 'planning_availability',
    'planning_exceptions', 'planning_drafts', 'guided_run', 'workout_history',
    'checkin_history', 'checkin_draft', 'workout_feedback', 'training_load_level',
    'reminder_preferences',
  ];

  assert.match(sql, /drop constraint if exists user_documents_document_type_check/i);
  assert.match(sql, /add constraint user_documents_document_type_check check/i);
  for (const documentType of expectedTypes) {
    assert.match(sql, new RegExp(`'${documentType}'`, 'i'), `${documentType} absent de la liste autorisée`);
  }
});

test('reminder preferences rely on the existing per-user RLS policies', async () => {
  const baselineUrl = new URL('../supabase/migrations/20260914193640_externalize_storage.sql', import.meta.url);
  const baseline = await readFile(baselineUrl, 'utf8');

  assert.match(baseline, /alter table public\.user_documents force row level security/i);
  assert.match(baseline, /for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(baseline, /for insert to authenticated with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(baseline, /for update to authenticated[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(baseline, /revoke all on public\.user_documents from anon/i);
});
