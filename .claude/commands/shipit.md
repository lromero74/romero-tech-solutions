Execute the full "Ship It" release process for Romero Tech Solutions.

Follow every step exactly:

1. **Pre-flight checks** (on mac, in project root):
   ```bash
   cd ~/New/01_Projects/RomeroTechSolutions
   git status
   git diff --stat
   npx tsc --noEmit     # type check
   ```
   Review all diffs. No type errors. Confirm you didn't accidentally delete logic (per CLAUDE.md rule: "Use git diff to compare changes before committing to ensure no features or functionality are accidentally removed").

2. **Determine version bump** from current tag:
   - Patch (X.Y.Z+1): bug fixes, code quality, small tweaks
   - Minor (X.Y+1.0): new features, new endpoints, new UI
   - Major (X+1.0.0): breaking changes (user specifies)

3. **Bump ALL THREE version files in lockstep** (CLAUDE.md rule):
   - `package.json` → `"version"` field
   - `public/version.json` → `"version"` field (drives client-side version check / reload prompt)
   - `src/hooks/useVersionCheck.ts` → `CURRENT_VERSION` constant
   Then run `npm install` so `package-lock.json` syncs to the new version.

4. **Database check**: if migrations in `backend/migrations/` changed, back up first:
   ```bash
   ssh testbot 'PGPASSWORD=... pg_dump -h localhost -U romero_app romerotechsolutions > ~/rts-pre-migrate-$(date +%s).sql'
   ```
   Run migrations with the existing migration tooling (`backend/scripts/` has helpers).

5. **Commit all changes** in a single commit — include the version bumps + code changes together:
   ```bash
   git commit -m "vX.Y.Z: <concise summary>"
   ```

6. **Tag the version** (semantic, three-part — CLAUDE.md rule):
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z: <summary>"
   ```

7. **Push main + tags**:
   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

8. **Deploy to testbot**:
   ```bash
   ssh testbot 'cd ~/romero-tech-solutions && git pull --ff-only origin main && \
     npm install --no-audit --no-fund && \
     npm run build && \
     sudo systemctl restart romero-tech-solutions-backend'
   ```
   - If only frontend source changed: the systemctl restart is strictly unnecessary (nginx serves dist/ from disk directly, so the new bundle is live as soon as `npm run build` finishes). Users see a version-check toast and reload.
   - If backend changed: the restart is required.
   - If you can't tell: just restart — it costs ~3 seconds.

9. **Post-ship verification**:
   ```bash
   # Version landed
   curl -s https://romerotechsolutions.com/version.json
   # Backend healthy
   curl -s https://api.romerotechsolutions.com/api/health
   # Systemd happy
   ssh testbot 'sudo systemctl is-active romero-tech-solutions-backend'
   ```

10. **If anything fails**: do not --amend the commit, do not force-push. Fix forward with a new commit + tag. The version-check on the client will auto-reload users to the fixed version.

Do NOT skip steps. End state: tagged on main, pushed to origin, testbot at HEAD, all three version files aligned, services healthy.
