import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import FileUpload from './FileUpload';
import ResourceTimeSlotScheduler from './ResourceTimeSlotScheduler';
import { useUrgencyLevels } from './ServiceScheduler/useUrgencyLevels';
import { generateCalendar, navigateMonth, isToday, isSameMonth, getMonthTranslationKey, getMonthShortTranslationKey, getDayTranslationKey } from './ServiceScheduler/calendarUtils';
import {
  generateTimeSlots,
  isPremiumTime,
  calculateEndTime,
  getAvailableDurations,
  getAvailableTimeSlots,
  isDateValid
} from './ServiceScheduler/timeUtils';
import { ServiceLocation, ServiceType, ServiceRequest } from './ServiceScheduler/types';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Calendar
} from 'lucide-react';


const ServiceScheduler: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();

  // State management
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedEndTime, setSelectedEndTime] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<number>(1); // minimum 1 hour
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('');
  const [selectedServiceType, setSelectedServiceType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [calendarView, setCalendarView] = useState<'year' | 'month' | 'week' | 'today'>('month');
  const [showTimeSlotScheduler, setShowTimeSlotScheduler] = useState(false);

  // Data state
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const { urgencyLevels } = useUrgencyLevels();

  // Handle file upload completion
  const handleFileUploadComplete = (files: File[]) => {
    setUploadedFiles(prev => [...prev, ...files]);
  };

  // Load client data and accessible locations
  useEffect(() => {
    const loadClientData = () => {
      // First try to get from existing auth system
      const authUserData = RoleBasedStorage.getItem('authUser');
      if (authUserData) {
        try {
          const authUser = JSON.parse(authUserData);
          if (authUser.role === 'client') {
            // Fetch real client location data from API
            const fetchLocations = async () => {
              try {
                // Get session token from localStorage for authorization
                const sessionToken = localStorage.getItem('sessionToken');
                const headers: HeadersInit = {
                  'Content-Type': 'application/json'
                };

                if (sessionToken) {
                  headers['Authorization'] = `Bearer ${sessionToken}`;
                }

                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/profile/business`, {
                  credentials: 'include',
                  headers
                });

                if (response.ok) {
                  const result = await response.json();
                  if (result.success && result.data.accessibleLocations) {
                    setLocations(result.data.accessibleLocations);
                  }
                } else {
                  console.error('Failed to fetch client business data:', response.statusText);
                  setLocations([]); // Empty array instead of mock data
                }
              } catch (error) {
                console.error('Error fetching client business data:', error);
                setLocations([]); // Empty array instead of mock data
              }
            };

            fetchLocations();

            // Pre-fill contact info from auth user data
            setContactName(authUser.name || 'Client User');
            setContactEmail(authUser.email);
            setContactPhone('(619) 555-0123'); // Mock phone since not in auth data
            return;
          }
        } catch (error) {
          console.error('Failed to parse auth user data:', error);
        }
      }

      // Fallback to sessionStorage clientData
      const clientData = sessionStorage.getItem('clientData');
      if (clientData) {
        try {
          const data = JSON.parse(clientData);
          setLocations(data.user.accessibleLocations || []);

          // Pre-fill contact info from user data
          setContactName(`${data.user.firstName} ${data.user.lastName}`);
          setContactEmail(data.user.email);
          setContactPhone(data.user.phone || '');
        } catch (error) {
          console.error('Failed to parse client data:', error);
        }
      }
    };

    loadClientData();
  }, []);

  // Load service types
  useEffect(() => {
    // For now, use static data - this would be fetched from API
    setServiceTypes([
      { id: 'network-support', type_name: 'Network Support', category: 'Infrastructure', description: 'Network troubleshooting and maintenance' },
      { id: 'server-maintenance', type_name: 'Server Maintenance', category: 'Infrastructure', description: 'Server updates and maintenance' },
      { id: 'security-audit', type_name: 'Security Audit', category: 'Security', description: 'Security assessment and recommendations' },
      { id: 'help-desk', type_name: 'Help Desk Support', category: 'Support', description: 'General technical support' },
      { id: 'backup-recovery', type_name: 'Backup & Recovery', category: 'Data', description: 'Data backup and recovery services' }
    ]);
  }, []);

  // Calendar generation
  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const calendar = [];
    const current = new Date(startDate);

    for (let week = 0; week < 6; week++) {
      const weekDays = [];
      for (let day = 0; day < 7; day++) {
        weekDays.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      calendar.push(weekDays);
    }

    return calendar;
  };

  // Generate week view
  const generateWeekCalendar = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const week = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + day);
      week.push(date);
    }

    return [week]; // Return as array of arrays to match month format
  };

  // Generate day view
  const generateDayCalendar = () => {
    return [[currentDate]]; // Return as array of arrays to match month format
  };

  const generateYearCalendar = () => {
    // For year view, return 12 months as a 3x4 grid
    const year = currentDate.getFullYear();
    const months = [];
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(year, month, 1);
      months.push(monthDate);
    }

    // Group into 4 rows of 3 months each
    const yearCalendar = [];
    for (let row = 0; row < 4; row++) {
      const monthRow = [];
      for (let col = 0; col < 3; col++) {
        const monthIndex = row * 3 + col;
        monthRow.push(months[monthIndex]);
      }
      yearCalendar.push(monthRow);
    }
    return yearCalendar;
  };

  // Get calendar based on view mode
  const getCalendarData = () => {
    switch (calendarView) {
      case 'year':
        return generateYearCalendar();
      case 'week':
        return generateWeekCalendar();
      case 'day':
        return generateDayCalendar();
      default:
        return generateCalendar();
    }
  };

  // Date validation based on urgency level
  const isDateValid = (date: Date) => {
    if (!selectedUrgency) return true;

    const urgency = urgencyLevels.find(u => u.id === selectedUrgency);
    if (!urgency) return true;

    const now = new Date();

    // For same-day scheduling, we need to check if there's enough time left in the day
    // Set the date to start of day and compare
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // If it's a future date, it's always valid
    if (dateStart > todayStart) {
      return true;
    }

    // If it's today, check if we have enough lead time for the latest possible appointment
    if (dateStart.getTime() === todayStart.getTime()) {
      // Latest appointment is 10:00 PM (22:00) for extended hours
      const latestToday = new Date(date);
      latestToday.setHours(22, 0, 0, 0);

      // Check if latest appointment time meets lead time requirement
      const minDateTime = new Date(now.getTime() + urgency.lead_time_hours * 60 * 60 * 1000);
      return latestToday >= minDateTime;
    }

    // Past dates are not valid
    return false;
  };

  // Time slots generation - hourly blocks for timeline interface
  const generateTimeSlots = () => {
    const slots = [];
    // Extended hours: 6:00 AM - 10:00 PM (premium pricing after hours)
    for (let hour = 6; hour <= 22; hour++) {
      const timeString = `${hour.toString().padStart(2, '0')}:00`;
      slots.push(timeString);
    }
    return slots;
  };

  // Check if time slot is premium pricing
  const isPremiumTime = (timeSlot: string) => {
    const [hour] = timeSlot.split(':').map(Number);
    // Premium hours: before 8 AM or after 5 PM
    return hour < 8 || hour >= 17;
  };

  // Calculate end time based on start time and duration
  const calculateEndTime = (startTime: string, duration: number) => {
    const [hour] = startTime.split(':').map(Number);
    const endHour = hour + duration;
    return `${endHour.toString().padStart(2, '0')}:00`;
  };

  // Handle timeline selection
  const handleTimelineSelect = (startTime: string, duration: number) => {
    const endTime = calculateEndTime(startTime, duration);
    setSelectedTime(startTime);
    setSelectedEndTime(endTime);
    setSelectedDuration(duration);
  };

  // Get available durations for a start time
  const getAvailableDurations = (startTime: string) => {
    const [startHour] = startTime.split(':').map(Number);
    const maxHour = 22; // 10 PM
    const maxDuration = Math.min(8, maxHour - startHour); // Max 8 hours or until closing
    return Array.from({ length: maxDuration }, (_, i) => i + 1);
  };

  // Filter time slots based on urgency level and selected date
  const getAvailableTimeSlots = () => {
    const allSlots = generateTimeSlots();

    if (!selectedDate || !selectedUrgency) {
      return allSlots;
    }

    const urgency = urgencyLevels.find(u => u.id === selectedUrgency);
    if (!urgency) {
      return allSlots;
    }

    const now = new Date();
    const selectedDateStart = new Date(selectedDate);
    selectedDateStart.setHours(0, 0, 0, 0);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // If it's not today, all slots are available
    if (selectedDateStart.getTime() !== todayStart.getTime()) {
      return allSlots;
    }

    // For today, filter out slots that don't meet lead time requirement
    return allSlots.filter(timeSlot => {
      const [hour, minute] = timeSlot.split(':').map(Number);
      const slotDateTime = new Date(selectedDate);
      slotDateTime.setHours(hour, minute, 0, 0);

      const minDateTime = new Date(now.getTime() + urgency.lead_time_hours * 60 * 60 * 1000);
      return slotDateTime >= minDateTime;
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime || !selectedLocation || !selectedUrgency || !selectedServiceType) {
      return;
    }

    setIsSubmitting(true);

    try {
      const request: ServiceRequest = {
        service_type_id: selectedServiceType,
        service_location_id: selectedLocation,
        urgency_level_id: selectedUrgency,
        priority_level_id: 'standard', // Default priority level
        scheduled_date: selectedDate.toISOString().split('T')[0],
        scheduled_time: selectedTime,
        description,
        contact_name: contactName,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        attachment_file_ids: uploadedFiles.map(file => file.fileId).filter(Boolean)
      };

      // Submit to API
      const response = await fetch('/api/client/service-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RoleBasedStorage.getItem('sessionToken') || ''}`
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(t('schedule.messages.error'));
      }

      const result = await response.json();
      console.log('Service request submitted:', result);

      // If this was an emergency request, show additional confirmation
      if (selectedUrgency === 'emergency') {
        console.log('🚨 EMERGENCY SERVICE REQUEST SUBMITTED - Admin alerts triggered!');
      }

      setShowConfirmation(true);
    } catch (error) {
      console.error('Failed to submit service request:', error);
      alert(t('schedule.messages.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setSelectedDate(null);
    setSelectedTime('');
    setSelectedLocation('');
    setSelectedUrgency('');
    setSelectedServiceType('');
    setDescription('');
    setUploadedFiles([]);
    setShowConfirmation(false);
  };

  // Handle time slot selection from advanced scheduler
  const handleTimeSlotSelect = async (resourceId: string, startTime: Date, endTime: Date) => {
    try {
      const response = await fetch('/api/client/schedule-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RoleBasedStorage.getItem('sessionToken') || ''}`
        },
        body: JSON.stringify({
          resourceId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          serviceTypeId: selectedServiceType,
          description: description || 'Appointment scheduled via time slot picker',
          urgencyLevelId: selectedUrgency
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('schedule.messages.error'));
      }

      const result = await response.json();

      // Update the selected time and location to reflect the booking
      setSelectedLocation(resourceId);
      setSelectedTime(startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setSelectedDate(startTime);

      // Show success confirmation
      setShowConfirmation(true);

      console.log('✅ Appointment scheduled:', result.data);
    } catch (error) {
      console.error('❌ Failed to schedule appointment:', error);
      alert(`Failed to schedule appointment: ${error.message}`);
    }
  };

  // Handle opening time slot scheduler
  const handleOpenTimeSlotScheduler = () => {
    if (!selectedDate) {
      alert(t('schedule.messages.selectDate'));
      return;
    }
    setShowTimeSlotScheduler(true);
  };

  const calendar = getCalendarData();
  const timeSlots = getAvailableTimeSlots();

  if (showConfirmation) {
    return (
      <div className={`max-w-2xl mx-auto p-6 rounded-lg border ${
        isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900">
            <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className={`mt-4 text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('schedule.confirmation.title')}
          </h3>
          <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {t('schedule.confirmation.message')}
          </p>
          <div className="mt-6">
            <button
              onClick={resetForm}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {t('schedule.confirmation.scheduleAnother')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-6xl mx-auto p-6 rounded-lg border ${
      isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    }`}>
      <div className="mb-6">
        <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          {t('schedule.title')}
        </h2>
        <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {t('schedule.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Calendar & Time */}
        <div className="space-y-6">
          {/* Urgency Level Selection */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('schedule.urgency.title')}
            </label>
            <div className="grid grid-cols-1 gap-3">
              {urgencyLevels.map((urgency) => (
                <div
                  key={urgency.id}
                  className={`relative rounded-lg border p-4 cursor-pointer ${
                    selectedUrgency === urgency.id
                      ? `border-${urgency.color}-500 bg-${urgency.color}-50 dark:bg-${urgency.color}-900/20`
                      : isDarkMode
                        ? 'border-gray-600 hover:border-gray-500'
                        : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => setSelectedUrgency(urgency.id)}
                >
                  <div className="flex items-start">
                    <div className={`flex-shrink-0 ${urgency.color === 'blue' ? 'text-blue-500' : urgency.color === 'yellow' ? 'text-yellow-500' : 'text-red-500'}`}>
                      {urgency.icon}
                    </div>
                    <div className="ml-3 flex-1">
                      <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {urgency.level_name}
                      </p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {urgency.description}
                      </p>
                    </div>
                    {selectedUrgency === urgency.id && (
                      <div className={`flex-shrink-0 text-${urgency.color}-500`}>
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('schedule.selectDate')}
            </label>
            <div className={`border rounded-lg p-4 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => {
                    const newDate = new Date(currentDate);
                    if (calendarView === 'month') {
                      newDate.setMonth(newDate.getMonth() - 1);
                    } else if (calendarView === 'week') {
                      newDate.setDate(newDate.getDate() - 7);
                    } else {
                      newDate.setDate(newDate.getDate() - 1);
                    }
                    setCurrentDate(newDate);
                  }}
                  className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex flex-col items-center">
                  <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {calendarView === 'month'
                      ? (() => {
                          const monthKey = getMonthShortTranslationKey(currentDate.getMonth());
                          const translation = t(monthKey);
                          // If translation returns the month index (like "8"), use fallback month names
                          if (translation === currentDate.getMonth().toString()) {
                            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
                          }
                          return `${translation} ${currentDate.getFullYear()}`;
                        })()
                      : calendarView === 'week'
                      ? `${t('calendar.weekOf')} ${t(getMonthTranslationKey(currentDate.getMonth()))} ${currentDate.getDate()}, ${currentDate.getFullYear()}`
                      : `${t(getDayTranslationKey(currentDate.getDay()))} ${t(getMonthTranslationKey(currentDate.getMonth()))} ${currentDate.getDate()}, ${currentDate.getFullYear()}`
                    }
                  </h3>

                  {/* View Toggle Buttons */}
                  <div className="flex mt-2 space-x-1">
                    {(['year', 'month', 'week', 'today'] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => {
                          if (view === 'today') {
                            setCurrentDate(new Date());
                            setCalendarView('month');
                          } else {
                            setCalendarView(view);
                          }
                        }}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          calendarView === view
                            ? 'bg-blue-600 text-white'
                            : isDarkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t(`calendar.views.${view}`)}
                      </button>
                    ))}
                  </div>


                </div>

                <button
                  type="button"
                  onClick={() => {
                    const newDate = new Date(currentDate);
                    if (calendarView === 'month') {
                      newDate.setMonth(newDate.getMonth() + 1);
                    } else if (calendarView === 'week') {
                      newDate.setDate(newDate.getDate() + 7);
                    } else {
                      newDate.setDate(newDate.getDate() + 1);
                    }
                    setCurrentDate(newDate);
                  }}
                  className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Calendar Grid */}
              <div className={`grid gap-1 ${
                calendarView === 'day' ? 'grid-cols-1' : 'grid-cols-7'
              }`}>
                {/* Day headers - only show for month and week views */}
                {calendarView !== 'day' && [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => (
                  <div key={dayIndex} className={`p-2 text-center text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t(`calendar.daysShort.${dayIndex}`)}
                  </div>
                ))}

                {/* Calendar days */}
                {calendar.map((week, weekIdx) =>
                  week.map((date, dayIdx) => {
                    const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                    const isPastDate = date < new Date(new Date().setHours(0, 0, 0, 0));

                    // Allow clicks on future dates (either current month valid dates OR future month dates)
                    const isValid = (isCurrentMonth && isDateValid(date)) || (!isCurrentMonth && !isPastDate);

                    return (
                      <button
                        key={`${weekIdx}-${dayIdx}`}
                        type="button"
                        onClick={() => {
                          if (isValid) {
                            setSelectedDate(date);
                            setShowTimeSlotScheduler(true);
                          }
                        }}
                        disabled={!isValid}
                        className={`p-2 text-sm rounded-lg ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : isToday
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

        {/* Right Column - Service Details */}
        <div className="space-y-6">
          {/* Service Location */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('schedule.location')}
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
              required
            >
              <option value="">{t('schedule.selectLocation')}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.address_label} - {location.city}, {location.state}
                </option>
              ))}
            </select>
          </div>

          {/* Service Type */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('schedule.serviceType')}
            </label>
            <select
              value={selectedServiceType}
              onChange={(e) => setSelectedServiceType(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
              required
            >
              <option value="">{t('schedule.selectServiceType')}</option>
              {serviceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.type_name} - {type.description}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('schedule.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              placeholder={t('schedule.descriptionPlaceholder')}
            />
          </div>

          {/* File Upload */}
          <div>
            <h4 className={`text-lg font-medium mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('schedule.attachFiles')}
            </h4>
            <FileUpload
              onUploadComplete={handleFileUploadComplete}
              serviceLocationId={selectedLocation}
              maxFiles={3}
              maxFileSize={10 * 1024 * 1024} // 10MB
            />

            {/* Show uploaded files summary */}
            {uploadedFiles.length > 0 && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} uploaded successfully
                </p>
              </div>
            )}
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h4 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('schedule.contactInfo')}
            </h4>

            <div>
              <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('schedule.contactName')}
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('schedule.phoneNumber')}
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('schedule.emailAddress')}
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
                required
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !selectedDate || !selectedTime || !selectedLocation || !selectedUrgency || !selectedServiceType}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('schedule.messages.submitting')}
                </div>
              ) : (
                t('schedule.buttons.scheduleRequest')
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Advanced Time Slot Scheduler Modal */}
      {showTimeSlotScheduler && (
        <ResourceTimeSlotScheduler
          selectedDate={selectedDate!}
          onSlotSelect={handleTimeSlotSelect}
          onClose={() => setShowTimeSlotScheduler(false)}
          businessId={''} // This will be populated from user context
        />
      )}
    </div>
  );
};

export default ServiceScheduler;