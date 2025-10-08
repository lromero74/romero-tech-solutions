import { useEffect } from 'react';
import { Language } from '../translations';
import { AppPage } from '../constants/config';

interface SEOConfig {
  language: Language;
  page: AppPage;
  t: (key: string) => string;
}

/**
 * Custom hook to manage dynamic SEO meta tags based on language and current page
 * Updates:
 * - HTML lang attribute
 * - Page title
 * - Meta description
 * - Meta keywords
 * - Open Graph tags
 * - hreflang tags
 */
export const useSEO = ({ language, page, t }: SEOConfig) => {
  useEffect(() => {
    // Update HTML lang attribute
    document.documentElement.lang = language === 'es' ? 'es' : 'en';

    // Map page to SEO key prefix
    const getPageKey = (page: AppPage): string => {
      const pageMap: Record<string, string> = {
        'home': 'home',
        'services': 'services',
        'pricing': 'pricing',
        'about': 'about',
        'contact': 'contact',
        // Default to home for other pages
        'dashboard': 'home',
        'employee': 'home',
        'technician': 'home',
        'clogin': 'home',
        'confirm-email': 'home',
        'coming-soon': 'home'
      };
      return pageMap[page] || 'home';
    };

    const pageKey = getPageKey(page);

    // Update page title
    const title = t(`seo.${pageKey}.title` as any);
    document.title = title;

    // Update or create meta tags
    const updateMetaTag = (name: string, content: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let element = document.querySelector(`meta[${attribute}="${name}"]`);

      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }

      element.setAttribute('content', content);
    };

    // Update description and keywords
    const description = t(`seo.${pageKey}.description` as any);
    const keywords = t(`seo.${pageKey}.keywords` as any);

    updateMetaTag('description', description);
    updateMetaTag('keywords', keywords);

    // Update language meta tag
    updateMetaTag('language', language === 'es' ? 'Spanish' : 'English');

    // Update Open Graph tags
    updateMetaTag('og:title', title, true);
    updateMetaTag('og:description', description, true);
    updateMetaTag('og:locale', language === 'es' ? 'es_US' : 'en_US', true);
    updateMetaTag('og:site_name', t('seo.og.siteName' as any), true);

    // Update og:locale:alternate
    const alternateLocale = language === 'es' ? 'en_US' : 'es_US';
    let ogLocaleAlternate = document.querySelector('meta[property="og:locale:alternate"]');
    if (!ogLocaleAlternate) {
      ogLocaleAlternate = document.createElement('meta');
      ogLocaleAlternate.setAttribute('property', 'og:locale:alternate');
      document.head.appendChild(ogLocaleAlternate);
    }
    ogLocaleAlternate.setAttribute('content', alternateLocale);

    // Update hreflang tags
    const baseUrl = 'https://romerotechsolutions.com';
    const currentPath = window.location.pathname;

    // Remove old hreflang tags
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());

    // Add new hreflang tags with language parameter
    const createHreflangTag = (lang: string, href: string) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = lang;
      link.href = href;
      document.head.appendChild(link);
    };

    // Create URLs with language parameter
    const enUrl = `${baseUrl}${currentPath}?lang=en`;
    const esUrl = `${baseUrl}${currentPath}?lang=es`;

    createHreflangTag('en', enUrl);
    createHreflangTag('es', esUrl);
    createHreflangTag('x-default', enUrl); // Default to English

  }, [language, page, t]);
};
