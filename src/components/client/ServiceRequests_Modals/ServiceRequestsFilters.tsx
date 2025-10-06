import React from 'react';
import { Search } from 'lucide-react';

interface ServiceRequestsFiltersProps {
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
  t: (key: string, params?: any, fallback?: string) => string;
  onFiltersChange: (filters: { search: string; status: string; hideClosed: boolean }) => void;
}

export const ServiceRequestsFilters: React.FC<ServiceRequestsFiltersProps> = ({
  filters,
  themeClasses,
  t,
  onFiltersChange
}) => {
  return (
    <div className="mt-4 flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${themeClasses.textSecondary}`} />
          <input
            type="text"
            placeholder={t('serviceRequests.searchPlaceholder', undefined, 'Search requests...')}
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className={`pl-10 pr-4 py-2 w-full border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
        </div>
      </div>
      <div className="sm:w-48">
        <select
          value={filters.status}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
          className={`w-full px-3 py-2 border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500`}
        >
          <option value="all">{t('serviceRequests.allStatuses', undefined, 'All Statuses')}</option>
          <option value="pending">{t('serviceRequests.pending', undefined, 'Pending')}</option>
          <option value="progress">{t('serviceRequests.inProgress', undefined, 'In Progress')}</option>
          <option value="completed">{t('serviceRequests.completed', undefined, 'Completed')}</option>
        </select>
      </div>
      <div className="flex items-center">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hideClosed}
            onChange={(e) => onFiltersChange({ ...filters, hideClosed: e.target.checked })}
            className="mr-2 h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className={`text-sm ${themeClasses.text} whitespace-nowrap`}>
            {t('serviceRequests.hideClosed', undefined, 'Hide Closed')}
          </span>
        </label>
      </div>
    </div>
  );
};
