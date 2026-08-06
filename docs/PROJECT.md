# SelfBooth Project

**Document status:** Source of truth  
**Product:** SelfBooth  
**Current brand configuration:** Cá Space (`caspace.vn`)  
**Production customer origin:** `https://booth.caspace.vn`

## Project Overview

SelfBooth is a public, mobile-first web application for self-photo booth studios. It guides a customer through a focused print workflow: choose a template, add booth or phone photos, adjust each photo, preview the composition, and request a high-resolution print file.

SelfBooth is not a general photo gallery. Its interface prioritizes short studio sessions, large touch targets, minimal decisions, and reliable print output. Each customer receives a unique signed session, and session-owned data must remain isolated when multiple customers use the system concurrently.

The project also contains an administrator-facing Template Studio for visually creating and managing data-driven print layouts. Administrator capabilities are kept separate from the customer experience.

## Vision

SelfBooth should become the dependable software layer between a studio camera, the customer's creative choices, and the physical printer. The platform should:

- Feel immediate and intuitive on a customer's phone or studio touchscreen.
- Produce repeatable, print-accurate output from original image sources.
- Let studio teams create branded layouts without engineering support.
- Support white-label deployments without coupling product behavior to one brand.
- Scale from a single studio workstation to multiple studios and concurrent cloud sessions.
- Add capture, QR handoff, print orchestration, and intelligent image placement through modular services.

## Target Users

### Customers

Studio visitors who choose a print design, provide photos, compose a print, and continue to export or printing. They need a fast, forgiving, touch-first experience and may use either a studio device or their own phone.

### Studio Administrators

Authorized staff who create, edit, publish, archive, duplicate, and organize print templates. They require a visual studio with reusable layers, precise canvas controls, and predictable template packages.

### Studio Operators

Future operational users who monitor camera ingestion, active sessions, export status, and the print queue. Their workflow must not expose one customer's content to another customer.

### Platform Engineers and Operators

Teams responsible for deployment, availability, storage, security, observability, and future multi-studio integrations.

## Main Features

### Available foundation

- Responsive customer template selection and preview.
- Data-driven print layouts loaded from versioned template packages.
- SelfBooth placeholder gallery and native phone image selection.
- Ordered auto-fill, random fill, shuffle, replace, and clear actions.
- Drag, pinch zoom, mouse-wheel zoom, rotation, and transform reset.
- Print preview with safe-area, bleed-area, and crop-mark guides.
- Original-source server rendering to PNG, JPG, and PDF at 300 DPI.
- HMAC-signed, expiring customer sessions and session-isolated exports.
- White-label branding through a typed provider and centralized configuration.
- Role-gated, lazy-loaded Admin Template Studio with local draft persistence.
- Visual template canvas, layers, object controls, undo/redo, and package generation.

### Planned capabilities

- Camera-folder watching and real-time photo delivery.
- QR-based cross-device session handoff.
- Server-verified administrator authentication and template persistence.
- Durable print queue and printer adapters.
- AI-assisted face-aware crop and smart fill.
- Multi-studio cloud storage, auditability, and observability.

## Tech Stack

| Area | Current technology | Role |
| --- | --- | --- |
| Customer and admin web | React 19, TypeScript, Vite | Responsive browser applications |
| Styling | Tailwind CSS | Mobile-first design system and layout |
| API | Node.js 22, Express 5 | Sessions, export requests, static delivery |
| Realtime foundation | Socket.IO | Reserved for future photo/session events |
| Image rendering | Sharp | High-resolution composition and encoding |
| PDF generation | pdf-lib | Physical-size PDF output |
| Validation and security | Helmet, rate limiting, Multer limits | API boundary protection |
| Packaging | npm workspaces, Docker | Local development and production builds |
| Planned editor/state tools | Konva, Zustand | Print-accurate interaction and scalable client state |
| Planned ingestion | Chokidar | Camera-folder observation |

## Folder Structure

```text
selfbooth/
├── client/                  # React customer and administrator frontend
│   └── src/
│       ├── components/      # Shared UI, editor, template, export, and branding components
│       ├── config/          # Runtime-replaceable product configuration defaults
│       ├── contexts/        # Context contracts
│       ├── data/            # Static adapters and sample data
│       ├── features/        # Feature-owned domains, including admin and template builder
│       ├── hooks/           # Reusable application hooks
│       ├── pages/           # Customer route-level pages
│       ├── providers/       # Context providers
│       ├── services/        # Browser-side service adapters
│       └── types/           # Shared frontend contracts
├── server/
│   └── src/
│       ├── export/          # Print canvas, composition, rendering, and persistence
│       └── session/         # Session creation and signature verification
├── templates/               # Versioned template packages and source assets
├── photos/                  # Future camera-capture input; runtime content is ignored
├── exports/                 # Session-isolated generated output; runtime content is ignored
├── assets/                  # Shared non-code assets
├── docs/                    # Long-term product and engineering documentation
├── prompts/                 # Historical epic briefs and acceptance criteria
├── README.md                # Repository entry point and operating commands
├── PROJECT.md               # Legacy architecture summary
└── TASKS.md                 # Legacy implementation checklist
```

The documents under `docs/` are the canonical long-form source of truth. Root documents remain concise repository entry points until they are deliberately consolidated.

## Future Roadmap

Development is organized into ten epics:

1. Foundation
2. Template Selection
3. Interactive Editor
4. Export Engine
5. Admin Template Studio
6. Branding
7. Photo Watcher
8. QR Session
9. Print Queue
10. AI Smart Fill

See [ROADMAP.md](ROADMAP.md) for goals, feature scope, and completion checklists. Architectural decisions and future deployment direction are defined in [ARCHITECTURE.md](ARCHITECTURE.md).

## Product Invariants

- Customer data is always scoped by session identity.
- Exports are rendered from original image sources, never the preview surface.
- Customer and administrator capabilities remain separate.
- Templates are data-driven and must not require layout-specific React branches.
- Mobile interaction is the baseline; larger screens enhance rather than replace it.
- Runtime media, secrets, and generated exports are not committed to source control.
- Future services must preserve compatibility with versioned template and transport contracts.
