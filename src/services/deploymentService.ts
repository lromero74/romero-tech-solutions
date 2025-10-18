import apiService from './apiService';

/**
 * Deployment Service
 *
 * Handles all API calls related to software deployment, package management, and maintenance windows
 */

export interface SoftwarePackage {
  id: string;
  package_name: string;
  package_version: string | null;
  publisher: string | null;
  description: string | null;
  package_type: 'msi' | 'exe' | 'deb' | 'rpm' | 'pkg' | 'dmg';
  package_category: string | null;
  supported_os: string[];
  source_type: 'url' | 'repository' | 'local_upload';
  source_url: string | null;
  checksum_type: string;
  checksum_value: string | null;
  install_command: string | null;
  requires_reboot: boolean;
  requires_elevated: boolean;
  is_approved: boolean;
  is_public: boolean;
  business_id: string | null;
  created_by: string;
  tags: string[] | null;
  deployment_count: number;
  success_count: number;
  last_deployed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  created_by_name?: string;
}

export interface DeploymentSchedule {
  id: string;
  schedule_name: string;
  description: string | null;
  business_id: string | null;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'once';
  start_time: string | null;
  end_time: string | null;
  day_of_week: number | null;
  day_of_month: number | null;
  window_duration_minutes: number;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  created_by_name?: string;
}

// Alias for backward compatibility
export type MaintenanceWindow = DeploymentSchedule;

export interface PackageDeployment {
  id: string;
  deployment_name: string | null;
  package_id: string;
  deployment_scope: 'single_agent' | 'business' | 'all_agents';
  agent_device_id: string | null;
  business_id: string | null;
  install_mode: 'silent' | 'attended' | 'unattended';
  allow_reboot: boolean;
  scheduled_for: string | null;
  maintenance_window_id: string | null;
  deployment_status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  total_agents: number;
  successful_installs: number;
  failed_installs: number;
  pending_installs: number;
  created_by: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  package_name?: string;
  package_version?: string;
  agent_name?: string;
  business_name?: string;
  created_by_name?: string;
}

export interface DeploymentHistory {
  id: string;
  deployment_id: string | null;
  package_id: string;
  agent_device_id: string;
  status: 'pending' | 'downloading' | 'installing' | 'completed' | 'failed' | 'cancelled';
  download_started_at: string | null;
  download_completed_at: string | null;
  download_size_bytes: number | null;
  install_started_at: string | null;
  install_completed_at: string | null;
  exit_code: number | null;
  error_message: string | null;
  output_log: string | null;
  reboot_required: boolean;
  rebooted_at: string | null;
  started_at: string;
  completed_at: string | null;
  // Joined fields
  package_name?: string;
  package_version?: string;
  agent_name?: string;
}

export interface PatchPolicy {
  id: string;
  policy_name: string;
  description: string | null;
  business_id: string | null;
  auto_install_security_patches: boolean;
  auto_install_critical_patches: boolean;
  auto_install_optional_patches: boolean;
  maintenance_window_id: string | null;
  allow_reboot: boolean;
  reboot_delay_minutes: number;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  created_by_name?: string;
  business_name?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  error?: string;
}

class DeploymentService {
  /**
   * List software packages with filters
   */
  async listPackages(filters?: {
    package_type?: string;
    is_approved?: boolean;
    search?: string;
    os?: string;
  }): Promise<ApiResponse<{ packages: SoftwarePackage[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.package_type) params.package_type = filters.package_type;
    if (filters?.is_approved !== undefined) params.is_approved = filters.is_approved.toString();
    if (filters?.search) params.search = filters.search;
    if (filters?.os) params.os = filters.os;

    return apiService.get('/deployment/packages', { params });
  }

  /**
   * Get a single package by ID
   */
  async getPackage(packageId: string): Promise<ApiResponse<SoftwarePackage>> {
    return apiService.get(`/deployment/packages/${packageId}`);
  }

  /**
   * Create a new software package (employees only)
   */
  async createPackage(data: {
    package_name: string;
    package_version?: string;
    publisher?: string;
    description?: string;
    package_type: 'msi' | 'exe' | 'deb' | 'rpm' | 'pkg' | 'dmg';
    package_category?: string;
    supported_os?: string[];
    source_type: 'url' | 'repository' | 'local_upload';
    source_url?: string;
    checksum_type?: string;
    checksum_value?: string;
    install_command?: string;
    requires_reboot?: boolean;
    requires_elevated?: boolean;
    is_approved?: boolean;
    is_public?: boolean;
    business_id?: string;
    tags?: string[];
  }): Promise<ApiResponse<{ package_id: string }>> {
    return apiService.post('/deployment/packages', data);
  }

  /**
   * Get a single deployment schedule (maintenance window) by ID
   */
  async getMaintenanceWindow(scheduleId: string): Promise<ApiResponse<MaintenanceWindow>> {
    return apiService.get(`/deployment/schedules/${scheduleId}`);
  }

  /**
   * List deployment schedules (maintenance windows) with filters
   */
  async listSchedules(filters?: {
    business_id?: string;
    is_active?: boolean;
  }): Promise<ApiResponse<{ schedules: DeploymentSchedule[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.business_id) params.business_id = filters.business_id;
    if (filters?.is_active !== undefined) params.is_active = filters.is_active.toString();

    return apiService.get('/deployment/schedules', { params });
  }

  /**
   * Create a new deployment schedule (employees only)
   */
  async createSchedule(data: {
    schedule_name: string;
    description?: string;
    business_id?: string;
    schedule_type: 'daily' | 'weekly' | 'monthly' | 'once';
    start_time?: string;
    end_time?: string;
    day_of_week?: number;
    window_duration_minutes?: number;
    is_active?: boolean;
  }): Promise<ApiResponse<{ schedule_id: string }>> {
    return apiService.post('/deployment/schedules', data);
  }

  /**
   * List package deployments with filters
   */
  async listDeployments(filters?: {
    package_id?: string;
    agent_id?: string;
    deployment_status?: string;
    limit?: number;
  }): Promise<ApiResponse<{ deployments: PackageDeployment[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.package_id) params.package_id = filters.package_id;
    if (filters?.agent_id) params.agent_id = filters.agent_id;
    if (filters?.deployment_status) params.deployment_status = filters.deployment_status;
    if (filters?.limit) params.limit = filters.limit.toString();

    return apiService.get('/deployment/deployments', { params });
  }

  /**
   * Create a new package deployment (employees only)
   */
  async createDeployment(data: {
    deployment_name?: string;
    package_id: string;
    deployment_scope: 'single_agent' | 'business' | 'all_agents';
    agent_device_id?: string;
    business_id?: string;
    install_mode?: 'silent' | 'attended' | 'unattended';
    allow_reboot?: boolean;
    scheduled_for?: string;
    maintenance_window_id?: string;
  }): Promise<ApiResponse<{ deployment_id: string }>> {
    return apiService.post('/deployment/deployments', data);
  }

  /**
   * Get deployment history
   */
  async getDeploymentHistory(filters?: {
    deployment_id?: string;
    agent_id?: string;
    status?: string;
    limit?: number;
  }): Promise<ApiResponse<{ history: DeploymentHistory[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.deployment_id) params.deployment_id = filters.deployment_id;
    if (filters?.agent_id) params.agent_id = filters.agent_id;
    if (filters?.status) params.status = filters.status;
    if (filters?.limit) params.limit = filters.limit.toString();

    return apiService.get('/deployment/history', { params });
  }
}

// Export singleton instance
export const deploymentService = new DeploymentService();
export default deploymentService;
