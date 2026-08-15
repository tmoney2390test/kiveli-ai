begin;

-- World Pack 1 rows now exist. Re-run the canonical subscription access
-- trigger after world creation so existing paid users receive eligible worlds
-- while preserving independently unlocked/purchased world rows.
update public.together_entitlements
set tier = tier
where tier in ('kivelle_plus','kivelle_max','together_plus','unlimited');

commit;
