# SelfBooth Roadmap

This roadmap defines product epics and their completion criteria. A checked item represents capability present in the current repository; unchecked items remain planned or require production hardening.

## Epic 1 — Foundation

### Goal

Establish a production-oriented monorepo, clear client/server boundaries, responsive application shell, and deployment baseline.

### Features

- npm workspaces for the client and server.
- React, TypeScript, Vite, and Tailwind CSS frontend.
- Node.js, Express, and Socket.IO server foundation.
- Runtime directories for templates, photos, exports, and assets.
- Lint, typecheck, build, Docker, security headers, origin policy, and rate limiting.
- Public deployment assumptions for `booth.caspace.vn`.

### Completion Checklist

- [x] Client and server workspaces build independently.
- [x] Root commands coordinate development and validation.
- [x] Production container serves the built frontend and API.
- [x] Generated runtime content and secrets are excluded from version control.
- [x] Basic health endpoint and HTTP hardening are present.
- [ ] Add automated unit, integration, and end-to-end test suites.
- [ ] Add structured logging, metrics, and deployment runbooks.

## Epic 2 — Template Selection

### Goal

Let customers choose and preview a print layout before beginning composition.

### Features

- Responsive template catalog.
- Thumbnail, name, and slot-count presentation.
- Template preview and continue flow.
- Versioned, auto-discovered template packages.
- Support for portrait, landscape, and custom layouts.

### Completion Checklist

- [x] Template selection and preview pages are available.
- [x] Template packages contain `template.json`, `background.png`, and `thumbnail.png`.
- [x] Slot geometry is loaded from template data rather than hardcoded UI branches.
- [x] The selected template is retained through the customer flow.
- [ ] Replace build-time package discovery with a versioned template catalog API when persistence is introduced.
- [ ] Add production content validation and catalog tests.

## Epic 3 — Interactive Editor

### Goal

Provide a premium, mobile-first editor for placing and adjusting photos inside template slots.

### Features

- Empty-slot source sheet.
- SelfBooth gallery with single and multiple selection.
- Native browser phone-gallery input.
- Ordered auto-fill, random fill, shuffle, and clear actions.
- Drag, pinch zoom, wheel zoom, rotate, replace, remove, and reset.
- Serializable, synchronization-ready editor state.

### Completion Checklist

- [x] Slots render dynamically from template documents.
- [x] Booth and phone source workflows are represented.
- [x] Automatic filling follows top-to-bottom, left-to-right document order.
- [x] Core touch and mouse transforms are available.
- [x] Composition preview is available.
- [ ] Migrate interactive rendering to a print-accurate canvas abstraction where required.
- [ ] Add transform constraints, accessibility tests, and cross-device gesture tests.

## Epic 4 — Export Engine

### Goal

Generate professional print-ready files from original media at predictable physical dimensions.

### Features

- PNG, JPG, and PDF output.
- Lossless PNG and high-quality 4:4:4 JPG encoding.
- 300 DPI output with physical-size PDF pages.
- Safe-area, bleed-area, and crop-mark preview guides.
- Print dimensions, filename, format, quality, and color-profile settings.
- Modular `ExportService`, `RenderEngine`, `PrintCanvas`, and `ImageComposer`.
- Session-isolated output under `exports/{sessionId}/`.

### Completion Checklist

- [x] Server rendering consumes original uploaded images.
- [x] Template geometry is reconstructed independently of the browser preview.
- [x] PNG, JPG, and PDF rendering paths are implemented.
- [x] Export inputs and filesystem paths are constrained.
- [x] Session signatures protect export creation.
- [ ] Add golden-image regression tests and print calibration fixtures.
- [ ] Add durable job execution, status persistence, and object-storage support.
- [ ] Define ICC profile handling and a future CMYK conversion boundary.

## Epic 5 — Admin Template Studio

### Goal

Allow administrators to visually create, edit, organize, preview, and package arbitrary print templates.

### Features

- Admin dashboard and template list.
- Create, edit, duplicate, archive, publish, and delete actions.
- Visual canvas with zoom, pan, selection, multi-select, undo, and redo.
- Unlimited photo slots and reusable text, logo, sticker, shape, QR, and variable elements.
- Layers panel with visibility, locking, naming, selection, and stacking controls.
- Metadata and asset controls.
- Placeholder-photo live preview and template package generation.

### Completion Checklist

- [x] Admin routes and a lazy-loaded studio feature are present.
- [x] Customer builds return a not-found view for admin paths.
- [x] Visual object and layer editing use the shared template document.
- [x] Browser-local draft persistence and package generation are available.
- [ ] Add server-verified administrator authentication and authorization.
- [ ] Add durable template storage, asset lifecycle management, and audit history.
- [ ] Add schema migration, validation, collaborative conflict, and recovery strategies.

## Epic 6 — Branding

### Goal

Make SelfBooth white-label ready while keeping customer-facing brand presentation consistent.

### Features

- Configurable logo, name, website, primary color, secondary color, favicon, and copyright.
- Typed branding provider and reusable brand components.
- Dynamic template variables for brand content.
- Future per-studio runtime configuration.

### Completion Checklist

- [x] Cá Space defaults are centralized in typed configuration.
- [x] Shared customer shells and footers consume branding through context.
- [x] Templates support brand-related dynamic variables.
- [ ] Load branding from validated runtime configuration or tenant settings.
- [ ] Add brand asset hosting, contrast validation, and fallback rules.
- [ ] Define domain, email, and print-branding behavior per tenant.

## Epic 7 — Photo Watcher

### Goal

Safely detect new booth-camera photos and make them available to the correct active session in real time.

### Features

- Configurable local capture directory.
- JPG/JPEG validation and stable-file detection.
- Metadata indexing and deduplication.
- Session-aware photo assignment.
- Real-time delivery and reconnect recovery.

### Completion Checklist

- [ ] Define camera adapter and photo metadata contracts.
- [ ] Implement Chokidar-based stable-file observation.
- [ ] Validate file type, dimensions, size, and safe paths.
- [ ] Associate captures with the correct customer session.
- [ ] Publish idempotent real-time events and provide catch-up queries.
- [ ] Add retention, cleanup, failure recovery, and load tests.

## Epic 8 — QR Session

### Goal

Let customers securely join or transfer an active booth session between studio and personal devices.

### Features

- Short-lived, single-purpose QR join tokens.
- Cross-device session handoff.
- Session status and expiration handling.
- Revocation and replay protection.
- Optional studio-device approval.

### Completion Checklist

- [ ] Define QR token, handoff, and expiration contracts.
- [ ] Bind QR tokens to a server-side session record.
- [ ] Prevent token reuse and cross-session access.
- [ ] Provide accessible scan, manual-code, expiry, and retry states.
- [ ] Test concurrent joins, revocation, clock skew, and reconnect behavior.

## Epic 9 — Print Queue

### Goal

Convert approved exports into observable, retry-safe print jobs without coupling the web request to printer execution.

### Features

- Durable print jobs and explicit state transitions.
- Printer and media-profile configuration.
- Worker-based dispatch and device adapters.
- Retry, cancellation, reprint, and failure reporting.
- Operator queue and audit trail.

### Completion Checklist

- [ ] Define the print job state machine and idempotency keys.
- [ ] Persist jobs independently of API processes.
- [ ] Implement a studio printer adapter contract.
- [ ] Add operator authorization and queue controls.
- [ ] Add retries with bounded backoff and dead-letter handling.
- [ ] Record job, printer, output, and operator audit events.

## Epic 10 — AI Smart Fill

### Goal

Assist customers with fast, high-quality photo selection and face-aware placement while preserving manual control.

### Features

- Face and subject-aware crop suggestions.
- Image quality and duplicate detection.
- Template-aware photo ranking.
- Smart slot assignment.
- Manual override and privacy controls.

### Completion Checklist

- [ ] Define measurable quality, latency, and privacy requirements.
- [ ] Establish a provider-neutral inference boundary.
- [ ] Require explicit fallbacks when inference is unavailable.
- [ ] Preserve originals and non-destructive transform metadata.
- [ ] Add consent, retention, and regional processing policies.
- [ ] Evaluate suggestions with representative studio datasets and human review.
