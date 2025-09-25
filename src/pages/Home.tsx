import React from 'react';
import { Phone, Mail, Monitor, Printer, Wifi, Shield, Clock, Award, CheckCircle, Star, Users, MapPin, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ImageBasedSection from '../components/common/ImageBasedSection';

const Home: React.FC = () => {
  const { t } = useLanguage();
  const backgroundImageUrl = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMJA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80';

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <ImageBasedSection imageUrl={backgroundImageUrl}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full px-6 py-2 mb-8 border border-white/20">
              <Star className="h-4 w-4 text-yellow-400 mr-2" />
              <span className="text-sm font-medium">{t('home.hero.badge')}</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              {t('home.hero.title')}
              <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                {t('home.hero.titleHighlight')}
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-blue-100 mb-8 leading-relaxed">
              {t('home.hero.subtitle')}
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <a
                href="tel:+16199405550"
                className="group inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <Phone className="h-5 w-5 mr-2" />
                <span>Call (619) 940-5550</span>
              </a>

              <a
                href="mailto:info@romerotechsolutions.com"
                className="group inline-flex items-center px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl border border-white/20 hover:bg-white/20 transition-all duration-300"
              >
                <Mail className="h-5 w-5 mr-2" />
                <span>Email Us</span>
              </a>
            </div>
          </div>
        </div>
      </ImageBasedSection>

      {/* Services Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              {t('home.services.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {t('home.services.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* IT Support */}
            <div className="group bg-gray-50 rounded-2xl p-8 hover:bg-blue-50 transition-all duration-300 hover:shadow-lg">
              <div className="bg-blue-100 rounded-2xl p-4 w-16 h-16 flex items-center justify-center mb-6 group-hover:bg-blue-200 transition-colors">
                <Monitor className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{t('home.services.items.support.title')}</h3>
              <p className="text-gray-600 mb-6">{t('home.services.items.support.description')}</p>
              <ul className="space-y-2">
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.support.features.remote')}</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.support.features.onsite')}</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.support.features.maintenance')}</span>
                </li>
              </ul>
            </div>

            {/* Network Solutions */}
            <div className="group bg-gray-50 rounded-2xl p-8 hover:bg-blue-50 transition-all duration-300 hover:shadow-lg">
              <div className="bg-green-100 rounded-2xl p-4 w-16 h-16 flex items-center justify-center mb-6 group-hover:bg-green-200 transition-colors">
                <Wifi className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{t('home.services.items.network.title')}</h3>
              <p className="text-gray-600 mb-6">{t('home.services.items.network.description')}</p>
              <ul className="space-y-2">
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.network.features.setup')}</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.network.features.security')}</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.network.features.optimization')}</span>
                </li>
              </ul>
            </div>

            {/* Printer Services */}
            <div className="group bg-gray-50 rounded-2xl p-8 hover:bg-blue-50 transition-all duration-300 hover:shadow-lg">
              <div className="bg-purple-100 rounded-2xl p-4 w-16 h-16 flex items-center justify-center mb-6 group-hover:bg-purple-200 transition-colors">
                <Printer className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{t('home.services.items.printer.title')}</h3>
              <p className="text-gray-600 mb-6">{t('home.services.items.printer.description')}</p>
              <ul className="space-y-2">
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.printer.features.installation')}</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.printer.features.troubleshooting')}</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span>{t('home.services.items.printer.features.maintenance')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                {t('home.about.title')}
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                {t('home.about.description')}
              </p>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">15+</div>
                  <div className="text-gray-600">{t('home.about.stats.experience')}</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">500+</div>
                  <div className="text-gray-600">{t('home.about.stats.clients')}</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">24/7</div>
                  <div className="text-gray-600">{t('home.about.stats.support')}</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">100%</div>
                  <div className="text-gray-600">{t('home.about.stats.satisfaction')}</div>
                </div>
              </div>

              <a
                href="/about"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <span>{t('home.about.cta')}</span>
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </div>

            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1626&q=80"
                alt="Professional IT technician working"
                className="rounded-2xl shadow-2xl"
              />
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl p-6 shadow-xl">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <div className="font-bold text-gray-900">{t('home.about.badge.title')}</div>
                    <div className="text-gray-600 text-sm">{t('home.about.badge.subtitle')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              {t('home.contact.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {t('home.contact.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center bg-gray-50 rounded-2xl p-8">
              <div className="bg-blue-100 rounded-full p-4 w-16 h-16 flex items-center justify-center mx-auto mb-6">
                <Phone className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{t('home.contact.phone.title')}</h3>
              <p className="text-gray-600 mb-4">{t('home.contact.phone.description')}</p>
              <a
                href="tel:+16199405550"
                className="text-blue-600 font-semibold hover:text-blue-700 transition-colors"
              >
                (619) 940-5550
              </a>
            </div>

            <div className="text-center bg-gray-50 rounded-2xl p-8">
              <div className="bg-green-100 rounded-full p-4 w-16 h-16 flex items-center justify-center mx-auto mb-6">
                <Mail className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{t('home.contact.email.title')}</h3>
              <p className="text-gray-600 mb-4">{t('home.contact.email.description')}</p>
              <a
                href="mailto:info@romerotechsolutions.com"
                className="text-green-600 font-semibold hover:text-green-700 transition-colors"
              >
                info@romerotechsolutions.com
              </a>
            </div>

            <div className="text-center bg-gray-50 rounded-2xl p-8">
              <div className="bg-purple-100 rounded-full p-4 w-16 h-16 flex items-center justify-center mx-auto mb-6">
                <MapPin className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{t('home.contact.location.title')}</h3>
              <p className="text-gray-600 mb-4">{t('home.contact.location.description')}</p>
              <div className="text-purple-600 font-semibold">
                Escondido, CA
              </div>
            </div>
          </div>

          <div className="text-center mt-12">
            <a
              href="/contact"
              className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <span>{t('home.contact.cta')}</span>
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;