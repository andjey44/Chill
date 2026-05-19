-- Chill server-side rate limits
-- Used by Supabase Edge Function anti-spam-check.

create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  action text not null,
  window_start timestamptz not null default now(),
  attempts integer not null default 1,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(actor_key, action)
);

alter table public.rate_limits enable row level security;

-- No anon/authenticated policies on purpose.
-- The browser must not read or edit rate-limit counters directly.
-- This table is used only by the Edge Function with the service role.

drop trigger if exists set_rate_limits_updated_at on public.rate_limits;
create trigger set_rate_limits_updated_at
before update on public.rate_limits
for each row execute function public.set_updated_at();

create index if not exists idx_rate_limits_actor_action on public.rate_limits(actor_key, action);
create index if not exists idx_rate_limits_blocked_until on public.rate_limits(blocked_until);
