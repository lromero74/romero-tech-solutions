Execute the PRP (Product Requirements Plan): $ARGUMENTS

## Process

### 1. Load & Understand
- Read the PRP file at `docs/PRPs/$ARGUMENTS`
- Understand all context, requirements, and constraints
- If the PRP references other files, read those too

### 2. Plan
- Break the work into ordered steps
- Identify dependencies between steps (DB migration first, then service, then route, then UI)
- Note which validation gates apply at each step

### 3. Execute
- Implement step by step, following the PRP's blueprint
- Follow CLAUDE.md rules throughout:
  - RBAC: never hardcode role checks; add a permission and grant it via SQL
  - Backend ES modules (.js with `import`/`export`)
  - Frontend strict TypeScript
  - Mobile responsive at 375px (especially `/clogin` paths)
  - `git diff` before staging — never silently drop logic
  - DB schema: read it first; never assume column or table names

### 4. Validate
- Run each validation gate from the PRP
- Fix any failures — iterate until all pass
- Verify no regressions: existing flows still work (employee login, client signup, scheduler, invoice rendering)

### 5. Complete
- Re-read the PRP to confirm everything was implemented
- Summarize what was done
- List any deviations from the PRP and why
- Note files changed for the changelog

### 6. Prepare for Ship
- Bump version (`package.json` + `public/version.json` + `src/hooks/useVersionCheck.ts`) if user-visible
- Stage changes
- Report completion — wait for user to review and `/shipit`

If validation fails repeatedly, use the PRP's rollback plan. If truly blocked, report what's blocking — don't paper over it with a stub or `@ts-ignore`.
