/**
 * Agent Details Components Index
 *
 * This file exports all modularized components for the Agent Details view.
 * These components were extracted from the main AgentDetails.tsx file to improve
 * maintainability and reduce file size.
 */

export { CurrentMetrics } from './CurrentMetrics';
export { SystemEventLogs } from './SystemEventLogs';
export { DiskHealthStatus } from './DiskHealthStatus';
export { OSPatchStatus } from './OSPatchStatus';
export { PackageManagerStatus } from './PackageManagerStatus';
export { HardwareTemperature } from './HardwareTemperature';
export { NetworkConnectivity } from './NetworkConnectivity';
export { SecurityStatus } from './SecurityStatus';
export { FailedLoginAttempts } from './FailedLoginAttempts';
export { ServiceMonitoring } from './ServiceMonitoring';
export { OSEndOfLifeStatus } from './OSEndOfLifeStatus';
export { default as AlertHistory } from './AlertHistory';
export * from './types';
export * from './utils';
