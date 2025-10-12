import { alertHistoryService } from './services/alertHistoryService.js';
import { query } from './config/database.js';

async function triggerTestAlert() {
  try {
    // Get a random agent
    const agentResult = await query('SELECT id, device_name FROM agent_devices ORDER BY RANDOM() LIMIT 1');

    if (agentResult.rows.length === 0) {
      console.log('No agents found. Please add an agent first.');
      process.exit(1);
    }

    const agent = agentResult.rows[0];

    // Create test alert data with random severity
    const severities = ['low', 'medium', 'high', 'critical'];
    const severity = severities[Math.floor(Math.random() * severities.length)];

    const testAlertData = {
      agent_id: agent.id,
      configuration_id: null,
      alert_name: 'Test Alert - High CPU Utilization Detected',
      alert_type: 'high_utilization',
      severity: severity,
      indicator_count: 3,
      contributing_indicators: {
        rsi: { value: 85.5, threshold: 70, signal: 'overbought' },
        stochastic: { k: 92.3, d: 88.1, threshold: 80, signal: 'overbought' },
        williams_r: { value: -5.2, threshold: -20, signal: 'overbought' }
      },
      metric_values: {
        cpu_percent: 89.7,
        memory_percent: 72.3,
        disk_percent: 45.1
      },
      notify_email: false,
      notify_dashboard: true,
      notify_websocket: true,
    };

    console.log('Triggering test alert for agent:', agent.device_name);
    console.log('Severity:', severity.toUpperCase());

    const savedAlert = await alertHistoryService.saveAlert(testAlertData);

    console.log('Test alert created successfully!');
    console.log('Alert ID:', savedAlert.id);
    console.log('WebSocket notification sent to all admin users');

    process.exit(0);
  } catch (error) {
    console.error('Error triggering test alert:', error);
    process.exit(1);
  }
}

triggerTestAlert();
