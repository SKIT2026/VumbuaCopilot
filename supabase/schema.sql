-- VumbuaAI schema. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled venture',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_user_idx on public.sessions(user_id, updated_at desc);

alter table public.sessions enable row level security;

-- Each founder can only see and change their own sessions
drop policy if exists "own sessions select" on public.sessions;
drop policy if exists "own sessions insert" on public.sessions;
drop policy if exists "own sessions update" on public.sessions;
drop policy if exists "own sessions delete" on public.sessions;
create policy "own sessions select" on public.sessions for select using (auth.uid() = user_id);
create policy "own sessions insert" on public.sessions for insert with check (auth.uid() = user_id);
create policy "own sessions update" on public.sessions for update using (auth.uid() = user_id);
create policy "own sessions delete" on public.sessions for delete using (auth.uid() = user_id);
