# NSFW dialogue model change

Eligible NSFW text routes that previously selected xAI now use `deepseek/deepseek-v4-pro` through the existing WaveSpeed adapter. Direct chat, group chat, scene reactions, and manual Spice share the selection. Expanded-context quotes use the same model as generation. Existing authorized owner-only model experiments remain explicit overrides.

Content classification, age and relationship checks, private-text rollout switches, platform policy, prompts, character content, voice, and media models are unchanged. The existing xAI enable switches remain compatibility gates; WaveSpeed additionally requires its existing API key. A missing key fails visibly rather than silently selecting a different model.

Production requests no longer require owner-only experiment authorization; they require an eligible explicit server route and recheck the existing rollout configuration before sending. All endpoint access/consent checks remain in place. Tests cover streaming for an ordinary account, exact model identity, rollout revocation, blocked routes, experiment isolation, continuity, rewrites, and pricing.

Deployment is pending. Release the affected server endpoints together (at minimum dialogue, group-dialogue, dialogue-quote, and scene-reaction, plus other deployed consumers of the shared router). Review unrelated pending branch changes before publishing. No database migration or native rebuild is required solely for this model change. Verify the live WaveSpeed key/model and successful usage telemetry after deployment; local mocked tests do not establish live delivery.
