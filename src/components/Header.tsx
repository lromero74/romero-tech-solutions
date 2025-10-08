import React, { useState, useEffect } from 'react';
import { Menu, X, Phone, Mail, Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import LazyImage from './common/LazyImage';

interface HeaderProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

const Header: React.FC<HeaderProps> = ({ currentPage, setCurrentPage }) => {
  const { language, setLanguage, t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });
  const [isStretching, setIsStretching] = useState(false);
  const navRefs = React.useRef<{ [key: string]: HTMLButtonElement | null }>({});

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (hoveredItem) {
      // Immediate hover - just show under hovered item
      const hoveredButton = navRefs.current[hoveredItem];
      const navContainer = hoveredButton?.parentElement;
      
      if (hoveredButton && navContainer) {
        const timeoutId = setTimeout(() => {
          const containerRect = navContainer.getBoundingClientRect();
          const buttonRect = hoveredButton.getBoundingClientRect();
          
          setUnderlineStyle({
            left: buttonRect.left - containerRect.left - 7,
            width: buttonRect.width
          });
        }, 10);
        
        return () => clearTimeout(timeoutId);
      }
    } else {
      // Show under current page
      const activeButton = navRefs.current[currentPage];
      const navContainer = activeButton?.parentElement;
      
      if (activeButton && navContainer) {
        const timeoutId = setTimeout(() => {
          const containerRect = navContainer.getBoundingClientRect();
          const buttonRect = activeButton.getBoundingClientRect();
          
          setUnderlineStyle({
            left: buttonRect.left - containerRect.left - 7,
            width: buttonRect.width
          });
        }, 10);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [hoveredItem, currentPage]);

  // Handle page changes with stretch animation
  const handlePageChange = (newPage: string) => {
    if (newPage === currentPage) return;
    
    const currentButton = navRefs.current[currentPage];
    const newButton = navRefs.current[newPage];
    const navContainer = currentButton?.parentElement;
    
    if (currentButton && newButton && navContainer) {
      setIsStretching(true);
      
      // Calculate stretch dimensions
      const containerRect = navContainer.getBoundingClientRect();
      const currentRect = currentButton.getBoundingClientRect();
      const newRect = newButton.getBoundingClientRect();
      
      const leftMost = Math.min(currentRect.left, newRect.left);
      const rightMost = Math.max(currentRect.right, newRect.right);
      
      // First phase: stretch to cover both items
      setUnderlineStyle({
        left: leftMost - containerRect.left + 1,
        width: rightMost - leftMost
      });
      
      // Second phase: retract to new position after delay
      setTimeout(() => {
        setUnderlineStyle({
          left: newRect.left - containerRect.left + 1,
          width: newRect.width
        });
        
        // End stretching state
        setTimeout(() => {
          setIsStretching(false);
        }, 200);
      }, 150);
    }
    
    setCurrentPage(newPage);
  };

  // Update on window resize
  useEffect(() => {
    const handleResize = () => {
      const activeItem = hoveredItem || currentPage;
      const activeButton = navRefs.current[activeItem];
      const navContainer = activeButton?.parentElement;
      
      if (activeButton && navContainer) {
        setTimeout(() => {
          const containerRect = navContainer.getBoundingClientRect();
          const buttonRect = activeButton.getBoundingClientRect();
          
          setUnderlineStyle({
            left: buttonRect.left - containerRect.left - 7,
            width: buttonRect.width
          });
        }, 10);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hoveredItem, currentPage]);
  const navItems = [
    { id: 'home', label: t('header.home') },
    { id: 'services', label: t('header.services') },
    { id: 'pricing', label: t('header.pricing') },
    { id: 'about', label: t('header.about') },
    { id: 'contact', label: t('header.contact') },
    { id: 'clogin', label: t('header.login') },
  ];

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? 'bg-white/95 backdrop-blur-sm shadow-lg' 
        : 'bg-white shadow-md'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <div 
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => setCurrentPage('home')}
          >
            <LazyImage
              src="/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png"
              alt="Romero Tech Solutions - Professional IT Support & Computer Repair serving San Diego County, CA"
              className="h-10 w-10"
              priority={true}
              loading="eager"
              width={40}
              height={40}
            />
            <div>
              <span className="text-xl font-bold text-gray-900">{t('footer.company')}</span>
              <p className="text-sm text-gray-600">{t('footer.tagline')}</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-2 relative pb-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                ref={(el) => (navRefs.current[item.id] = el)}
                onClick={() => handlePageChange(item.id)}
                className={`text-sm font-medium py-2 px-4 rounded-lg hover:bg-gray-100 ${
                  currentPage === item.id
                    ? 'text-blue-600'
                    : 'text-gray-700 hover:text-blue-600'
                } transition-colors duration-300 hover:transition-colors hover:duration-300 transition-[background-color] hover:transition-[background-color] hover:duration-300`}
                style={{
                  transitionProperty: 'color, background-color',
                  transitionDuration: '300ms, 900ms',
                  transitionTimingFunction: 'ease, ease'
                }}
                onMouseEnter={(e) => {
                  setHoveredItem(item.id);
                  e.currentTarget.style.transitionDuration = '300ms, 300ms';
                }}
                onMouseLeave={(e) => {
                  setHoveredItem(null);
                  e.currentTarget.style.transitionDuration = '300ms, 900ms';
                }}
              >
                {item.label}
              </button>
            ))}
            
            {/* Animated underline */}
            <div 
              className="absolute -bottom-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500 ease-out origin-center"
              style={{
                left: `${underlineStyle.left}px`,
                width: `${underlineStyle.width}px`,
                opacity: hoveredItem || currentPage ? 1 : 0,
                transitionDuration: isStretching ? '150ms' : '300ms',
                transitionTimingFunction: isStretching ? 'ease-out' : 'ease-in-out'
              }}
            />
          </nav>

          {/* Contact Info */}
          <div className="hidden lg:flex items-center space-x-4">
            {/* Language Switcher */}
            <div className="flex items-center space-x-1 mr-4">
              <Globe className="h-4 w-4 text-gray-600" />
              <button
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors duration-200 ${
                  language === 'en' 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                }`}
              >
                EN
              </button>
              <span className="text-gray-400">|</span>
              <button
                onClick={() => setLanguage('es')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors duration-200 ${
                  language === 'es' 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                }`}
              >
                ES
              </button>
            </div>
            
            <a
              href="tel:+16199405550"
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors duration-200"
            >
              <Phone className="h-4 w-4" />
              <span className="text-sm font-medium">{t('common.phone')}</span>
            </a>
            <a
              href="mailto:info@romerotechsolutions.com"
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors duration-200"
            >
              <Mail className="h-4 w-4" />
              <span className="text-sm font-medium">{t('header.email')}</span>
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded-md text-gray-700 hover:text-blue-600 hover:bg-gray-100 transition-colors duration-200"
          >
            {isMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <nav className="flex flex-col space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    handlePageChange(item.id);
                    setIsMenuOpen(false);
                  }}
                  className={`text-sm font-medium transition-all duration-300 py-2 px-4 rounded-lg relative ${
                    currentPage === item.id
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              
              {/* Mobile Contact */}
              <div className="pt-4 border-t border-gray-200 space-y-3">
                {/* Mobile Language Switcher */}
                <div className="flex items-center justify-center space-x-2 px-4 py-2">
                  <Globe className="h-4 w-4 text-gray-600" />
                  <button
                    onClick={() => setLanguage('en')}
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors duration-200 ${
                      language === 'en' 
                        ? 'bg-blue-100 text-blue-600' 
                        : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                    }`}
                  >
                    English
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    onClick={() => setLanguage('es')}
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors duration-200 ${
                      language === 'es' 
                        ? 'bg-blue-100 text-blue-600' 
                        : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                    }`}
                  >
                    Español
                  </button>
                </div>
                
                <a
                  href="tel:+16199405550"
                  className="flex items-center space-x-2 px-4 py-2 text-blue-600 hover:text-blue-800 transition-colors duration-200"
                >
                  <Phone className="h-4 w-4" />
                  <span className="text-sm font-medium">{t('common.phone')}</span>
                </a>
                <a
                  href="mailto:info@romerotechsolutions.com"
                  className="flex items-center space-x-2 px-4 py-2 text-blue-600 hover:text-blue-800 transition-colors duration-200"
                >
                  <Mail className="h-4 w-4" />
                  <span className="text-sm font-medium">{t('header.email')}</span>
                </a>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;