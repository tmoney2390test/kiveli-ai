# Together

Together is an 18+ relationship and life-simulation product built with Expo, TypeScript, and Supabase. Characters retain structured memories, relationship state, schedules, life events, and shared Moments.

## What is included

- Expo Router client for web and mobile
- Persistent Maya, Chloe, and Alex character instances
- Structured memory, open threads, and relationship milestones
- Conversation-driven lazy life simulation and proactive messaging
- City Life, Dinner at Juniper, Moments, profile/privacy controls, and internal debug tools
- Supabase migrations, RLS policies, and Edge Functions

## Run locally

```sh
pnpm install
cp apps/together/.env.example apps/together/.env
pnpm web
```

The public Supabase URL and publishable key belong in `apps/together/.env`. Configure privileged Supabase and AI credentials only as Edge Function secrets.

## Database and functions

Link this repository to the Together Supabase project, then apply migrations and deploy the Together functions:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy together-bootstrap
supabase functions deploy together-dialogue
supabase functions deploy together-relationship
```

See [apps/together/README.md](apps/together/README.md) for product and provider details.
