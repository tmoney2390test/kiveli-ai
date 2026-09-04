begin;
select plan(14);

select has_column('public','together_profiles','multimodal_preferences','profiles store multimodal preferences');
select has_table('public','together_conversation_attachments','conversation attachments exist');
select has_column('public','together_conversation_attachments','analysis_status','attachments keep provider-neutral analysis lifecycle');
select has_column('public','together_conversation_attachments','message_id','attachments link to canonical messages');
select has_table('public','together_character_voice_profiles','voice profiles exist');
select has_column('public','together_character_voice_profiles','voice_key','voice identity is provider neutral');
select has_column('public','together_character_voice_profiles','provider_mappings','provider mappings are isolated');
select has_column('public','together_generated_media','duration_ms','generated media supports audio duration');
select has_column('public','together_generated_media','canonical_text','voice notes preserve canonical spoken text');
select has_table('public','together_voice_call_sessions','voice call sessions exist');
select has_column('public','together_voice_call_sessions','continuity_id','calls are Life scoped');
select has_column('public','together_voice_call_sessions','usage_metadata','calls normalize usage accounting');
select policies_are('public','together_conversation_attachments',array['together_conversation_attachments_safe_own_read'],'attachments are server-mutated and privately readable through the safe projection');
select policies_are('public','together_voice_call_sessions',array['together_voice_call_sessions_own_read'],'calls are server-mutated and privately readable');

select * from finish();
rollback;
