---
name: Production Update
description: This is the process flow I want you to use when you push from this project to production
---

# Production Update

## Instructions
Perform a git pull and check for merge conflicts
Perform a git diff to compare what we are about to commit against what exists (use this to compose a meaningful git message)
Bump version numbers in:
- src/hooks/useVersionCheck.ts
- public/version.json
- package.json
- update cache name versions in sw.js to match the app version
Commit
Tag
Push

## Examples
Bash(npm run build 2>&1 | grep -E "built in|Error|✓" && git add src/services/authService.ts &&
      git commit -m "fix: Check for token parameter to skip auth load" && sed -i ''
      's/1.101.85/1.101.86/g' package.json src/hooks/useVersionCheck.ts public/version.json
      public/sw.js && git add package.json src/hooks/useVersionCheck.ts public/version.json
      public/sw.js && git commit -m "chore: Bump version to 1.101.86" && git tag v1.101.86 && git
      push origin main && git push origin v1.101.86)
