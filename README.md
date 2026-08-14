# Kivelle.AI

Kivelle.AI is an adult relationship and living-world simulation built with Expo, TypeScript, and Supabase. A companion has persistent identity, memories, relationships, a schedule, a social world, story arcs, shared Dates, and historical Moments.

## Product systems

- City Life with companions, locations, life events, and lazy simulation
- Structured long-term memories, open threads, and relationship progression
- Template-driven Dates with variable scenes and choice outcomes
- Spoiler-safe story threads, historical Moments, and companion-specific profiles
- Discover for people, experiences, worlds, and future trips
- Proactive communication, privacy controls, reporting, and internal debug tools
- Server-side AI orchestration with capability-gated content modes

Contextual image records are modeled and surfaced only when a real media provider has produced a ready asset. The current build does not configure image generation, nudity, or explicit-content providers.

## Run locally

```sh
pnpm install
cp apps/together/.env.example apps/together/.env
pnpm web
```

Place the public Supabase URL and publishable key in `apps/together/.env`. Configure privileged Supabase and AI credentials only as Edge Function secrets.

## Database and functions

Link the repository to the intended Supabase project, apply additive migrations, then deploy the Kivelle functions:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy together-bootstrap
supabase functions deploy together-dialogue
supabase functions deploy together-date
```

The CI workflow verifies linting, type checks, unit tests, and the web build. Database integration tests are kept local because CI does not provision an isolated Supabase service.

See [apps/together/README.md](apps/together/README.md) for client setup and provider details.
