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
  return `/${page}`;
};

export const updateUrlForPage = (page: AppPage): void => {
  // Don't update URL for rate page as it contains a dynamic token parameter
  if (page === 'rate') {
    return;
  }

  const currentPath = window.location.pathname;
  const expectedPath = getPathFromPage(page);

  if (currentPath !== expectedPath) {
    window.history.pushState({}, '', expectedPath);
  }
};