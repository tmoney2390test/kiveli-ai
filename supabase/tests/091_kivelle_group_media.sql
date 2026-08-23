begin;
select plan(18);

select has_table('public','together_generated_media_subjects','Generated media has a normalized subject roster');
select has_table('public','together_media_offer_subjects','Media offers have a normalized subject roster');
select has_column('public','together_generated_media_subjects','ordinal','Generated subjects retain prompt order');
select has_column('public','together_media_offer_subjects','ordinal','Offer subjects retain selection order');
select col_is_fk('public','together_generated_media_subjects','character_instance_id','Generated subjects reference character instances');
select col_is_fk('public','together_media_offer_subjects','character_instance_id','Offer subjects reference character instances');
select has_index('public','together_generated_media_subjects','together_generated_media_subject_character_idx','Generated subject lookup is indexed');
select has_index('public','together_media_offer_subjects','together_media_offer_subject_character_idx','Offer subject lookup is indexed');
select has_trigger('public','together_generated_media','together_generated_media_validate_subjects','Generated media validates its complete subject roster');
select has_trigger('public','together_media_offers','together_media_offers_validate_subjects','Media offers validate their complete subject roster');
select has_trigger('public','together_generated_media','together_generated_media_sync_subjects','Generated media keeps normalized subjects synchronized');
select has_trigger('public','together_media_offers','together_media_offers_sync_subjects','Media offers keep normalized subjects synchronized');
select ok(to_regprocedure('public.kivelle_validate_media_subject_roster()') is not null,'The shared roster validator exists');
select like(pg_get_functiondef('public.kivelle_validate_media_subject_roster()'::regprocedure),'%media subjects must be unique%','Duplicate subjects are rejected');
select like(pg_get_functiondef('public.kivelle_validate_media_subject_roster()'::regprocedure),'%same user and Kivelle Life%','Cross-user and cross-Life subjects are rejected');
select like(pg_get_functiondef('public.kivelle_validate_media_subject_roster()'::regprocedure),'%active conversation participants%','Group subjects must be active participants');
select like(pg_get_constraintdef(oid),'%cardinality(subject_character_instance_ids)%2%','Generated media is limited to one or two subjects') from pg_constraint where conname='together_generated_media_subject_count_check';
select like(pg_get_constraintdef(oid),'%cardinality(subject_character_instance_ids)%2%','Media offers are limited to one or two subjects') from pg_constraint where conname='together_media_offers_subject_count_check';

select * from finish();
rollback;
