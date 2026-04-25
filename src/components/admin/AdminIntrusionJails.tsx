import React, { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, Unlock, AlertCircle, CheckCircle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import apiService from '../../services/apiService';

interface JailStatus {
  jail: string;
  available: boolean;
  currentlyFailed?: number;
  totalFailed?: number;
  currentlyBanned?: number;
  totalBanned?: number;
  fileList?: string;
  bannedIps?: string[];
  error?: string;
}

interface JailsResponse {
  success: boolean;
  data: { jails: JailStatus[] };
}

interface UnbanResponse {
  success: boolean;
  data?: { jail: string; ip: string; unbanned: boolean };
  message?: string;
}

const JAIL_DESCRIPTIONS: Record<string, string> = {
  'romerotechsolutions-intrusion':
    'App-emitted bans (failed-login bursts, rate-limit hits, suspicious input). Tied to /var/log/romerotechsolutions/intrusion.log.',
  'nginx-exploit':
    'Shared OS-wide jail. Bans on the first probe of common exploit patterns (path traversal, .env scrapes, WordPress/PHP probes, SQL injection, etc.).',
  'nginx-bad-request':
    'Shared OS-wide jail. Bans IPs that send 5+ malformed (HTTP 400) requests inside 10 minutes — usually scanners.',
};

const AdminIntrusionJails: React.FC = () => {
  const { checkPermission } = usePermission();
  const canManage = checkPermission('manage.security_sessions.enable');

  const [jails, setJails] = useState<JailStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState<string | null>(null);   // "<jail>:<ip>" while in flight
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const resp = await apiService.get<JailsResponse>('/security/jails');
      if (resp.success) setJails(resp.data.jails);
      else setError('Failed to load jails');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load jails');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnban = async (jail: string, ip: string) => {
    if (!canManage) return;
    if (!window.confirm(`Unban ${ip} from ${jail}? This will let traffic from that IP through immediately.`)) return;

    const key = `${jail}:${ip}`;
    setUnbanning(key);
    setFlash(null);
    try {
      const resp = await apiService.post<UnbanResponse>(`/security/jails/${jail}/unban`, { ip });
      if (resp.success && resp.data?.unbanned) {
        setFlash({ kind: 'ok', msg: `Unbanned ${ip} from ${jail}` });
      } else if (resp.success) {
        setFlash({ kind: 'ok', msg: `${ip} was not currently banned in ${jail}` });
      } else {
        setFlash({ kind: 'err', msg: resp.message || 'Unban failed' });
      }
      await load(true);
    } catch (e: unknown) {
      setFlash({ kind: 'err', msg: e instanceof Error ? e.message : 'Unban failed' });
    } finally {
      setUnbanning(null);
      // Auto-clear flash after 4s.
      setTimeout(() => setFlash(prev => (prev?.msg.includes(ip) ? null : prev)), 4000);
    }
  };

  if (loading) {
    return (
      <div className={`p-8 ${themeClasses.bg.primary}`}>
        <div className={`${themeClasses.text.secondary} text-center`}>Loading intrusion jails…</div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${themeClasses.bg.primary} min-h-screen`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Shield className={`w-8 h-8 ${themeClasses.text.muted} mr-3`} />
            <div>
              <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Intrusion Jails</h1>
              <p className={`${themeClasses.text.secondary}`}>
                fail2ban-managed bans. The romerotechsolutions-intrusion jail surfaces app-level decisions; the nginx-* jails protect every site sharing access logs.
              </p>
            </div>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className={`flex items-center px-4 py-2 rounded-md ${themeClasses.button.secondary} disabled:opacity-50`}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {flash && (
          <div
            className={`mb-4 px-4 py-3 rounded-md flex items-center ${
              flash.kind === 'ok'
                ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200'
            }`}
          >
            {flash.kind === 'ok' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
            {flash.msg}
          </div>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        )}

        <div className="space-y-6">
          {jails.map(j => (
            <div key={j.jail} className={`${themeClasses.bg.card} rounded-lg ${themeClasses.shadow.md} p-6 border ${themeClasses.border.primary}`}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className={`text-lg font-semibold ${themeClasses.text.primary} font-mono`}>{j.jail}</h2>
                {j.available ? (
                  <span className={`text-sm ${themeClasses.text.secondary}`}>
                    Currently banned: <strong className={themeClasses.text.primary}>{j.currentlyBanned ?? 0}</strong>
                    <span className="mx-2">·</span>
                    Total ever: <strong className={themeClasses.text.primary}>{j.totalBanned ?? 0}</strong>
                  </span>
                ) : (
                  <span className="text-sm text-orange-600 dark:text-orange-400">unavailable</span>
                )}
              </div>
              {JAIL_DESCRIPTIONS[j.jail] && (
                <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>{JAIL_DESCRIPTIONS[j.jail]}</p>
              )}
              {!j.available && j.error && (
                <pre className={`text-xs ${themeClasses.text.tertiary} bg-gray-100 dark:bg-gray-800 p-3 rounded`}>{j.error}</pre>
              )}
              {j.available && (j.bannedIps?.length ?? 0) === 0 && (
                <p className={`text-sm ${themeClasses.text.tertiary} italic`}>No IPs currently banned.</p>
              )}
              {j.available && (j.bannedIps?.length ?? 0) > 0 && (
                <div className="overflow-hidden border rounded-md border-gray-200 dark:border-gray-700">
                  <table className="min-w-full">
                    <thead className={themeClasses.bg.secondary}>
                      <tr>
                        <th className={`px-4 py-2 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>IP address</th>
                        {canManage && (
                          <th className={`px-4 py-2 text-right text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider w-32`}>Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className={`divide-y divide-gray-200 dark:divide-gray-700 ${themeClasses.bg.card}`}>
                      {(j.bannedIps ?? []).map(ip => {
                        const key = `${j.jail}:${ip}`;
                        const inFlight = unbanning === key;
                        return (
                          <tr key={key}>
                            <td className={`px-4 py-2 text-sm font-mono ${themeClasses.text.primary}`}>{ip}</td>
                            {canManage && (
                              <td className="px-4 py-2 text-right">
                                <button
                                  onClick={() => handleUnban(j.jail, ip)}
                                  disabled={inFlight}
                                  className="inline-flex items-center px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400 text-white disabled:opacity-50"
                                >
                                  <Unlock className="w-3 h-3 mr-1" />
                                  {inFlight ? 'Unbanning…' : 'Unban'}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminIntrusionJails;
