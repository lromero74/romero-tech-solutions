Generate a Product Requirements Plan (PRP) for: $ARGUMENTS

A PRP gives a future Claude all the context needed for one-pass implementation success.

## Research Phase

### 1. Codebase Analysis
- Search for similar features/patterns already in the codebase
- Identify files that will need changes (route + service + frontend component + types)
- Note existing conventions to follow (naming, RBAC permission keys, error response shape)
- Check how related features were implemented (study the precedent)

### 2. Architecture Review
- Read CLAUDE.md for project structure and conventions
- Read relevant `backend/services/`, `backend/routes/`, frontend `src/components/` and `src/contexts/`
- Identify which layers will be affected (services? routes? middleware? frontend? DB schema?)
- Check whether a permission needs to be added (`view.<thing>.enable`, `modify.<thing>.enable`) — this app uses fine-grained RBAC, never role checks

### 3. Database Considerations
- New tables/columns? Write a migration in `backend/migrations/` (next sequential number)
- Touching existing tables? Read the schema first via `scripts/table --sql "\d <table>"` — never assume column names

### 4. External Research (if needed)
- Stripe / Twilio / SES / Cognito API references
- Library docs for new dependencies

### 5. User Clarification (if needed)
- Ask about ambiguous requirements before writing the PRP
- Confirm the scope — what's in, what's out

## PRP Generation

Write the PRP with these sections:

### Context & Goal
- What problem does this solve?
- Who benefits? (employees? clients? a specific role like executive?)
- Does it affect both desktop and mobile? (mandatory for `/clogin` flow)

### Implementation Blueprint
- Step-by-step approach
- Reference existing files for patterns to follow
- List all files that will be created or modified
- Migration file if schema changes (with up + rollback)
- New permission keys + which roles get them (executive always; admin/sales/technician case by case)

### Validation Gates
```bash
npx tsc --noEmit                      # frontend type check
node --check backend/<modified>.js    # backend syntax (per file touched)
# manual: log in, exercise the new flow on both desktop and 375px mobile
```

### Rollback Plan
- What to revert if something goes wrong
- Migration rollback SQL if schema changed
- For prod hotfix: roll forward with a new commit, never revert a tagged release

### Versioning Note
Per CLAUDE.md, every commit bumps `package.json`, `public/version.json`, AND `src/hooks/useVersionCheck.ts` together (cache-bust + reload toast). Skip the bump only for pure `.gitignore` / docs changes.

## Output

Save as: `docs/PRPs/{feature-name}.md`

## Quality Score

Rate confidence (1-10) that this PRP enables one-pass implementation:
- 8-10: All context provided, clear path, validated against codebase
- 5-7: Some gaps, may need mid-implementation research
- 1-4: Too many unknowns, needs more research
