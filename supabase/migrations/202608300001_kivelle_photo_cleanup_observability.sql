begin;

insert into public.together_ops_alert_rules(slug,name,metric,operator,threshold,window_minutes,severity,cooldown_minutes,channels,metadata)
values('photo-cleanup-failures','Private photo cleanup is failing','photo_cleanup_failures_30m','gte',1,30,'warning',60,array['dashboard'],jsonb_build_object('description','Failed private chat-photo expiry, orphan, or retry deletions in the last 30 minutes. No media content is recorded.'))
on conflict(slug) do update set
  name=excluded.name,
  metric=excluded.metric,
  operator=excluded.operator,
  threshold=excluded.threshold,
  window_minutes=excluded.window_minutes,
  severity=excluded.severity,
  cooldown_minutes=excluded.cooldown_minutes,
  channels=excluded.channels,
  metadata=excluded.metadata,
  updated_at=now();

commit;
