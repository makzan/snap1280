# Aspect Ratio Presets Design

## Goal

Let users choose the saved JPEG's aspect ratio and exact dimensions while keeping the camera preview consistent with the saved photo. Support camera capture and uploaded images through the same sizing and cropping behavior.

## Presets and UI

- Add a labeled native select control to the existing toolbar with three options:
  - `Camera 9:16 — 720×1280`
  - `A4 portrait — 905×1280`
  - `Square — 1280×1280`
- Default to Camera 9:16.
- A4 is portrait only; landscape and custom ratios are out of scope.
- Show the selected output dimensions in the existing size badge.
- Use native select behavior for mouse, touch, and keyboard accessibility.

## Preview and Export Behavior

- Define the three presets in one shared configuration so the UI, preview, size badge, and JPEG encoder cannot disagree.
- When the selection changes, immediately update the preview stage to the selected aspect ratio and show the corresponding output dimensions.
- Fill the preview with the video using a center crop rather than stretching it. Retain the existing front-camera mirroring.
- Encode every capture or upload at the preset's exact dimensions, including when the source is smaller than the target.
- Center-crop the source to the preset ratio, then scale the cropped region to fill the output canvas. Do not add borders and do not distort the image.
- Apply the currently selected ratio when Capture is activated or an uploaded image is processed. Existing shots retain their original dimensions.
- Preserve the existing JPEG quality, filename format, downloads, thumbnails, camera controls, and busy/error handling.

## Files

- `src/photo.js`: add shared presets and center-crop encoding.
- `src/app.js`: connect the selector to preview, badge, capture, and upload paths.
- `src/index.html`: add the labeled selector.
- `src/styles.css`: style the selector and make the preview crop fill its stage.
- `README.md`: update the sizing description.
- `docs/index.html`: regenerate the deployable site with `node build.mjs`.

## Error Handling

Keep existing camera, upload, and canvas errors unchanged. Invalid source dimensions continue to fail rather than producing an invalid canvas.

## Verification

- Verify all three presets produce JPEGs at exactly 720×1280, 905×1280, and 1280×1280 from landscape, portrait, and square sources.
- Confirm cropping is centered and does not stretch the source.
- Confirm preview ratio and size badge update immediately when the selection changes.
- Exercise both live camera capture and image upload with the selected preset.
- Confirm existing capture controls, downloads, and thumbnails still work.
- Run `node build.mjs` and `git diff --check`.
