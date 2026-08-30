# Mobile media regression flows

These Maestro flows run against an installed Kivelle development or preview build. Keep a test user signed in before running; the flows deliberately use `clearState: false` so credentials never appear in source or test output.

- `maestro test .maestro/media-composer-mobile.yaml` validates the photo/video toggle, custom direct-video prompt, and 10/15/20-second choices.
- `maestro test -e MEDIA_ID=<ready-video-id> .maestro/media-viewer-mobile.yaml` validates contained full-screen video in portrait and landscape.

The normal subscriber and free test accounts should each run the composer flow. On the free account, continue by tapping **Choose photo** and assert that **Share photos with your characters** appears before any system picker. On the subscriber account, tap it and select the fixture image to cover preview, replace, remove, send, retry, keyboard, and picker permissions.
