---
name: documentation-and-adrs
description: Records decisions and documentation. Use when making architectural decisions, changing public APIs, shipping features, or when you need to record context that future engineers and agents will need to understand the codebase.
---

# Documentation and ADRs

## Overview

Document decisions, not just code. The most valuable documentation captures the *why* — the context, constraints, and trade-offs that led to a decision. Code shows *what* was built; documentation explains *why it was built this way* and *what alternatives were considered*. This context is essential for future humans and agents working in the codebase.

## When to Use

- Making a significant architectural decision
- Choosing between competing approaches
- Adding or changing a public API
- Shipping a feature that changes user-facing behavior
- Onboarding new team members (or agents) to the project
- When you find yourself explaining the same thing repeatedly

**When NOT to use:** Don't document obvious code. Don't add comments that restate what the code already says. Don't write docs for throwaway prototypes.

## Architecture Decision Records (ADRs)

ADRs capture the reasoning behind significant technical decisions. They're the highest-value documentation you can write.

### When to Write an ADR

- Choosing a framework, library, or major NuGet dependency
- Designing a data model or database schema
- Selecting an authentication strategy
- Deciding on an API architecture / routing pattern
- Choosing between build tools, hosting platforms, or infrastructure
- Any decision that would be expensive to reverse

### ADR Template

Store ADRs in `docs/decisions/` with sequential numbering:

```markdown
# ADR-001: Use SQLite for local development database

## Status
Accepted | Superseded by ADR-XXX | Deprecated

## Date
2026-07-09

## Context
We need a local database for Clinical Lab system development. Key requirements:
- Relational data model (patients, orders, results with relationships)
- ACID transactions for clinical state changes
- Support for fast local teardown/seed in developer workspaces
- Zero-install configuration for onboarding new developers

## Decision
Use SQLite with EF Core migrations for development, with SQL Server targeted for production.

## Alternatives Considered

### PostgreSQL
- Pros: Excellent JSON features, matches production behavior closely
- Cons: Requires running a local Docker container or service
- Rejected: Added friction to local workspace setup

### In-Memory EF Provider
- Pros: Extremely fast, zero configuration
- Cons: Does not support relational constraints (foreign keys), can't test actual SQL queries
- Rejected: Led to tests passing locally while failing on real databases

## Consequences
- EF Core manages migrations across SQLite and SQL Server targets
- Developers can reset local databases instantly by deleting the `.db` file
- SQLite constraints are enforced locally, catching relational bugs early
```

### ADR Lifecycle

```
PROPOSED → ACCEPTED → (SUPERSEDED or DEPRECATED)
```

- **Don't delete old ADRs.** They capture historical context.
- When a decision changes, write a new ADR that references and supersedes the old one.

## Inline Documentation

### When to Comment

Comment the *why*, not the *what*:

```csharp
// BAD: Restates the code
// Increment counter by 1
counter += 1;

// GOOD: Explains non-obvious intent
// Rate limit uses a sliding window — reset counter at window boundary,
// not on a fixed schedule, to prevent burst attacks at window edges
if (now - windowStart > WindowSizeMs) {
  counter = 0;
  windowStart = now;
}
```

### When NOT to Comment

```csharp
// Don't comment self-explanatory code
decimal CalculateTotal(List<CartItem> items) {
  return items.Sum(item => item.Price * item.Quantity);
}

// Don't leave TODO comments for things you should just do now
// TODO: add error handling  ← Just add it

// Don't leave commented-out code
// var oldVal = GetOldValue();  ← Delete it, git has history
```

### Document Known Gotchas

```csharp
/**
 * IMPORTANT: This operation is not thread-safe.
 * It must be executed within a locked scope or from the main thread
 * to avoid UI state synchronization corruption in Blazor Server.
 */
public void UpdateDockingLayout(LayoutState state) {
  // ...
}
```

## API Documentation

For public APIs (REST controllers, library interfaces):

### XML Documentation Comments (Preferred for C#)

```csharp
/// <summary>
/// Creates a new patient record in the database.
/// </summary>
/// <param name="command">Patient creation parameters (FullName and DocumentId required)</param>
/// <returns>The created PatientDto containing the server-assigned Guid and timestamps</returns>
/// <exception cref="ValidationException">Thrown if FullName exceeds 200 characters</exception>
/// <exception cref="ConflictException">Thrown if DocumentId already exists</exception>
public async Task<PatientDto> CreatePatientAsync(CreatePatientCommand command)
{
    // ...
}
```

## README Structure

Every project should have a README that covers:

```markdown
# NousDatBlazor

 clinical laboratory system.

## Quick Start
1. Clone the repo
2. Restore NuGet dependencies: `dotnet restore`
3. Build the solution: `dotnet build`
4. Run the Blazor Web application: `dotnet run --project src/Presentation/NousDat.Web`

## Commands
| Command | Description |
|---------|-------------|
| `dotnet run --project src/Presentation/NousDat.Web` | Start Blazor Web app |
| `dotnet test` | Run tests |
| `dotnet build` | Build solution |
| `dotnet format` | Run C# code linter/formatter |

## Architecture
Brief overview of the project structure and key design decisions.
Link to ADRs for details.
```

## Documentation for Agents

Special consideration for AI agent context:

- **AGENTS.md** — Document project conventions so agents follow them
- **Spec files** — Keep specs updated so agents build the right thing
- **ADRs** — Help agents understand why past decisions were made

## Verification

After documenting:

- [ ] ADRs exist for all significant architectural decisions
- [ ] README covers quick start, commands, and architecture overview
- [ ] API classes and methods have XML summaries
- [ ] Known gotchas are documented inline
- [ ] No commented-out code remains
