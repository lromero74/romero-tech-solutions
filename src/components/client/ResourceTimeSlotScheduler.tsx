import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';

interface TimeSlot {
  time: string;
  hour: number;
  minute: number;
  isAvailable: boolean;
  isOwnBooking: boolean;
  hasConflict: boolean;
  isPast: boolean;
  clientName?: string;
  serviceType?: string;
  duration?: number;
}

interface Resource {
  id: string;
  name: string;
  type: string;
  description?: string;
  isAvailable: boolean;
}

interface SchedulerConfig {
  bufferBeforeHours: number;
  bufferAfterHours: number;
  defaultSlotDurationHours: number;
  minimumAdvanceHours: number;
}

interface ExistingBooking {
  id: string;
  resourceId: string;
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
  const [resources, setResources] = useState<Resource[]>([]);
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({
    bufferBeforeHours: 2,
    bufferAfterHours: 1,
    defaultSlotDurationHours: 2,
    minimumAdvanceHours: 1
  });
  const [selectedResource, setSelectedResource] = useState<string>('');
  const [selectedStartTime, setSelectedStartTime] = useState<Date | null>(null);
  const [selectedEndTime, setSelectedEndTime] = useState<Date | null>(null);
  const [, setHoveredSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'move' | 'resize-start' | 'resize-end' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState<Date | null>(null);

  // Scroll to current time
  const scrollToNow = () => {
    const now = new Date();
    if (now.toDateString() !== selectedDate.toDateString()) return;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentSlotIndex = hours * 2 + Math.floor(minutes / 30);
    const scrollPosition = currentSlotIndex * 64; // 64px per slot

    // Disable scroll event temporarily to prevent loops during programmatic scroll
    const scrollWithoutEvents = (element: Element) => {
      (element as HTMLElement).style.pointerEvents = 'none';
      element.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      setTimeout(() => {
        (element as HTMLElement).style.pointerEvents = 'auto';
      }, 1000); // Longer timeout for smooth scroll
    };

    // Scroll all horizontal containers
    const containers = ['super-header-scroll', 'time-header-scroll'];
    containers.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        scrollWithoutEvents(element);
      }
    });

    // Scroll resource rows
    const resourceRows = document.querySelectorAll('.resource-time-slots');
    resourceRows.forEach(row => {
      scrollWithoutEvents(row);
    });
  };

  // Synchronize scroll across all horizontal containers
  const handleScroll = (sourceElement: HTMLElement) => {
    const scrollLeft = sourceElement.scrollLeft;

    // Prevent infinite scroll loops by temporarily disabling scroll events
    const disableScrollEvents = () => {
      // Update header containers
      const containers = ['super-header-scroll', 'time-header-scroll'];
      containers.forEach(id => {
        const element = document.getElementById(id);
        if (element && element !== sourceElement) {
          element.style.pointerEvents = 'none';
          element.scrollLeft = scrollLeft;
          setTimeout(() => {
            element.style.pointerEvents = 'auto';
          }, 50);
        }
      });

      // Update resource rows
      const resourceRows = document.querySelectorAll('.resource-time-slots');
      resourceRows.forEach(row => {
        if (row !== sourceElement) {
          (row as HTMLElement).style.pointerEvents = 'none';
          (row as HTMLElement).scrollLeft = scrollLeft;
          setTimeout(() => {
            (row as HTMLElement).style.pointerEvents = 'auto';
          }, 50);
        }
      });
    };

    // Use requestAnimationFrame for smooth synchronization
    requestAnimationFrame(disableScrollEvents);
  };

  // Add scroll listeners on mount
  useEffect(() => {
    // Use a timeout to ensure DOM elements are fully rendered
    const setupScrollListeners = () => {
      const containers = ['super-header-scroll', 'time-header-scroll'];
      const listeners: Array<() => void> = [];

      containers.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          const listener = () => handleScroll(element);
          element.addEventListener('scroll', listener, { passive: true });
          listeners.push(() => element.removeEventListener('scroll', listener));
        }
      });

      // Add listeners to resource rows with a small delay to ensure they're rendered
      setTimeout(() => {
        const resourceRows = document.querySelectorAll('.resource-time-slots');
        resourceRows.forEach(row => {
          const listener = () => handleScroll(row as HTMLElement);
          row.addEventListener('scroll', listener, { passive: true });
          listeners.push(() => row.removeEventListener('scroll', listener));
        });
      }, 100);

      return () => {
        listeners.forEach(cleanup => cleanup());
      };
    };

    const cleanup = setupScrollListeners();
    return cleanup;
  }, [resources, loading]); // Re-run when resources change or loading state changes

  // Generate time slots for the day (30-minute intervals)
  const timeSlots = useMemo(() => {
    const slots: TimeSlot[] = [];
    const currentTime = new Date();
    const cutoffTime = new Date(currentTime.getTime() + (schedulerConfig.minimumAdvanceHours * 60 * 60 * 1000));

    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotTime = new Date(selectedDate);
        slotTime.setHours(hour, minute, 0, 0);

        const timeString = slotTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const isPast = slotTime < cutoffTime;

        slots.push({
          time: timeString,
          hour,
          minute,
          isAvailable: !isPast,
          isOwnBooking: false,
          hasConflict: false,
          isPast
        });
      }
    }

    return slots;
  }, [selectedDate, schedulerConfig.minimumAdvanceHours]);

  // Load resources and configuration
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load scheduler configuration
        const configResponse = await fetch('/api/client/scheduler-config', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`
          }
        });

        if (configResponse.ok) {
          const configData = await configResponse.json();
          if (configData.success) {
            setSchedulerConfig(configData.data);
          }
        }

        // Load resources (service locations for this business)
        const resourcesResponse = await fetch(`/api/client/resources?date=${selectedDate.toISOString().split('T')[0]}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`
          }
        });

        if (resourcesResponse.ok) {
          const resourcesData = await resourcesResponse.json();
          if (resourcesData.success) {
            setResources(resourcesData.data);
            if (resourcesData.data.length > 0) {
              setSelectedResource(resourcesData.data[0].id);
            }
          }
        }

        // Load existing bookings for the selected date
        const bookingsResponse = await fetch(`/api/client/bookings?date=${selectedDate.toISOString().split('T')[0]}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`
          }
        });

        if (bookingsResponse.ok) {
          const bookingsData = await bookingsResponse.json();
          if (bookingsData.success) {
            setExistingBookings(bookingsData.data);
          }
        }

      } catch (error) {
        console.error('Error loading scheduler data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedDate, businessId]);

  // Check if a time slot has conflicts
  const checkSlotConflicts = (resourceId: string, startTime: Date, durationHours: number = schedulerConfig.defaultSlotDurationHours): boolean => {
    const endTime = new Date(startTime.getTime() + (durationHours * 60 * 60 * 1000));

    return existingBookings.some(booking => {
      if (booking.resourceId !== resourceId) return false;

      // Calculate buffer zones around existing bookings
      const bookingBufferStart = new Date(booking.startTime.getTime() - (schedulerConfig.bufferBeforeHours * 60 * 60 * 1000));
      const bookingBufferEnd = new Date(booking.endTime.getTime() + (schedulerConfig.bufferAfterHours * 60 * 60 * 1000));

      // Skip buffer check for own bookings
      if (booking.isOwnBooking) {
        // Only check direct overlap for own bookings
        return (startTime < booking.endTime && endTime > booking.startTime);
      }

      // Check if proposed slot overlaps with buffered booking
      return (startTime < bookingBufferEnd && endTime > bookingBufferStart);
    });
  };

  // Check if a time slot overlaps with client's existing appointments across all resources
  const checkClientAppointmentOverlap = (startTime: Date, durationHours: number = 1): boolean => {
    const endTime = new Date(startTime.getTime() + (durationHours * 60 * 60 * 1000));

    return existingBookings.some(booking => {
      // Only check client's own bookings, regardless of resource
      if (!booking.isOwnBooking) return false;

      // Check if proposed slot overlaps with client's existing appointment
      return (startTime < booking.endTime && endTime > booking.startTime);
    });
  };

  // Get time slot status for a specific resource and time
  const getSlotStatus = (resourceId: string, slot: TimeSlot) => {
    const slotTime = new Date(selectedDate);
    slotTime.setHours(slot.hour, slot.minute, 0, 0);

    // Find any existing booking at this time for this specific resource
    const existingBooking = existingBookings.find(booking => {
      return booking.resourceId === resourceId &&
             slotTime >= booking.startTime &&
             slotTime < booking.endTime;
    });

    if (existingBooking) {
      return {
        isOccupied: true,
        isOwnBooking: existingBooking.isOwnBooking,
        hasConflict: false,
        hasClientOverlap: false,
        booking: existingBooking
      };
    }

    const hasConflict = checkSlotConflicts(resourceId, slotTime);
    const hasClientOverlap = checkClientAppointmentOverlap(slotTime);

    return {
      isOccupied: false,
      isOwnBooking: false,
      hasConflict,
      hasClientOverlap,
      booking: null
    };
  };

  // Handle slot click
  const handleSlotClick = (resourceId: string, slot: TimeSlot) => {
    if (slot.isPast) return;

    const slotTime = new Date(selectedDate);
    slotTime.setHours(slot.hour, slot.minute, 0, 0);

    const slotStatus = getSlotStatus(resourceId, slot);

    if (slotStatus.isOccupied) {
      if (slotStatus.isOwnBooking) {
        // Allow editing own bookings
        setSelectedStartTime(slotTime);
        const endTime = new Date(slotTime.getTime() + (schedulerConfig.defaultSlotDurationHours * 60 * 60 * 1000));
        setSelectedEndTime(endTime);
      }
      return;
    }

    if (slotStatus.hasConflict) {
      // Show warning about conflict
      alert('This time slot conflicts with buffer requirements around existing appointments.');
      return;
    }

    if (slotStatus.hasClientOverlap) {
      // Show warning about client overlap
      alert('You cannot schedule overlapping appointments. This time conflicts with your existing appointment.');
      return;
    }

    // Set new booking - default to 1 hour (2 half-hour slots)
    setSelectedStartTime(slotTime);
    const endTime = new Date(slotTime.getTime() + (60 * 60 * 1000)); // 1 hour
    setSelectedEndTime(endTime);
  };

  // Handle drag start for resizing
  const handleResizeStart = (e: React.MouseEvent, mode: 'start' | 'end', resourceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragMode(`resize-${mode}`);
    setDragStartX(e.clientX);
    setDragStartTime(mode === 'start' ? selectedStartTime : selectedEndTime);
    setSelectedResource(resourceId);

    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedStartTime || !selectedEndTime || !dragStartTime) return;

      const deltaX = e.clientX - dragStartX;
      const slotWidth = 64; // 16 * 4 (w-16 in Tailwind)
      const slotsChanged = Math.round(deltaX / slotWidth);
      const timeChange = slotsChanged * 30 * 60 * 1000; // 30 minutes in milliseconds

      const currentTime = new Date();
      const minTime = new Date(selectedDate);
      minTime.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);

      if (mode === 'start') {
        const newStartTime = new Date(dragStartTime.getTime() + timeChange);
        const minDuration = 60 * 60 * 1000; // 1 hour minimum

        // Ensure start time doesn't go into the past
        if (newStartTime < minTime) return;

        // Ensure minimum duration of 1 hour
        if (selectedEndTime.getTime() - newStartTime.getTime() < minDuration) {
          setSelectedEndTime(new Date(newStartTime.getTime() + minDuration));
        }

        setSelectedStartTime(newStartTime);
      } else {
        const newEndTime = new Date(dragStartTime.getTime() + timeChange);
        const minDuration = 60 * 60 * 1000; // 1 hour minimum

        // Ensure minimum duration of 1 hour
        if (newEndTime.getTime() - selectedStartTime.getTime() < minDuration) return;

        setSelectedEndTime(newEndTime);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragMode(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle drag start for moving
  const handleMoveStart = (e: React.MouseEvent, resourceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragMode('move');
    setDragStartX(e.clientX);
    setDragStartTime(selectedStartTime);
    setSelectedResource(resourceId);

    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedStartTime || !selectedEndTime || !dragStartTime) return;

      const deltaX = e.clientX - dragStartX;
      const slotWidth = 64; // 16 * 4 (w-16 in Tailwind)
      const slotsChanged = Math.round(deltaX / slotWidth);
      const timeChange = slotsChanged * 30 * 60 * 1000; // 30 minutes in milliseconds

      const currentTime = new Date();
      const minTime = new Date(selectedDate);
      minTime.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);

      const duration = selectedEndTime.getTime() - selectedStartTime.getTime();
      const newStartTime = new Date(dragStartTime.getTime() + timeChange);
      const newEndTime = new Date(newStartTime.getTime() + duration);

      // Ensure start time doesn't go into the past
      if (newStartTime < minTime) return;

      // Ensure end time doesn't go past end of day
      if (newEndTime.getHours() >= 24) return;

      setSelectedStartTime(newStartTime);
      setSelectedEndTime(newEndTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragMode(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Confirm booking
  const handleConfirmBooking = () => {
    if (selectedStartTime && selectedEndTime && selectedResource) {
      onSlotSelect(selectedResource, selectedStartTime, selectedEndTime);
      onClose();
    }
  };

  // Get current time indicator position
  const getCurrentTimePosition = () => {
    const now = new Date();
    if (now.toDateString() !== selectedDate.toDateString()) return null;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    // 48 half-hour slots in a day
    const position = (totalMinutes / (24 * 60)) * 100;

    return position;
  };

  const currentTimePosition = getCurrentTimePosition();

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

  // Check if selected date is in the past
  const isSelectedDateInPast = selectedDate < new Date().setHours(0, 0, 0, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
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
              {isSelectedDateInPast && (
                <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                    ⚠️ {t('scheduler.pastDateWarning', 'Cannot schedule appointments in the past. Please select a future date.')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {/* Now Button - only show if today is selected */}
              {selectedDate.toDateString() === new Date().toDateString() && (
                <button
                  onClick={scrollToNow}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  title={t('scheduler.scrollToNow', 'Scroll to current time')}
                >
                  {t('scheduler.now', 'Now')}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Scheduler Grid */}
        <div className="flex-1 overflow-auto">
          <div className="relative">
            {/* Horizontal Scroll Indicator */}
            <div className="absolute top-0 right-4 z-30 bg-blue-600 text-white px-2 py-1 rounded-b text-xs font-medium">
              {t('scheduler.scrollHint', '← Scroll horizontally to view full 24-hour timeline →')}
            </div>
            {/* Past Date Overlay */}
            {isSelectedDateInPast && (
              <div className="absolute inset-0 bg-gray-500 bg-opacity-75 z-30 flex items-center justify-center">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-red-300 dark:border-red-600 text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
                    {t('scheduler.pastDateTitle', 'Past Date Selected')}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('scheduler.pastDateMessage', 'Cannot schedule appointments for past dates.')}<br />
                    {t('scheduler.selectFutureDate', 'Please select today or a future date.')}
                  </p>
                </div>
              </div>
            )}
            {/* Super Header - Month and Day */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-20">
              <div className="flex">
                <div className="w-48 p-2 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                  <div className="text-sm font-bold text-center">
                    {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="flex-1 overflow-x-auto scroll-smooth" id="super-header-scroll">
                  <div className="flex min-w-max">
                    <div className="flex-shrink-0 text-center text-sm font-bold p-2" style={{ width: '3072px' }}>
                      {selectedDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })} - Full Day Timeline
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Time Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
              <div className="flex">
                <div className="w-48 p-4 border-r border-gray-200 dark:border-gray-700">
                  <span className="font-medium">{t('scheduler.resources', 'Resources')}</span>
                </div>
                <div className="flex-1 overflow-x-auto scroll-smooth" id="time-header-scroll">
                  <div className="flex min-w-max">
                    {Array.from({ length: 48 }, (_, i) => {
                      const hour = Math.floor(i / 2);
                      const minute = (i % 2) * 30;
                      const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                      return (
                        <div key={i} className="flex-shrink-0 w-16 p-1 text-center text-xs font-medium border-r border-gray-200 dark:border-gray-700">
                          {timeString}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Current Time Indicator */}
            {currentTimePosition !== null && (
              <div
                className="absolute top-[60px] w-px bg-red-500 z-20 h-full"
                style={{ left: `${192 + (currentTimePosition / 100) * (48 * 64)}px` }}
              >
                <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5 -mt-1.5"></div>
              </div>
            )}

            {/* Past Time Overlay */}
            {currentTimePosition !== null && (
              <div
                className="absolute top-[60px] bg-gray-300 dark:bg-gray-600 opacity-30 h-full z-10"
                style={{
                  left: '192px',
                  width: `${(currentTimePosition / 100) * (48 * 64)}px`
                }}
              />
            )}

            {/* Resource Rows */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {resources.map((resource) => (
                <div key={resource.id} className="flex">
                  {/* Resource Info */}
                  <div className="w-48 p-4 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                    <div>
                      <p className="font-medium text-sm">{resource.name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{resource.type}</p>
                      {resource.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{resource.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Time Slots */}
                  <div className="flex-1 overflow-x-auto scroll-smooth resource-time-slots">
                    <div className="flex min-w-max relative">
                      {timeSlots.map((slot, slotIndex) => {
                        const slotStatus = getSlotStatus(resource.id, slot);
                        const isInSelectedRange = selectedResource === resource.id &&
                                                selectedStartTime && selectedEndTime &&
                                                slot.hour === selectedStartTime.getHours() &&
                                                slot.minute >= selectedStartTime.getMinutes() &&
                                                (slot.hour < selectedEndTime.getHours() ||
                                                 (slot.hour === selectedEndTime.getHours() && slot.minute < selectedEndTime.getMinutes()));

                        let slotClass = 'flex-shrink-0 w-16 h-12 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center text-xs';

                        if (slot.isPast) {
                          slotClass += ' bg-gray-100 dark:bg-gray-700 cursor-not-allowed';
                        } else if (slotStatus.isOccupied) {
                          if (slotStatus.isOwnBooking) {
                            slotClass += ' bg-blue-500 text-white cursor-pointer';
                          } else {
                            slotClass += ' bg-red-500 text-white cursor-not-allowed';
                          }
                        } else if (slotStatus.hasConflict) {
                          slotClass += ' bg-yellow-200 dark:bg-yellow-800 cursor-not-allowed';
                        } else if (slotStatus.hasClientOverlap) {
                          slotClass += ' bg-orange-300 dark:bg-orange-700 cursor-not-allowed';
                        } else if (isInSelectedRange) {
                          slotClass += ' bg-green-500 text-white';
                        }

                        return (
                          <div
                            key={`${resource.id}-${slotIndex}`}
                            className={slotClass}
                            onClick={() => handleSlotClick(resource.id, slot)}
                            onMouseEnter={() => setHoveredSlot(`${resource.id}-${slotIndex}`)}
                            onMouseLeave={() => setHoveredSlot(null)}
                            title={
                              slotStatus.isOccupied
                                ? `${slotStatus.booking?.clientName} - ${slotStatus.booking?.serviceType}`
                                : slotStatus.hasConflict
                                  ? 'Conflicts with buffer requirements'
                                  : slotStatus.hasClientOverlap
                                    ? 'Cannot book - conflicts with your existing appointment'
                                    : slot.isPast
                                      ? 'Time slot in the past'
                                      : 'Available'
                            }
                          >
                            {slotStatus.isOccupied && slotStatus.booking && (
                              <div className="truncate px-1">
                                {slotStatus.isOwnBooking ? 'You' : slotStatus.booking.clientName.split(' ')[0]}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Selected Time Block with Drag Handles */}
                      {selectedResource === resource.id && selectedStartTime && selectedEndTime && (
                        <div
                          className="absolute top-0 h-12 bg-green-600/80 border-2 border-green-700 rounded pointer-events-none"
                          style={{
                            left: `${(selectedStartTime.getHours() * 2 + selectedStartTime.getMinutes() / 30) * 64}px`,
                            width: `${((selectedEndTime.getTime() - selectedStartTime.getTime()) / (30 * 60 * 1000)) * 64}px`
                          }}
                        >
                          {/* Start Handle */}
                          <div
                            className="absolute left-0 top-0 w-2 h-12 bg-green-800 cursor-ew-resize pointer-events-auto hover:bg-green-900"
                            onMouseDown={(e) => handleResizeStart(e, 'start', resource.id)}
                            title="Drag to adjust start time"
                          />

                          {/* End Handle */}
                          <div
                            className="absolute right-0 top-0 w-2 h-12 bg-green-800 cursor-ew-resize pointer-events-auto hover:bg-green-900"
                            onMouseDown={(e) => handleResizeStart(e, 'end', resource.id)}
                            title="Drag to adjust end time"
                          />

                          {/* Move Handle */}
                          <div
                            className="absolute inset-0 cursor-move pointer-events-auto flex items-center justify-center text-white text-xs font-medium"
                            onMouseDown={(e) => handleMoveStart(e, resource.id)}
                            title="Drag to move appointment"
                          >
                            {selectedStartTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} - {selectedEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-500"></div>
<span>{t('scheduler.legend.unavailable', 'Unavailable')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500"></div>
<span>{t('scheduler.legend.yourBooking', 'Your Booking')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-200 dark:bg-yellow-800"></div>
<span>{t('scheduler.legend.bufferZone', 'Buffer Zone')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-orange-300 dark:bg-orange-700"></div>
<span>{t('scheduler.legend.clientOverlap', 'Client Overlap')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500"></div>
<span>{t('scheduler.legend.selected', 'Selected')}</span>
              </div>
            </div>

            {selectedStartTime && selectedEndTime && (
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-900 dark:text-white">
                  <span className="font-medium">{t('scheduler.selected', 'Selected')}: </span>
                  {selectedStartTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {selectedEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <button
                  onClick={handleConfirmBooking}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {t('scheduler.confirmBooking', 'Confirm Booking')}
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