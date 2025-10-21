-- Migration 049: Alert Configuration Extensions for Client Notifications
-- Purpose: Add client-facing alert configuration and i18n support
-- Created: 2025-10-20

-- Add client visibility flag to alert configurations
ALTER TABLE alert_configurations
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS client_display_name_en VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_display_name_es VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_description_en TEXT,
  ADD COLUMN IF NOT EXISTS client_description_es TEXT;

-- Add escalation policy reference
ALTER TABLE alert_configurations
  ADD COLUMN IF NOT EXISTS escalation_policy_id INTEGER REFERENCES alert_escalation_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alert_config_client_visible ON alert_configurations(client_visible) WHERE client_visible = true;
CREATE INDEX IF NOT EXISTS idx_alert_config_escalation ON alert_configurations(escalation_policy_id);

COMMENT ON COLUMN alert_configurations.client_visible IS 'Whether clients should see this alert type in their dashboard';
COMMENT ON COLUMN alert_configurations.client_category IS 'Simplified category for clients: critical_issue, performance_degradation, security_alert';

-- Map existing alerts to client categories
UPDATE alert_configurations
SET
  client_visible = true,
  client_category = CASE
    WHEN alert_type = 'high_utilization' THEN 'performance_degradation'
    WHEN alert_type = 'volatility_spike' THEN 'critical_issue'
    WHEN alert_type = 'rising_trend' THEN 'performance_degradation'
    ELSE 'critical_issue'
  END,
  client_display_name_en = CASE
    WHEN alert_type = 'high_utilization' THEN 'High Resource Usage'
    WHEN alert_type = 'low_utilization' THEN 'Low Resource Usage'
    WHEN alert_type = 'rising_trend' THEN 'Resource Usage Increasing'
    WHEN alert_type = 'declining_trend' THEN 'Resource Usage Decreasing'
    WHEN alert_type = 'volatility_spike' THEN 'System Instability Detected'
  END,
  client_display_name_es = CASE
    WHEN alert_type = 'high_utilization' THEN 'Alto Uso de Recursos'
    WHEN alert_type = 'low_utilization' THEN 'Bajo Uso de Recursos'
    WHEN alert_type = 'rising_trend' THEN 'Uso de Recursos en Aumento'
    WHEN alert_type = 'declining_trend' THEN 'Uso de Recursos en Disminución'
    WHEN alert_type = 'volatility_spike' THEN 'Inestabilidad del Sistema Detectada'
  END,
  client_description_en = CASE
    WHEN alert_type = 'high_utilization' THEN 'Your system is experiencing high resource usage which may affect performance. Our technical team is monitoring the situation.'
    WHEN alert_type = 'volatility_spike' THEN 'Your system is showing unusual instability patterns that require attention. Our technical team is investigating.'
    WHEN alert_type = 'rising_trend' THEN 'Your system''s resource usage is steadily increasing. We are monitoring to ensure optimal performance.'
    WHEN alert_type = 'declining_trend' THEN 'Your system''s resource usage is decreasing, which may indicate reduced activity or potential issues.'
    ELSE 'System monitoring has detected an unusual pattern requiring review by our technical team.'
  END,
  client_description_es = CASE
    WHEN alert_type = 'high_utilization' THEN 'Su sistema está experimentando un alto uso de recursos que puede afectar el rendimiento. Nuestro equipo técnico está monitoreando la situación.'
    WHEN alert_type = 'volatility_spike' THEN 'Su sistema muestra patrones inusuales de inestabilidad que requieren atención. Nuestro equipo técnico está investigando.'
    WHEN alert_type = 'rising_trend' THEN 'El uso de recursos de su sistema está aumentando constantemente. Estamos monitoreando para garantizar un rendimiento óptimo.'
    WHEN alert_type = 'declining_trend' THEN 'El uso de recursos de su sistema está disminuyendo, lo que puede indicar actividad reducida o problemas potenciales.'
    ELSE 'El monitoreo del sistema ha detectado un patrón inusual que requiere revisión por nuestro equipo técnico.'
  END,
  escalation_policy_id = (SELECT id FROM alert_escalation_policies WHERE policy_name = 'Default Critical Alert Escalation')
WHERE alert_type IN ('high_utilization', 'volatility_spike', 'rising_trend');

-- Update metadata column
COMMENT ON TABLE alert_configurations IS 'Alert configurations with client-facing translations and escalation policies';
