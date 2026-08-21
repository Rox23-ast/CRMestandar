---
name: api-and-interface-design
description: Guides stable API and interface design. Use when designing APIs, module boundaries, or any public interface. Use when creating REST endpoints, defining type contracts between modules, or establishing boundaries between frontend and backend.
---

# API and Interface Design

## Overview

Design stable, well-documented interfaces that are hard to misuse. Good interfaces make the right thing easy and the wrong thing hard. This applies to REST APIs, C# interfaces, application layer boundaries (commands/queries), and any surface where one piece of C# code talks to another.

## When to Use

- Designing new API endpoints (Controllers / Minimal APIs)
- Defining C# interfaces and application contracts
- Establishing database schema that informs API shape
- Changing existing public interfaces

## Core Principles

### Hyrum's Law

> With a sufficient number of users of an API, all observable behaviors of your system will be depended on by somebody, regardless of what you promise in the contract.

Observable behavior — including error message text, response timing, validation ordering, and database exceptions — becomes a de facto contract once clients depend on it. Design implications:

- **Be intentional about what you expose.** Expose only what is required.
- **Don't leak database or internal exceptions.** Translate database errors (like foreign key violations) to clean, user-facing validation errors at the Application or API boundary.
- **Plan for deprecation.** Keep public models and contracts stable.

### The One-Version Rule

Avoid forcing consumers to choose between multiple versions of the same dependency or API. Design for a world where only one version exists at a time — extend rather than fork.

### 1. Contract First (C# Interfaces & DTOs)

Define the C# interface or DTOs representing inputs and outputs before writing implementation details:

```csharp
// Define the C# contract
public interface IPatientService
{
    // Creates a patient and returns the created patient DTO
    Task<PatientDto> CreatePatientAsync(CreatePatientCommand command, CancellationToken ct = default);

    // Returns paginated list of patients matching filters
    Task<PagedResult<PatientDto>> GetPatientsAsync(GetPatientsQuery query, CancellationToken ct = default);

    // Returns a single patient DTO or throws NotFoundException
    Task<PatientDto> GetPatientByIdAsync(Guid id, CancellationToken ct = default);

    // Partial update — only provided non-null fields change
    Task<PatientDto> UpdatePatientAsync(Guid id, UpdatePatientCommand command, CancellationToken ct = default);

    // Idempotent delete — succeeds even if already deleted
    Task DeletePatientAsync(Guid id, CancellationToken ct = default);
}
```

### 2. Consistent Error Semantics

Map application exceptions to standard HTTP response shapes. Use RFC 7807 Problem Details as the standard error response format:

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "DocumentId": [
      "El número de documento ya está registrado."
    ]
  }
}
```

Status code mapping:
- `400 Bad Request` → Validation errors, malformed request
- `401 Unauthorized` → Client not authenticated
- `403 Forbidden` → Client authenticated but lacks required permission
- `404 Not Found` → Resource does not exist
- `409 Conflict` → Duplicate keys, concurrency conflict (Optimistic Concurrency)
- `500 Internal Server Error` → Server error (Never leak raw exception stack traces to the client!)

### 3. Validate at Boundaries

Trust internal code. Validate at system edges (e.g. API Controller filters, MediatR Pipeline Behaviors) using FluentValidation:

```csharp
// FluentValidation validator executed automatically before handling
public class CreatePatientCommandValidator : AbstractValidator<CreatePatientCommand>
{
    public CreatePatientCommandValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("El nombre completo es requerido.")
            .MaximumLength(200).WithMessage("El nombre completo no puede exceder 200 caracteres.");
            
        RuleFor(x => x.DocumentId)
            .NotEmpty().WithMessage("El número de documento es requerido.");
    }
}
```

Where validation belongs:
- API Controllers / Request DTOs
- MediatR Pipeline Validation Behaviors
- External service client wrappers (always treat external API data as untrusted!)

Where validation does NOT belong:
- Internal repository methods
- Private/protected helper utilities called by already-validated code

### 4. Input/Output Separation

Always separate input models from output models:

```csharp
// Input DTO (Command)
public record CreatePatientCommand(string FullName, string DocumentId) : IRequest<PatientDto>;

// Output DTO (Safe, read-only representation)
public record PatientDto(Guid Id, string FullName, string DocumentId, DateTime CreatedAt);
```

### 5. Predictable REST Naming

| Pattern | Convention | Example |
|---------|-----------|---------|
| REST endpoints | Plural nouns, no verbs | `GET /api/patients`, `POST /api/patients` |
| Query params | camelCase | `?pageNumber=1&pageSize=20&sortBy=fullName` |
| Response fields | camelCase | `{ id, fullName, createdAt }` (handled via JsonSerializerOptions) |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "We don't need pagination for now" | You will the moment database tables grow. Add pagination from the start. |
| "We'll version the API when we need to" | Design for backward-compatible extension (additive, optional fields) from the start. |
| "Internal APIs don't need contracts" | Internal components still need clear boundaries to prevent tight coupling. |

## Red Flags

- Endpoints returning different schema structures depending on runtime states
- Inconsistent error formats across API controllers
- Database entities exposed directly as API request/response types (always map to DTOs!)
- SQL Server/EF Core exceptions leaked directly to clients (e.g., raw constraint violation messages)
- List endpoints without pagination limits

## Verification

After designing an API:

- [ ] Every request/response shape maps to a distinct DTO class (no raw entities exposed)
- [ ] Error responses follow standard Problem Details format
- [ ] FluentValidation rules enforce inputs at the Application boundary
- [ ] List endpoints support page size limit constraints
- [ ] Naming follows plural conventions for REST controllers
