import React, { useState } from 'react';
import { X, Calendar, Clock, RefreshCw } from 'lucide-react';

interface ServiceRequest {
  id: string;
  requestNumber: string;
  title: string;
  requestedDatetime?: string;
  requestedDurationMinutes?: number;
}

interface AdminRescheduleModalProps {
  serviceRequest: ServiceRequest;
  onClose: () => void;
  onReschedule: (requestId: string, newDateTime: Date, durationMinutes: number) => Promise<void>;
}

const AdminRescheduleModal: React.FC<AdminRescheduleModalProps> = ({
  serviceRequest,
  onClose,
  onReschedule
}) => {
  const [selectedDate, setSelectedDate] = useState(() => {
    if (serviceRequest.requestedDatetime) {
      const date = new Date(serviceRequest.requestedDatetime);
      return date.toISOString().split('T')[0];
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  const [selectedTime, setSelectedTime] = useState(() => {
    if (serviceRequest.requestedDatetime) {
      const date = new Date(serviceRequest.requestedDatetime);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return '09:00';
  });

  const [duration, setDuration] = useState(
    serviceRequest.requestedDurationMinutes ? serviceRequest.requestedDurationMinutes / 60 : 1
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const dateTime = new Date(selectedDate);
      dateTime.setHours(hours, minutes, 0, 0);

      const durationMinutes = Math.round(duration * 60);
      await onReschedule(serviceRequest.id, dateTime, durationMinutes);
      onClose();
    } catch (error) {
      console.error('Failed to reschedule:', error);
      setIsSubmitting(false);
    }
  };

  const formatDateTime = () => {
    if (!selectedDate || !selectedTime) return 'No time selected';

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const dateTime = new Date(selectedDate);
    dateTime.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(dateTime);
  };

  const formatCurrentDateTime = () => {
    if (!serviceRequest.requestedDatetime) return 'Not yet scheduled';

    const date = new Date(serviceRequest.requestedDatetime);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                  Reschedule Service Request
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {serviceRequest.title} ({serviceRequest.requestNumber})
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Current Schedule */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Schedule
                </h4>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Calendar className="h-4 w-4 mr-2" />
                  {formatCurrentDateTime()}
                </div>
                {serviceRequest.requestedDurationMinutes && (
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mt-1">
                    <Clock className="h-4 w-4 mr-2" />
                    Duration: {(serviceRequest.requestedDurationMinutes / 60).toFixed(1)} hours
                  </div>
                )}
              </div>

              {/* New Schedule */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  New Schedule
                </h4>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(parseFloat(e.target.value))}
                    min="0.5"
                    max="24"
                    step="0.5"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    New Scheduled Time
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    {formatDateTime()}
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Duration: {duration.toFixed(1)} hours
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
            <button
              onClick={handleSubmit}
              disabled={!selectedDate || !selectedTime || isSubmitting}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="animate-spin h-5 w-5 mr-2" />
                  Rescheduling...
                </>
              ) : (
                'Confirm Reschedule'
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRescheduleModal;
