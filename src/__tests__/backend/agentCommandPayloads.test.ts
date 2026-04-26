/**
 * Tests for the pure helpers extracted from backend/routes/agents.js.
 *
 * These cover the Windows-Update progress mid-install flow added in
 * 65c14a7 + 4c69940 — the body-coercion rules need tight, deterministic
 * behavior because the agent posts wildly variable payload shapes
 * during install (some fields missing, ints sent as strings, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  normalizeProgressPayload,
  buildProgressWsMessage,
  buildStartedWsMessage,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../../../backend/utils/agentCommandPayloads.cjs');

const FROZEN = '2026-04-25T12:00:00.000Z';

describe('normalizeProgressPayload', () => {
  it('returns a fully-defaulted shape for an empty body', () => {
    const out = normalizeProgressPayload({}, FROZEN);
    expect(out).toEqual({
      phase: '',
      percent: 0,
      current_index: -1,
      total: 0,
      package: '',
      message: '',
      updated_at: FROZEN,
    });
  });

  it('handles null/undefined body without throwing', () => {
    expect(() => normalizeProgressPayload(null, FROZEN)).not.toThrow();
    expect(() => normalizeProgressPayload(undefined, FROZEN)).not.toThrow();
    const out = normalizeProgressPayload(null, FROZEN);
    expect(out.percent).toBe(0);
    expect(out.current_index).toBe(-1);
  });

  it('passes through valid numeric fields verbatim', () => {
    const out = normalizeProgressPayload(
      { phase: 'install', percent: 42.5, current_index: 3, total: 10, package: 'KB123', message: 'Installing…' },
      FROZEN
    );
    expect(out.phase).toBe('install');
    expect(out.percent).toBe(42.5);
    expect(out.current_index).toBe(3);
    expect(out.total).toBe(10);
    expect(out.package).toBe('KB123');
    expect(out.message).toBe('Installing…');
  });

  it('rejects non-number percent (defaults to 0, not coerced from string)', () => {
    // Strings should NOT silently pass through — this protects the
    // dashboard progress bar from becoming "NaN%" on a malformed payload.
    const out = normalizeProgressPayload({ percent: '50' }, FROZEN);
    expect(out.percent).toBe(0);
  });

  it('rejects non-number current_index (sentinel -1)', () => {
    const out = normalizeProgressPayload({ current_index: 'abc' }, FROZEN);
    expect(out.current_index).toBe(-1);
  });

  it('rejects non-number total (defaults to 0)', () => {
    const out = normalizeProgressPayload({ total: '3' }, FROZEN);
    expect(out.total).toBe(0);
  });

  it('rejects non-string phase / package / message (defaults to "")', () => {
    const out = normalizeProgressPayload(
      { phase: 5, package: { foo: 1 }, message: ['a'] },
      FROZEN
    );
    expect(out.phase).toBe('');
    expect(out.package).toBe('');
    expect(out.message).toBe('');
  });

  it('uses Date.now ISO when nowIso is not supplied', () => {
    const out = normalizeProgressPayload({});
    expect(typeof out.updated_at).toBe('string');
    // ISO 8601 — should at least parse to a Date.
    expect(Number.isFinite(new Date(out.updated_at).getTime())).toBe(true);
  });

  it('keeps zero values rather than defaulting them up', () => {
    // 0% and total=0 are valid early-stage values; don't replace them.
    const out = normalizeProgressPayload(
      { percent: 0, total: 0, current_index: 0 },
      FROZEN
    );
    expect(out.percent).toBe(0);
    expect(out.total).toBe(0);
    expect(out.current_index).toBe(0);
  });
});

describe('buildProgressWsMessage', () => {
  it('builds the canonical agent.command.progress message envelope', () => {
    const progress = normalizeProgressPayload(
      { phase: 'install', percent: 50 },
      FROZEN
    );
    const msg = buildProgressWsMessage({
      command_id: 'cmd-1',
      agent_id: 'agent-1',
      command_type: 'update_packages',
      progress,
    });
    expect(msg).toEqual({
      type: 'agent.command.progress',
      data: {
        command_id: 'cmd-1',
        agent_id: 'agent-1',
        command_type: 'update_packages',
        stage: 'executing',
        progress,
      },
    });
  });

  it('falls back to null command_type when not provided', () => {
    const msg = buildProgressWsMessage({
      command_id: 'cmd-1',
      agent_id: 'agent-1',
      command_type: undefined,
      progress: normalizeProgressPayload({}, FROZEN),
    });
    expect(msg.data.command_type).toBeNull();
  });

  it('always sets stage="executing"', () => {
    const msg = buildProgressWsMessage({
      command_id: 'a',
      agent_id: 'b',
      command_type: 'x',
      progress: normalizeProgressPayload({}, FROZEN),
    });
    expect(msg.data.stage).toBe('executing');
  });
});

describe('buildStartedWsMessage', () => {
  it('builds the started variant with started_at instead of progress', () => {
    const msg = buildStartedWsMessage({
      command_id: 'cmd-1',
      agent_id: 'agent-1',
      command_type: 'reboot_host',
      started_at: FROZEN,
    });
    expect(msg).toEqual({
      type: 'agent.command.progress',
      data: {
        command_id: 'cmd-1',
        agent_id: 'agent-1',
        command_type: 'reboot_host',
        stage: 'executing',
        started_at: FROZEN,
      },
    });
  });

  it('defaults started_at to a fresh ISO string when omitted', () => {
    const msg = buildStartedWsMessage({
      command_id: 'a',
      agent_id: 'b',
      command_type: 'x',
    });
    expect(typeof msg.data.started_at).toBe('string');
    expect(Number.isFinite(new Date(msg.data.started_at).getTime())).toBe(true);
  });

  it('falls back to null command_type', () => {
    const msg = buildStartedWsMessage({
      command_id: 'a',
      agent_id: 'b',
      command_type: null,
      started_at: FROZEN,
    });
    expect(msg.data.command_type).toBeNull();
  });
});
