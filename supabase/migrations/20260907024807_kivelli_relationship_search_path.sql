-- This helper uses only built-in timezone/date operations.
alter function public.kivelle_relationship_local_date(timestamptz,text)
  set search_path = pg_catalog;
