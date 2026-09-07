# Companion initiative

Kivelle companion initiative is a paid, server-authoritative layer over the existing Life simulation. It never invents a new life event merely to create a notification.

## Pacing

- `off`: no ambient companion-initiated messages.
- `occasional`: at least 12 hours after the latest chat and 36 hours after the latest ambient initiative.
- `natural`: at least 5 hours after the latest chat and 18 hours after the latest ambient initiative.
- `frequent`: at least 3 hours after the latest chat and 8 hours after the latest ambient initiative.

The global level is stored on `together_notification_preferences.initiative_level`. `companion_initiative_levels` contains optional character-instance overrides. The Life dispatcher always resolves the effective level server-side and requires the `proactive_messages` entitlement. Client flags cannot bypass that check.

## Reminders

Date and plan reminders are independent of paid initiative. They use `messageKind: plan_reminder`, retain the existing dedupe/relevance checks, and may be delivered when ambient initiative is disabled. Disabling initiative cancels queued ambient messages without cancelling these reminders.

## Character voice

Once an eligible canonical event, open thread, or post-plan callback is selected, the queue stores its source identity and a canonical draft. Only delivered messages appear in the app snapshot. The dispatcher reloads the source and generates the message at delivery time, after quiet hours.

`kivelle-proactive-voice.ts` uses the same `compileCharacterVoiceCard()` and SMS/paragraph guidance as normal chat. It selects semantic character fields instead of cutting off the serialized bible, includes up to 16 recent visible shared turns and the original user disclosure for a thread, and avoids repeating the last five delivered/opened initiatives. Other characters' private conversation history is excluded. Background content remains safe/suggestive.

Messages use one to three short sentences, usually 40–220 characters, with a hard 520-character ceiling. Questions are optional. Plain text normalization removes speaker wrappers and escaped newlines, rejects stage directions/structured output, and ends long output at a complete sentence. Character era, register, relationship stage, and disclosure boundaries remain authoritative.

The voice pass has a six-second timeout including response-body reading. Only specific thread questions and factual plan reminders have deterministic fallbacks. An event requiring a voice rewrite is skipped if generation fails; narrator prose and generic memory callbacks are never delivered as chat. Configure the voice pass with:

```env
KIVELLE_PROACTIVE_VOICE_ENABLED=true
KIVELLE_PROACTIVE_MODEL=gpt-5.6-luna
```

No conversation text is written to telemetry. AI usage records contain only IDs, model, token/cost counts, latency, and success state.

## Delivery and follow-up continuity

`kivelle-proactive-delivery.ts` claims a 90-second lease before generating. Before inserting, it checks the source again, user activity since queueing, conversation availability/preferences, the character's current activity/location, and whether the queue entry was cancelled while generation ran. Resolved or already-followed-up threads, cancelled/expired plans, expired schedule activities, and disabled open-thread memory suppress the message. Explicit plan reminders remain independent of ambient initiative and recent user activity.

Successful persistence uses `response_key: proactive:<queue-id>` for retry idempotency. A worker recovering after a message insert completes thread/queue bookkeeping without generating another message. A failed message insert never marks the queue or thread delivered. Scheduled follow-ups update the same `last_followed_up_at` and `followup_count` fields as regular chat; `follow_up_eligible` remains set so a subsequent answer can resolve the thread.

Topic selection excludes used sources before ranking. An already-used high-priority thread cannot block another due topic. Real events are ranked by significance then recency, with schedule-presence events stored by their schedule ID rather than a nonexistent life-event foreign key. Existing cadence, entitlement, quiet-hour, and plan-reminder controls are retained.

## Verification and rollout

CI runs `kivelle-proactive-voice.test.ts`, `kivelle-proactive-context.test.ts`, `kivelle-proactive-delivery.test.ts`, and `kivelle-initiative.test.ts`. The delivery tests cover overnight changes, concurrent workers, persistence recovery, group reminders, cancelled plans, preference changes, and formatting.

No database migration or client build is required. Redeploy the Edge Functions that bundle the changed shared modules, including `together-life-dispatch`, `together-simulate`, `together-dialogue`, `together-scene-reaction`, `together-debug`, `together-call`, and snapshot-serving functions such as `together-bootstrap`. Existing queued rows are revalidated from their source IDs and rendered with the new path.

Unit tests verify the prompt contract and delivery behavior with a mocked provider; they do not establish live model quality. Review character-distinct samples and monitor `proactive_voice` success/fallback errors, cancelled queue `context.skipReason`, and response patterns after rollout. Lexical fact checks catch some timing/subject drift but are not a semantic guarantee.
