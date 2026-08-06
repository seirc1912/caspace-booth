# SelfBooth Project

## Scope

SelfBooth is a public customer application supporting a studio workflow from camera capture through layout composition and high-resolution export. Desktop and mobile browsers are first-class targets. Every browser receives a signed, expiring session identity; customer output is isolated by session ID.

## Architecture

```text
client/       React, TypeScript, Vite, and Tailwind CSS application
server/       Node.js, Express, and Socket.io service
docs/         Product and technical documentation
templates/    Print-template definitions and source assets
photos/       Local captured-photo input
exports/      Generated print-ready output
assets/       Shared non-code project assets
```

The client and server are independent npm workspaces. UI concerns remain in the client; filesystem access, image processing, and real-time transport remain in the server. Business rules should be isolated from framework and infrastructure code as features are introduced.

Customer-facing branding is supplied through a typed React provider. The active configuration lives in `client/src/config/branding.ts`; pages consume brand components and CSS tokens rather than embedding tenant values. A future runtime configuration loader can replace this object without changing customer pages.

The customer workflow is template-first: select a template, preview it, fill each frame from SelfBooth or the phone's native image picker, review the finished composition, and export one print-ready PNG. The application is not a general-purpose photo gallery.

## Planned technology

- Konva for interactive print-layout composition
- Zustand for client state management
- Chokidar for local photo-folder observation
- Sharp for high-resolution image processing and PNG export

These packages are deferred until their corresponding features are implemented.

## Current frontend

The frontend uses local typed React state and sample booth media. It includes template selection, an interactive editor, a source bottom sheet, a fullscreen selection gallery, native multi-image input, ordered auto-fill, random fill, shuffle, and composition preview. Pointer transforms support touch pinch, drag, mouse-wheel zoom, rotation, and reset. No request is made to the SelfBooth server and no export or printing behavior is present.

Each print template is a self-contained folder under `templates/` with `template.json`, `background.png`, and `thumbnail.png`. Vite discovers template packages automatically at build time; a typed adapter validates the versioned document before it reaches the shared `TemplateSurface` renderer. Slot geometry uses canvas coordinates, so arbitrary portrait, landscape, square, and custom layouts require no React changes.

The template-builder domain foundation lives under `client/src/features/template-builder/`. Its immutable reducer supports document creation and editing, slot creation/deletion/duplication, geometry, rotation, radius, aspect locking, grid snapping, stacking order, and variable layers. Asset helpers prepare validated PNG packages and JSON serialization for a future persistence API. `TemplateBuilderPreview` shares the production renderer and accepts dropped placeholder media.

Editor state is centralized and serializable so a future synchronization layer can transmit template selection, selected media IDs, current slot, and per-slot transforms without coupling components to a backend.

## Admin Template Studio

The admin feature is isolated under `client/src/features/admin/` and loaded as a separate lazy chunk. Its dashboard, template list, visual editor, layer tree, immutable history, asset inputs, live preview, and template-package generator reuse the production template document and renderer. Arbitrary canvas geometry, unlimited photo slots, text, shapes, stickers, logos, QR placeholders, and dynamic variables are data-driven rather than tied to preset layouts.

Drafts currently persist in browser storage because this epic intentionally excludes backend persistence. Set `VITE_APP_ROLE=admin` only in the protected admin deployment. Customer builds do not expose or load the studio, but this compile-time gate is not a substitute for authorization; a future persistence API must verify an administrator identity for every mutation.

## Export architecture

The browser submits original image blobs and a composition manifest; it never rasterizes the visible preview. Server-side `PrintCanvas`, `ImageComposer`, `RenderEngine`, and `ExportService` modules reconstruct the print at 300 DPI and persist PNG, JPG, or PDF output to `exports/{sessionId}/`. PNG uses lossless compression, JPG uses 4:4:4 high-quality encoding, and PDF pages preserve physical dimensions.

Session IDs are UUIDs issued with an HMAC-signed expiry token. Validation is stateless, allowing concurrent users and multiple application instances without shared session memory. Production must supply a strong `SESSION_SECRET`, mount `exports/` on persistent storage, terminate TLS at the platform or reverse proxy, and route same-origin `/api` traffic to the Node service. If multiple instances write exports, the persistent volume must be shared or replaced by an object-storage adapter.

## Operating principles

- Validate configuration at process boundaries.
- Keep generated photos and exports out of version control.
- Keep transport contracts typed and explicit.
- Prefer feature-focused modules over global utility layers.
- Add automated checks alongside each feature.
- Treat local files as untrusted input and constrain all filesystem paths.
