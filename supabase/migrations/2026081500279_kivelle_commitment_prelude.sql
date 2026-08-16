begin;
alter table public.together_date_templates add column if not exists metadata jsonb not null default '{}'::jsonb;
comment on column public.together_date_templates.metadata is 'Structured Date metadata such as canonical duration; Date timing itself belongs to the linked SharedPlan.';
commit;
