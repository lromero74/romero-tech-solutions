import React, { useState, useEffect } from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import { EnhancedAuthProvider, useEnhancedAuth } from './contexts/EnhancedAuthContext';
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
import About from './pages/About';
import Contact from './pages/Contact';
import ConfirmEmail from './pages/ConfirmEmail';
import ComingSoon from './pages/ComingSoon';
import { AppPage } from './constants/config';
import { getPageFromPath, updateUrlForPage } from './utils/routing';
import './config/aws-config';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<AppPage>(() =>
    getPageFromPath(window.location.pathname)
  );

  const { isLoading, isAuthenticated, isAdmin, isTechnician, isClient } = useEnhancedAuth();

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
    // Handle admin page
    if (currentPage === 'admin') {
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

      if (!isAuthenticated || !isAdmin) {
        return <AdminRegistration onSuccess={() => setCurrentPage('dashboard')} />;
      }

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

    // Handle coming soon page (displayed at /login)
    if (currentPage === 'coming-soon') {
      return <ComingSoon />;
    }

    // Handle hidden client login page
    if (currentPage === 'clogin') {
      if (isAuthenticated && isClient) {
        return (
          <ClientLanguageProvider>
            <ClientThemeProvider>
              <ClientDashboard onNavigate={setCurrentPage} />
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

      if (!isAuthenticated) {
        return <UnauthenticatedDashboard onNavigate={setCurrentPage} />;
      }

      // Render role-specific dashboard
      if (isAdmin) {
        return <AdminDashboard />;
      }

      if (isTechnician) {
        return <UnauthenticatedDashboard />;
      }

      if (isClient) {
        return (
          <ClientLanguageProvider>
            <ClientThemeProvider>
              <ClientDashboard onNavigate={setCurrentPage} />
            </ClientThemeProvider>
          </ClientLanguageProvider>
        );
      }

      // For other roles, show simple dashboard
      return <UnauthenticatedDashboard />;
    }

    // Handle public pages
    switch (currentPage) {
      case 'home':
        return <Home />;
      case 'services':
        return <Services />;
      case 'about':
        return <About />;
      case 'contact':
        return <Contact />;
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

  // Don't show header/footer for role-specific dashboard pages, confirmation page, and client dashboard when authenticated or loading
  if (currentPage === 'admin' || currentPage === 'technician' || currentPage === 'confirm-email' ||
      (currentPage === 'clogin' && (isLoading || (isAuthenticated && isClient))) ||
      (currentPage === 'dashboard' && (isLoading || (isAuthenticated && (isAdmin || isTechnician || isClient))))) {
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
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </EnhancedAuthProvider>
  );
}

export default App;