-- Backfill profiles and user_settings for existing Supabase Auth users
-- and make sure future signups create these records automatically.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      avatar_url = coalesce(nullif(public.profiles.avatar_url, ''), excluded.avatar_url),
      updated_at = now();

  insert into public.user_settings (user_id, theme, diet_preferences, notifications_enabled, expiry_warning_days, currency)
  values (new.id, 'light', '{}'::text[], true, 3, 'RUB')
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id, plan, status, trial_started_at, trial_ends_at)
  values (new.id, 'premium', 'trialing', now(), now() + interval '7 days')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'avatar_url', ''),
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    avatar_url = coalesce(nullif(public.profiles.avatar_url, ''), excluded.avatar_url),
    updated_at = now();

insert into public.user_settings (user_id, theme, diet_preferences, notifications_enabled, expiry_warning_days, currency, created_at, updated_at)
select
  u.id,
  'light',
  '{}'::text[],
  true,
  3,
  'RUB',
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (user_id) do nothing;

insert into public.subscriptions (user_id, plan, status, trial_started_at, trial_ends_at, created_at, updated_at)
select
  u.id,
  'premium',
  'trialing',
  coalesce(u.created_at, now()),
  coalesce(u.created_at, now()) + interval '7 days',
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (user_id) do nothing;
