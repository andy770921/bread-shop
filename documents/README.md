# Documents Directory

This directory contains documentation for the whale browser extension organized by JIRA tickets for better traceability and organization.

## Folder Structure

The documentation is organized by ticket numbers with each ticket containing both planning and development documentation:

```
documents/
├── README.md
└── [TICKET-NUMBER]/
    ├── plans/
    └── development/
```

### Ticket-Based Organization

Each JIRA ticket (e.g., `STARFISH-7489`, `STARFISH-7316`) gets its own folder containing:

#### `/[TICKET-NUMBER]/plans/`

Contains planning and product documentation, including:

- Feature requirements and specifications
- User stories and acceptance criteria
- Product design decisions
- Technical approach and architecture planning
- Risk assessments and mitigation strategies

**Purpose**: Documents the "what" and "why" of the implementation. Used during planning phase to understand requirements and design approach.

#### `/[TICKET-NUMBER]/development/`

Contains implementation-focused documentation, including:

- Technical implementation details
- Code architecture and design patterns
- API specifications and interfaces
- Database schema changes
- Component design and integration
- Testing strategies and plans
- Deployment and rollout procedures

**Purpose**: Documents the "how" of the implementation. Created during and after development as a reference for current work and future maintenance.

## How to Use This Structure

### For New Work

1. **Create ticket folder**: `documents/[TICKET-NUMBER]/`
2. **Plan phase**: Create documents in `[TICKET-NUMBER]/plans/` folder
3. **Development phase**: Create implementation docs in `[TICKET-NUMBER]/development/` folder
4. **Reference existing**: Check similar tickets for patterns and approaches

### For Ongoing Work

1. **Find relevant ticket**: Look for existing documentation in ticket folders
2. **Update as needed**: Keep documentation current with implementation changes
3. **Cross-reference**: Link related tickets and epic documentation

### Benefits of This Structure

- **Traceability**: Direct connection between code changes and documentation
- **Context**: Each ticket's complete story (planning + implementation) in one place
- **Maintainability**: Easier to update docs when revisiting specific tickets
- **Knowledge Transfer**: Self-contained documentation per feature/fix
