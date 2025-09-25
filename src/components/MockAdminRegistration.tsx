import React, { useState } from 'react';
import { useMockAuth } from '../contexts/MockAuthContext';
import { Shield, User, Mail, Lock, CheckCircle } from 'lucide-react';

interface MockAdminRegistrationProps {
  onSuccess: () => void;
}

const MockAdminRegistration: React.FC<MockAdminRegistrationProps> = ({ onSuccess }) => {
  const { signIn } = useMockAuth();
  const [formData, setFormData] = useState({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'password123'
  });
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await signIn(formData.email, formData.password);
      setSuccess('Signed in successfully! Redirecting to admin dashboard...');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (error) {
      console.error('Mock authentication error:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Demo Admin Portal
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            This is a demo - AWS configuration required for full functionality
          </p>
        </div>

        {/* Status Messages */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-start">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {/* Demo Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Demo Mode</h3>
          <p className="text-sm text-yellow-700 mb-3">
            This is a demonstration of the admin portal. To enable full functionality:
          </p>
          <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
            <li>Configure AWS Cognito user pools</li>
            <li>Set up RDS database</li>
            <li>Add environment variables</li>
          </ul>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full Name (Demo)
              </label>
              <div className="mt-1 relative">
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="appearance-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Enter your full name"
                />
                <User className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address (Demo)
              </label>
              <div className="mt-1 relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="appearance-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Enter your email"
                />
                <Mail className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password (Demo)
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="appearance-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Enter your password"
                />
                <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Shield className="h-5 w-5 mr-2" />
              Demo Admin Login
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Any email/password combination will work in demo mode
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MockAdminRegistration;