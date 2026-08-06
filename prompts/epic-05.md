# Epic 05 — Admin Template Studio

## Objective

Provide administrators with a visual studio for creating, editing, previewing, organizing, and packaging arbitrary print templates while keeping administrator capabilities unavailable to customers.

## Requirements

- Provide `/admin`, `/admin/templates`, `/admin/templates/new`, and `/admin/templates/:id/edit` surfaces.
- Support create, edit, duplicate, archive, publish, and delete workflows.
- Capture name, category, description, print size, canvas size, DPI, orientation, and assets.
- Provide visual zoom, pan, selection, multi-select, duplicate, delete, undo, and redo.
- Support unlimited photo slots with geometry, rotation, radius, aspect lock, opacity, and stacking.
- Support background, photo, text, logo, sticker, shape, QR, and dynamic-variable layers.
- Provide visibility, locking, renaming, selection, and reordering in a layers panel.
- Support text styling, rectangle, circle, line, and custom SVG preparation.
- Provide placeholder-photo live preview.
- Generate `template.json`, `background.png`, and `thumbnail.png` package artifacts.
- Keep templates data-driven and avoid layout-specific UI branches.

## Acceptance Criteria

- [ ] Customer deployments do not expose or load administrator screens.
- [ ] Production administrator mutations require server-verified authentication and authorization.
- [ ] Editing operations are undoable, deterministic, and preserve valid document state.
- [ ] Layer controls update the selected object without changing unrelated layers.
- [ ] Published packages validate against the canonical versioned schema.
- [ ] Customer preview and server export interpret published geometry consistently.
- [ ] Drafts, assets, revisions, and publication status survive browser restarts through durable storage.

## Notes

- Current repository status: frontend studio and browser-local draft persistence are implemented; authentication and backend persistence were intentionally excluded from the initial epic.
- Build-time role gating is defense in depth, not authorization.
- Schema unification, SVG sanitization, asset storage, revisioning, audit history, and collaborative conflict handling remain evolving.
- Placeholder: `[Define administrator identity provider, roles, approval workflow, and template revision policy.]`
