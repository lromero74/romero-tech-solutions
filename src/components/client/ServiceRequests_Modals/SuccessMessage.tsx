import React from 'react';
import { CheckCircle } from 'lucide-react';

interface SuccessMessageProps {
  message: string | null;
}

export const SuccessMessage: React.FC<SuccessMessageProps> = ({ message }) => {
  if (!message) {
    return null;
  }

  return (
    <div className="mx-6 mt-6 rounded-md bg-green-50 dark:bg-green-900/20 p-4 border border-green-200 dark:border-green-800">
      <div className="flex items-center">
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-3" />
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          {message}
        </p>
      </div>
    </div>
  );
};
