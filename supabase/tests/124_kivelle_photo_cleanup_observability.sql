begin;
select plan(3);

select ok(exists(select 1 from public.together_ops_alert_rules where slug='photo-cleanup-failures' and metric='photo_cleanup_failures_30m' and enabled=true),'private photo cleanup failures have an active operations alert');
select is((select threshold from public.together_ops_alert_rules where slug='photo-cleanup-failures'),1::numeric,'one cleanup failure is enough to alert');
select is((select metadata->>'description' from public.together_ops_alert_rules where slug='photo-cleanup-failures'),'Failed private chat-photo expiry, orphan, or retry deletions in the last 30 minutes. No media content is recorded.','the alert explicitly records aggregate data only');

select * from finish();
rollback;
