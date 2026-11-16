# Kivelli on iPhone Duo — concept and implementation plan

Status: concept and plan only. No app layout or release build has been changed for Duo.

## Design direction

- **Closed outer display:** retain the active screen and its state. Use one content pane with a slim, trailing navigation rail so the chat, composer, and media remain visible in the shorter viewport.
- **Fully open inner display:** reveal a second level of context instead of stretching a phone screen. In chat, show the conversation list beside the active thread. Show the location/plan rail only if the remaining usable width supports it. In Explore, show a list or grid beside the selected place. Keep the central fold free of important text, faces, and controls.
- **Partially folded book mode:** treat each side as a legible pane. Avoid full-bleed portraits and action buttons spanning the curve. Preserve the selected conversation or place as the pose changes.
- **Tabletop mode:** keep reading content on the upper half and the composer/actions on the lower half only if testing shows the keyboard, focus, and fold avoidance work reliably. Otherwise use the standard responsive layout.
- These are layout adaptations of the existing app, not separate Duo-only features. Outer and inner displays must expose the same actions.

Concept art: [closed and open chat](iphone-duo-concepts/chat-closed-open.png) · [book and tabletop modes](iphone-duo-concepts/explore-book-tabletop.png). These are illustrative mockups, not simulator screenshots or App Store assets.

## Current Kivelli integration points

1. `apps/together/app/(tabs)/_layout.tsx` sets an absolutely positioned 68-point iOS tab bar at the bottom. Because this is a custom Expo Router/React Native bar, its placement needs explicit Duo testing and likely a trailing-edge version in Duo's outer display and inner landscape layout.
2. `apps/together/app/chat.tsx` chooses its context rails at widths of 920 and 1080 points, and uses a different compact treatment below 720. A wide inner display could therefore show too many panes without accounting for the fold or vertical controls. Choose panes based on usable pane width and reserved areas, then retain the same conversation state while resizing.
3. Home, Explore, Moments, gallery/media, group chat, world selector, sheets, photo composer, and subscription flows all need a resizing pass. In particular, custom sheets and popovers may land over the fold; media framing must keep faces and key details in a single readable region.
4. `apps/together/app.config.ts` uses the default orientation setting and enables tablet support. Confirm the final iOS binary's orientation and resizing behavior in Xcode 27.1's Duo simulator rather than assuming these settings ensure a good layout.

## Delivery sequence

### 1. Establish a baseline

Build the current iOS app with Xcode 27.1 tooling and run the iPhone Duo simulator. Capture outer closed, inner open portrait and landscape, partial book fold, tabletop fold, keyboard open, and Split View. Record clipping, unsafe touch targets, modal placement, chat scroll jumps, composer occlusion, and portrait crops. Use these captures as the before-state for review.

### 2. Adapt the shell and navigation

Introduce a native iOS Duo layout mode based on actual safe area and available width. Place a compact icon rail on the trailing edge where Duo uses vertical controls; retain the present bottom glass bar where horizontal controls are appropriate. Prioritize Chat, Home, Explore, and Moments; keep Create and any overflow reachable. Do not cover the camera/status region. Honor Reduce Transparency and dynamic type.

### 3. Adapt the content

For chat, use one pane when compact and a list-plus-thread layout when the inner display has room. Keep the same chat instance, draft, selected branch, scroll anchor, pending upload, and in-flight reply while opening or closing. Add the location/plan context only when it has an independent readable pane. Apply the same responsive rule to group chat. In Explore, show the selected place next to the place list when possible; use even-column grids for world and media cards around the fold. Make photos and videos fit their own pane without cutting a face or important control through the hinge. Anchor custom sheets, purchase dialogs, and action menus to a usable region.

### 4. Handle the fold only where needed

First rely on window resizing and safe areas. If a custom overlay still collides with the hinge, add a small native iOS 27.1 bridge for reserved-region geometry and use it only for those surfaces. Avoid device-model checks or a single hardcoded hinge width. Keep the ordinary iPhone, iPad, Android, and web layouts unchanged unless a shared fix benefits them.

### 5. Verify and release separately

Run typecheck and relevant component tests, then test on the Duo simulator in every pose and orientation. Exercise an active direct chat, group chat, voice playback, photo request, image upload, branch switching, World Pulse modal, character/profile sheet, Create flow, and subscriptions while opening and closing the device. Check accessibility focus, large text, reduced transparency, camera use, keyboard, and Split View. Put a validated native build in TestFlight before considering an App Store update. Capture real Duo screenshots from the running build; concept art must not be submitted as screenshots.

## Exit criteria

- No text, composer, controls, sheet, or purchase action is hidden by a camera, vertical rail, keyboard, or fold.
- Outer and inner displays offer the same actions, with stable draft, scroll position, chat state, and pending work across transitions.
- Chat, Explore, Moments, media, group chat, and payment flows are usable in all supported poses; ordinary iPhone and iPad layouts do not regress.
- Real Duo App Store screenshots meet Apple's current dimensions and represent the shipped UI.

Apple references: [iPhone Duo design guidance](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo), [prepare and submit](https://developer.apple.com/news/?id=kkphp5qo), [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications).
