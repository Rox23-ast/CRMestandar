# AI Context Engineering Template: AGENTS.md

Use this template to create an `AGENTS.md` file in the root of any new repository. This file serves as the core instruction manual for AI agents (like Claude, Cursor, Copilot, or ChatGPT) assisting in your project.

---

## Template: Paste this into `[your-project-root]/AGENTS.md`

```markdown
# Project: [Project Name]

## Tech Stack
- Language/Framework: [e.g., Node.js / React / TypeScript / .NET 10]
- State Management: [e.g., Redux / Zustand]
- Styles: [e.g., Tailwind CSS / CSS Modules]
- Database / ORM: [e.g., PostgreSQL / Prisma / EF Core]
- Test Runner: [e.g., Jest / Vitest / xUnit]

## Standard CLI Commands
- Build: `[e.g., npm run build | dotnet build]`
- Test: `[e.g., npm run test | dotnet test]`
- Lint/Format: `[e.g., npm run lint | dotnet format]`
- Run App: `[e.g., npm run dev | dotnet run]`

## Architecture & Code Conventions
- [e.g., Always use TypeScript strict mode]
- [e.g., Keep presentation components separate from business logic hooks]
- [e.g., Spanish for User Interface / English for code, variables, and logs]
- [e.g., Favor functional components with Hooks over class components]

## Safety & Security Boundaries
- NEVER commit secrets, API keys, or connection strings (use .env or User Secrets)
- Never use packages or libraries not explicitly listed in package.json/csproj without permission.
- Always run the local validation scripts (e.g., linting & tests) before completing a task.
```

---

## Best Practices for Context Engineering

1. **Keep it Updated**: As you adopt new technologies or change architectures, update `AGENTS.md`. It is the source of truth for your AI assistant.
2. **Pre-Task Verification**: Encourage the AI agent to read `AGENTS.md` and `CLAUDE.md` at the start of any new session or feature branch.
3. **Minimize Noise**: Do not paste whole 10,000-line documentation files into the AI context. Instead, refer to specific patterns or file names inside the project that represent "gold standards" of how to implement things.
