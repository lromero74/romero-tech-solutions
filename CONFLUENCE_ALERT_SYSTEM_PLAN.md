# Indicator Confluence Alert System - Implementation Plan

## Overview
Create a comprehensive alert system that detects when multiple technical indicators signal similar conditions, with full admin dashboard management capabilities.

## Phase 1: Core Detection Engine ✅ (COMPLETED)

### Files Created:
- `src/utils/indicatorConfluence.ts` - Core confluence detection algorithm
- `src/components/admin/MetricsChartECharts/components/ConfluenceAlerts.tsx` - Visual alert display component

### Files Modified:
- `src/components/admin/MetricsChartECharts/hooks/useChartData.ts` - Added confluence analysis
- `src/components/admin/MetricsChartECharts/index.tsx` - Integrated ConfluenceAlerts component

### Current Status:
✅ Alert detection working in real-time
✅ Visual alerts display below toolbar
✅ Click to expand/collapse alert details
✅ Severity-based color coding (low/medium/high/critical)
✅ Indicator confluence counting
✅ Supports all chart types (line/candlestick/heiken-ashi)

### Detection Logic:
1. **RSI (Relative Strength Index)**
   - Oversold: <30 (moderate), <20 (extreme)
   - Overbought: >70 (moderate), >80 (extreme)

2. **Stochastic Oscillator**
   - Oversold: <20 (moderate), <10 (extreme)
   - Overbought: >80 (moderate), >90 (extreme)
   - Crossovers: K crossing D in extreme zones

3. **Williams %R**
   - Oversold: <-80 (moderate), <-90 (extreme)
   - Overbought: >-20 (moderate), >-10 (extreme)

4. **MACD**
   - Bullish crossover: MACD line crosses above signal line
   - Bearish crossover: MACD line crosses below signal line
   - Strong momentum: Histogram magnitude >50% of MACD line

5. **ROC (Rate of Change)**
   - Extreme values: >2x recent average (20-period)

6. **ATR (Average True Range)**
   - Volatility spike: >1.5x recent average (20-period)

### Severity Levels:
- **Low**: Not shown (single non-extreme indicator)
- **Medium**: 1 extreme indicator OR 2 indicators in confluence
- **High**: 3 indicators in confluence
- **Critical**: 4+ indicators in confluence

## Phase 2: Database Schema ✅ (COMPLETED)

### Files Created:
- `backend/migrations/038_alert_configurations.sql` - Alert configuration table
- `backend/migrations/039_alert_history.sql` - Alert history table and active_alerts view

### Table: `alert_configurations`
```sql
CREATE TABLE alert_configurations (
  id SERIAL PRIMARY KEY,

  -- Alert identification
  alert_name VARCHAR(100) NOT NULL,
  alert_type VARCHAR(50) NOT NULL, -- 'overbought', 'oversold', 'bullish', 'bearish', 'volatility_spike'
  enabled BOOLEAN DEFAULT true,

  -- Confluence settings
  min_indicator_count INTEGER DEFAULT 2, -- Minimum indicators needed for confluence
  require_extreme_for_single BOOLEAN DEFAULT true, -- Single indicator must be extreme

  -- Indicator-specific thresholds (JSON)
  rsi_thresholds JSONB DEFAULT '{
    "oversold_moderate": 30,
    "oversold_extreme": 20,
    "overbought_moderate": 70,
    "overbought_extreme": 80,
    "enabled": true
  }',

  stochastic_thresholds JSONB DEFAULT '{
    "oversold_moderate": 20,
    "oversold_extreme": 10,
    "overbought_moderate": 80,
    "overbought_extreme": 90,
    "detect_crossovers": true,
    "enabled": true
  }',

  williams_r_thresholds JSONB DEFAULT '{
    "oversold_moderate": -80,
    "oversold_extreme": -90,
    "overbought_moderate": -20,
    "overbought_extreme": -10,
    "enabled": true
  }',

  macd_settings JSONB DEFAULT '{
    "detect_crossovers": true,
    "momentum_threshold_multiplier": 0.5,
    "enabled": true
  }',

  roc_settings JSONB DEFAULT '{
    "extreme_multiplier": 2.0,
    "lookback_periods": 20,
    "enabled": true
  }',

  atr_settings JSONB DEFAULT '{
    "volatility_multiplier": 1.5,
    "lookback_periods": 20,
    "enabled": true
  }',

  -- Notification settings
  notify_email BOOLEAN DEFAULT false,
  notify_dashboard BOOLEAN DEFAULT true,
  notify_websocket BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES employees(id),
  updated_by INTEGER REFERENCES employees(id)
);

-- Default alert configurations
INSERT INTO alert_configurations (alert_name, alert_type) VALUES
  ('Overbought Confluence', 'overbought'),
  ('Oversold Confluence', 'oversold'),
  ('Bullish Momentum', 'bullish'),
  ('Bearish Momentum', 'bearish'),
  ('Volatility Spike', 'volatility_spike');
```

### Important Notes:
- ✅ **CASCADE DELETE**: When an agent is deleted, all its alert history is automatically deleted via `ON DELETE CASCADE`
- ✅ **SOFT DELETE**: Alert configurations are soft-deleted (disabled) to preserve historical references
- ✅ **NULL ON DELETE**: If alert config or employee is deleted, foreign keys are set to NULL to preserve history

### Table: `alert_history`
```sql
CREATE TABLE alert_history (
  id SERIAL PRIMARY KEY,

  -- Alert details
  alert_config_id INTEGER REFERENCES alert_configurations(id) ON DELETE SET NULL,
  agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE, -- Cascade delete when agent removed
  metric_type VARCHAR(50), -- 'cpu', 'memory', 'disk', 'network'

  -- Detection details
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
  indicator_count INTEGER NOT NULL,
  indicators_triggered JSONB NOT NULL, -- Array of {indicator, value, threshold, description}

  -- Alert state
  triggered_at TIMESTAMP DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  acknowledged_by INTEGER REFERENCES employees(id),
  resolved_at TIMESTAMP,

  -- Additional context
  metric_value NUMERIC,
  alert_title TEXT,
  alert_description TEXT,

  INDEX idx_agent_metric (agent_id, metric_type),
  INDEX idx_triggered_at (triggered_at),
  INDEX idx_severity (severity)
);
```

## Phase 3: Backend API Endpoints ✅ (COMPLETED)

### Files Created:
- `backend/services/alertConfigService.js` - Alert configuration service with caching
- `backend/services/alertHistoryService.js` - Alert history management service
- `backend/routes/admin/alerts.js` - Admin API routes for alert management

### Files Modified:
- `backend/server.js` - Added alert routes and configuration loading on startup

### API Endpoints Implemented:

#### Alert Configuration Management:
### GET `/api/admin/alerts/configurations`
- Fetch all alert configurations
- Filter by enabled/disabled
- Pagination support

### POST `/api/admin/alert-configurations`
- Create new alert configuration
- Validate thresholds and settings

### PUT `/api/admin/alert-configurations/:id`
- Update alert configuration
- Update `updated_at` and `updated_by`

### DELETE `/api/admin/alert-configurations/:id`
- Soft delete or hard delete alert configuration

### GET `/api/admin/alert-configurations/:id/thresholds`
- Get detailed threshold configuration for specific alert

### PUT `/api/admin/alert-configurations/:id/thresholds`
- Update thresholds for specific indicators
- Validate threshold values

### GET `/api/admin/alert-history`
- Fetch alert history with filters:
  - Date range
  - Agent ID
  - Metric type
  - Severity
  - Acknowledged/unacknowledged
- Pagination and sorting

### POST `/api/admin/alert-history/:id/acknowledge`
- Mark alert as acknowledged
- Record employee who acknowledged

### POST `/api/admin/alert-history/:id/resolve`
- Mark alert as resolved

### GET `/api/admin/alerts/active`
- Get currently active alerts (not resolved)
- Group by agent and metric type

## Phase 4: Admin Dashboard UI (TODO)

### 4.1 Alert Configuration Manager
**Location**: `/admin/settings/alerts` or new tab in admin dashboard

**Features**:
- List all alert configurations in a table
- Enable/disable toggle for each alert type
- Quick edit for common settings
- Full edit modal for advanced settings

**UI Components**:
```
┌─────────────────────────────────────────────────────────┐
│ Alert Configurations                           [+ New]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Alert Name        Type        Status    Actions │   │
│ ├─────────────────────────────────────────────────┤   │
│ │ Overbought        overbought  🟢 [Edit] [⚙️]   │   │
│ │ Confluence                                      │   │
│ │   └─ RSI: ≥70/80  Stoch: ≥80/90  WR: ≥-20/-10 │   │
│ │   └─ Min confluence: 2 indicators               │   │
│ ├─────────────────────────────────────────────────┤   │
│ │ Oversold          oversold    🟢 [Edit] [⚙️]   │   │
│ │ Confluence                                      │   │
│ │   └─ RSI: ≤30/20  Stoch: ≤20/10  WR: ≤-80/-90 │   │
│ │   └─ Min confluence: 2 indicators               │   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Alert Configuration Editor Modal
**Fields**:
- Alert name (text input)
- Alert type (dropdown: overbought, oversold, bullish, bearish, volatility_spike)
- Enabled toggle
- Minimum indicator count for confluence (number input)
- Require extreme for single indicator (checkbox)

**Per-Indicator Configuration** (accordion sections):

**RSI Configuration**:
- Enabled checkbox
- Oversold moderate threshold (0-100, default 30)
- Oversold extreme threshold (0-100, default 20)
- Overbought moderate threshold (0-100, default 70)
- Overbought extreme threshold (0-100, default 80)

**Stochastic Configuration**:
- Enabled checkbox
- Detect crossovers checkbox
- Oversold moderate threshold (0-100, default 20)
- Oversold extreme threshold (0-100, default 10)
- Overbought moderate threshold (0-100, default 80)
- Overbought extreme threshold (0-100, default 90)

**Williams %R Configuration**:
- Enabled checkbox
- Oversold moderate threshold (-100 to 0, default -80)
- Oversold extreme threshold (-100 to 0, default -90)
- Overbought moderate threshold (-100 to 0, default -20)
- Overbought extreme threshold (-100 to 0, default -10)

**MACD Configuration**:
- Enabled checkbox
- Detect crossovers checkbox
- Momentum threshold multiplier (0.1-2.0, default 0.5)

**ROC Configuration**:
- Enabled checkbox
- Extreme multiplier (1.0-5.0, default 2.0)
- Lookback periods (5-50, default 20)

**ATR Configuration**:
- Enabled checkbox
- Volatility multiplier (1.0-3.0, default 1.5)
- Lookback periods (5-50, default 20)

**Notification Settings**:
- Display on dashboard (checkbox)
- Send WebSocket notifications (checkbox)
- Send email notifications (checkbox, future enhancement)

### 4.3 Alert History Dashboard
**Location**: New tab in admin metrics view or separate route

**Features**:
- Real-time alert feed (WebSocket updates)
- Filter by:
  - Date range picker
  - Agent dropdown
  - Metric type dropdown
  - Severity dropdown
  - Acknowledged status
- Sort by triggered date, severity, agent
- Bulk acknowledge/resolve actions
- Export to CSV

**UI Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Alert History                                           │
├─────────────────────────────────────────────────────────┤
│ Filters: [Date Range] [Agent] [Metric] [Severity] [🔍] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🚨 CRITICAL • 2025-01-15 10:30:45            │   │
│ │ Agent: PROD-SERVER-01 • Metric: CPU          │   │
│ │                                               │   │
│ │ Overbought Confluence (4 indicators)          │   │
│ │ RSI: 85.3, Stochastic: 92.1, Williams %R...  │   │
│ │                                               │   │
│ │ [View Details] [Acknowledge] [✓ Resolved]    │   │
│ ├─────────────────────────────────────────────────┤   │
│ │ ⚠️ HIGH • 2025-01-15 10:15:22              │   │
│ │ Agent: WEB-SERVER-02 • Metric: Memory        │   │
│ │                                               │   │
│ │ Bearish Momentum (3 indicators)               │   │
│ │ MACD: Bearish crossover, Stochastic: 18.2... │   │
│ │                                               │   │
│ │ [View Details] [Acknowledge]                  │   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4.4 Live Alerts in Charts
**Integration**: MetricsChartECharts component

- Display ConfluenceAlerts component below chart toolbar
- Show active alerts for current metric/agent
- Click alert to expand and see indicator details
- Highlight alert severity with color coding
- Auto-refresh when new data arrives

## Phase 5: Real-Time Alert Processing (TODO)

### 5.1 Backend Alert Service
**File**: `backend/services/alertService.js`

**Functions**:
```javascript
// Load alert configurations from database
async function loadAlertConfigurations()

// Process metrics and detect confluence alerts
async function processMetricsForAlerts(agentId, metricType, indicators)

// Save triggered alert to history
async function saveAlertToHistory(alert, agentId, metricType, metricValue)

// Emit alert via WebSocket to connected admins
function emitAlertToAdmins(alert)

// Check if alert should be triggered (debounce repeated alerts)
function shouldTriggerAlert(agentId, metricType, alertType, lastAlertTime)
```

### 5.2 Integration with Metrics Pipeline
**Location**: Modify existing metrics ingestion

- After calculating technical indicators
- Before saving to database
- Call `processMetricsForAlerts()`
- If alerts detected:
  - Save to `alert_history`
  - Emit via WebSocket
  - Store in memory for quick access

### 5.3 WebSocket Events
```javascript
// Server emits
socket.emit('confluence_alert', {
  alertId: 123,
  agentId: 456,
  metricType: 'cpu',
  severity: 'critical',
  type: 'overbought',
  title: 'Confluence Alert: Overbought Condition',
  description: '4 indicators showing overbought: RSI, Stochastic, Williams %R, MACD',
  signals: [...],
  timestamp: '2025-01-15T10:30:45Z'
});

// Client listens
socket.on('confluence_alert', (alert) => {
  // Update UI with new alert
  // Show notification badge
  // Play sound (optional)
});
```

## Phase 6: Testing & Validation (TODO)

### 6.1 Unit Tests
- Test confluence detection algorithm
- Test threshold validation
- Test severity calculation
- Test signal grouping

### 6.2 Integration Tests
- Test API endpoints
- Test WebSocket events
- Test database operations
- Test alert persistence

### 6.3 UI Tests
- Test alert configuration UI
- Test alert history dashboard
- Test real-time updates
- Test filter and sort functionality

### 6.4 Performance Tests
- Test with high-frequency metrics (1-minute intervals)
- Test with many agents (100+)
- Test WebSocket scalability
- Optimize database queries

## Phase 7: Documentation (TODO)

### Admin User Guide
- How to configure alert thresholds
- Understanding indicator confluence
- Managing alert history
- Interpreting severity levels

### Developer Documentation
- Confluence detection algorithm explanation
- Adding new indicators
- Extending alert types
- WebSocket API reference

## Implementation Priority

**Session 1 (COMPLETED)** ✅:
1. ✅ Core detection algorithm (`src/utils/indicatorConfluence.ts`)
2. ✅ Visual alert component (`src/components/admin/MetricsChartECharts/components/ConfluenceAlerts.tsx`)
3. ✅ Integrate into MetricsChartECharts (modified `index.tsx` and `useChartData.ts`)
4. ✅ Database schema and migrations (038, 039)
5. ✅ Backend services (alertConfigService, alertHistoryService)
6. ✅ Backend API endpoints (`/api/admin/alerts/*`)
7. ✅ Server startup integration (loads configurations on boot)
8. ✅ Default configurations created (5 alert types)

**NEXT SESSION (Phase 4)**:
1. Admin configuration UI for managing alert thresholds
2. Alert history dashboard with filters
3. Real-time WebSocket notifications
4. Testing and validation

**MEDIUM-TERM**:
1. Real-time alert processing
2. WebSocket integration
3. Alert debouncing/throttling
4. Performance optimization

**LONG-TERM**:
1. Email notifications
2. Custom alert rules builder
3. Alert analytics and reporting
4. Machine learning for threshold optimization

## Notes

- All thresholds must be configurable via admin UI
- No hardcoded alert rules in frontend code
- Use database as single source of truth for configurations
- Support multiple alert profiles (default, aggressive, conservative)
- Allow per-agent alert overrides in the future
- Consider alert fatigue - implement smart throttling
