# SelfBooth Coding Guidelines

## 1. Purpose

These standards apply to customer web, administrator web, API, workers, and shared contracts. They prioritize correctness, maintainability, session isolation, touch accessibility, and predictable print behavior.

## 2. Component Structure

- Keep components focused on one responsibility.
- Prefer typed props and composition over implicit global dependencies.
- Put route-level orchestration in `pages/`; keep reusable presentation in `components/`.
- Keep feature-specific components inside their feature directory until they are genuinely shared.
- Extract hooks for reusable stateful behavior and services for I/O boundaries.
- Avoid components that combine data access, complex domain mutation, and extensive rendering.
- Use semantic HTML before adding ARIA workarounds.
- Keep destructive actions explicit, confirmable where appropriate, and visually distinct.

Suggested feature shape:

```text
features/example/
├── components/
├── hooks/
├── model/
├── pages/
├── services/
├── store/
├── types.ts
└── ExampleApp.tsx
```

Only create directories that the feature actually needs.

## 3. Folder Naming

- Use lowercase kebab-case for feature folders when a name contains multiple words: `template-builder/`.
- Preserve established top-level names such as `client/`, `server/`, and `templates/`.
- Use plural nouns for collections: `components/`, `pages/`, `hooks/`, `services/`.
- Template package folders use stable lowercase kebab-case IDs: `classic-4/`.
- Do not create generic dumping grounds such as `misc/`, `common/`, or `helpers/`.

## 4. TypeScript Rules

- Keep strict TypeScript enabled; do not weaken compiler settings to accommodate a change.
- Avoid `any`. Use `unknown` at untrusted boundaries and narrow it deliberately.
- Define explicit transport and persisted-document contracts.
- Prefer discriminated unions for finite states and element variants.
- Use `import type` when an import is erased at runtime.
- Treat optionality precisely; do not use optional fields as undocumented state variants.
- Validate data crossing HTTP, storage, environment, upload, and template-package boundaries.
- Do not use non-null assertions unless an invariant is locally proven and documented.
- Model units in names when ambiguity is possible, such as `widthInches`, `bleedInches`, or `expiresAt`.
- Preserve schema versions for persisted or externally exchanged documents.

## 5. React Best Practices

- Use function components and hooks.
- Keep render functions pure; perform subscriptions, object URL cleanup, and external effects in effects.
- Derive values during render when they do not need independent state.
- Avoid mirroring props into state unless the component intentionally owns an editable snapshot.
- Use stable identifiers as keys; never use array indexes for reorderable domain collections.
- Keep context providers scoped to consumers that require them.
- Lazy-load large administrator or operational features that customer paths do not need.
- Prefer reducer-based transitions for complex documents and undoable editing.
- Revoke temporary object URLs when their owning lifecycle ends.
- Handle loading, empty, error, expired-session, and unavailable-service states explicitly.

## 6. State Management

- Use local component state for isolated UI state.
- Use context for low-frequency cross-tree dependencies such as branding and session identity.
- Use immutable reducers for document editing, undo/redo, and deterministic state transitions.
- Introduce a dedicated store library only when scope, persistence, or synchronization complexity justifies it.
- Keep server state separate from ephemeral UI state.
- Ensure synchronized state is serializable and versioned.
- Never trust browser state as proof of authorization or job completion.
- Scope customer state, cache keys, storage keys, and requests by session ID.

## 7. Naming Convention

| Construct | Convention | Example |
| --- | --- | --- |
| React component | PascalCase | `TemplateCanvas` |
| Component file | PascalCase | `TemplateCanvas.tsx` |
| Hook | `use` + PascalCase | `useTemplateHistory` |
| Service/class | PascalCase | `ExportService` |
| Function/variable | camelCase | `createTemplateDocument` |
| Boolean | Positive `is`/`has`/`can` | `isPublished`, `canUndo` |
| Constant | camelCase by default | `sessionLifetimeMs` |
| Environment variable | SCREAMING_SNAKE_CASE | `SESSION_SECRET` |
| Template/package ID | lowercase kebab-case | `film-strip` |
| Route segment | lowercase kebab-case | `/admin/templates` |
| Event name | domain-oriented past/present tense | `photo.discovered` |

Use domain language consistently: `template`, `slot`, `composition`, `session`, `export`, and `print job` have distinct meanings.

## 8. File Organization

- Keep one primary exported component, hook, or class per file when practical.
- Co-locate private helpers with their only consumer.
- Move helpers to a shared module only after a second real consumer appears.
- Keep browser and server implementations in their respective workspaces.
- Place shared transport schemas in a deliberate shared package if cross-workspace duplication becomes risky.
- Store each print template as a self-contained versioned package.
- Do not commit runtime photos, exports, secrets, build output, or local environment files.
- Add tests adjacent to the owned module or in a clearly mirrored test tree.

## 9. Import Rules

- Order imports as: platform/external modules, workspace modules, relative modules, styles/assets.
- Separate type-only imports using `import type`.
- Avoid deep imports into another feature's private directories.
- Import through the owning feature's public entry point when one exists.
- Prevent circular dependencies; lower-level domain modules must not import route or UI modules.
- Do not introduce path aliases unless they reduce demonstrated complexity and work consistently across Vite, TypeScript, tests, and Node.
- Use explicit `.js` extensions in Node ESM source imports as required by `NodeNext`.

## 10. Performance Guidelines

- Optimize measured bottlenecks, not hypothetical ones.
- Lazy-load admin and operational surfaces from customer bundles.
- Avoid decoding full-resolution originals solely for thumbnail grids.
- Generate and cache thumbnails for production photo ingestion.
- Keep pointer-move work small and avoid unnecessary whole-tree rerenders.
- Use passive or carefully scoped event handling unless interaction requires cancellation.
- Offload high-resolution composition and CPU-intensive processing from the browser UI thread.
- Bound upload counts, file sizes, image dimensions, history depth, and queue concurrency.
- Clean up listeners, timers, subscriptions, and object URLs.
- Track bundle size, interaction latency, export duration, memory, and queue depth in production.

## 11. Accessibility Guidelines

- Target WCAG 2.2 AA for customer and administrator experiences.
- Use semantic headings, landmarks, buttons, inputs, labels, and dialogs.
- Ensure all actions are keyboard accessible and have visible focus indicators.
- Maintain a minimum 44 × 44 CSS-pixel touch target for primary interactions.
- Provide meaningful accessible names for icon-only controls.
- Do not rely on color alone for state, selection, errors, or print-guide meaning.
- Manage focus when opening and closing bottom sheets, galleries, and dialogs.
- Respect `prefers-reduced-motion` and avoid essential information conveyed only through animation.
- Provide useful image alternative text; use empty alt text for purely decorative brand assets.
- Announce asynchronous export, upload, and future print status changes appropriately.

## 12. Responsive Design Rules

- Design from the smallest supported viewport first.
- Keep primary customer actions reachable with one hand and clear of device safe areas.
- Use fluid layouts and content-driven breakpoints rather than device-specific assumptions.
- Avoid horizontal scrolling in customer flows.
- Preserve template aspect ratio independently of viewport size.
- Do not make desktop-only hover the sole way to discover an action.
- Test touch, mouse, keyboard, portrait, landscape, and browser zoom.
- Admin panels may reflow or collapse, but all editing operations must remain available on supported widths.
- Use `dvh` and safe-area insets where mobile browser chrome affects fixed controls.

## 13. API, Security, and Storage Rules

- Validate every untrusted input at the process boundary.
- Authorize every administrator mutation on the server.
- Derive tenant and session scope from verified credentials, not only request bodies.
- Constrain filesystem paths against known roots and use safe generated filenames.
- Set limits on uploads, requests, rendering dimensions, and concurrent jobs.
- Keep secrets in runtime configuration and require strong production values.
- Avoid logging tokens, full customer images, or sensitive personal data.
- Use idempotency keys for exports, QR joins, and print jobs where retries are possible.
- Define retention and deletion behavior for customer media and output.

## 14. Testing and Quality Gates

Every change should run the relevant subset of:

```bash
npm run typecheck
npm run lint
npm run build
```

New business behavior should add tests at the lowest useful level:

- Unit tests for pure transforms, reducers, validators, and state machines.
- Integration tests for API boundaries, persistence, and rendering modules.
- Golden-image tests for template and export parity.
- End-to-end tests for customer, administrator, QR, and print workflows.
- Accessibility checks for critical pages and dialogs.

## 15. Git Commit Convention

Use Conventional Commits:

```text
<type>(optional-scope): concise imperative summary
```

Allowed common types:

- `feat`: user-visible capability
- `fix`: defect correction
- `refactor`: structural change without behavior change
- `docs`: documentation only
- `test`: tests only
- `perf`: measured performance improvement
- `build`: build or dependency changes
- `ci`: continuous-integration changes
- `chore`: maintenance that fits no other type

Examples:

```text
feat(editor): add constrained pinch zoom
fix(export): preserve landscape print dimensions
docs(architecture): define print queue boundary
```

Keep commits focused and independently understandable. Explain breaking changes in the footer using `BREAKING CHANGE:`. Do not mix unrelated formatting or refactoring into feature commits.

## 16. Definition of Done

A change is complete when:

- Its behavior and boundaries match the relevant epic acceptance criteria.
- Types, lint, build, and applicable tests pass.
- Loading, error, empty, responsive, and accessible states are addressed.
- Security, session isolation, storage, and cleanup implications are considered.
- Documentation and contracts are updated when architecture or public behavior changes.
- No secrets, runtime customer data, or generated artifacts are committed.
