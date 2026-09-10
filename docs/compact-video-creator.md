# Compact video creator

Direct video and photo animation share a prompt-first layout, a collapsed settings summary, and one credit total with the available and remaining balance. Quality cards show the price difference from the current selection. If switching changes duration, resolution, or sound, the comparison identifies those settings. The backend still checks the submitted credit total before charging.

Premium replaces the Cinematic customer label without changing the tier ID, provider routing, or pricing. The cached catalog version is bumped so old names are replaced. Ops uses the same customer-facing label.

## Capability copy

Provider capabilities were checked on September 10, 2026 against the [MiniMax H3 image-to-video page](https://wavespeed.ai/models/wavespeed-ai/minimax-h3/image-to-video) and [Seedance 1.5 Pro image-to-video page](https://wavespeed.ai/models/bytedance/seedance-v1.5-pro/image-to-video), alongside Kivelli's enabled options. Premium offers clips up to 15 seconds and includes native stereo audio, at up to 768p. Standard's offered durations are 5 and 10 seconds, with optional audio and output up to 1080p. The interface does not claim Premium has higher resolution or guaranteed superior visual quality. No controlled, comparable example clips were available, so none are presented as evidence.

## Prompt behavior

New-scene suggestions use the companion's name and occupation or selected location. A bartender or saloon gets a toast suggestion; existing photos use ideas without introducing new props. Polish prompt leaves the original in place until the user reviews and applies the proposal. They can discard it or undo the applied polish. A response arriving after a newer edit cannot replace that edit. Provider failures preserve the original prompt.

## Release verification

Check mobile and desktop layouts, initially collapsed settings, live price differences and remaining balance, retained sound preference, location selection, polish review/discard/apply/undo, and stale polish responses. Intercept generation during UI tests so no paid media is created. Run app tests, typecheck, lint, Deno route/pricing tests, production build, and the production route audit. Keep main and the deployed bundle aligned with concurrent work.
