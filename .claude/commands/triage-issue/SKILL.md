---
description: Investigate a bug, find root cause, and create a TDD fix plan
---

# Triage Issue

You are tasked with investigating a reported problem and creating a TDD fix plan.

## TICKET Resolution

**If `$ARGUMENTS` is empty or not provided:**
1. Scan the `documents/` folder for existing FIX-X folders
2. Find the highest number X in FIX-X folders
3. Use `FIX-{X+1}` as the new TICKET
4. Example: If FIX-1, FIX-2 exist → use FIX-3

**If `$ARGUMENTS` is provided:**
- If folder exists → extend existing documents
- If folder doesn't exist → create new folder

**Prefix rules:**
- Bug fixes → `FIX-X`

## Process

### 1. Problem Capture
Gather a brief description from the user:
- What is the observed behavior?
- What is the expected behavior?
- Steps to reproduce (if known)

If they haven't provided one, ask ONE question: "What's the problem you're seeing?"

Do NOT ask follow-up questions yet. Start investigating immediately.

### 2. Code Exploration
Deeply investigate the codebase to find:
- **Where** the bug manifests (entry points, UI, API responses)
- **What** code path is involved (trace the flow)
- **Why** it fails (the root cause, not just the symptom)
- **What** related code exists (similar patterns, tests, adjacent modules)

Look at:
- Related source files and their dependencies
- Existing tests (what's tested, what's missing)
- Recent changes to affected files (git log)
- Error handling in the code path
- Similar patterns elsewhere that work correctly

### 3. Root Cause Analysis
Determine:
- The actual cause of the issue
- Is this a regression, missing feature, or design flaw?
- What modules are affected?
- What behaviors need to be tested?

### 4. TDD Fix Plan
Create ordered RED-GREEN cycles where each cycle is one vertical slice:

**RED Phase**: Describe a specific failing test
**GREEN Phase**: Describe minimal code changes

Tests should:
- Verify behaviors through public interfaces
- Be durable across radical codebase changes
- Describe behaviors, not implementation details

### 5. Document the Issue

**Determine TICKET:**
- If `$ARGUMENTS` provided → use `$ARGUMENTS`
- If empty → auto-generate next `FIX-X` number

Create document at: `documents/{TICKET}/development/issue-triage.md`

## Issue Triage Template

```markdown
# Issue Triage: [Brief Title]

## Problem Description
**Reported**: [What was reported]
**Expected**: [What should happen]
**Actual**: [What actually happens]
**Reproduction**: [Steps to reproduce, if known]

## Root Cause Analysis

### Investigation Summary
[What was examined during investigation]

### Root Cause
[Technical explanation - describe modules and contracts, not specific file paths]

### Classification
- [ ] Regression
- [ ] Missing feature
- [ ] Design flaw
- [ ] Configuration issue

## TDD Fix Plan

### Cycle 1
**RED**: [Failing test description]
```
[Test code example if helpful]
```
**GREEN**: [Minimal implementation change]

### Cycle 2
**RED**: [Next failing test]
**GREEN**: [Implementation]

### Final Refactor
[Any cleanup needed after all tests pass]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] All new tests pass
- [ ] Existing tests still pass

## Status
- [x] Triaged
- [ ] Fix in progress
- [ ] Fix complete
- [ ] Verified
```

## Rules
- Minimize questions to the user - investigate first
- Focus on root cause, not just symptoms
- Describe modules and behaviors, not file paths
- Tests should survive radical refactoring
- Always inform user which TICKET number is being used
