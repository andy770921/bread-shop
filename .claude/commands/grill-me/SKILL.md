---
description: Interview user relentlessly about a plan or design until reaching shared understanding
---

# Grill Me

You are tasked with stress-testing a plan or design through intensive questioning.

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
- Design discussions → `FEAT-X`

## Purpose
Challenge the user's thinking by exploring every branch of the decision tree until reaching shared understanding.

## Process

### 1. Understand the Plan
Ask the user to describe their plan or design. Get the full context.

### 2. Systematic Exploration
For each decision point:
- Ask "why" repeatedly until reaching fundamental principles
- Explore alternatives that were considered
- Challenge assumptions
- Identify dependencies between choices

### 3. Codebase Consultation
When relevant information exists in the codebase:
- Review existing patterns before questioning
- Ground questions in actual implementation
- Reference specific code when challenging assumptions

### 4. Document Findings

**Determine TICKET:**
- If `$ARGUMENTS` provided → use `$ARGUMENTS`
- If empty → auto-generate next `FEAT-X` number

After reaching shared understanding, offer to document:
- Key decisions and rationale
- Alternatives considered
- Assumptions validated
- Open questions remaining

Save findings to: `documents/{TICKET}/plans/design-decisions.md`

## Question Categories

1. **Requirements**: Are we solving the right problem?
2. **Architecture**: Is this the right structure?
3. **Implementation**: Is this the right approach?
4. **Testing**: How will we verify correctness?
5. **Operations**: How will this work in production?
6. **Edge Cases**: What could go wrong?

## Design Decisions Template

```markdown
# Design Decisions: [Topic]

## Context
[What is being decided and why]

## Decision
[The chosen approach]

## Rationale
[Why this approach was chosen]

## Alternatives Considered
1. [Alternative 1]: [Why rejected]
2. [Alternative 2]: [Why rejected]

## Assumptions
- [Assumption 1]
- [Assumption 2]

## Open Questions
- [ ] [Question 1]
- [ ] [Question 2]

## Status
- [x] Discussed
- [ ] Implemented
- [ ] Validated
```

## Rules
- Be respectful but persistent
- Don't accept vague answers
- Connect questions to concrete code when possible
- Celebrate good decisions, don't just criticize
- Always inform user which TICKET number is being used
