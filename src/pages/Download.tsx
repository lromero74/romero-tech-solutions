import React, { useState } from 'react';
import { Download as DownloadIcon, Server, Apple, Check, AlertCircle, Shield, Activity, Clock, BarChart, Laptop } from 'lucide-react';

const Download: React.FC = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<'windows' | 'macos' | 'linux'>('windows');

  // Get API base URL from environment
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

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

  const platforms = [
    {
      id: 'windows' as const,
      name: 'Windows',
      icon: Laptop,
      file: 'rts-agent-setup-windows.exe',
      size: '12 MB',
      requirements: 'Windows 10 or later',
      downloadUrl: `${apiBaseUrl}/agent/download/windows`
    },
    {
      id: 'macos' as const,
      name: 'macOS',
      icon: Apple,
      file: 'rts-agent-setup-macos.dmg',
      size: '15 MB',
      requirements: 'macOS 12.0 (Monterey) or later',
      downloadUrl: `${apiBaseUrl}/agent/download/macos`
    },
    {
      id: 'linux' as const,
      name: 'Linux',
      icon: Server,
      file: 'rts-agent-setup-linux.deb',
      size: '10 MB',
      requirements: 'Ubuntu 20.04+ / Debian 11+',
      downloadUrl: `${apiBaseUrl}/agent/download/linux`
    }
  ];

  const selectedPlatformData = platforms.find(p => p.id === selectedPlatform);

  const handleDownload = async (platform: typeof selectedPlatform) => {
    const platformData = platforms.find(p => p.id === platform);
    if (!platformData) return;

    // Track download
    try {
      await fetch(platformData.downloadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        })
      });
    } catch (error) {
      console.error('Failed to track download:', error);
    }

    // Trigger download
    window.open(platformData.downloadUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-6">
            <DownloadIcon className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Download RTS Monitoring Agent
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Install our lightweight monitoring agent to enable 24/7 system health tracking,
            security monitoring, and proactive maintenance for your devices.
          </p>

          {/* Subscription Notice */}
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 max-w-2xl mx-auto mb-12">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <h3 className="font-semibold text-yellow-900 mb-1">Subscription Required</h3>
                <p className="text-sm text-yellow-800">
                  A per-device subscription is required to participate in our 24x7 monitoring solution.
                  <span className="font-medium"> $29.99/month per device</span> includes unlimited support,
                  automatic updates, and priority incident response.
                </p>
                <a
                  href="/pricing"
                  className="inline-flex items-center text-sm font-medium text-yellow-900 hover:text-yellow-700 mt-2"
                >
                  View Pricing Details →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            What's Included
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                  <feature.icon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Selection & Download */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
            Choose Your Platform
          </h2>

          {/* Platform Tabs */}
          <div className="flex justify-center gap-4 mb-8 flex-wrap">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`flex items-center gap-3 px-6 py-4 rounded-lg border-2 transition-all ${
                  selectedPlatform === platform.id
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <platform.icon className="w-6 h-6" />
                <span className="font-medium">{platform.name}</span>
              </button>
            ))}
          </div>

          {/* Download Card */}
          {selectedPlatformData && (
            <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                  <selectedPlatformData.icon className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {selectedPlatformData.name}
                  </h3>
                  <p className="text-gray-600">Version 1.0.0</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-gray-700">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>File: {selectedPlatformData.file}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>Size: {selectedPlatformData.size}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>Requirements: {selectedPlatformData.requirements}</span>
                </div>
              </div>

              <button
                onClick={() => handleDownload(selectedPlatform)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <DownloadIcon className="w-5 h-5" />
                Download for {selectedPlatformData.name}
              </button>

              <p className="text-sm text-gray-500 text-center mt-4">
                By downloading, you agree to our{' '}
                <a href="/terms" className="text-blue-600 hover:underline">
                  Terms of Service
                </a>
                {' '}and{' '}
                <a href="/privacy" className="text-blue-600 hover:underline">
                  Privacy Policy
                </a>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Installation Steps */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Quick Installation
          </h2>

          <div className="space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Download the Agent
                  </h3>
                  <p className="text-gray-600">
                    Download the agent installer for your operating system using the button above.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Run the Installer
                  </h3>
                  <p className="text-gray-600">
                    Double-click the downloaded file and follow the on-screen instructions.
                    Administrator/sudo access may be required.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Register Your Device
                  </h3>
                  <p className="text-gray-600 mb-2">
                    Enter your registration token (provided after subscription purchase) to
                    connect your device to our monitoring platform.
                  </p>
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
                    <strong>Don't have a token?</strong> Sign up for a subscription first, then
                    you'll receive your registration token via email.
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  4
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Configure Startup
                  </h3>
                  <p className="text-gray-600">
                    Choose whether to run the agent on login or install it as a system service
                    for continuous monitoring.
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
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Need Help?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
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
              className="inline-flex items-center justify-center px-8 py-3 bg-white hover:bg-gray-50 text-blue-600 font-semibold rounded-lg border-2 border-blue-600 transition-colors"
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
