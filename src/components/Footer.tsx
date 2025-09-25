import React from 'react';
import { Phone, Mail, MapPin, Monitor, Linkedin, Facebook } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const Footer: React.FC = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-blue-600 to-teal-600 p-2 rounded-lg">
                <Monitor className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold">{t('footer.company')}</h3>
                <p className="text-gray-400 text-sm">{t('footer.tagline')}</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">
              {t('footer.description')}
            </p>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white">{t('footer.contactUs')}</h4>
            <div className="space-y-3">
              <a
                href="tel:+16199405550"
                className="flex items-center space-x-3 text-gray-300 hover:text-blue-400 transition-colors duration-200 group"
              >
                <Phone className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
                <span>{t('common.phone')}</span>
              </a>
              <a
                href="mailto:info@romerotechsolutions.com"
                className="flex items-center space-x-3 text-gray-300 hover:text-teal-400 transition-colors duration-200 group"
              >
                <Mail className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
                <span>{t('common.email')}</span>
              </a>
              <div className="flex items-center space-x-3 text-gray-300">
                <MapPin className="h-5 w-5" />
                <span>Escondido, CA Area</span>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white">{t('footer.services')}</h4>
            <ul className="space-y-2 text-gray-300 text-sm">
              <li className="hover:text-blue-400 transition-colors duration-200 cursor-pointer">{t('footer.pcRepair')}</li>
              <li className="hover:text-blue-400 transition-colors duration-200 cursor-pointer">{t('footer.printerSetup')}</li>
              <li className="hover:text-blue-400 transition-colors duration-200 cursor-pointer">{t('footer.networkConfig')}</li>
              <li className="hover:text-blue-400 transition-colors duration-200 cursor-pointer">{t('footer.virusRemoval')}</li>
              <li className="hover:text-blue-400 transition-colors duration-200 cursor-pointer">{t('footer.dataRecovery')}</li>
            </ul>
            
            {/* Social Media */}
            <div className="pt-4">
              <h5 className="text-md font-semibold text-white mb-3">{t('footer.followUs')}</h5>
              <div className="flex space-x-3">
                <a
                  href="https://www.linkedin.com/company/romero-tech-solutions/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-800 hover:bg-blue-600 p-2 rounded-lg transition-colors duration-200 group"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="h-5 w-5 text-gray-300 group-hover:text-white" />
                </a>
                <a
                  href="https://www.facebook.com/profile.php?id=61580095926247"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-800 hover:bg-blue-500 p-2 rounded-lg transition-colors duration-200 group"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5 text-gray-300 group-hover:text-white" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center">
          <p className="text-gray-400 text-sm">
            {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;