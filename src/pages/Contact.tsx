import React from 'react';
import { Phone, Mail, MapPin, Clock, MessageSquare, Star, Zap, Shield, CheckCircle, Users, Award, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ParticleBackground from '../components/common/ParticleBackground';
import StructuredData from '../components/seo/StructuredData';

const Contact: React.FC = () => {
  const { t } = useLanguage();

  const contactMethods = [
    {
      icon: Phone,
      title: t('contact.methods.callTitle'),
      description: t('contact.methods.callDesc'),
      contact: t('common.phone'),
      action: 'tel:+16199405550',
      color: 'blue'
    },
    {
      icon: Mail,
      title: t('contact.methods.emailTitle'),
      description: t('contact.methods.emailDesc'),
      contact: t('common.email'),
      action: 'mailto:info@romerotechsolutions.com',
      color: 'teal'
    },
    {
      icon: MessageSquare,
      title: t('contact.methods.textTitle'),
      description: t('contact.methods.textDesc'),
      contact: t('common.phone'),
      action: 'sms:+16199405550',
      color: 'purple'
    }
  ];

  const businessHours = [
    { day: t('contact.hours.weekdays'), hours: t('contact.hours.weekdaysTime'), icon: '💼' },
    { day: t('contact.hours.saturday'), hours: t('contact.hours.saturdayTime'), icon: '🛠️' },
    { day: t('contact.hours.sunday'), hours: t('contact.hours.sundayTime'), icon: '🚨' }
  ];

  const serviceAreas = [
    { area: t('contact.serviceArea.escondido'), type: t('contact.serviceArea.primary'), icon: '🏠' },
    { area: 'San Marcos', type: t('contact.serviceArea.extended'), icon: '🌟' },
    { area: 'Vista', type: t('contact.serviceArea.extended'), icon: '🌟' },
    { area: 'Poway', type: t('contact.serviceArea.extended'), icon: '🌟' },
    { area: 'Rancho Bernardo', type: t('contact.serviceArea.extended'), icon: '🌟' },
    { area: 'Valley Center', type: t('contact.serviceArea.extended'), icon: '🌟' }
  ];

  const faqs = [
    {
      question: t('contact.faq.onsite.question'),
      answer: t('contact.faq.onsite.answer'),
      icon: '🏠'
    },
    {
      question: t('contact.faq.response.question'),
      answer: t('contact.faq.response.answer'),
      icon: '⚡'
    },
    {
      question: t('contact.faq.customers.question'),
      answer: t('contact.faq.customers.answer'),
      icon: '🏢'
    },
    {
      question: t('contact.faq.payment.question'),
      answer: t('contact.faq.payment.answer'),
      icon: '💳'
    },
    {
      question: t('contact.faq.warranty.question'),
      answer: t('contact.faq.warranty.answer'),
      icon: '🛡️'
    },
    {
      question: t('contact.faq.backup.question'),
      answer: t('contact.faq.backup.answer'),
      icon: '💾'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'from-blue-500 to-blue-600',
      teal: 'from-teal-500 to-teal-600',
      purple: 'from-purple-500 to-purple-600'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="min-h-screen">
      <StructuredData pageType="contact" />

      <section
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white min-h-screen overflow-hidden cursor-crosshair"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          // Create a custom event to trigger particle generation
          const particleEvent = new CustomEvent('generateParticles', {
            detail: { x: clickX, y: clickY }
          });
          window.dispatchEvent(particleEvent);
        }}
      >
        {/* Background elements */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-5"
          style={{
            backgroundImage: `url('https://images.pexels.com/photos/3184639/pexels-photo-3184639.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop')`,
            backgroundBlendMode: 'multiply'
          }}
        ></div>

        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}></div>
        </div>

        {/* Particle Background */}
        <div className="absolute inset-0 w-full h-full">
          <ParticleBackground boundaries={{
            left: 0,
            top: 0,
            right: typeof window !== 'undefined' ? window.innerWidth : 1920,
            bottom: typeof window !== 'undefined' ? Math.max(window.innerHeight, document.documentElement.scrollHeight) : 2000
          }} />
        </div>

        {/* Main Content Container */}
        <div className="relative z-10 w-full py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-16">

            {/* Hero Section */}
            <div className="text-center">
              <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full px-6 py-2 mb-8 border border-white/20">
                <Star className="h-4 w-4 text-yellow-400 mr-2" />
                <span className="text-sm font-medium">{t('contact.hero.badge')}</span>
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                {t('contact.hero.title')}
                <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  {t('contact.hero.titleHighlight')}
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
                {t('contact.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
                <a
                  href="tel:+16199405550"
                  className="group inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <Phone className="h-5 w-5 mr-2 group-hover:rotate-12 transition-transform duration-300" />
                  {t('home.hero.callButton')}
                </a>
                <a
                  href="mailto:info@romerotechsolutions.com"
                  className="group inline-flex items-center justify-center px-8 py-4 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-semibold rounded-xl border border-white/30 transition-all duration-300 hover:scale-105"
                >
                  <Mail className="h-5 w-5 mr-2" />
                  {t('home.hero.quoteButton')}
                  <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                </a>
              </div>
            </div>

            {/* Contact Methods */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('contact.methods.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-12">
                {t('contact.methods.subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                {contactMethods.map((method, index) => {
                  const IconComponent = method.icon;
                  return (
                    <a
                      key={index}
                      href={method.action}
                      className="group"
                    >
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-2 border border-white/20 hover:bg-white/20">
                        <div className={`bg-gradient-to-br ${getColorClasses(method.color)} rounded-xl p-4 mx-auto w-fit mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                          <IconComponent className="h-8 w-8 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-4 group-hover:text-cyan-300 transition-colors duration-200 text-center">
                          {method.title}
                        </h3>
                        <p className="text-blue-200 text-center mb-4 leading-relaxed">{method.description}</p>
                        <p className="font-semibold text-center text-sm text-cyan-300 group-hover:text-white transition-colors duration-200">
                          {method.contact}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Business Info Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Business Hours */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/20 hover:bg-white/20 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 mr-4">
                    <Clock className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">{t('contact.hours.title')}</h2>
                </div>
                <div className="space-y-4">
                  {businessHours.map((schedule, index) => (
                    <div key={index} className="flex justify-between items-center py-4 border-b border-white/20 last:border-b-0 group hover:bg-white/10 rounded-lg px-2 transition-colors duration-200">
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">{schedule.icon}</span>
                        <span className="font-medium text-white">{schedule.day}</span>
                      </div>
                      <span className="text-blue-200 font-medium">{schedule.hours}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl text-white">
                  <p className="text-sm font-medium">
                    <Zap className="h-4 w-4 inline mr-2" />
                    <strong>{t('contact.hours.emergency')}</strong>
                  </p>
                </div>
              </div>

              {/* Service Area */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/20 hover:bg-white/20 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-3 mr-4">
                    <MapPin className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">{t('contact.serviceArea.title')}</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {serviceAreas.map((area, index) => (
                    <div key={index} className="flex items-center space-x-2 p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors duration-200 group">
                      <span className="text-lg">{area.icon}</span>
                      <div>
                        <p className="font-medium text-white group-hover:text-cyan-300 transition-colors duration-200">
                          {area.area}
                        </p>
                        <p className="text-xs text-blue-200">{area.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl text-white">
                  <p className="text-sm font-medium">
                    <Shield className="h-4 w-4 inline mr-2" />
                    <strong>{t('contact.serviceArea.remote')}</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Emergency CTA Section */}
            <div className="text-center">
              <div className="mb-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-full p-4 mx-auto w-fit">
                  <Zap className="h-12 w-12 text-yellow-300" />
                </div>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
                {t('contact.emergencyCta.title')}
              </h2>
              <p className="text-lg text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
                {t('contact.emergencyCta.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <a
                  href="tel:+16199405550"
                  className="inline-flex items-center justify-center px-10 py-5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg"
                >
                  <Phone className="h-6 w-6 mr-3" />
                  {t('home.finalCta.callButton')}
                </a>
                <a
                  href="mailto:info@romerotechsolutions.com"
                  className="inline-flex items-center justify-center px-10 py-5 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-semibold rounded-xl border border-white/30 transition-all duration-300 hover:scale-105 text-lg"
                >
                  <Mail className="h-6 w-6 mr-2" />
                  {t('home.finalCta.quoteButton')}
                </a>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 text-slate-400">
                <div className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>{t('contact.emergencyCta.sameDay')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Award className="h-5 w-5" />
                  <span>{t('contact.emergencyCta.trusted')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>{t('contact.emergencyCta.customers')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5" />
                  <span>{t('contact.emergencyCta.satisfaction')}</span>
                </div>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('contact.faq.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-12">
                {t('contact.faq.subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {faqs.map((faq, index) => (
                  <div key={index} className="group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-1 border border-white/20 hover:bg-white/20">
                      <div className="flex items-start space-x-4">
                        <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 flex-shrink-0 group-hover:scale-110 transition-transform duration-200 border border-white/30">
                          <span className="text-xl">{faq.icon}</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-cyan-300 transition-colors duration-200">
                            {faq.question}
                          </h3>
                          <p className="text-blue-200 leading-relaxed">{faq.answer}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;