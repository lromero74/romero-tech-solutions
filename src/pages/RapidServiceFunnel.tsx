import React, { useState, useEffect } from 'react';
import { 
  User, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  AlertCircle, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  Loader2,
  Wrench,
  ShieldCheck
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { apiService } from '../services/apiService';

interface RapidServiceForm {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  businessName: string;
  isIndividual: boolean;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  issueTitle: string;
  issueDescription: string;
  urgency: string;
}

const RapidServiceFunnel: React.FC = () => {
  const { t } = useLanguage();
  const { isAuthenticated, isClient } = useEnhancedAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [ticketResult, setTicketResult] = useState<{ requestNumber: string; ticketId: string } | null>(null);

  const [formData, setFormData] = useState<RapidServiceForm>({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    businessName: '',
    isIndividual: true,
    address: {
      street: '',
      city: '',
      state: 'CA',
      zip: ''
    },
    issueTitle: '',
    issueDescription: '',
    urgency: 'Normal'
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setGuestId(urlParams.get('guest_id'));
    setDeviceName(urlParams.get('deviceName'));
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof RapidServiceForm] as any),
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Logic for Rapid Service will be:
      // 1. Send all data to backend.
      // 2. Backend checks if email exists.
      // 3. If exists -> backend sends magic link and returns email_exists: true.
      // 4. Frontend shows "Magic Link Sent" view.
      
      setStep(2);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        guestId,
        deviceName
      };

      const response = await fetch('/api/agents/guest/rapid-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        if (result.email_exists) {
          setStep(5); // Magic Link Sent step
        } else {
          setTicketResult({
            requestNumber: result.data.requestNumber,
            ticketId: result.data.ticketId
          });
          setStep(4); // Success step
        }
      } else {
        setError(result.message || 'Failed to submit service request');
      }
    } catch (err) {
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 text-blue-600 mb-4">
          <Mail className="h-8 w-8" />
        </div>
        <h2 className="text-3xl font-bold text-white">Let's Get Started</h2>
        <p className="text-blue-100 mt-2">Enter your email to verify your identity</p>
      </div>

      <form onSubmit={handleStep1Submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-blue-100 mb-1">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-300" />
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/25"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <>
              <span>Continue</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </form>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center space-x-4 mb-8">
        <button onClick={() => setStep(1)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-blue-200">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">Account Details</h2>
          <p className="text-blue-100 text-sm">Tell us about yourself and your business</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-blue-100 mb-1">First Name</label>
          <input
            type="text"
            name="firstName"
            required
            value={formData.firstName}
            onChange={handleInputChange}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-100 mb-1">Last Name</label>
          <input
            type="text"
            name="lastName"
            required
            value={formData.lastName}
            onChange={handleInputChange}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-100 mb-1">Phone Number</label>
        <input
          type="tel"
          name="phone"
          required
          value={formData.phone}
          onChange={handleInputChange}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-blue-100">Are you an individual or business?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, isIndividual: true }))}
            className={`py-3 px-4 rounded-xl border transition-all flex items-center justify-center space-x-2 ${
              formData.isIndividual ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-blue-200'
            }`}
          >
            <User className="h-4 w-4" />
            <span>Individual</span>
          </button>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, isIndividual: false }))}
            className={`py-3 px-4 rounded-xl border transition-all flex items-center justify-center space-x-2 ${
              !formData.isIndividual ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-blue-200'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Business</span>
          </button>
        </div>
      </div>

      {!formData.isIndividual && (
        <div className="animate-in fade-in slide-in-from-top-2">
          <label className="block text-sm font-medium text-blue-100 mb-1">Business Name</label>
          <input
            type="text"
            name="businessName"
            required={!formData.isIndividual}
            value={formData.businessName}
            onChange={handleInputChange}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-blue-100 border-b border-white/10 pb-2 flex items-center space-x-2">
          <MapPin className="h-4 w-4" />
          <span>Service Address</span>
        </h3>
        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">Street Address</label>
          <input
            type="text"
            name="address.street"
            required
            value={formData.address.street}
            onChange={handleInputChange}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-blue-300 mb-1">City</label>
            <input
              type="text"
              name="address.city"
              required
              value={formData.address.city}
              onChange={handleInputChange}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-blue-300 mb-1">Zip Code</label>
            <input
              type="text"
              name="address.zip"
              required
              value={formData.address.zip}
              onChange={handleInputChange}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <button
        onClick={() => setStep(3)}
        className="w-full flex items-center justify-center space-x-2 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg"
      >
        <span>Next: Issue Details</span>
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center space-x-4 mb-8">
        <button onClick={() => setStep(2)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-blue-200">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">How can we help?</h2>
          <p className="text-blue-100 text-sm">Describe the issue you're experiencing</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-100 mb-1">Brief Summary</label>
        <input
          type="text"
          name="issueTitle"
          required
          value={formData.issueTitle}
          onChange={handleInputChange}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Computer won't start, Internet is slow"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-100 mb-1">Detailed Description</label>
        <textarea
          name="issueDescription"
          required
          rows={4}
          value={formData.issueDescription}
          onChange={handleInputChange}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Please provide as much detail as possible..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-100 mb-2">Urgency Level</label>
        <select
          name="urgency"
          value={formData.urgency}
          onChange={handleInputChange}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
        >
          <option value="Normal" className="bg-slate-800 text-white">Normal - Standard response</option>
          <option value="Urgent" className="bg-slate-800 text-white">Urgent - Business impacted</option>
          <option value="Critical" className="bg-slate-800 text-white">Critical - Business down</option>
        </select>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl flex items-start space-x-3 text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleFinalSubmit}
        disabled={loading}
        className="w-full flex items-center justify-center space-x-2 py-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/25"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <>
            <Wrench className="h-5 w-5" />
            <span>Submit Service Request</span>
          </>
        )}
      </button>
    </div>
  );

  const renderStep4 = () => (
    <div className="text-center py-8 animate-in fade-in zoom-in duration-500">
      <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-green-100 text-green-600 mb-6">
        <CheckCircle className="h-12 w-12" />
      </div>
      <h2 className="text-4xl font-bold text-white mb-2">Request Submitted!</h2>
      <p className="text-blue-100 text-lg mb-8">
        Your service request <strong>{ticketResult?.requestNumber}</strong> has been created.
      </p>

      <div className="bg-white/10 border border-white/20 rounded-2xl p-6 text-left mb-8">
        <h3 className="font-bold text-white mb-4 flex items-center space-x-2">
          <ShieldCheck className="h-5 w-5 text-blue-400" />
          <span>What happens next?</span>
        </h3>
        <ul className="space-y-4 text-blue-100">
          <li className="flex items-start space-x-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-xs font-bold">1</span>
            <span>A technician will review your request and contact you shortly.</span>
          </li>
          <li className="flex items-start space-x-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-xs font-bold">2</span>
            <span>Your RTS Agent will automatically activate and begin monitoring once your account is verified.</span>
          </li>
          <li className="flex items-start space-x-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-xs font-bold">3</span>
            <span>You can now access your dashboard to track this and future requests.</span>
          </li>
        </ul>
      </div>

      <button
        onClick={() => window.location.href = '/dashboard'}
        className="w-full py-4 bg-white text-blue-900 font-bold rounded-xl hover:bg-blue-50 transition-colors shadow-xl"
      >
        Go to Dashboard
      </button>
    </div>
  );

  const renderStep5 = () => (
    <div className="text-center py-8 animate-in fade-in zoom-in duration-500">
      <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-blue-100 text-blue-600 mb-6">
        <Mail className="h-12 w-12" />
      </div>
      <h2 className="text-3xl font-bold text-white mb-4">Check Your Inbox</h2>
      <p className="text-blue-100 text-lg mb-8">
        We found an existing account for <strong>{formData.email}</strong>.
        A magic link has been sent to your inbox to continue your request.
      </p>

      <div className="p-6 bg-blue-900/30 border border-blue-400/30 rounded-2xl mb-8">
        <p className="text-sm text-blue-200">
          Once you click the link in your email, you will be logged in and we'll automatically 
          re-open your service request form to complete your submission.
        </p>
      </div>

      <button
        onClick={() => window.close()}
        className="w-full py-4 border border-white/20 text-white font-bold rounded-xl hover:bg-white/10 transition-colors"
      >
        Close Window
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 pt-20 pb-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Progress indicator */}
        {step < 4 && (
          <div className="flex items-center justify-center space-x-2 mb-8">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-500 ${
                  s === step ? 'w-12 bg-blue-500' : s < step ? 'w-8 bg-blue-800' : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>
        )}

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>

        {step < 4 && (
          <div className="mt-8 text-center text-slate-500 text-sm">
            <p>© 2025 Romero Tech Solutions. Security verified.</p>
            {deviceName && <p className="mt-1">Requesting from: <span className="text-blue-400/80">{deviceName}</span></p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default RapidServiceFunnel;