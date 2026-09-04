begin;

-- The initial projection migration conservatively marked any approved turn
-- produced by the old adult-capable provider route as restricted, even when
-- it was ordinary private dialogue. Restore those rows only for an age-
-- verified adult account and an all-adult private conversation. Attachment
-- and generated-media policy is intentionally unchanged.
with eligible_messages as (
  select message.id
  from public.together_messages message
  join public.together_conversations conversation
    on conversation.id=message.conversation_id and conversation.user_id=message.user_id
  join public.together_profiles profile on profile.user_id=message.user_id
  where message.role in('user','assistant')
    and message.moderation_status='approved'
    and message.content_rating='explicit'
    and message.visibility_scope='web_adult'
    and message.moderation_version='legacy-adult-route-v1'
    and message.safe_bridge in(
      'You and your companion shared a more intimate moment and grew closer.',
      'You and your companions shared a more intimate moment and grew closer.'
    )
    and profile.age_verified_at is not null
    and profile.adult_eligible_at is not null
    and (
      (
        conversation.kind in('direct','first_meeting')
        and exists(
          select 1
          from public.together_character_instances instance
          join public.together_character_templates template on template.id=instance.character_template_id
          where instance.id=conversation.character_instance_id
            and instance.user_id=conversation.user_id
            and template.age>=18
        )
      )
      or (
        conversation.kind='group'
        and exists(
          select 1 from public.together_conversation_participants participant
          where participant.conversation_id=conversation.id and participant.user_id=conversation.user_id
            and participant.left_at is null
        )
        and not exists(
          select 1
          from public.together_conversation_participants participant
          join public.together_character_instances instance on instance.id=participant.character_instance_id
          join public.together_character_templates template on template.id=instance.character_template_id
          where participant.conversation_id=conversation.id and participant.user_id=conversation.user_id
            and participant.left_at is null and (template.age is null or template.age<18)
        )
      )
    )
)
update public.together_messages message
set visibility_scope='all',
    moderation_version='private-adult-text-v1',
    provider_metadata=coalesce(message.provider_metadata,'{}'::jsonb)||jsonb_build_object(
      'contentRating','explicit',
      'visibilityScope','all',
      'moderationVersion','private-adult-text-v1',
      'contentPolicyVersion','private-adult-text-v1',
      'privacyScope','private',
      'adultEligibilityApplied',true,
      'allParticipantsAdults',true,
      'safetyDisposition','allowed',
      'legacyPolicyUpgraded',true,
      'legacyModerationVersion','legacy-adult-route-v1'
    ),
    updated_at=clock_timestamp()
from eligible_messages eligible
where message.id=eligible.id;

update public.together_memories memory
set content_rating=message.content_rating,
    visibility_scope='all',
    moderation_version='private-adult-text-v1',
    updated_at=clock_timestamp()
from public.together_messages message
where memory.source_message_id=message.id
  and message.visibility_scope='all'
  and message.content_rating='explicit'
  and message.moderation_version='private-adult-text-v1'
  and message.provider_metadata->>'legacyModerationVersion'='legacy-adult-route-v1';

update public.together_open_threads thread
set content_rating=message.content_rating,
    visibility_scope='all',
    moderation_version='private-adult-text-v1',
    updated_at=clock_timestamp()
from public.together_messages message
where thread.source_message_id=message.id
  and message.visibility_scope='all'
  and message.content_rating='explicit'
  and message.moderation_version='private-adult-text-v1'
  and message.provider_metadata->>'legacyModerationVersion'='legacy-adult-route-v1';

commit;
