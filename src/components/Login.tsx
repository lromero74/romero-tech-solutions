import React from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import ParticleBackground from './common/ParticleBackground';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const loginSectionRef = React.useRef<HTMLDivElement>(null);

  return (
    <div
      ref={loginSectionRef}
      className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden cursor-crosshair"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const particleEvent = new CustomEvent('generateParticles', {
          detail: { x: clickX, y: clickY }
        });
        window.dispatchEvent(particleEvent);
      }}
    >
      {/* Particle Background */}
      <ParticleBackground containerRef={loginSectionRef} />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-slate-300">
          Access your dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white/95 backdrop-blur-sm py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-white/20">
          <Authenticator
            hideSignUp={false}
            components={{
              Header() {
                return (
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-medium text-gray-900">
                      Welcome Back
                    </h3>
                  </div>
                );
              },
            }}
            formFields={{
              signIn: {
                username: {
                  placeholder: 'Enter your email',
                  isRequired: true,
                  label: 'Email:'
                },
                password: {
                  placeholder: 'Enter your password',
                  isRequired: true,
                  label: 'Password:'
                }
              },
              signUp: {
                email: {
                  placeholder: 'Enter your email',
                  isRequired: true,
                  label: 'Email:'
                },
                password: {
                  placeholder: 'Enter your password',
                  isRequired: true,
                  label: 'Password:'
                },
                confirm_password: {
                  placeholder: 'Confirm your password',
                  isRequired: true,
                  label: 'Confirm Password:'
                }
              }
            }}
          >
            {({ user }) => {
              if (user) {
                onLogin();
                return null;
              }
              return null;
            }}
          </Authenticator>
        </div>
      </div>
    </div>
  );
};

export default Login;