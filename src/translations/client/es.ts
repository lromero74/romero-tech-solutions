export const clientTranslationsES = {
  // General UI
  general: {
    loading: 'Cargando...',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Agregar',
    back: 'Atrás',
    next: 'Siguiente',
    previous: 'Anterior',
    close: 'Cerrar',
    confirm: 'Confirmar',
    yes: 'Sí',
    no: 'No',
    success: 'Éxito',
    error: 'Error',
    warning: 'Advertencia',
    info: 'Información'
  },

  // Client Dashboard
  dashboard: {
    title: 'Panel del Cliente',
    welcome: 'Bienvenido de nuevo',
    quickActions: 'Acciones Rápidas',
    overview: 'Resumen',

    // Stats
    stats: {
      locations: 'Ubicaciones',
      activeRequests: 'Solicitudes Activas',
      storageUsed: 'Almacenamiento Usado',
      availableSpace: 'Espacio Disponible'
    },

    // Navigation
    nav: {
      dashboard: 'Panel',
      locations: 'Ubicaciones de Servicio',
      schedule: 'Programar Servicio',
      requests: 'Solicitudes de Servicio',
      files: 'Almacenamiento de Archivos',
      settings: 'Configuración'
    }
  },

  // Service Scheduling
  schedule: {
    title: 'Programar Solicitud de Servicio',
    selectDate: 'Seleccionar Fecha',
    selectTime: 'Seleccionar Hora y Duración',
    selectLocation: 'Seleccionar Ubicación',
    selectUrgency: 'Seleccionar Urgencia',
    serviceType: 'Tipo de Servicio',
    description: 'Descripción',
    contactInfo: 'Información de Contacto',

    // Time & Duration
    serviceDuration: 'Duración del Servicio',
    standardHours: 'Horario estándar',
    premiumPricing: 'Se aplican tarifas premium para servicios fuera del horario',
    selected: 'Seleccionado',
    hour: 'hora',
    hours: 'horas',

    // Urgency levels
    urgency: {
      normal: 'Normal',
      priority: 'Prioridad',
      emergency: 'Emergencia',
      normalDesc: 'Tiempo de espera de 24 horas',
      priorityDesc: 'Tiempo de espera de 4 horas',
      emergencyDesc: 'Tiempo de espera de 1 hora'
    },

    // Contact details
    contact: {
      name: 'Nombre de Contacto',
      phone: 'Número de Teléfono',
      email: 'Dirección de Correo',
      namePlaceholder: 'Ingrese nombre de contacto',
      phonePlaceholder: 'Ingrese número de teléfono',
      emailPlaceholder: 'Ingrese dirección de correo'
    },

    // Buttons
    buttons: {
      scheduleRequest: 'Programar Solicitud',
      backToForm: 'Volver al Formulario',
      scheduleAnother: 'Programar Otra'
    },

    // Messages
    messages: {
      submitting: 'Enviando solicitud...',
      success: '¡Solicitud de servicio programada exitosamente!',
      error: 'Error al programar solicitud de servicio',
      allFieldsRequired: 'Todos los campos son obligatorios',
      requestDetails: 'Detalles de la Solicitud'
    }
  },

  // Service Locations
  locations: {
    title: 'Ubicaciones de Servicio',
    noLocations: 'No se encontraron ubicaciones accesibles.',
    address: 'Dirección',
    contact: 'Contacto',
    role: 'Rol',
    primary: 'Principal'
  },

  // File Manager
  files: {
    title: 'Gestor de Archivos',
    uploadFiles: 'Subir Archivos',
    noFiles: 'No hay archivos subidos aún',
    noFilesSearch: 'No se encontraron archivos que coincidan con su búsqueda',
    searchFiles: 'Buscar archivos...',

    // File details
    details: {
      file: 'Archivo',
      size: 'Tamaño',
      uploaded: 'Subido',
      location: 'Ubicación',
      actions: 'Acciones',
      allLocations: 'Todas las Ubicaciones'
    },

    // Upload
    upload: {
      title: 'Subir Archivos',
      dragDrop: 'Arrastra y suelta archivos aquí, o haz clic para seleccionar',
      selectFiles: 'Seleccionar Archivos',
      maxSize: 'Tamaño máximo de archivo',
      allowedTypes: 'Tipos de archivo permitidos',
      uploading: 'Subiendo',
      virusScanning: 'Escaneando Virus',
      completing: 'Completando',
      uploadComplete: 'Subida Completa',
      quotaExceeded: 'La subida excedería la cuota de almacenamiento',
      quotaWarning: 'Acercándose al límite de almacenamiento',
      uploadFailed: 'Error en la subida'
    },

    // Actions
    actions: {
      viewDownload: 'Ver/Descargar',
      delete: 'Eliminar',
      confirmDelete: '¿Está seguro de que desea eliminar este archivo?',
      deleteFailed: 'Error al eliminar archivo'
    },

    // Storage
    storage: {
      quotaUsed: 'Almacenamiento Usado',
      totalFiles: 'Total de Archivos',
      availableSpace: 'Espacio Disponible'
    }
  },

  // Settings
  settings: {
    title: 'Configuración de Cuenta',
    profile: 'Perfil',
    password: 'Contraseña',
    security: 'Seguridad',

    // Profile
    profileSection: {
      firstName: 'Nombre',
      lastName: 'Apellido',
      email: 'Dirección de Correo',
      phone: 'Número de Teléfono',
      firstNamePlaceholder: 'Ingrese nombre',
      lastNamePlaceholder: 'Ingrese apellido',
      emailPlaceholder: 'Ingrese dirección de correo',
      phonePlaceholder: 'Ingrese número de teléfono',
      saveChanges: 'Guardar Cambios',
      updateSuccess: 'Información de contacto actualizada exitosamente',
      updateError: 'Error al actualizar información de contacto',
      emailInUse: 'La dirección de correo ya está en uso',
      invalidEmail: 'Formato de correo inválido',
      requiredFields: 'Nombre, apellido y correo son obligatorios'
    },

    // Password
    passwordSection: {
      currentPassword: 'Contraseña Actual',
      newPassword: 'Nueva Contraseña',
      confirmPassword: 'Confirmar Nueva Contraseña',
      currentPasswordPlaceholder: 'Ingrese contraseña actual',
      newPasswordPlaceholder: 'Ingrese nueva contraseña',
      confirmPasswordPlaceholder: 'Confirme nueva contraseña',
      changePassword: 'Cambiar Contraseña',
      passwordRequirements: 'Requisitos de Contraseña',
      requirements: {
        minLength: 'Al menos 8 caracteres',
        uppercase: 'Una letra mayúscula',
        lowercase: 'Una letra minúscula',
        number: 'Un número',
        specialChar: 'Un carácter especial'
      },
      changeSuccess: 'Contraseña cambiada exitosamente',
      changeError: 'Error al cambiar contraseña',
      incorrectCurrent: 'La contraseña actual es incorrecta',
      passwordMismatch: 'Las nuevas contraseñas no coinciden',
      passwordInvalid: 'La contraseña no cumple los requisitos'
    },

    // MFA
    mfaSection: {
      title: 'Autenticación de Múltiples Factores (MFA)',
      description: 'Agrega una capa extra de seguridad a tu cuenta requiriendo verificación por correo para iniciar sesión.',
      enabled: 'MFA está habilitado para',
      enable: 'Habilitar MFA',
      disable: 'Deshabilitar MFA',
      setupTitle: 'Configurar MFA',
      setupDescription: 'Ingrese el código de verificación enviado a',
      verificationCode: 'Ingrese código de 6 dígitos',
      verify: 'Verificar',
      resendCode: 'Reenviar Código',
      cancel: 'Cancelar',
      backupCodes: 'Códigos de Respaldo',
      backupCodesDesc: 'Guarda estos códigos de respaldo en un lugar seguro. Puedes usarlos para acceder a tu cuenta si no puedes recibir códigos por correo.',
      backupCodesSaved: 'He Guardado Estos Códigos',
      enableSuccess: 'MFA habilitado exitosamente',
      disableSuccess: 'MFA deshabilitado exitosamente',
      codeError: 'Código de verificación inválido o expirado',
      codeSent: 'Código de verificación enviado a'
    }
  },

  // Authentication
  auth: {
    logout: 'Cerrar Sesión',
    login: 'Iniciar Sesión',
    loginTitle: 'Acceso de Cliente',
    email: 'Correo',
    password: 'Contraseña',
    forgotPassword: '¿Olvidaste tu contraseña?',
    signIn: 'Acceder',
    loggingIn: 'Iniciando sesión...',
    invalidCredentials: 'Correo o contraseña inválidos',
    loginError: 'Error al iniciar sesión. Por favor intente de nuevo.',
    emailRequired: 'El correo es obligatorio',
    passwordRequired: 'La contraseña es obligatoria'
  },

  // Language
  language: {
    selectLanguage: 'Seleccionar Idioma',
    english: 'English',
    spanish: 'Español'
  },

  // Time formats
  time: {
    am: 'AM',
    pm: 'PM',
    today: 'Hoy',
    yesterday: 'Ayer',
    tomorrow: 'Mañana'
  },

  // Error messages
  errors: {
    networkError: 'Error de red. Por favor verifique su conexión.',
    serverError: 'Error del servidor. Por favor intente más tarde.',
    unknownError: 'Ocurrió un error desconocido.',
    unauthorized: 'No está autorizado para realizar esta acción.',
    forbidden: 'Acceso prohibido.',
    notFound: 'El recurso solicitado no fue encontrado.',
    validationError: 'Por favor verifique su información e intente de nuevo.'
  }
};

export default clientTranslationsES;