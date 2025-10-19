import React, { useState, useEffect } from 'react';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { EnhancedAuthProvider, useEnhancedAuth } from './contexts/EnhancedAuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { PermissionProvider } from './contexts/PermissionContext';
import Header from './components/Header';
import Footer from './components/Footer';
import ParticleBackground from './components/common/ParticleBackground';
import AdminRegistration from './components/AdminRegistration';
import UnauthenticatedDashboard from './components/UnauthenticatedDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ClientDashboard from './pages/ClientDashboard';
import { ClientThemeProvider } from './contexts/ClientThemeContext';
import { ClientLanguageProvider } from './contexts/ClientLanguageContext';
import ClientLogin from './pages/ClientLogin';
import Home from './pages/Home';
import Services from './pages/Services';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Contact from './pages/Contact';
import Download from './pages/Download';
import ConfirmEmail from './pages/ConfirmEmail';
import ComingSoon from './pages/ComingSoon';
import ServiceRating from './pages/ServiceRating';
import TrialLogin from './pages/TrialLogin';
// import TrialDashboard from './pages/TrialDashboard'; // DEPRECATED: All clients now use ClientDashboard
import AgentLogin from './pages/AgentLogin';
import { AppPage } from './constants/config';
import { getPageFromPath, updateUrlForPage } from './utils/routing';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useSEO } from './hooks/useSEO';
import './config/aws-config';
// Development utility for clearing auth state
import './utils/clearAuthState';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<AppPage>(() =>
    getPageFromPath(window.location.pathname)
  );

  const { isLoading, isAuthenticated, isAdmin, isTechnician, isExecutive, isSales, isClient, isSigningOut, authUser } = useEnhancedAuth();
  const { language, t } = useLanguage();

  // Automatically check for new versions and reload when deployed
  useVersionCheck();

  // Manage SEO meta tags dynamically based on language and page
  useSEO({ language, page: currentPage, t });

  // Get theme preference for loading states (before context is available)
  const getThemeClasses = () => {
    const saved = localStorage.getItem('client-theme');
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return {
      background: isDark ? 'bg-gray-900' : 'bg-gray-50',
      text: isDark ? 'text-white' : 'text-gray-600',
      spinner: isDark ? 'border-blue-400' : 'border-blue-600'
    };
  };

  // Save current page to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  // Update URL when page changes
  useEffect(() => {
    updateUrlForPage(currentPage);
  }, [currentPage]);

  const renderPage = () => {
    // Handle employee page (includes redirected /admin users)
    if (currentPage === 'employee') {
      if (isLoading) {
        const themeClasses = getThemeClasses();
        return (
          <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center`}>
            <div className="text-center">
              <div className={`animate-spin rounded-full h-32 w-32 border-b-2 ${themeClasses.spinner} mx-auto`}></div>
              <p className={`mt-4 ${themeClasses.text}`}>Loading...</p>
            </div>
          </div>
        );
      }

      if (!isAuthenticated || (!isAdmin && !isTechnician && !isExecutive && !isSales)) {
        return <AdminRegistration onSuccess={() => setCurrentPage('dashboard')} currentPage={currentPage} />;
      }

      // All authenticated employees access the same dashboard
      // Permission system inside AdminDashboard controls what they can see/do
      return <AdminDashboard />;
    }

    // Handle technician page
    if (currentPage === 'technician') {
      if (isLoading) {
        const themeClasses = getThemeClasses();
        return (
          <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center`}>
            <div className="text-center">
              <div className={`animate-spin rounded-full h-32 w-32 border-b-2 ${themeClasses.spinner} mx-auto`}></div>
              <p className={`mt-4 ${themeClasses.text}`}>Loading...</p>
            </div>
          </div>
        );
      }

      if (!isAuthenticated || !isTechnician) {
        return <AdminRegistration onSuccess={() => setCurrentPage('dashboard')} />;
      }

      return <UnauthenticatedDashboard />;
    }

    // Handle email confirmation page
    if (currentPage === 'confirm-email') {
      return <ConfirmEmail onSuccess={() => setCurrentPage('dashboard')} />;
    }

    // Handle trial magic-link login page
    if (currentPage === 'trial-login') {
      return <TrialLogin onSuccess={() => setCurrentPage('dashboard')} />;
    }

    // Handle agent magic-link login page
    if (currentPage === 'agent-login') {
      return <AgentLogin onSuccess={() => setCurrentPage('dashboard')} />;
    }

    // Handle service rating page (public - no auth required)
    if (currentPage === 'rate') {
      return <ServiceRating />;
    }

    // Handle coming soon page (displayed at /login)
    if (currentPage === 'coming-soon') {
      return <ComingSoon />;
    }

    // Handle hidden client login page
    if (currentPage === 'clogin') {
      if (isLoading) {
        const themeClasses = getThemeClasses();
        return (
          <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center`}>
            <div className="text-center">
              <div className={`animate-spin rounded-full h-32 w-32 border-b-2 ${themeClasses.spinner} mx-auto`}></div>
              <p className={`mt-4 ${themeClasses.text}`}>Loading...</p>
            </div>
          </div>
        );
      }

      if (isAuthenticated && isClient) {
        return (
          <ClientLanguageProvider>
            <ClientThemeProvider>
              <NotificationProvider>
                <ClientDashboard onNavigate={setCurrentPage} />
              </NotificationProvider>
            </ClientThemeProvider>
          </ClientLanguageProvider>
        );
      }
      return (
        <ClientThemeProvider>
          <ClientLogin onSuccess={() => setCurrentPage('dashboard')} />
        </ClientThemeProvider>
      );
    }

    // Handle dashboard page (role-based)
    if (currentPage === 'dashboard') {
      if (isLoading) {
        const themeClasses = getThemeClasses();
        return (
          <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center`}>
            <div className="text-center">
              <div className={`animate-spin rounded-full h-32 w-32 border-b-2 ${themeClasses.spinner} mx-auto`}></div>
              <p className={`mt-4 ${themeClasses.text}`}>Loading...</p>
            </div>
          </div>
        );
      }

      if (!isAuthenticated && !isSigningOut) {
        return <UnauthenticatedDashboard onNavigate={setCurrentPage} />;
      }

      // Show signing out indicator during logout
      if (isSigningOut) {
        const themeClasses = getThemeClasses();
        return (
          <div className={`min-h-screen flex items-center justify-center ${themeClasses.background}`}>
            <div className="text-center">
              <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${themeClasses.spinner} mx-auto mb-4`}></div>
              <p className={`text-sm ${themeClasses.text}`}>Signing out...</p>
            </div>
          </div>
        );
      }

      // Route to appropriate dashboard based on user type
      if (isClient) {
        // SIMPLIFIED: All clients (trial, regular, magic-link) use ClientDashboard
        // ClientDashboard handles trial UI and agent selection internally
        console.log('📊 Routing client to ClientDashboard:', {
          isTrial: authUser?.isTrial,
          agentId: authUser?.agentId,
          businessId: authUser?.businessId
        });

        return (
          <ClientLanguageProvider>
            <ClientThemeProvider>
              <NotificationProvider>
                <ClientDashboard onNavigate={setCurrentPage} />
              </NotificationProvider>
            </ClientThemeProvider>
          </ClientLanguageProvider>
        );
      }

      // All authenticated employees (Admin, Technician, Executive, Sales) use AdminDashboard
      // Permission system inside AdminDashboard controls what they can see/do
      if (isAdmin || isTechnician || isExecutive || isSales) {
        return <AdminDashboard />;
      }

      // Fallback for authenticated users without recognized roles
      return <UnauthenticatedDashboard />;
    }

    // Handle public pages
    switch (currentPage) {
      case 'home':
        return <Home />;
      case 'services':
        return <Services />;
      case 'pricing':
        return <Pricing setCurrentPage={setCurrentPage} />;
      case 'about':
        return <About />;
      case 'contact':
        return <Contact />;
      case 'download':
        return <Download />;
      case 'coming-soon':
        return <ComingSoon />;
      case 'clogin':
        return (
          <ClientLanguageProvider>
            <ClientThemeProvider>
              <ClientLogin onSuccess={() => setCurrentPage('dashboard')} />
            </ClientThemeProvider>
          </ClientLanguageProvider>
        );
      default:
        return <Home />;
    }
  };

  // Don't show header/footer for role-specific dashboard pages, confirmation page, rating page, trial login, and client dashboard when authenticated or loading
  if (currentPage === 'employee' || currentPage === 'technician' || currentPage === 'confirm-email' || currentPage === 'rate' || currentPage === 'trial-login' ||
      (currentPage === 'clogin' && (isLoading || (isAuthenticated && isClient))) ||
      (currentPage === 'dashboard' && (isLoading || (isAuthenticated && (isAdmin || isTechnician || isExecutive || isSales || isClient))))) {
    return renderPage();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ParticleBackground />
      <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="transition-all duration-300 ease-in-out">
        {renderPage()}
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <EnhancedAuthProvider>
      <PermissionProvider>
        <LanguageProvider>
          <AppContent />
        </LanguageProvider>
      </PermissionProvider>
    </EnhancedAuthProvider>
  );
}

export default App;