begin;
select plan(5);

select has_column('public','together_notification_preferences','initiative_level','Notification preferences store a global initiative level');
select col_not_null('public','together_notification_preferences','initiative_level','Global initiative level is always resolved');
select has_column('public','together_notification_preferences','companion_initiative_levels','Notification preferences store per-companion overrides');
select col_not_null('public','together_notification_preferences','companion_initiative_levels','Per-companion overrides use a canonical empty object');
select ok(position('occasional' in pg_get_constraintdef(oid))>0 and position('frequent' in pg_get_constraintdef(oid))>0,'Initiative levels are constrained to the authored values')
from pg_constraint where conname='together_notification_preferences_initiative_level_check';

select * from finish();
rollback;
