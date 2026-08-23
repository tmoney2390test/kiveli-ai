begin;
select plan(3);

select has_column('public','together_profiles','conversation_preferences','profiles have dedicated conversation preferences');
select is(
  (select column_default from information_schema.columns where table_schema='public' and table_name='together_profiles' and column_name='conversation_preferences'),
  '''{"responseStyle": "texting"}''::jsonb',
  'texting is the database default'
);
select col_not_null('public','together_profiles','conversation_preferences','conversation preferences are always present');

select * from finish();
rollback;
