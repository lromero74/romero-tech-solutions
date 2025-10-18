import React, { useState } from 'react';
import { X } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { deploymentService } from '../../../services/deploymentService';

interface CreateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateScheduleModal: React.FC<CreateScheduleModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    schedule_name: '',
    description: '',
    schedule_type: 'daily' as 'daily' | 'weekly' | 'monthly' | 'once',
    start_time: '',
    end_time: '',
    day_of_week: 0,
    window_duration_minutes: 120,
    is_active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.schedule_name.trim()) {
        setError('Schedule name is required');
        setLoading(false);
        return;
      }

      // Validate time fields if provided
      if (formData.start_time && formData.end_time) {
        if (formData.start_time >= formData.end_time) {
          setError('End time must be after start time');
          setLoading(false);
          return;
        }
      }

      const response = await deploymentService.createSchedule({
        schedule_name: formData.schedule_name.trim(),
        description: formData.description.trim() || undefined,
        schedule_type: formData.schedule_type,
        start_time: formData.start_time || undefined,
        end_time: formData.end_time || undefined,
        day_of_week: formData.schedule_type === 'weekly' ? formData.day_of_week : undefined,
        window_duration_minutes: formData.window_duration_minutes,
        is_active: formData.is_active,
      });

      if (response.success) {
        // Reset form
        setFormData({
          schedule_name: '',
          description: '',
          schedule_type: 'daily',
          start_time: '',
          end_time: '',
          day_of_week: 0,
          window_duration_minutes: 120,
          is_active: true,
        });
        onSuccess();
        onClose();
      } else {
        setError(response.message || 'Failed to create schedule');
      }
    } catch (err) {
      setError('An error occurred while creating the schedule');
      console.error('Create schedule error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getDayName = (day: number): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Create Deployment Schedule</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Error Display */}
            {error && (
              <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Schedule Name */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Schedule Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.schedule_name}
                onChange={(e) => handleInputChange('schedule_name', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                placeholder="e.g., Nightly Maintenance Window"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                rows={3}
                placeholder="Describe when this maintenance window occurs..."
              />
            </div>

            {/* Schedule Type */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Schedule Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.schedule_type}
                onChange={(e) => handleInputChange('schedule_type', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                required
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="once">One-Time</option>
              </select>
              <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                {formData.schedule_type === 'daily' && 'Maintenance window runs every day'}
                {formData.schedule_type === 'weekly' && 'Maintenance window runs on a specific day of the week'}
                {formData.schedule_type === 'monthly' && 'Maintenance window runs monthly'}
                {formData.schedule_type === 'once' && 'Maintenance window runs only once'}
              </p>
            </div>

            {/* Day of Week (only for weekly) */}
            {formData.schedule_type === 'weekly' && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Day of Week <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.day_of_week}
                  onChange={(e) => handleInputChange('day_of_week', parseInt(e.target.value))}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  required={formData.schedule_type === 'weekly'}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <option key={day} value={day}>
                      {getDayName(day)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Time Window */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Start Time
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => handleInputChange('start_time', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                />
                <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                  When the maintenance window begins
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  End Time
                </label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => handleInputChange('end_time', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                />
                <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                  When the maintenance window ends
                </p>
              </div>
            </div>

            {/* Window Duration */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Window Duration (minutes)
              </label>
              <input
                type="number"
                value={formData.window_duration_minutes}
                onChange={(e) => handleInputChange('window_duration_minutes', parseInt(e.target.value) || 120)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                min={15}
                max={1440}
                step={15}
              />
              <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                Maximum duration for deployments during this window (15-1440 minutes)
              </p>
            </div>

            {/* Active Status */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  className="mr-2"
                />
                <span className={themeClasses.text.primary}>Activate schedule immediately</span>
              </label>
              <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                Inactive schedules will not be used for deployments
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2 rounded-lg ${themeClasses.button.secondary}`}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={`px-6 py-2 rounded-lg ${themeClasses.button.primary}`}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateScheduleModal;
