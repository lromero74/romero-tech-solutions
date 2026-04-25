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

8. **Deploy to testbot** via the project service script:
   ```bash
   # Backend changed (or you're not sure): full restart — pulls deps,
   # rebuilds dist/, restarts the systemd unit.
   ssh testbot 'cd ~/romero-tech-solutions && git pull --ff-only origin main && ./service.sh restart --prod'

   # Frontend-only change: rebuild dist/ in place, no restart.
   ssh testbot 'cd ~/romero-tech-solutions && git pull --ff-only origin main && ./service.sh build'
   ```
   nginx serves dist/ from disk, so a frontend-only rebuild is live the moment `npm run build` finishes; users see a version-check toast and reload. Backend changes need the systemd restart for the new code to load.

9. **Post-ship verification**:
   ```bash
   # Version landed
   curl -s https://romerotechsolutions.com/version.json
   # Backend healthy
   curl -s https://api.romerotechsolutions.com/api/health
   # Systemd + frontend dist + port collision check
   ssh testbot './romero-tech-solutions/service.sh status'
   ```

10. **If anything fails**: do not --amend the commit, do not force-push. Fix forward with a new commit + tag. The version-check on the client will auto-reload users to the fixed version.

Do NOT skip steps. End state: tagged on main, pushed to origin, testbot at HEAD, all three version files aligned, services healthy.
