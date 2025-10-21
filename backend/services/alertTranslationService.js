/**
 * Alert Translation Service
 * Specialized translation service for alert notifications
 * Uses in-memory translations for fast, consistent alert messaging
 */

/**
 * Alert notification translation strings
 * Organized by category for easy maintenance
 */
const translations = {
  en: {
    // Email subjects
    subject: {
      alert: 'Alert: {alertName} on {agentName}',
      escalation: 'Escalated: {alertName} on {agentName}',
      resolved: 'Resolved: {alertName} on {agentName}'
    },

    // Greetings and closings
    greeting: {
      formal: 'Dear {name},',
      customer: 'Dear Customer,',
      employee: 'Hello {name},'
    },
    closing: {
      formal: 'Best regards,',
      casual: 'Thanks,',
      signature: 'Romero Tech Solutions'
    },

    // Alert details labels
    labels: {
      system: 'System',
      business: 'Business',
      alert: 'Alert',
      severity: 'Severity',
      detected: 'Detected',
      metric: 'Metric',
      value: 'Value',
      indicators: 'Indicators Triggered',
      time: 'Time',
      description: 'Description',
      technicalDetails: 'Technical Details'
    },

    // Severity levels
    severity: {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    },

    // Alert categories (client-facing)
    category: {
      critical_issue: 'Critical Issue',
      performance_degradation: 'Performance Degradation',
      security_alert: 'Security Alert'
    },

    // Common phrases
    phrases: {
      monitoringSituation: 'Our technical team is monitoring the situation.',
      noActionRequired: 'No immediate action required from you.',
      pleaseContact: 'Please contact us if you have any concerns.',
      escalationNotice: 'This alert has been escalated due to no acknowledgment within {minutes} minutes.',
      resolvedNotice: 'This alert has been resolved.',
      whatThisMeans: 'What this means:',
      nextSteps: 'Next steps:',
      moreInfo: 'For more information, please visit your dashboard or contact support.'
    },

    // Client-specific messages
    client: {
      intro: "We've detected an issue with your monitored system that requires your attention.",
      performanceImpact: 'Your applications may run slower than usual',
      responseDelays: 'System response times may be delayed',
      serviceDegradation: 'Service quality may be temporarily affected',
      monitoringActive: 'We are actively monitoring and addressing this issue',
      teamInvestigating: 'Our technical team is investigating'
    },

    // Employee-specific messages
    employee: {
      intro: 'A system alert has been triggered and requires attention.',
      acknowledgement: 'Please acknowledge this alert in the admin dashboard.',
      viewDashboard: 'View details in the alert dashboard',
      escalationWarning: 'This alert will be escalated if not acknowledged within {minutes} minutes.'
    },

    // SMS templates (ultra-short)
    sms: {
      alert: '{severity} alert: {agentName} - {alertType}. Check dashboard.',
      escalation: 'ESCALATED: {agentName} - {alertType}. Acknowledge immediately.',
      resolved: 'RESOLVED: {agentName} - {alertType}.'
    },

    // Action buttons
    actions: {
      viewDashboard: 'View Dashboard',
      acknowledge: 'Acknowledge Alert',
      viewDetails: 'View Details',
      contactSupport: 'Contact Support'
    }
  },

  es: {
    // Email subjects
    subject: {
      alert: 'Alerta: {alertName} en {agentName}',
      escalation: 'Escalado: {alertName} en {agentName}',
      resolved: 'Resuelto: {alertName} en {agentName}'
    },

    // Greetings and closings
    greeting: {
      formal: 'Estimado/a {name},',
      customer: 'Estimado/a cliente,',
      employee: 'Hola {name},'
    },
    closing: {
      formal: 'Saludos cordiales,',
      casual: 'Gracias,',
      signature: 'Romero Tech Solutions'
    },

    // Alert details labels
    labels: {
      system: 'Sistema',
      business: 'Negocio',
      alert: 'Alerta',
      severity: 'Gravedad',
      detected: 'Detectado',
      metric: 'Métrica',
      value: 'Valor',
      indicators: 'Indicadores Activados',
      time: 'Hora',
      description: 'Descripción',
      technicalDetails: 'Detalles Técnicos'
    },

    // Severity levels
    severity: {
      critical: 'Crítico',
      high: 'Alto',
      medium: 'Medio',
      low: 'Bajo'
    },

    // Alert categories (client-facing)
    category: {
      critical_issue: 'Problema Crítico',
      performance_degradation: 'Degradación del Rendimiento',
      security_alert: 'Alerta de Seguridad'
    },

    // Common phrases
    phrases: {
      monitoringSituation: 'Nuestro equipo técnico está monitoreando la situación.',
      noActionRequired: 'No se requiere acción inmediata de su parte.',
      pleaseContact: 'Por favor contáctenos si tiene alguna inquietud.',
      escalationNotice: 'Esta alerta ha sido escalada debido a que no fue reconocida dentro de {minutes} minutos.',
      resolvedNotice: 'Esta alerta ha sido resuelta.',
      whatThisMeans: 'Qué significa esto:',
      nextSteps: 'Próximos pasos:',
      moreInfo: 'Para más información, por favor visite su panel de control o contacte con soporte.'
    },

    // Client-specific messages
    client: {
      intro: 'Hemos detectado un problema en su sistema monitoreado que requiere su atención.',
      performanceImpact: 'Sus aplicaciones pueden funcionar más lento de lo habitual',
      responseDelays: 'Los tiempos de respuesta del sistema pueden retrasarse',
      serviceDegradation: 'La calidad del servicio puede verse afectada temporalmente',
      monitoringActive: 'Estamos monitoreando activamente y abordando este problema',
      teamInvestigating: 'Nuestro equipo técnico está investigando'
    },

    // Employee-specific messages
    employee: {
      intro: 'Se ha activado una alerta del sistema que requiere atención.',
      acknowledgement: 'Por favor reconozca esta alerta en el panel de administración.',
      viewDashboard: 'Ver detalles en el panel de alertas',
      escalationWarning: 'Esta alerta será escalada si no se reconoce dentro de {minutes} minutos.'
    },

    // SMS templates (ultra-short)
    sms: {
      alert: 'Alerta {severity}: {agentName} - {alertType}. Revisar panel.',
      escalation: 'ESCALADO: {agentName} - {alertType}. Reconocer inmediatamente.',
      resolved: 'RESUELTO: {agentName} - {alertType}.'
    },

    // Action buttons
    actions: {
      viewDashboard: 'Ver Panel de Control',
      acknowledge: 'Reconocer Alerta',
      viewDetails: 'Ver Detalles',
      contactSupport: 'Contactar Soporte'
    }
  }
};

class AlertTranslationService {
  /**
   * Get translation string by key path
   * @param {string} language - Language code ('en' or 'es')
   * @param {string} keyPath - Dot notation path (e.g., 'subject.alert')
   * @param {object} variables - Variables to interpolate (e.g., {alertName: 'High CPU'})
   * @returns {string} - Translated string with variables replaced
   */
  t(language, keyPath, variables = {}) {
    // Validate language
    const lang = ['en', 'es'].includes(language) ? language : 'en';

    // Navigate to the translation value
    const keys = keyPath.split('.');
    let value = translations[lang];

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        console.warn(`Alert translation key not found: ${keyPath} (${lang})`);
        return keyPath; // Return key path if translation missing
      }
    }

    // Ensure we got a string
    if (typeof value !== 'string') {
      console.warn(`Alert translation key is not a string: ${keyPath} (${lang})`);
      return keyPath;
    }

    // Replace variables using {variableName} syntax
    return this.interpolate(value, variables);
  }

  /**
   * Interpolate variables into a string
   * @param {string} template - String with {variable} placeholders
   * @param {object} variables - Variables to replace
   * @returns {string}
   */
  interpolate(template, variables = {}) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  /**
   * Get translated severity level
   * @param {string} severity - Severity level ('critical', 'high', 'medium', 'low')
   * @param {string} language - Language code
   * @returns {string}
   */
  getSeverity(severity, language = 'en') {
    return this.t(language, `severity.${severity}`);
  }

  /**
   * Get translated alert category (client-facing)
   * @param {string} category - Category slug
   * @param {string} language - Language code
   * @returns {string}
   */
  getCategory(category, language = 'en') {
    return this.t(language, `category.${category}`);
  }

  /**
   * Format date/time for given language
   * @param {Date|string} date - Date to format
   * @param {string} language - Language code
   * @returns {string}
   */
  formatDateTime(date, language = 'en') {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const locale = language === 'es' ? 'es-ES' : 'en-US';

    return dateObj.toLocaleString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  /**
   * Format date only for given language
   * @param {Date|string} date - Date to format
   * @param {string} language - Language code
   * @returns {string}
   */
  formatDate(date, language = 'en') {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const locale = language === 'es' ? 'es-ES' : 'en-US';

    return dateObj.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Get all supported languages
   * @returns {Array}
   */
  getSupportedLanguages() {
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' }
    ];
  }

  /**
   * Get email subject template
   * @param {string} type - Subject type ('alert', 'escalation', 'resolved')
   * @param {string} language - Language code
   * @param {object} variables - Variables for interpolation
   * @returns {string}
   */
  getEmailSubject(type, language, variables) {
    return this.t(language, `subject.${type}`, variables);
  }

  /**
   * Get SMS template
   * @param {string} type - SMS type ('alert', 'escalation', 'resolved')
   * @param {string} language - Language code
   * @param {object} variables - Variables for interpolation
   * @returns {string}
   */
  getSMSTemplate(type, language, variables) {
    return this.t(language, `sms.${type}`, variables);
  }

  /**
   * Get greeting template
   * @param {string} type - Greeting type ('formal', 'customer', 'employee')
   * @param {string} language - Language code
   * @param {object} variables - Variables for interpolation
   * @returns {string}
   */
  getGreeting(type, language, variables = {}) {
    return this.t(language, `greeting.${type}`, variables);
  }

  /**
   * Get closing/signature
   * @param {string} language - Language code
   * @returns {string}
   */
  getClosing(language) {
    const closing = this.t(language, 'closing.formal');
    const signature = this.t(language, 'closing.signature');
    return `${closing}\n${signature}`;
  }

  /**
   * Validate language code
   * @param {string} language - Language code to validate
   * @returns {string} - Valid language code (defaults to 'en')
   */
  validateLanguage(language) {
    return ['en', 'es'].includes(language) ? language : 'en';
  }
}

// Export singleton instance
export const alertTranslationService = new AlertTranslationService();
