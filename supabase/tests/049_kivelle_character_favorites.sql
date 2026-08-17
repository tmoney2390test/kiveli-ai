begin;
select plan(6);

select has_table('public','together_character_favorites','Character favorites have canonical storage');
select has_column('public','together_character_favorites','user_id','Favorites belong to an account');
select has_column('public','together_character_favorites','character_template_id','Favorites reference character definitions');
select col_is_pk('public','together_character_favorites',array['user_id','character_template_id'],'A character can only be favorited once per account');
select ok((select count(*)=1 from pg_policies where schemaname='public' and tablename='together_character_favorites' and policyname='together_character_favorites_own_read'),'Only the explicit own-read RLS policy is installed');
select ok(has_table_privilege('authenticated','public.together_character_favorites','select'),'Authenticated users can read their own favorites');

select * from finish();
rollback;
