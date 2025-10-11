import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Agent binary storage directory
// In production: /home/ec2-user/agent-binaries/
// In development: /tmp/agent-binaries/ (for testing)
const getAgentBinariesDir = () => {
  return process.env.NODE_ENV === 'production'
    ? '/home/ec2-user/agent-binaries'
    : '/tmp/agent-binaries';
};

// Platform detection from User-Agent
const detectPlatformFromUserAgent = (userAgent) => {
  if (!userAgent) return null;

  const ua = userAgent.toLowerCase();

  if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) {
    return 'windows';
  }
  if (ua.includes('mac') || ua.includes('darwin')) {
    return 'macos';
  }
  if (ua.includes('linux') || ua.includes('ubuntu') || ua.includes('debian')) {
    return 'linux';
  }

  return null;
};

// Architecture detection
const detectArchFromUserAgent = (userAgent) => {
  if (!userAgent) return 'amd64'; // Default to amd64

  const ua = userAgent.toLowerCase();

  if (ua.includes('arm64') || ua.includes('aarch64')) {
    return 'arm64';
  }
  if (ua.includes('x86_64') || ua.includes('x64') || ua.includes('amd64')) {
    return 'amd64';
  }
  if (ua.includes('i686') || ua.includes('i386') || ua.includes('x86')) {
    return '386';
  }

  return 'amd64'; // Default
};

// Get latest version for a platform
const getLatestVersion = async (platform) => {
  try {
    const binariesDir = getAgentBinariesDir();
    const platformDir = path.join(binariesDir, platform);

    // Check if platform directory exists
    try {
      await fs.access(platformDir);
    } catch {
      return null; // Platform directory doesn't exist
    }

    // Read all version directories
    const entries = await fs.readdir(platformDir, { withFileTypes: true });
    const versions = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => /^v?\d+\.\d+\.\d+$/.test(name)) // Match semantic versions
      .sort((a, b) => {
        // Remove 'v' prefix if present and split into parts
        const aParts = a.replace(/^v/, '').split('.').map(Number);
        const bParts = b.replace(/^v/, '').split('.').map(Number);

        // Compare major, minor, patch
        for (let i = 0; i < 3; i++) {
          if (aParts[i] !== bParts[i]) {
            return bParts[i] - aParts[i]; // Descending order
          }
        }
        return 0;
      });

    return versions[0] || null;
  } catch (error) {
    console.error(`Error getting latest version for ${platform}:`, error);
    return null;
  }
};

// Get binary filename for platform and architecture
const getBinaryFilename = (platform, arch) => {
  const baseName = 'rts-agent';

  switch (platform) {
    case 'windows':
      return `${baseName}-${arch}.exe`;
    case 'macos':
      return `${baseName}-${arch}.dmg`;
    case 'linux':
      return `${baseName}-${arch}.deb`;
    default:
      return `${baseName}-${arch}`;
  }
};

/**
 * GET /api/agent/download/:platform
 * Download agent binary for specified platform
 * Query params:
 *   - version: specific version (optional, defaults to latest)
 *   - arch: architecture (optional, auto-detected from user-agent)
 */
router.get('/download/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const requestedVersion = req.query.version;
    const requestedArch = req.query.arch;
    const userAgent = req.get('user-agent');

    console.log(`📥 Agent download request: platform=${platform}, version=${requestedVersion || 'latest'}, arch=${requestedArch || 'auto-detect'}, UA=${userAgent}`);

    // Validate platform
    const validPlatforms = ['windows', 'macos', 'linux'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
      });
    }

    // Detect or validate architecture
    const arch = requestedArch || detectArchFromUserAgent(userAgent);
    console.log(`🔍 Detected/requested architecture: ${arch}`);

    // Get version (latest if not specified)
    const version = requestedVersion || await getLatestVersion(platform);

    if (!version) {
      return res.status(404).json({
        success: false,
        message: `No agent binaries found for platform: ${platform}`
      });
    }

    console.log(`📦 Serving agent version: ${version}`);

    // Build binary path
    const binariesDir = getAgentBinariesDir();
    const filename = getBinaryFilename(platform, arch);
    const binaryPath = path.join(binariesDir, platform, version, filename);

    console.log(`📂 Binary path: ${binaryPath}`);

    // Check if binary exists
    try {
      await fs.access(binaryPath);
    } catch {
      return res.status(404).json({
        success: false,
        message: `Agent binary not found for ${platform} ${version} ${arch}`
      });
    }

    // Get file stats
    const stats = await fs.stat(binaryPath);

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('X-Agent-Version', version);
    res.setHeader('X-Agent-Platform', platform);
    res.setHeader('X-Agent-Architecture', arch);

    // Stream the file
    console.log(`✅ Sending agent binary: ${filename} (${Math.round(stats.size / 1024 / 1024)}MB)`);
    const fileStream = (await import('fs')).default.createReadStream(binaryPath);
    fileStream.pipe(res);

    // Log download completion
    fileStream.on('end', () => {
      console.log(`✅ Agent download completed: ${platform} ${version} ${arch}`);
    });

    fileStream.on('error', (error) => {
      console.error(`❌ Error streaming agent binary:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error downloading agent binary'
        });
      }
    });

  } catch (error) {
    console.error('❌ Agent download error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/agent/versions/:platform
 * List available versions for a platform
 */
router.get('/versions/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    // Validate platform
    const validPlatforms = ['windows', 'macos', 'linux'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
      });
    }

    const binariesDir = getAgentBinariesDir();
    const platformDir = path.join(binariesDir, platform);

    // Check if platform directory exists
    try {
      await fs.access(platformDir);
    } catch {
      return res.json({
        success: true,
        platform,
        versions: []
      });
    }

    // Read all version directories
    const entries = await fs.readdir(platformDir, { withFileTypes: true });
    const versions = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => /^v?\d+\.\d+\.\d+$/.test(name))
      .sort((a, b) => {
        const aParts = a.replace(/^v/, '').split('.').map(Number);
        const bParts = b.replace(/^v/, '').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if (aParts[i] !== bParts[i]) return bParts[i] - aParts[i];
        }
        return 0;
      });

    res.json({
      success: true,
      platform,
      versions,
      latest: versions[0] || null
    });

  } catch (error) {
    console.error('❌ Error listing agent versions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/agent/detect
 * Auto-detect platform and architecture from User-Agent
 */
router.get('/detect', (req, res) => {
  const userAgent = req.get('user-agent');
  const platform = detectPlatformFromUserAgent(userAgent);
  const arch = detectArchFromUserAgent(userAgent);

  res.json({
    success: true,
    userAgent,
    detected: {
      platform,
      architecture: arch
    }
  });
});

export default router;
