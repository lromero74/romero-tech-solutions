import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, X, Sparkles } from 'lucide-react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import { apiService } from '../../services/apiService';

interface TimeSlot {
  time: string;
  hour: number;
  minute: number;
  isAvailable: boolean;
  isPast: boolean;
  isBlocked: boolean;
  blockReason?: string;
  rateTier?: RateTier;
}

interface RateTier {
  id: string;
  tierName: string;
  tierLevel: number;
  dayOfWeek: number;
  timeStart: string;
  timeEnd: string;
  rateMultiplier: number;
  colorCode: string;
  description: string;
}

interface ExistingBooking {
  id: string;
  startTime: Date;
  endTime: Date;
  clientName: string;
  serviceType: string;
  isOwnBooking: boolean;
}

interface ResourceTimeSlotSchedulerProps {
  selectedDate: Date;
  onSlotSelect: (resourceId: string, startTime: Date, endTime: Date) => void;
  onClose: () => void;
  businessId: string;
}

const ResourceTimeSlotScheduler: React.FC<ResourceTimeSlotSchedulerProps> = ({
  selectedDate,
  onSlotSelect,
  onClose,
  businessId
}) => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();

  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [selectedStartTime, setSelectedStartTime] = useState<Date | null>(null);
  const [selectedEndTime, setSelectedEndTime] = useState<Date | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(1); // Default 1 hour
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'move' | 'resize-start' | 'resize-end' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isAutoSuggesting, setIsAutoSuggesting] = useState(false);
  const [rateTiers, setRateTiers] = useState<RateTier[]>([]);

  const BUFFER_HOURS = 1;

  // Helper function to find rate tier for a given time
  const findRateTierForTime = (hour: number, minute: number, dayOfWeek: number): RateTier | undefined => {
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

    // Find matching tier for this day and time
    const matchingTier = rateTiers.find(tier => {
      if (tier.dayOfWeek !== dayOfWeek) return false;

      // Compare time strings
      return timeString >= tier.timeStart && timeString < tier.timeEnd;
    });

    // If no exact match, find the highest priority tier (Emergency > Premium > Standard)
    if (!matchingTier && rateTiers.length > 0) {
      const tiersForDay = rateTiers.filter(t => t.dayOfWeek === dayOfWeek);
      return tiersForDay.sort((a, b) => b.tierLevel - a.tierLevel)[0];
    }

    return matchingTier;
  };

  // Check if selected time range includes emergency hours
  const getSelectedTimeRateInfo = () => {
    if (!selectedStartTime || !selectedEndTime) return null;

    const dayOfWeek = selectedStartTime.getDay();
    let hasEmergency = false;
    let hasPremium = false;
    let hasStandard = false;
    let maxMultiplier = 1.0;

    // Check each 30-minute slot in the selected range
    let currentTime = new Date(selectedStartTime);
    while (currentTime < selectedEndTime) {
      const tier = findRateTierForTime(
        currentTime.getHours(),
        currentTime.getMinutes(),
        dayOfWeek
      );

      if (tier) {
        maxMultiplier = Math.max(maxMultiplier, tier.rateMultiplier);
        if (tier.tierLevel === 3) hasEmergency = true;
        else if (tier.tierLevel === 2) hasPremium = true;
        else if (tier.tierLevel === 1) hasStandard = true;
      }

      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000); // Add 30 minutes
    }

    return {
      hasEmergency,
      hasPremium,
      hasStandard,
      maxMultiplier,
      tierName: hasEmergency ? 'Emergency' : hasPremium ? 'Premium' : 'Standard'
    };
  };

  const selectedRateInfo = getSelectedTimeRateInfo();

  // Scroll to current time
  const scrollToNow = () => {
    const now = new Date();
    if (now.toDateString() !== selectedDate.toDateString()) return;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentSlotIndex = hours * 2 + Math.floor(minutes / 30);
    const scrollPosition = currentSlotIndex * 64; // 64px per slot

    const container = document.getElementById('timeline-scroll');
    if (container) {
      container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    }
  };

  // Generate time slots for the day (30-minute intervals, 24 hours)
  const timeSlots = useMemo(() => {
    const slots: TimeSlot[] = [];
    const currentTime = new Date();
    const minimumTime = new Date(currentTime.getTime() + (1 * 60 * 60 * 1000)); // 1 hour from now
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Generate slots for full 24 hours (0-23)
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotTime = new Date(selectedDate);
        slotTime.setHours(hour, minute, 0, 0);

        const isPast = slotTime < minimumTime;
        const rateTier = findRateTierForTime(hour, minute, dayOfWeek);

        slots.push({
          time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          hour,
          minute,
          isAvailable: !isPast,
          isPast,
          isBlocked: false,
          rateTier
        });
      }
    }

    return slots;
  }, [selectedDate, rateTiers]);

  // Load rate tiers and existing bookings
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load rate tiers
        const tiersResult = await apiService.get<{ success: boolean; data: RateTier[] }>(
          '/client/rate-tiers'
        );
        if (tiersResult.success) {
          setRateTiers(tiersResult.data);
        }

        // Load bookings
        const bookingsResult = await apiService.get<{ success: boolean; data: any[] }>(
          `/client/bookings?date=${selectedDate.toISOString().split('T')[0]}`
        );
        if (bookingsResult.success) {
          const bookings = bookingsResult.data.map((b: any) => ({
            ...b,
            startTime: new Date(b.startTime),
            endTime: new Date(b.endTime)
          }));
          setExistingBookings(bookings);
        }
      } catch (error) {
        console.error('Error loading scheduler data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedDate]);

  // Auto-scroll to "Now" position when opening scheduler for today's date
  useEffect(() => {
    if (loading) return; // Wait until loading completes

    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    if (isToday) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        scrollToNow();
      }, 150);
    }
  }, [loading, selectedDate]);

  // Check if a time slot is blocked
  const checkIfSlotBlocked = (slotTime: Date, durationHours: number = selectedDuration): { isBlocked: boolean; reason?: string } => {
    const slotEnd = new Date(slotTime.getTime() + (durationHours * 60 * 60 * 1000));

    for (const booking of existingBookings) {
      // Check for direct overlap (Rule 8)
      if (slotTime < booking.endTime && slotEnd > booking.startTime) {
        return {
          isBlocked: true,
          reason: `Overlaps with existing appointment (${booking.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${booking.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
        };
      }

      // Check 1-hour buffer after existing appointment (Rule 7)
      const oneHourAfter = new Date(booking.endTime.getTime() + (BUFFER_HOURS * 60 * 60 * 1000));
      if (slotTime > booking.endTime && slotTime < oneHourAfter) {
        return {
          isBlocked: true,
          reason: `Must wait 1 hour after appointment ending at ${booking.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        };
      }

      // Check 1-hour buffer before existing appointment (Rule 9)
      const oneHourBefore = new Date(booking.startTime.getTime() - (BUFFER_HOURS * 60 * 60 * 1000));
      if (slotEnd > oneHourBefore && slotEnd <= booking.startTime) {
        return {
          isBlocked: true,
          reason: `Must end 1 hour before appointment starting at ${booking.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        };
      }
    }

    return { isBlocked: false };
  };

  // Handle slot click
  const handleSlotClick = (slot: TimeSlot) => {
    if (slot.isPast) {
      setErrorMessage('Cannot schedule appointments in the past or less than 1 hour from now');
      return;
    }

    const slotTime = new Date(selectedDate);
    slotTime.setHours(slot.hour, slot.minute, 0, 0);

    // Check if appointment would go past midnight into next day
    const slotEnd = new Date(slotTime.getTime() + (selectedDuration * 60 * 60 * 1000));
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    if (slotEnd > endOfDay) {
      setErrorMessage(`Selected duration (${selectedDuration}h) would extend past midnight. Please select an earlier time or shorter duration.`);
      return;
    }

    const blockCheck = checkIfSlotBlocked(slotTime, selectedDuration);
    if (blockCheck.isBlocked) {
      setErrorMessage(blockCheck.reason || 'This time slot is not available');
      return;
    }

    // Valid selection
    setSelectedStartTime(slotTime);
    setSelectedEndTime(slotEnd);
    setErrorMessage('');
  };

  // Handle duration change
  const handleDurationChange = (newDuration: number) => {
    setSelectedDuration(newDuration);

    // If there's a selection, recalculate end time
    if (selectedStartTime) {
      const newEndTime = new Date(selectedStartTime.getTime() + (newDuration * 60 * 60 * 1000));
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      if (newEndTime > endOfDay) {
        setErrorMessage(`Duration of ${newDuration}h would extend past midnight. Please select a shorter duration or earlier start time.`);
        setSelectedStartTime(null);
        setSelectedEndTime(null);
        return;
      }

      const blockCheck = checkIfSlotBlocked(selectedStartTime, newDuration);
      if (blockCheck.isBlocked) {
        setErrorMessage(blockCheck.reason || 'This time slot is not available with the new duration');
        setSelectedStartTime(null);
        setSelectedEndTime(null);
        return;
      }

      setSelectedEndTime(newEndTime);
      setErrorMessage('');
    }
  };

  // Auto-suggest available slot
  const handleAutoSuggest = async () => {
    try {
      setIsAutoSuggesting(true);
      setErrorMessage('');

      const result = await apiService.post<{ success: boolean; data?: any; message?: string }>(
        '/client/suggest-available-slot',
        {
          date: selectedDate.toISOString().split('T')[0],
          durationHours: selectedDuration
        }
      );

      if (result.success && result.data) {
        const suggested = result.data;
        const startTime = new Date(suggested.startTime);
        const endTime = new Date(suggested.endTime);

        setSelectedStartTime(startTime);
        setSelectedEndTime(endTime);
        setErrorMessage('');

        // Scroll to the suggested time
        setTimeout(() => {
          const hours = startTime.getHours();
          const minutes = startTime.getMinutes();
          const slotIndex = (hours - 6) * 2 + (minutes / 30);
          const scrollPosition = slotIndex * 64;

          const container = document.getElementById('timeline-scroll');
          if (container) {
            container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
          }
        }, 100); // Small delay to ensure state update has rendered
      } else {
        setErrorMessage(result.message || 'No available slots found');
      }
    } catch (error: any) {
      console.error('Error auto-suggesting slot:', error);
      setErrorMessage(error.message || 'Failed to find available slot. Please try manually selecting a time.');
    } finally {
      setIsAutoSuggesting(false);
    }
  };

  // Handle drag resize
  const handleResizeStart = (e: React.MouseEvent, mode: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragMode(`resize-${mode}`);
    setDragStartX(e.clientX);
    setDragStartTime(mode === 'start' ? selectedStartTime : selectedEndTime);
    setErrorMessage(''); // Clear any previous errors

    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedStartTime || !selectedEndTime || !dragStartTime) return;

      const deltaX = e.clientX - dragStartX;
      const slotWidth = 64;
      const slotsChanged = Math.round(deltaX / slotWidth);
      const timeChange = slotsChanged * 30 * 60 * 1000; // 30 minutes in ms

      const currentTime = new Date();
      const minTime = new Date(currentTime.getTime() + (1 * 60 * 60 * 1000));

      if (mode === 'start') {
        const newStartTime = new Date(dragStartTime.getTime() + timeChange);
        const minDuration = 1 * 60 * 60 * 1000; // 1 hour

        if (newStartTime < minTime) return;
        if (selectedEndTime.getTime() - newStartTime.getTime() < minDuration) return;

        setSelectedStartTime(newStartTime);

        // Update duration selector to match
        const newDurationHours = (selectedEndTime.getTime() - newStartTime.getTime()) / (1000 * 60 * 60);
        if (newDurationHours >= 1 && newDurationHours <= 6) {
          setSelectedDuration(Math.round(newDurationHours));
        }
      } else {
        const newEndTime = new Date(dragStartTime.getTime() + timeChange);
        const minDuration = 1 * 60 * 60 * 1000;
        const maxDuration = 6 * 60 * 60 * 1000;

        if (newEndTime.getTime() - selectedStartTime.getTime() < minDuration) return;
        if (newEndTime.getTime() - selectedStartTime.getTime() > maxDuration) return;

        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (newEndTime > endOfDay) return;

        setSelectedEndTime(newEndTime);

        // Update duration selector to match
        const newDurationHours = (newEndTime.getTime() - selectedStartTime.getTime()) / (1000 * 60 * 60);
        if (newDurationHours >= 1 && newDurationHours <= 6) {
          setSelectedDuration(Math.round(newDurationHours));
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragMode(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Validate final selection
      if (selectedStartTime && selectedEndTime) {
        const durationHours = (selectedEndTime.getTime() - selectedStartTime.getTime()) / (1000 * 60 * 60);
        const blockCheck = checkIfSlotBlocked(selectedStartTime, durationHours);
        if (blockCheck.isBlocked) {
          setErrorMessage(blockCheck.reason || 'Invalid time selection');
          // Don't clear selection immediately - let user see the error and adjust
        } else {
          setErrorMessage(''); // Clear error on successful validation
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle drag move
  const handleMoveStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragMode('move');
    setDragStartX(e.clientX);
    setDragStartTime(selectedStartTime);
    setErrorMessage(''); // Clear any previous errors

    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedStartTime || !selectedEndTime || !dragStartTime) return;

      const deltaX = e.clientX - dragStartX;
      const slotWidth = 64;
      const slotsChanged = Math.round(deltaX / slotWidth);
      const timeChange = slotsChanged * 30 * 60 * 1000;

      const duration = selectedEndTime.getTime() - selectedStartTime.getTime();
      const newStartTime = new Date(dragStartTime.getTime() + timeChange);
      const newEndTime = new Date(newStartTime.getTime() + duration);

      const currentTime = new Date();
      const minTime = new Date(currentTime.getTime() + (1 * 60 * 60 * 1000));

      if (newStartTime < minTime) return;

      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (newEndTime > endOfDay) return;

      setSelectedStartTime(newStartTime);
      setSelectedEndTime(newEndTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragMode(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Validate final selection
      if (selectedStartTime && selectedEndTime) {
        const durationHours = (selectedEndTime.getTime() - selectedStartTime.getTime()) / (1000 * 60 * 60);
        const blockCheck = checkIfSlotBlocked(selectedStartTime, durationHours);
        if (blockCheck.isBlocked) {
          setErrorMessage(blockCheck.reason || 'Invalid time selection');
          // Don't clear selection immediately - let user see the error and adjust
        } else {
          setErrorMessage(''); // Clear error on successful validation
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Confirm booking
  const handleConfirmBooking = () => {
    if (selectedStartTime && selectedEndTime) {
      // Use first service location as resourceId (simplified - you may want to add location selector)
      onSlotSelect('', selectedStartTime, selectedEndTime);
    }
  };

  // Get current time indicator position
  const getCurrentTimePosition = () => {
    const now = new Date();
    if (now.toDateString() !== selectedDate.toDateString()) return null;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const slotIndex = hours * 2 + Math.floor(minutes / 30);
    return slotIndex * 64;
  };

  const currentTimePosition = getCurrentTimePosition();
  const isSelectedDateInPast = selectedDate < new Date(new Date().setHours(0, 0, 0, 0));

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm">{t('scheduler.loading', 'Loading scheduler...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{t('scheduler.title', 'Schedule Appointment')}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Duration Selector and Auto-Suggest */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Duration:</label>
              <select
                value={selectedDuration}
                onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
                className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map(hours => (
                  <option key={hours} value={hours}>
                    {hours} {hours === 1 ? 'hour' : 'hours'}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAutoSuggest}
              disabled={isAutoSuggesting || isSelectedDateInPast}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <Sparkles className="h-4 w-4" />
              {isAutoSuggesting ? 'Finding...' : 'Auto-Suggest Available Slot'}
            </button>

            {selectedDate.toDateString() === new Date().toDateString() && (
              <button
                onClick={scrollToNow}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Now
              </button>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {/* Emergency Hours Warning */}
          {selectedRateInfo?.hasEmergency && !errorMessage && (
            <div className="mt-4 p-3 bg-orange-100 dark:bg-orange-900/20 border border-orange-400 dark:border-orange-600 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-orange-800 dark:text-orange-300 font-medium">
                  ⚠️ Emergency Hours Selected
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                  Your selected time includes Emergency rate hours ({selectedRateInfo.maxMultiplier}x rate).
                  This appointment will be charged at a higher rate than standard hours.
                </p>
              </div>
            </div>
          )}

          {/* Premium Hours Info */}
          {selectedRateInfo?.hasPremium && !selectedRateInfo?.hasEmergency && !errorMessage && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-300 dark:border-yellow-600 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">
                  Premium Hours Selected
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  Your selected time includes Premium rate hours ({selectedRateInfo.maxMultiplier}x rate).
                </p>
              </div>
            </div>
          )}

          {isSelectedDateInPast && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                ⚠️ Cannot schedule appointments in the past. Please select a future date.
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isSelectedDateInPast ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
                  Past Date Selected
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Please select today or a future date to schedule appointments.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Row labels */}
              <div className="flex flex-col border-r border-gray-200 dark:border-gray-700">
                <div className="w-32 h-[26px] border-b border-gray-200 dark:border-gray-700 flex items-center justify-center bg-white dark:bg-gray-800">
                  <span className="font-medium text-xs">Time</span>
                </div>
                <div className="w-32 flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                  <span className="text-sm font-medium">Available Slots</span>
                </div>
              </div>

              {/* Scrollable timeline content (both rows together) */}
              <div className="flex-1 overflow-x-auto scroll-smooth" id="timeline-scroll">
                <div className="min-w-max">
                  {/* Time labels row */}
                  <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    {timeSlots.map((slot, i) => (
                      <div key={i} className="flex-shrink-0 w-16 p-1 text-center text-xs font-medium border-r border-gray-200 dark:border-gray-700">
                        {slot.time}
                      </div>
                    ))}
                  </div>

                  {/* Selection grid row */}
                  <div className="relative h-20 bg-gray-50 dark:bg-gray-900">
                    <div className="flex h-20 relative">
                      {/* Current time indicator */}
                      {currentTimePosition !== null && (
                        <div
                          className="absolute top-0 w-px bg-red-500 h-full z-20"
                          style={{ left: `${currentTimePosition}px` }}
                        >
                          <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5 -mt-1.5"></div>
                        </div>
                      )}

                      {/* Time slots */}
                      {timeSlots.map((slot, i) => {
                        const slotTime = new Date(selectedDate);
                        slotTime.setHours(slot.hour, slot.minute, 0, 0);
                        const blockCheck = checkIfSlotBlocked(slotTime);

                        const isInSelectedRange = selectedStartTime && selectedEndTime &&
                          slotTime >= selectedStartTime && slotTime < selectedEndTime;

                        let bgColor = '';
                        let tierLabel = '';

                        if (slot.isPast) {
                          bgColor = 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed';
                          tierLabel = 'Past time slot';
                        } else if (blockCheck.isBlocked) {
                          bgColor = 'bg-red-100 dark:bg-red-900/30 cursor-not-allowed';
                          tierLabel = blockCheck.reason || 'Unavailable';
                        } else if (isInSelectedRange) {
                          bgColor = 'bg-blue-500 text-white';
                          tierLabel = 'Selected';
                        } else if (slot.rateTier) {
                          // Use color from database
                          const lightenedColor = slot.rateTier.colorCode + '1A'; // Add transparency
                          const hoverColor = slot.rateTier.colorCode + '33';
                          bgColor = `cursor-pointer`;
                          tierLabel = `${slot.rateTier.tierName} hours (${slot.rateTier.rateMultiplier}x rate)`;
                        } else {
                          bgColor = 'bg-gray-100 dark:bg-gray-800 cursor-pointer';
                          tierLabel = 'Available';
                        }

                        return (
                          <div
                            key={i}
                            className={`flex-shrink-0 w-16 h-20 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs transition-colors ${bgColor}`}
                            style={
                              slot.rateTier && !slot.isPast && !blockCheck.isBlocked && !isInSelectedRange
                                ? {
                                    backgroundColor: isDarkMode ? slot.rateTier.colorCode + '30' : slot.rateTier.colorCode + '1A',
                                  }
                                : undefined
                            }
                            onMouseEnter={(e) => {
                              if (slot.rateTier && !slot.isPast && !blockCheck.isBlocked && !isInSelectedRange) {
                                e.currentTarget.style.backgroundColor = isDarkMode
                                  ? slot.rateTier.colorCode + '50'
                                  : slot.rateTier.colorCode + '33';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (slot.rateTier && !slot.isPast && !blockCheck.isBlocked && !isInSelectedRange) {
                                e.currentTarget.style.backgroundColor = isDarkMode
                                  ? slot.rateTier.colorCode + '30'
                                  : slot.rateTier.colorCode + '1A';
                              }
                            }}
                            onClick={() => handleSlotClick(slot)}
                            title={tierLabel}
                          >
                            {isInSelectedRange && <span className="font-medium">✓</span>}
                          </div>
                        );
                      })}

                      {/* Selected time block with drag handles */}
                      {selectedStartTime && selectedEndTime && (
                        <div
                          className="absolute top-0 h-20 bg-blue-600/80 border-2 border-blue-700 rounded pointer-events-none"
                          style={{
                            left: `${(selectedStartTime.getHours() * 2 + selectedStartTime.getMinutes() / 30) * 64}px`,
                            width: `${((selectedEndTime.getTime() - selectedStartTime.getTime()) / (30 * 60 * 1000)) * 64}px`
                          }}
                        >
                          {/* Move handle - center area only, excludes edges */}
                          <div
                            className="absolute inset-0 cursor-move pointer-events-auto flex items-center justify-center text-white text-xs font-medium"
                            style={{ left: '12px', right: '12px' }} // Leave space for resize handles
                            onMouseDown={handleMoveStart}
                            title="Drag to move appointment"
                          >
                            <div className="text-center pointer-events-none">
                              <div>{selectedStartTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                              <div className="text-[10px]">to</div>
                              <div>{selectedEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                            </div>
                          </div>

                          {/* Start resize handle - higher z-index to be on top */}
                          <div
                            className="absolute left-0 top-0 w-3 h-20 bg-blue-900 cursor-ew-resize pointer-events-auto hover:bg-blue-950 z-10 flex items-center justify-center"
                            onMouseDown={(e) => handleResizeStart(e, 'start')}
                            title="Drag to adjust start time"
                          >
                            <div className="text-white text-xs pointer-events-none">⟨</div>
                          </div>

                          {/* End resize handle - higher z-index to be on top */}
                          <div
                            className="absolute right-0 top-0 w-3 h-20 bg-blue-900 cursor-ew-resize pointer-events-auto hover:bg-blue-950 z-10 flex items-center justify-center"
                            onMouseDown={(e) => handleResizeStart(e, 'end')}
                            title="Drag to adjust end time"
                          >
                            <div className="text-white text-xs pointer-events-none">⟩</div>
                          </div>
                        </div>
                      )}

                      {/* Existing bookings overlay */}
                      {existingBookings.map((booking, idx) => {
                        const startHour = booking.startTime.getHours();
                        const startMinute = booking.startTime.getMinutes();
                        const endHour = booking.endTime.getHours();
                        const endMinute = booking.endTime.getMinutes();

                        const startSlotIndex = startHour * 2 + startMinute / 30;
                        const endSlotIndex = endHour * 2 + endMinute / 30;
                        const width = (endSlotIndex - startSlotIndex) * 64;

                        return (
                          <div
                            key={idx}
                            className="absolute top-0 h-8 bg-red-500/60 border border-red-600 rounded text-white text-xs flex items-center justify-center px-1 pointer-events-none mt-1"
                            style={{
                              left: `${startSlotIndex * 64}px`,
                              width: `${width}px`
                            }}
                            title={`${booking.clientName} - ${booking.serviceType}`}
                          >
                            <span className="truncate">{booking.isOwnBooking ? 'Your' : 'Booked'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 text-sm text-gray-700 dark:text-gray-300">
              {/* Show unique rate tiers */}
              {Array.from(new Set(rateTiers.map(t => t.tierName))).map(tierName => {
                const tier = rateTiers.find(t => t.tierName === tierName);
                if (!tier) return null;
                return (
                  <div key={tierName} className="flex items-center space-x-2">
                    <div
                      className="w-4 h-4 border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: isDarkMode ? tier.colorCode + '30' : tier.colorCode + '1A' }}
                    ></div>
                    <span>{tierName} ({tier.rateMultiplier}x)</span>
                  </div>
                );
              })}
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-100 dark:bg-red-900/30 border border-gray-300 dark:border-gray-600"></div>
                <span>Unavailable</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500"></div>
                <span>Selected</span>
              </div>
            </div>

            {selectedStartTime && selectedEndTime && !isSelectedDateInPast && (
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-900 dark:text-white">
                  <span className="font-medium">Selected: </span>
                  {selectedStartTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {selectedEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    ({((selectedEndTime.getTime() - selectedStartTime.getTime()) / (1000 * 60 * 60)).toFixed(1)}h)
                  </span>
                </div>
                <button
                  onClick={handleConfirmBooking}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium"
                >
                  Confirm Booking
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceTimeSlotScheduler;
