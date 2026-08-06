# SelfBooth Roadmap

## Foundation

- [x] Create client and server workspaces
- [x] Configure React, TypeScript, Vite, and Tailwind CSS
- [x] Configure Express and Socket.io application shell
- [x] Add repository documentation and runtime directories

## Photo ingestion

- [ ] Define photo metadata and real-time event contracts
- [ ] Watch the configured capture folder with Chokidar
- [ ] Validate and index JPG/JPEG files safely
- [ ] Stream new-photo events to connected clients

## Template editor

- [x] Define typed frontend print-template models
- [x] Add responsive template and photo browsers
- [x] Add local template selection and composition state
- [x] Add phone image selection and ordered auto-fill
- [x] Add zoom, pan, rotate, replace, remove, and reset controls
- [x] Add configurable customer-facing branding and shared footer
- [x] Load ordered slot definitions from validated template JSON
- [x] Add pinch and mouse-wheel zoom gestures
- [x] Centralize synchronization-ready editor and gallery selection state
- [x] Add distinct random-fill and shuffle actions
- [x] Replace layout branches with coordinate-based template rendering
- [x] Auto-discover self-contained template packages and assets
- [x] Add dynamic brand, website, date, time, QR, and custom-text layers
- [x] Add immutable Admin Template Builder domain operations
- [x] Add shared drag-and-drop builder preview foundation
- [x] Add role-gated Admin Template Studio routes and frontend draft persistence
- [x] Add visual canvas, layers, history, object tools, live preview, and package generation
- [ ] Replace the build-time admin gate with server-verified authentication and persistence
- [ ] Migrate composition rendering to Konva for print-accurate output
- [ ] Evaluate Zustand when state must persist across sessions or routes

## Export and operations

- [x] Render 300-DPI PNG and JPG files with Sharp
- [x] Generate physical-size PDF files
- [x] Add safe-area, bleed-area, and crop-mark preview guides
- [x] Add print size, format, profile, filename, and quality settings
- [x] Persist exports in signed session-isolated directories
- [x] Add export status and error reporting
- [x] Add public deployment security headers, origin policy, and rate limits
- [ ] Add structured logging, health checks, and automated tests
- [ ] Document deployment and studio-machine setup

## Future

- [ ] Add QR-based customer sessions
- [ ] Add direct printing support
