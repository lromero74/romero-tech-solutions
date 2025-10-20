# RTS Agent Download System

## Overview

The RTS Agent Download System provides a public API for downloading monitoring agent binaries with automatic platform/architecture detection and version management.

## Architecture

### Frontend
- **Download Page**: `/download` - Public-facing download page with platform selection
- **Icons**: Windows (Laptop), macOS (Apple), Linux (Server)
- **Features**: Platform selection, subscription notice, installation instructions

### Backend API

**Base URL**: `/api/agent`

#### Endpoints

##### 1. Download Agent Binary
```
GET /api/agent/download/:platform
```

**Parameters:**
- `platform` (required): `windows`, `macos`, or `linux`
- `version` (optional): Specific version (e.g., `1.0.0`). Defaults to latest.
- `arch` (optional): Architecture (`amd64`, `arm64`, `386`). Auto-detected from User-Agent if not specified.

**Response**: Binary file download

**Headers:**
- `X-Agent-Version`: Version being downloaded
- `X-Agent-Platform`: Platform
- `X-Agent-Architecture`: Architecture

**Examples:**
```bash
# Download latest Windows agent (auto-detect arch)
curl -O http://localhost:3001/api/agent/download/windows

# Download specific macOS version for ARM64
curl -O "http://localhost:3001/api/agent/download/macos?version=1.0.0&arch=arm64"

# Download latest Linux agent
curl -O http://localhost:3001/api/agent/download/linux
```

##### 2. List Available Versions
```
GET /api/agent/versions/:platform
```

**Parameters:**
- `platform` (required): `windows`, `macos`, or `linux`

**Response:**
```json
{
  "success": true,
  "platform": "windows",
  "versions": ["1.1.0", "1.0.1", "1.0.0"],
  "latest": "1.1.0"
}
```

**Example:**
```bash
curl http://localhost:3001/api/agent/versions/macos
```

##### 3. Auto-Detect Platform
```
GET /api/agent/detect
```

**Response:**
```json
{
  "success": true,
  "userAgent": "Mozilla/5.0...",
  "detected": {
    "platform": "macos",
    "architecture": "arm64"
  }
}
```

**Example:**
```bash
curl http://localhost:3001/api/agent/detect
```

## Directory Structure

### Development/Staging
```
/tmp/agent-binaries/
├── windows/
│   ├── 1.0.0/
│   │   └── rts-agent-amd64.exe
│   ├── 1.0.1/
│   │   └── rts-agent-amd64.exe
│   └── 1.1.0/
│       └── rts-agent-amd64.exe
├── macos/
│   ├── 1.0.0/
│   │   └── rts-agent-amd64.dmg
│   ├── 1.0.1/
│   │   └── rts-agent-amd64.dmg
│   └── 1.1.0/
│       ├── rts-agent-amd64.dmg
│       └── rts-agent-arm64.dmg
└── linux/
    ├── 1.0.0/
    │   └── rts-agent-amd64.deb
    ├── 1.0.1/
    │   └── rts-agent-amd64.deb
    └── 1.1.0/
        └── rts-agent-amd64.deb
```

### Production (EC2)
```
/home/ec2-user/agent-binaries/
└── (same structure as development)
```

## Setup Instructions

### Development/Staging

1. **Test binaries are already created** in `/tmp/agent-binaries/`

2. **Test the API:**
```bash
# List available versions
curl http://localhost:3001/api/agent/versions/windows

# Auto-detect platform
curl http://localhost:3001/api/agent/detect

# Download latest
curl -O http://localhost:3001/api/agent/download/windows
```

### Production (EC2)

1. **SSH to production server:**
```bash
ssh botmanager
```

2. **Clone/pull latest code** (if not already done):
```bash
cd ~/romero-tech-solutions-repo
git pull origin main
```

3. **Run setup script:**
```bash
cd ~/romero-tech-solutions-repo
./scripts/setup-agent-binaries-storage.sh production
```

4. **Upload compiled agent binaries:**
```bash
# From your local machine (example for macOS):
scp /Users/louis/New/01_Projects/rts-monitoring-agent/bin/rts-agent \
    botmanager:/home/ec2-user/agent-binaries/macos/1.0.0/rts-agent-arm64.dmg

# Or use rsync for multiple files:
rsync -avz /Users/louis/New/01_Projects/rts-monitoring-agent/bin/ \
    botmanager:/home/ec2-user/agent-binaries/
```

5. **Verify binaries:**
```bash
ls -laR /home/ec2-user/agent-binaries/
```

6. **Backend will automatically detect** new binaries (no restart needed)

## File Naming Convention

**Format**: `rts-agent-{arch}.{ext}`

- **Windows**: `rts-agent-amd64.exe`, `rts-agent-386.exe`
- **macOS**: `rts-agent-amd64.dmg`, `rts-agent-arm64.dmg`
- **Linux**: `rts-agent-amd64.deb`, `rts-agent-arm64.deb`, `rts-agent-386.deb`

## Version Management

- **Semantic Versioning**: Use `X.Y.Z` format (e.g., `1.0.0`, `1.0.1`, `1.1.0`)
- **Latest Version**: Automatically selected based on highest version number
- **Multiple Architectures**: Store different architectures in the same version directory

## Platform Detection Logic

### User-Agent Parsing

**Windows Detection:**
- `windows`, `win32`, `win64` → `windows`

**macOS Detection:**
- `mac`, `darwin` → `macos`

**Linux Detection:**
- `linux`, `ubuntu`, `debian` → `linux`

### Architecture Detection

- `arm64`, `aarch64` → `arm64`
- `x86_64`, `x64`, `amd64` → `amd64`
- `i686`, `i386`, `x86` → `386`
- Default: `amd64`

## Security

- **No Authentication Required**: Public endpoint (anyone can download)
- **Rate Limiting**: `generalLimiter` applied to prevent abuse
- **Read-Only**: Binaries are served as static files (no modification)
- **Validation**: Platform and version parameters are validated

## Testing

### Local Development

```bash
# Test auto-detection
curl http://localhost:3001/api/agent/detect

# Test version listing
curl http://localhost:3001/api/agent/versions/windows
curl http://localhost:3001/api/agent/versions/macos
curl http://localhost:3001/api/agent/versions/linux

# Test downloads (latest)
curl -I http://localhost:3001/api/agent/download/windows
curl -I http://localhost:3001/api/agent/download/macos
curl -I http://localhost:3001/api/agent/download/linux

# Test specific version and architecture
curl -I "http://localhost:3001/api/agent/download/macos?version=1.0.0&arch=arm64"
curl -I "http://localhost:3001/api/agent/download/windows?version=1.1.0&arch=amd64"
```

### Frontend Testing

1. Navigate to http://localhost:5173/download
2. Select platform (Windows/macOS/Linux)
3. Click "Download" button
4. Should trigger download with correct filename

### Production Testing

```bash
# Test production API
curl https://api.romerotechsolutions.com/api/agent/detect
curl https://api.romerotechsolutions.com/api/agent/versions/windows

# Test production frontend
https://romerotechsolutions.com/download
```

## Troubleshooting

### Binary Not Found
- Check directory structure: `ls -laR /tmp/agent-binaries` (dev) or `ls -laR /home/ec2-user/agent-binaries` (prod)
- Verify file naming matches convention
- Check version directory exists
- Review backend logs for errors

### Wrong Architecture Downloaded
- Check User-Agent detection: `curl http://localhost:3001/api/agent/detect`
- Explicitly specify architecture: `?arch=arm64`

### Latest Version Not Detected
- Ensure version directories use semantic versioning: `1.0.0`, not `1.0` or `v1.0.0`
- Check directory permissions (755 for directories)

## Future Enhancements

- [ ] Add SHA256 checksums for binary verification
- [ ] Implement download analytics/tracking
- [ ] Add release notes per version
- [ ] Support for automatic update notifications
- [ ] Digital signature verification
