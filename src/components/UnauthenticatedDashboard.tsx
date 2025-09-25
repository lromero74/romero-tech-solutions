import React from 'react';
import ParticleBackground from './common/ParticleBackground';
import { useLanguage } from '../contexts/LanguageContext';
import { AppPage } from '../constants/config';

interface UnauthenticatedDashboardProps {
  onNavigate: (page: AppPage) => void;
}

const UnauthenticatedDashboard: React.FC<UnauthenticatedDashboardProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const imageRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen">
      <section
        ref={imageRef}
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white flex items-center justify-center overflow-hidden cursor-crosshair"
        style={{
          width: '100vw',
          height: '100vh',
          aspectRatio: '2344 / 1560' // Original image aspect ratio
        }}
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
        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}></div>
        </div>

        {/* Background Photo - sized to match container exactly */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{
            backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />

        {/* Particle Background with exact container boundaries */}
        <ParticleBackground
          containerRef={imageRef}
          boundaries={{
            left: 0,
            top: 0,
            right: imageRef.current?.offsetWidth || window.innerWidth,
            bottom: imageRef.current?.offsetHeight || window.innerHeight
          }}
        />

        <div className="relative z-10 max-w-md w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center mb-6">
              <div className="text-2xl">🔐</div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">{t('dashboard.auth.title')}</h1>
            <p className="text-blue-100 mb-8">{t('dashboard.auth.subtitle')}</p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 space-y-6">
            <div className="space-y-4">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Client Login clicked');
                  onNavigate('login');
                }}
                className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 cursor-pointer"
                type="button"
              >
                <span>{t('dashboard.auth.clientLogin')}</span>
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Back to Home clicked');
                  onNavigate('home');
                }}
                className="w-full flex items-center justify-center px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg border border-white/20 transition-colors duration-200 cursor-pointer"
                type="button"
              >
                <span>{t('dashboard.auth.backToHome')}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default UnauthenticatedDashboard;