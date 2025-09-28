import { UrgencyLevel } from './types';

export const generateTimeSlots = () => {
  const slots = [];
  // Extended hours: 6:00 AM - 10:00 PM (premium pricing after hours)
  for (let hour = 6; hour <= 22; hour++) {
    const timeString = `${hour.toString().padStart(2, '0')}:00`;
    slots.push(timeString);
  }
  return slots;
};

export const isPremiumTime = (timeSlot: string) => {
  const [hour] = timeSlot.split(':').map(Number);
  // Premium hours: before 8 AM or after 5 PM
  return hour < 8 || hour >= 17;
};

export const calculateEndTime = (startTime: string, duration: number) => {
  const [hour] = startTime.split(':').map(Number);
  const endHour = hour + duration;
  return `${endHour.toString().padStart(2, '0')}:00`;
};

export const getAvailableDurations = (startTime: string) => {
  const [startHour] = startTime.split(':').map(Number);
  const maxHour = 22; // 10 PM
  const maxDuration = Math.min(8, maxHour - startHour); // Max 8 hours or until closing
  return Array.from({ length: maxDuration }, (_, i) => i + 1);
};

export const getAvailableTimeSlots = (
  selectedDate: Date | null,
  selectedUrgency: string,
  urgencyLevels: UrgencyLevel[]
) => {
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

  // Calculate minimum booking time based on urgency
  const minimumBookingTime = new Date(now.getTime() + urgency.lead_time_hours * 60 * 60 * 1000);

  // If selected date is today, filter out past slots and respect lead time
  if (selectedDateStart.toDateString() === now.toDateString()) {
    return allSlots.filter(slot => {
      const [hour] = slot.split(':').map(Number);
      const slotTime = new Date(selectedDateStart);
      slotTime.setHours(hour, 0, 0, 0);
      return slotTime >= minimumBookingTime;
    });
  }

  // For future dates, return all slots
  return allSlots;
};

export const isDateValid = (date: Date, urgencyLevels: UrgencyLevel[], selectedUrgency: string) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const selectedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // No past dates
  if (selectedDay < today) {
    return false;
  }

  // If urgency is selected, check lead time requirements
  if (selectedUrgency) {
    const urgency = urgencyLevels.find(u => u.id === selectedUrgency);
    if (urgency) {
      const minimumDate = new Date(now.getTime() + urgency.lead_time_hours * 60 * 60 * 1000);
      const minimumDay = new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate());

      // For same-day service, allow if enough hours remain
      if (selectedDay.getTime() === today.getTime()) {
        return now.getHours() + urgency.lead_time_hours <= 22; // Can book until 10 PM
      }

      return selectedDay >= minimumDay;
    }
  }

  return true;
};