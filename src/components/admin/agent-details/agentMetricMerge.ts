import type { AgentMetric } from '../../../services/agentService';

/**
 * Coerce numeric fields on a raw metrics row from PostgreSQL into
 * proper JS numbers. Postgres returns DECIMAL columns as strings; the
 * dashboard's <CurrentMetrics> renderer needs real numbers to format
 * percentages and apply threshold colours.
 *
 * `null` and `undefined` are preserved (the renderer treats them as
 * "no data") — the only thing this does is bypass the string-typed
 * pg path. Used after the initial REST fetch (the websocket update
 * goes through mergeAgentMetrics instead).
 */
export function coerceMetricNumerics<T extends Partial<AgentMetric>>(m: T): T {
  return {
    ...m,
    cpu_percent: Number(m.cpu_percent) || 0,
    memory_percent: Number(m.memory_percent) || 0,
    disk_percent: Number(m.disk_percent) || 0,
    memory_used_gb: m.memory_used_gb ? Number(m.memory_used_gb) : undefined,
    disk_used_gb: m.disk_used_gb ? Number(m.disk_used_gb) : undefined,
    network_rx_bytes: m.network_rx_bytes ? Number(m.network_rx_bytes) : null,
    network_tx_bytes: m.network_tx_bytes ? Number(m.network_tx_bytes) : null,
  } as T;
}

/**
 * Maps a websocket metrics-update payload onto a fully-shaped AgentMetric.
 *
 * Why this exists: every websocket metric tick used to overwrite the
 * in-memory `latestMetrics` with a partial mapping that silently dropped
 * newer fields (os_patches_data / distro_upgrade / clt_update_available).
 * The data was still in the DB — the initial REST fetch saw it — but the
 * websocket merge was the dropper. The OS Patch panel would render full
 * detail until the first heartbeat, then collapse to count-only.
 *
 * Centralising the mapping here makes it impossible to lose the
 * preservation rule by accident; future field additions go in this one
 * function, exercised by tests, and can never miss a code path.
 */
export interface MetricsUpdatePayload {
  metrics: Record<string, any>;
  timestamp: string;
}

export function mergeAgentMetrics(
  update: MetricsUpdatePayload,
  agentId: string
): AgentMetric {
  const m = update.metrics || {};
  return {
    id: '',
    agent_device_id: agentId,
    cpu_percent: Number(m.cpu_percent) || 0,
    memory_percent: Number(m.memory_percent) || 0,
    disk_percent: Number(m.disk_percent) || 0,
    memory_used_gb: m.memory_used_gb ? Number(m.memory_used_gb) : undefined,
    disk_used_gb: m.disk_used_gb ? Number(m.disk_used_gb) : undefined,
    network_rx_bytes: m.network_rx_bytes ? Number(m.network_rx_bytes) : null,
    network_tx_bytes: m.network_tx_bytes ? Number(m.network_tx_bytes) : null,
    collected_at: update.timestamp,
    patches_available: m.patches_available || 0,
    security_patches_available: m.security_patches_available || 0,
    patches_require_reboot: m.patches_require_reboot || false,
    eol_status: m.eol_status || null,
    eol_date: m.eol_date || null,
    security_eol_date: m.security_eol_date || null,
    days_until_eol: m.days_until_eol || null,
    days_until_sec_eol: m.days_until_sec_eol || null,
    eol_message: m.eol_message || null,
    disk_health_status: m.disk_health_status || null,
    disk_health_data: m.disk_health_data || null,
    disk_failures_predicted: m.disk_failures_predicted || 0,
    disk_temperature_max: m.disk_temperature_max || null,
    disk_reallocated_sectors_total: m.disk_reallocated_sectors_total || 0,
    system_uptime_seconds: m.system_uptime_seconds || null,
    last_boot_time: m.last_boot_time || null,
    unexpected_reboot: m.unexpected_reboot || false,
    services_monitored: m.services_monitored || 0,
    services_running: m.services_running || 0,
    services_failed: m.services_failed || 0,
    services_data: m.services_data || null,
    network_devices_monitored: m.network_devices_monitored || 0,
    network_devices_online: m.network_devices_online || 0,
    network_devices_offline: m.network_devices_offline || 0,
    network_devices_data: m.network_devices_data || null,
    backups_detected: m.backups_detected || 0,
    backups_running: m.backups_running || 0,
    backups_with_issues: m.backups_with_issues || 0,
    backup_data: m.backup_data || null,
    antivirus_installed: m.antivirus_installed || false,
    antivirus_enabled: m.antivirus_enabled || false,
    antivirus_up_to_date: m.antivirus_up_to_date || false,
    firewall_enabled: m.firewall_enabled || false,
    security_products_count: m.security_products_count || 0,
    security_issues_count: m.security_issues_count || 0,
    security_data: m.security_data || null,
    failed_login_attempts: m.failed_login_attempts || 0,
    failed_login_last_24h: m.failed_login_last_24h || 0,
    unique_attacking_ips: m.unique_attacking_ips || 0,
    failed_login_data: m.failed_login_data || null,
    internet_connected: m.internet_connected !== undefined ? m.internet_connected : true,
    gateway_reachable: m.gateway_reachable !== undefined ? m.gateway_reachable : true,
    dns_working: m.dns_working !== undefined ? m.dns_working : true,
    avg_latency_ms: m.avg_latency_ms || null,
    packet_loss_percent: m.packet_loss_percent || null,
    connectivity_issues_count: m.connectivity_issues_count || 0,
    connectivity_data: m.connectivity_data || null,
    cpu_temperature_c: m.cpu_temperature_c || null,
    gpu_temperature_c: m.gpu_temperature_c || null,
    motherboard_temperature_c: m.motherboard_temperature_c || null,
    highest_temperature_c: m.highest_temperature_c || 0,
    temperature_critical_count: m.temperature_critical_count || 0,
    fan_count: m.fan_count || 0,
    fan_speeds_rpm: m.fan_speeds_rpm || null,
    fan_failure_count: m.fan_failure_count || 0,
    sensor_data: m.sensor_data || null,
    critical_events_count: m.critical_events_count || 0,
    error_events_count: m.error_events_count || 0,
    warning_events_count: m.warning_events_count || 0,
    last_critical_event: m.last_critical_event || null,
    last_critical_event_message: m.last_critical_event_message || null,
    package_managers_outdated: m.package_managers_outdated || 0,
    homebrew_outdated: m.homebrew_outdated || 0,
    npm_outdated: m.npm_outdated || 0,
    pip_outdated: m.pip_outdated || 0,
    mas_outdated: m.mas_outdated || 0,
    outdated_packages_data: m.outdated_packages_data || null,
    // Newer fields (added in agent v1.16.49+) — these used to silently
    // get dropped from the websocket merge. The OS Patch Status panel
    // depends on them; never remove these mappings without checking
    // OSPatchStatus's render path.
    os_patches_data: m.os_patches_data || null,
    distro_upgrade: m.distro_upgrade || null,
    clt_update_available: m.clt_update_available || false,
    raw_metrics: m.raw_metrics || null,
  } as AgentMetric;
}
