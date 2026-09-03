begin;
select plan(18);

select has_column('public','together_profiles','adult_eligible_at','Adult eligibility is independent account state');
select has_column('public','together_profiles','adult_eligibility_method','The replaceable eligibility method is recorded separately');
select has_table('public','together_web_adult_sessions','Adult opt-in is bound to a server-side browser session');
select has_table('public','together_adult_asset_grants','Adult assets require server-issued short-lived grants');
select has_column('public','together_conversations','canonical_context','Conversations retain canonical context');
select has_column('public','together_conversations','safe_context','Conversations retain a separately derived safe context');
select has_column('public','together_messages','content_rating','Messages carry a content rating');
select has_column('public','together_messages','visibility_scope','Messages carry a visibility scope');
select has_column('public','together_messages','safe_bridge','Restricted messages can project a safe bridge');
select has_column('public','together_conversation_attachments','safe_variant_key','Attachments can reference a separately safe variant');
select has_column('public','together_generated_media','moderation_version','Generated media records its moderation version');
select has_column('public','together_account_exports','projection_scope','Account exports are projection-scoped');
select trigger_is('public','together_messages','together_messages_apply_policy','public','kivelle_apply_message_policy','Every message is classified at the database boundary');
select trigger_is('public','together_generated_media','together_generated_media_apply_policy','public','kivelle_apply_generated_media_policy','Generated media is classified at the database boundary');
select has_function('public','kivelle_match_memories_for_projection',array['uuid','uuid','extensions.vector','integer','double precision','boolean'],'Semantic recall has an explicit safe/canonical projection parameter');
select ok(not has_table_privilege('authenticated','public.together_conversations','select'),'Authenticated clients cannot read canonical conversation context directly');
select like((select qual from pg_policies where schemaname='public' and tablename='together_messages' and policyname='together_messages_safe_own_read'),'%visibility_scope%all%content_rating%','Direct message reads are limited to classified safe content');
select like((select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='together_media_avatar_own_read'),'%avatar-%persona-avatars%','Direct object reads are limited to avatar paths');

select * from finish();
rollback;
