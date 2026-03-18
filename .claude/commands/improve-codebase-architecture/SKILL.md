---
description: Find architectural improvement opportunities through systematic exploration
---

# Improve Codebase Architecture

You are tasked with identifying architectural improvements, particularly around creating "deep modules" - components with minimal interfaces hiding substantial implementation.

## TICKET Resolution

**If `$ARGUMENTS` is empty or not provided:**
1. Scan the `documents/` folder for existing REFACTOR-X folders
2. Find the highest number X in REFACTOR-X folders
3. Use `REFACTOR-{X+1}` as the new TICKET
4. Example: If REFACTOR-1, REFACTOR-2 exist → use REFACTOR-3

**If `$ARGUMENTS` is provided:**
- If folder exists → extend existing documents
- If folder doesn't exist → create new folder

**Prefix rules:**
- Architecture improvements → `REFACTOR-X`

## Core Concept

From John Ousterhout: "A deep module has a small interface hiding a large implementation."

Deep modules are:
- More testable
- More maintainable
- Easier to understand
- More stable over time

## Process

### Step 1: Explore the Codebase
Navigate organically, identifying friction points:
- Understanding single concepts requires jumping between multiple files
- Modules expose nearly as much interface as implementation
- Pure functions extracted solely for testing
- Tightly-coupled modules creating integration risks
- Untested or difficult-to-test areas

The friction you encounter IS the signal.

### Step 2: Present Candidates
List deepening opportunities showing:
- **Cluster**: Which modules/concepts are involved
- **Coupling reason**: Why these belong together
- **Dependency category**: (see below)
- **Test impact**: What tests would change

Do NOT propose specific interfaces yet. Ask: "Which of these would you like to explore?"

### Step 3: User Selection
Wait for user to choose which candidate to explore.

### Step 4: Frame Problem Space
Explain:
- Constraints any new interface would need to satisfy
- Dependencies it would rely on
- Rough illustrative code sketch (not a proposal, just grounding)

Show this to user, then proceed to Step 5.

### Step 5: Design Multiple Interfaces
Present 3+ radically different interface designs:

1. **Minimalist** (1-3 entry points max)
2. **Flexible** (multiple use cases, extension points)
3. **Caller-optimized** (common caller patterns trivial)
4. **Ports & Adapters** (for cross-boundary dependencies)

For each, provide:
- Interface signature
- Usage example
- What complexity it hides
- Dependency strategy
- Trade-offs

Give your recommendation: which design is strongest and why.

### Step 6: User Selection
Wait for user to choose an interface (or accept recommendation).

### Step 7: Create RFC Document

**Determine TICKET:**
- If `$ARGUMENTS` provided → use `$ARGUMENTS`
- If empty → auto-generate next `REFACTOR-X` number

Save at: `documents/{TICKET}/plans/architecture-rfc.md`

## Dependency Categories

### 1. In-process
Pure computation, in-memory state, no I/O. Always deepenable — just merge modules.

### 2. Local-substitutable
Dependencies with local test stand-ins (e.g., PGLite for Postgres). Deepenable if stand-in exists.

### 3. Remote but owned (Ports & Adapters)
Your own services across network boundary. Define port interface, inject adapters.

### 4. True external (Mock)
Third-party services you don't control. Mock at the boundary.

## Architecture RFC Template

```markdown
# Architecture RFC: [Module Name]

## Summary
[One paragraph describing the change]

## Motivation
[Why this improvement matters]

## Current State
### Friction Points
- [Friction 1]
- [Friction 2]

### Affected Modules
- [Module 1]
- [Module 2]

## Proposed Interface

### Signature
```typescript
[Interface definition]
```

### Usage Example
```typescript
[How callers use it]
```

### What It Hides
[Implementation details encapsulated]

## Dependency Strategy
- Category: [In-process/Local-substitutable/Ports & Adapters/Mock]
- Approach: [How dependencies are handled]

## Testing Strategy
### New Boundary Tests
- [Test 1]
- [Test 2]

### Tests to Remove
- [Old shallow tests that become redundant]

## Migration Plan
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| [Risk 1] | [Mitigation 1] |

## Status
- [ ] RFC Approved
- [ ] Implementation Started
- [ ] Migration Complete
- [ ] Old Code Removed
```

## Testing Philosophy

**Replace, don't layer:**
- Old unit tests on shallow modules are waste once boundary tests exist — delete them
- Write new tests at the deepened module's interface boundary
- Tests assert on observable outcomes, not internal state

## Notes
- Always inform user which TICKET number is being used
