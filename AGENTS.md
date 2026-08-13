# Project: Mudanzas Chico Backend

## Tech Stack
- Language/Framework: Node.js / Express / TypeScript
- State Management: N/A (Backend)
- Styles: N/A
- Database / ORM: SQLite / Prisma
- Test Runner: Jest (ts-jest)
- Deploy: Docker / Nginx / DigitalOcean

## Standard CLI Commands
- Build: `npm run build`
- Test: `npm run test`
- Lint/Format: `npx eslint .` (To be configured)
- Run App: `npm run dev`

## Architecture & Code Conventions
- Always use TypeScript strict mode.
- Domain-Driven Design structure: keep Bot, CRM, and Cotizador separated in `src/`.
- Spanish for User Interface / English for code, variables, and logs.
- Validation is mandatory using `zod` for all inputs.
- Authentication for CRM/Cotizador must use JWT.

## Documentación Viva (OBLIGATORIO)
- **Después de implementar cualquier característica nueva, debes iterar y actualizar obligatoriamente el archivo `ARCHITECTURE.md` en la raíz del proyecto.** 

## Safety & Security Boundaries
- NEVER commit secrets, API keys, or connection strings (use `.env`).
- Never use packages or libraries not explicitly listed in package.json without permission.
- Always run the local validation scripts (e.g., linting & tests) before completing a task.
