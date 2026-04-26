import {
  formatElapsed,
  computeRebootInfo,
  managerAlias,
  getUpdatableManagers,
  filterVisiblePatches,
} from '../../../../components/admin/agent-details/osPatchUtils';
import type { AgentCommand, AgentDevice } from '../../../../services/agentService';

describe('formatElapsed', () => {
  it('renders sub-minute durations as "0m SSs"', () => {
    expect(formatElapsed(0)).toBe('0m 00s');
    expect(formatElapsed(5_000)).toBe('0m 05s');
    expect(formatElapsed(45_000)).toBe('0m 45s');
  });

  it('renders sub-hour durations as "Mm SSs"', () => {
    expect(formatElapsed(60_000)).toBe('1m 00s');
    expect(formatElapsed(125_000)).toBe('2m 05s');
    expect(formatElapsed(45 * 60 * 1000)).toBe('45m 00s');
  });

  it('renders hour-plus durations as "Hh Mm" without seconds', () => {
    expect(formatElapsed(60 * 60 * 1000)).toBe('1h 0m');
    expect(formatElapsed(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe('2h 30m');
  });

  it('defends against negative or NaN inputs', () => {
    expect(formatElapsed(-100)).toBe('0m 00s');
    expect(formatElapsed(NaN)).toBe('0m 00s');
    expect(formatElapsed(Infinity)).toBe('0m 00s');
  });

  it('zero-pads single-digit seconds for stable widths', () => {
    expect(formatElapsed(3_000)).toBe('0m 03s');
    expect(formatElapsed(63_000)).toBe('1m 03s');
  });
});

describe('computeRebootInfo', () => {
  const NOW = 1_700_000_000_000; // arbitrary fixed clock
  const minute = (n: number) => NOW - n * 60 * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();

  const makeRebootCmd = (overrides: Partial<AgentCommand> = {}): AgentCommand =>
    ({
      command_id: 'c1',
      agent_id: 'a1',
      command_type: 'reboot_host',
      status: 'completed',
      executed_at: iso(minute(2)), // 2 minutes ago
      ...overrides,
    } as any);

  const makeAgent = (lastHbMs: number | null): AgentDevice =>
    ({
      agent_id: 'a1',
      last_heartbeat: lastHbMs ? iso(lastHbMs) : null,
    } as any);

  it('returns null when no commands are provided', () => {
    expect(computeRebootInfo(undefined, makeAgent(null), NOW)).toBeNull();
    expect(computeRebootInfo([], makeAgent(null), NOW)).toBeNull();
  });

  it('returns null when no reboot_host command is found', () => {
    const cmds = [
      { ...makeRebootCmd(), command_type: 'ping' } as AgentCommand,
      { ...makeRebootCmd(), command_type: 'update_packages' } as AgentCommand,
    ];
    expect(computeRebootInfo(cmds, makeAgent(null), NOW)).toBeNull();
  });

  it('returns null when reboot_host command is not yet completed', () => {
    const cmds = [makeRebootCmd({ status: 'pending' as any })];
    expect(computeRebootInfo(cmds, makeAgent(null), NOW)).toBeNull();
  });

  it('returns null when reboot_host command has no executed_at', () => {
    const cmds = [makeRebootCmd({ executed_at: null as any })];
    expect(computeRebootInfo(cmds, makeAgent(null), NOW)).toBeNull();
  });

  it('returns reboot info when command completed and agent has not heartbeat back', () => {
    const cmds = [makeRebootCmd()];
    const info = computeRebootInfo(cmds, makeAgent(null), NOW);
    expect(info).not.toBeNull();
    expect(info!.startedAt).toBe(minute(2));
    expect(info!.elapsedMs).toBe(2 * 60 * 1000);
  });

  it('returns null when agent heartbeat is newer than reboot completion (already back)', () => {
    const cmds = [makeRebootCmd()];
    const agent = makeAgent(minute(1)); // heartbeat 1 minute ago — newer than reboot
    expect(computeRebootInfo(cmds, agent, NOW)).toBeNull();
  });

  it('returns reboot info when agent heartbeat is older than reboot completion', () => {
    const cmds = [makeRebootCmd()];
    const agent = makeAgent(minute(5)); // heartbeat 5 min ago — older than reboot 2m ago
    const info = computeRebootInfo(cmds, agent, NOW);
    expect(info).not.toBeNull();
    expect(info!.elapsedMs).toBe(2 * 60 * 1000);
  });

  it('returns null after the 15-minute window (gives up)', () => {
    const cmds = [makeRebootCmd({ executed_at: iso(minute(20)) })];
    expect(computeRebootInfo(cmds, makeAgent(null), NOW)).toBeNull();
  });

  it('honors a custom max-window override', () => {
    const cmds = [makeRebootCmd({ executed_at: iso(minute(8)) })];
    // 5-minute window — 8 minutes ago is past it.
    expect(computeRebootInfo(cmds, makeAgent(null), NOW, 5 * 60 * 1000)).toBeNull();
    // 30-minute window — still in.
    expect(computeRebootInfo(cmds, makeAgent(null), NOW, 30 * 60 * 1000)).not.toBeNull();
  });

  it('picks the most recent reboot_host command when multiple exist', () => {
    const cmds = [
      makeRebootCmd({ command_id: 'old', executed_at: iso(minute(10)) }),
      makeRebootCmd({ command_id: 'new', executed_at: iso(minute(2)) }),
      makeRebootCmd({ command_id: 'mid', executed_at: iso(minute(5)) }),
    ];
    const info = computeRebootInfo(cmds, makeAgent(null), NOW);
    expect(info).not.toBeNull();
    // Most recent (2m ago) wins.
    expect(info!.elapsedMs).toBe(2 * 60 * 1000);
  });

  it('ignores non-completed reboot commands when picking the most recent', () => {
    const cmds = [
      makeRebootCmd({ command_id: 'pending-newer', status: 'pending' as any, executed_at: iso(minute(1)) }),
      makeRebootCmd({ command_id: 'completed-older', executed_at: iso(minute(5)) }),
    ];
    const info = computeRebootInfo(cmds, makeAgent(null), NOW);
    expect(info!.elapsedMs).toBe(5 * 60 * 1000);
  });
});

describe('managerAlias', () => {
  it('contains the canonical Linux + Windows update managers', () => {
    expect(managerAlias.apt).toBe('apt');
    expect(managerAlias.dnf).toBe('dnf');
    expect(managerAlias.pacman).toBe('pacman');
    expect(managerAlias.zypper).toBe('zypper');
    expect(managerAlias.winupdate).toBe('winupdate');
  });

  it('aliases yum to dnf (RHEL family compatibility)', () => {
    expect(managerAlias.yum).toBe('dnf');
  });

  it('does not include macOS softwareupdate (macOS opens Settings instead)', () => {
    expect(managerAlias.softwareupdate).toBeUndefined();
  });
});

describe('getUpdatableManagers', () => {
  it('returns empty array for missing or non-array input', () => {
    expect(getUpdatableManagers(undefined)).toEqual([]);
    expect(getUpdatableManagers(null as any)).toEqual([]);
    expect(getUpdatableManagers([])).toEqual([]);
  });

  it('returns unique managers that have alias entries', () => {
    const patches = [
      { package_manager: 'apt', name: 'curl' },
      { package_manager: 'apt', name: 'vim' },
      { package_manager: 'dnf', name: 'bash' },
    ];
    expect(getUpdatableManagers(patches).sort()).toEqual(['apt', 'dnf']);
  });

  it('excludes managers without alias entries (e.g. softwareupdate)', () => {
    const patches = [
      { package_manager: 'apt', name: 'curl' },
      { package_manager: 'softwareupdate', name: 'macOS Update' },
      { package_manager: 'unknown', name: 'foo' },
    ];
    expect(getUpdatableManagers(patches)).toEqual(['apt']);
  });

  it('includes winupdate-reboot is excluded but winupdate included', () => {
    // The agent emits "winupdate-reboot" as its own pseudo-manager
    // for pending-restart Windows updates. That's NOT an actionable
    // manager — the Restart button handles those, not Update.
    const patches = [
      { package_manager: 'winupdate-reboot', name: 'KB123' },
      { package_manager: 'winupdate', name: 'KB456' },
    ];
    expect(getUpdatableManagers(patches)).toEqual(['winupdate']);
  });

  it('skips entries with missing package_manager', () => {
    const patches = [
      { name: 'curl' },
      { package_manager: '', name: 'vim' },
      { package_manager: 'apt', name: 'bash' },
    ];
    expect(getUpdatableManagers(patches as any)).toEqual(['apt']);
  });
});

describe('filterVisiblePatches', () => {
  it('returns empty array for non-array input', () => {
    expect(filterVisiblePatches(undefined, new Set())).toEqual([]);
    expect(filterVisiblePatches(null as any, new Set())).toEqual([]);
  });

  it('returns all patches when nothing is hidden', () => {
    const patches = [
      { package_manager: 'apt', name: 'curl' },
      { package_manager: 'apt', name: 'vim' },
    ];
    expect(filterVisiblePatches(patches, new Set())).toHaveLength(2);
  });

  it('hides exactly the patches whose key is in the set', () => {
    const patches = [
      { package_manager: 'apt', name: 'curl' },
      { package_manager: 'apt', name: 'vim' },
      { package_manager: 'dnf', name: 'bash' },
    ];
    const hidden = new Set(['apt|curl', 'dnf|bash']);
    const visible = filterVisiblePatches(patches, hidden);
    expect(visible).toEqual([{ package_manager: 'apt', name: 'vim' }]);
  });

  it('uses "manager|name" as the hide key (manager identical, name differs)', () => {
    const patches = [
      { package_manager: 'apt', name: 'curl' },
      { package_manager: 'dnf', name: 'curl' },
    ];
    // Only hide the apt entry; dnf curl should still show.
    const hidden = new Set(['apt|curl']);
    const visible = filterVisiblePatches(patches, hidden);
    expect(visible).toHaveLength(1);
    expect(visible[0].package_manager).toBe('dnf');
  });
});
