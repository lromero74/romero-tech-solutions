# macOS Temperature Sensor Monitoring - Setup Guide

## ⚠️ IMPORTANT: macOS Sequoia (26.x) Limitation

**Temperature monitoring is NOT available on macOS 26.x (Sequoia) with Apple Silicon.**

Apple has completely removed third-party sensor access on newer macOS versions. Even with sudo privileges:
- ❌ `osx-cpu-temp` returns 0.0°C
- ❌ `powermetrics --samplers smc` returns no temperature data
- ❌ `sysctl` thermal levels don't exist
- ❌ `ioreg` exposes no temperature values
- ❌ `asitop` can't access sensor data (it wraps powermetrics)

**Affected Systems:**
- macOS 26.x (Sequoia) + Apple Silicon (M1/M2/M3/M4)
- Possibly macOS 25.x (Sonoma) on newer hardware

**Unaffected Systems:**
- Intel-based Macs (may still have limited sensor access)
- Older macOS versions (Monterey, Big Sur, Catalina)

**The monitoring agent will:**
- ✅ Attempt all available sensor detection methods
- ✅ Gracefully handle missing sensors
- ✅ Display "Sensor Data Unavailable" message in UI
- ✅ Continue monitoring all other metrics (CPU, memory, disk, network)

## Alternative: Older macOS or Intel Macs

If you're on an Intel Mac or older macOS version, try:

### Option 1: osx-cpu-temp (Intel Macs)

```bash
brew install osx-cpu-temp
```

**Features:**
- ✅ No sudo required
- ✅ Fast execution (<100ms)
- ✅ Accurate CPU temperature readings
- ✅ Works on Intel Macs

## Alternative Tools

### Option 2: iStats (Comprehensive)

```bash
gem install iStats
```

**Provides:**
- CPU temperature
- GPU temperature (if available)
- Fan speeds
- Battery temperature
- More detailed sensor info

### Option 3: powermetrics (Built-in, requires sudo)

```bash
sudo powermetrics --samplers smc -i 1000 -n 1
```

**Note:** Already installed on macOS, but:
- ❌ Requires sudo password
- ❌ Not ideal for automated monitoring
- ❌ Slower execution

## Updated Sensor Detection Priority

The RTS monitoring agent now checks sensors in this order:

1. **osx-cpu-temp** (preferred)
2. **iStats** (fallback)
3. **powermetrics** (with sudo -n, if available)
4. **sysctl thermal levels** (thermal pressure estimates)
5. **ioreg** (limited IOKit data)

## Testing After Installation

### Step 1: Install the Tool

```bash
# Recommended
brew install osx-cpu-temp

# Or alternative
gem install iStats
```

### Step 2: Verify Tool Works

```bash
# Test osx-cpu-temp
osx-cpu-temp
# Expected output: "61.8°C" (or similar)

# Or test iStats
istats cpu temp --value-only
# Expected output: "61.8" (or similar)
```

### Step 3: Rebuild the Agent

The sensor code has been updated to detect these tools. Rebuild the agent binary:

```bash
cd /Users/louis/New/01_Projects/rts-monitoring-agent
go build -o bin/rts-agent cmd/rts-agent/main.go
```

### Step 4: Restart the Agent

Use the restart script:

```bash
/tmp/restart-rts-agent.sh
```

Or manually:

```bash
# Kill old agent
pkill -f rts-agent

# Start new agent (runs in background)
cd /Users/louis/New/01_Projects/rts-monitoring-agent
nohup ./bin/rts-agent > /tmp/rts-agent.log 2>&1 &
```

### Step 5: Monitor for Sensor Data

Wait up to 10 minutes for the next metrics collection cycle, then check:

```bash
/tmp/monitor-sensor-data.sh
```

**Expected output:**
```
✅ SENSOR DATA FOUND!

Latest sensor data (collected at 2025-10-10T05:13:45.123Z):
  CPU Temperature: 62°C
  Highest Temperature: 62°C
  Critical Sensors: 0
  Fans: 0
```

## Troubleshooting

### Tool not found after installation

**For Homebrew:**
```bash
# Check if installed
brew list | grep osx-cpu-temp

# Verify it's in PATH
which osx-cpu-temp

# If not in PATH, find it
brew --prefix osx-cpu-temp
# Add to PATH if needed
```

**For Ruby gems:**
```bash
# Check if installed
gem list | grep iStats

# Verify it's in PATH
which istats

# If not found, use full path
gem environment | grep "EXECUTABLE DIRECTORY"
```

### Agent still shows "Sensor Data Unavailable"

1. **Verify tool works independently:**
   ```bash
   osx-cpu-temp
   ```

2. **Check agent logs for errors:**
   ```bash
   tail -50 /tmp/rts-agent.log
   ```

3. **Rebuild agent to pick up new sensor code:**
   ```bash
   cd /Users/louis/New/01_Projects/rts-monitoring-agent
   go build -o bin/rts-agent cmd/rts-agent/main.go
   ```

4. **Ensure agent binary is updated:**
   ```bash
   ls -lh /Users/louis/New/01_Projects/rts-monitoring-agent/bin/rts-agent
   # Check timestamp is recent
   ```

### Still showing zeros after installation

- **Wait for next collection cycle** (metrics collected every 10 minutes)
- **Force immediate collection** by restarting the agent
- **Check database** to verify sensor_data is being stored

## What Gets Monitored

### With osx-cpu-temp:
- CPU temperature in Celsius
- Critical alerts (>90°C)

### With iStats (more comprehensive):
- CPU temperature
- GPU temperature (if available)
- Fan speeds (if available)
- Battery temperature

### Expected UI Display:

Once sensor data is collected, the AgentDetails page will show:

```
Hardware Temperature & Sensors
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Summary
  Highest Temp: 62°C
  CPU Temp: 62°C
  GPU Temp: --
  Critical Sensors: 0

✅ All sensors normal

📋 All Sensors (1)
  CPU Temperature
  62°C • Normal
```

## Next Steps After Setup

1. Install tool: `brew install osx-cpu-temp`
2. Verify tool: `osx-cpu-temp`
3. Rebuild agent: `go build -o bin/rts-agent cmd/rts-agent/main.go`
4. Restart agent: `/tmp/restart-rts-agent.sh`
5. Wait 10 minutes or monitor: `/tmp/monitor-sensor-data.sh`
6. Check UI: Navigate to agent details page

## Platform-Specific Notes

### Intel Macs:
- osx-cpu-temp provides accurate CPU package temperature
- Fan speeds may be available via iStats

### Apple Silicon (M1/M2/M3):
- osx-cpu-temp provides CPU efficiency/performance core temps
- GPU temperature may be available via iStats
- Some sensors exposed via ioreg (parsed as fallback)

### macOS Limitations:
- No direct SMC access without elevated permissions
- Apple restricts low-level hardware access for security
- Third-party tools use approved APIs (sysctl, IOKit)
- Some sensors may not be exposed at all
