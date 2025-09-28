#!/usr/bin/env node

import { getPool } from '../config/database.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Helper function to flatten nested translation objects
function flattenTranslations(obj, prefix = '') {
  const flattened = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenTranslations(obj[key], newKey));
      } else {
        // Leaf node - store the translation
        flattened[newKey] = obj[key];
      }
    }
  }

  return flattened;
}

// English translations
const englishTranslations = {
  // General UI
  'general.loading': 'Loading...',
  'general.save': 'Save',
  'general.cancel': 'Cancel',
  'general.delete': 'Delete',
  'general.edit': 'Edit',
  'general.add': 'Add',
  'general.back': 'Back',
  'general.next': 'Next',
  'general.previous': 'Previous',
  'general.close': 'Close',
  'general.confirm': 'Confirm',
  'general.yes': 'Yes',
  'general.no': 'No',
  'general.success': 'Success',
  'general.error': 'Error',
  'general.warning': 'Warning',
  'general.info': 'Information',

  // Client Dashboard
  'dashboard.title': 'Client Dashboard',
  'dashboard.welcome': 'Welcome back',
  'dashboard.quickActions': 'Quick Actions',
  'dashboard.overview': 'Overview',
  'dashboard.stats.locations': 'Locations',
  'dashboard.stats.activeRequests': 'Active Requests',
  'dashboard.stats.storageUsed': 'Storage Used',
  'dashboard.stats.availableSpace': 'Available Space',
  'dashboard.nav.dashboard': 'Dashboard',
  'dashboard.nav.locations': 'Service Locations',
  'dashboard.nav.schedule': 'Schedule Service',
  'dashboard.nav.requests': 'Service Requests',
  'dashboard.nav.files': 'File Storage',
  'dashboard.nav.settings': 'Settings',

  // Service Scheduling
  'schedule.title': 'Schedule Service Request',
  'schedule.selectDate': 'Select Date',
  'schedule.selectTime': 'Select Time & Duration',
  'schedule.selectLocation': 'Select Location',
  'schedule.selectUrgency': 'Select Urgency',
  'schedule.serviceType': 'Service Type',
  'schedule.description': 'Description',
  'schedule.contactInfo': 'Contact Information',
  'schedule.serviceDuration': 'Service Duration',
  'schedule.standardHours': 'Standard hours',
  'schedule.premiumPricing': 'Premium pricing applies for after-hours service',
  'schedule.selected': 'Selected',
  'schedule.hour': 'hour',
  'schedule.hours': 'hours',
  'schedule.urgency.normal': 'Normal',
  'schedule.urgency.priority': 'Priority',
  'schedule.urgency.emergency': 'Emergency',
  'schedule.urgency.normalDesc': '24-hour lead time',
  'schedule.urgency.priorityDesc': '4-hour lead time',
  'schedule.urgency.emergencyDesc': '1-hour lead time',
  'schedule.contact.name': 'Contact Name',
  'schedule.contact.phone': 'Phone Number',
  'schedule.contact.email': 'Email Address',
  'schedule.contact.namePlaceholder': 'Enter contact name',
  'schedule.contact.phonePlaceholder': 'Enter phone number',
  'schedule.contact.emailPlaceholder': 'Enter email address',
  'schedule.buttons.scheduleRequest': 'Schedule Request',
  'schedule.buttons.backToForm': 'Back to Form',
  'schedule.buttons.scheduleAnother': 'Schedule Another',
  'schedule.messages.submitting': 'Submitting request...',
  'schedule.messages.success': 'Service request scheduled successfully!',
  'schedule.messages.error': 'Failed to schedule service request',
  'schedule.messages.allFieldsRequired': 'All fields are required',
  'schedule.messages.requestDetails': 'Request Details',

  // Service Locations
  'locations.title': 'Service Locations',
  'locations.noLocations': 'No accessible locations found.',
  'locations.address': 'Address',
  'locations.contact': 'Contact',
  'locations.role': 'Role',
  'locations.primary': 'Primary',

  // File Manager
  'files.title': 'File Manager',
  'files.uploadFiles': 'Upload Files',
  'files.noFiles': 'No files uploaded yet',
  'files.noFilesSearch': 'No files found matching your search',
  'files.searchFiles': 'Search files...',
  'files.details.file': 'File',
  'files.details.size': 'Size',
  'files.details.uploaded': 'Uploaded',
  'files.details.location': 'Location',
  'files.details.actions': 'Actions',
  'files.details.allLocations': 'All Locations',
  'files.upload.title': 'Upload Files',
  'files.upload.dragDrop': 'Drag and drop files here, or click to select',
  'files.upload.selectFiles': 'Select Files',
  'files.upload.maxSize': 'Maximum file size',
  'files.upload.allowedTypes': 'Allowed file types',
  'files.upload.uploading': 'Uploading',
  'files.upload.virusScanning': 'Virus Scanning',
  'files.upload.completing': 'Completing',
  'files.upload.uploadComplete': 'Upload Complete',
  'files.upload.quotaExceeded': 'Upload would exceed storage quota',
  'files.upload.quotaWarning': 'Approaching storage limit',
  'files.upload.uploadFailed': 'Upload failed',
  'files.actions.viewDownload': 'View/Download',
  'files.actions.delete': 'Delete',
  'files.actions.confirmDelete': 'Are you sure you want to delete this file?',
  'files.actions.deleteFailed': 'Failed to delete file',
  'files.storage.quotaUsed': 'Storage Used',
  'files.storage.totalFiles': 'Total Files',
  'files.storage.availableSpace': 'Available Space',

  // Settings
  'settings.title': 'Account Settings',
  'settings.profile': 'Profile',
  'settings.password': 'Password',
  'settings.security': 'Security',
  'settings.profileSection.firstName': 'First Name',
  'settings.profileSection.lastName': 'Last Name',
  'settings.profileSection.email': 'Email Address',
  'settings.profileSection.phone': 'Phone Number',
  'settings.profileSection.firstNamePlaceholder': 'Enter first name',
  'settings.profileSection.lastNamePlaceholder': 'Enter last name',
  'settings.profileSection.emailPlaceholder': 'Enter email address',
  'settings.profileSection.phonePlaceholder': 'Enter phone number',
  'settings.profileSection.saveChanges': 'Save Changes',
  'settings.profileSection.updateSuccess': 'Contact information updated successfully',
  'settings.profileSection.updateError': 'Failed to update contact information',
  'settings.profileSection.emailInUse': 'Email address is already in use',
  'settings.profileSection.invalidEmail': 'Invalid email format',
  'settings.profileSection.requiredFields': 'First name, last name, and email are required',

  // Authentication
  'auth.logout': 'Logout',
  'auth.login': 'Login',
  'auth.loginTitle': 'Client Login',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.forgotPassword': 'Forgot Password?',
  'auth.signIn': 'Sign In',
  'auth.loggingIn': 'Logging in...',
  'auth.invalidCredentials': 'Invalid email or password',
  'auth.loginError': 'Login failed. Please try again.',
  'auth.emailRequired': 'Email is required',
  'auth.passwordRequired': 'Password is required',

  // Language
  'language.selectLanguage': 'Select Language',
  'language.english': 'English',
  'language.spanish': 'Español',

  // Time formats
  'time.am': 'AM',
  'time.pm': 'PM',
  'time.today': 'Today',
  'time.yesterday': 'Yesterday',
  'time.tomorrow': 'Tomorrow',

  // Error messages
  'errors.networkError': 'Network error. Please check your connection.',
  'errors.serverError': 'Server error. Please try again later.',
  'errors.unknownError': 'An unknown error occurred.',
  'errors.unauthorized': 'You are not authorized to perform this action.',
  'errors.forbidden': 'Access forbidden.',
  'errors.notFound': 'The requested resource was not found.',
  'errors.validationError': 'Please check your input and try again.'
};

// Spanish translations
const spanishTranslations = {
  // General UI
  'general.loading': 'Cargando...',
  'general.save': 'Guardar',
  'general.cancel': 'Cancelar',
  'general.delete': 'Eliminar',
  'general.edit': 'Editar',
  'general.add': 'Agregar',
  'general.back': 'Atrás',
  'general.next': 'Siguiente',
  'general.previous': 'Anterior',
  'general.close': 'Cerrar',
  'general.confirm': 'Confirmar',
  'general.yes': 'Sí',
  'general.no': 'No',
  'general.success': 'Éxito',
  'general.error': 'Error',
  'general.warning': 'Advertencia',
  'general.info': 'Información',

  // Client Dashboard
  'dashboard.title': 'Panel del Cliente',
  'dashboard.welcome': 'Bienvenido de nuevo',
  'dashboard.quickActions': 'Acciones Rápidas',
  'dashboard.overview': 'Resumen',
  'dashboard.stats.locations': 'Ubicaciones',
  'dashboard.stats.activeRequests': 'Solicitudes Activas',
  'dashboard.stats.storageUsed': 'Almacenamiento Usado',
  'dashboard.stats.availableSpace': 'Espacio Disponible',
  'dashboard.nav.dashboard': 'Panel',
  'dashboard.nav.locations': 'Ubicaciones de Servicio',
  'dashboard.nav.schedule': 'Programar Servicio',
  'dashboard.nav.requests': 'Solicitudes de Servicio',
  'dashboard.nav.files': 'Almacenamiento de Archivos',
  'dashboard.nav.settings': 'Configuración',

  // Service Scheduling
  'schedule.title': 'Programar Solicitud de Servicio',
  'schedule.selectDate': 'Seleccionar Fecha',
  'schedule.selectTime': 'Seleccionar Hora y Duración',
  'schedule.selectLocation': 'Seleccionar Ubicación',
  'schedule.selectUrgency': 'Seleccionar Urgencia',
  'schedule.serviceType': 'Tipo de Servicio',
  'schedule.description': 'Descripción',
  'schedule.contactInfo': 'Información de Contacto',
  'schedule.serviceDuration': 'Duración del Servicio',
  'schedule.standardHours': 'Horario estándar',
  'schedule.premiumPricing': 'Se aplican tarifas premium para servicios fuera del horario',
  'schedule.selected': 'Seleccionado',
  'schedule.hour': 'hora',
  'schedule.hours': 'horas',
  'schedule.urgency.normal': 'Normal',
  'schedule.urgency.priority': 'Prioridad',
  'schedule.urgency.emergency': 'Emergencia',
  'schedule.urgency.normalDesc': 'Tiempo de espera de 24 horas',
  'schedule.urgency.priorityDesc': 'Tiempo de espera de 4 horas',
  'schedule.urgency.emergencyDesc': 'Tiempo de espera de 1 hora',
  'schedule.contact.name': 'Nombre de Contacto',
  'schedule.contact.phone': 'Número de Teléfono',
  'schedule.contact.email': 'Dirección de Correo',
  'schedule.contact.namePlaceholder': 'Ingrese nombre de contacto',
  'schedule.contact.phonePlaceholder': 'Ingrese número de teléfono',
  'schedule.contact.emailPlaceholder': 'Ingrese dirección de correo',
  'schedule.buttons.scheduleRequest': 'Programar Solicitud',
  'schedule.buttons.backToForm': 'Volver al Formulario',
  'schedule.buttons.scheduleAnother': 'Programar Otra',
  'schedule.messages.submitting': 'Enviando solicitud...',
  'schedule.messages.success': '¡Solicitud de servicio programada exitosamente!',
  'schedule.messages.error': 'Error al programar solicitud de servicio',
  'schedule.messages.allFieldsRequired': 'Todos los campos son obligatorios',
  'schedule.messages.requestDetails': 'Detalles de la Solicitud',

  // Service Locations
  'locations.title': 'Ubicaciones de Servicio',
  'locations.noLocations': 'No se encontraron ubicaciones accesibles.',
  'locations.address': 'Dirección',
  'locations.contact': 'Contacto',
  'locations.role': 'Rol',
  'locations.primary': 'Principal',

  // File Manager
  'files.title': 'Gestor de Archivos',
  'files.uploadFiles': 'Subir Archivos',
  'files.noFiles': 'No hay archivos subidos aún',
  'files.noFilesSearch': 'No se encontraron archivos que coincidan con su búsqueda',
  'files.searchFiles': 'Buscar archivos...',
  'files.details.file': 'Archivo',
  'files.details.size': 'Tamaño',
  'files.details.uploaded': 'Subido',
  'files.details.location': 'Ubicación',
  'files.details.actions': 'Acciones',
  'files.details.allLocations': 'Todas las Ubicaciones',
  'files.upload.title': 'Subir Archivos',
  'files.upload.dragDrop': 'Arrastra y suelta archivos aquí, o haz clic para seleccionar',
  'files.upload.selectFiles': 'Seleccionar Archivos',
  'files.upload.maxSize': 'Tamaño máximo de archivo',
  'files.upload.allowedTypes': 'Tipos de archivo permitidos',
  'files.upload.uploading': 'Subiendo',
  'files.upload.virusScanning': 'Escaneando Virus',
  'files.upload.completing': 'Completando',
  'files.upload.uploadComplete': 'Subida Completa',
  'files.upload.quotaExceeded': 'La subida excedería la cuota de almacenamiento',
  'files.upload.quotaWarning': 'Acercándose al límite de almacenamiento',
  'files.upload.uploadFailed': 'Error en la subida',
  'files.actions.viewDownload': 'Ver/Descargar',
  'files.actions.delete': 'Eliminar',
  'files.actions.confirmDelete': '¿Está seguro de que desea eliminar este archivo?',
  'files.actions.deleteFailed': 'Error al eliminar archivo',
  'files.storage.quotaUsed': 'Almacenamiento Usado',
  'files.storage.totalFiles': 'Total de Archivos',
  'files.storage.availableSpace': 'Espacio Disponible',

  // Settings
  'settings.title': 'Configuración de Cuenta',
  'settings.profile': 'Perfil',
  'settings.password': 'Contraseña',
  'settings.security': 'Seguridad',
  'settings.profileSection.firstName': 'Nombre',
  'settings.profileSection.lastName': 'Apellido',
  'settings.profileSection.email': 'Dirección de Correo',
  'settings.profileSection.phone': 'Número de Teléfono',
  'settings.profileSection.firstNamePlaceholder': 'Ingrese nombre',
  'settings.profileSection.lastNamePlaceholder': 'Ingrese apellido',
  'settings.profileSection.emailPlaceholder': 'Ingrese dirección de correo',
  'settings.profileSection.phonePlaceholder': 'Ingrese número de teléfono',
  'settings.profileSection.saveChanges': 'Guardar Cambios',
  'settings.profileSection.updateSuccess': 'Información de contacto actualizada exitosamente',
  'settings.profileSection.updateError': 'Error al actualizar información de contacto',
  'settings.profileSection.emailInUse': 'La dirección de correo ya está en uso',
  'settings.profileSection.invalidEmail': 'Formato de correo inválido',
  'settings.profileSection.requiredFields': 'Nombre, apellido y correo son obligatorios',

  // Authentication
  'auth.logout': 'Cerrar Sesión',
  'auth.login': 'Iniciar Sesión',
  'auth.loginTitle': 'Acceso de Cliente',
  'auth.email': 'Correo',
  'auth.password': 'Contraseña',
  'auth.forgotPassword': '¿Olvidaste tu contraseña?',
  'auth.signIn': 'Acceder',
  'auth.loggingIn': 'Iniciando sesión...',
  'auth.invalidCredentials': 'Correo o contraseña inválidos',
  'auth.loginError': 'Error al iniciar sesión. Por favor intente de nuevo.',
  'auth.emailRequired': 'El correo es obligatorio',
  'auth.passwordRequired': 'La contraseña es obligatoria',

  // Language
  'language.selectLanguage': 'Seleccionar Idioma',
  'language.english': 'English',
  'language.spanish': 'Español',

  // Time formats
  'time.am': 'AM',
  'time.pm': 'PM',
  'time.today': 'Hoy',
  'time.yesterday': 'Ayer',
  'time.tomorrow': 'Mañana',

  // Error messages
  'errors.networkError': 'Error de red. Por favor verifique su conexión.',
  'errors.serverError': 'Error del servidor. Por favor intente más tarde.',
  'errors.unknownError': 'Ocurrió un error desconocido.',
  'errors.unauthorized': 'No está autorizado para realizar esta acción.',
  'errors.forbidden': 'Acceso prohibido.',
  'errors.notFound': 'El recurso solicitado no fue encontrado.',
  'errors.validationError': 'Por favor verifique su información e intente de nuevo.'
};

async function populateTranslations() {
  let pool;

  try {
    console.log('🚀 Starting translation population...');
    pool = await getPool();

    // First, run the translation system migration
    console.log('📊 Running translation system migration...');
    const migrationSQL = readFileSync(
      join(process.cwd(), 'migrations/007_translation_system.sql'),
      'utf8'
    );
    await pool.query(migrationSQL);
    console.log('✅ Translation system migration completed');

    // Populate English translations
    console.log('🇺🇸 Populating English translations...');
    const englishJSON = JSON.stringify(englishTranslations);
    const englishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'en', englishJSON]
    );
    console.log(`✅ Inserted ${englishResult.rows[0].insert_translation_batch} English translations`);

    // Populate Spanish translations
    console.log('🇪🇸 Populating Spanish translations...');
    const spanishJSON = JSON.stringify(spanishTranslations);
    const spanishResult = await pool.query(
      'SELECT insert_translation_batch($1, $2, $3)',
      ['client', 'es', spanishJSON]
    );
    console.log(`✅ Inserted ${spanishResult.rows[0].insert_translation_batch} Spanish translations`);

    // Verify translations
    console.log('\n🔍 Verifying translations...');
    const verifyResult = await pool.query(`
      SELECT
        l.code as language,
        COUNT(t.id) as translation_count
      FROM t_languages l
      LEFT JOIN t_translations t ON l.id = t.language_id
      LEFT JOIN t_translation_keys tk ON t.key_id = tk.id
      LEFT JOIN t_translation_namespaces tn ON tk.namespace_id = tn.id
      WHERE tn.namespace = 'client'
      GROUP BY l.code, l.name
      ORDER BY l.code
    `);

    console.log('📋 Translation summary:');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.language}: ${row.translation_count} translations`);
    });

    console.log('\n🎉 Translation population completed successfully!');

  } catch (error) {
    console.error('❌ Translation population failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Run the population
populateTranslations();