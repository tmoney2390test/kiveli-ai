# Mobile conversation keyboard layout

Opening the mobile keyboard now resizes the whole direct/group conversation to the visible viewport, keeping recent messages and the composer above it. The existing bottom pin runs through keyboard animation; viewport panning updates the frame's top offset, and dismissal restores its height. The frame does not mutate global document styles. Native keyboard avoidance and the desktop shell retain their existing behavior.

Mobile composer text is 16px to avoid input focus zoom. Pinch-zoom measurements are ignored by the frame calculation. This addresses browsers where the keyboard shrinks only the visual viewport, as described in the [Chrome viewport documentation](https://developer.chrome.com/blog/viewport-resize-behavior).

Validation: 725 app tests, app typecheck, lint and production export passed. Browser checks used the authorized test account with mutation requests blocked. Both direct and group conversations were tested with a fixed 844px layout viewport and simulated visual heights of 640, 480 and 440px, including a 54px top offset. Composer placement, recent content position, typing, keyboard dismissal and desktop resizing were checked, and screenshots were reviewed. These simulations do not replace physical iOS/Android keyboard testing.

Frontend change `06554a2` is deployed as Cloudflare version `0e05af7c-4e6f-4eb3-a03e-9a404e11bdd0`. The latest main-branch Calder migration was merged to preserve concurrent work; no database or Edge Function changes were deployed for this keyboard fix.
