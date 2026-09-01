# Apple authentication operations

Kivelle uses Supabase Auth as the single account authority for password, Google, and Apple identities. The Expo client never receives the Apple private key or client secret.

## Fixed Kivelle identifiers

- iOS App ID / bundle ID: `app.kivelli`
- Android application ID: `app.kivelli`
- Web Services ID: `app.kivelli.web`
- Production website: `https://kivelli.app`
- Supabase project ref: `mfysnlghlhxxcwnwpxog`
- Apple/Supabase return URL: `https://mfysnlghlhxxcwnwpxog.supabase.co/auth/v1/callback`
- Kivelle web callback: `https://kivelli.app/auth/callback`
- Kivelle native callback: `kivelli://auth/callback`
- Temporary legacy callback: `together://auth/callback`

## Apple Developer setup

1. In Certificates, Identifiers & Profiles, create or open the App ID `app.kivelli` and enable **Sign in with Apple** as the primary App ID. Do not configure a server-to-server notification endpoint; the current Supabase integration does not consume it.
2. Create the Services ID `app.kivelli.web`. Enable Sign in with Apple, associate it with `app.kivelli`, and configure:
   - Domain: `mfysnlghlhxxcwnwpxog.supabase.co`
   - Return URL: `https://mfysnlghlhxxcwnwpxog.supabase.co/auth/v1/callback`
3. Create a Sign in with Apple key associated with the primary App ID. Record the Key ID, download the `.p8` file once, and store it in the password manager/secrets vault. Also record the Apple Team ID.
4. If Kivelle sends account email to Apple private-relay addresses, configure Apple email relay for the actual outbound email domain and sender used by Supabase custom SMTP.

## Supabase setup

1. Open project `mfysnlghlhxxcwnwpxog` → Authentication → Providers → Apple.
2. Enable Apple and enter the client IDs in this exact order:
   `app.kivelli.web,app.kivelli`
   The Services ID must be first because Supabase uses the first value for web OAuth; the native bundle ID lets Supabase accept native iOS identity-token audiences.
3. Generate the Apple client secret using the Services ID, Team ID, Key ID, and `.p8` signing key, then save it in the Apple provider. Never put the secret or `.p8` contents in Expo/EAS variables.
4. In Authentication → URL Configuration, keep the Site URL as `https://kivelli.app` and allow at least:
   - `https://kivelli.app/auth/callback`
   - `https://kivelli.app/reset-password`
   - `kivelli://auth/callback`
   - `kivelli://reset-password`
   Keep `together://auth/callback` and `together://reset-password` temporarily for legacy development builds.
   Add `http://localhost:8082/auth/callback` only for local development.

## Kivelle rollout

After the Apple provider saves successfully, set `EXPO_PUBLIC_KIVELLE_APPLE_AUTH_ENABLED=true` in the EAS `production` environment. Rebuild/deploy the web app and create a new iOS build; the iOS capability and native Apple button are build-time configuration.

Test all of these before considering rollout complete:

- New web user with Share My Email reaches explicit age confirmation, then onboarding.
- New web user with Hide My Email receives a private-relay account and reaches onboarding.
- Existing Apple user can sign out and return without being asked for a name again.
- Native iOS first sign-in stores the one-time Apple name; subsequent sign-ins still work when Apple returns no name.
- Cancellation returns to Kivelle with a calm error and no session.
- Google and password sign-in continue to work.
- Account settings show “Signed in with Apple.”

## Required maintenance

Apple OAuth client secrets expire at most every six months. Create an operations reminder well before expiry, generate a replacement from the retained `.p8` key, update Supabase, and run a web Apple sign-in smoke test. Native-only identity-token sign-in does not require this rotation, but Kivelle web and Android Apple OAuth do.
