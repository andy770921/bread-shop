---
description: Create a PRD through interview, codebase exploration, and module design
---

# Write a PRD

You are tasked with creating a Product Requirements Document (PRD) through systematic discovery.

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
- PRD/Features → `FEAT-X`

## Process

### 1. Problem Discovery
Gather detailed problem descriptions and solution ideas from the user. Ask clarifying questions to understand:
- What problem are we solving?
- Who is affected?
- What does success look like?

### 2. Codebase Verification
Explore the repository to validate assumptions:
- Review existing code patterns
- Identify relevant modules
- Assess current architecture

### 3. Intensive Interview
Conduct thorough questioning across all design aspects:
- User stories and acceptance criteria
- Technical constraints
- Integration requirements
- Edge cases

### 4. Module Design
Identify major modules needed, prioritizing "deep modules" that:
- Encapsulate functionality behind simple interfaces
- Are independently testable
- Have stable contracts

### 5. PRD Documentation

**Determine TICKET:**
- If `$ARGUMENTS` provided → use `$ARGUMENTS`
- If empty → auto-generate next `FEAT-X` number

Create the PRD document at: `documents/{TICKET}/plans/prd.md`

Create the ticket folder structure if it doesn't exist:
- `documents/{TICKET}/plans/`
- `documents/{TICKET}/development/`

## PRD Template

Use this template for the PRD document:

```markdown
# PRD: [Feature Name]

## Problem Statement
[Describe the problem from the user's perspective]

## Solution Overview
[High-level solution description]

## User Stories
1. As a [role], I want [feature] so that [benefit]
2. ...

## Implementation Decisions

### Modules
- [Module 1]: [Purpose and interface]
- [Module 2]: [Purpose and interface]

### Architecture
[Key architectural decisions]

### APIs/Interfaces
[API contracts and interfaces]

## Testing Strategy
[How this will be tested]

## Out of Scope
[What is explicitly NOT included]

## Status
- [ ] Planning
- [ ] In Development
- [ ] Complete
```

## Notes
- Skip steps as judgment dictates
- Prioritize deep modules over shallow ones
- Focus on behaviors and contracts, not file paths
- Always inform user which TICKET number is being used
