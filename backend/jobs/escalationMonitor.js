/**
 * Escalation Monitor Job
 * Scheduled job that runs every 5 minutes to check for alerts needing escalation
 */

import cron from 'node-cron';
import { alertEscalationService } from '../services/alertEscalationService.js';

class EscalationMonitor {
  constructor() {
    this.task = null;
    this.isRunning = false;
  }

  /**
   * Start the escalation monitor
   */
  start() {
    if (this.task) {
      console.log('⚠️  Escalation monitor is already running');
      return;
    }

    // Run every 5 minutes: */5 * * * *
    // For testing, you can use: * * * * * (every minute)
    const cronSchedule = process.env.ESCALATION_CHECK_INTERVAL || '*/5 * * * *';

    console.log(`🚀 Starting escalation monitor (schedule: ${cronSchedule})`);

    this.task = cron.schedule(cronSchedule, async () => {
      await this.runCheck();
    });

    console.log('✅ Escalation monitor started successfully');

    // Run an initial check on startup (after 10 seconds to let server fully initialize)
    setTimeout(() => {
      console.log('🔍 Running initial escalation check...');
      this.runCheck();
    }, 10000);
  }

  /**
   * Stop the escalation monitor
   */
  stop() {
    if (this.task) {
      console.log('🛑 Stopping escalation monitor...');
      this.task.stop();
      this.task = null;
      console.log('✅ Escalation monitor stopped');
    }
  }

  /**
   * Run the escalation check
   */
  async runCheck() {
    // Prevent concurrent runs
    if (this.isRunning) {
      console.log('⏭️  Skipping escalation check - previous check still running');
      return;
    }

    this.isRunning = true;

    try {
      const startTime = Date.now();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔔 ESCALATION CHECK STARTED - ${new Date().toISOString()}`);
      console.log(`${'='.repeat(60)}`);

      const result = await alertEscalationService.checkForEscalation();

      const duration = Date.now() - startTime;

      console.log(`${'='.repeat(60)}`);
      console.log(`✅ ESCALATION CHECK COMPLETE - Duration: ${duration}ms`);
      console.log(`   Alerts Checked: ${result.checked}`);
      console.log(`   Escalations Triggered: ${result.escalated}`);
      console.log(`${'='.repeat(60)}\n`);
    } catch (error) {
      console.error('❌ Error during escalation check:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      running: this.task !== null,
      currentlyChecking: this.isRunning,
    };
  }
}

// Export singleton instance
const escalationMonitor = new EscalationMonitor();
export default escalationMonitor;
