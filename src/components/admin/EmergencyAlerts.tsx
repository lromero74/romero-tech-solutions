import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  X,
  CheckCircle,
  Eye,
  ExternalLink
} from 'lucide-react';

interface EmergencyRequest {
  id: string;
  business_name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  service_type: string;
  urgency_level: string;
  location_name: string;
  location_address: string;
  description: string;
  scheduled_date: string;
  scheduled_time: string;
  created_at: string;
  status: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
}

interface EmergencyAlertsProps {
  onClose?: () => void;
  isMinimized?: boolean;
}

const EmergencyAlerts: React.FC<EmergencyAlertsProps> = ({ onClose, isMinimized = false }) => {
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  // Load emergency requests
  useEffect(() => {
    const loadEmergencyRequests = async () => {
      try {
        // TODO: Replace with actual API call
        // Simulating emergency requests for demo
        const mockData: EmergencyRequest[] = [
          {
            id: '1',
            business_name: 'The Salvation Army - San Diego',
            contact_name: 'Maria S. Lopez',
            contact_phone: '(619) 555-0123',
            contact_email: 'marias.lopez@salvationarmy-sandiego.org',
            service_type: 'Network Support',
            urgency_level: 'Emergency',
            location_name: 'Main Office',
            location_address: '1350 Hotel Circle N, San Diego, CA',
            description: 'Complete network outage affecting all operations. Unable to process donations or access donor database.',
            scheduled_date: new Date().toISOString().split('T')[0],
            scheduled_time: new Date(Date.now() + 30 * 60 * 1000).toTimeString().slice(0, 5), // 30 minutes from now
            created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
            status: 'pending'
          }
        ];

        setEmergencyRequests(mockData);
      } catch (error) {
        console.error('Failed to load emergency requests:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEmergencyRequests();

    // Refresh every 30 seconds
    const interval = setInterval(loadEmergencyRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  // Acknowledge emergency request
  const acknowledgeRequest = async (requestId: string) => {
    setAcknowledging(requestId);
    try {
      // TODO: API call to acknowledge emergency
      await new Promise(resolve => setTimeout(resolve, 1000));

      setEmergencyRequests(prev =>
        prev.map(req =>
          req.id === requestId
            ? { ...req, status: 'acknowledged', acknowledged_at: new Date().toISOString() }
            : req
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge emergency request:', error);
    } finally {
      setAcknowledging(null);
    }
  };

  // Dismiss emergency request
  const dismissRequest = (requestId: string) => {
    setEmergencyRequests(prev => prev.filter(req => req.id !== requestId));
  };

  // Get time since request was created
  const getTimeSince = (timestamp: string) => {
    const now = new Date();
    const created = new Date(timestamp);
    const diffMs = now.getTime() - created.getTime();
    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  };

  const pendingRequests = emergencyRequests.filter(req => req.status === 'pending');

  if (loading) {
    return (
      <div className="fixed top-4 right-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-lg shadow-lg z-50">
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500 mr-2"></div>
          <span className="text-red-700 dark:text-red-300 text-sm">Loading emergency alerts...</span>
        </div>
      </div>
    );
  }

  if (pendingRequests.length === 0) {
    return null; // No emergency requests to show
  }

  if (isMinimized) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <div className="bg-red-500 text-white p-3 rounded-full shadow-lg animate-pulse cursor-pointer hover:bg-red-600 transition-colors">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <span className="font-bold">{pendingRequests.length}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 max-w-md w-full z-50">
      <div className="bg-white dark:bg-gray-800 border-l-4 border-red-500 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-red-500 text-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 animate-bounce" />
              <h3 className="font-bold">🚨 EMERGENCY ALERTS</h3>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-white hover:text-red-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-red-100 text-xs mt-1">
            {pendingRequests.length} pending emergency request{pendingRequests.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Emergency Requests */}
        <div className="max-h-96 overflow-y-auto">
          {pendingRequests.map((request) => (
            <div key={request.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
              <div className="p-4 space-y-3">
                {/* Request Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <AlertTriangle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">
                        {request.service_type} - {request.urgency_level}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {getTimeSince(request.created_at)}
                    </p>
                  </div>
                </div>

                {/* Business Info */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {request.business_name}
                  </p>
                  <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <MapPin className="h-3 w-3 mr-1" />
                    {request.location_name} - {request.location_address}
                  </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-1">
                  <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <User className="h-3 w-3 mr-1" />
                    {request.contact_name}
                  </div>
                  <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <Phone className="h-3 w-3 mr-1" />
                    <a href={`tel:${request.contact_phone}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                      {request.contact_phone}
                    </a>
                  </div>
                  <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <Mail className="h-3 w-3 mr-1" />
                    <a href={`mailto:${request.contact_email}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                      {request.contact_email}
                    </a>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded p-2">
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    {request.description}
                  </p>
                </div>

                {/* Scheduled Time */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Scheduled: {new Date(request.scheduled_date + 'T' + request.scheduled_time).toLocaleString()}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <button
                    onClick={() => acknowledgeRequest(request.id)}
                    disabled={acknowledging === request.id}
                    className="flex-1 flex items-center justify-center px-3 py-2 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {acknowledging === request.id ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                    ) : (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    )}
                    Acknowledge
                  </button>
                  <button
                    onClick={() => dismissRequest(request.id)}
                    className="flex items-center justify-center px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View Details
                  </button>
                  <button
                    onClick={() => dismissRequest(request.id)}
                    className="flex items-center justify-center px-2 py-2 bg-gray-600 text-white text-xs font-medium rounded hover:bg-gray-700 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Auto-refreshes every 30 seconds
            </p>
            <button className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center">
              View All Requests
              <ExternalLink className="h-3 w-3 ml-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmergencyAlerts;