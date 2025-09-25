import React from 'react';
import { Clock, Star, Mail, Phone, CheckCircle, Zap, Shield } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ImageBasedSection from '../components/common/ImageBasedSection';

const ComingSoon: React.FC = () => {
  const { t } = useLanguage();
  const backgroundImageUrl = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMJA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80';

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <ImageBasedSection imageUrl={backgroundImageUrl} height={900}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full px-6 py-2 mb-8 border border-white/20">
              <Clock className="h-4 w-4 text-yellow-400 mr-2" />
              <span className="text-sm font-medium">Coming Soon</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              Client Portal
              <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                Coming Soon!
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-blue-100 mb-8 leading-relaxed">
              We're building an amazing client experience platform that will revolutionize how you interact with our services.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
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

            {/* Coming Soon Features */}
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 w-12 h-12 rounded-lg flex items-center justify-center mb-4 mx-auto">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Real-Time Updates</h3>
                <p className="text-blue-100 text-sm">
                  Track your service requests and get instant notifications on progress.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 w-12 h-12 rounded-lg flex items-center justify-center mb-4 mx-auto">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Secure Access</h3>
                <p className="text-blue-100 text-sm">
                  Enterprise-grade security to protect your sensitive business data.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 w-12 h-12 rounded-lg flex items-center justify-center mb-4 mx-auto">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Easy Management</h3>
                <p className="text-blue-100 text-sm">
                  Intuitive interface to manage all your IT services from one place.
                </p>
              </div>
            </div>
          </div>
        </div>
      </ImageBasedSection>

      {/* Contact Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Need Immediate Support?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              While we're building your new client portal, our team is always ready to help you with any IT needs.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
                <Phone className="h-12 w-12 text-blue-600 mb-4 mx-auto" />
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Call Us</h3>
                <p className="text-gray-600 mb-4">
                  Speak directly with our technical experts
                </p>
                <a
                  href="tel:+16199405550"
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all duration-300"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  (619) 940-5550
                </a>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
                <Mail className="h-12 w-12 text-blue-600 mb-4 mx-auto" />
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Email Us</h3>
                <p className="text-gray-600 mb-4">
                  Send us your questions and we'll respond quickly
                </p>
                <a
                  href="mailto:info@romerotechsolutions.com"
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all duration-300"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ComingSoon;