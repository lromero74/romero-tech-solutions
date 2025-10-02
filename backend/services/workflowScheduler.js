import { getPool } from '../config/database.js';
import { handleAcknowledgmentTimeout, handleStartTimeout } from './workflowService.js';

/**
 * Workflow Background Job Scheduler
 * Processes pending workflow actions like acknowledgment timeouts and start reminders
 */
class WorkflowScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.checkIntervalMs = 60000; // Check every 60 seconds
  }

  /**
   * Start the workflow scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Workflow scheduler is already running');
      return;
    }

    console.log('🕐 Starting workflow scheduler...');
    this.isRunning = true;

    // Run immediately on start
    this.processScheduledActions();

    // Then run at intervals
    this.intervalId = setInterval(() => {
      this.processScheduledActions();
    }, this.checkIntervalMs);

    console.log(`✅ Workflow scheduler started (checking every ${this.checkIntervalMs / 1000}s)`);
  }

  /**
   * Stop the workflow scheduler
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Workflow scheduler is not running');
      return;
    }

    console.log('🛑 Stopping workflow scheduler...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('✅ Workflow scheduler stopped');
  }

  /**
   * Process all scheduled actions that are due
   */
  async processScheduledActions() {
    try {
      console.log('🔄 Processing scheduled workflow actions...');

      const pool = await getPool();

      // Find all service requests with scheduled actions that are due
      const query = `
        SELECT
          ws.service_request_id,
          ws.current_state,
          ws.next_scheduled_action,
          ws.next_scheduled_action_at,
          ws.acknowledgment_reminder_count,
          ws.start_reminder_count,
          sr.request_number,
          wr.max_retry_count
        FROM service_request_workflow_state ws
        JOIN service_requests sr ON ws.service_request_id = sr.id
        LEFT JOIN workflow_notification_rules wr ON
          (ws.next_scheduled_action = 'send_acknowledgment_reminder' AND wr.trigger_event = 'acknowledgment_timeout')
          OR (ws.next_scheduled_action = 'send_start_reminder' AND wr.trigger_event = 'start_timeout')
        WHERE ws.next_scheduled_action_at IS NOT NULL
          AND ws.next_scheduled_action_at <= CURRENT_TIMESTAMP
          AND ws.current_state IN ('pending_acknowledgment', 'acknowledged')
          AND sr.soft_delete = false
        ORDER BY ws.next_scheduled_action_at ASC
      `;

      const result = await pool.query(query);

      if (result.rows.length === 0) {
        console.log('✅ No scheduled actions due at this time');
        return;
      }

      console.log(`📋 Found ${result.rows.length} scheduled action(s) to process`);

      for (const row of result.rows) {
        await this.processAction(row);
      }

      console.log('✅ Finished processing scheduled actions');
    } catch (error) {
      console.error('❌ Error processing scheduled actions:', error);
    }
  }

  /**
   * Process a single scheduled action
   */
  async processAction(actionData) {
    const {
      service_request_id: serviceRequestId,
      current_state: currentState,
      next_scheduled_action: nextAction,
      request_number: requestNumber,
      acknowledgment_reminder_count: ackRetryCount,
      start_reminder_count: startRetryCount,
      max_retry_count: maxRetryCount
    } = actionData;

    try {
      console.log(`⚡ Processing action: ${nextAction} for SR #${requestNumber} (state: ${currentState})`);

      if (nextAction === 'send_acknowledgment_reminder') {
        // Check if we've exceeded max retries
        const maxRetries = maxRetryCount || 5; // Default to 5 if not configured
        const nextRetryAttempt = ackRetryCount + 1;

        if (nextRetryAttempt > maxRetries) {
          console.log(`⛔ Max retry count (${maxRetries}) exceeded for SR #${requestNumber}. Stopping acknowledgment reminders.`);

          // Update workflow state to stop sending reminders
          const pool = await getPool();
          await pool.query(`
            UPDATE service_request_workflow_state
            SET
              next_scheduled_action = NULL,
              next_scheduled_action_at = NULL
            WHERE service_request_id = $1
          `, [serviceRequestId]);

          return;
        }

        // Send acknowledgment reminder
        await handleAcknowledgmentTimeout(serviceRequestId, nextRetryAttempt);

        console.log(`✅ Sent acknowledgment reminder #${nextRetryAttempt} for SR #${requestNumber}`);

      } else if (nextAction === 'send_start_reminder') {
        // Check if we've exceeded max retries
        const maxRetries = maxRetryCount || 3; // Default to 3 for start reminders
        const nextRetryAttempt = startRetryCount + 1;

        if (nextRetryAttempt > maxRetries) {
          console.log(`⛔ Max retry count (${maxRetries}) exceeded for SR #${requestNumber}. Stopping start reminders.`);

          // Update workflow state to stop sending reminders
          const pool = await getPool();
          await pool.query(`
            UPDATE service_request_workflow_state
            SET
              next_scheduled_action = NULL,
              next_scheduled_action_at = NULL
            WHERE service_request_id = $1
          `, [serviceRequestId]);

          return;
        }

        // Send start reminder
        await handleStartTimeout(serviceRequestId, nextRetryAttempt);

        console.log(`✅ Sent start reminder #${nextRetryAttempt} for SR #${requestNumber}`);
      }

    } catch (error) {
      console.error(`❌ Error processing action for SR #${requestNumber}:`, error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      checkIntervalSeconds: this.checkIntervalMs / 1000
    };
  }
}

// Create singleton instance
export const workflowScheduler = new WorkflowScheduler();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, stopping workflow scheduler...');
  workflowScheduler.stop();
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, stopping workflow scheduler...');
  workflowScheduler.stop();
});
