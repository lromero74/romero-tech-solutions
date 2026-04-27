import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Monitor, Server, Laptop, Smartphone, Circle, AlertTriangle, Activity, Plus, RefreshCw, Filter, X, Eye, Power, Trash2, MapPin, Edit, User, Building, Settings, Download, RotateCw, Clock } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { agentService, AgentDevice } from '../../services/agentService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
import { websocketService } from '../../services/websocketService';
import AgentEditModal from './AgentEditModal';
import { useAdminData } from '../../contexts/AdminDataContext';
import AgentAlertAggregationModal from './AgentAlertAggregationModal';

interface AgentDashboardProps {
  onViewAgentDetails?: (agentId: string) => void;
  onCreateRegistrationToken?: () => void;
  onViewBusiness?: (businessId: string) => void;
}

// formatAgentOS produces the user-facing OS label for an agent row.
// Prefers os_version when it already carries a marketing name
// (recognized by starting with macOS / Microsoft / Ubuntu / Fedora /
// etc. — what Get-CimInstance, sw_vers, or /etc/os-release's
// PRETTY_NAME naturally produces). Falls back to "<os_type>
// <os_version>" only for legacy agents whose os_version is just a
// bare semver (e.g. "26.0.1") so the display still tells you which
// OS family it is.
//
// "darwin" / "linux" / "windows" are kernel identifiers Go uses
// internally, NOT what end users would recognize. Showing those
// as the headline OS name was wrong (Louis flagged "darwin 26.0.1"
// — that's macOS Sequoia, not "darwin").
function formatAgentOS(osType: string | null | undefined, osVersion: string | null | undefined): string {
  const v = (osVersion || '').trim();
  const t = (osType || '').trim();
  if (!v && !t) return '';
  if (!v) return t;
  // Friendly version strings already include the OS family name.
  // Heuristic: if the first word is one of the known marketing
  // names, render the version on its own.
  const friendly = /^(macOS|Mac OS X|Microsoft|Windows|Ubuntu|Debian|Fedora|CentOS|Red Hat|RHEL|Rocky|AlmaLinux|openSUSE|SUSE|Arch|Manjaro|Pop!_OS|elementary|Linux Mint|Kali|Alpine|FreeBSD|OpenBSD|NetBSD)\b/i;
  if (friendly.test(v)) return v;
  // Legacy agents (pre-v1.16.87 on Windows/macOS) report a bare
  // semver in os_version. Combine with os_type for at least some
  // signal — it'll show as "darwin 26.0.1" but that's better than
  // showing nothing while we wait for the agent to upgrade.
  return t ? `${t} ${v}` : v;
}

// compareSemverDesc compares two dotted-integer version strings the
// same way the Go agent does in internal/updater.compareSemver:
// numeric per-segment, missing segments treated as 0, leading "v"
// tolerated. Returns >0 if a > b, <0 if a < b, 0 if equal. We do this
// rather than naive string compare because "1.16.10" > "1.16.9"
// lexically gives the wrong answer (tested against in agent's
// updater_test.go — same regression class).
function compareSemverDesc(a: string, b: string): number {
  const split = (v: string) =>
    v.replace(/^v/, '').trim().split('.').map((s) => {
      const n = parseInt(s, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const pa = split(a);
  const pb = split(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({
  onViewAgentDetails,
  onCreateRegistrationToken,
  onViewBusiness,
}) => {
  const [agents, setAgents] = useState<AgentDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Additional faceted filters. Each defaults to "all" so adding
  // new ones in the future can be done without breaking the
  // existing URL/state shape. Filters compose with AND semantics
  // — narrowing as you select more.
  const [osFilter, setOsFilter] = useState<string>('all');               // 'all' | 'windows' | 'darwin' | 'linux'
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<string>('all'); // 'all' | 'desktop' | 'laptop' | 'server' | 'mobile'
  const [updateFilter, setUpdateFilter] = useState<string>('all');       // 'all' | 'outdated' | 'current' | 'in_progress' | 'unknown'
  const [monitoringFilter, setMonitoringFilter] = useState<string>('all'); // 'all' | 'enabled' | 'disabled'
  const [seenFilter, setSeenFilter] = useState<string>('all');           // 'all' | '1h' | '24h' | '7d' | '30d' | 'never'
  const [businessFilter, setBusinessFilter] = useState<string>('all');   // 'all' | <business_id>
  const [locationFilter, setLocationFilter] = useState<string>('all');   // 'all' | <location_name>
  // Patch availability filter — separate from agent-version updates
  // (which already have their own filter). Buckets:
  //   any         — at least one OS patch OR package update OR distro upgrade
  //   os          — has OS patches (apt/dnf/pacman/Windows Update/softwareupdate)
  //   security    — has security-classified OS patches specifically
  //   reboot      — has patches that require a reboot
  //   packages    — has third-party package updates (brew/npm/pip/mas)
  //   distro      — has a major distro / OS release upgrade pending
  //   none        — no patches/updates pending
  const [patchFilter, setPatchFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('device_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    show: boolean;
    agentId?: string;
    agentName?: string;
  }>({ show: false });
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentDevice | null>(null);
  const [showAggregationModal, setShowAggregationModal] = useState(false);
  const [aggregationModalAgent, setAggregationModalAgent] = useState<AgentDevice | null>(null);

  // Latest released agent version, fetched from /api/agent/latest-version.
  // Used to compute the "Update available" badge in the version column.
  // null while loading or if the manifest is unreachable — in either case
  // the UI hides the badge rather than guess.
  const [latestAgentVersion, setLatestAgentVersion] = useState<string | null>(null);
  // Mirror the latest-version state into a ref so long-lived
  // websocket handlers (which capture state by closure at register
  // time) can read the *current* value when they fire instead of
  // the value as of registration. Without this, the listener
  // registered before the manifest fetch completes would forever
  // see latestAgentVersion=null and never clear the
  // updateInProgress marker.
  const latestAgentVersionRef = useRef<string | null>(null);
  useEffect(() => {
    latestAgentVersionRef.current = latestAgentVersion;
  }, [latestAgentVersion]);

  // Per-agent "update queued" state, keyed by agent.id with value =
  // the agent_version observed at the moment the admin clicked
  // Update Agent (or what the server told us when seeding from
  // pending_action_commands). Cleared on the next heartbeat that
  // reports a DIFFERENT version — that's the proof the unattended
  // install completed and the OS supervisor restarted on the new
  // binary. Comparing to "latest" alone was wrong: if a newer
  // release ships mid-update, the agent reaches v(N) but latest is
  // now v(N+1), and the badge would stick forever.
  //
  // Map (not Set) because we need the from-version for the version-
  // changed comparison.
  const [updateInProgress, setUpdateInProgress] = useState<Map<string, string | undefined>>(new Map());

  // Confirmation modal state for the dashboard-triggered "Update agent"
  // action. Mirrors the shape of confirmDelete so the rendering pattern
  // is consistent. fromVersion is shown in the modal copy so the admin
  // can sanity-check before they click "Update".
  const [confirmInstallUpdate, setConfirmInstallUpdate] = useState<{
    show: boolean;
    agentId?: string;
    agentName?: string;
    fromVersion?: string;
  }>({ show: false });

  // Confirmation modal for the bulk "Update all outdated" action.
  // Targets are computed at click time from the currently-filtered
  // agent list and frozen here so the modal copy doesn't drift if
  // the filter changes between open and confirm.
  const [confirmBulkUpdate, setConfirmBulkUpdate] = useState<{
    show: boolean;
    targets: Array<{ id: string; device_name: string; agent_version?: string }>;
  }>({ show: false, targets: [] });

  // Per-agent rebootScheduled state: agentId → { scheduledFor, message,
  // commandId }. Seeded from pending_action_commands on load (so it
  // survives a page refresh) and updated when admin schedules / agent
  // cancels a reboot. commandId is required so the admin's "Cancel
  // Reboot" can target the original reboot_host row.
  const [rebootScheduled, setRebootScheduled] = useState<Record<string, { scheduledForMs: number; message: string; commandId: string }>>({});

  // Confirmation modal for the dashboard-initiated "Cancel Reboot"
  // action. Mirrors confirmInstallUpdate / confirmReboot shape.
  const [confirmCancelReboot, setConfirmCancelReboot] = useState<{
    show: boolean;
    agentId?: string;
    agentName?: string;
    commandId?: string;
  }>({ show: false });

  // Reboot Device modal state. delayMode chooses between "in N minutes"
  // and a wall-clock time picker. The actual delay sent to the agent is
  // always derived in seconds at submit time.
  const [confirmReboot, setConfirmReboot] = useState<{
    show: boolean;
    agentId?: string;
    agentName?: string;
  }>({ show: false });
  const [rebootDelayMode, setRebootDelayMode] = useState<'minutes' | 'time'>('minutes');
  const [rebootMinutes, setRebootMinutes] = useState<number>(5);
  const [rebootTime, setRebootTime] = useState<string>(''); // HH:MM 24h
  const [rebootMessage, setRebootMessage] = useState<string>('Scheduled reboot from RTS dashboard');

  // Remote-control session state. iframeUrl + auditId are populated
  // when /remote-control/agents/:id/start succeeds; the iframe is
  // shown until the user clicks Disconnect (which fires
  // /remote-control/sessions/:id/end). starting flag covers the
  // ~1s gap between click and modal open.
  const [remoteControl, setRemoteControl] = useState<{
    show: boolean;
    starting?: boolean;
    iframeUrl?: string;
    auditId?: string;
    deviceName?: string;
    error?: string;
    // Pre-flight compatibility warning. When the target is a Linux
    // host on Wayland (or an X11 host whose xauth is missing), we
    // show a warning instead of opening an iframe that would
    // black-screen. The "Proceed anyway" button on the warning
    // calls back into handleStartRemoteControl with skipPreflight
    // so the admin can override after reading the explanation.
    preflight?: {
      kind: 'wayland' | 'xauth-missing';
      compositor?: string | null;
      pendingAgent?: AgentDevice;
    };
  }>({ show: false });

  // Get businesses and service locations for the edit modal
  const { businesses, serviceLocations } = useAdminData();

  // Permission checks
  const { checkPermission, loading: permissionsLoading } = usePermission();
  const canViewAgents = checkPermission('view.agents.enable');
  const canManageAgents = checkPermission('manage.agents.enable');
  const canCreateTokens = checkPermission('create.agent_tokens.enable');
  const canEditAgents = checkPermission('modify.agents.enable');
  // Same permission gate used for update_packages, reboot_host, and
  // refresh_patches commands — install_update is the same kind of
  // remote action so it should follow the same rule.
  const canSendCommands = checkPermission('send.agent_commands.enable');
  // Higher-privilege gate for browser-based remote control
  // (equivalent to physical-console access). Granted to admin +
  // executive only (see migration 074).
  const canRemoteControl = checkPermission('manage.remote_control.enable');

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load agents
  const loadAgents = useCallback(async () => {
    // Don't check permissions while they're still loading
    if (permissionsLoading) {
      return;
    }

    if (!canViewAgents) {
      setPermissionDenied({
        show: true,
        action: 'View Agents',
        requiredPermission: 'view.agents.enable',
        message: 'You do not have permission to view monitoring agents'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await agentService.listAgents();
      if (response.success && response.data) {
        setAgents(response.data.agents);
        // Re-seed updateInProgress from the server so a page refresh
        // doesn't lose the "Update in progress" badge while an
        // install_update command is still mid-flight on the agent
        // (pending/delivered/executing in agent_commands).
        const seededUpdates = new Map<string, string | undefined>();
        const seededReboots: Record<string, { scheduledForMs: number; message: string; commandId: string }> = {};
        for (const a of response.data.agents) {
          const pending = a.pending_action_commands ?? [];
          for (const c of pending) {
            if (c.command_type === 'install_update') {
              // Seed with the agent's current version as the
              // "from" version. Won't match the actual pre-click
              // version if the install already advanced — that's
              // OK, the badge clears on the NEXT version change.
              seededUpdates.set(a.id, a.agent_version);
            } else if (c.command_type === 'reboot_host') {
              // Scheduled-for time = requested_at + delay_seconds.
              // Falls back to "5 min from request" if delay missing.
              const params = (c.command_params ?? {}) as Record<string, unknown>;
              const delaySec = typeof params.delay_seconds === 'number' ? params.delay_seconds : 300;
              const message = typeof params.message === 'string' ? params.message : '(no message)';
              const requestedMs = new Date(c.requested_at).getTime();
              seededReboots[a.id] = {
                scheduledForMs: requestedMs + delaySec * 1000,
                message,
                commandId: c.command_id,
              };
            }
          }
        }
        setUpdateInProgress(seededUpdates);
        setRebootScheduled(seededReboots);
      } else {
        setError(response.message || 'Failed to load agents');
      }
    } catch (err) {
      console.error('Error loading agents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [canViewAgents, permissionsLoading]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Fetch the latest published agent version once on mount. The
  // value rarely changes and a stale read just means an agent that
  // was outdated 30 minutes ago might briefly look up-to-date — both
  // caller and server treat the badge as advisory, not authoritative.
  useEffect(() => {
    let cancelled = false;
    agentService.getLatestAgentVersion().then((v) => {
      if (!cancelled) setLatestAgentVersion(v);
    });
    return () => { cancelled = true; };
  }, []);

  // isAgentOutdated returns true when we know both sides of the
  // comparison and the agent's reported version is lexicographically
  // older. Returns false in any "we don't know" case (no manifest,
  // no agent_version on the row, or an agent ahead of the manifest
  // — e.g. a dev build) so the badge never lies.
  const isAgentOutdated = (agent: AgentDevice): boolean => {
    if (!latestAgentVersion || !agent.agent_version) return false;
    return compareSemverDesc(agent.agent_version, latestAgentVersion) < 0;
  };

  // computeRebootDelaySeconds reads the modal state (mode + minutes
  // OR specific HH:MM time) and returns the seconds-until-reboot
  // that the agent expects in command_params.delay_seconds. Returns
  // a clamped minimum of 60 — the agent rounds anything <60s up to
  // 1 minute on Linux/macOS anyway.
  const computeRebootDelaySeconds = (): number => {
    if (rebootDelayMode === 'minutes') {
      return Math.max(60, Math.round(rebootMinutes * 60));
    }
    // mode === 'time'
    if (!rebootTime) return 60;
    const [hh, mm] = rebootTime.split(':').map((s) => parseInt(s, 10));
    if (isNaN(hh) || isNaN(mm)) return 60;
    const target = new Date();
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= Date.now()) {
      // The picked time is in the past (or right now) — assume
      // tomorrow so we don't fire immediately.
      target.setDate(target.getDate() + 1);
    }
    return Math.max(60, Math.round((target.getTime() - Date.now()) / 1000));
  };

  // Reboot the agent's host. Uses the same command-enqueue plumbing
  // as update_packages / install_update. The agent calls the OS
  // shutdown command with the requested delay, then watches for
  // cancellation — if the user at the host runs `shutdown -c` /
  // `shutdown /a`, the agent posts to /reboot-cancelled and the
  // dashboard flips this badge to "Cancelled".
  const handleRebootHost = async () => {
    if (!canSendCommands) {
      setPermissionDenied({
        show: true,
        action: 'Reboot Device',
        requiredPermission: 'send.agent_commands.enable',
        message: 'You do not have permission to issue agent commands',
      });
      setConfirmReboot({ show: false });
      return;
    }
    if (!confirmReboot.agentId) return;
    const targetId = confirmReboot.agentId;
    const delaySeconds = computeRebootDelaySeconds();
    const message = rebootMessage.trim() || 'Scheduled reboot from RTS dashboard';
    try {
      setActionInProgress(targetId);
      const response = await agentService.requestRebootHost(targetId, {
        delay_seconds: delaySeconds,
        message,
      });
      if (response.success && response.data?.command_id) {
        setRebootScheduled((prev) => ({
          ...prev,
          [targetId]: {
            scheduledForMs: Date.now() + delaySeconds * 1000,
            message,
            commandId: response.data!.command_id,
          },
        }));
      } else if (!response.success) {
        setError(response.message || 'Failed to schedule reboot');
      }
    } catch (err) {
      console.error('Error scheduling reboot:', err);
      setError(err instanceof Error ? err.message : 'Failed to schedule reboot');
    } finally {
      setActionInProgress(null);
      setConfirmReboot({ show: false });
    }
  };

  // Cancel a pending reboot. Sends a cancel_reboot agent command
  // referencing the original reboot_host command's id; the agent
  // runs the OS-specific cancel (`shutdown -c` / `shutdown /a` /
  // `killall shutdown`) and POSTs to /reboot-cancelled with
  // source='admin'. The websocket listener clears the badge.
  const handleCancelReboot = async () => {
    if (!canSendCommands) {
      setPermissionDenied({
        show: true,
        action: 'Cancel Reboot',
        requiredPermission: 'send.agent_commands.enable',
        message: 'You do not have permission to issue agent commands',
      });
      setConfirmCancelReboot({ show: false });
      return;
    }
    if (!confirmCancelReboot.agentId || !confirmCancelReboot.commandId) return;
    const targetId = confirmCancelReboot.agentId;
    try {
      setActionInProgress(targetId);
      const response = await agentService.requestCancelReboot(targetId, confirmCancelReboot.commandId);
      if (!response.success) {
        setError(response.message || 'Failed to send cancel');
      }
      // Don't optimistically clear the badge — the websocket
      // listener will drop it when the agent confirms cancellation.
      // Clearing eagerly would briefly show "no reboot scheduled"
      // even if the cancel command failed at the agent.
    } catch (err) {
      console.error('Error cancelling reboot:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel reboot');
    } finally {
      setActionInProgress(null);
      setConfirmCancelReboot({ show: false });
    }
  };

  // Bulk-trigger install_update for every agent in confirmBulkUpdate.targets.
  // Concurrent dispatch via Promise.allSettled so a single failure
  // doesn't block the rest. Each successful enqueue gets added to
  // updateInProgress optimistically; the websocket / page-refresh
  // path keeps things consistent if any optimism is wrong.
  const handleBulkInstallUpdate = async () => {
    if (!canSendCommands) {
      setPermissionDenied({
        show: true,
        action: 'Update Agents',
        requiredPermission: 'send.agent_commands.enable',
        message: 'You do not have permission to issue agent commands',
      });
      setConfirmBulkUpdate({ show: false, targets: [] });
      return;
    }
    const targets = confirmBulkUpdate.targets;
    if (targets.length === 0) {
      setConfirmBulkUpdate({ show: false, targets: [] });
      return;
    }
    try {
      setActionInProgress('__bulk_update__');
      const results = await Promise.allSettled(
        targets.map((t) => agentService.requestInstallUpdate(t.id))
      );
      const queued = new Map<string, string | undefined>();
      let failures = 0;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.success) {
          queued.set(targets[i].id, targets[i].agent_version);
        } else {
          failures++;
        }
      });
      if (queued.size > 0) {
        setUpdateInProgress((prev) => {
          const next = new Map(prev);
          queued.forEach((fromV, id) => next.set(id, fromV));
          return next;
        });
      }
      if (failures > 0) {
        setError(`${queued.size} update${queued.size === 1 ? '' : 's'} queued; ${failures} failed`);
      }
    } catch (err) {
      console.error('Bulk update error:', err);
      setError(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setActionInProgress(null);
      setConfirmBulkUpdate({ show: false, targets: [] });
    }
  };

  // Trigger a dashboard-initiated agent update. Uses the same
  // command-enqueue plumbing as update_packages / reboot_host. The
  // agent's command-poll loop picks it up within
  // CommandPollInterval seconds and runs the unattended install
  // path; success is observed when the agent's next heartbeat
  // arrives carrying the new agent_version.
  const handleInstallUpdate = async () => {
    if (!canSendCommands) {
      setPermissionDenied({
        show: true,
        action: 'Update Agent',
        requiredPermission: 'send.agent_commands.enable',
        message: 'You do not have permission to issue agent commands',
      });
      setConfirmInstallUpdate({ show: false });
      return;
    }
    if (!confirmInstallUpdate.agentId) return;
    const targetId = confirmInstallUpdate.agentId;
    try {
      setActionInProgress(targetId);
      const response = await agentService.requestInstallUpdate(targetId);
      if (response.success) {
        // Mark the agent as "update in progress". Store the
        // version we observed pre-click as the "from" version —
        // the websocket listener clears the entry when a heartbeat
        // arrives reporting a different version (proof the install
        // completed and the supervisor brought the agent back).
        const fromV = agents.find((a) => a.id === targetId)?.agent_version;
        setUpdateInProgress((prev) => {
          const next = new Map(prev);
          next.set(targetId, fromV);
          return next;
        });
      } else {
        setError(response.message || 'Failed to queue agent update');
      }
    } catch (err) {
      console.error('Error queueing agent update:', err);
      setError(err instanceof Error ? err.message : 'Failed to queue agent update');
    } finally {
      setActionInProgress(null);
      setConfirmInstallUpdate({ show: false });
    }
  };

  // Initiate a remote-control session against an agent host.
  // Mints the MeshCentral session URL via the backend, then opens
  // the iframe modal.
  const handleStartRemoteControl = async (agent: AgentDevice, skipPreflight = false) => {
    if (!canRemoteControl) {
      setPermissionDenied({
        show: true,
        action: 'Remote Control',
        permission: 'manage.remote_control.enable',
      });
      return;
    }
    // Pre-flight Wayland / X-auth check on Linux hosts. Surfaces the
    // limitation to the admin BEFORE opening the iframe — opening
    // an iframe that black-screens then disconnects is a worse UX
    // than a clear "this won't work and here's why" modal. Admin
    // can still proceed via the modal's "Proceed anyway" button
    // (skipPreflight=true) for cases where they know the agent is
    // capable but the heartbeat snapshot is stale.
    if (!skipPreflight && agent.os_type === 'linux') {
      if (agent.display_server === 'wayland') {
        setRemoteControl({
          show: true,
          starting: false,
          deviceName: agent.device_name,
          preflight: {
            kind: 'wayland',
            compositor: agent.compositor,
            pendingAgent: agent,
          },
        });
        return;
      }
      if (agent.display_server === 'x11' && agent.xauth_status === 'missing') {
        setRemoteControl({
          show: true,
          starting: false,
          deviceName: agent.device_name,
          preflight: {
            kind: 'xauth-missing',
            pendingAgent: agent,
          },
        });
        return;
      }
    }
    setRemoteControl({ show: true, starting: true, deviceName: agent.device_name });
    try {
      const resp = await agentService.requestRemoteControl(agent.id);
      const data: any = (resp as any)?.data || resp;
      if (!data?.session_url) {
        throw new Error((resp as any)?.message || 'No session URL returned');
      }
      setRemoteControl({
        show: true,
        starting: false,
        iframeUrl: data.session_url,
        auditId: data.audit_id,
        deviceName: data.device_name || agent.device_name,
      });
    } catch (e: any) {
      setRemoteControl({
        show: true,
        starting: false,
        deviceName: agent.device_name,
        error: e?.response?.data?.message || e?.message || 'Failed to start remote-control session',
      });
    }
  };

  // Close the remote-control modal AND notify the backend so the
  // audit row gets ended_at/disconnect_reason set. Best-effort —
  // network failure on /end doesn't block the UI close.
  const handleEndRemoteControl = async () => {
    const auditId = remoteControl.auditId;
    setRemoteControl({ show: false });
    if (auditId) {
      try {
        await agentService.requestEndRemoteControl(auditId);
      } catch (e) {
        console.warn('Failed to end remote-control session cleanly:', e);
      }
    }
  };

  // Toggle agent monitoring (enable/disable)
  const handleToggleMonitoring = async (agent: AgentDevice) => {
    if (!canManageAgents) {
      setPermissionDenied({
        show: true,
        action: 'Manage Agent',
        requiredPermission: 'manage.agents.enable',
        message: 'You do not have permission to disable/enable agents'
      });
      return;
    }

    try {
      setActionInProgress(agent.id);
      const newStatus = !agent.monitoring_enabled;

      const response = await agentService.updateAgent(agent.id, {
        monitoring_enabled: newStatus
      });

      if (response.success) {
        // Update local state
        setAgents(prevAgents =>
          prevAgents.map(a =>
            a.id === agent.id ? { ...a, monitoring_enabled: newStatus } : a
          )
        );
      } else {
        setError(response.message || 'Failed to update agent');
      }
    } catch (err) {
      console.error('Error toggling agent monitoring:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setActionInProgress(null);
    }
  };

  // Delete agent
  const handleDeleteAgent = async () => {
    if (!canManageAgents) {
      setPermissionDenied({
        show: true,
        action: 'Delete Agent',
        requiredPermission: 'manage.agents.enable',
        message: 'You do not have permission to delete agents'
      });
      return;
    }

    if (!confirmDelete.agentId) return;

    try {
      setActionInProgress(confirmDelete.agentId);
      const response = await agentService.deleteAgent(confirmDelete.agentId);

      if (response.success) {
        // Remove from local state
        setAgents(prevAgents => prevAgents.filter(a => a.id !== confirmDelete.agentId));
        setConfirmDelete({ show: false });
      } else {
        setError(response.message || 'Failed to delete agent');
      }
    } catch (err) {
      console.error('Error deleting agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    } finally {
      setActionInProgress(null);
      setConfirmDelete({ show: false });
    }
  };

  // Edit agent
  const handleEditAgent = (agent: AgentDevice) => {
    if (!canEditAgents) {
      setPermissionDenied({
        show: true,
        action: 'Edit Agent',
        requiredPermission: 'modify.agents.enable',
        message: 'You do not have permission to edit agents'
      });
      return;
    }

    setSelectedAgent(agent);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedAgent(null);
  };

  const handleAgentUpdated = () => {
    // Reload agents after edit
    loadAgents();
  };

  // Open aggregation settings modal
  const handleOpenAggregationModal = (agent: AgentDevice) => {
    setAggregationModalAgent(agent);
    setShowAggregationModal(true);
  };

  const handleCloseAggregationModal = () => {
    setShowAggregationModal(false);
    setAggregationModalAgent(null);
  };

  const handleAggregationUpdated = () => {
    // Reload agents after aggregation update
    loadAgents();
  };

  // WebSocket real-time updates for agent status and metrics
  useEffect(() => {
    if (!canViewAgents) return;

    console.log('🔌 Setting up WebSocket listeners for agent updates');

    // Listen for agent status updates
    const unsubscribeStatus = websocketService.onAgentStatusChange((update) => {
      console.log(`🤖 Agent status update received: ${update.agentId} = ${update.status}`);

      setAgents((prevAgents) => {
        return prevAgents.map((agent) => {
          if (agent.id === update.agentId) {
            return {
              ...agent,
              status: update.status,
              last_heartbeat: update.lastHeartbeat,
              // agent_version is on every heartbeat from agents
              // v1.16.77+. The conditional update preserves the
              // old value when an older agent (no agentVersion in
              // the broadcast payload) checks in, mirroring the
              // backend's COALESCE.
              agent_version: update.agentVersion ?? agent.agent_version,
              // os_version is on every heartbeat from agents
              // v1.16.87+. Same conditional-overwrite pattern so
              // older agents don't blow away the value with a
              // missing field.
              os_version: update.osVersion ?? agent.os_version,
              // remote_control_enabled flips when the end-user
              // toggles via the agent tray menu (v1.18.1+).
              // ?? preserves the existing value when older agents
              // (no field) heartbeat — same pattern as above.
              remote_control_enabled: update.remoteControlEnabled ?? agent.remote_control_enabled,
              // Linux display-server snapshot (v1.18.6+). Same
              // conditional pattern — older agents that don't
              // send these fields preserve whatever was last
              // stored, so a Linux host on Wayland keeps its
              // wayland marker until that's no longer true.
              display_server: update.displayServer ?? agent.display_server,
              xauth_status: update.xauthStatus ?? agent.xauth_status,
              compositor: update.compositor ?? agent.compositor,
            };
          }
          return agent;
        });
      });

      // If this agent had an "update in progress" marker AND the
      // heartbeat now reports a DIFFERENT version than what we had
      // when the user clicked, the unattended install completed
      // and the supervisor brought the agent back on the new build.
      // Clear the marker so the badge disappears.
      //
      // Comparing to the manifest's latest is wrong — if a newer
      // release ships mid-update, the agent reaches v(N) but
      // latest is now v(N+1) and the badge would stick forever
      // even though the install obviously succeeded.
      // Prefer server-derived openCommandTypes (v1.20+ backend) over
      // the legacy version-comparison heuristic. The version compare
      // gets stuck whenever the heartbeat lands AFTER the install
      // already advanced (Albondigas 2026-04-27): seeding picks up
      // the new version as the "from" version and the broadcast then
      // compares it against itself. With openCommandTypes we just
      // mirror server state directly.
      if (update.openCommandTypes !== undefined) {
        setUpdateInProgress((prev) => {
          if (!prev.has(update.agentId)) return prev;
          if (update.openCommandTypes!.includes('install_update')) return prev;
          const next = new Map(prev);
          next.delete(update.agentId);
          return next;
        });
        setRebootScheduled((prev) => {
          if (!(update.agentId in prev)) return prev;
          if (update.openCommandTypes!.includes('reboot_host')) return prev;
          const next = { ...prev };
          delete next[update.agentId];
          return next;
        });
      } else if (update.agentVersion) {
        // Legacy path for older backends that don't send
        // openCommandTypes. Same behavior as before.
        setUpdateInProgress((prev) => {
          if (!prev.has(update.agentId)) return prev;
          const fromV = prev.get(update.agentId);
          // If we don't know the from-version (shouldn't happen
          // post-fix, but defensive), clear on any heartbeat.
          if (fromV != null && fromV === update.agentVersion) {
            return prev;
          }
          const next = new Map(prev);
          next.delete(update.agentId);
          return next;
        });
      }
    });

    // Listen for agent metrics updates
    const unsubscribeMetrics = websocketService.onAgentMetricsChange((update) => {
      console.log(`📊 Agent metrics update received: ${update.agentId}`);

      setAgents((prevAgents) => {
        return prevAgents.map((agent) => {
          if (agent.id === update.agentId) {
            // Update agent with new metrics data
            return {
              ...agent,
              // Metrics are updated but we don't display them in the list view
              // The AgentDetails component will handle detailed metrics display
            };
          }
          return agent;
        });
      });
    });

    // Listen for agent.command.progress events. The interesting case
    // for the dashboard list view is stage='cancelled' on a
    // reboot_host command — that means the user at the host ran
    // shutdown -c / shutdown /a before the scheduled time. Clear
    // the per-row "Reboot scheduled" badge so the admin sees the
    // cancellation immediately instead of waiting for the badge's
    // own clock to tick past zero (and incorrectly showing "Rebooting
    // now…" for a reboot that never actually happened).
    const unsubscribeProgress = websocketService.onAgentCommandProgress((update) => {
      if (update.command_type === 'reboot_host' && update.stage === 'cancelled') {
        setRebootScheduled((prev) => {
          if (!(update.agent_id in prev)) return prev;
          const next = { ...prev };
          delete next[update.agent_id];
          return next;
        });
        // Surface the cancellation as a transient banner so the
        // admin knows it didn't fire (vs. the badge just disappearing
        // and looking like the reboot completed). Different copy
        // depending on whether the admin or the host user cancelled.
        const banner = update.cancelled_by === 'admin'
          ? 'Reboot cancelled'
          : 'Reboot was cancelled at the host';
        setError(banner);
        setTimeout(() => setError(null), 5000);
      }
    });

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up WebSocket listeners for agent updates');
      unsubscribeStatus();
      unsubscribeMetrics();
      unsubscribeProgress();
    };
  }, [canViewAgents]);

  // Get device icon based on type
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'server':
        return <Server className="w-5 h-5" />;
      case 'desktop':
      case 'workstation':
        return <Monitor className="w-5 h-5" />;
      case 'laptop':
        return <Laptop className="w-5 h-5" />;
      case 'mobile':
        return <Smartphone className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  // Get business display name (handles individuals vs businesses)
  const getBusinessDisplayName = (agent: AgentDevice) => {
    if (agent.is_individual && agent.individual_first_name && agent.individual_last_name) {
      // For individuals, use actual first and last name from users table
      return `${agent.individual_first_name} ${agent.individual_last_name}`;
    }
    return agent.business_name || '';
  };

  // Get status color and icon
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'online':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          icon: <Circle className="w-3 h-3 fill-current" />,
          label: 'Online'
        };
      case 'offline':
        return {
          color: 'text-red-700 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          icon: <Circle className="w-3 h-3 fill-current" />,
          label: 'Offline'
        };
      case 'warning':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          icon: <AlertTriangle className="w-3 h-3" />,
          label: 'Warning'
        };
      case 'critical':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          icon: <AlertTriangle className="w-3 h-3" />,
          label: 'Critical'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <Circle className="w-3 h-3" />,
          label: 'Unknown'
        };
    }
  };

  // Format last heartbeat time
  const formatLastSeen = (lastHeartbeat: string | null, createdAt?: string | null): string => {
    // If we never received a heartbeat at all, fall back to the
    // registration timestamp so the cell isn't a useless "Never"
    // for an agent that registered (we have a version, OS, etc.
    // for it) but somehow never checked in. Common cause: agent
    // installed and registered, then immediately uninstalled or
    // the host shut down before the first heartbeat tick.
    const ts = lastHeartbeat || createdAt;
    if (!ts) return 'Never';
    const isHeartbeat = !!lastHeartbeat;

    const now = new Date();
    const tsDate = new Date(ts);
    const diffMs = now.getTime() - tsDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    let relative: string;
    if (diffMins < 1) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else {
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) relative = `${diffHours}h ago`;
      else {
        const diffDays = Math.floor(diffHours / 24);
        relative = `${diffDays}d ago`;
      }
    }

    // Distinguish the two cases visually so the admin knows the
    // shown timestamp is a registration date, not a recent
    // heartbeat. Heartbeats just show "5m ago"; registration-
    // fallback shows "Registered 90d ago, never seen".
    return isHeartbeat ? relative : `Registered ${relative}, never seen`;
  };

  // Filter and sort agents
  const getFilteredAndSortedAgents = (): AgentDevice[] => {
    let filtered = agents;

    // Free-text search hits more fields than before — anything an
    // admin might reasonably type in the box should narrow the
    // list. Extra fields covered: device_type, agent_version,
    // os_version (so "11 Pro" matches Windows 11 Pro hosts),
    // and the individual contact name for individual businesses.
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((agent) => {
        const haystack = [
          agent.device_name,
          agent.business_name,
          agent.location_name,
          agent.os_type,
          agent.os_version,
          agent.device_type,
          agent.agent_version,
          agent.individual_first_name,
          agent.individual_last_name,
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase());
        return haystack.some((s) => s.includes(search));
      });
    }

    // Status (online/offline/warning/critical)
    if (statusFilter !== 'all') {
      filtered = filtered.filter((agent) => agent.status === statusFilter);
    }

    // OS family. Matches Go's runtime.GOOS values which is what
    // os_type stores.
    if (osFilter !== 'all') {
      filtered = filtered.filter((agent) => agent.os_type === osFilter);
    }

    // Device type — desktop / laptop / server / mobile.
    if (deviceTypeFilter !== 'all') {
      filtered = filtered.filter((agent) => agent.device_type === deviceTypeFilter);
    }

    // Update status. Computes against the manifest's latestAgentVersion
    // (already fetched and held in state) plus the live updateInProgress
    // map. Buckets:
    //   outdated     — version < latest, no update in flight
    //   in_progress  — admin clicked Update, agent hasn't returned new version yet
    //   current      — version >= latest
    //   unknown      — no agent_version reported (very old agent or
    //                  registered but never heartbeated)
    if (updateFilter !== 'all') {
      filtered = filtered.filter((agent) => {
        if (!agent.agent_version) return updateFilter === 'unknown';
        if (updateInProgress.has(agent.id)) return updateFilter === 'in_progress';
        if (!latestAgentVersion) return updateFilter === 'unknown';
        const cmp = compareSemverDesc(agent.agent_version, latestAgentVersion);
        if (cmp < 0) return updateFilter === 'outdated';
        return updateFilter === 'current';
      });
    }

    // Monitoring toggle
    if (monitoringFilter !== 'all') {
      filtered = filtered.filter((agent) =>
        monitoringFilter === 'enabled' ? agent.monitoring_enabled : !agent.monitoring_enabled
      );
    }

    // Last-seen recency. Computed off last_heartbeat (NOT created_at —
    // we want "have we heard from it recently", not "when was it
    // registered"). 'never' picks rows where last_heartbeat is null.
    if (seenFilter !== 'all') {
      const now = Date.now();
      const window: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      filtered = filtered.filter((agent) => {
        if (seenFilter === 'never') return !agent.last_heartbeat;
        if (!agent.last_heartbeat) return false;
        const ms = window[seenFilter];
        if (!ms) return true;
        return now - new Date(agent.last_heartbeat).getTime() <= ms;
      });
    }

    // Business / location filters. Useful for big fleets; both are
    // populated from the agents themselves so we never offer a
    // value that wouldn't return rows.
    if (businessFilter !== 'all') {
      filtered = filtered.filter((agent) => agent.business_id === businessFilter);
    }
    if (locationFilter !== 'all') {
      filtered = filtered.filter((agent) => (agent.location_name || '') === locationFilter);
    }

    // Patch availability. Pulls from the latest agent_metrics row
    // surfaced by the backend's patch_summary subquery. Agents that
    // never reported metrics (patch_summary === null) are treated
    // as "unknown" and only included in the 'all' bucket.
    if (patchFilter !== 'all') {
      filtered = filtered.filter((agent) => {
        const p = agent.patch_summary;
        if (!p) return false;
        switch (patchFilter) {
          case 'any':
            return p.os_patches > 0 || p.package_updates > 0 || p.distro_upgrade_available;
          case 'os':
            return p.os_patches > 0;
          case 'security':
            return p.os_security_patches > 0;
          case 'reboot':
            return p.os_patches_reboot;
          case 'packages':
            return p.package_updates > 0;
          case 'distro':
            return p.distro_upgrade_available;
          case 'none':
            return p.os_patches === 0 && p.package_updates === 0 && !p.distro_upgrade_available;
          default:
            return true;
        }
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let compareA: string | number = '';
      let compareB: string | number = '';

      switch (sortBy) {
        case 'device_name':
          compareA = a.device_name.toLowerCase();
          compareB = b.device_name.toLowerCase();
          break;
        case 'business_name':
          compareA = (a.business_name || '').toLowerCase();
          compareB = (b.business_name || '').toLowerCase();
          break;
        case 'status':
          compareA = a.status;
          compareB = b.status;
          break;
        case 'last_heartbeat':
          compareA = a.last_heartbeat ? new Date(a.last_heartbeat).getTime() : 0;
          compareB = b.last_heartbeat ? new Date(b.last_heartbeat).getTime() : 0;
          break;
        default:
          compareA = a.device_name.toLowerCase();
          compareB = b.device_name.toLowerCase();
      }

      if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  };

  const filteredAgents = getFilteredAndSortedAgents();

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Get sort indicator
  const getSortIndicator = (column: string) => {
    if (sortBy === column) {
      return sortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕';
  };

  // Summary stats
  const stats = {
    total: agents.length,
    online: agents.filter(a => a.status === 'online').length,
    offline: agents.filter(a => a.status === 'offline').length,
    warning: agents.filter(a => a.status === 'warning').length,
    critical: agents.filter(a => a.status === 'critical').length,
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading permissions...</p>
        </div>
      </div>
    );
  }

  if (!canViewAgents) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`text-lg ${themeClasses.text.secondary}`}>
            You do not have permission to view monitoring agents
          </p>
        </div>
        <PermissionDeniedModal
          isOpen={permissionDenied.show}
          onClose={() => setPermissionDenied({ show: false })}
          action={permissionDenied.action}
          requiredPermission={permissionDenied.requiredPermission}
          message={permissionDenied.message}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className="flex gap-3">
          <button
            onClick={loadAgents}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Refresh agent list"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {(() => {
            // Bulk update is offered only when:
            //  - The user can issue agent commands at all
            //  - At least one currently-filtered agent is online,
            //    outdated, and not already mid-update.
            // Offline agents are skipped because they can't poll
            // for the install_update command — queueing one would
            // just sit in the agent_commands table indefinitely.
            if (!canSendCommands) return null;
            const targets = filteredAgents.filter((a) =>
              a.status === 'online' &&
              isAgentOutdated(a) &&
              !updateInProgress.has(a.id)
            );
            if (targets.length === 0) return null;
            return (
              <button
                onClick={() => setConfirmBulkUpdate({
                  show: true,
                  targets: targets.map((a) => ({
                    id: a.id,
                    device_name: a.device_name,
                    agent_version: a.agent_version,
                  })),
                })}
                disabled={actionInProgress === '__bulk_update__'}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={`Update ${targets.length} outdated online agent${targets.length === 1 ? '' : 's'} (current filter)`}
              >
                <Download className="w-4 h-4 mr-2" />
                Update {targets.length} outdated
              </button>
            );
          })()}
          {canCreateTokens ? (
            <button
              onClick={onCreateRegistrationToken}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Deploy Agent
            </button>
          ) : (
            <button
              onClick={() => setPermissionDenied({
                show: true,
                action: 'Deploy Agent',
                requiredPermission: 'create.agent_tokens.enable',
                message: 'You do not have permission to deploy agents'
              })}
              disabled
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed opacity-50"
              title="Permission required"
            >
              <Plus className="w-4 h-4 mr-2" />
              Deploy Agent
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Agents</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{stats.total}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Online</div>
          <div className="text-2xl font-bold text-green-600">{stats.online}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Offline</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.offline}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Warning</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Critical</div>
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className={`text-lg font-medium ${themeClasses.text.primary} flex items-center`}>
            <Filter className="w-5 h-5 mr-2" />
            Filters
            {(() => {
              // Active-filter count badge so the admin sees at a
              // glance how many narrowing filters are applied.
              const active = [
                searchTerm,
                statusFilter !== 'all' ? statusFilter : '',
                osFilter !== 'all' ? osFilter : '',
                deviceTypeFilter !== 'all' ? deviceTypeFilter : '',
                updateFilter !== 'all' ? updateFilter : '',
                monitoringFilter !== 'all' ? monitoringFilter : '',
                seenFilter !== 'all' ? seenFilter : '',
                businessFilter !== 'all' ? businessFilter : '',
                locationFilter !== 'all' ? locationFilter : '',
                patchFilter !== 'all' ? patchFilter : '',
              ].filter(Boolean).length;
              if (active === 0) return null;
              return (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {active} active
                </span>
              );
            })()}
          </h3>
          <button
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('all');
              setOsFilter('all');
              setDeviceTypeFilter('all');
              setUpdateFilter('all');
              setMonitoringFilter('all');
              setSeenFilter('all');
              setBusinessFilter('all');
              setLocationFilter('all');
              setPatchFilter('all');
            }}
            className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
          >
            <X className="w-4 h-4 mr-2" />
            Clear all
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name, business, OS, version…"
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All statuses</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>OS</label>
            <select
              value={osFilter}
              onChange={(e) => setOsFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All OS families</option>
              <option value="windows">Windows</option>
              <option value="darwin">macOS</option>
              <option value="linux">Linux</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Device type</label>
            <select
              value={deviceTypeFilter}
              onChange={(e) => setDeviceTypeFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All types</option>
              <option value="desktop">Desktop</option>
              <option value="laptop">Laptop</option>
              <option value="server">Server</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Update status</label>
            <select
              value={updateFilter}
              onChange={(e) => setUpdateFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All update states</option>
              <option value="outdated">Update available</option>
              <option value="in_progress">Update in progress</option>
              <option value="current">Up to date</option>
              <option value="unknown">Unknown / never seen</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Last seen</label>
            <select
              value={seenFilter}
              onChange={(e) => setSeenFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">Any time</option>
              <option value="1h">Within 1 hour</option>
              <option value="24h">Within 24 hours</option>
              <option value="7d">Within 7 days</option>
              <option value="30d">Within 30 days</option>
              <option value="never">Never seen</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Monitoring</label>
            <select
              value={monitoringFilter}
              onChange={(e) => setMonitoringFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All</option>
              <option value="enabled">Monitoring enabled</option>
              <option value="disabled">Monitoring disabled</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Pending patches</label>
            <select
              value={patchFilter}
              onChange={(e) => setPatchFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">Any</option>
              <option value="any">Has any pending</option>
              <option value="os">Has OS patches</option>
              <option value="security">Has security patches</option>
              <option value="reboot">Patches need reboot</option>
              <option value="packages">Has package updates</option>
              <option value="distro">Has distro upgrade</option>
              <option value="none">Fully patched</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Business</label>
            <select
              value={businessFilter}
              onChange={(e) => setBusinessFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All businesses</option>
              {(() => {
                // Derive options from the loaded agents so we never
                // show a value that returns zero rows.
                const seen = new Map<string, string>();
                for (const a of agents) {
                  if (a.business_id && a.business_name) {
                    seen.set(a.business_id, getBusinessDisplayName(a));
                  }
                }
                return Array.from(seen.entries())
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ));
              })()}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Location</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All locations</option>
              {(() => {
                const names = Array.from(
                  new Set(agents.map((a) => a.location_name).filter(Boolean) as string[])
                ).sort();
                return names.map((n) => <option key={n} value={n}>{n}</option>);
              })()}
            </select>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading agents...</p>
        </div>
      )}

      {/* Agent Table - Desktop */}
      {!loading && (
        <div className={`hidden lg:block ${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('device_name')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Device Name
                      <span className="ml-1">{getSortIndicator('device_name')}</span>
                    </button>
                  </th>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('business_name')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Business
                      <span className="ml-1">{getSortIndicator('business_name')}</span>
                    </button>
                  </th>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} hidden xl:table-cell`}>
                    Location
                  </th>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    Type / OS
                  </th>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('status')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Status
                      <span className="ml-1">{getSortIndicator('status')}</span>
                    </button>
                  </th>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('last_heartbeat')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Last Seen
                      <span className="ml-1">{getSortIndicator('last_heartbeat')}</span>
                    </button>
                  </th>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    Agent Version
                  </th>
                  <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredAgents.map((agent) => {
                  const statusDisplay = getStatusDisplay(agent.status);
                  return (
                    <tr key={agent.id} className={themeClasses.bg.hover}>
                      <td className={`px-3 py-4 border-r ${themeClasses.border.primary}`}>
                        <div className="flex items-center">
                          <button
                            onClick={() => onViewAgentDetails?.(agent.id)}
                            className={`flex-shrink-0 h-10 w-10 rounded-full ${statusDisplay.bgColor} flex items-center justify-center ${statusDisplay.color} cursor-pointer hover:opacity-80 transition-opacity`}
                            title="View agent details"
                          >
                            {getDeviceIcon(agent.device_type)}
                          </button>
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                              {agent.device_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-3 py-4 border-r ${themeClasses.border.primary}`}>
                        {agent.business_id && agent.business_name ? (
                          <button
                            onClick={() => onViewBusiness?.(agent.business_id)}
                            className={`flex items-center text-sm ${themeClasses.text.primary} hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer text-left`}
                            title="View business details"
                          >
                            {agent.is_individual ? (
                              <User className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                            ) : (
                              <Building className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                            )}
                            {getBusinessDisplayName(agent)}
                          </button>
                        ) : (
                          <div className={`text-sm ${themeClasses.text.primary}`}>
                            N/A
                          </div>
                        )}
                      </td>
                      <td className={`px-3 py-4 border-r ${themeClasses.border.primary} hidden xl:table-cell`}>
                        {agent.location_street && agent.location_city ? (
                          <button
                            onClick={() => {
                              const streetFull = `${agent.location_street}${agent.location_street2 ? ' ' + agent.location_street2 : ''}`;
                              const fullAddress = `${streetFull}, ${agent.location_city}, ${agent.location_state} ${agent.location_zip}${agent.location_country && agent.location_country !== 'USA' ? ', ' + agent.location_country : ''}`;
                              const encodedAddress = encodeURIComponent(fullAddress);
                              const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
                              window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                            }}
                            className={`text-sm ${themeClasses.text.primary} hover:text-blue-600 transition-colors text-left group`}
                            title="Click to open in maps"
                          >
                            <div className="flex items-center">
                              <MapPin className={`w-4 h-4 ${themeClasses.text.muted} group-hover:text-blue-600 mr-1 transition-colors`} />
                              <span className="group-hover:text-blue-600 transition-colors">
                                {agent.location_street}
                                {agent.location_street2 && ` ${agent.location_street2}`}
                              </span>
                            </div>
                            <div className={`text-xs ${themeClasses.text.secondary} group-hover:text-blue-500 ml-5 transition-colors`}>
                              {agent.location_city}, {agent.location_state} {agent.location_zip}
                            </div>
                          </button>
                        ) : (
                          <div className={`text-sm ${themeClasses.text.primary}`}>
                            {agent.location_name || 'N/A'}
                          </div>
                        )}
                      </td>
                      <td className={`px-3 py-4 border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {agent.device_type}
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary}`}>
                          {formatAgentOS(agent.os_type, agent.os_version)}
                        </div>
                      </td>
                      <td className={`px-3 py-4 border-r ${themeClasses.border.primary}`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                          <span className="mr-1">{statusDisplay.icon}</span>
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className={`px-3 py-4 border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.secondary}`}>
                          {formatLastSeen(agent.last_heartbeat, agent.created_at)}
                        </div>
                      </td>
                      <td className={`px-3 py-4 border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {agent.agent_version || '—'}
                        </div>
                        <div className="flex flex-col gap-1 mt-1">
                          {updateInProgress.has(agent.id) ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              title={`Updating to ${latestAgentVersion}…`}
                            >
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              Update in progress
                            </span>
                          ) : isAgentOutdated(agent) && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                              title={`Latest released: ${latestAgentVersion}`}
                            >
                              Update available
                            </span>
                          )}
                          {rebootScheduled[agent.id] && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!canSendCommands) return;
                                const r = rebootScheduled[agent.id];
                                setConfirmCancelReboot({
                                  show: true,
                                  agentId: agent.id,
                                  agentName: agent.device_name,
                                  commandId: r.commandId,
                                });
                              }}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 ${canSendCommands ? 'hover:bg-orange-200 dark:hover:bg-orange-800 cursor-pointer' : 'cursor-default'}`}
                              title={canSendCommands ? `${rebootScheduled[agent.id].message}\nClick to cancel reboot` : rebootScheduled[agent.id].message}
                              disabled={!canSendCommands}
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              {(() => {
                                const ms = rebootScheduled[agent.id].scheduledForMs - Date.now();
                                if (ms <= 0) return 'Rebooting…';
                                const mins = Math.round(ms / 60000);
                                if (mins < 60) return `Reboot in ${mins} min`;
                                const t = new Date(rebootScheduled[agent.id].scheduledForMs);
                                return `Reboot at ${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
                              })()}
                            </button>
                          )}
                          {(() => {
                            // OS / package patch counts. Distinct from
                            // the agent_version "Update available"
                            // badge above — those are the agent
                            // upgrading itself, these are the OS / 3rd-
                            // party packages on the host.
                            const p = agent.patch_summary;
                            if (!p) return null;
                            const parts: string[] = [];
                            if (p.os_patches > 0) parts.push(`${p.os_patches} OS`);
                            if (p.package_updates > 0) parts.push(`${p.package_updates} pkg`);
                            if (parts.length === 0 && !p.distro_upgrade_available) return null;
                            const isSecurity = p.os_security_patches > 0;
                            const cls = p.distro_upgrade_available
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                              : isSecurity
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
                            const label = p.distro_upgrade_available
                              ? 'Distro upgrade'
                              : (isSecurity ? `${parts.join(' + ')} (security)` : parts.join(' + '));
                            return (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
                                title={`OS patches: ${p.os_patches}${p.os_security_patches > 0 ? ` (${p.os_security_patches} security)` : ''}${p.os_patches_reboot ? ' • reboot required' : ''}\nPackage updates: ${p.package_updates}${p.homebrew_outdated ? ` (brew ${p.homebrew_outdated})` : ''}${p.npm_outdated ? ` (npm ${p.npm_outdated})` : ''}${p.pip_outdated ? ` (pip ${p.pip_outdated})` : ''}${p.mas_outdated ? ` (mas ${p.mas_outdated})` : ''}${p.distro_upgrade_available ? '\nDistro upgrade available' : ''}`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className={`px-3 py-4 whitespace-nowrap text-sm font-medium`}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onViewAgentDetails?.(agent.id)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            title="View agent details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canSendCommands && isAgentOutdated(agent) && !updateInProgress.has(agent.id) && (
                            <button
                              onClick={() => setConfirmInstallUpdate({
                                show: true,
                                agentId: agent.id,
                                agentName: agent.device_name,
                                fromVersion: agent.agent_version,
                              })}
                              disabled={actionInProgress === agent.id}
                              className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={`Update agent to ${latestAgentVersion}`}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          {canSendCommands && !rebootScheduled[agent.id] && (
                            <button
                              onClick={() => {
                                // Reset modal defaults for each open
                                setRebootDelayMode('minutes');
                                setRebootMinutes(5);
                                setRebootTime('');
                                setRebootMessage('Scheduled reboot from RTS dashboard');
                                setConfirmReboot({ show: true, agentId: agent.id, agentName: agent.device_name });
                              }}
                              disabled={actionInProgress === agent.id}
                              className="text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Reboot device"
                            >
                              <RotateCw className="w-4 h-4" />
                            </button>
                          )}
                          {canRemoteControl && agent.status === 'online' && (() => {
                            // remote_control_enabled comes from the agent's
                            // heartbeat. Default true (older agents that don't
                            // send the field).  When the end-user has flipped
                            // it OFF in the tray menu, gray out + disable
                            // rather than hide entirely so the admin sees
                            // "this host has remote control turned off" not
                            // "where did the button go".
                            const rcEnabled = agent.remote_control_enabled !== false;
                            return (
                              <button
                                onClick={() => rcEnabled && handleStartRemoteControl(agent)}
                                disabled={!rcEnabled || remoteControl.starting}
                                className={
                                  rcEnabled
                                    ? 'text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed'
                                    : 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                                }
                                title={rcEnabled
                                  ? 'Remote control (browser desktop session)'
                                  : 'Remote control disabled by end-user (tray menu)'}
                              >
                                <Monitor className="w-4 h-4" />
                              </button>
                            );
                          })()}
                          {canEditAgents && (
                            <button
                              onClick={() => handleEditAgent(agent)}
                              disabled={actionInProgress === agent.id}
                              className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Edit agent"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {canManageAgents && (
                            <>
                              <button
                                onClick={() => handleOpenAggregationModal(agent)}
                                disabled={actionInProgress === agent.id}
                                className="text-cyan-600 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Alert sensitivity settings"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleMonitoring(agent)}
                                disabled={actionInProgress === agent.id}
                                className={`${
                                  agent.monitoring_enabled
                                    ? 'text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300'
                                    : 'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                title={agent.monitoring_enabled ? 'Disable monitoring' : 'Enable monitoring'}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete({ show: true, agentId: agent.id, agentName: agent.device_name })}
                                disabled={actionInProgress === agent.id}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete agent"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Cards - Mobile */}
      {!loading && (
        <div className="lg:hidden space-y-4">
          {filteredAgents.map((agent) => {
            const statusDisplay = getStatusDisplay(agent.status);
            return (
              <div
                key={agent.id}
                className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg border ${themeClasses.border.primary} p-4`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => onViewAgentDetails?.(agent.id)}
                      className={`h-12 w-12 rounded-full ${statusDisplay.bgColor} flex items-center justify-center ${statusDisplay.color} cursor-pointer hover:opacity-80 transition-opacity`}
                      title="View agent details"
                    >
                      {getDeviceIcon(agent.device_type)}
                    </button>
                    <div>
                      <h3 className={`text-base font-semibold ${themeClasses.text.primary}`}>
                        {agent.device_name}
                      </h3>
                      <p className={`text-sm ${themeClasses.text.secondary}`}>
                        {agent.device_type} • {agent.os_type}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                    <span className="mr-1">{statusDisplay.icon}</span>
                    {statusDisplay.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <span className={`text-xs ${themeClasses.text.muted}`}>Business</span>
                    {agent.business_id && agent.business_name ? (
                      <button
                        onClick={() => onViewBusiness?.(agent.business_id)}
                        className={`flex items-center ${themeClasses.text.primary} hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer text-left`}
                        title="View business details"
                      >
                        {agent.is_individual ? (
                          <User className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
                        ) : (
                          <Building className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
                        )}
                        {getBusinessDisplayName(agent)}
                      </button>
                    ) : (
                      <div className={themeClasses.text.primary}>N/A</div>
                    )}
                  </div>
                  <div>
                    <span className={`text-xs ${themeClasses.text.muted}`}>Location</span>
                    {agent.location_street && agent.location_city ? (
                      <button
                        onClick={() => {
                          const streetFull = `${agent.location_street}${agent.location_street2 ? ' ' + agent.location_street2 : ''}`;
                          const fullAddress = `${streetFull}, ${agent.location_city}, ${agent.location_state} ${agent.location_zip}${agent.location_country && agent.location_country !== 'USA' ? ', ' + agent.location_country : ''}`;
                          const encodedAddress = encodeURIComponent(fullAddress);
                          const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
                          window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className={`text-sm ${themeClasses.text.primary} hover:text-blue-600 transition-colors text-left group block`}
                        title="Click to open in maps"
                      >
                        <div className="flex items-center">
                          <MapPin className={`w-3 h-3 ${themeClasses.text.muted} group-hover:text-blue-600 mr-1 transition-colors`} />
                          <span className="group-hover:text-blue-600 transition-colors text-xs">
                            {agent.location_street}
                            {agent.location_street2 && ` ${agent.location_street2}`}
                          </span>
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary} group-hover:text-blue-500 ml-4 transition-colors`}>
                          {agent.location_city}, {agent.location_state} {agent.location_zip}
                        </div>
                      </button>
                    ) : (
                      <div className={themeClasses.text.primary}>{agent.location_name || 'N/A'}</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className={`text-xs ${themeClasses.text.muted}`}>Last Seen</span>
                    <div className={themeClasses.text.primary}>{formatLastSeen(agent.last_heartbeat, agent.created_at)}</div>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-xs ${themeClasses.text.muted}`}>Agent Version</span>
                    <div className={`flex items-center gap-2 ${themeClasses.text.primary}`}>
                      <span>{agent.agent_version || '—'}</span>
                      {updateInProgress.has(agent.id) ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          title={`Updating to ${latestAgentVersion}…`}
                        >
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          Update in progress
                        </span>
                      ) : isAgentOutdated(agent) && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                          title={`Latest released: ${latestAgentVersion}`}
                        >
                          Update available
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2 flex-wrap">
                    {canEditAgents && (
                      <button
                        onClick={() => handleEditAgent(agent)}
                        disabled={actionInProgress === agent.id}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-purple-600 hover:text-purple-800 dark:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </button>
                    )}
                    {canSendCommands && isAgentOutdated(agent) && !updateInProgress.has(agent.id) && (
                      <button
                        onClick={() => setConfirmInstallUpdate({
                          show: true,
                          agentId: agent.id,
                          agentName: agent.device_name,
                          fromVersion: agent.agent_version,
                        })}
                        disabled={actionInProgress === agent.id}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-amber-600 hover:text-amber-800 dark:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={`Update agent to ${latestAgentVersion}`}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Update
                      </button>
                    )}
                    {canManageAgents && (
                      <>
                        <button
                          onClick={() => handleToggleMonitoring(agent)}
                          disabled={actionInProgress === agent.id}
                          className={`inline-flex items-center px-3 py-2 text-sm font-medium ${
                            agent.monitoring_enabled
                              ? 'text-yellow-600 hover:text-yellow-800 dark:text-yellow-400'
                              : 'text-green-600 hover:text-green-800 dark:text-green-400'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={agent.monitoring_enabled ? 'Disable' : 'Enable'}
                        >
                          <Power className="w-4 h-4 mr-1" />
                          {agent.monitoring_enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ show: true, agentId: agent.id, agentName: agent.device_name })}
                          disabled={actionInProgress === agent.id}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onViewAgentDetails?.(agent.id)}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredAgents.length === 0 && (
            <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
              <Monitor className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No agents found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${themeClasses.bg.card} rounded-lg p-6 max-w-md w-full mx-4 ${themeClasses.shadow.xl}`}>
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Delete Agent
                </h3>
                <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                  Are you sure you want to delete <strong>{confirmDelete.agentName}</strong>?
                  This action cannot be undone. All agent data, metrics history, and alerts will be permanently deleted.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmDelete({ show: false })}
                disabled={actionInProgress === confirmDelete.agentId}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAgent}
                disabled={actionInProgress === confirmDelete.agentId}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === confirmDelete.agentId ? 'Deleting...' : 'Delete Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reboot Modal */}
      {confirmCancelReboot.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${themeClasses.bg.card} rounded-lg p-6 max-w-md w-full mx-4 ${themeClasses.shadow.xl}`}>
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <X className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-3 flex-1">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Cancel Reboot
                </h3>
                <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                  Cancel the scheduled reboot for <strong>{confirmCancelReboot.agentName}</strong>?
                </p>
                <p className={`mt-2 text-xs ${themeClasses.text.muted}`}>
                  The agent will run the OS-specific cancel
                  (<code>shutdown -c</code> on Linux, <code>killall shutdown</code> on
                  macOS, <code>shutdown /a</code> on Windows). The badge clears as
                  soon as the agent confirms cancellation.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmCancelReboot({ show: false })}
                disabled={actionInProgress === confirmCancelReboot.agentId}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Keep reboot scheduled
              </button>
              <button
                onClick={handleCancelReboot}
                disabled={actionInProgress === confirmCancelReboot.agentId}
                className="px-4 py-2 bg-orange-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === confirmCancelReboot.agentId ? 'Cancelling…' : 'Cancel Reboot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reboot Device Modal */}
      {confirmReboot.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${themeClasses.bg.card} rounded-lg p-6 max-w-md w-full mx-4 ${themeClasses.shadow.xl}`}>
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <RotateCw className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-3 flex-1">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Reboot Device
                </h3>
                <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
                  <strong>{confirmReboot.agentName}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <fieldset>
                <legend className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>When</legend>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name="rebootMode"
                    checked={rebootDelayMode === 'minutes'}
                    onChange={() => setRebootDelayMode('minutes')}
                  />
                  <span className={`text-sm ${themeClasses.text.primary}`}>In</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={rebootMinutes}
                    onChange={(e) => setRebootMinutes(parseInt(e.target.value || '5', 10))}
                    onFocus={() => setRebootDelayMode('minutes')}
                    className={`w-20 px-2 py-1 border ${themeClasses.border.primary} rounded text-sm ${themeClasses.bg.primary} ${themeClasses.text.primary}`}
                  />
                  <span className={`text-sm ${themeClasses.text.primary}`}>minutes</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="rebootMode"
                    checked={rebootDelayMode === 'time'}
                    onChange={() => setRebootDelayMode('time')}
                  />
                  <span className={`text-sm ${themeClasses.text.primary}`}>At specific time today</span>
                  <input
                    type="time"
                    value={rebootTime}
                    onChange={(e) => setRebootTime(e.target.value)}
                    onFocus={() => setRebootDelayMode('time')}
                    className={`px-2 py-1 border ${themeClasses.border.primary} rounded text-sm ${themeClasses.bg.primary} ${themeClasses.text.primary}`}
                  />
                </label>
                {rebootDelayMode === 'time' && rebootTime && (
                  <p className={`text-xs ${themeClasses.text.muted} mt-1 ml-5`}>
                    If the time has already passed today, reboot will be scheduled for tomorrow.
                  </p>
                )}
              </fieldset>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  Message shown to user
                </label>
                <textarea
                  value={rebootMessage}
                  onChange={(e) => setRebootMessage(e.target.value)}
                  rows={2}
                  maxLength={200}
                  className={`w-full px-2 py-1 border ${themeClasses.border.primary} rounded text-sm ${themeClasses.bg.primary} ${themeClasses.text.primary}`}
                />
                <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                  Shown in the OS shutdown dialog. The user can run <code>shutdown -c</code> (Linux/macOS) or
                  <code> shutdown /a</code> (Windows) to cancel; you'll see "Cancelled" here.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmReboot({ show: false })}
                disabled={actionInProgress === confirmReboot.agentId}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </button>
              <button
                onClick={handleRebootHost}
                disabled={actionInProgress === confirmReboot.agentId}
                className="px-4 py-2 bg-orange-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === confirmReboot.agentId ? 'Scheduling…' : 'Schedule Reboot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Update Confirmation Modal */}
      {confirmBulkUpdate.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${themeClasses.bg.card} rounded-lg p-6 max-w-lg w-full mx-4 ${themeClasses.shadow.xl}`}>
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <Download className="h-6 w-6 text-amber-600" />
              </div>
              <div className="ml-3 flex-1">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Update {confirmBulkUpdate.targets.length} agent{confirmBulkUpdate.targets.length === 1 ? '' : 's'}
                </h3>
                <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                  Queue an unattended self-update on every outdated online agent in
                  the current filter. Each will independently download
                  the latest release ({latestAgentVersion ?? 'latest'}), install
                  it silently, and the OS service supervisor will
                  restart on the new binary.
                </p>
              </div>
            </div>

            <div className={`max-h-48 overflow-y-auto border ${themeClasses.border.primary} rounded mt-3 mb-2`}>
              <table className="min-w-full text-xs">
                <tbody className={`divide-y ${themeClasses.border.primary}`}>
                  {confirmBulkUpdate.targets.map((t) => (
                    <tr key={t.id}>
                      <td className={`px-3 py-1.5 ${themeClasses.text.primary}`}>{t.device_name}</td>
                      <td className={`px-3 py-1.5 ${themeClasses.text.muted}`}>
                        <code>{t.agent_version || '?'}</code> → <code>{latestAgentVersion ?? '?'}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
              Offline agents are excluded — they can't poll for the command.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmBulkUpdate({ show: false, targets: [] })}
                disabled={actionInProgress === '__bulk_update__'}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkInstallUpdate}
                disabled={actionInProgress === '__bulk_update__'}
                className="px-4 py-2 bg-amber-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === '__bulk_update__'
                  ? 'Queueing…'
                  : `Update ${confirmBulkUpdate.targets.length} agent${confirmBulkUpdate.targets.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Agent Confirmation Modal */}
      {confirmInstallUpdate.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${themeClasses.bg.card} rounded-lg p-6 max-w-md w-full mx-4 ${themeClasses.shadow.xl}`}>
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <Download className="h-6 w-6 text-amber-600" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Update Agent
                </h3>
                <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                  Queue an unattended self-update on <strong>{confirmInstallUpdate.agentName}</strong>?
                </p>
                <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                  Current: <code>{confirmInstallUpdate.fromVersion || 'unknown'}</code><br />
                  Target: <code>{latestAgentVersion || 'latest'}</code>
                </p>
                <p className={`mt-2 text-xs ${themeClasses.text.muted}`}>
                  The agent will pick up the command on its next poll
                  (within ~30 seconds), download the new package,
                  install it silently, and the OS service supervisor
                  will restart it on the new binary. The dashboard
                  shows success once the next heartbeat carries the
                  new version.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmInstallUpdate({ show: false })}
                disabled={actionInProgress === confirmInstallUpdate.agentId}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </button>
              <button
                onClick={handleInstallUpdate}
                disabled={actionInProgress === confirmInstallUpdate.agentId}
                className="px-4 py-2 bg-amber-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === confirmInstallUpdate.agentId ? 'Queueing…' : 'Update Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remote Control Session Modal — full-viewport iframe */}
      {remoteControl.show && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col">
          {/* Top bar: device name + technician indicator + disconnect button */}
          <div className="flex items-center justify-between bg-gray-900 text-white px-4 py-2 border-b border-indigo-500">
            <div className="flex items-center gap-3">
              <Monitor className="w-5 h-5 text-indigo-400" />
              <div>
                <div className="text-sm font-semibold">
                  Remote Control: {remoteControl.deviceName || 'Device'}
                </div>
                <div className="text-xs text-gray-400">
                  Live session via MeshCentral · session id {remoteControl.auditId?.slice(0, 8) || '…'}
                </div>
              </div>
            </div>
            <button
              onClick={handleEndRemoteControl}
              className="px-4 py-1.5 text-sm font-semibold rounded bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
              title="End the remote-control session"
            >
              <X className="w-4 h-4" />
              Disconnect
            </button>
          </div>

          {/* Body: preflight warning / starting spinner / error / iframe */}
          <div className="flex-1 relative bg-gray-800">
            {remoteControl.preflight?.kind === 'wayland' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6">
                <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
                <div className="text-base font-semibold mb-2">
                  Wayland session detected — Remote Control will not display
                </div>
                <div className="text-sm text-gray-300 max-w-2xl text-center space-y-2">
                  <p>
                    <strong>{remoteControl.deviceName || 'This Linux host'}</strong> is running a
                    {remoteControl.preflight.compositor ? ` ${remoteControl.preflight.compositor} ` : ' '}
                    Wayland session. The current Remote Control engine (MeshCentral KVM)
                    only supports X11 — opening a session here would result in a black screen
                    or a "configure to use Xorg" error.
                  </p>
                  <p className="text-gray-400 text-xs">
                    Native Wayland support (xdg-desktop-portal + PipeWire bridge) is planned
                    for a future release. In the meantime, you have three options:
                  </p>
                  <ul className="text-left text-gray-300 text-sm list-disc list-inside max-w-xl mx-auto space-y-1">
                    <li>
                      Have the end-user log out and pick "GNOME on Xorg" (or equivalent) at
                      the login screen — the agent will report <code>x11</code> on its next
                      heartbeat and Remote Control will work.
                    </li>
                    <li>
                      SSH into the host and use a CLI-based remote tool instead.
                    </li>
                    <li>
                      Proceed anyway — useful only if you suspect the heartbeat snapshot is
                      stale and the host has actually switched to X11.
                    </li>
                  </ul>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setRemoteControl({ show: false })}
                    className="px-4 py-2 text-sm rounded bg-gray-700 text-white hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const a = remoteControl.preflight?.pendingAgent;
                      if (a) handleStartRemoteControl(a, true);
                    }}
                    className="px-4 py-2 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Proceed anyway
                  </button>
                </div>
              </div>
            )}
            {remoteControl.preflight?.kind === 'xauth-missing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6">
                <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
                <div className="text-base font-semibold mb-2">
                  X-auth not yet configured — Remote Control may show a black screen
                </div>
                <div className="text-sm text-gray-300 max-w-2xl text-center space-y-2">
                  <p>
                    <strong>{remoteControl.deviceName || 'This Linux host'}</strong> is on X11,
                    but the agent's helper hasn't yet authorized root to read the user's X
                    server (this happens automatically on the first login after the v1.18.6
                    upgrade).
                  </p>
                  <p className="text-gray-400 text-xs">
                    Have the end-user log out of their desktop and log back in once. The
                    next heartbeat will report <code>xauth=ok</code> and this warning will
                    go away. If you can't wait, proceeding anyway might still work — but
                    expect a black screen if it doesn't.
                  </p>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setRemoteControl({ show: false })}
                    className="px-4 py-2 text-sm rounded bg-gray-700 text-white hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const a = remoteControl.preflight?.pendingAgent;
                      if (a) handleStartRemoteControl(a, true);
                    }}
                    className="px-4 py-2 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Proceed anyway
                  </button>
                </div>
              </div>
            )}
            {remoteControl.starting && !remoteControl.preflight && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <RefreshCw className="w-8 h-8 animate-spin mb-3" />
                <div className="text-sm">Establishing session — usually takes ~5 seconds…</div>
              </div>
            )}
            {remoteControl.error && !remoteControl.preflight && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6">
                <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
                <div className="text-base font-semibold mb-2">Could not start remote-control session</div>
                <div className="text-sm text-gray-300 max-w-lg text-center">{remoteControl.error}</div>
                <button
                  onClick={() => setRemoteControl({ show: false })}
                  className="mt-6 px-4 py-2 text-sm rounded bg-gray-700 text-white hover:bg-gray-600"
                >
                  Close
                </button>
              </div>
            )}
            {remoteControl.iframeUrl && !remoteControl.error && !remoteControl.preflight && (
              <iframe
                src={remoteControl.iframeUrl}
                className="w-full h-full border-0"
                title={`Remote control of ${remoteControl.deviceName || 'device'}`}
                allow="fullscreen; clipboard-read; clipboard-write"
              />
            )}
          </div>
        </div>
      )}

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={permissionDenied.show}
        onClose={() => setPermissionDenied({ show: false })}
        action={permissionDenied.action}
        requiredPermission={permissionDenied.requiredPermission}
        message={permissionDenied.message}
      />

      {/* Agent Edit Modal */}
      <AgentEditModal
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        agent={selectedAgent}
        businesses={businesses}
        serviceLocations={serviceLocations}
        onUpdate={handleAgentUpdated}
      />

      {/* Agent Aggregation Settings Modal */}
      {aggregationModalAgent && (
        <AgentAlertAggregationModal
          isOpen={showAggregationModal}
          onClose={handleCloseAggregationModal}
          agentId={aggregationModalAgent.id}
          agentName={aggregationModalAgent.device_name}
          currentLevel={null}
          onSuccess={handleAggregationUpdated}
        />
      )}
    </div>
  );
};

export default AgentDashboard;
