import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Shield, X } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import apiService from '../../../services/apiService';

/**
 * ChangelogDialog — when the user clicks the "Latest" version cell on
 * an outdated package, this opens and shows what's been patched
 * between their installed version and the latest available. Backed by
 * OSV.dev (proxied through /api/agents/packages/vulnerabilities) for
 * CVE / security advisory data; pure changelog text isn't covered yet
 * (no universal source across ecosystems) so we link to the package's
 * homepage / release page where available.
 */

// Maps the manager-name strings the agent reports onto OSV.dev
// ecosystem identifiers. OSV uses canonical capitalization
// (https://google.github.io/osv.dev/list-of-schemas.html).
const ecosystemMap: Record<string, string> = {
  pip: 'PyPI',
  pip3: 'PyPI',
  pypi: 'PyPI',
  npm: 'npm',
  gem: 'RubyGems',
  cargo: 'crates.io',
  brew: 'Homebrew',
  homebrew: 'Homebrew',
  // Linux distros — OSV uses the distro name as the ecosystem
  apt: 'Debian',         // approximation; could be Ubuntu — caller can override
  dnf: 'Rocky Linux',    // approximation; could be Fedora/RHEL/Alma
  yum: 'Rocky Linux',
  pacman: 'Alpine',      // not a perfect match; arch isn't an OSV ecosystem
  zypper: 'openSUSE',    // not currently a top-level OSV ecosystem either
};

interface Vulnerability {
  id: string;
  summary?: string;
  details?: string;
  severity?: Array<{ type: string; score: string }>;
  aliases?: string[];
  references?: Array<{ type: string; url: string }>;
  published?: string;
  modified?: string;
}

interface ChangelogResponse {
  success: boolean;
  data?: {
    ecosystem: string;
    package: string;
    count: number;
    vulnerabilities: Vulnerability[];
  };
  message?: string;
}

interface ChangelogDialogProps {
  packageName: string;
  manager: string;
  fromVersion: string;
  toVersion: string;
  onClose: () => void;
}

export const ChangelogDialog: React.FC<ChangelogDialogProps> = ({
  packageName, manager, fromVersion, toVersion, onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vulns, setVulns] = useState<Vulnerability[]>([]);

  const ecosystem = ecosystemMap[manager.toLowerCase()];

  useEffect(() => {
    let cancelled = false;
    if (!ecosystem) {
      setLoading(false);
      setError(`OSV.dev doesn't currently catalog ${manager} packages. CVE lookup not available for this ecosystem.`);
      return;
    }
    setLoading(true);
    setError(null);
    apiService
      .get<ChangelogResponse>('/agents/packages/vulnerabilities', {
        params: {
          ecosystem,
          package: packageName,
          from_version: fromVersion,
          to_version: toVersion,
        },
      })
      .then(r => {
        if (cancelled) return;
        if (r.success && r.data) {
          setVulns(r.data.vulnerabilities);
        } else {
          setError(r.message || 'Lookup failed');
        }
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.message || 'Lookup failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ecosystem, manager, packageName, fromVersion, toVersion]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} w-full max-w-3xl rounded-lg`}>
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
          <div>
            <h2 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
              {packageName}: {fromVersion} → {toVersion}
            </h2>
            <p className={`text-xs ${themeClasses.text.secondary}`}>
              {manager} · advisories from {ecosystem || 'n/a'}
            </p>
          </div>
          <button onClick={onClose} className={themeClasses.text.secondary} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className={themeClasses.text.primary}>Looking up advisories…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 text-yellow-700 dark:text-yellow-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && vulns.length === 0 && (
            <div className="flex items-start gap-2 text-green-700 dark:text-green-300">
              <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">No security advisories between {fromVersion} and {toVersion}.</p>
                <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                  This update is most likely feature / bugfix only. For full release notes, visit
                  the package homepage on its registry (PyPI, npm, etc.).
                </p>
              </div>
            </div>
          )}

          {!loading && !error && vulns.length > 0 && (
            <>
              <p className={`text-sm ${themeClasses.text.primary}`}>
                <strong>{vulns.length}</strong> advisor{vulns.length === 1 ? 'y' : 'ies'} addressed
                between {fromVersion} and {toVersion}:
              </p>
              <ul className="space-y-3">
                {vulns.map(v => (
                  <li
                    key={v.id}
                    className="border border-gray-200 dark:border-gray-700 rounded p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <code className={`text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 ${themeClasses.text.primary}`}>
                          {v.id}
                        </code>
                        {v.severity && v.severity.length > 0 && (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            {v.severity.map(s => `${s.type} ${s.score}`).join(' · ')}
                          </span>
                        )}
                      </div>
                      {v.published && (
                        <span className={`text-xs ${themeClasses.text.secondary}`}>
                          published {new Date(v.published).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {v.summary && (
                      <p className={`text-sm ${themeClasses.text.primary}`}>{v.summary}</p>
                    )}
                    {v.aliases && v.aliases.length > 0 && (
                      <div className={`text-xs ${themeClasses.text.secondary}`}>
                        Also: {v.aliases.join(', ')}
                      </div>
                    )}
                    {v.references && v.references.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {v.references.slice(0, 4).map((r, i) => (
                          <a
                            key={i}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                            {r.type || 'link'}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangelogDialog;
