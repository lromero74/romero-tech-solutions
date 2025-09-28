import { AppPage } from '../constants/config';

export const getPageFromPath = (path: string): AppPage => {
  if (path === '/admin' || path === '/admin/' || path.startsWith('/admin/')) {
    return 'admin';
  }
  if (path === '/technician' || path.startsWith('/technician')) {
    return 'technician';
  }
  if (path === '/services') {
    return 'services';
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
  return `/${page}`;
};

export const updateUrlForPage = (page: AppPage): void => {
  const currentPath = window.location.pathname;
  const expectedPath = getPathFromPage(page);

  if (currentPath !== expectedPath) {
    window.history.pushState({}, '', expectedPath);
  }
};