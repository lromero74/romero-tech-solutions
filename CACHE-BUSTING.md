# Cache Busting & Version Management

This project implements automatic cache invalidation to ensure users always see the latest content without manual browser refreshes.

## How It Works

### 1. Version Check System
- **Version file**: `/public/version.json` contains current app version
- **Auto-check**: Frontend checks version every 5 minutes
- **Auto-reload**: When new version detected, page reloads automatically
- **User-friendly**: Shows confirmation dialog (except on initial load)

### 2. HTTP Cache Headers (Nginx)
- HTML files: No cache (always fresh)
- Static assets (JS/CSS/images): Cache with immutable flag for performance

## When You Deploy

**Update version.json**:
```bash
# Edit public/version.json and increment version
{
  "version": "1.2.1",  # <-- Change this
  "timestamp": "2025-10-02T20:00:00Z",
  "buildDate": "2025-10-02"
}
```

**Or use package.json version** (recommended):
```bash
# Bump version
npm version patch  # 1.2.0 -> 1.2.1
npm version minor  # 1.2.0 -> 1.3.0
npm version major  # 1.2.0 -> 2.0.0

# Then update useVersionCheck.ts:
const CURRENT_VERSION = '1.2.1';

# And version.json:
{
  "version": "1.2.1",
  "timestamp": "2025-10-02T20:00:00Z",
  "buildDate": "2025-10-02"
}
```

**Build and deploy**:
```bash
npm run build
git add public/version.json src/hooks/useVersionCheck.ts
git commit -m "Bump version to 1.2.1"
git push origin main
```

Within 5 minutes, all users will automatically get the new version!

## Nginx Configuration

Apply this to your production Nginx config on EC2 (`/etc/nginx/conf.d/api.conf` or main config):

```nginx
# For index.html and HTML files - NEVER cache
location / {
    try_files $uri $uri/ /index.html;

    # Prevent caching of HTML
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
}

# For version.json - NEVER cache (critical for version checks)
location = /version.json {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
}

# For static assets (JS, CSS, images) - Cache aggressively with immutable
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    expires 1y;
}
```

**Apply Nginx changes**:
```bash
ssh botmanager
sudo nginx -t  # Test configuration
sudo systemctl reload nginx  # Apply without downtime
```

## Testing

**Local testing** (version check disabled in dev mode):
```bash
npm run dev
```

**Production testing**:
1. Deploy with version 1.2.0
2. Open browser console and check: `✅ Version check: Already on latest (1.2.0)`
3. Update version.json to 1.2.1 and deploy
4. Wait 5 minutes (or less) - page will auto-reload
5. Console shows: `🔄 New version available: 1.2.1 (current: 1.2.0)`

## Files Modified

- `src/hooks/useVersionCheck.ts` - Version checking logic
- `src/App.tsx` - Added version check hook
- `public/version.json` - Version metadata
- `/etc/nginx/conf.d/*.conf` - Cache headers (production server)

## Troubleshooting

**Users still seeing old content**:
- Check `version.json` was deployed correctly
- Check `CURRENT_VERSION` in `useVersionCheck.ts` matches
- Check Nginx cache headers are applied: `curl -I https://www.romerotechsolutions.com/`
- Check browser console for version check logs

**Version check not running**:
- Only runs in production (`import.meta.env.DEV` check)
- Check browser console for errors
- Verify version.json is accessible: `https://www.romerotechsolutions.com/version.json`

**Immediate reload needed** (emergency):
- Update version to trigger reload
- OR clear CloudFront/CDN cache if using one
- OR have users hard refresh: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
