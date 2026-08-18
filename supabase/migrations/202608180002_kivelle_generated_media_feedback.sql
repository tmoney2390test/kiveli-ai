-- User quality signals for generated-photo auditing. This deliberately stores
-- only the verdict and timestamp; prompts and conversation content are not
-- duplicated into feedback records.
alter table public.together_generated_media
  add column if not exists user_feedback text,
  add column if not exists user_feedback_at timestamptz;

alter table public.together_generated_media
  drop constraint if exists together_generated_media_user_feedback_check;
alter table public.together_generated_media
  add constraint together_generated_media_user_feedback_check
  check(user_feedback is null or user_feedback in ('positive','negative')) not valid;
alter table public.together_generated_media
  validate constraint together_generated_media_user_feedback_check;

create index if not exists together_generated_media_negative_feedback_idx
  on public.together_generated_media(user_feedback_at desc)
  where user_feedback='negative';

comment on column public.together_generated_media.user_feedback is
  'The owning user quality verdict for auditing generated output; positive or negative.';
comment on column public.together_generated_media.user_feedback_at is
  'When the owning user last rated this generated media item.';
