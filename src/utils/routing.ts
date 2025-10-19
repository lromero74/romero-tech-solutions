import { AppPage } from '../constants/config';

export const getPageFromPath = (path: string): AppPage => {
  if (path === '/employee' || path === '/employee/' || path.startsWith('/employee/')) {
    return 'employee';
  }
  if (path === '/technician' || path.startsWith('/technician')) {
    return 'technician';
  }
  if (path.startsWith('/rate/') || path === '/rate') {
    return 'rate';
  }
  if (path === '/services') {
    return 'services';
  }
  if (path === '/pricing') {
    return 'pricing';
  }
  if (path === '/about') {
    return 'about';
  }
  if (path === '/contact') {
    return 'contact';
  }
  if (path === '/download') {
    return 'download';
  }
  if (path === '/login') {
    return 'coming-soon';
  }
  if (path === '/clogin' || path === '/clogin/') {
    return 'clogin';
  }
  if (path === '/dashboard' || path === '/dashboard/') {
    return 'dashboard';
  }
  if (path === '/confirm-email') {
    return 'confirm-email';
  }
  if (path === '/trial/login' || path.startsWith('/trial/login')) {
    return 'trial-login';
  }
  if (path === '/agent/login' || path.startsWith('/agent/login') ||
      path === '/agent-magic-login' || path.startsWith('/agent-magic-login')) {
    return 'agent-login';
  }
  return 'home';
};

export const getPathFromPage = (page: AppPage): string => {
  if (page === 'home') {
    return '/';
  }
  if (page === 'login') {
    return '/login';
  }
  if (page === 'clogin') {
    return '/clogin';
  }
  if (page === 'coming-soon') {
    return '/login'; // Coming soon page is shown at /login
  }
  if (page === 'confirm-email') {
    return '/confirm-email';
  }
  if (page === 'employee') {
    return '/employee';
  }
  if (page === 'trial-login') {
    return '/trial/login';
  }
  if (page === 'agent-login') {
    return '/agent/login';
  }
  return `/${page}`;
};

export const updateUrlForPage = (page: AppPage): void => {
  // Don't update URL for pages with dynamic parameters
  if (page === 'rate' || page === 'trial-login' || page === 'agent-login') {
    return;
  }

  const currentPath = window.location.pathname;
  const expectedPath = getPathFromPage(page);

  if (currentPath !== expectedPath) {
    window.history.pushState({}, '', expectedPath);
  }
};