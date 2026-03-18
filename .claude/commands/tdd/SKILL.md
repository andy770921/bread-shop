---
description: Test-driven development with red-green-refactor loop
---

# Test-Driven Development

You are tasked with implementing features using strict TDD methodology.

## TICKET Resolution

**If `$ARGUMENTS` is empty or not provided:**
1. Scan the `documents/` folder for existing FEAT-X folders
2. Find the highest number X in FEAT-X folders
3. Use `FEAT-{X+1}` as the new TICKET
4. Example: If FEAT-1, FEAT-2 exist → use FEAT-3

**If `$ARGUMENTS` is provided:**
- If folder exists → extend existing documents
- If folder doesn't exist → create new folder

**Prefix rules:**
- Feature implementation → `FEAT-X`

## Core Philosophy

Tests should verify **behavior through public interfaces**, not implementation details.

**Good tests:**
- Exercise real code paths (integration-style)
- Describe WHAT the system does, not HOW
- Survive refactoring without changes
- Use only public interfaces

**Bad tests:**
- Mock internal collaborators
- Test private methods
- Couple to implementation details

## Anti-Pattern: Horizontal Slicing

**NEVER** write all tests upfront then implement. This produces tests that verify imagined behavior.

**ALWAYS** use vertical slices: complete one test-implementation cycle before moving to the next.

## Workflow

### 1. Planning Phase

**Determine TICKET:**
- If `$ARGUMENTS` provided → use `$ARGUMENTS`
- If empty → auto-generate next `FEAT-X` number

Before writing code:
- Establish interface requirements
- Identify critical behaviors to test
- Design for testability
- Get user approval on the plan

Document plan at: `documents/{TICKET}/development/tdd-plan.md`

### 2. RED Phase
Write ONE failing test that:
- Describes a specific behavior
- Uses only public interfaces
- Will fail for the right reason

### 3. GREEN Phase
Write MINIMAL code to pass the test:
- Don't anticipate future requirements
- Don't add unnecessary abstractions
- Just make it pass

### 4. Repeat
Continue RED-GREEN cycles for remaining features.

### 5. REFACTOR Phase
After all tests pass:
- Extract duplication
- Deepen modules
- Apply design principles
- Keep tests green throughout

## Quality Checklist (per cycle)
- [ ] Test describes behavior, not implementation
- [ ] Test uses only public interfaces
- [ ] Test would survive radical refactoring
- [ ] Implementation is minimal
- [ ] No speculative features added

## Progress Tracking

Update status in: `documents/{TICKET}/development/tdd-progress.md`

```markdown
# TDD Progress: [Feature]

## Plan Summary
[Brief description of what we're building]

## Cycles Completed

### Cycle 1
- **RED**: [Test description]
- **GREEN**: [Implementation summary]
- **Status**: [x] Complete

### Cycle 2
- **RED**: [Test description]
- **GREEN**: [Implementation summary]
- **Status**: [ ] In Progress

## Refactoring Notes
[Any refactoring done after all tests pass]

## Overall Status
- Phase: [PLANNING/RED/GREEN/REFACTOR/COMPLETE]
- Tests Passing: X/Y
- Coverage: X%
```

## TDD Plan Template

```markdown
# TDD Plan: [Feature]

## Objective
[What we're building and why]

## Interface Design
[Public API/interface that will be tested]

## Behaviors to Test (in order)
1. [Behavior 1 - simplest case]
2. [Behavior 2 - next complexity]
3. [Behavior 3 - edge case]
...

## Testing Strategy
- Test framework: [Vitest/Jest]
- Test style: [Unit/Integration]
- Mocking approach: [What to mock, if anything]

## Approval
- [ ] User approved plan
- [ ] Ready to begin RED phase
```

## Notes
- Always inform user which TICKET number is being used
