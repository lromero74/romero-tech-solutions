import apiService from './apiService';

/**
 * Automation Service
 *
 * Handles all API calls related to policy-based automation, script library, and execution management
 */

export interface ScriptCategory {
  id: string;
  category_name: string;
  description: string | null;
  icon_name: string | null;
  sort_order: number;
  created_at: string;
}

export interface AutomationScript {
  id: string;
  script_name: string;
  description: string | null;
  script_category_id: string | null;
  script_type: 'bash' | 'powershell' | 'python' | 'node';
  script_content: string;
  script_parameters: Record<string, unknown> | null;
  supported_os: string[];
  timeout_seconds: number;
  requires_elevated: boolean;
  is_destructive: boolean;
  requires_approval: boolean;
  is_builtin: boolean;
  is_public: boolean;
  business_id: string | null;
  created_by: string;
  tags: string[] | null;
  execution_count: number;
  success_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  category_name?: string;
  created_by_name?: string;
}

export interface AutomationPolicy {
  id: string;
  policy_name: string;
  description: string | null;
  policy_type: 'script_execution' | 'config_enforcement' | 'compliance_check' | 'maintenance_task';
  business_id: string | null;
  created_by: string;
  script_id: string | null;
  script_parameters: Record<string, unknown> | null;
  execution_mode: 'manual' | 'scheduled' | 'triggered';
  schedule_cron: string | null;
  run_on_assignment: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  script_name?: string;
  created_by_name?: string;
  business_name?: string;
}

export interface PolicyAssignment {
  id: string;
  policy_id: string;
  agent_device_id: string | null;
  business_id: string | null;
  assigned_by: string;
  assigned_at: string;
  // Joined fields
  agent_name?: string;
  device_type?: string;
  business_name?: string;
  assigned_by_name?: string;
}

export interface PolicyExecutionHistory {
  id: string;
  policy_id: string | null;
  script_id: string | null;
  agent_device_id: string;
  triggered_by: 'manual' | 'scheduled' | 'policy' | 'alert_condition';
  triggered_by_employee_id: string | null;
  parameters_used: Record<string, unknown> | null;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  exit_code: number | null;
  stdout_output: string | null;
  stderr_output: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  execution_duration_seconds: number | null;
  // Joined fields
  policy_name?: string;
  script_name?: string;
  agent_name?: string;
  triggered_by_name?: string;
}

export interface PolicyTemplate {
  id: string;
  template_name: string;
  description: string | null;
  policy_type: string;
  is_builtin: boolean;
  template_config: Record<string, unknown>;
  preview_scripts: Record<string, unknown>[] | null;
  created_at: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  error?: string;
}

class AutomationService {
  /**
   * Get all script categories
   */
  async getCategories(): Promise<ApiResponse<{ categories: ScriptCategory[]; count: number }>> {
    return apiService.get('/automation/categories');
  }

  /**
   * List automation scripts with filters
   */
  async listScripts(filters?: {
    category_id?: string;
    script_type?: string;
    is_builtin?: boolean;
    search?: string;
  }): Promise<ApiResponse<{ scripts: AutomationScript[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.category_id) params.category_id = filters.category_id;
    if (filters?.script_type) params.script_type = filters.script_type;
    if (filters?.is_builtin !== undefined) params.is_builtin = filters.is_builtin.toString();
    if (filters?.search) params.search = filters.search;

    return apiService.get('/automation/scripts', { params });
  }

  /**
   * Get a single script by ID
   */
  async getScript(scriptId: string): Promise<ApiResponse<AutomationScript>> {
    return apiService.get(`/automation/scripts/${scriptId}`);
  }

  /**
   * Create a new automation script (employees only)
   */
  async createScript(data: {
    script_name: string;
    description?: string;
    script_category_id?: string;
    script_type: 'bash' | 'powershell' | 'python' | 'node';
    script_content: string;
    script_parameters?: Record<string, unknown>;
    supported_os?: string[];
    timeout_seconds?: number;
    requires_elevated?: boolean;
    is_destructive?: boolean;
    requires_approval?: boolean;
    is_public?: boolean;
    business_id?: string;
    tags?: string[];
  }): Promise<ApiResponse<{ script_id: string }>> {
    return apiService.post('/automation/scripts', data);
  }

  /**
   * Get a single automation policy by ID
   */
  async getPolicy(policyId: string): Promise<ApiResponse<AutomationPolicy>> {
    return apiService.get(`/automation/policies/${policyId}`);
  }

  /**
   * List automation policies with filters
   */
  async listPolicies(filters?: {
    business_id?: string;
    enabled?: boolean;
    policy_type?: string;
  }): Promise<ApiResponse<{ policies: AutomationPolicy[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.business_id) params.business_id = filters.business_id;
    if (filters?.enabled !== undefined) params.enabled = filters.enabled.toString();
    if (filters?.policy_type) params.policy_type = filters.policy_type;

    return apiService.get('/automation/policies', { params });
  }

  /**
   * Create a new automation policy (employees only)
   */
  async createPolicy(data: {
    policy_name: string;
    description?: string;
    policy_type: 'script_execution' | 'config_enforcement' | 'compliance_check' | 'maintenance_task';
    business_id?: string;
    script_id?: string;
    script_parameters?: Record<string, unknown>;
    execution_mode?: 'manual' | 'scheduled' | 'triggered';
    schedule_cron?: string;
    run_on_assignment?: boolean;
    enabled?: boolean;
  }): Promise<ApiResponse<{ policy_id: string }>> {
    return apiService.post('/automation/policies', data);
  }

  /**
   * Get assignments for a specific policy
   */
  async getPolicyAssignments(
    policyId: string
  ): Promise<ApiResponse<{ assignments: PolicyAssignment[]; count: number }>> {
    return apiService.get(`/automation/policies/${policyId}/assignments`);
  }

  /**
   * Assign a policy to an agent or business (employees only)
   */
  async assignPolicy(
    policyId: string,
    data: {
      agent_device_id?: string;
      business_id?: string;
    }
  ): Promise<ApiResponse<{ assignment_id: string }>> {
    return apiService.post(`/automation/policies/${policyId}/assignments`, data);
  }

  /**
   * Remove a policy assignment (employees only)
   */
  async removePolicyAssignment(
    policyId: string,
    assignmentId: string
  ): Promise<ApiResponse<void>> {
    return apiService.delete(`/automation/policies/${policyId}/assignments/${assignmentId}`);
  }

  /**
   * Get policy execution history
   */
  async getExecutionHistory(filters?: {
    policy_id?: string;
    agent_id?: string;
    status?: string;
    limit?: number;
  }): Promise<ApiResponse<{ executions: PolicyExecutionHistory[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.policy_id) params.policy_id = filters.policy_id;
    if (filters?.agent_id) params.agent_id = filters.agent_id;
    if (filters?.status) params.status = filters.status;
    if (filters?.limit) params.limit = filters.limit.toString();

    return apiService.get('/automation/executions', { params });
  }
}

// Export singleton instance
export const automationService = new AutomationService();
export default automationService;
