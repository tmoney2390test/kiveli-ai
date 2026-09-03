begin;

select plan(7);

select ok(public.kivelle_video_configuration_valid('seedance-1-5-pro-sfw','bytedance/seedance-v1.5-pro/image-to-video',5,'720p',false,'toggleable'),'standard Seedance is accepted');
select ok(public.kivelle_video_configuration_valid('ltx-2-3-sfw','wavespeed-ai/ltx-2.3/image-to-video',20,'1080p',true,'always'),'standard LTX with native audio is accepted');
select ok(public.kivelle_video_configuration_valid('wan-2-2-sfw','wavespeed-ai/wan-2.2/image-to-video',8,'720p',false,'none'),'standard silent Wan is accepted');
select isnt(public.kivelle_video_configuration_valid('seedance-1-5-pro-sfw','bytedance/seedance-v1.5-pro/image-to-video-spicy',5,'720p',false,'toggleable'),true,'an SFW route cannot select a spicy endpoint');
select isnt(public.kivelle_video_configuration_valid('seedance-1-5-pro-spicy','bytedance/seedance-v1.5-pro/image-to-video',5,'720p',false,'toggleable'),true,'an adult-capable route cannot select a standard endpoint');
select isnt(public.kivelle_video_configuration_valid('wan-2-2-sfw','wavespeed-ai/wan-2.2/image-to-video',8,'720p',true,'none'),true,'silent SFW models cannot request sound');
select function_privs_are('public','kivelle_video_configuration_valid',array['text','text','integer','text','boolean','text'],'authenticated',array[]::text[],'clients cannot invoke the exact-model allowlist directly');

select * from finish();
rollback;
