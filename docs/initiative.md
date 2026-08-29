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

Once an eligible canonical event, open thread, or post-plan callback is selected, `kivelle-proactive-voice.ts` may rewrite only its delivery using the selected companion's private character bible, communication style, personality, relationship state, current activity, and recent shared turns. It may not add facts, plans, actions, locations, or relationship changes.

The voice pass is bounded by a short timeout and always falls back to deterministic grounded copy. Configure it with:

```env
KIVELLE_PROACTIVE_VOICE_ENABLED=true
KIVELLE_PROACTIVE_MODEL=gpt-5.6-luna
```

No conversation text is written to telemetry. AI usage records contain only IDs, model, token/cost counts, latency, and success state.
