# Epic 04 — Export Engine

## Objective

Generate professional, print-ready PNG, JPG, and PDF files at 300 DPI by reconstructing compositions from original source images and template geometry.

## Requirements

- Never export from the browser preview surface.
- Accept original images plus a validated composition manifest.
- Support PNG, JPG, and PDF output.
- Produce lossless PNG, high-quality JPG, and physical-size PDF pages.
- Support 2×6, 4×6, 5×7, 6×8, and bounded custom print sizes.
- Provide safe-area, bleed-area, and crop-mark preview guides.
- Support filename, quality, sRGB profile, and future CMYK extension points.
- Separate `ExportService`, `RenderEngine`, `PrintCanvas`, and `ImageComposer` responsibilities.
- Save output in a session-isolated location under `exports/`.

## Acceptance Criteria

- [ ] Only a valid, unexpired session can request an export.
- [ ] Template IDs, paths, dimensions, uploads, and filenames are validated.
- [ ] Output pixel dimensions and metadata match the requested physical size at 300 DPI.
- [ ] PNG, JPG, and PDF outputs open successfully and preserve composition geometry.
- [ ] Original image detail is used independently of preview resolution.
- [ ] Concurrent sessions cannot read or overwrite each other's output.
- [ ] Errors are explicit and do not leave ambiguous job state.

## Notes

- Current repository status: synchronous server rendering is implemented.
- Durable jobs, idempotency, progress, object storage, ICC profiles, CMYK, and golden-image testing remain evolving.
- Placeholder: `[Define calibrated printer profiles and acceptable pixel-diff thresholds.]`
