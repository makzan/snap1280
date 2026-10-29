# Preview Shutter Button Design

## Goal

Add a large circular shutter button at the bottom center of the camera preview so capturing a photo is easy on touch screens. Keep the existing toolbar Capture button for desktop and existing users.

## UI and Accessibility

- Add a native `button` element inside the preview stage, positioned at the horizontal center and 16px above the bottom edge.
- Use a 72px circular hit area with a white outer ring and a translucent dark background so it remains visible over light and dark camera images.
- Give the button the accessible name `Capture photo`.
- Support touch, mouse, and keyboard activation through native button behavior.
- Show disabled and active states without changing the preview dimensions.

## Behavior and State

- Route both the new shutter button and the existing Capture button through the existing `captureLive()` function.
- Synchronize both buttons through one capture-disabled state helper.
- Disable both buttons when no live camera is available and while a capture is being encoded or saved.
- Retain the existing `busy` guard to prevent overlapping captures.
- Preserve the existing flash, toast, download, and thumbnail behavior.
- Do not change camera constraints, preview aspect ratio, or JPEG sizing.

## Files

- `src/index.html`: add the preview shutter button.
- `src/styles.css`: add position, appearance, and interaction states.
- `src/app.js`: wire the button and synchronize capture controls.
- `docs/index.html`: regenerate the deployable site with `node build.mjs`.

## Error Handling

Existing capture error handling remains unchanged. A failed capture shows the existing error toast and re-enables both capture controls only when a usable live stream remains.

## Verification

- Confirm that the shutter is bottom-centered, circular, and does not alter the preview aspect ratio.
- Exercise the real `captureLive()` path through both buttons and confirm that only one JPEG is produced per activation.
- Confirm that both controls start disabled, become enabled with a live camera, and are disabled during capture.
- Confirm keyboard activation and the accessible name.
- Run `node build.mjs` and `git diff --check`.
