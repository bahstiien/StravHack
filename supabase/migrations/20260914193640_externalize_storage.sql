create table public.user_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in (
    'goals', 'equipment', 'planning_decisions', 'planning_availability',
    'planning_exceptions', 'planning_drafts', 'guided_run', 'workout_history',
    'checkin_history', 'checkin_draft'
  )),
  payload jsonb not null,
  schema_version integer not null default 1 check (schema_version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, document_type)
);

create table public.athlete_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('coros', 'strava', 'combined', 'legacy')),
  payload jsonb not null,
  source_fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index athlete_snapshots_one_source_version
  on public.athlete_snapshots (user_id, source, coalesce(source_fetched_at, created_at));
create index athlete_snapshots_latest
  on public.athlete_snapshots (user_id, created_at desc);

create table public.shared_catalogs (
  catalog_type text primary key check (catalog_type in ('club_sessions', 'ppg_library')),
  payload jsonb not null,
  schema_version integer not null default 1 check (schema_version > 0),
  updated_at timestamptz not null default now()
);

alter table public.user_documents enable row level security;
alter table public.user_documents force row level security;
alter table public.athlete_snapshots enable row level security;
alter table public.athlete_snapshots force row level security;
alter table public.shared_catalogs enable row level security;
alter table public.shared_catalogs force row level security;

create policy "Users read their documents" on public.user_documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their documents" on public.user_documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their documents" on public.user_documents
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their documents" on public.user_documents
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read their snapshots" on public.athlete_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their snapshots" on public.athlete_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete their snapshots" on public.athlete_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_documents from anon;
revoke all on public.athlete_snapshots from anon;
revoke all on public.shared_catalogs from anon;
revoke all on public.user_documents from authenticated;
revoke all on public.athlete_snapshots from authenticated;
revoke all on public.shared_catalogs from authenticated;

create policy "Authenticated users read catalogs" on public.shared_catalogs
  for select to authenticated using (true);

grant select, insert, update, delete on public.user_documents to authenticated;
grant select, insert, delete on public.athlete_snapshots to authenticated;
grant usage, select on sequence public.athlete_snapshots_id_seq to authenticated;
grant select on public.shared_catalogs to authenticated;
