import React, { useState } from 'react';
import { ClientRegistrationRequest, ServiceAddress, Address } from '../types/database';
import {
  Building2,
  User,
  MapPin,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface ClientRegistrationProps {
  onSuccess: () => void;
  onCancel: () => void;
}

type Step = 'business' | 'contact' | 'addresses' | 'account' | 'confirmation';

const ClientRegistration: React.FC<ClientRegistrationProps> = ({ onSuccess, onCancel }) => {
  const [currentStep, setCurrentStep] = useState<Step>('business');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState<ClientRegistrationRequest>({
    businessName: '',
    businessAddress: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA'
    },
    domainEmail: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    jobTitle: '',
    serviceAddresses: [],
    password: '',
    confirmPassword: ''
  });

  const updateFormData = <K extends keyof ClientRegistrationRequest>(
    key: K,
    value: ClientRegistrationRequest[K]
  ) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const updateAddress = (field: keyof Address, value: string) => {
    setFormData(prev => ({
      ...prev,
      businessAddress: {
        ...prev.businessAddress,
        [field]: value
      }
    }));
  };

  const addServiceAddress = () => {
    const newAddress: Omit<ServiceAddress, 'id'> = {
      label: '',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'USA'
      },
      contactPerson: '',
      contactPhone: '',
      notes: '',
      isActive: true
    };
    setFormData(prev => ({
      ...prev,
      serviceAddresses: [...prev.serviceAddresses, newAddress]
    }));
  };

  const updateServiceAddress = (index: number, field: keyof Omit<ServiceAddress, 'id'>, value: any) => {
    setFormData(prev => ({
      ...prev,
      serviceAddresses: prev.serviceAddresses.map((addr, i) =>
        i === index ? { ...addr, [field]: value } : addr
      )
    }));
  };

  const updateServiceAddressField = (index: number, field: keyof Address, value: string) => {
    setFormData(prev => ({
      ...prev,
      serviceAddresses: prev.serviceAddresses.map((addr, i) =>
        i === index ? {
          ...addr,
          address: { ...addr.address, [field]: value }
        } : addr
      )
    }));
  };

  const removeServiceAddress = (index: number) => {
    setFormData(prev => ({
      ...prev,
      serviceAddresses: prev.serviceAddresses.filter((_, i) => i !== index)
    }));
  };

  const validateCurrentStep = (): boolean => {
    setError('');

    switch (currentStep) {
      case 'business':
        if (!formData.businessName.trim()) {
          setError('Business name is required');
          return false;
        }
        if (!formData.businessAddress.street.trim() ||
            !formData.businessAddress.city.trim() ||
            !formData.businessAddress.state.trim() ||
            !formData.businessAddress.zipCode.trim()) {
          setError('Complete business address is required');
          return false;
        }
        if (!formData.domainEmail.trim()) {
          setError('Business domain email is required');
          return false;
        }
        if (!formData.domainEmail.includes('@') || !formData.domainEmail.includes('.')) {
          setError('Please enter a valid domain email');
          return false;
        }
        break;

      case 'contact': {
        if (!formData.contactName.trim()) {
          setError('Contact name is required');
          return false;
        }
        if (!formData.contactEmail.trim()) {
          setError('Contact email is required');
          return false;
        }
        if (!formData.contactEmail.includes('@')) {
          setError('Please enter a valid email address');
          return false;
        }
        if (!formData.contactPhone.trim()) {
          setError('Contact phone is required');
          return false;
        }
        // Validate email domain matches business domain
        const contactDomain = formData.contactEmail.split('@')[1];
        const businessDomain = formData.domainEmail.split('@')[1];
        if (contactDomain !== businessDomain) {
          setError(`Contact email must use business domain: @${businessDomain}`);
          return false;
        }
        break;
      }

      case 'addresses':
        if (formData.serviceAddresses.length === 0) {
          setError('At least one service address is required');
          return false;
        }
        for (let i = 0; i < formData.serviceAddresses.length; i++) {
          const addr = formData.serviceAddresses[i];
          if (!addr.label.trim() ||
              !addr.address.street.trim() ||
              !addr.address.city.trim() ||
              !addr.address.state.trim() ||
              !addr.address.zipCode.trim()) {
            setError(`Service address ${i + 1} is incomplete`);
            return false;
          }
        }
        break;

      case 'account':
        if (!formData.password) {
          setError('Password is required');
          return false;
        }
        if (formData.password.length < 8) {
          setError('Password must be at least 8 characters long');
          return false;
        }
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          return false;
        }
        break;
    }

    return true;
  };

  const nextStep = () => {
    if (!validateCurrentStep()) return;

    const stepOrder: Step[] = ['business', 'contact', 'addresses', 'account', 'confirmation'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const stepOrder: Step[] = ['business', 'contact', 'addresses', 'account', 'confirmation'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const submitRegistration = async () => {
    if (!validateCurrentStep()) return;

    setLoading(true);
    setError('');

    try {
      // TODO: Implement actual registration API call
      console.log('Registering client:', formData);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      setEmailSent(true);
      setCurrentStep('confirmation');
    } catch (error: any) {
      setError(error.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderBusinessStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Building2 className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">Business Information</h3>
        <p className="text-blue-200 mt-2">Tell us about your business</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Business Name *
          </label>
          <input
            type="text"
            value={formData.businessName}
            onChange={(e) => updateFormData('businessName', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Enter your business name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Business Domain Email *
          </label>
          <input
            type="email"
            value={formData.domainEmail}
            onChange={(e) => updateFormData('domainEmail', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="admin@yourcompany.com"
            required
          />
          <p className="text-sm text-blue-200 mt-1">
            Use your business domain email for verification
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-3">
            Business Address *
          </label>
          <div className="space-y-3">
            <input
              type="text"
              value={formData.businessAddress.street}
              onChange={(e) => updateAddress('street', e.target.value)}
              className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Street Address"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={formData.businessAddress.city}
                onChange={(e) => updateAddress('city', e.target.value)}
                className="px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="City"
                required
              />
              <input
                type="text"
                value={formData.businessAddress.state}
                onChange={(e) => updateAddress('state', e.target.value)}
                className="px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="State"
                required
              />
            </div>
            <input
              type="text"
              value={formData.businessAddress.zipCode}
              onChange={(e) => updateAddress('zipCode', e.target.value)}
              className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="ZIP Code"
              required
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderContactStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <User className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">Primary Contact</h3>
        <p className="text-blue-200 mt-2">Who should we contact for this business?</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Contact Name *
          </label>
          <input
            type="text"
            value={formData.contactName}
            onChange={(e) => updateFormData('contactName', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Enter contact person name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Contact Email *
          </label>
          <input
            type="email"
            value={formData.contactEmail}
            onChange={(e) => updateFormData('contactEmail', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder={`contact@${formData.domainEmail.split('@')[1] || 'yourcompany.com'}`}
            required
          />
          <p className="text-sm text-blue-200 mt-1">
            Must use business domain: @{formData.domainEmail.split('@')[1] || 'yourcompany.com'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Contact Phone *
          </label>
          <input
            type="tel"
            value={formData.contactPhone}
            onChange={(e) => updateFormData('contactPhone', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="(619) 123-4567"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Job Title
          </label>
          <input
            type="text"
            value={formData.jobTitle}
            onChange={(e) => updateFormData('jobTitle', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="IT Manager, CEO, etc."
          />
        </div>
      </div>
    </div>
  );

  const renderAddressesStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <MapPin className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">Service Addresses</h3>
        <p className="text-blue-200 mt-2">Where should we provide services?</p>
      </div>

      <div className="space-y-6">
        {formData.serviceAddresses.map((address, index) => (
          <div key={index} className="border border-white/20 rounded-lg p-4 bg-white/5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-medium text-white">Service Location {index + 1}</h4>
              {formData.serviceAddresses.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeServiceAddress(index)}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={address.label}
                onChange={(e) => updateServiceAddress(index, 'label', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="Location name (e.g., Main Office, Warehouse)"
                required
              />

              <input
                type="text"
                value={address.address.street}
                onChange={(e) => updateServiceAddressField(index, 'street', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="Street Address"
                required
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={address.address.city}
                  onChange={(e) => updateServiceAddressField(index, 'city', e.target.value)}
                  className="px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="City"
                  required
                />
                <input
                  type="text"
                  value={address.address.state}
                  onChange={(e) => updateServiceAddressField(index, 'state', e.target.value)}
                  className="px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="State"
                  required
                />
              </div>

              <input
                type="text"
                value={address.address.zipCode}
                onChange={(e) => updateServiceAddressField(index, 'zipCode', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="ZIP Code"
                required
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={address.contactPerson || ''}
                  onChange={(e) => updateServiceAddress(index, 'contactPerson', e.target.value)}
                  className="px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="On-site contact (optional)"
                />
                <input
                  type="tel"
                  value={address.contactPhone || ''}
                  onChange={(e) => updateServiceAddress(index, 'contactPhone', e.target.value)}
                  className="px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="On-site phone (optional)"
                />
              </div>

              <textarea
                value={address.notes || ''}
                onChange={(e) => updateServiceAddress(index, 'notes', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="Special instructions or notes (optional)"
                rows={2}
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addServiceAddress}
          className="w-full py-3 px-4 border border-dashed border-white/30 text-white hover:border-white/50 hover:bg-white/5 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Service Address</span>
        </button>
      </div>
    </div>
  );

  const renderAccountStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">Create Account</h3>
        <p className="text-blue-200 mt-2">Set up your login credentials</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Password *
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => updateFormData('password', e.target.value)}
              className="w-full px-3 py-3 pr-10 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Enter secure password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-blue-300 hover:text-white" />
              ) : (
                <Eye className="h-5 w-5 text-blue-300 hover:text-white" />
              )}
            </button>
          </div>
          <p className="text-sm text-blue-200 mt-1">
            Minimum 8 characters required
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Confirm Password *
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => updateFormData('confirmPassword', e.target.value)}
              className="w-full px-3 py-3 pr-10 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Confirm your password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5 text-blue-300 hover:text-white" />
              ) : (
                <Eye className="h-5 w-5 text-blue-300 hover:text-white" />
              )}
            </button>
          </div>
        </div>

        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-300/30 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-300 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">Email Verification Required</p>
              <p>
                After registration, we'll send a verification email to your contact address.
                You must verify your email before accessing your account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderConfirmationStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>

      <div>
        <h3 className="text-2xl font-bold text-white mb-4">Check Your Email</h3>
        <p className="text-blue-200 mb-6">
          We've sent a verification email to:
        </p>
        <p className="text-white font-medium text-lg mb-6">
          {formData.contactEmail}
        </p>
        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-300/30 rounded-lg p-6 text-left">
          <h4 className="font-medium text-white mb-3">Next Steps:</h4>
          <ol className="list-decimal list-inside space-y-2 text-blue-200 text-sm">
            <li>Check your email inbox (and spam folder)</li>
            <li>Click the verification link in the email</li>
            <li>Complete your account setup</li>
            <li>Start using your client portal</li>
          </ol>
        </div>
      </div>

      <div className="pt-4">
        <button
          onClick={onSuccess}
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
        >
          Got it, thanks!
        </button>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'business':
        return renderBusinessStep();
      case 'contact':
        return renderContactStep();
      case 'addresses':
        return renderAddressesStep();
      case 'account':
        return renderAccountStep();
      case 'confirmation':
        return renderConfirmationStep();
      default:
        return renderBusinessStep();
    }
  };

  const getStepNumber = () => {
    const stepOrder: Step[] = ['business', 'contact', 'addresses', 'account', 'confirmation'];
    return stepOrder.indexOf(currentStep) + 1;
  };

  const isLastStep = currentStep === 'account';
  const isConfirmationStep = currentStep === 'confirmation';

  return (
    <div className="min-h-screen">
      <section
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white min-h-screen flex items-center justify-center overflow-hidden"
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
        {/* Background elements */}
        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}></div>
        </div>

        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{
            backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80")'
          }}
        />

        <div className="relative z-10 max-w-2xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
            {/* Progress indicator */}
            {!isConfirmationStep && (
              <div className="mb-8">
                <div className="flex items-center justify-between text-sm text-blue-200 mb-2">
                  <span>Step {getStepNumber()} of 4</span>
                  <button
                    onClick={onCancel}
                    className="text-blue-200 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-cyan-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(getStepNumber() / 4) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="mb-6 bg-red-500/20 backdrop-blur-sm border border-red-300/30 text-red-200 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Step content */}
            {renderCurrentStep()}

            {/* Navigation buttons */}
            {!isConfirmationStep && (
              <div className="flex justify-between mt-8 pt-6 border-t border-white/20">
                <button
                  onClick={prevStep}
                  disabled={currentStep === 'business'}
                  className="flex items-center space-x-2 px-6 py-3 text-white hover:bg-white/10 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>

                <button
                  onClick={isLastStep ? submitRegistration : nextStep}
                  disabled={loading}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Creating Account...</span>
                    </>
                  ) : isLastStep ? (
                    <>
                      <span>Create Account</span>
                      <CheckCircle className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ClientRegistration;