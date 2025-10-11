# Hardware Temperature & Sensor Monitoring - Testing Guide

## Phase 8 Implementation Complete ✅

All code for hardware temperature and sensor monitoring has been implemented:

1. ✅ Database migration (034) - Added 9 sensor columns to agent_metrics table
2. ✅ Go sensor monitoring module - Cross-platform sensor reading (macOS/Linux/Windows)
3. ✅ Metrics integration - Sensor data collection with 10-minute cache
4. ✅ Backend API updates - Routes support sensor fields
5. ✅ TypeScript interfaces - SensorReading and extended AgentMetric
6. ✅ UI components - Temperature & Sensors card in AgentDetails.tsx

## Current Status

- **Agent binary**: Rebuilt at 22:04 (10:04 PM) with UPDATED macOS sensor code
- **macOS 26.x (Sequoia) Limitation**: ⚠️ Temperature monitoring NOT available on Apple Silicon Macs with macOS Sequoia
- **Tested on**: macOS 26.0.1, Apple M1 Pro - No sensor access available (even with sudo)
- **Metrics interval**: 10 minutes (600 seconds)
- **See**: `/Users/louis/New/01_Projects/RomeroTechSolutions/MACOS_SENSOR_SETUP.md` for detailed explanation

### ⚠️ macOS Sequoia Users

If you're running macOS 26.x (Sequoia) with Apple Silicon:
- Temperature monitoring will show "Sensor Data Unavailable"
- This is an **Apple platform limitation**, not a bug
- All attempts to access sensors return no data (osx-cpu-temp, powermetrics, sysctl, ioreg)
- The agent will continue to monitor all other metrics normally
- Temperature monitoring **will work** on Linux and Windows agents

## Testing Steps

### Step 1: Restart the Agent

Run the restart script to start the updated agent binary:

```bash
/tmp/restart-rts-agent.sh
```

This will:
- Stop the old agent (without sensor support)
- Start the new agent (with sensor support)
- Display the agent status

### Step 2: Monitor for Sensor Data Arrival

Run the monitoring script to check for sensor data:

```bash
/tmp/monitor-sensor-data.sh
```

Since the agent collects metrics every 10 minutes, you'll need to wait up to 10 minutes for the first sensor data to appear.

**Expected behavior:**
- First run: "⏳ No sensor data yet - waiting for next collection cycle..."
- After 10 minutes: "✅ SENSOR DATA FOUND!" with temperature and fan details

### Step 3: Verify Database Storage

Check that sensor data is properly stored:

```bash
cd /Users/louis/New/01_Projects/rts-agent-dev/backend
node -e "
const { Pool } = require('pg');
const AWS = require('aws-sdk');

async function query() {
  const secretsManager = new AWS.SecretsManager({ region: 'us-east-1' });
  const secret = await secretsManager.getSecretValue({ SecretId: 'rds!cluster-9e81a628-84ff-470b-be3c-30cbeb7a3b98' }).promise();
  const credentials = JSON.parse(secret.SecretString);

  const pool = new Pool({
    host: 'database-1.cluster-c4n0ok80kvqh.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'romerotechsolutions_dev',
    user: credentials.username,
    password: credentials.password,
  });

  const result = await pool.query(\`
    SELECT
      agent_device_id,
      cpu_temperature_c,
      gpu_temperature_c,
      highest_temperature_c,
      temperature_critical_count,
      fan_count,
      fan_speeds_rpm,
      fan_failure_count,
      sensor_data,
      collected_at
    FROM agent_metrics
    WHERE sensor_data IS NOT NULL
    ORDER BY collected_at DESC
    LIMIT 1
  \`);

  console.log('Latest sensor data:', JSON.stringify(result.rows[0], null, 2));
  await pool.end();
}

query().catch(console.error);
"
```

### Step 4: Verify API Endpoint

Test the metrics history endpoint returns sensor data:

```bash
# Get the agent device ID
AGENT_ID=$(node -e "
const { Pool } = require('pg');
const AWS = require('aws-sdk');

async function query() {
  const secretsManager = new AWS.SecretsManager({ region: 'us-east-1' });
  const secret = await secretsManager.getSecretValue({ SecretId: 'rds!cluster-9e81a628-84ff-470b-be3c-30cbeb7a3b98' }).promise();
  const credentials = JSON.parse(secret.SecretString);

  const pool = new Pool({
    host: 'database-1.cluster-c4n0ok80kvqh.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'romerotechsolutions_dev',
    user: credentials.username,
    password: credentials.password,
  });

  const result = await pool.query('SELECT id FROM agent_devices LIMIT 1');
  console.log(result.rows[0].id);
  await pool.end();
}

query().catch(console.error);
" 2>&1 | tail -1)

# Test the API endpoint
curl -s "http://localhost:3001/api/agents/${AGENT_ID}/metrics/history?hours=1" | jq '.data.metrics[0] | {cpu_temperature_c, gpu_temperature_c, highest_temperature_c, fan_count, sensor_data}'
```

### Step 5: Verify UI Display

1. Navigate to http://localhost:5173 (or your frontend dev server)
2. Log in as an employee with agent viewing permissions
3. Go to the agent monitoring page
4. Click on an agent to view details
5. Scroll to the "Hardware Temperature & Sensors" section

**Expected UI elements:**
- Summary statistics showing highest temp, CPU temp, GPU temp, critical sensors
- Fan status section with fan count, failures, and speeds
- Detailed sensor list sorted by criticality
- Critical temperature alert (if any sensor > 90°C)

### Step 6: Verify Agent Logs

Check the agent logs for sensor collection messages:

The agent should log sensor checks with the 🌡️ emoji:

```
🌡️  Sensor check: Highest temp: 45°C, Critical sensors: 0, Fans: 3 (0 failed)
```

## Troubleshooting

### No sensor data after 10 minutes

1. Check if the agent is running:
   ```bash
   ps aux | grep "[r]ts-agent"
   ```

2. Check if the new binary is being used:
   ```bash
   ls -lh /Users/louis/New/01_Projects/rts-monitoring-agent/bin/rts-agent
   # Should show timestamp of 21:45 or later
   ```

3. Check agent logs for errors (if available)

### Sensor data shows all null values

This is expected on systems without accessible hardware sensors. The sensor module will attempt to read sensors but may return empty data if:
- No lm-sensors installed (Linux)
- No sysctl access (macOS)
- No OpenHardwareMonitor running (Windows)

### UI not showing sensor card

1. Verify the frontend dev server is running
2. Clear browser cache and reload
3. Check browser console for JavaScript errors
4. Verify the agent has sensor data in the database first

## What Gets Collected

### macOS
- CPU temperature (via sysctl or powermetrics)
- GPU temperature (if available via powermetrics)
- Fan speeds (via powermetrics SMC sensors)

### Linux
- All thermal zones from lm-sensors or /sys/class/thermal
- Fan speeds from lm-sensors
- Temperature sensors: CPU, GPU, motherboard, drive temps

### Windows
- WMI thermal zone temperatures
- OpenHardwareMonitor data (if installed)
- CPU, GPU, motherboard temperatures

## Sensor Data Structure

```typescript
interface SensorReading {
  sensor_name: string;        // e.g., "CPU Temperature", "System Fan 1"
  sensor_type: string;        // temperature, fan, voltage
  value: number;              // numeric reading
  unit: string;               // C, RPM, V
  critical: boolean;          // true if > 90°C for temperature
  last_checked: string;       // ISO timestamp
}
```

## Database Columns Added

- `cpu_temperature_c` - CPU temperature in Celsius
- `gpu_temperature_c` - GPU temperature in Celsius
- `motherboard_temperature_c` - Motherboard temperature
- `highest_temperature_c` - Highest sensor reading
- `temperature_critical_count` - Number of sensors > 90°C
- `fan_count` - Total fans detected
- `fan_speeds_rpm` - Array of fan speeds in RPM
- `fan_failure_count` - Fans with RPM < 100
- `sensor_data` - JSONB array of all sensor readings

## Next Phase

Once testing is complete, Phase 9 will implement:
- **Event Log Critical Errors** - System log monitoring for critical errors and warnings
