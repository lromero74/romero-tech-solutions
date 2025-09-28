import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, MapPin, User, AlertCircle, Check, X } from 'lucide-react';
import { useClientTheme } from '../../contexts/ClientThemeContext';

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
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Get time slot status for a specific resource and time
  const getSlotStatus = (resourceId: string, slot: TimeSlot) => {
    const slotTime = new Date(selectedDate);
    slotTime.setHours(slot.hour, slot.minute, 0, 0);

    // Find any existing booking at this time
    const existingBooking = existingBookings.find(booking => {
      return booking.resourceId === resourceId &&
             slotTime >= booking.startTime &&
             slotTime < booking.endTime;
    });

    if (existingBooking) {
      return {
        isOccupied: true,
        isOwnBooking: existingBooking.isOwnBooking,
        booking: existingBooking
      };
    }

    const hasConflict = checkSlotConflicts(resourceId, slotTime);

    return {
      isOccupied: false,
      isOwnBooking: false,
      hasConflict,
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

    // Set new booking
    setSelectedStartTime(slotTime);
    const endTime = new Date(slotTime.getTime() + (schedulerConfig.defaultSlotDurationHours * 60 * 60 * 1000));
    setSelectedEndTime(endTime);
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
    const totalSlotsInDay = 24 * 2; // 48 half-hour slots
    const position = (totalMinutes / (24 * 60)) * 100;

    return position;
  };

  const currentTimePosition = getCurrentTimePosition();

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm">Loading scheduler...</p>
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
              <h2 className="text-2xl font-bold">Schedule Appointment</h2>
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
                    ⚠️ Cannot schedule appointments in the past. Please select a future date.
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Scheduler Grid */}
        <div className="flex-1 overflow-auto">
          <div className="relative">
            {/* Past Date Overlay */}
            {isSelectedDateInPast && (
              <div className="absolute inset-0 bg-gray-500 bg-opacity-75 z-30 flex items-center justify-center">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-red-300 dark:border-red-600 text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
                    Past Date Selected
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Cannot schedule appointments for past dates.<br />
                    Please select today or a future date.
                  </p>
                </div>
              </div>
            )}
            {/* Time Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
              <div className="flex">
                <div className="w-48 p-4 border-r border-gray-200 dark:border-gray-700">
                  <span className="font-medium">Resources</span>
                </div>
                <div className="flex-1 grid grid-cols-24 min-w-[1200px]">
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} className="p-2 text-center text-xs font-medium border-r border-gray-200 dark:border-gray-700">
                      {String(i).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Current Time Indicator */}
            {currentTimePosition !== null && (
              <div
                className="absolute top-[60px] w-px bg-red-500 z-20 h-full"
                style={{ left: `${192 + (currentTimePosition / 100) * 1200}px` }}
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
                  width: `${(currentTimePosition / 100) * 1200}px`
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
                  <div className="flex-1 grid grid-cols-48 min-w-[1200px]">
                    {timeSlots.map((slot, slotIndex) => {
                      const slotStatus = getSlotStatus(resource.id, slot);
                      const isSelected = selectedResource === resource.id &&
                                       selectedStartTime?.getHours() === slot.hour &&
                                       selectedStartTime?.getMinutes() === slot.minute;

                      let slotClass = 'h-12 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center text-xs';

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
                      } else if (isSelected) {
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-500"></div>
                <span>Unavailable</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500"></div>
                <span>Your Booking</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-200 dark:bg-yellow-800"></div>
                <span>Buffer Zone</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500"></div>
                <span>Selected</span>
              </div>
            </div>

            {selectedStartTime && selectedEndTime && (
              <div className="flex items-center space-x-4">
                <div className="text-sm">
                  <span className="font-medium">Selected: </span>
                  {selectedStartTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {selectedEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <button
                  onClick={handleConfirmBooking}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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