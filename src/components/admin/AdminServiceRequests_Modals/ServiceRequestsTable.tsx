import React from 'react';
import { User, FileText } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequest } from './types';

interface ServiceRequestsTableProps {
  requests: ServiceRequest[];
  isDark: boolean;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  onSort: (column: string) => void;
  onViewRequest: (request: ServiceRequest) => void;
  onViewInvoice: (invoiceId: string) => void;
  formatDate: (isoString: string | null) => string;
  formatTime: (isoString: string | null) => string;
  getStatusIcon: (status: string) => JSX.Element;
  highlightedRequestIds?: string[];
}

const ServiceRequestsTable: React.FC<ServiceRequestsTableProps> = ({
  requests,
  isDark,
  sortBy,
  sortOrder,
  onSort,
  onViewRequest,
  onViewInvoice,
  formatDate,
  formatTime,
  getStatusIcon,
  highlightedRequestIds = []
}) => {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full">
        <thead className={`${themeClasses.bg.secondary} border-b ${themeClasses.border.primary}`}>
          <tr>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('request_number')}>
              Request #
            </th>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('title')}>
              Title
            </th>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
              Status
            </th>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
              Urgency
            </th>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
              Client
            </th>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
              Technician
            </th>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                onClick={() => onSort('requested_date')}>
              Requested Date
            </th>
            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {requests.map((request) => {
            const isHighlighted = highlightedRequestIds.includes(request.id);
            return (
            <tr
              key={request.id}
              className={`${themeClasses.bg.hover} transition-colors cursor-pointer ${
                isHighlighted ? 'ring-4 ring-blue-500 ring-opacity-75 animate-pulse' : ''
              }`}
              onClick={() => onViewRequest(request)}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`font-mono text-sm ${themeClasses.text.primary}`}>
                  {request.request_number}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                  {request.title}
                </div>
                <div className={`text-xs ${themeClasses.text.muted}`}>
                  {request.is_individual ? 'Individual' : request.business_name}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    (request.status || '').toLowerCase() === 'cancelled'
                      ? 'bg-gray-500 text-white'
                      : (request.status || '').toLowerCase() === 'submitted'
                      ? 'bg-blue-600 text-white'
                      : (request.status || '').toLowerCase() === 'acknowledged'
                      ? `bg-orange-500 ${isDark ? 'text-white' : 'text-black'}`
                      : themeClasses.text.primary
                  }`}
                  style={
                    (request.status || '').toLowerCase() === 'cancelled' ||
                    (request.status || '').toLowerCase() === 'submitted' ||
                    (request.status || '').toLowerCase() === 'acknowledged'
                      ? {}
                      : { backgroundColor: `${request.status_color || '#ccc'}20` }
                  }
                >
                  {getStatusIcon(request.status || 'Unknown')}
                  <span className="ml-1">{request.status || 'Unknown'}</span>
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${themeClasses.text.primary}`}
                  style={{ backgroundColor: `${request.urgency_color}20` }}
                >
                  {request.urgency}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className={`text-sm ${themeClasses.text.primary}`}>{request.client_name}</div>
                <div className={`text-xs ${themeClasses.text.muted}`}>{request.client_email}</div>
              </td>
              <td className="px-6 py-4">
                {request.technician_name ? (
                  <div className={`text-sm flex items-center ${themeClasses.text.primary}`}>
                    <User className="h-4 w-4 mr-1" />
                    {request.technician_name}
                  </div>
                ) : (
                  <span className={`text-sm ${themeClasses.text.muted}`}>Unassigned</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className={`text-sm ${themeClasses.text.primary}`}>
                  {request.requested_datetime ? formatDate(request.requested_datetime) : formatDate(request.requested_date)}
                </div>
                <div className={`text-xs ${themeClasses.text.muted}`}>
                  {request.requested_datetime ? formatTime(request.requested_datetime) : (request.requested_time_start || '')}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewRequest(request);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View Details
                  </button>
                  {request.invoice_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewInvoice(request.invoice_id!);
                      }}
                      className="text-green-600 dark:text-green-400 hover:underline flex items-center"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      View Invoice
                    </button>
                  )}
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ServiceRequestsTable;
