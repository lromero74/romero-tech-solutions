import React, { useState, useEffect } from 'react';
import { Download as DownloadIcon, Server, Apple, Check, AlertCircle, Shield, Activity, Clock, BarChart, Laptop, Monitor } from 'lucide-react';

interface DetectedPlatform {
  platform: string | null;
  architecture: string;
}

interface PlatformOption {
  id: string;
  name: string;
  icon: React.ElementType;
  architectures: ArchOption[];
}

interface ArchOption {
  id: string;
  name: string;
  bits: string;
  recommended?: boolean;
}

const Download: React.FC = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [selectedArch, setSelectedArch] = useState<string>('');
  const [selectedLinuxDistro, setSelectedLinuxDistro] = useState<string>('deb'); // Linux package format
  const [detectedPlatform, setDetectedPlatform] = useState<DetectedPlatform | null>(null);
  const [agentVersion, setAgentVersion] = useState('Loading...');
  const [isDetecting, setIsDetecting] = useState(true);
  const [releaseNotes, setReleaseNotes] = useState<string>('');

  // Get API base URL from environment
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

  // Platform configurations with architecture options
  const platforms: PlatformOption[] = [
    {
      id: 'windows',
      name: 'Windows',
      icon: Laptop,
      architectures: [
        { id: 'amd64', name: 'x64 (64-bit)', bits: '64-bit', recommended: true },
        { id: 'arm64', name: 'ARM64', bits: '64-bit ARM' },
        { id: '386', name: 'x86 (32-bit)', bits: '32-bit' }
      ]
    },
    {
      id: 'macos',
      name: 'macOS',
      icon: Apple,
      architectures: [
        { id: 'arm64', name: 'Apple Silicon (M1/M2/M3)', bits: 'ARM64', recommended: true },
        { id: 'amd64', name: 'Intel', bits: 'x86_64' }
      ]
    },
    {
      id: 'linux',
      name: 'Linux',
      icon: Server,
      architectures: [
        { id: 'amd64', name: 'x64 (64-bit)', bits: '64-bit', recommended: true },
        { id: 'arm64', name: 'ARM64 (64-bit)', bits: '64-bit ARM' },
        { id: 'armhf', name: 'ARMv7 (32-bit)', bits: '32-bit ARM' }
      ]
    }
  ];

  // Detect platform and architecture on mount (client-side for accuracy)
  useEffect(() => {
    const detectPlatform = () => {
      const ua = navigator.userAgent.toLowerCase();
      const platform = navigator.platform?.toLowerCase() || '';

      let detectedOS = 'windows';
      let detectedArch = 'amd64';

      // Detect OS
      if (platform.includes('mac') || ua.includes('mac')) {
        detectedOS = 'macos';

        // Detect macOS architecture
        // Apple Silicon Macs report as "MacIntel" for compatibility, so we need to check canvas fingerprint
        // or use maxTouchPoints as a heuristic (Apple Silicon Macs have this, Intel Macs don't in desktop Safari)
        const isAppleSilicon = (
          // Check if running on ARM64 via WebGL or other methods
          navigator.maxTouchPoints > 0 || // Touch support suggests Apple Silicon
          (window.screen && window.screen.height === 1117) || // Common M1/M2 resolution
          // Try to detect via canvas fingerprint
          (() => {
            try {
              const canvas = document.createElement('canvas');
              const gl = canvas.getContext('webgl');
              if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                  return renderer.toLowerCase().includes('apple');
                }
              }
            } catch (e) {
              // Ignore errors
            }
            return false;
          })()
        );

        detectedArch = isAppleSilicon ? 'arm64' : 'amd64';
      } else if (platform.includes('linux') || ua.includes('linux')) {
        detectedOS = 'linux';

        // Detect Linux architecture
        if (platform.includes('arm') || platform.includes('aarch64')) {
          detectedArch = 'arm64';
        } else if (platform.includes('armv7')) {
          detectedArch = 'armhf';
        } else {
          detectedArch = 'amd64';
        }

        // Detect Linux distribution and set package format
        let detectedDistro = 'deb'; // Default to .deb
        if (ua.includes('fedora') || ua.includes('redhat') || ua.includes('red hat') ||
            ua.includes('rhel') || ua.includes('centos') || ua.includes('rocky') ||
            ua.includes('alma')) {
          detectedDistro = 'rpm';
        } else if (ua.includes('arch') || ua.includes('manjaro')) {
          detectedDistro = 'pkg.tar.zst';
        } else if (ua.includes('ubuntu') || ua.includes('debian') || ua.includes('mint')) {
          detectedDistro = 'deb';
        }
        setSelectedLinuxDistro(detectedDistro);
      } else if (platform.includes('win') || ua.includes('windows')) {
        detectedOS = 'windows';

        // Detect Windows architecture
        if (ua.includes('win64') || ua.includes('wow64') || platform.includes('win64')) {
          detectedArch = 'amd64';
        } else if (ua.includes('arm64') || platform.includes('arm')) {
          detectedArch = 'arm64';
        } else {
          detectedArch = '386';
        }
      }

      setDetectedPlatform({ platform: detectedOS, architecture: detectedArch });
      setSelectedPlatform(detectedOS);

      // Validate and set architecture
      const platformData = platforms.find(p => p.id === detectedOS);
      if (platformData) {
        const archExists = platformData.architectures.some(a => a.id === detectedArch);
        setSelectedArch(archExists ? detectedArch : platformData.architectures[0].id);
      }

      setIsDetecting(false);
    };

    detectPlatform();
  }, []);

  // Fetch current agent version
  useEffect(() => {
    // Try to get version from versions endpoint
    if (selectedPlatform) {
      fetch(`${apiBaseUrl}/agent/versions/${selectedPlatform}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.latest) {
            setAgentVersion(data.latest.replace(/^v/, ''));
          }
        })
        .catch(() => setAgentVersion('1.16.14')); // Fallback to known version
    }
  }, [selectedPlatform, apiBaseUrl]);

  // Fetch release notes
  useEffect(() => {
    fetch('/agent-release-notes.txt')
      .then(res => res.ok ? res.text() : '')
      .then(notes => setReleaseNotes(notes))
      .catch(() => setReleaseNotes(''));
  }, []);

  // Update architecture when platform changes
  useEffect(() => {
    if (selectedPlatform) {
      const platform = platforms.find(p => p.id === selectedPlatform);
      if (platform && platform.architectures.length > 0) {
        // If current arch is not available for this platform, select first available
        const archExists = platform.architectures.some(a => a.id === selectedArch);
        if (!archExists) {
          // Prefer the recommended architecture
          const recommended = platform.architectures.find(a => a.recommended);
          setSelectedArch(recommended ? recommended.id : platform.architectures[0].id);
        }
      }
    }
  }, [selectedPlatform]);

  const features = [
    {
      icon: Activity,
      title: 'Real-Time Monitoring',
      description: '24/7 system health monitoring with instant alerts'
    },
    {
      icon: Shield,
      title: 'Security Tracking',
      description: 'Track patches, updates, and security vulnerabilities'
    },
    {
      icon: BarChart,
      title: 'Performance Metrics',
      description: 'CPU, memory, disk, and network performance tracking'
    },
    {
      icon: Clock,
      title: 'Uptime Monitoring',
      description: 'Track system uptime and service availability'
    }
  ];

  const getDownloadUrl = () => {
    if (!selectedPlatform || !selectedArch) return null;
    let url = `${apiBaseUrl}/agent/download/${selectedPlatform}?arch=${selectedArch}`;
    if (selectedPlatform === 'linux' && selectedLinuxDistro) {
      url += `&format=${selectedLinuxDistro}`;
    }
    return url;
  };

  const getFilename = () => {
    if (!selectedPlatform || !selectedArch || !agentVersion) return 'agent-installer';

    const version = agentVersion.replace(/^v/, '');

    switch (selectedPlatform) {
      case 'windows':
        return `rts-agent-${version}-windows-${selectedArch}.zip`;
      case 'macos':
        return `RTS-Agent-${version}-${selectedArch}.pkg`;
      case 'linux':
        // Return filename based on selected distro format
        switch (selectedLinuxDistro) {
          case 'deb':
            return `rts-agent_${version}_${selectedArch}.deb`;
          case 'rpm':
            const rpmArch = selectedArch === 'arm64' ? 'aarch64' : 'x86_64';
            return `rts-agent-${version}-1.${rpmArch}.rpm`;
          case 'pkg.tar.zst':
            return `rts-agent-${version}-1-aarch64.pkg.tar.zst`;
          default:
            return `rts-agent_${version}_${selectedArch}.deb`;
        }
      default:
        return `rts-agent-${version}-${selectedArch}`;
    }
  };

  const getFileSize = () => {
    // Approximate sizes based on platform/arch
    if (selectedPlatform === 'windows') return '7-8 MB';
    if (selectedPlatform === 'macos') return '8-9 MB';
    if (selectedPlatform === 'linux') return '6-7 MB';
    return '~8 MB';
  };

  const getRequirements = () => {
    if (selectedPlatform === 'windows') return 'Windows 10 or later';
    if (selectedPlatform === 'macos') return 'macOS 12.0 (Monterey) or later';
    if (selectedPlatform === 'linux') {
      switch (selectedLinuxDistro) {
        case 'deb':
          return 'Ubuntu 20.04+ / Debian 11+ / Linux Mint 20+';
        case 'rpm':
          return 'Red Hat 8+ / Fedora 35+ / CentOS Stream 8+';
        case 'pkg.tar.zst':
          return 'Arch Linux / Manjaro (ARM64 only)';
        default:
          return 'Ubuntu 20.04+ / Debian 11+';
      }
    }
    return '';
  };

  const handleDownload = () => {
    const downloadUrl = getDownloadUrl();
    if (!downloadUrl) return;

    // Trigger download
    window.location.href = downloadUrl;
  };

  const selectedPlatformData = platforms.find(p => p.id === selectedPlatform);
  const selectedArchData = selectedPlatformData?.architectures.find(a => a.id === selectedArch);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900 rounded-full mb-6">
            <DownloadIcon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Download RTS Monitoring Agent
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            Install our lightweight monitoring agent to enable 24/7 system health tracking,
            security monitoring, and proactive maintenance for your devices.
          </p>

          {/* Free Tier Notice */}
          <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-lg p-6 max-w-2xl mx-auto mb-12">
            <div className="flex items-start gap-3">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">Start Free - No Credit Card Required</h3>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Monitor <span className="font-medium">2 devices at no cost</span> with no expiration.
                  Includes all core monitoring features, automatic updates, and dashboard access.
                </p>
                <a
                  href="/pricing"
                  className="inline-flex items-center text-sm font-medium text-green-900 dark:text-green-300 hover:text-green-700 dark:hover:text-green-100 mt-2"
                >
                  View Pricing Details →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 px-4 bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            What's Included
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
                  <feature.icon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Release Notes */}
      {releaseNotes && (
        <section className="py-12 px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-6">
              Release Notes - Version {agentVersion}
            </h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div
                className="max-h-96 overflow-y-auto font-mono text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded p-4 border border-gray-200 dark:border-gray-700"
                style={{ scrollbarWidth: 'thin' }}
              >
                {releaseNotes}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Platform Selection & Download */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">
            Choose Your Platform
          </h2>

          {/* Detection Status */}
          {isDetecting && (
            <p className="text-center text-gray-500 dark:text-gray-400 mb-8">Detecting your system...</p>
          )}
          {!isDetecting && detectedPlatform?.platform && (
            <p className="text-center text-green-600 dark:text-green-400 mb-8">
              ✓ Detected: {detectedPlatform.platform} ({detectedPlatform.architecture})
            </p>
          )}

          {/* Platform Tabs */}
          <div className="flex justify-center gap-4 mb-8 flex-wrap">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`flex items-center gap-3 px-6 py-4 rounded-lg border-2 transition-all ${
                  selectedPlatform === platform.id
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <platform.icon className="w-6 h-6" />
                <span className="font-medium">{platform.name}</span>
              </button>
            ))}
          </div>

          {/* Architecture Selection */}
          {selectedPlatformData && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 text-center">
                Select Architecture
              </h3>
              <div className="flex justify-center gap-3 flex-wrap">
                {selectedPlatformData.architectures.map((arch) => (
                  <button
                    key={arch.id}
                    onClick={() => setSelectedArch(arch.id)}
                    className={`px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                      selectedArch === arch.id
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium">{arch.name}</div>
                    <div className="text-xs opacity-75">{arch.bits}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Linux Distribution Selection */}
          {selectedPlatform === 'linux' && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 text-center">
                Select Package Format
              </h3>
              <div className="flex justify-center gap-3 flex-wrap">
                <button
                  onClick={() => setSelectedLinuxDistro('deb')}
                  className={`px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                    selectedLinuxDistro === 'deb'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium">.deb</div>
                  <div className="text-xs opacity-75">Ubuntu / Debian</div>
                </button>
                <button
                  onClick={() => setSelectedLinuxDistro('rpm')}
                  className={`px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                    selectedLinuxDistro === 'rpm'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium">.rpm</div>
                  <div className="text-xs opacity-75">Red Hat / Fedora</div>
                </button>
                {selectedArch === 'arm64' && (
                  <button
                    onClick={() => setSelectedLinuxDistro('pkg.tar.zst')}
                    className={`px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                      selectedLinuxDistro === 'pkg.tar.zst'
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium">.pkg.tar.zst</div>
                    <div className="text-xs opacity-75">Arch Linux</div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Download Card */}
          {selectedPlatformData && selectedArchData && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                  <selectedPlatformData.icon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {selectedPlatformData.name}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Version {agentVersion} - {selectedArchData.name}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span>File: {getFilename()}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span>Size: {getFileSize()}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span>Requirements: {getRequirements()}</span>
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={!selectedPlatform || !selectedArch}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <DownloadIcon className="w-5 h-5" />
                Download for {selectedPlatformData.name} ({selectedArchData.name})
              </button>

              {/* Installation Instructions - Platform Specific */}
              <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                      Installation Instructions (Unsigned Package)
                    </h4>

                    {selectedPlatform === 'macos' && (
                      <div className="text-yellow-800 dark:text-yellow-200 space-y-2">
                        <p className="font-medium">If you see "Apple could not verify" warning:</p>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li><strong>Right-click</strong> (or Control-click) the downloaded .pkg file</li>
                          <li>Select <strong>"Open"</strong> from the menu</li>
                          <li>Click <strong>"Open"</strong> again in the dialog that appears</li>
                        </ol>
                        <p className="mt-2 text-xs italic">
                          Alternative: Open System Settings → Privacy & Security, scroll down to find
                          the blocked installer, and click "Open Anyway"
                        </p>
                      </div>
                    )}

                    {selectedPlatform === 'windows' && (
                      <div className="text-yellow-800 dark:text-yellow-200 space-y-2">
                        <p className="font-medium">If you see "Windows protected your PC" (SmartScreen):</p>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>Click <strong>"More info"</strong></li>
                          <li>Click <strong>"Run anyway"</strong></li>
                        </ol>
                        <p className="mt-2 text-xs italic">
                          Extract the .zip file, then run the installer with administrator privileges
                        </p>
                      </div>
                    )}

                    {selectedPlatform === 'linux' && (
                      <div className="text-yellow-800 dark:text-yellow-200 space-y-2">
                        <p className="font-medium">Installation commands:</p>
                        <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded p-2 font-mono text-xs mt-1">
                          {selectedLinuxDistro === 'deb' && (
                            <>
                              # Ubuntu/Debian (.deb)<br/>
                              sudo dpkg -i {getFilename()}<br/>
                              sudo apt-get install -f  # Install dependencies<br/><br/>
                              # Or double-click the .deb file in your file manager
                            </>
                          )}
                          {selectedLinuxDistro === 'rpm' && (
                            <>
                              # Red Hat/Fedora/CentOS (.rpm)<br/>
                              sudo rpm -ivh {getFilename()}<br/><br/>
                              # Or using dnf:<br/>
                              sudo dnf install {getFilename()}<br/><br/>
                              # Or using yum:<br/>
                              sudo yum localinstall {getFilename()}
                            </>
                          )}
                          {selectedLinuxDistro === 'pkg.tar.zst' && (
                            <>
                              # Arch Linux (.pkg.tar.zst)<br/>
                              sudo pacman -U {getFilename()}<br/><br/>
                              # The package will be installed with all dependencies
                            </>
                          )}
                        </div>
                        <p className="mt-2 text-xs italic">
                          After installation, the service starts automatically. Check status with: sudo systemctl status rts-agent
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-4">
                By downloading, you agree to our{' '}
                <a href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
                  Terms of Service
                </a>
                {' '}and{' '}
                <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
                  Privacy Policy
                </a>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Installation Steps */}
      <section className="py-16 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Quick Installation
          </h2>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Download the Agent
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Download the agent installer for your operating system and architecture using the button above.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Run the Installer
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Double-click the downloaded file and follow the on-screen instructions.
                    Administrator/sudo access may be required.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Register Your Device
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-2">
                    Follow the setup wizard to register your device. Free tier users get 2 devices at no cost.
                  </p>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-sm text-blue-900 dark:text-blue-100">
                    <strong>New to RTS?</strong> The agent will guide you through creating a free account
                    and registering your first device.
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  4
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Start Monitoring
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    The agent runs as a background service, automatically collecting system metrics
                    and sending them to your dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Need Help?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            Our technical support team is available 24/7 to assist with installation,
            configuration, and troubleshooting.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Contact Support
            </a>
            <a
              href="/docs"
              className="inline-flex items-center justify-center px-8 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400 font-semibold rounded-lg border-2 border-blue-600 dark:border-blue-500 transition-colors"
            >
              View Documentation
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Download;
