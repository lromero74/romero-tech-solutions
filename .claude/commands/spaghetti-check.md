Run a spaghetti code audit focused on code length, modularity, and separation of concerns. Focus area: $ARGUMENTS

## Argument Parsing

**Scope** (what to audit):
- `backend` — audit only `backend/`
- `frontend` — audit only `src/`
- `full` or no scope — audit both

**Mode**:
- `--fix` — after auditing, fix all findings and validate with type-check + spot-test
- No flag — audit only (read-only, report findings)

Examples:
- `/spaghetti-check` → full audit, read-only
- `/spaghetti-check backend --fix` → backend audit + fix + validate

## Phase 1: Audit

### Agent 1: File & Function Size Auditor (code-hygiene, modularization focus)
- Measure every file with `wc -l` — flag any > 1200 lines
- Measure every function — flag any > 50 lines (exclude test files)
- Flag functions with 5+ parameters
- Flag files with 10+ distinct module imports (god files)
- **Read-only**

### Agent 2: Dependency Direction & Import Auditor
- Backend: services don't import from routes; routes depend on services; middleware is standalone
- Frontend: contexts standalone; hooks depend on contexts; components depend on both
- Check for circular imports
- Flag `backend/routes/*.js` files that contain >100 lines of business logic that belongs in a service
- **Read-only**

### Agent 3: Coupling & Complexity Analyzer
- Files importing 5+ symbols from a single module (high coupling)
- Modules imported by 10+ other files (god modules — likely candidates for splitting)
- Branches per function — flag complexity > 10
- Repeated SQL patterns in routes that should be a shared service helper
- **Read-only**

### Agent 4: Multi-User Security & RBAC Auditor (multiuser-security)
- Missing `requirePermission()` on user-data endpoints
- IDOR (queries by `id` without business/user filter)
- Hardcoded role checks (`if (user.role === 'admin')`) — should be a permission check
- Sensitive data in responses (password_hash, raw tokens)
- **Read-only**

### Report Format

```
## Spaghetti Check — [scope]

### File Size Violations
| Severity | File | Lines | Limit | Recommendation |

### Function Size Violations
| Severity | File | Function | Lines | Recommendation |

### Dependency Direction Violations
| Severity | File | Line | Violation | Fix |

### Security & RBAC Violations
| Severity | File | Line | Type | Details | Fix |

### Summary
- Files scanned: N
- Total findings: N
- Worst offenders: [top 3 files]

### Priority Actions
1. [ ] Most impactful fix
2. [ ] Second
3. [ ] Third
```

## Phase 2: Fix (only if `--fix`)

Work through findings by severity (CRITICAL → HIGH → MEDIUM). Follow CLAUDE.md rules. Run `npx tsc --noEmit` after each fix.

## Phase 3: Validate (only if `--fix`)

```bash
npx tsc --noEmit
node --check backend/<each-touched-backend-file>.js
```

All checks pass, no type errors, no syntax errors. Manual smoke-test the affected flows.
