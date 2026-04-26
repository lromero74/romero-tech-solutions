import {
  mergeAgentMetrics,
  coerceMetricNumerics,
} from '../../../../components/admin/agent-details/agentMetricMerge';

const ts = '2026-04-25T12:00:00Z';

describe('mergeAgentMetrics', () => {
  it('preserves the agent_device_id passed in (not from payload)', () => {
    const result = mergeAgentMetrics(
      { metrics: {}, timestamp: ts },
      'agent-zzz'
    );
    expect(result.agent_device_id).toBe('agent-zzz');
    expect(result.collected_at).toBe(ts);
  });

  it('coerces numeric metrics to numbers and defaults to 0', () => {
    const result = mergeAgentMetrics(
      {
        metrics: {
          cpu_percent: '45.2',
          memory_percent: 70,
          disk_percent: undefined,
        },
        timestamp: ts,
      },
      'a1'
    );
    expect(result.cpu_percent).toBe(45.2);
    expect(result.memory_percent).toBe(70);
    expect(result.disk_percent).toBe(0);
  });

  /**
   * The fix from a9b2921: every websocket tick was wiping these out.
   * Each of these tests asserts the merge passes the field through.
   */
  describe('preserves fields that previously got dropped (regression coverage)', () => {
    it('preserves os_patches_data when present', () => {
      const patches = [
        { package_manager: 'apt', name: 'curl', version_current: '7.0', version_available: '7.1' },
      ];
      const result = mergeAgentMetrics(
        { metrics: { os_patches_data: patches }, timestamp: ts },
        'a1'
      );
      expect(result.os_patches_data).toEqual(patches);
    });

    it('preserves distro_upgrade when present', () => {
      const upgrade = {
        current_release: 'jammy',
        available_release: 'noble',
        distro: 'Ubuntu',
        upgrade_command: 'do-release-upgrade -d',
      };
      const result = mergeAgentMetrics(
        { metrics: { distro_upgrade: upgrade }, timestamp: ts },
        'a1'
      );
      expect(result.distro_upgrade).toEqual(upgrade);
    });

    it('preserves clt_update_available when true', () => {
      const result = mergeAgentMetrics(
        { metrics: { clt_update_available: true }, timestamp: ts },
        'a1'
      );
      expect(result.clt_update_available).toBe(true);
    });

    it('defaults clt_update_available to false when missing (does NOT preserve undefined)', () => {
      const result = mergeAgentMetrics(
        { metrics: {}, timestamp: ts },
        'a1'
      );
      expect(result.clt_update_available).toBe(false);
    });

    it('defaults os_patches_data + distro_upgrade to null when missing', () => {
      const result = mergeAgentMetrics(
        { metrics: {}, timestamp: ts },
        'a1'
      );
      expect(result.os_patches_data).toBeNull();
      expect(result.distro_upgrade).toBeNull();
    });
  });

  describe('booleans: keep explicit false; default true for connectivity flags', () => {
    it('keeps internet_connected=false (does not flip to true)', () => {
      const result = mergeAgentMetrics(
        { metrics: { internet_connected: false }, timestamp: ts },
        'a1'
      );
      expect(result.internet_connected).toBe(false);
    });

    it('defaults internet_connected to true when omitted', () => {
      const result = mergeAgentMetrics(
        { metrics: {}, timestamp: ts },
        'a1'
      );
      expect(result.internet_connected).toBe(true);
      expect(result.gateway_reachable).toBe(true);
      expect(result.dns_working).toBe(true);
    });

    it('keeps explicit gateway_reachable=false (a critical alert)', () => {
      const result = mergeAgentMetrics(
        { metrics: { gateway_reachable: false }, timestamp: ts },
        'a1'
      );
      expect(result.gateway_reachable).toBe(false);
    });
  });

  describe('numeric default semantics (`|| 0`)', () => {
    it('defaults patches_available to 0 when undefined', () => {
      const result = mergeAgentMetrics(
        { metrics: {}, timestamp: ts },
        'a1'
      );
      expect(result.patches_available).toBe(0);
      expect(result.security_patches_available).toBe(0);
    });

    it('passes through non-zero patches_available', () => {
      const result = mergeAgentMetrics(
        { metrics: { patches_available: 17, security_patches_available: 3 }, timestamp: ts },
        'a1'
      );
      expect(result.patches_available).toBe(17);
      expect(result.security_patches_available).toBe(3);
    });
  });

  describe('null defaults for object/data fields', () => {
    it('defaults complex object fields to null when missing', () => {
      const result = mergeAgentMetrics(
        { metrics: {}, timestamp: ts },
        'a1'
      );
      expect(result.disk_health_data).toBeNull();
      expect(result.security_data).toBeNull();
      expect(result.failed_login_data).toBeNull();
      expect(result.connectivity_data).toBeNull();
      expect(result.sensor_data).toBeNull();
      expect(result.outdated_packages_data).toBeNull();
      expect(result.raw_metrics).toBeNull();
    });
  });

  describe('handles totally empty payload without throwing', () => {
    it('merges {} metrics into a fully-formed AgentMetric', () => {
      const result = mergeAgentMetrics({ metrics: {}, timestamp: ts }, 'a1');
      // Spot-check a few representative defaults; full coverage would
      // be excessive but the object should be fully populated.
      expect(result.agent_device_id).toBe('a1');
      expect(result.collected_at).toBe(ts);
      expect(result.cpu_percent).toBe(0);
      expect(result.patches_available).toBe(0);
      expect(result.os_patches_data).toBeNull();
    });
  });
});

describe('coerceMetricNumerics', () => {
  it('coerces stringified numeric fields from PostgreSQL to numbers', () => {
    // pg returns DECIMAL columns as strings; the dashboard needs real numbers.
    const raw = {
      cpu_percent: '45.5',
      memory_percent: '70',
      disk_percent: '12.34',
    };
    const out = coerceMetricNumerics(raw as any);
    expect(out.cpu_percent).toBe(45.5);
    expect(out.memory_percent).toBe(70);
    expect(out.disk_percent).toBe(12.34);
  });

  it('preserves non-numeric fields untouched (spread)', () => {
    const raw = {
      cpu_percent: '5',
      eol_status: 'eol',
      services_data: { foo: 'bar' },
    };
    const out = coerceMetricNumerics(raw as any);
    expect(out.eol_status).toBe('eol');
    expect(out.services_data).toEqual({ foo: 'bar' });
  });

  it('defaults missing percent fields to 0', () => {
    const out = coerceMetricNumerics({} as any);
    expect(out.cpu_percent).toBe(0);
    expect(out.memory_percent).toBe(0);
    expect(out.disk_percent).toBe(0);
  });

  it('returns undefined for missing memory_used_gb / disk_used_gb (not 0)', () => {
    const out = coerceMetricNumerics({} as any);
    expect(out.memory_used_gb).toBeUndefined();
    expect(out.disk_used_gb).toBeUndefined();
  });

  it('returns null for missing network_rx/tx_bytes (not 0)', () => {
    const out = coerceMetricNumerics({} as any);
    expect(out.network_rx_bytes).toBeNull();
    expect(out.network_tx_bytes).toBeNull();
  });

  it('coerces network_rx/tx_bytes when present', () => {
    const out = coerceMetricNumerics({
      network_rx_bytes: '1000000',
      network_tx_bytes: '2000000',
    } as any);
    expect(out.network_rx_bytes).toBe(1_000_000);
    expect(out.network_tx_bytes).toBe(2_000_000);
  });
});
