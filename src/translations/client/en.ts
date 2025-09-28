export const clientTranslations = {
  // General UI
  general: {
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    close: 'Close',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Information'
  },

  // Client Dashboard
  dashboard: {
    title: 'Client Dashboard',
    welcome: 'Welcome back',
    quickActions: 'Quick Actions',
    overview: 'Overview',

    // Stats
    stats: {
      locations: 'Locations',
      activeRequests: 'Active Requests',
      storageUsed: 'Storage Used',
      availableSpace: 'Available Space'
    },

    // Navigation
    nav: {
      dashboard: 'Dashboard',
      locations: 'Service Locations',
      schedule: 'Schedule Service',
      requests: 'Service Requests',
      files: 'File Storage',
      settings: 'Settings'
    }
  },

  // Service Scheduling
  schedule: {
    title: 'Schedule Service Request',
    selectDate: 'Select Date',
    selectTime: 'Select Time & Duration',
    selectLocation: 'Select Location',
    selectUrgency: 'Select Urgency',
    serviceType: 'Service Type',
    description: 'Description',
    contactInfo: 'Contact Information',

    // Time & Duration
    serviceDuration: 'Service Duration',
    standardHours: 'Standard hours',
    premiumPricing: 'Premium pricing applies for after-hours service',
    selected: 'Selected',
    hour: 'hour',
    hours: 'hours',

    // Urgency levels
    urgency: {
      normal: 'Normal',
      priority: 'Priority',
      emergency: 'Emergency',
      normalDesc: '24-hour lead time',
      priorityDesc: '4-hour lead time',
      emergencyDesc: '1-hour lead time'
    },

    // Contact details
    contact: {
      name: 'Contact Name',
      phone: 'Phone Number',
      email: 'Email Address',
      namePlaceholder: 'Enter contact name',
      phonePlaceholder: 'Enter phone number',
      emailPlaceholder: 'Enter email address'
    },

    // Buttons
    buttons: {
      scheduleRequest: 'Schedule Request',
      backToForm: 'Back to Form',
      scheduleAnother: 'Schedule Another'
    },

    // Messages
    messages: {
      submitting: 'Submitting request...',
      success: 'Service request scheduled successfully!',
      error: 'Failed to schedule service request',
      allFieldsRequired: 'All fields are required',
      requestDetails: 'Request Details'
    }
  },

  // Service Locations
  locations: {
    title: 'Service Locations',
    noLocations: 'No accessible locations found.',
    address: 'Address',
    contact: 'Contact',
    role: 'Role',
    primary: 'Primary'
  },

  // File Manager
  files: {
    title: 'File Manager',
    uploadFiles: 'Upload Files',
    noFiles: 'No files uploaded yet',
    noFilesSearch: 'No files found matching your search',
    searchFiles: 'Search files...',

    // File details
    details: {
      file: 'File',
      size: 'Size',
      uploaded: 'Uploaded',
      location: 'Location',
      actions: 'Actions',
      allLocations: 'All Locations'
    },

    // Upload
    upload: {
      title: 'Upload Files',
      dragDrop: 'Drag and drop files here, or click to select',
      selectFiles: 'Select Files',
      maxSize: 'Maximum file size',
      allowedTypes: 'Allowed file types',
      uploading: 'Uploading',
      virusScanning: 'Virus Scanning',
      completing: 'Completing',
      uploadComplete: 'Upload Complete',
      quotaExceeded: 'Upload would exceed storage quota',
      quotaWarning: 'Approaching storage limit',
      uploadFailed: 'Upload failed'
    },

    // Actions
    actions: {
      viewDownload: 'View/Download',
      delete: 'Delete',
      confirmDelete: 'Are you sure you want to delete this file?',
      deleteFailed: 'Failed to delete file'
    },

    // Storage
    storage: {
      quotaUsed: 'Storage Used',
      totalFiles: 'Total Files',
      availableSpace: 'Available Space'
    }
  },

  // Settings
  settings: {
    title: 'Account Settings',
    profile: 'Profile',
    password: 'Password',
    security: 'Security',

    // Profile
    profileSection: {
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email Address',
      phone: 'Phone Number',
      firstNamePlaceholder: 'Enter first name',
      lastNamePlaceholder: 'Enter last name',
      emailPlaceholder: 'Enter email address',
      phonePlaceholder: 'Enter phone number',
      saveChanges: 'Save Changes',
      updateSuccess: 'Contact information updated successfully',
      updateError: 'Failed to update contact information',
      emailInUse: 'Email address is already in use',
      invalidEmail: 'Invalid email format',
      requiredFields: 'First name, last name, and email are required'
    },

    // Password
    passwordSection: {
      currentPassword: 'Current Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm New Password',
      currentPasswordPlaceholder: 'Enter current password',
      newPasswordPlaceholder: 'Enter new password',
      confirmPasswordPlaceholder: 'Confirm new password',
      changePassword: 'Change Password',
      passwordRequirements: 'Password Requirements',
      requirements: {
        minLength: 'At least 8 characters',
        uppercase: 'One uppercase letter',
        lowercase: 'One lowercase letter',
        number: 'One number',
        specialChar: 'One special character'
      },
      changeSuccess: 'Password changed successfully',
      changeError: 'Failed to change password',
      incorrectCurrent: 'Current password is incorrect',
      passwordMismatch: 'New passwords do not match',
      passwordInvalid: 'Password does not meet requirements'
    },

    // MFA
    mfaSection: {
      title: 'Multi-Factor Authentication (MFA)',
      description: 'Add an extra layer of security to your account by requiring email verification for login.',
      enabled: 'MFA is enabled for',
      enable: 'Enable MFA',
      disable: 'Disable MFA',
      setupTitle: 'Set Up MFA',
      setupDescription: 'Enter the verification code sent to',
      verificationCode: 'Enter 6-digit code',
      verify: 'Verify',
      resendCode: 'Resend Code',
      cancel: 'Cancel',
      backupCodes: 'Backup Codes',
      backupCodesDesc: 'Save these backup codes in a secure location. You can use them to access your account if you can\'t receive email codes.',
      backupCodesSaved: 'I\'ve Saved These Codes',
      enableSuccess: 'MFA enabled successfully',
      disableSuccess: 'MFA disabled successfully',
      codeError: 'Invalid or expired verification code',
      codeSent: 'Verification code sent to'
    }
  },

  // Authentication
  auth: {
    logout: 'Logout',
    login: 'Login',
    loginTitle: 'Client Login',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Forgot Password?',
    signIn: 'Sign In',
    loggingIn: 'Logging in...',
    invalidCredentials: 'Invalid email or password',
    loginError: 'Login failed. Please try again.',
    emailRequired: 'Email is required',
    passwordRequired: 'Password is required'
  },

  // Language
  language: {
    selectLanguage: 'Select Language',
    english: 'English',
    spanish: 'Español'
  },

  // Time formats
  time: {
    am: 'AM',
    pm: 'PM',
    today: 'Today',
    yesterday: 'Yesterday',
    tomorrow: 'Tomorrow'
  },

  // Error messages
  errors: {
    networkError: 'Network error. Please check your connection.',
    serverError: 'Server error. Please try again later.',
    unknownError: 'An unknown error occurred.',
    unauthorized: 'You are not authorized to perform this action.',
    forbidden: 'Access forbidden.',
    notFound: 'The requested resource was not found.',
    validationError: 'Please check your input and try again.'
  }
};

export default clientTranslations;