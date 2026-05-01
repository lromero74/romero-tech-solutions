import { AppPage } from '../constants/config';

// isEmployeeSubdomain returns true when we're being served from the
// employee.* PWA hostname. We added this subdomain because iOS
// Safari truncates the path when "Add to Home Screen" is used on
// www.romerotechsolutions.com/employee — the saved icon launches at
// "/" instead of "/employee", making the webapp useless. A
// dedicated subdomain (no path) sidesteps the truncation.
export const isEmployeeSubdomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.startsWith('employee.');
};

export const getPageFromPath = (path: string): AppPage => {
  // Subdomain wins over path: employee.romerotechsolutions.com/anything
  // is always the employee app. Lets us preserve any sub-route inside
  // the employee surface without colliding with the apex routing table.
  if (isEmployeeSubdomain()) {
    return 'employee';
  }
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
  if (path === '/onboarding' || path.startsWith('/onboarding')) {
    return 'onboarding';
  }
  if (path === '/rapid-service' || path.startsWith('/rapid-service')) {
    return 'rapid-service';
  }
  if (path === '/rapid-service-resume' || path.startsWith('/rapid-service-resume')) {
    return 'rapid-service-resume';
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
  if (page === 'rapid-service') {
    return '/rapid-service';
  }
  if (page === 'rapid-service-resume') {
    return '/rapid-service-resume';
  }
  return `/${page}`;
};

export const updateUrlForPage = (page: AppPage): void => {
  // Don't update URL for pages with dynamic parameters
  if (page === 'rate' || page === 'trial-login' || page === 'agent-login' || page === 'onboarding' || page === 'rapid-service' || page === 'rapid-service-resume') {
    return;
  }

  // On the dedicated employee subdomain, the bare "/" already implies
  // the employee app — pushing "/employee" would create a redundant
  // path component (employee.romerotechsolutions.com/employee) that
  // works but reads as a typo. Leave the URL alone.
  if (isEmployeeSubdomain() && page === 'employee') {
    return;
  }

  const currentPath = window.location.pathname;
  const expectedPath = getPathFromPage(page);

  if (currentPath !== expectedPath) {
    window.history.pushState({}, '', expectedPath);
  }
};