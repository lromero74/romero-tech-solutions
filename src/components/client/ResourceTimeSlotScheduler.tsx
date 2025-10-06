import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
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

interface ResourceTimeSlotSchedulerProps {
  selectedDate: Date;
  onSlotSelect: (resourceId: string, startTime: Date, endTime: Date, costBreakdown?: CostBreakdown) => void;
  onDateChange: (date: Date) => void;
  onClose: () => void;
  businessId: string;
  initialDuration?: number;
  initialTierPreference?: 'any' | 'standard' | 'premium' | 'emergency';
  onDurationChange?: (duration: number) => void;
  onTierPreferenceChange?: (preference: 'any' | 'standard' | 'premium' | 'emergency') => void;
  suggestedStartTime?: Date | null;
  suggestedEndTime?: Date | null;
}

const ResourceTimeSlotScheduler: React.FC<ResourceTimeSlotSchedulerProps> = ({
  selectedDate,
  onSlotSelect,
  onDateChange,
  onClose,
  businessId,
  initialDuration = 1,
  initialTierPreference = 'standard',
  onDurationChange,
  onTierPreferenceChange,
  suggestedStartTime = null,
  suggestedEndTime = null
}) => {
  const { isDarkMode } = useClientTheme();
  const { t, language } = useClientLanguage();

  // Helper function to capitalize Spanish date strings
  const formatDateString = (date: Date, locale: string, options: Intl.DateTimeFormatOptions): string => {
    const formatted = date.toLocaleDateString(locale, options);

    // Capitalize first letter for Spanish dates
    if (locale === 'es-ES') {
      // Split by spaces and capitalize weekday and month names
      const words = formatted.split(' ');
      return words.map((word, index) => {
        // First word (weekday) - always capitalize
        if (index === 0) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        // Words that are month names (not numbers, "de", or years)
        if (!word.match(/^\d/) && word !== 'de') {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
      }).join(' ');
    }

    return formatted;
  };

  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [selectedStartTime, setSelectedStartTime] = useState<Date | null>(null);
  const [selectedEndTime, setSelectedEndTime] = useState<Date | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(initialDuration);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'move' | 'resize-start' | 'resize-end' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isAutoSuggesting, setIsAutoSuggesting] = useState(false);
  const [rateTiers, setRateTiers] = useState<RateTier[]>([]);
  const [baseHourlyRate, setBaseHourlyRate] = useState<number>(75); // Default fallback
  const [rateCategoryName, setRateCategoryName] = useState<string>('Standard'); // Default category name
  const [tierPreference, setTierPreference] = useState<'any' | 'standard' | 'premium' | 'emergency'>(initialTierPreference);
  const [isFirstTimer, setIsFirstTimer] = useState<boolean>(false);

  // Initialize time format from user preference if available
  const getUserTimeFormatPreference = (): boolean => {
    try {
      const authUser = RoleBasedStorage.getItem('authUser');
      console.log('🕐 Loading time format preference from authUser:', authUser);
      if (authUser) {
        const user = JSON.parse(authUser);
        console.log('🕐 Parsed user data:', user);
        console.log('🕐 timeFormatPreference:', user.timeFormatPreference);
        const is24h = user.timeFormatPreference === '24h';
        console.log('🕐 Setting is24HourFormat to:', is24h);
        return is24h;
      }
    } catch (error) {
      console.warn('Failed to load user time format preference:', error);
    }
    console.log('🕐 Defaulting to 12-hour format');
    return false; // Default to 12-hour format
  };

  const [is24HourFormat, setIs24HourFormat] = useState<boolean>(getUserTimeFormatPreference());

  const BUFFER_HOURS = 1;

  // Helper function to format time based on 24-hour or 12-hour preference
  const formatTime = (hour: number, minute: number): string => {
    if (is24HourFormat) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else {
      const period = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
    }
  };

  // Helper function to find rate tier for a given time
  const findRateTierForTime = (hour: number, minute: number, dayOfWeek: number): RateTier | undefined => {
    // Create a Date object for the selected time in local timezone
    const localDate = new Date(selectedDate);
    localDate.setHours(hour, minute, 0, 0);

    // Convert local time to UTC to match the database storage
    const utcDate = new Date(localDate.toISOString());
    const utcDayOfWeek = utcDate.getUTCDay();
    const utcHour = utcDate.getUTCHours();
    const utcMinute = utcDate.getUTCMinutes();
    const utcTimeString = `${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')}:00`;

    // Find ALL matching tiers for this UTC day and time (handle overlapping ranges)
    const matchingTiers = rateTiers.filter(tier => {
      if (tier.dayOfWeek !== utcDayOfWeek) return false;

      // Handle midnight crossing: if timeEnd is "00:00:00", treat it as "24:00:00"
      const adjustedTimeEnd = tier.timeEnd === '00:00:00' ? '24:00:00' : tier.timeEnd;

      // Compare UTC time strings (both are now in UTC)
      return utcTimeString >= tier.timeStart && utcTimeString < adjustedTimeEnd;
    });

    // If multiple tiers match (overlapping ranges), return the highest priority tier
    if (matchingTiers.length > 0) {
      // Sort by tier level descending (Emergency = 3, Premium = 2, Standard = 1)
      return matchingTiers.sort((a, b) => b.tierLevel - a.tierLevel)[0];
    }

    // If no exact match, return undefined (no default tier)
    return undefined;
  };

  // Check if selected time range includes emergency hours
  const getSelectedTimeRateInfo = () => {
    if (!selectedStartTime || !selectedEndTime) return null;

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
        currentTime.getDay()  // Pass the current time's day, not just the start time's day
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

  // Calculate estimated cost based on selected time and rate tiers
  const calculateEstimatedCost = () => {
    if (!selectedStartTime || !selectedEndTime) return null;

    const durationMs = selectedEndTime.getTime() - selectedStartTime.getTime();
    const totalHours = durationMs / (1000 * 60 * 60);
    let totalCost = 0;

    // Track tier blocks (contiguous periods of same tier)
    interface TierBlock {
      tierName: string;
      multiplier: number;
      hours: number;
      cost: number;
    }
    const tierBlocks: TierBlock[] = [];
    let currentBlock: { tierName: string; multiplier: number; halfHourCount: number } | null = null;

    // Calculate cost for each 30-minute increment
    let currentTime = new Date(selectedStartTime);
    while (currentTime < selectedEndTime) {
      const tier = findRateTierForTime(
        currentTime.getHours(),
        currentTime.getMinutes(),
        currentTime.getDay()  // Use the current time's day, not just the start time's day
      );

      const tierName = tier?.tierName || 'Standard';
      const multiplier = tier?.rateMultiplier || 1.0;
      const incrementCost = (baseHourlyRate * multiplier) / 2; // Half-hour rate
      totalCost += incrementCost;

      // Group contiguous blocks of same tier
      if (currentBlock && currentBlock.tierName === tierName && currentBlock.multiplier === multiplier) {
        currentBlock.halfHourCount += 1;
      } else {
        // Save previous block if exists
        if (currentBlock) {
          const hours = currentBlock.halfHourCount / 2;
          tierBlocks.push({
            tierName: currentBlock.tierName,
            multiplier: currentBlock.multiplier,
            hours,
            cost: hours * baseHourlyRate * currentBlock.multiplier
          });
        }
        // Start new block
        currentBlock = { tierName, multiplier, halfHourCount: 1 };
      }

      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000); // Add 30 minutes
    }

    // Save final block
    if (currentBlock) {
      const hours = currentBlock.halfHourCount / 2;
      tierBlocks.push({
        tierName: currentBlock.tierName,
        multiplier: currentBlock.multiplier,
        hours,
        cost: hours * baseHourlyRate * currentBlock.multiplier
      });
    }

    // Apply first-hour comp for first-time clients
    interface FirstHourCompBreakdown {
      tierName: string;
      multiplier: number;
      hours: number;
      discount: number;
    }
    let firstHourDiscount = 0;
    const firstHourCompBreakdown: FirstHourCompBreakdown[] = [];

    if (isFirstTimer && totalHours >= 1) {
      // Calculate the cost of the first hour, broken down by tier
      let hoursAccounted = 0;
      for (const block of tierBlocks) {
        if (hoursAccounted >= 1) break;

        const hoursInThisBlock = Math.min(block.hours, 1 - hoursAccounted);
        const discountForThisBlock = hoursInThisBlock * baseHourlyRate * block.multiplier;

        firstHourCompBreakdown.push({
          tierName: block.tierName,
          multiplier: block.multiplier,
          hours: hoursInThisBlock,
          discount: discountForThisBlock
        });

        firstHourDiscount += discountForThisBlock;
        hoursAccounted += hoursInThisBlock;
      }
    }

    const finalTotal = Math.max(0, totalCost - firstHourDiscount);

    return {
      total: finalTotal,
      subtotal: totalCost,
      firstHourDiscount: firstHourDiscount > 0 ? firstHourDiscount : undefined,
      firstHourCompBreakdown: firstHourCompBreakdown.length > 0 ? firstHourCompBreakdown : undefined,
      hourly: totalCost / totalHours,
      breakdown: tierBlocks,
      isFirstTimer
    };
  };

  const estimatedCost = calculateEstimatedCost();

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
          time: formatTime(hour, minute),
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
  }, [selectedDate, rateTiers, is24HourFormat]);

  // Apply suggested times from auto-suggest
  useEffect(() => {
    if (suggestedStartTime && suggestedEndTime) {
      console.log('🎯 Applying suggested time slot:', {
        start: suggestedStartTime.toLocaleString(),
        end: suggestedEndTime.toLocaleString()
      });
      setSelectedStartTime(suggestedStartTime);
      setSelectedEndTime(suggestedEndTime);
    }
  }, [suggestedStartTime, suggestedEndTime]);

  // Load rate tiers and existing bookings
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load business-specific base hourly rate
        try {
          const rateResponse = await fetch(
            `${import.meta.env.VITE_API_BASE_URL}/public/base-hourly-rate?businessId=${businessId}`
          );
          if (rateResponse.ok) {
            const rateData = await rateResponse.json();
            if (rateData.success && rateData.data.baseHourlyRate) {
              setBaseHourlyRate(rateData.data.baseHourlyRate);
              if (rateData.data.rateCategoryName) {
                setRateCategoryName(rateData.data.rateCategoryName);
              }
              console.log(`💰 Loaded base hourly rate for business: $${rateData.data.baseHourlyRate}/hr (${rateData.data.rateCategoryName || 'Standard'}) (source: ${rateData.data.source || 'unknown'})`);
            }
          }
        } catch (error) {
          console.error('Failed to load base hourly rate, using default:', error);
        }

        // Check if client is a first-timer (for first hour comp)
        try {
          const firstTimerResult = await apiService.get<{ success: boolean; data: { isFirstTimer: boolean } }>(
            '/client/is-first-timer'
          );
          if (firstTimerResult.success) {
            setIsFirstTimer(firstTimerResult.data.isFirstTimer);
            console.log(`🎁 First-timer status: ${firstTimerResult.data.isFirstTimer ? 'YES - First hour will be comped!' : 'No'}`);
          }
        } catch (error) {
          console.error('Failed to load first-timer status:', error);
        }

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
        console.log('📅 Bookings API response:', bookingsResult);
        console.log('📅 Raw booking data:', JSON.stringify(bookingsResult.data, null, 2));
        if (bookingsResult.success) {
          const bookings = bookingsResult.data.map((b: any) => {
            console.log('📅 Processing booking:', b);
            return {
              ...b,
              startTime: new Date(b.startTime),
              endTime: new Date(b.endTime)
            };
          });
          console.log('📅 Processed bookings:', bookings);
          setExistingBookings(bookings);
        } else {
          console.error('❌ Failed to load bookings:', bookingsResult);
        }
      } catch (error) {
        console.error('Error loading scheduler data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedDate]);

  // Auto-scroll to "Now" or first standard hour on initial load only
  useEffect(() => {
    if (loading) return; // Wait until loading completes

    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    const isFutureDate = selectedDate > now;

    // Small delay to ensure DOM is ready
    setTimeout(() => {
      if (isToday) {
        // Scroll to current time for today
        scrollToNow();
      } else if (isFutureDate) {
        // Scroll to first standard hour (08:00) for future dates
        const firstStandardHour = 8; // 08:00
        const slotIndex = firstStandardHour * 2; // Each hour has 2 slots (30-min intervals)
        const scrollPosition = slotIndex * 64;

        const container = document.getElementById('timeline-scroll');
        if (container) {
          container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
        }
      }
    }, 150);
  }, [loading, selectedDate]); // Only trigger on loading completion or date change

  // ESC key handler to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleEscKey);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  // Check if a time slot is blocked
  const checkIfSlotBlocked = (slotTime: Date, durationHours: number = selectedDuration): { isBlocked: boolean; reason?: string } => {
    const slotEnd = new Date(slotTime.getTime() + (durationHours * 60 * 60 * 1000));

    // Debug logging for first few checks
    if (slotTime.getHours() >= 12 && slotTime.getHours() <= 17 && slotTime.getMinutes() === 0) {
      console.log(`🔍 Checking slot ${slotTime.toLocaleTimeString()} (duration: ${durationHours}h) against ${existingBookings.length} bookings`);
      existingBookings.forEach(booking => {
        console.log(`   📌 Booking: ${booking.startTime.toLocaleTimeString()} - ${booking.endTime.toLocaleTimeString()}`);
      });
    }

    for (const booking of existingBookings) {
      // Check for direct overlap (Rule 8)
      const hasOverlap = slotTime < booking.endTime && slotEnd > booking.startTime;
      if (slotTime.getHours() === 13 && slotTime.getMinutes() === 0) {
        console.log(`🔍 Slot 13:00 overlap check:`, {
          slotTime: slotTime.toISOString(),
          slotEnd: slotEnd.toISOString(),
          bookingStart: booking.startTime.toISOString(),
          bookingEnd: booking.endTime.toISOString(),
          slotTimeBeforeBookingEnd: slotTime < booking.endTime,
          slotEndAfterBookingStart: slotEnd > booking.startTime,
          hasOverlap
        });
      }
      if (hasOverlap) {
        const startTime = booking.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = booking.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          isBlocked: true,
          reason: t('scheduler.overlapsAppointment', { start: startTime, end: endTime }, `Overlaps with existing appointment (${startTime} - ${endTime})`)
        };
      }

      // Check 1-hour buffer after existing appointment (Rule 7)
      const oneHourAfter = new Date(booking.endTime.getTime() + (BUFFER_HOURS * 60 * 60 * 1000));
      if (slotTime >= booking.endTime && slotTime < oneHourAfter) {
        const endTime = booking.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          isBlocked: true,
          reason: t('scheduler.mustWaitAfter', { time: endTime }, `Must wait 1 hour after appointment ending at ${endTime}`)
        };
      }

      // Check 1-hour buffer before existing appointment (Rule 9)
      const oneHourBefore = new Date(booking.startTime.getTime() - (BUFFER_HOURS * 60 * 60 * 1000));

      // Debug logging for 12:00-13:00 slots
      if (slotTime.getHours() === 12 && slotTime.getMinutes() === 0) {
        console.log('🔍 12:00 buffer check:', {
          slotTime: slotTime.toISOString(),
          slotEnd: slotEnd.toISOString(),
          bookingStart: booking.startTime.toISOString(),
          oneHourBefore: oneHourBefore.toISOString(),
          slotEndMs: slotEnd.getTime(),
          oneHourBeforeMs: oneHourBefore.getTime(),
          bookingStartMs: booking.startTime.getTime(),
          slotEndAfterOneHourBefore: slotEnd > oneHourBefore,
          slotEndBeforeBookingStart: slotEnd <= booking.startTime,
          wouldBlock: slotEnd > oneHourBefore && slotEnd <= booking.startTime
        });
      }

      if (slotEnd > oneHourBefore && slotEnd <= booking.startTime) {
        const startTime = booking.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          isBlocked: true,
          reason: t('scheduler.mustEndBefore', { time: startTime }, `Must end 1 hour before appointment starting at ${startTime}`)
        };
      }
    }

    return { isBlocked: false };
  };

  // Handle slot click
  const handleSlotClick = (slot: TimeSlot) => {
    if (slot.isPast) {
      setErrorMessage(t('scheduler.error.pastOrTooSoon', 'Cannot schedule appointments in the past or less than 1 hour from now'));
      return;
    }

    const slotTime = new Date(selectedDate);
    slotTime.setHours(slot.hour, slot.minute, 0, 0);

    // Check if appointment would go past midnight into next day
    const slotEnd = new Date(slotTime.getTime() + (selectedDuration * 60 * 60 * 1000));
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    if (slotEnd > endOfDay) {
      setErrorMessage(t('scheduler.error.pastMidnight', { duration: selectedDuration.toString() }, 'Selected duration ({{duration}}h) would extend past midnight. Please select an earlier time or shorter duration.'));
      return;
    }

    const blockCheck = checkIfSlotBlocked(slotTime, selectedDuration);
    if (blockCheck.isBlocked) {
      setErrorMessage(blockCheck.reason || t('scheduler.error.slotUnavailable', 'This time slot is not available'));
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
    onDurationChange?.(newDuration);

    // If there's a selection, recalculate end time
    if (selectedStartTime) {
      const newEndTime = new Date(selectedStartTime.getTime() + (newDuration * 60 * 60 * 1000));
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      if (newEndTime > endOfDay) {
        setErrorMessage(t('scheduler.error.pastMidnightDuration', { duration: newDuration.toString() }, 'Duration of {{duration}}h would extend past midnight. Please select a shorter duration or earlier start time.'));
        setSelectedStartTime(null);
        setSelectedEndTime(null);
        return;
      }

      const blockCheck = checkIfSlotBlocked(selectedStartTime, newDuration);
      if (blockCheck.isBlocked) {
        setErrorMessage(blockCheck.reason || t('scheduler.error.durationUnavailable', 'This time slot is not available with the new duration'));
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
          durationHours: selectedDuration,
          tierPreference: tierPreference
        }
      );

      if (result.success && result.data) {
        const suggested = result.data;

        // Debug: Log what we received from backend
        console.log('🔍 Auto-suggest received from backend:',{
          startTimeUTC: suggested.startTime,
          endTimeUTC: suggested.endTime
        });

        const startTime = new Date(suggested.startTime);
        const endTime = new Date(suggested.endTime);

        // Debug: Log after Date conversion
        console.log('🔍 After Date conversion:', {
          startTimeLocal: startTime.toLocaleString(),
          endTimeLocal: endTime.toLocaleString(),
          startTimeISO: startTime.toISOString(),
          endTimeISO: endTime.toISOString()
        });

        // Update selected date to match the suggested slot's date
        const suggestedDate = new Date(startTime);
        suggestedDate.setHours(0, 0, 0, 0);
        onDateChange(suggestedDate);

        setSelectedStartTime(startTime);
        setSelectedEndTime(endTime);
        setErrorMessage('');

        // Scroll to show the suggested slot with good context, especially on mobile
        setTimeout(() => {
          const hours = startTime.getHours();
          const minutes = startTime.getMinutes();

          const container = document.getElementById('timeline-scroll');
          if (!container) return;

          // Calculate slot position in timeline
          const slotIndex = (hours - 6) * 2 + (minutes / 30);
          const slotPosition = slotIndex * 64; // Each 30-min slot is 64px wide

          // Get viewport width to adjust scroll for mobile
          const viewportWidth = container.clientWidth;

          // Position slot at 20% from left edge (works well on mobile and desktop)
          // This shows plenty of context before the slot
          const targetScrollPosition = slotPosition - (viewportWidth * 0.2);

          // Don't scroll before timeline start (6 AM)
          const finalScrollPosition = Math.max(0, targetScrollPosition);

          container.scrollTo({ left: finalScrollPosition, behavior: 'smooth' });
        }, 500); // Longer delay to allow for date change and timeline re-render
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
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, mode: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragMode(`resize-${mode}`);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
    setDragStartTime(mode === 'start' ? selectedStartTime : selectedEndTime);
    setErrorMessage(''); // Clear any previous errors

    // Calculate slot width once at start
    const timelineContainer = document.querySelector('.flex-shrink-0.w-16');
    const slotWidth = timelineContainer ? timelineContainer.getBoundingClientRect().width : 64;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!selectedStartTime || !selectedEndTime || !dragStartTime) return;

      const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const deltaX = currentX - dragStartX;
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

    const handleEnd = () => {
      setIsDragging(false);
      setDragMode(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);

      // Validate final selection
      if (selectedStartTime && selectedEndTime) {
        const durationHours = (selectedEndTime.getTime() - selectedStartTime.getTime()) / (1000 * 60 * 60);
        const blockCheck = checkIfSlotBlocked(selectedStartTime, durationHours);
        if (blockCheck.isBlocked) {
          setErrorMessage(blockCheck.reason || t('scheduler.error.invalidSelection', 'Invalid time selection'));
          // Don't clear selection immediately - let user see the error and adjust
        } else {
          setErrorMessage(''); // Clear error on successful validation
        }
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  };

  // Handle drag move
  const handleMoveStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragMode('move');
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
    setDragStartTime(selectedStartTime);
    setErrorMessage(''); // Clear any previous errors

    // Calculate slot width once at start
    const timelineContainer = document.querySelector('.flex-shrink-0.w-16');
    const slotWidth = timelineContainer ? timelineContainer.getBoundingClientRect().width : 64;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!selectedStartTime || !selectedEndTime || !dragStartTime) return;

      const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const deltaX = currentX - dragStartX;
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

    const handleEnd = () => {
      setIsDragging(false);
      setDragMode(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);

      // Validate final selection
      if (selectedStartTime && selectedEndTime) {
        const durationHours = (selectedEndTime.getTime() - selectedStartTime.getTime()) / (1000 * 60 * 60);
        const blockCheck = checkIfSlotBlocked(selectedStartTime, durationHours);
        if (blockCheck.isBlocked) {
          setErrorMessage(blockCheck.reason || t('scheduler.error.invalidSelection', 'Invalid time selection'));
          // Don't clear selection immediately - let user see the error and adjust
        } else {
          setErrorMessage(''); // Clear error on successful validation
        }
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  };

  // Confirm booking
  const handleConfirmBooking = () => {
    if (selectedStartTime && selectedEndTime && estimatedCost) {
      // Prepare cost breakdown data
      const costBreakdown: CostBreakdown = {
        total: estimatedCost.total,
        subtotal: estimatedCost.subtotal,
        firstHourDiscount: estimatedCost.firstHourDiscount,
        firstHourCompBreakdown: estimatedCost.firstHourCompBreakdown,
        baseHourlyRate,
        rateCategoryName,
        breakdown: estimatedCost.breakdown,
        isFirstTimer: estimatedCost.isFirstTimer
      };

      // Use first service location as resourceId (simplified - you may want to add location selector)
      onSlotSelect('', selectedStartTime, selectedEndTime, costBreakdown);
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
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={(e) => {
        // Close modal if clicking on backdrop (not on modal content)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold truncate">{t('scheduler.title', 'Schedule Appointment')}</h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                {formatDateString(selectedDate, language === 'es' ? 'es-ES' : 'en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('X button clicked - closing modal');
                onClose();
              }}
              className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
              aria-label={t('scheduler.close', 'Close scheduler')}
              title="Close"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6 pointer-events-none" />
            </button>
          </div>

          {/* Time Format Toggle and Now Button */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {/* Time Format Toggle */}
            <div className="flex items-center gap-2 min-w-fit">
              <label className="text-sm font-medium whitespace-nowrap">{t('scheduler.timeFormat', 'Time:')}</label>
              <button
                type="button"
                onClick={() => setIs24HourFormat(!is24HourFormat)}
                className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'
                    : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
                }`}
                title={is24HourFormat ? t('scheduler.switchTo12Hour', 'Switch to 12-hour format') : t('scheduler.switchTo24Hour', 'Switch to 24-hour format')}
              >
                {is24HourFormat ? '24h' : '12h'}
              </button>
            </div>

            {/* Now button */}
            {selectedDate.toDateString() === new Date().toDateString() && (
              <button
                onClick={scrollToNow}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
              >
                {t('scheduler.now', 'Now')}
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
                  {t('scheduler.emergencyHoursTitle', '⚠️ Emergency Hours Selected')}
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                  {t('scheduler.emergencyHoursMessage', { multiplier: selectedRateInfo.maxMultiplier.toString() }, 'Your selected time includes Emergency rate hours ({{multiplier}}x rate). This appointment will be charged at a higher rate than standard hours.')}
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
                  {t('scheduler.premiumHoursTitle', 'Premium Hours Selected')}
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  {t('scheduler.premiumHoursMessage', { multiplier: selectedRateInfo.maxMultiplier.toString() }, 'Your selected time includes Premium rate hours ({{multiplier}}x rate).')}
                </p>
              </div>
            </div>
          )}

          {isSelectedDateInPast && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                {t('scheduler.pastDateWarning', '⚠️ Cannot schedule appointments in the past. Please select a future date.')}
              </p>
            </div>
          )}
        </div>

        {/* Day Navigation */}
        <div className="flex items-center justify-between sm:justify-center gap-2 sm:gap-4 py-3 px-4 sm:px-0 border-t border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              const prevDay = new Date(selectedDate);
              prevDay.setDate(selectedDate.getDate() - 1);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              if (prevDay >= today) {
                onDateChange(prevDay);
              }
            }}
            disabled={(() => {
              const prevDay = new Date(selectedDate);
              prevDay.setDate(selectedDate.getDate() - 1);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return prevDay < today;
            })()}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('scheduler.previousDay', 'Previous Day')}</span>
          </button>

          <div className="text-center flex-1 sm:flex-initial px-2">
            <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
              {formatDateString(selectedDate, language === 'es' ? 'es-ES' : 'en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>

          <button
            onClick={() => {
              const nextDay = new Date(selectedDate);
              nextDay.setDate(selectedDate.getDate() + 1);
              onDateChange(nextDay);
            }}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <span className="hidden sm:inline">{t('scheduler.nextDay', 'Next Day')}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isSelectedDateInPast ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
                  {t('scheduler.pastDateTitle', 'Past Date Selected')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('scheduler.pastDateMessage', 'Please select today or a future date to schedule appointments.')}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Row labels */}
              <div className="flex flex-col border-r border-gray-200 dark:border-gray-700">
                <div className="w-20 sm:w-32 h-[26px] border-b border-gray-200 dark:border-gray-700 flex items-center justify-center bg-white dark:bg-gray-800">
                  <span className="font-medium text-xs">{t('scheduler.time', 'Time')}</span>
                </div>
                <div className="w-20 sm:w-32 flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-2">
                  <span className="text-xs sm:text-sm font-medium text-center leading-tight">{t('scheduler.availableSlots', 'Available Slots')}</span>
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
                        // Check the individual 30-minute slot (0.5 hours), not the selected duration
                        const blockCheck = checkIfSlotBlocked(slotTime, 0.5);

                        const isInSelectedRange = selectedStartTime && selectedEndTime &&
                          slotTime >= selectedStartTime && slotTime < selectedEndTime;

                        let bgColor = '';
                        let tierLabel = '';

                        if (slot.isPast) {
                          bgColor = 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed';
                          tierLabel = t('scheduler.pastTimeSlot', 'Past time slot');
                        } else if (blockCheck.isBlocked) {
                          bgColor = 'cursor-not-allowed';
                          tierLabel = blockCheck.reason || t('scheduler.buffer', 'Buffer');
                        } else if (isInSelectedRange) {
                          bgColor = 'bg-blue-500 text-white';
                          tierLabel = t('scheduler.selected', 'Selected');
                        } else if (slot.rateTier) {
                          // Use color from database
                          const lightenedColor = slot.rateTier.colorCode + '1A'; // Add transparency
                          const hoverColor = slot.rateTier.colorCode + '33';
                          bgColor = `cursor-pointer`;
                          // Map tier level to translation key with variable
                          const multiplier = { multiplier: slot.rateTier.rateMultiplier.toString() };
                          tierLabel = slot.rateTier.tierLevel === 3
                            ? t('scheduler.emergencyHours', multiplier, 'Emergency hours ({{multiplier}}x rate)')
                            : slot.rateTier.tierLevel === 2
                            ? t('scheduler.premiumHours', multiplier, 'Premium hours ({{multiplier}}x rate)')
                            : t('scheduler.standardHours', multiplier, 'Standard hours ({{multiplier}}x rate)');
                        } else {
                          bgColor = 'bg-gray-100 dark:bg-gray-800 cursor-pointer';
                          tierLabel = t('scheduler.unavailable', 'Unavailable');
                        }

                        return (
                          <div
                            key={i}
                            className={`flex-shrink-0 w-16 h-20 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs transition-colors ${bgColor}`}
                            style={
                              blockCheck.isBlocked
                                ? {
                                    backgroundImage: isDarkMode
                                      ? 'repeating-linear-gradient(45deg, #4B5563 0px, #4B5563 10px, #6B7280 10px, #6B7280 20px)'
                                      : 'repeating-linear-gradient(45deg, #D1D5DB 0px, #D1D5DB 10px, #E5E7EB 10px, #E5E7EB 20px)'
                                  }
                                : slot.rateTier && !slot.isPast && !isInSelectedRange
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
                          className="absolute top-0 h-20 bg-blue-600/80 border-2 border-blue-700 rounded z-20"
                          style={{
                            left: `${(selectedStartTime.getHours() * 2 + selectedStartTime.getMinutes() / 30) * 64}px`,
                            width: `${((selectedEndTime.getTime() - selectedStartTime.getTime()) / (30 * 60 * 1000)) * 64}px`
                          }}
                        >
                          {/* Move handle - center area only, excludes edges */}
                          <div
                            className="absolute inset-0 cursor-move pointer-events-auto flex items-center justify-center text-white text-xs font-medium touch-none"
                            style={{ left: '12px', right: '12px' }} // Leave space for resize handles
                            onMouseDown={handleMoveStart}
                            onTouchStart={handleMoveStart}
                            title={t('scheduler.dragToMove', 'Drag to move appointment')}
                          >
                            <div className="text-center pointer-events-none">
                              <div>{formatTime(selectedStartTime.getHours(), selectedStartTime.getMinutes())}</div>
                              <div className="text-[10px]">{t('scheduler.to', 'to')}</div>
                              <div>{formatTime(selectedEndTime.getHours(), selectedEndTime.getMinutes())}</div>
                            </div>
                          </div>

                          {/* Start resize handle - higher z-index to be on top */}
                          <div
                            className="absolute left-0 top-0 w-3 h-20 bg-blue-900 cursor-ew-resize pointer-events-auto hover:bg-blue-950 z-10 flex items-center justify-center touch-none"
                            onMouseDown={(e) => handleResizeStart(e, 'start')}
                            onTouchStart={(e) => handleResizeStart(e, 'start')}
                            title={t('scheduler.dragStartTime', 'Drag to adjust start time')}
                          >
                            <div className="text-white text-xs pointer-events-none">⟨</div>
                          </div>

                          {/* End resize handle - higher z-index to be on top */}
                          <div
                            className="absolute right-0 top-0 w-3 h-20 bg-blue-900 cursor-ew-resize pointer-events-auto hover:bg-blue-950 z-10 flex items-center justify-center touch-none"
                            onMouseDown={(e) => handleResizeStart(e, 'end')}
                            onTouchStart={(e) => handleResizeStart(e, 'end')}
                            title={t('scheduler.dragEndTime', 'Drag to adjust end time')}
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
                            className="absolute top-0 h-20 bg-gray-500 border-2 border-white rounded text-white text-sm font-semibold flex items-center justify-center px-2 pointer-events-none"
                            style={{
                              left: `${startSlotIndex * 64}px`,
                              width: `${width}px`
                            }}
                            title={`${booking.clientName} - ${booking.serviceType}`}
                          >
                            <span className="truncate">Unavailable</span>
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
        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              {/* Show unique rate tiers */}
              {Array.from(new Set(rateTiers.map(t => t.tierName))).map(tierName => {
                const tier = rateTiers.find(t => t.tierName === tierName);
                if (!tier) return null;

                // Translate tier name
                const tierKey = tierName.toLowerCase();
                const translationKey = `scheduler.tier.${tierKey}`;
                const translatedName = t(translationKey, tierName);

                // Debug logging - check if translation key exists
                // Get all translations to see what's available
                const debugTranslations = Object.keys(window.localStorage).filter(k => k.includes('translation'));
                console.log('Tier translation:', {
                  tierName,
                  tierKey,
                  translationKey,
                  translatedName,
                  language,
                  cachedKeys: debugTranslations
                });

                return (
                  <div key={tierName} className="flex items-center space-x-2">
                    <div
                      className="w-4 h-4 border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: isDarkMode ? tier.colorCode + '30' : tier.colorCode + '1A' }}
                    ></div>
                    <span>{translatedName} ({tier.rateMultiplier}x)</span>
                  </div>
                );
              })}
              <div className="flex items-center space-x-2">
                <div
                  className="w-4 h-4 border border-gray-300 dark:border-gray-600"
                  style={{
                    backgroundImage: isDarkMode
                      ? 'repeating-linear-gradient(45deg, #4B5563 0px, #4B5563 2px, #6B7280 2px, #6B7280 4px)'
                      : 'repeating-linear-gradient(45deg, #D1D5DB 0px, #D1D5DB 2px, #E5E7EB 2px, #E5E7EB 4px)'
                  }}
                ></div>
                <span>{t('scheduler.buffer', 'Buffer')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500"></div>
                <span>{t('scheduler.selected', 'Selected')}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              {selectedStartTime && selectedEndTime && !isSelectedDateInPast && estimatedCost && (
                <div className="flex flex-col px-3 sm:px-4 py-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-600 rounded-md">
                  {/* Base Rate */}
                  <div className="text-xs text-green-600 dark:text-green-500 mb-1">
                    {t('scheduler.baseRate', 'Base Rate')} ({rateCategoryName}): ${baseHourlyRate}/hr
                  </div>
                  {/* Breakdown */}
                  {estimatedCost.breakdown.map((block, idx) => {
                    // Translate tier name
                    const tierKey = `scheduler.tier.${block.tierName.toLowerCase()}`;
                    const translatedTierName = t(tierKey, block.tierName);

                    return (
                      <div key={idx} className="text-xs text-green-700 dark:text-green-400">
                        {block.hours}h {translatedTierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                      </div>
                    );
                  })}
                  {/* First Hour Discount */}
                  {estimatedCost.firstHourDiscount && estimatedCost.firstHourDiscount > 0 && (
                    <>
                      <div className="text-xs text-green-700 dark:text-green-400 mt-1 pt-1 border-t border-green-300 dark:border-green-600">
                        {t('scheduler.subtotal', 'Subtotal')}: ${estimatedCost.subtotal?.toFixed(2)}
                      </div>
                      <div className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">
                        🎁 {t('scheduler.firstHourComp', 'First Hour Comp (New Client)')}:
                      </div>
                      {estimatedCost.firstHourCompBreakdown?.map((compBlock, idx) => {
                        const tierKey = `scheduler.tier.${compBlock.tierName.toLowerCase()}`;
                        const translatedTierName = t(tierKey, compBlock.tierName);
                        return (
                          <div key={idx} className="text-xs text-green-700 dark:text-green-400 ml-4">
                            • {compBlock.hours}h {translatedTierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                          </div>
                        );
                      })}
                      {estimatedCost.firstHourCompBreakdown && estimatedCost.firstHourCompBreakdown.length > 1 && (
                        <div className="text-xs text-green-700 dark:text-green-400 font-medium ml-4">
                          {t('scheduler.totalDiscount', 'Total Discount')}: -${estimatedCost.firstHourDiscount.toFixed(2)}
                        </div>
                      )}
                    </>
                  )}
                  {/* Total */}
                  <div className="text-xs sm:text-sm font-semibold text-green-800 dark:text-green-300 mt-1 pt-1 border-t border-green-300 dark:border-green-600">
                    {t('scheduler.total', 'Total')}: ${estimatedCost.total.toFixed(2)}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  }}
                  className="flex-1 sm:flex-initial px-6 py-3 sm:py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 font-medium transition-colors"
                >
                  {t('scheduler.cancel', 'Cancel')}
                </button>

                {selectedStartTime && selectedEndTime && !isSelectedDateInPast && (
                  <button
                    type="button"
                    onClick={handleConfirmBooking}
                    className="flex-1 sm:flex-initial px-6 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium transition-colors"
                  >
                    {t('scheduler.selectTimeslot', 'Select Timeslot')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceTimeSlotScheduler;
