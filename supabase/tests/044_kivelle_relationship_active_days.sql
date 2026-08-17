begin;
select plan(10);

select has_column(
  'public','together_relationship_states','days_known',
  'Relationship state owns the canonical days-known count'
);

select has_column(
  'public','together_relationship_states','last_spoken_local_date',
  'Relationship state records the last local conversation date'
);

select col_default_is(
  'public','together_relationship_states','days_known','1',
  'New and reset relationships start on day one'
);

select has_table(
  'public','together_relationship_active_days',
  'Distinct relationship days have an auditable canonical ledger'
);

select col_is_pk(
  'public','together_relationship_active_days','id',
  'Relationship active-day records have stable identities'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.together_relationship_active_days'::regclass
      and contype='u'
      and pg_get_constraintdef(oid) like '%(character_instance_id, local_date)%'
  ),
  'A character can count a local calendar day only once'
);

select has_trigger(
  'public','together_relationship_states','together_relationship_seed_active_day',
  'Creating or resetting a relationship seeds day one'
);

select has_trigger(
  'public','together_messages','together_messages_record_relationship_day',
  'User messages record distinct interaction days'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.together_relationship_active_days'::regclass),
  'Relationship active days use RLS'
);

select is(
  (select count(*) from public.together_relationship_states relationship where relationship.days_known<1),
  0::bigint,
  'No relationship can expose a day below one'
);

select * from finish();
rollback;
