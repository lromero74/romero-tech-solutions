import type { AgentCommand, AgentDevice } from '../../../services/agentService';

/**
 * Renders a milliseconds duration as either "Hh Mm" or "Mm SSs".
 * Used for the "Rebooting since…" banner so the user can see how long
 * a planned restart has been running.
 *
 * Returns "0m 00s" for negatives / NaN — callers should not pass
 * negative durations, but defending here keeps the UI from displaying
 * something like "NaNm NaNs" if a clock skews.
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0m 00s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export interface RebootInfo {
  startedAt: number;
  elapsedMs: number;
}

/**
 * Detects whether the given agent is currently rebooting because of a
 * recent reboot_host command. Returns null when the agent has already
 * come back, when no reboot_host command has been issued, or when too
 * much time has elapsed since the command (the user is presumably no
 * longer waiting on it).
 *
 * The 15-minute cap is well past any realistic reboot window — past
 * that point we should fall back to plain "Offline" so the user gets
 * a real signal something is wrong.
 *
 * Pass `nowMs` to make the function deterministic in tests.
 */
export function computeRebootInfo(
  commands: AgentCommand[] | undefined,
  agent: AgentDevice | null | undefined,
  nowMs: number = Date.now(),
  maxWindowMs: number = 15 * 60 * 1000
): RebootInfo | null {
  if (!Array.isArray(commands) || commands.length === 0) return null;

  const recent = commands
    .filter((c) => c.command_type === 'reboot_host')
    .filter((c) => c.status === 'completed' && c.executed_at)
    .sort(
      (a, b) =>
        new Date(b.executed_at as string).getTime() -
        new Date(a.executed_at as string).getTime()
    )[0];

  if (!recent || !recent.executed_at) return null;

  const completedAt = new Date(recent.executed_at).getTime();
  const lastHb = agent?.last_heartbeat
    ? new Date(agent.last_heartbeat).getTime()
    : 0;

  // Agent already heard from after the reboot completed — it's back.
  if (lastHb > completedAt) return null;

  const elapsedMs = nowMs - completedAt;
  if (elapsedMs > maxWindowMs) return null;

  return { startedAt: completedAt, elapsedMs };
}

/**
 * Map of agent-side package_manager identifiers to the canonical key
 * the agent's update_packages handler accepts. Only Linux distro
 * managers + Windows Update fire actionable buttons in the OS Patch
 * panel; macOS softwareupdate links to System Settings instead.
 */
export const managerAlias: Record<string, string> = {
  apt: 'apt',
  dnf: 'dnf',
  yum: 'dnf',
  pacman: 'pacman',
  zypper: 'zypper',
  winupdate: 'winupdate',
};

/**
 * Returns the unique set of managers that have actionable update
 * buttons (i.e. appear in `managerAlias`). Used by OSPatchStatus to
 * decide which "Update all <manager>" buttons to render.
 */
export function getUpdatableManagers(
  patches: Array<{ package_manager?: string }> | undefined
): string[] {
  if (!Array.isArray(patches)) return [];
  const seen = new Set<string>();
  for (const p of patches) {
    const m = p.package_manager;
    if (m && managerAlias[m]) seen.add(m);
  }
  return Array.from(seen);
}

/**
 * Filters out hidden patches and returns only the visible ones.
 * `hidden` is a Set of `${manager}|${name}` keys — same format the
 * OSPatchStatus optimistic-hide tracker uses when an update succeeds.
 */
export function filterVisiblePatches<
  T extends { package_manager?: string; name?: string }
>(patches: T[] | undefined, hidden: Set<string>): T[] {
  if (!Array.isArray(patches)) return [];
  return patches.filter((p) => !hidden.has(`${p.package_manager}|${p.name}`));
}
