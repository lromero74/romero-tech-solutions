export const APP_CONFIG = {
  company: {
    name: 'Romero Tech Solutions',
    phone: '(619) 940-5550',
    email: 'info@romerotechsolutions.com',
    location: 'San Diego County, CA',
    yearsExperience: 30
  },

  navigation: {
    pages: ['home', 'services', 'pricing', 'about', 'contact', 'login', 'clogin', 'coming-soon', 'dashboard', 'employee', 'confirm-email', 'rate'] as const
  },

  particles: {
    maxBlobs: 5,
    maxShapes: 15,
    animationFrameRate: 16, // ~60fps
    colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
  },

  storage: {
    keys: {
      language: 'language',
      currentPage: 'currentPage',
      theme: 'theme'
    }
  }
} as const;

export type AppPage = typeof APP_CONFIG.navigation.pages[number];