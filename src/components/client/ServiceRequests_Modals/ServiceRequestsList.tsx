import React from 'react';
import {
  Clock,
  Calendar,
  MapPin,
  FileText,
  Eye,
  X
} from 'lucide-react';
import { ServiceRequest } from './types';
import { getStatusColor, getPriorityColor, canCancelRequest, formatDateTime, getLocale } from './utils';
import { formatLongDate } from '../../../utils/dateFormatter';
import { formatTimeOnly } from '../../../utils/timezoneUtils';

interface ServiceRequestsListProps {
  requests: ServiceRequest[];
  filters: {
    search: string;
    status: string;
    hideClosed: boolean;
  };
  themeClasses: {
    background: string;
    border: string;
    text: string;
    textSecondary: string;
  };
  isDarkMode: boolean;
  language: string;
  t: (key: string, params?: any, fallback?: string) => string;
  onViewRequest: (request: ServiceRequest) => void;
  onCancelRequest: (request: ServiceRequest) => void;
}

export const ServiceRequestsList: React.FC<ServiceRequestsListProps> = ({
  requests,
  filters,
  themeClasses,
  isDarkMode,
  language,
  t,
  onViewRequest,
  onCancelRequest
}) => {
  if (requests.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <FileText className={`h-12 w-12 ${themeClasses.textSecondary} mx-auto mb-4`} />
        <p className={`${themeClasses.textSecondary}`}>
          {filters.search || filters.status !== 'all' || filters.hideClosed
            ? t('serviceRequests.noFilteredResults', undefined, 'No service requests match your filters')
            : t('serviceRequests.noRequests', undefined, 'No service requests found')
          }
        </p>
      </div>
    );
  }

  return (
    <>
      {requests.map((request) => (
        <div key={request.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className={`font-medium ${themeClasses.text} truncate`}>
                  {request.title}
                </h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status, isDarkMode)}`}>
                  {t(`status.${request.status}`, undefined, request.status)}
                </span>
                {request.priority && (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(request.priority)}`}>
                    {t(`priority.${request.priority}`, undefined, request.priority)}
                  </span>
                )}
              </div>

              <p className={`text-sm ${themeClasses.textSecondary} mb-2`}>
                #{request.requestNumber}
              </p>

              {request.description && (
                <p className={`text-sm ${themeClasses.textSecondary} mb-3 line-clamp-2`}>
                  {request.description}
                </p>
              )}

              {/* Date and Time Block */}
              {request.cost && (request.requestedDatetime || (request.requestedDate && request.requestedTimeStart && request.requestedTimeEnd)) && (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{t('serviceRequests.scheduledDateTime', undefined, 'Scheduled Date & Time')}</h4>
                  {request.requestedDatetime && request.requestedDurationMinutes ? (
                    <>
                      <div className="text-sm text-blue-800 dark:text-blue-200 mb-1">
                        {formatLongDate(new Date(request.requestedDatetime), t, language)}
                      </div>
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        {formatTimeOnly(request.requestedDatetime)} - {formatTimeOnly(new Date(new Date(request.requestedDatetime).getTime() + request.requestedDurationMinutes * 60000))} ({(request.requestedDurationMinutes / 60).toFixed(1)}h)
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-blue-800 dark:text-blue-200 mb-1">
                        {formatLongDate(new Date(request.requestedDate!), t, language)}
                      </div>
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        {request.requestedTimeStart!.substring(0, 5)} - {request.requestedTimeEnd!.substring(0, 5)} ({request.cost.durationHours}h)
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Cost Estimate Block */}
              {request.cost && (
                <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">{t('serviceRequests.costEstimate', undefined, 'Cost Estimate')}</h4>
                  <div className="text-xs text-green-700 dark:text-green-300 mb-1">
                    {t('serviceRequests.baseRatePerHour', { rate: String(request.cost.baseRate) }, 'Base Rate: ${{rate}}/hr')} ({request.cost.rateCategoryName || 'Standard'})
                  </div>
                  {/* Tier Breakdown */}
                  {request.cost.breakdown && request.cost.breakdown.map((block, idx) => (
                    <div key={idx} className="text-xs text-green-700 dark:text-green-300">
                      {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                    </div>
                  ))}
                  {/* First Hour Discount */}
                  {request.cost.firstHourDiscount && request.cost.firstHourDiscount > 0 && (
                    <>
                      <div className="text-xs text-green-700 dark:text-green-300 mt-1 pt-1 border-t border-green-200 dark:border-green-700">
                        {t('serviceRequests.subtotal', undefined, 'subtotal')}: ${request.cost.subtotal?.toFixed(2)}
                      </div>
                      <div className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">
                        {t('serviceRequests.firstHourComp', undefined, 'First Hour Comp (New Client)')}:
                      </div>
                      {request.cost.firstHourCompBreakdown?.map((compBlock, idx) => (
                        <div key={idx} className="text-xs text-green-700 dark:text-green-300 ml-4">
                          • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                        </div>
                      ))}
                      {request.cost.firstHourCompBreakdown && request.cost.firstHourCompBreakdown.length > 1 && (
                        <div className="text-xs text-green-700 dark:text-green-300 font-medium ml-4">
                          {t('serviceRequests.totalDiscount', undefined, 'Total Discount')}: -${request.cost.firstHourDiscount.toFixed(2)}
                        </div>
                      )}
                    </>
                  )}
                  <div className="mt-1 pt-1 border-t border-green-200 dark:border-green-700 text-sm font-semibold text-green-900 dark:text-green-100">
                    {t('serviceRequests.totalEstimate', { total: request.cost.total.toFixed(2) }, 'Total*: ${{total}}')}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1 italic">
                    * {t('scheduler.costDisclaimer', undefined, 'Actual cost may vary based on time required to complete the service')}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {request.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{request.location}</span>
                  </div>
                )}
                {request.serviceType && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{request.serviceType}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDateTime(request.requestedDatetime, request.requestedDate, request.requestedTimeStart, t, getLocale(language))}</span>
                </div>
                {request.fileCount > 0 && (
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{request.fileCount} {request.fileCount === 1 ? t('serviceRequests.file', 'file') : t('serviceRequests.files', 'files')}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="ml-4 flex items-center gap-2">
              {canCancelRequest(request) && (
                <button
                  onClick={() => onCancelRequest(request)}
                  className={`p-2 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors`}
                  title={t('serviceRequests.cancel', undefined, 'Cancel')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onViewRequest(request)}
                className={`p-2 rounded-md border ${themeClasses.border} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
              >
                <Eye className={`h-4 w-4 ${themeClasses.textSecondary}`} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
};
