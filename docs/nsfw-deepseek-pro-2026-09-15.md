# NSFW dialogue model change

Eligible NSFW text routes that previously selected xAI now use `deepseek/deepseek-v4-pro` through the existing WaveSpeed adapter. Direct chat, group chat, scene reactions, and manual Spice share the selection. Expanded-context quotes use the same model as generation. Existing authorized owner-only model experiments remain explicit overrides.

Content classification, age and relationship checks, private-text rollout switches, platform policy, prompts, character content, voice, and media models are unchanged. The existing xAI enable switches remain compatibility gates; WaveSpeed additionally requires its existing API key. A missing key fails visibly rather than silently selecting a different model.

Production requests no longer require owner-only experiment authorization; they require an eligible explicit server route and recheck the existing rollout configuration before sending. All endpoint access/consent checks remain in place. Tests cover streaming for an ordinary account, exact model identity, rollout revocation, blocked routes, experiment isolation, continuity, rewrites, and pricing.

Deployed on September 15 to dialogue, group-dialogue, dialogue-quote, and scene-reaction by applying only this patch to downloaded production source. Unrelated branch changes were excluded. No database migration or native rebuild was needed. An authenticated ordinary-chat quote remained on its SFW model; a new live NSFW response was not generated during verification. See subscription-cost-analysis-2026-09-15.md for deployment evidence and economics.
