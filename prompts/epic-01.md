# Epic 01 — Foundation

## Objective

Establish the production-ready foundation for SelfBooth as a public, mobile-first self-photo booth application with clear frontend, backend, runtime-storage, and documentation boundaries.

## Requirements

- Create npm workspaces for a React/TypeScript/Vite/Tailwind client and Node.js/Express/Socket.IO server.
- Establish `client/`, `server/`, `docs/`, `templates/`, `photos/`, `exports/`, and `assets/` boundaries.
- Provide lint, typecheck, build, development, and production commands.
- Configure secure environment handling, generated-content exclusions, and public deployment assumptions.
- Keep business logic out of the initial scaffold.
- Prepare the application for desktop and mobile use.
- Preserve explicit boundaries for future Konva, Zustand, Chokidar, and Sharp integrations.

## Acceptance Criteria

- [ ] A clean install succeeds on the documented Node.js and npm versions.
- [ ] Client and server typecheck, lint, and build successfully.
- [ ] The production process serves the frontend and API over a configurable port.
- [ ] Environment secrets and runtime media are excluded from version control.
- [ ] The folder structure and ownership rules are documented.
- [ ] No feature-specific business logic is introduced by foundational scaffolding.

## Notes

- Current repository status: substantially implemented.
- Deployment platform, CI provider, automated-test framework, and observability stack remain evolving decisions.
- Placeholder: `[Record the selected production hosting platform and operational owner.]`
