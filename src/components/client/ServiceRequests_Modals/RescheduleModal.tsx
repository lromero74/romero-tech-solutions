import React, { useState } from 'react';
import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiService } from '../../../services/apiService';
import ResourceTimeSlotScheduler from '../ResourceTimeSlotScheduler';
import { ServiceRequest } from './types';
import { generateCalendar, isToday, getMonthTranslationKey, getMonthShortTranslationKey, getDayTranslationKey } from '../ServiceScheduler/calendarUtils';

interface CostBreakdown {
  total: number;
  subtotal?: number;
  firstHourDiscount?: number;
  firstHourCompBreakdown?: {
    tierName: string;
    multiplier: number;
    hours: number;
    discount: number;
  }[];
  baseHourlyRate: number;
  rateCategoryName?: string;
  breakdown: {
    tierName: string;
    multiplier: number;
    hours: number;
    cost: number;
  }[];
  isFirstTimer?: boolean;
}

interface RescheduleModalProps {
  serviceRequest: ServiceRequest;
  onClose: () => void;
  onReschedule: (requestId: string, newDateTime: Date, durationMinutes: number, costBreakdown?: CostBreakdown) => Promise<void>;
  businessId: string;
  isDarkMode?: boolean;
  t?: (key: string, params?: any, fallback?: string) => string;
  language?: string;
}

const RescheduleModal: React.FC<RescheduleModalProps> = ({
  serviceRequest,
  onClose,
  onReschedule,
  businessId,
  isDarkMode = false,
  t = (key: string, params?: any, fallback?: string) => fallback || key,
  language = 'en'
}) => {

  const [showTimeSlotScheduler, setShowTimeSlotScheduler] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'year' | 'month' | 'week' | 'today'>('month');

  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    // Use scheduledDatetime for already scheduled appointments, fall back to requestedDatetime
    const datetime = serviceRequest.scheduledDatetime || serviceRequest.requestedDatetime;
    if (datetime) {
      return new Date(datetime);
    }
    return null;
  });

  const [selectedDuration, setSelectedDuration] = useState(
    serviceRequest.scheduledDurationMinutes
      ? serviceRequest.scheduledDurationMinutes / 60
      : serviceRequest.requestedDurationMinutes
        ? serviceRequest.requestedDurationMinutes / 60
        : 1
  );

  const [tierPreference, setTierPreference] = useState<'any' | 'standard' | 'premium' | 'emergency'>('standard');
  const [minDaysFromNow, setMinDaysFromNow] = useState<number>(0);
  const [isAutoSuggesting, setIsAutoSuggesting] = useState(false);

  // Use scheduledDatetime for already scheduled appointments, fall back to requestedDatetime
  const [suggestedStartTime, setSuggestedStartTime] = useState<Date | null>(() => {
    console.log('🔍 RescheduleModal - serviceRequest data:', {
      id: serviceRequest.id,
      requestNumber: serviceRequest.requestNumber,
      scheduledDatetime: serviceRequest.scheduledDatetime,
      requestedDatetime: serviceRequest.requestedDatetime,
      scheduledDate: serviceRequest.scheduledDate,
      scheduledTimeStart: serviceRequest.scheduledTimeStart,
      scheduledTimeEnd: serviceRequest.scheduledTimeEnd,
      scheduledDurationMinutes: serviceRequest.scheduledDurationMinutes,
      requestedDurationMinutes: serviceRequest.requestedDurationMinutes,
    });

    const datetime = serviceRequest.scheduledDatetime || serviceRequest.requestedDatetime;
    console.log('🔍 RescheduleModal - suggestedStartTime datetime:', datetime);
    return datetime ? new Date(datetime) : null;
  });

  const [suggestedEndTime, setSuggestedEndTime] = useState<Date | null>(() => {
    const datetime = serviceRequest.scheduledDatetime || serviceRequest.requestedDatetime;
    const durationMinutes = serviceRequest.scheduledDurationMinutes || serviceRequest.requestedDurationMinutes;
    console.log('🔍 RescheduleModal - suggestedEndTime:', { datetime, durationMinutes });
    if (datetime && durationMinutes) {
      return new Date(new Date(datetime).getTime() + durationMinutes * 60000);
    }
    return null;
  });

  // Auto-suggest available slot
  const handleAutoSuggest = async () => {
    const baseDate = selectedDate || new Date();
    const dateToSearch = new Date(baseDate);
    dateToSearch.setDate(dateToSearch.getDate() + minDaysFromNow);

    try {
      setIsAutoSuggesting(true);

      const result = await apiService.post<{ success: boolean; data?: any; message?: string }>(
        '/client/suggest-available-slot',
        {
          date: dateToSearch.toISOString().split('T')[0],
          durationHours: selectedDuration,
          tierPreference: tierPreference
        }
      );

      if (result.success && result.data) {
        const suggested = result.data;
        const startTime = new Date(suggested.startTime);
        const endTime = new Date(suggested.endTime);

        const suggestedDate = new Date(startTime);
        suggestedDate.setHours(0, 0, 0, 0);
        setSelectedDate(suggestedDate);

        setSuggestedStartTime(startTime);
        setSuggestedEndTime(endTime);

        // Open the time slot scheduler to show the suggested time
        setShowTimeSlotScheduler(true);
      } else {
        alert(result.message || t('scheduler.noSlotsAvailable', undefined, 'No available slots found for the selected criteria'));
      }
    } catch (error) {
      console.error('Auto-suggest error:', error);
      alert(t('scheduler.autoSuggestError', undefined, 'Error finding available slots'));
    } finally {
      setIsAutoSuggesting(false);
    }
  };

  const handleSlotSelect = async (
    resourceId: string,
    startTime: Date,
    endTime: Date,
    breakdown?: CostBreakdown
  ) => {
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    await onReschedule(serviceRequest.id, startTime, durationMinutes, breakdown);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    // Only reset suggested times if clicking a different date
    // For rescheduling, preserve the existing appointment times when clicking the same date
    if (selectedDate && date.toDateString() !== selectedDate.toDateString()) {
      setSuggestedStartTime(null);
      setSuggestedEndTime(null);
    }
    setShowTimeSlotScheduler(true);
  };

  const isDateValid = (date: Date) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date >= now;
  };

  // Convert flat array of days into array of weeks
  const getCalendarWeeks = () => {
    const days = generateCalendar(currentDate);
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  };

  const calendar = getCalendarWeeks();

  return (
    <>
      {/* Main Reschedule Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

          <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                    {t('serviceRequests.reschedule.title', {}, 'Reschedule Service Request')}
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
                {/* Duration, Tier Preference, and Auto-Suggest Controls */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('scheduler.preferences', undefined, 'Scheduling Preferences')}
                  </h4>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Duration Selector */}
                    <div className="flex items-center gap-2 min-w-fit">
                      <label className={`text-sm font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {t('scheduler.duration', undefined, 'Duration:')}
                      </label>
                      <select
                        value={selectedDuration}
                        onChange={(e) => setSelectedDuration(parseFloat(e.target.value))}
                        className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 appearance-none bg-no-repeat bg-right ${
                          isDarkMode
                            ? 'bg-gray-700 border-gray-600 text-white'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='${isDarkMode ? '%23D1D5DB' : '%236B7280'}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: 'right 0.5rem center',
                          backgroundSize: '1.5em 1.5em'
                        }}
                      >
                        {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map(hours => (
                          <option key={hours} value={hours}>
                            {hours} {hours === 1 ? t('scheduler.hour', undefined, 'hour') : t('scheduler.hours', undefined, 'hours')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tier Preference Selector */}
                    <div className="flex items-center gap-2 min-w-fit">
                      <label className={`text-sm font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {t('scheduler.tierPreference', undefined, 'Prefer:')}
                      </label>
                      <select
                        value={tierPreference}
                        onChange={(e) => setTierPreference(e.target.value as 'any' | 'standard' | 'premium' | 'emergency')}
                        className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 appearance-none bg-no-repeat bg-right ${
                          isDarkMode
                            ? 'bg-gray-700 border-gray-600 text-white'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='${isDarkMode ? '%23D1D5DB' : '%236B7280'}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: 'right 0.5rem center',
                          backgroundSize: '1.5em 1.5em'
                        }}
                      >
                        <option value="any">{t('scheduler.tierAny', undefined, 'Any Rate')}</option>
                        <option value="standard">{t('scheduler.tierStandard', undefined, 'Standard')}</option>
                        <option value="premium">{t('scheduler.tierPremium', undefined, 'Premium')}</option>
                        <option value="emergency">{t('scheduler.tierEmergency', undefined, 'Emergency')}</option>
                      </select>
                    </div>

                    {/* Days From Now Selector */}
                    <div className="flex items-center gap-2 min-w-fit">
                      <label className={`text-sm font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {t('scheduler.minDaysFromNow', undefined, 'Days from now:')}
                      </label>
                      <select
                        value={minDaysFromNow}
                        onChange={(e) => setMinDaysFromNow(parseInt(e.target.value))}
                        className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 appearance-none bg-no-repeat bg-right ${
                          isDarkMode
                            ? 'bg-gray-700 border-gray-600 text-white'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='${isDarkMode ? '%23D1D5DB' : '%236B7280'}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: 'right 0.5rem center',
                          backgroundSize: '1.5em 1.5em'
                        }}
                      >
                        <option value="0">{t('scheduler.daysFromNow.today', undefined, 'Today')}</option>
                        <option value="1">{t('scheduler.daysFromNow.tomorrow', undefined, 'Tomorrow')}</option>
                        <option value="2">{t('scheduler.daysFromNow.2days', undefined, '2 days')}</option>
                        <option value="3">{t('scheduler.daysFromNow.3days', undefined, '3 days')}</option>
                        <option value="5">{t('scheduler.daysFromNow.5days', undefined, '5 days')}</option>
                        <option value="7">{t('scheduler.daysFromNow.1week', undefined, '1 week')}</option>
                        <option value="14">{t('scheduler.daysFromNow.2weeks', undefined, '2 weeks')}</option>
                        <option value="30">{t('scheduler.daysFromNow.1month', undefined, '1 month')}</option>
                      </select>
                    </div>
                  </div>

                  {/* Auto-Suggest button */}
                  <div className="flex gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={handleAutoSuggest}
                      disabled={isAutoSuggesting}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm whitespace-nowrap"
                    >
                      <Sparkles className="h-4 w-4 flex-shrink-0" />
                      <span>
                        {isAutoSuggesting ? t('scheduler.finding', undefined, 'Finding...') : t('scheduler.autoSuggest', undefined, 'Auto-Suggest Available Slot')}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Calendar */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('schedule.selectDate', undefined, 'Select Date')}
                  </h4>
                  <div className={`border rounded-lg p-4 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between mb-4">
                      <button
                        type="button"
                        onClick={() => {
                          const newDate = new Date(currentDate);
                          newDate.setMonth(newDate.getMonth() - 1);
                          setCurrentDate(newDate);
                        }}
                        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      <div className="flex flex-col items-center">
                        <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {(() => {
                            const monthKey = getMonthShortTranslationKey(currentDate.getMonth());
                            const translation = t(monthKey);
                            if (translation === currentDate.getMonth().toString()) {
                              const monthNames = [
                                t('scheduler.months.jan', undefined, 'Jan'),
                                t('scheduler.months.feb', undefined, 'Feb'),
                                t('scheduler.months.mar', undefined, 'Mar'),
                                t('scheduler.months.apr', undefined, 'Apr'),
                                t('scheduler.months.may', undefined, 'May'),
                                t('scheduler.months.jun', undefined, 'Jun'),
                                t('scheduler.months.jul', undefined, 'Jul'),
                                t('scheduler.months.aug', undefined, 'Aug'),
                                t('scheduler.months.sep', undefined, 'Sep'),
                                t('scheduler.months.oct', undefined, 'Oct'),
                                t('scheduler.months.nov', undefined, 'Nov'),
                                t('scheduler.months.dec', undefined, 'Dec')
                              ];
                              return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
                            }
                            return `${translation} ${currentDate.getFullYear()}`;
                          })()}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const newDate = new Date(currentDate);
                          newDate.setMonth(newDate.getMonth() + 1);
                          setCurrentDate(newDate);
                        }}
                        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid gap-1 grid-cols-7">
                      {/* Day headers */}
                      {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => (
                        <div key={dayIndex} className={`p-2 text-center text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {t(`calendar.daysShort.${dayIndex}`, undefined, ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dayIndex])}
                        </div>
                      ))}

                      {/* Calendar days */}
                      {calendar.map((week, weekIdx) =>
                        week.map((date, dayIdx) => {
                          const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                          const isTodayDate = isToday(date);
                          const isSelected = selectedDate?.toDateString() === date.toDateString();
                          const isPastDate = date < new Date(new Date().setHours(0, 0, 0, 0));
                          const isValid = (isCurrentMonth && isDateValid(date)) || (!isCurrentMonth && !isPastDate);

                          return (
                            <button
                              key={`${weekIdx}-${dayIdx}`}
                              type="button"
                              onClick={() => isValid && handleDateClick(date)}
                              disabled={!isValid}
                              className={`p-2 text-sm rounded-lg ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : isTodayDate
                                  ? isDarkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-600'
                                  : isPastDate && isCurrentMonth
                                  ? isDarkMode ? 'text-gray-400 bg-red-900/20' : 'text-gray-600 bg-red-100/30'
                                  : isValid
                                  ? isDarkMode ? 'text-white hover:bg-gray-700' : 'text-gray-900 hover:bg-gray-100'
                                  : isDarkMode ? 'text-gray-600' : 'text-gray-400'
                              } ${!isCurrentMonth ? 'opacity-50' : ''} ${!isValid ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {date.getDate()}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
              <button
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
              >
                {t('common.cancel', {}, 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Time Slot Scheduler Modal (Child) */}
      {showTimeSlotScheduler && (() => {
        console.log('🔍 RescheduleModal - Rendering ResourceTimeSlotScheduler with props:', {
          suggestedStartTime,
          suggestedEndTime,
          initialSelectedStartTime: suggestedStartTime,
          initialSelectedEndTime: suggestedEndTime,
          excludeServiceRequestId: serviceRequest.id,
          initialIsFirstTimer: serviceRequest.cost?.isFirstRequest,
          initialBaseHourlyRate: serviceRequest.cost?.baseRate,
          initialRateCategoryName: serviceRequest.cost?.rateCategoryName
        });
        return (
          <ResourceTimeSlotScheduler
            selectedDate={selectedDate}
            onSlotSelect={handleSlotSelect}
            onDateChange={setSelectedDate}
            onClose={() => setShowTimeSlotScheduler(false)}
            businessId={businessId}
            initialDuration={selectedDuration}
            initialTierPreference={tierPreference}
            onDurationChange={setSelectedDuration}
            onTierPreferenceChange={setTierPreference}
            suggestedStartTime={suggestedStartTime}
            suggestedEndTime={suggestedEndTime}
            isDarkMode={isDarkMode}
            t={t}
            language={language}
            excludeServiceRequestId={serviceRequest.id}
            initialSelectedStartTime={suggestedStartTime}
            initialSelectedEndTime={suggestedEndTime}
            initialIsFirstTimer={serviceRequest.cost?.isFirstRequest}
            initialBaseHourlyRate={serviceRequest.cost?.baseRate}
            initialRateCategoryName={serviceRequest.cost?.rateCategoryName}
          />
        );
      })()}
    </>
  );
};

export default RescheduleModal;
