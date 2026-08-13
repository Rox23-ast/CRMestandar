# Project Rules: AI Agent Behavior and Workspace Rules

All agent sessions in this workspace must adhere to the rules below.

---

## 1. Gated Development Workflow
* **No Spec, No Code**: Do not write production code without a clear specification, ticket, or user approval.
* **Incremental Steps**: Always break large features into smaller, independently testable tasks.
* **Pre-commit Quality Gates**: Verify that code compiles, lints, and passes all tests before completing any task.

---

## 2. Language & Code Style Conventions
* **Code Style**: Mimic the existing code conventions in this repository (naming casing, braces, design patterns).
* **Language Rules**: 
  * Source code, comments, variables, and API contracts MUST be in [English].
  * User Interface (UI) labels, messages, and localized resources MUST be in [Spanish / User's Choice].
* **Comments**: Keep comments brief and focus on *why* instead of *what*. Do NOT explain your changes to the user using source comments.

---

## 3. Explicit Approval Gate
* **No Unapproved Edits**: Propose a plan/design first, and wait for the user to explicitly type "Proceed" or give approval before editing source files or executing filesystem-modifying commands.
* **Confirm Ambiguity**: If any instruction or requirement is unclear, ask concise, targeted clarification questions rather than making assumptions.

---

## 4. Agent Output Format
Keep successful output as concise as possible. Provide detailed, actionable information only when an error, blocker, warning, or failed verification requires attention.

### Success Format
Use one line containing the outcome and essential verification:
`✓ <outcome> — <essential verification>`

*Example:* `✓ Component added — Compilation passed with 0 errors/warnings and all 15 tests passed.`

### Success With a Non-Blocking Note
`✓ <outcome> — <essential verification>`
`Note: <non-blocking concern>`

### Error or Blocker Format
Report enough detail to diagnose and recover:
* **Failed:** What did not work.
* **Impact:** What remains incomplete or unsafe.
* **Cause:** The evidence-backed diagnosis, or `Unknown` if not established.
* **Attempted:** Relevant recovery actions already taken.
* **Next step:** The exact recovery action or user decision required.
* **Evidence:** The smallest useful error excerpt, failing test, command, or file location.
