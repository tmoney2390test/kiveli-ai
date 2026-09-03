begin;

-- Keep the database as the final exact-model allowlist. Standard WaveSpeed
-- endpoints are distinct from adult-capable "spicy" endpoints even when their
-- resolution, duration, audio behavior, and pricing dimensions match.
create or replace function public.kivelle_video_configuration_valid(
  p_route_id text,p_model text,p_duration integer,p_resolution text,p_sound boolean,p_audio_mode text
) returns boolean language sql immutable set search_path=public,extensions as $$
  select p_audio_mode in('toggleable','always','none','reference_only')
    and (p_sound=false or p_audio_mode in('toggleable','always'))
    and (
      (p_route_id='seedance-1-5-pro-sfw' and p_model='bytedance/seedance-v1.5-pro/image-to-video' and p_duration in(5,10) and p_resolution in('480p','720p','1080p') and p_audio_mode='toggleable') or
      (p_route_id='ltx-2-3-sfw' and p_model='wavespeed-ai/ltx-2.3/image-to-video' and p_duration between 3 and 20 and p_resolution in('480p','720p','1080p') and p_audio_mode='always') or
      (p_route_id='minimax-h3-sfw' and p_model='wavespeed-ai/minimax-h3/image-to-video' and p_duration between 3 and 15 and p_resolution in('480p','768p') and p_audio_mode='always') or
      (p_route_id='seedance-2-0-mini-sfw' and p_model='bytedance/seedance-2.0-mini/image-to-video' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-0-fast-sfw' and p_model='bytedance/seedance-2.0-fast/image-to-video' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-0-sfw' and p_model='bytedance/seedance-2.0/image-to-video' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-5-sfw' and p_model='bytedance/seedance-2.5/image-to-video' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='vidu-q3-sfw' and p_model='vidu/q3/image-to-video' and p_duration between 1 and 16 and p_resolution in('540p','720p','1080p') and p_audio_mode='toggleable') or
      (p_route_id='wan-2-7-sfw' and p_model='alibaba/wan-2.7/image-to-video' and p_duration in(5,10,15) and p_resolution in('720p','1080p') and p_audio_mode='reference_only' and p_sound=false) or
      (p_route_id='wan-2-6-sfw' and p_model='alibaba/wan-2.6/image-to-video' and p_duration in(5,10,15) and p_resolution in('720p','1080p') and p_audio_mode='reference_only' and p_sound=false) or
      (p_route_id='wan-2-2-sfw' and p_model='wavespeed-ai/wan-2.2/image-to-video' and p_duration in(5,8) and p_resolution in('480p','720p') and p_audio_mode='none' and p_sound=false) or
      (p_route_id='seedance-1-5-pro-spicy' and p_model='bytedance/seedance-v1.5-pro/image-to-video-spicy' and p_duration in(5,10) and p_resolution in('480p','720p','1080p') and p_audio_mode='toggleable') or
      (p_route_id='ltx-2-3-spicy' and p_model='wavespeed-ai/ltx-2.3-spicy/image-to-video' and p_duration between 3 and 20 and p_resolution in('480p','720p','1080p') and p_audio_mode='always') or
      (p_route_id='minimax-h3-spicy' and p_model='wavespeed-ai/minimax-h3/image-to-video-spicy' and p_duration between 3 and 15 and p_resolution in('480p','768p') and p_audio_mode='always') or
      (p_route_id='seedance-2-0-mini-spicy' and p_model='bytedance/seedance-2.0-mini/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-0-fast-spicy' and p_model='bytedance/seedance-2.0-fast/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-0-spicy' and p_model='bytedance/seedance-2.0/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-5-spicy' and p_model='bytedance/seedance-2.5/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='vidu-q3-spicy' and p_model='vidu/q3/image-to-video-spicy' and p_duration between 1 and 16 and p_resolution in('540p','720p','1080p') and p_audio_mode='toggleable') or
      (p_route_id='wan-2-7-spicy' and p_model='alibaba/wan-2.7/image-to-video-spicy' and p_duration in(5,10,15) and p_resolution in('720p','1080p') and p_audio_mode='reference_only' and p_sound=false) or
      (p_route_id='wan-2-6-spicy' and p_model='alibaba/wan-2.6/image-to-video-spicy' and p_duration in(5,10,15) and p_resolution in('720p','1080p') and p_audio_mode='reference_only' and p_sound=false) or
      (p_route_id='wan-2-2-spicy' and p_model='wavespeed-ai/wan-2.2-spicy/image-to-video' and p_duration in(5,8) and p_resolution in('480p','720p') and p_audio_mode='none' and p_sound=false)
    );
$$;

revoke all on function public.kivelle_video_configuration_valid(text,text,integer,text,boolean,text) from public,anon,authenticated;
grant execute on function public.kivelle_video_configuration_valid(text,text,integer,text,boolean,text) to service_role;

commit;
