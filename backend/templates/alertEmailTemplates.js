/**
 * Alert Email Templates
 * HTML and text templates for alert notifications
 * Supports English and Spanish languages
 */

import { alertTranslationService } from '../services/alertTranslationService.js';

/**
 * Generate HTML email template for employee alert
 * @param {object} alert - Alert details
 * @param {string} recipientName - Recipient name
 * @param {string} dashboardUrl - URL to alert dashboard
 * @returns {string} HTML email content
 */
export function buildEmployeeAlertHTML(alert, recipientName, dashboardUrl = 'https://romerotechsolutions.com/employees') {
  const t = alertTranslationService;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Alert</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .severity-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .severity-critical {
      background-color: #dc2626;
      color: #ffffff;
    }
    .severity-high {
      background-color: #ea580c;
      color: #ffffff;
    }
    .severity-medium {
      background-color: #f59e0b;
      color: #ffffff;
    }
    .severity-low {
      background-color: #10b981;
      color: #ffffff;
    }
    .content {
      padding: 30px 20px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .alert-details {
      background-color: #f9fafb;
      border-left: 4px solid #667eea;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .detail-row {
      display: flex;
      margin-bottom: 12px;
    }
    .detail-label {
      font-weight: 600;
      min-width: 140px;
      color: #6b7280;
    }
    .detail-value {
      color: #111827;
    }
    .technical-section {
      margin-top: 20px;
      padding: 16px;
      background-color: #fef3c7;
      border-radius: 4px;
      border-left: 4px solid #f59e0b;
    }
    .technical-section h3 {
      margin-top: 0;
      font-size: 14px;
      color: #92400e;
    }
    .technical-section pre {
      background-color: #ffffff;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.4;
    }
    .action-button {
      display: inline-block;
      background-color: #667eea;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin-top: 20px;
    }
    .action-button:hover {
      background-color: #5568d3;
    }
    .footer {
      background-color: #f9fafb;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 System Alert</h1>
      <span class="severity-badge severity-${alert.severity.toLowerCase()}">
        ${alert.severity.toUpperCase()}
      </span>
    </div>

    <div class="content">
      <p class="greeting">${t.t('en', 'greeting.employee', { name: recipientName })}</p>

      <p>${t.t('en', 'employee.intro')}</p>

      <div class="alert-details">
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.system')}:</span>
          <span class="detail-value">${alert.agent_name || 'Unknown'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.business')}:</span>
          <span class="detail-value">${alert.business_name || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.alert')}:</span>
          <span class="detail-value">${alert.alert_type.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.severity')}:</span>
          <span class="detail-value">${alert.severity}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.metric')}:</span>
          <span class="detail-value">${alert.metric_type.toUpperCase()}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.value')}:</span>
          <span class="detail-value">${Math.round(alert.metric_value)}%</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.detected')}:</span>
          <span class="detail-value">${t.formatDateTime(alert.triggered_at, 'en')}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t('en', 'labels.indicators')}:</span>
          <span class="detail-value">${alert.indicator_count}</span>
        </div>
      </div>

      ${alert.alert_description ? `<p><strong>${t.t('en', 'labels.description')}:</strong><br>${alert.alert_description}</p>` : ''}

      ${alert.indicators_triggered ? `
      <div class="technical-section">
        <h3>${t.t('en', 'labels.technicalDetails')}</h3>
        <pre>${JSON.stringify(JSON.parse(alert.indicators_triggered), null, 2)}</pre>
      </div>
      ` : ''}

      <p>${t.t('en', 'employee.acknowledgement')}</p>

      <a href="${dashboardUrl}" class="action-button">
        ${t.t('en', 'actions.viewDashboard')}
      </a>
    </div>

    <div class="footer">
      <p><strong>Romero Tech Solutions</strong></p>
      <p>Professional IT Support | Escondido, CA</p>
      <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate HTML email template for client alert
 * @param {object} alert - Alert details
 * @param {string} recipientName - Recipient name
 * @param {string} language - Language code ('en' or 'es')
 * @param {string} dashboardUrl - URL to client dashboard
 * @returns {string} HTML email content
 */
export function buildClientAlertHTML(alert, recipientName, language = 'en', dashboardUrl = 'https://romerotechsolutions.com/clogin') {
  const t = alertTranslationService;
  const lang = language === 'es' ? 'es' : 'en';

  const alertName = lang === 'es' ? alert.client_display_name_es : alert.client_display_name_en;
  const alertDescription = lang === 'es' ? alert.client_description_es : alert.client_description_en;

  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.t(lang, 'labels.alert')}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .severity-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .severity-critical {
      background-color: #dc2626;
      color: #ffffff;
    }
    .severity-high {
      background-color: #ea580c;
      color: #ffffff;
    }
    .severity-medium {
      background-color: #f59e0b;
      color: #ffffff;
    }
    .severity-low {
      background-color: #10b981;
      color: #ffffff;
    }
    .content {
      padding: 30px 20px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .intro-box {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .alert-details {
      background-color: #f9fafb;
      border-left: 4px solid #667eea;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .detail-row {
      margin-bottom: 12px;
    }
    .detail-label {
      font-weight: 600;
      color: #6b7280;
      display: block;
      margin-bottom: 4px;
    }
    .detail-value {
      color: #111827;
    }
    .impact-list {
      background-color: #eff6ff;
      padding: 16px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .impact-list h3 {
      margin-top: 0;
      font-size: 14px;
      color: #1e40af;
    }
    .impact-list ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .impact-list li {
      margin-bottom: 8px;
      color: #1e3a8a;
    }
    .action-button {
      display: inline-block;
      background-color: #667eea;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin-top: 20px;
    }
    .action-button:hover {
      background-color: #5568d3;
    }
    .footer {
      background-color: #f9fafb;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ ${t.t(lang, 'labels.alert')}</h1>
      <span class="severity-badge severity-${alert.severity.toLowerCase()}">
        ${t.getSeverity(alert.severity, lang)}
      </span>
    </div>

    <div class="content">
      <p class="greeting">${t.t(lang, 'greeting.customer')}</p>

      <div class="intro-box">
        <p><strong>${t.t(lang, 'client.intro')}</strong></p>
      </div>

      <div class="alert-details">
        <div class="detail-row">
          <span class="detail-label">${t.t(lang, 'labels.system')}:</span>
          <span class="detail-value">${alert.agent_name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t(lang, 'labels.alert')}:</span>
          <span class="detail-value">${alertName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t(lang, 'labels.severity')}:</span>
          <span class="detail-value">${t.getSeverity(alert.severity, lang)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${t.t(lang, 'labels.detected')}:</span>
          <span class="detail-value">${t.formatDateTime(alert.triggered_at, lang)}</span>
        </div>
      </div>

      <p><strong>${t.t(lang, 'labels.description')}:</strong></p>
      <p>${alertDescription}</p>

      <div class="impact-list">
        <h3>${t.t(lang, 'phrases.whatThisMeans')}</h3>
        <ul>
          <li>${t.t(lang, 'client.performanceImpact')}</li>
          <li>${t.t(lang, 'client.responseDelays')}</li>
          <li>${t.t(lang, 'phrases.noActionRequired')}</li>
        </ul>
      </div>

      <p>${t.t(lang, 'phrases.monitoringSituation')}</p>
      <p>${t.t(lang, 'phrases.pleaseContact')}</p>

      <a href="${dashboardUrl}" class="action-button">
        ${t.t(lang, 'actions.viewDashboard')}
      </a>
    </div>

    <div class="footer">
      <p><strong>Romero Tech Solutions</strong></p>
      <p>${lang === 'es' ? 'Soporte Profesional de TI | Escondido, CA' : 'Professional IT Support | Escondido, CA'}</p>
      <p>© 2025 Romero Tech Solutions. ${lang === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for employee alert
 * @param {object} alert - Alert details
 * @param {string} recipientName - Recipient name
 * @param {string} dashboardUrl - URL to alert dashboard
 * @returns {string} Plain text email content
 */
export function buildEmployeeAlertText(alert, recipientName, dashboardUrl = 'https://romerotechsolutions.com/employees') {
  const t = alertTranslationService;

  const indicatorDetails = alert.indicators_triggered
    ? JSON.stringify(JSON.parse(alert.indicators_triggered), null, 2)
    : 'No additional technical details';

  return `
SYSTEM ALERT - ${alert.severity.toUpperCase()}

${t.t('en', 'greeting.employee', { name: recipientName })}

${t.t('en', 'employee.intro')}

ALERT DETAILS:
--------------
${t.t('en', 'labels.system')}: ${alert.agent_name || 'Unknown'}
${t.t('en', 'labels.business')}: ${alert.business_name || 'N/A'}
${t.t('en', 'labels.alert')}: ${alert.alert_type.replace(/_/g, ' ').toUpperCase()}
${t.t('en', 'labels.severity')}: ${alert.severity}
${t.t('en', 'labels.metric')}: ${alert.metric_type.toUpperCase()}
${t.t('en', 'labels.value')}: ${Math.round(alert.metric_value)}%
${t.t('en', 'labels.detected')}: ${t.formatDateTime(alert.triggered_at, 'en')}
${t.t('en', 'labels.indicators')}: ${alert.indicator_count}

${alert.alert_description ? `DESCRIPTION:\n${alert.alert_description}\n` : ''}

TECHNICAL INDICATORS:
${indicatorDetails}

${t.t('en', 'employee.acknowledgement')}

${t.t('en', 'actions.viewDashboard')}: ${dashboardUrl}

---
Romero Tech Solutions
Professional IT Support | Escondido, CA
© 2025 Romero Tech Solutions. All rights reserved.
  `.trim();
}

/**
 * Generate plain text email for client alert
 * @param {object} alert - Alert details
 * @param {string} recipientName - Recipient name
 * @param {string} language - Language code ('en' or 'es')
 * @param {string} dashboardUrl - URL to client dashboard
 * @returns {string} Plain text email content
 */
export function buildClientAlertText(alert, recipientName, language = 'en', dashboardUrl = 'https://romerotechsolutions.com/clogin') {
  const t = alertTranslationService;
  const lang = language === 'es' ? 'es' : 'en';

  const alertName = lang === 'es' ? alert.client_display_name_es : alert.client_display_name_en;
  const alertDescription = lang === 'es' ? alert.client_description_es : alert.client_description_en;

  return `
${t.t(lang, 'labels.alert').toUpperCase()} - ${t.getSeverity(alert.severity, lang).toUpperCase()}

${t.t(lang, 'greeting.customer')}

${t.t(lang, 'client.intro')}

${t.t(lang, 'labels.system')}: ${alert.agent_name}
${t.t(lang, 'labels.alert')}: ${alertName}
${t.t(lang, 'labels.severity')}: ${t.getSeverity(alert.severity, lang)}
${t.t(lang, 'labels.detected')}: ${t.formatDateTime(alert.triggered_at, lang)}

${t.t(lang, 'labels.description')}:
${alertDescription}

${t.t(lang, 'phrases.whatThisMeans')}
- ${t.t(lang, 'client.performanceImpact')}
- ${t.t(lang, 'client.responseDelays')}
- ${t.t(lang, 'phrases.noActionRequired')}

${t.t(lang, 'phrases.monitoringSituation')}
${t.t(lang, 'phrases.pleaseContact')}

${t.t(lang, 'actions.viewDashboard')}: ${dashboardUrl}

---
Romero Tech Solutions
${lang === 'es' ? 'Soporte Profesional de TI | Escondido, CA' : 'Professional IT Support | Escondido, CA'}
© 2025 Romero Tech Solutions. ${lang === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}
  `.trim();
}
