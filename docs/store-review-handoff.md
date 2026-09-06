# Store review handoff

This is draft review-note language derived from the implemented product. It is not legal advice and must be checked against the exact release candidate before submission.

## Honest product description

Kivelle is an AI companion and interactive-fiction application for adults. Users can have private one-to-one conversations and private groups with fictional adult AI characters, explore fictional worlds, build relationships, and retain conversational memories. Users choose a private conversation content preference after age confirmation and can change it later. Prohibited content remains blocked.

The iOS and Android applications do not generate or retrieve explicit images or videos. Adult visual generation is a separately authorized website capability. Native APIs and clients receive a neutral unavailable-media event instead of explicit visual bytes, URLs, thumbnails, captions, prompts, or derived previews. Public discovery, public sharing, store screenshots, and notification previews remain suitable for public display. Voice keeps its separate non-explicit policy.

New memberships are purchased through Apple or Google and synchronized through RevenueCat. Kivelle does not direct native users to hosted web membership checkout. A membership does not automatically change the user's private-content preference or AI data-sharing permission.

## Reviewer access and behavior

- Give review an ordinary test account and any normal setup facts needed to exercise age confirmation, the independent private-conversation choice, AI-processing consent, chat, restore purchases, reporting, and deletion.
- The submitted binary and account must behave exactly like the production release for comparable users. Do not use reviewer detection, delayed unlocks, hidden flags, or post-review changes.
- Explain that private mature text may appear only after the adult user deliberately selects that private setting. Do not imply that the visual restriction also removes eligible private text.
- Explain that account deletion is available while a store subscription is active and that the user is separately directed to Apple/Google to stop renewal.
- Supply a support contact and the final privacy-policy/account-deletion URLs from the production release.

## Public-material checklist

- Use only standard, non-explicit dialogue and fully safe artwork in screenshots, preview video, subtitle, icon, feature graphics, and public starter profiles.
- Do not show explicit visual media, adult web navigation, private-message excerpts, sensitive location details, or lock-screen text beyond the discreet notification format.
- Keep subscription claims aligned with localized store products and actual RevenueCat entitlements.
- Verify the App Privacy and Google Play Data Safety answers against `app-privacy-data-safety-worksheet.md` and current provider contracts; unresolved owner inputs must not be guessed.
