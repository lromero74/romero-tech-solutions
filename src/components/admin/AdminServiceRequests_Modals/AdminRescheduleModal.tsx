import React from 'react';
import RescheduleModal from '../../client/ServiceRequests_Modals/RescheduleModal';
import { ServiceRequest as ClientServiceRequest } from '../../client/ServiceRequests_Modals/types';
import { useTheme } from '../../../contexts/ThemeContext';

interface AdminServiceRequest {
  id: string;
  request_number: string;
  title: string;
  requested_datetime?: string;
  requested_duration_minutes?: number;
  business_id?: string;
}

interface AdminRescheduleModalProps {
  serviceRequest: AdminServiceRequest;
  onClose: () => void;
  onReschedule: (requestId: string, newDateTime: Date, durationMinutes: number) => Promise<void>;
}

/**
 * Admin wrapper for client RescheduleModal
 * Reuses the full scheduling interface (calendar, auto-suggest, time slot scheduler)
 */
const AdminRescheduleModal: React.FC<AdminRescheduleModalProps> = ({
  serviceRequest,
  onClose,
  onReschedule
}) => {
  const { isDark } = useTheme();

  // Simple translation function for admin (English only)
  const adminTranslate = (key: string, params?: any, fallback?: string) => fallback || key;

  // Convert admin service request to client service request format
  const clientServiceRequest: ClientServiceRequest = {
    id: serviceRequest.id,
    requestNumber: serviceRequest.request_number,
    title: serviceRequest.title,
    description: '',
    status: '',
    priority: null,
    requestedDatetime: serviceRequest.requested_datetime || null,
    requestedDate: null,
    requestedTimeStart: null,
    requestedTimeEnd: null,
    requestedDurationMinutes: serviceRequest.requested_duration_minutes || null,
    location: null,
    serviceType: null,
    fileCount: 0,
    cost: null
  };

  // Extract businessId from service request
  const businessId = serviceRequest.business_id || '';

  return (
    <RescheduleModal
      serviceRequest={clientServiceRequest}
      businessId={businessId}
      onClose={onClose}
      onReschedule={onReschedule}
      isDarkMode={isDark}
      t={adminTranslate}
      language="en"
    />
  );
};

export default AdminRescheduleModal;
