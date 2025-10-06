import React from 'react';
import { User, FileText, MapPin, Phone, Mail } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequest } from './types';

interface ServiceRequestsMobileViewProps {
  requests: ServiceRequest[];
  isDark: boolean;
  onViewRequest: (request: ServiceRequest) => void;
  onViewInvoice: (invoiceId: string) => void;
  formatDate: (isoString: string | null) => string;
  formatTime: (isoString: string | null) => string;
  formatFullAddress: (locationDetails: ServiceRequest['locationDetails']) => string;
  getMapUrl: (locationDetails: ServiceRequest['locationDetails']) => string;
  formatPhone: (phone: string | null | undefined) => string;
  getStatusIcon: (status: string) => JSX.Element;
}

const ServiceRequestsMobileView: React.FC<ServiceRequestsMobileViewProps> = ({
  requests,
  isDark,
  onViewRequest,
  onViewInvoice,
  formatDate,
  formatTime,
  formatFullAddress,
  getMapUrl,
  formatPhone,
  getStatusIcon
}) => {
  return (
    <div className="md:hidden space-y-4">
      {requests.map((request) => (
        <div
          key={request.id}
          onClick={() => onViewRequest(request)}
          className={`${themeClasses.bg.card} ${themeClasses.border.primary} border rounded-lg p-4 ${themeClasses.bg.hover} transition-colors cursor-pointer`}
        >
          {/* Request Number and Status */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className={`font-mono text-sm font-medium ${themeClasses.text.primary}`}>
                {request.request_number}
              </span>
              <div className={`text-xs ${themeClasses.text.muted} mt-1`}>
                {request.requested_datetime ? formatDate(request.requested_datetime) : formatDate(request.requested_date)}
                {request.requested_datetime
                  ? ` • ${formatTime(request.requested_datetime)}`
                  : (request.requested_time_start && ` • ${request.requested_time_start}`)}
              </div>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                request.status.toLowerCase() === 'cancelled'
                  ? 'bg-gray-500 text-white'
                  : request.status.toLowerCase() === 'submitted'
                  ? 'bg-blue-600 text-white'
                  : request.status.toLowerCase() === 'acknowledged'
                  ? `bg-orange-500 ${isDark ? 'text-white' : 'text-black'}`
                  : themeClasses.text.primary
              }`}
              style={
                request.status.toLowerCase() === 'cancelled' ||
                request.status.toLowerCase() === 'submitted' ||
                request.status.toLowerCase() === 'acknowledged'
                  ? {}
                  : { backgroundColor: `${request.status_color}20` }
              }
            >
              {getStatusIcon(request.status)}
              <span className="ml-1">{request.status}</span>
            </span>
          </div>

          {/* Title and Business */}
          <div className="mb-3">
            <div className={`text-sm font-medium ${themeClasses.text.primary} mb-1`}>
              {request.title}
            </div>
            <div className={`text-xs ${themeClasses.text.muted}`}>
              {request.is_individual ? 'Individual' : request.business_name}
            </div>
          </div>

          {/* Client Info */}
          <div className="mb-3">
            <div className={`text-xs ${themeClasses.text.muted} mb-1`}>Client</div>
            <div className={`text-sm font-medium ${themeClasses.text.primary} mb-1`}>{request.client_name}</div>

            {/* Service Location Address (first) */}
            {request.locationDetails && (
              <a
                href={getMapUrl(request.locationDetails)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`flex items-start text-xs ${themeClasses.text.link} hover:underline mb-1`}
              >
                <MapPin className="h-3 w-3 mr-1 flex-shrink-0 mt-0.5" />
                <span className="break-words">{formatFullAddress(request.locationDetails)}</span>
              </a>
            )}

            {/* Client Contact Info */}
            <div className="space-y-1">
              {request.client_phone && (
                <a
                  href={`tel:${request.client_phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className={`flex items-center text-xs ${themeClasses.text.link} hover:underline`}
                >
                  <Phone className="h-3 w-3 mr-1 flex-shrink-0" />
                  {formatPhone(request.client_phone)}
                </a>
              )}
              {request.client_email && (
                <a
                  href={`mailto:${request.client_email}`}
                  onClick={(e) => e.stopPropagation()}
                  className={`flex items-center text-xs ${themeClasses.text.link} hover:underline`}
                >
                  <Mail className="h-3 w-3 mr-1 flex-shrink-0" />
                  {request.client_email}
                </a>
              )}
            </div>
          </div>

          {/* Technician */}
          <div className="mb-3">
            <div className={`text-xs ${themeClasses.text.muted} mb-1`}>Technician</div>
            <div className={`text-sm ${themeClasses.text.primary}`}>
              {request.technician_name ? (
                <span className="flex items-center">
                  <User className="h-3 w-3 mr-1" />
                  {request.technician_name}
                </span>
              ) : (
                <span className={themeClasses.text.muted}>Unassigned</span>
              )}
            </div>
          </div>

          {/* Urgency */}
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${themeClasses.text.primary}`}
              style={{ backgroundColor: `${request.urgency_color}20` }}
            >
              {request.urgency}
            </span>
            {request.invoice_id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewInvoice(request.invoice_id!);
                }}
                className="text-green-600 dark:text-green-400 hover:underline flex items-center text-xs"
              >
                <FileText className="h-3 w-3 mr-1" />
                Invoice
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ServiceRequestsMobileView;
