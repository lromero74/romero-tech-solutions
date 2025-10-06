import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaginationInfo } from './types';

interface ServiceRequestsPaginationProps {
  pagination: PaginationInfo;
  loading: boolean;
  themeClasses: {
    border: string;
    text: string;
    textSecondary: string;
  };
  t: (key: string, params?: any, fallback?: string) => string;
  onPageChange: (page: number) => void;
}

export const ServiceRequestsPagination: React.FC<ServiceRequestsPaginationProps> = ({
  pagination,
  loading,
  themeClasses,
  t,
  onPageChange
}) => {
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-between">
      <div className={`text-sm ${themeClasses.textSecondary}`}>
        {t('serviceRequests.showingRequests', {
          start: String(((pagination.page - 1) * pagination.limit) + 1),
          end: String(Math.min(pagination.page * pagination.limit, pagination.totalCount)),
          total: String(pagination.totalCount)
        }, 'Showing {{start}} to {{end}} of {{total}} requests')}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={pagination.page <= 1 || loading}
          className={`p-2 rounded-md border ${themeClasses.border} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <ChevronLeft className={`h-4 w-4 ${themeClasses.textSecondary}`} />
        </button>
        <span className={`px-3 py-2 text-sm ${themeClasses.text}`}>
          {t('serviceRequests.pageOfPages', {
            page: String(pagination.page),
            totalPages: String(pagination.totalPages)
          }, '{{page}} of {{totalPages}}')}
        </span>
        <button
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={pagination.page >= pagination.totalPages || loading}
          className={`p-2 rounded-md border ${themeClasses.border} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <ChevronRight className={`h-4 w-4 ${themeClasses.textSecondary}`} />
        </button>
      </div>
    </div>
  );
};
