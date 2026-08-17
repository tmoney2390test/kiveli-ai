# Plan Experience V2 audit

Audited before implementation against the SharedPlan, SceneSession, Interaction, Life Engine, dialogue, Dates, and planner paths.

| Area | Existing behavior | V2 boundary |
| --- | --- | --- |
| Plan creation/recommendation | `together-plan` and `PlanSelection` already own activity, time, place, availability, and proposal confirmation. | Kept SharedPlan as the commitment authority. |
| Companion arrival/grace/missed | `kivelle_progress_shared_plans` owns expected/late/absent/cancelled, grace, and missed-plan repair. | Kept timing/missed SQL; application finalization now owns scene-derived outcome quality. |
| Attendance | One canonical user/character attendance row; joining could reopen it and did not create a plan-linked scene. | Added transactional begin RPC plus attendance segments and measurable participation. |
| Scene creation | Drop-in and Date context could create a SceneSession; SharedPlan presence could be interpreted as co-presence without user attendance. | SharedPlan scenes are linked by `shared_plan_id`, start only after co-presence, and are unique per active plan. |
| Interaction actions | Domain packs, movement, idempotent scene actions, media offers, and free-text matching already existed. | Added active-plan scoring and deterministic activity state; button reactions use the existing scene-reaction service. |
| Dialogue/co-presence | Chat context used active plan presence as together context. | Requires active user attendance for plan co-presence; pre-join remains remote with plan-awaiting-user context. |
| Dates | Authored Date sessions have their own scheduling/phases/completion flow. | Not rewritten; the SharedPlan/scene additions are opt-in for `source = shared_plan`. |
| Completion/memory | Expired live plans could settle from attendance and generic metadata; scene consolidation already provided an episode seam. | Expired user-attended plans are finalized from scene truth before lifecycle progression, with generic behavior retained as fallback. |
| Client UX | Plan detail joined attendance and returned to generic Chat; Experiences cards were utility rows. | Added Plan Live route, cinematic live experience, realtime refresh, wrap-up, and richer plan cards. |

Critical regression covered: an active plan with character attendance but no active user attendance remains `remote`; after Join it becomes `co_present` and can resolve together-actions.
