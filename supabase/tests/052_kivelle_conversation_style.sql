begin;
select plan(3);

select has_column('public','together_profiles','conversation_preferences','profiles have dedicated conversation preferences');
select col_default_is('public','together_profiles','conversation_preferences','''{"responseStyle": "texting"}''::jsonb','texting is the database default');
select col_not_null('public','together_profiles','conversation_preferences','conversation preferences are always present');

select * from finish();
rollback;
