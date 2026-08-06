# Epic 02 — Template Selection

## Objective

Create a focused customer flow for choosing and previewing a data-driven print template before entering the photo editor.

## Requirements

- Present template thumbnail, name, and photo-slot count.
- Support examples such as Classic 4 Cut, Portrait 3, Film Strip, Wedding, Birthday, and Magazine without hardcoded layout branches.
- Require an explicit customer selection before continuing.
- Provide a template preview step and navigation into the editor.
- Load versioned template documents and package-local assets.
- Support arbitrary portrait, landscape, square, and custom canvas geometry.
- Preserve a mobile-first, accessible, large-touch-target experience.

## Acceptance Criteria

- [ ] Available template packages appear automatically in the catalog.
- [ ] A customer can select, preview, and continue with one template.
- [ ] The chosen template and ordered slots are available to the editor.
- [ ] Invalid template documents fail safely and do not break the catalog.
- [ ] Customer pages work across supported phone and desktop viewports.
- [ ] Adding a valid custom layout does not require a new React layout branch.

## Notes

- Current repository status: implemented with build-time template discovery.
- Future catalog persistence, categories, search, pagination, and revision behavior are evolving.
- Placeholder: `[Define the canonical template catalog API and publication cache policy.]`
