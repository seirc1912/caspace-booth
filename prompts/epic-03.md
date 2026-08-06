# Epic 03 — Interactive Editor

## Objective

Build a premium, minimal, mobile-first composition editor where customers fill template slots from booth or phone photos and make simple non-destructive adjustments.

## Requirements

- Render every photo slot dynamically from the selected template document.
- Open a native-looking source sheet when an empty or replaceable slot is activated.
- Support SelfBooth gallery single/multiple selection and native `image/*` phone selection.
- Fill empty slots in top-to-bottom, left-to-right document order.
- Provide auto fill, random fill, shuffle, clear, replace, and remove actions.
- Support drag/pan, pinch zoom, mouse-wheel zoom, rotation, and double-tap reset.
- Keep transforms serializable for future backend synchronization.
- Preserve original image references for later high-resolution export.

## Acceptance Criteria

- [ ] Empty slots clearly communicate how to add a photo.
- [ ] Booth and phone selections fill only valid target or empty slots.
- [ ] Repeated random fill can produce a different valid combination.
- [ ] Touch and mouse transforms remain constrained and non-destructive.
- [ ] Replace and remove actions preserve unrelated slots.
- [ ] The editor provides accessible controls and responsive layouts.
- [ ] Composition state can be serialized without DOM or canvas objects.

## Notes

- Current repository status: core interactions implemented with React pointer events and local state.
- Konva adoption, transform constraints, synchronization, recovery, and automated gesture tests remain evolving.
- Placeholder: `[Define supported browser/device matrix and gesture tolerance values.]`
