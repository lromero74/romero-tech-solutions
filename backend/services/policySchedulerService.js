import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

/**
 * Policy Scheduler Service
 *
 * Manages automated policy execution:
 * - Cron-based scheduling (e.g., daily, weekly)
 * - Immediate execution on assignment (run_on_assignment flag)
 * - Expands business-level assignments to all agents
 * - Creates agent commands for execution
 * - Tracks execution history
 */

class PolicySchedulerService {
  constructor() {
    this.scheduledTasks = new Map();
    this.checkInterval = null;
    this.isRunning = false;
  }

  /**
   * Start the policy scheduler service
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Policy scheduler already running');
      return;
    }

    console.log('🤖 Starting Policy Scheduler Service...');

    try {
      // Load and schedule all cron-based policies
      await this.loadScheduledPolicies();

      // Check for policies to execute every minute
      this.checkInterval = setInterval(() => {
        this.checkPendingExecutions().catch(error => {
          console.error('❌ Error checking pending policy executions:', error);
        });
      }, 60 * 1000); // Every 1 minute

      this.isRunning = true;
      console.log('✅ Policy Scheduler Service started');
    } catch (error) {
      console.error('❌ Failed to start Policy Scheduler Service:', error);
      throw error;
    }
  }

  /**
   * Stop the policy scheduler service
   */
  stop() {
    console.log('🛑 Stopping Policy Scheduler Service...');

    // Clear all scheduled cron tasks
    this.scheduledTasks.forEach((task, policyId) => {
      task.stop();
      console.log(`  Stopped scheduled task for policy: ${policyId}`);
    });
    this.scheduledTasks.clear();

    // Clear check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    console.log('✅ Policy Scheduler Service stopped');
  }

  /**
   * Load all enabled policies with cron schedules
   */
  async loadScheduledPolicies() {
    try {
      const result = await query(
        `SELECT id, policy_name, schedule_cron, execution_mode
         FROM automation_policies
         WHERE enabled = true
           AND execution_mode = 'scheduled'
           AND schedule_cron IS NOT NULL
           AND schedule_cron != ''`,
        []
      );

      console.log(`📅 Loading ${result.rows.length} scheduled policies...`);

      for (const policy of result.rows) {
        this.scheduleCronPolicy(policy);
      }
    } catch (error) {
      console.error('❌ Error loading scheduled policies:', error);
      throw error;
    }
  }

  /**
   * Schedule a cron-based policy
   */
  scheduleCronPolicy(policy) {
    const { id, policy_name, schedule_cron } = policy;

    // Validate cron expression
    if (!cron.validate(schedule_cron)) {
      console.warn(`⚠️  Invalid cron expression for policy ${policy_name}: ${schedule_cron}`);
      return;
    }

    // Remove existing schedule if present
    if (this.scheduledTasks.has(id)) {
      this.scheduledTasks.get(id).stop();
      this.scheduledTasks.delete(id);
    }

    // Create new scheduled task
    const task = cron.schedule(schedule_cron, async () => {
      console.log(`⏰ Executing scheduled policy: ${policy_name} (${id})`);
      try {
        await this.executePolicy(id, 'scheduled');
      } catch (error) {
        console.error(`❌ Error executing scheduled policy ${policy_name}:`, error);
      }
    });

    this.scheduledTasks.set(id, task);
    console.log(`  ✓ Scheduled: ${policy_name} (${schedule_cron})`);
  }

  /**
   * Unschedule a policy (when disabled or deleted)
   */
  unschedulePolicy(policyId) {
    if (this.scheduledTasks.has(policyId)) {
      this.scheduledTasks.get(policyId).stop();
      this.scheduledTasks.delete(policyId);
      console.log(`🗑️  Unscheduled policy: ${policyId}`);
    }
  }

  /**
   * Reload a specific policy schedule (when updated)
   */
  async reloadPolicySchedule(policyId) {
    try {
      const result = await query(
        `SELECT id, policy_name, schedule_cron, execution_mode, enabled
         FROM automation_policies
         WHERE id = $1`,
        [policyId]
      );

      if (result.rows.length === 0) {
        this.unschedulePolicy(policyId);
        return;
      }

      const policy = result.rows[0];

      // Unschedule if disabled or not scheduled mode
      if (!policy.enabled || policy.execution_mode !== 'scheduled' || !policy.schedule_cron) {
        this.unschedulePolicy(policyId);
        return;
      }

      // Reschedule
      this.scheduleCronPolicy(policy);
    } catch (error) {
      console.error(`❌ Error reloading policy schedule ${policyId}:`, error);
    }
  }

  /**
   * Check for pending policy executions
   * (Currently just for monitoring - cron handles scheduled execution)
   */
  async checkPendingExecutions() {
    // This could be extended to handle:
    // - Retry failed executions
    // - Clean up old execution history
    // - Monitor execution timeouts
  }

  /**
   * Execute a policy across all assigned agents
   *
   * @param {string} policyId - Policy ID to execute
   * @param {string} triggerType - How execution was triggered ('scheduled', 'manual', 'assignment')
   * @param {string} triggeredByEmployeeId - Employee who triggered (for manual execution)
   */
  async executePolicy(policyId, triggerType = 'scheduled', triggeredByEmployeeId = null) {
    try {
      console.log(`🚀 Executing policy ${policyId} (trigger: ${triggerType})`);

      // Get policy details
      const policyResult = await query(
        `SELECT p.*, s.script_content, s.script_type, s.timeout_seconds
         FROM automation_policies p
         LEFT JOIN automation_scripts s ON p.script_id = s.id
         WHERE p.id = $1 AND p.enabled = true`,
        [policyId]
      );

      if (policyResult.rows.length === 0) {
        console.warn(`⚠️  Policy ${policyId} not found or disabled`);
        return { success: false, message: 'Policy not found or disabled' };
      }

      const policy = policyResult.rows[0];

      // Get all target agents (expand business assignments)
      const targetAgents = await this.getTargetAgents(policyId);

      if (targetAgents.length === 0) {
        console.warn(`⚠️  No agents assigned to policy ${policyId}`);
        return { success: false, message: 'No agents assigned to policy' };
      }

      console.log(`  📡 Creating commands for ${targetAgents.length} agent(s)...`);

      // Create agent commands for each target
      const commandResults = [];
      for (const agent of targetAgents) {
        try {
          const commandId = await this.createAgentCommand(
            agent.agent_id,
            policy,
            triggerType,
            triggeredByEmployeeId
          );

          commandResults.push({
            agentId: agent.agent_id,
            agentName: agent.agent_name,
            commandId,
            success: true
          });
        } catch (error) {
          console.error(`  ❌ Failed to create command for agent ${agent.agent_name}:`, error);
          commandResults.push({
            agentId: agent.agent_id,
            agentName: agent.agent_name,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = commandResults.filter(r => r.success).length;
      console.log(`  ✅ Created ${successCount}/${targetAgents.length} commands successfully`);

      return {
        success: true,
        message: `Policy execution initiated for ${successCount} agent(s)`,
        commandResults
      };
    } catch (error) {
      console.error(`❌ Error executing policy ${policyId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get all target agents for a policy (expand business assignments)
   *
   * Uses DYNAMIC EXPANSION: Business-level policy assignments automatically
   * apply to all current AND future agents in that business (if OS-compatible).
   * This means when a new agent registers, it immediately inherits all
   * business-level policies without requiring new assignment records.
   *
   * Filters by OS compatibility based on script's supported_os array.
   */
  async getTargetAgents(policyId) {
    try {
      const result = await query(
        `SELECT DISTINCT
          ad.id as agent_id,
          ad.device_name as agent_name,
          ad.os_type,
          ad.status
         FROM policy_assignments pa
         LEFT JOIN agent_devices ad ON (
           pa.agent_device_id = ad.id
           OR (pa.business_id IS NOT NULL AND ad.business_id = pa.business_id)
         )
         LEFT JOIN automation_policies p ON pa.policy_id = p.id
         LEFT JOIN automation_scripts s ON p.script_id = s.id
         WHERE pa.policy_id = $1
           AND ad.id IS NOT NULL
           AND ad.status IN ('online', 'offline')
           AND (
             -- No script (policy without script), allow all agents
             s.id IS NULL
             -- Script has no OS restrictions
             OR s.supported_os IS NULL
             OR s.supported_os = '{}'
             -- Agent OS matches script's supported OS list
             OR ad.os_type = ANY(s.supported_os)
           )
         ORDER BY ad.device_name`,
        [policyId]
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Error getting target agents:', error);
      throw error;
    }
  }

  /**
   * Create an agent command for policy execution
   */
  async createAgentCommand(agentId, policy, triggerType, triggeredByEmployeeId) {
    try {
      const commandId = uuidv4();

      // Prepare command payload
      const commandPayload = {
        script: policy.script_content,
        policy_id: policy.id,
        policy_name: policy.policy_name,
        trigger_type: triggerType,
        timeout: policy.timeout_seconds || 300
      };

      // Insert agent command
      await query(
        `INSERT INTO agent_commands (
          id,
          agent_device_id,
          command_type,
          command_params,
          status,
          requested_by,
          approved_by,
          requires_approval
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          commandId,
          agentId,
          'run_script',
          JSON.stringify(commandPayload),
          'pending',
          triggeredByEmployeeId,
          triggeredByEmployeeId, // Auto-approved for policy execution
          false
        ]
      );

      // Create execution history record (started)
      const executionId = uuidv4();
      await query(
        `INSERT INTO policy_execution_history (
          id,
          policy_id,
          agent_device_id,
          script_id,
          trigger_type,
          status,
          started_at,
          triggered_by_employee_id,
          agent_command_id
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)`,
        [
          executionId,
          policy.id,
          agentId,
          policy.script_id,
          triggerType,
          'running',
          triggeredByEmployeeId,
          commandId
        ]
      );

      console.log(`  ✓ Created command ${commandId} for agent ${agentId}`);
      return commandId;
    } catch (error) {
      console.error(`❌ Error creating agent command:`, error);
      throw error;
    }
  }

  /**
   * Handle policy assignment (execute immediately if run_on_assignment is true)
   */
  async handlePolicyAssignment(policyId, assignmentId) {
    try {
      // Check if policy has run_on_assignment flag
      const result = await query(
        `SELECT p.run_on_assignment, p.policy_name, pa.assigned_by
         FROM automation_policies p
         INNER JOIN policy_assignments pa ON p.id = pa.policy_id
         WHERE p.id = $1 AND pa.id = $2 AND p.enabled = true`,
        [policyId, assignmentId]
      );

      if (result.rows.length === 0) {
        return { success: false, message: 'Policy or assignment not found' };
      }

      const { run_on_assignment, policy_name, assigned_by } = result.rows[0];

      if (run_on_assignment) {
        console.log(`🎯 Executing policy ${policy_name} on assignment...`);
        return await this.executePolicy(policyId, 'assignment', assigned_by);
      }

      return { success: true, message: 'Policy assigned (no immediate execution)' };
    } catch (error) {
      console.error('❌ Error handling policy assignment:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Update execution history when agent command completes
   */
  async updateExecutionHistory(commandId, status, result, errorMessage = null) {
    try {
      await query(
        `UPDATE policy_execution_history
         SET status = $2,
             completed_at = NOW(),
             result = $3,
             error_message = $4
         WHERE agent_command_id = $1`,
        [
          commandId,
          status,
          result ? JSON.stringify(result) : null,
          errorMessage
        ]
      );

      console.log(`📝 Updated execution history for command ${commandId}: ${status}`);
    } catch (error) {
      console.error('❌ Error updating execution history:', error);
    }
  }
}

// Export singleton instance
export const policySchedulerService = new PolicySchedulerService();
