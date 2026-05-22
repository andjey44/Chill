-- Drop unused default/test table.
-- This table is not used by Chill frontend, Supabase sync, recipes, analytics, auth, subscriptions, or rate limits.

drop table if exists public."Table";
