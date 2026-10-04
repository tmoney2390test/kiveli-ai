-- Quiet time at home can be a real activity when it is the only authored
-- description. Previous backfill removed it only when a more specific
-- alternative existed; keep that distinction for later writes.
create or replace function public.kivelle_schedule_variant_is_filler(p_value text)
returns boolean language sql immutable set search_path='' as $$
  select trim(coalesce(p_value,'')) ~* '^(making time for a familiar routine|following the day''s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|staying focused on today''s work|taking care of the day''s responsibilities|getting some uninterrupted rest at home|keeping things quiet and getting some sleep)[.!]?$';
$$;
revoke all on function public.kivelle_schedule_variant_is_filler(text) from public, anon, authenticated;
