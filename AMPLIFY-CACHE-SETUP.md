# AWS Amplify Cache Headers Setup

## Step 1: Configure Custom Headers in Amplify Console

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Select your app: **romero-tech-solutions**
3. In the left sidebar, click **App settings** → **Custom headers**
4. Click **Edit** or **Add custom response headers**
5. Copy and paste the contents of `amplify-headers.json` into the editor
6. Click **Save**

## Step 2: Verify Configuration

After saving, Amplify will apply these headers on the next deployment:

```bash
# Test HTML caching (should be no-cache)
curl -I https://prod.romerotechsolutions.com/

# Test version.json (should be no-cache)
curl -I https://prod.romerotechsolutions.com/version.json

# Test JS file (should cache for 1 year with immutable)
curl -I https://prod.romerotechsolutions.com/assets/index-*.js
```

Expected results:
- HTML/version.json: `Cache-Control: no-cache, no-store, must-revalidate`
- Static assets: `Cache-Control: public, max-age=31536000, immutable`

## Step 3: Deploy

```bash
git add .
git commit -m "Add automatic cache busting with version checks"
git push origin main
```

Amplify will auto-deploy and apply the new cache headers.

## Alternative: Amplify YAML Config

If you prefer configuration-as-code, you can also add this to `amplify.yml`:

```yaml
customHeaders:
  - pattern: '**/*.html'
    headers:
      - key: Cache-Control
        value: no-cache, no-store, must-revalidate
      - key: Pragma
        value: no-cache
      - key: Expires
        value: '0'
  - pattern: '/version.json'
    headers:
      - key: Cache-Control
        value: no-cache, no-store, must-revalidate
      - key: Pragma
        value: no-cache
      - key: Expires
        value: '0'
  - pattern: '/index.html'
    headers:
      - key: Cache-Control
        value: no-cache, no-store, must-revalidate
      - key: Pragma
        value: no-cache
      - key: Expires
        value: '0'
  - pattern: '/**/*.@(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)'
    headers:
      - key: Cache-Control
        value: public, max-age=31536000, immutable
```

## How It Works Together

1. **Version Check (JavaScript)**: Every 5 minutes, checks `/version.json` for updates
2. **Cache Headers (Amplify)**: Ensures browser doesn't cache HTML/version.json
3. **Static Asset Caching**: JS/CSS/images cached aggressively (good for performance)
4. **Vite Build Hashing**: Vite adds content hashes to filenames (e.g., `index-abc123.js`)

Result: Users get updates within 5 minutes, but static assets load instantly from cache!

## Troubleshooting

**Headers not applied?**
- Check Amplify deployment logs
- Verify headers in Amplify Console → App settings → Custom headers
- Wait for deployment to complete
- Clear browser cache and test

**Version check not working?**
- Check browser console for errors
- Verify version.json is accessible: `curl https://prod.romerotechsolutions.com/version.json`
- Check `useVersionCheck.ts` has correct version number

**Still seeing old content?**
- Users may need to wait up to 5 minutes for version check
- Or have them hard refresh once: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
- Check CloudFront invalidation if using custom CDN
