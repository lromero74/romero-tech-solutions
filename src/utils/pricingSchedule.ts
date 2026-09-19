export interface PricingScheduleSlot {
  tierName: string;
  tierLevel: number;
  dayOfWeek: number;
  timeStart: string;
  timeEnd: string;
  multiplier: number;
}

// The returned string is injected with dangerouslySetInnerHTML on the public
// pricing page, and every translated fragment is admin-editable. Escape all
// translated content so a hostile translation cannot become stored XSS.
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Service-hour tiers are stored as Pacific wall-clock values. Do not convert
// these through Date/browser timezone APIs or the pricing page will drift.
export const generateScheduleFromSummary = (
  schedule: PricingScheduleSlot[],
  tierName: string,
  t: (key: string) => string
): string => {
  const tierSlots = schedule.filter(slot => slot.tierName === tierName);
  if (tierSlots.length === 0) return '';

  const dayNames = [
    t('common.days.sun'),
    t('common.days.mon'),
    t('common.days.tue'),
    t('common.days.wed'),
    t('common.days.thu'),
    t('common.days.fri'),
    t('common.days.sat')
  ].map(escapeHtml);

  interface ScheduleBlock {
    day: number;
    startTime: string;
    endTime: string;
  }

  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
    return `${displayHours}${displayMinutes}${period}`;
  };

  const blocks = tierSlots.map(slot => ({
    day: slot.dayOfWeek,
    startTime: slot.timeStart,
    endTime: slot.timeEnd
  }));

  const byDay: Record<number, ScheduleBlock[]> = {};
  blocks.forEach(block => {
    if (!byDay[block.day]) byDay[block.day] = [];
    byDay[block.day].push(block);
  });

  const mergedByDay: Record<number, ScheduleBlock[]> = {};
  Object.entries(byDay).forEach(([day, dayBlocks]) => {
    const sorted = [...dayBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const merged: ScheduleBlock[] = [];

    sorted.forEach(block => {
      const previous = merged[merged.length - 1];
      if (previous && timeToMinutes(block.startTime) <= timeToMinutes(previous.endTime)) {
        previous.endTime = block.endTime;
      } else {
        merged.push({ ...block });
      }
    });

    mergedByDay[Number(day)] = merged;
  });

  const timeRangeGroups: { [key: string]: number[] } = {};
  const formatted: string[] = [];

  Object.entries(mergedByDay).forEach(([dayStr, dayBlocks]) => {
    dayBlocks.forEach(block => {
      const key = `${formatTime(block.startTime)}-${formatTime(block.endTime)}`;
      if (!timeRangeGroups[key]) {
        timeRangeGroups[key] = [];
      }
      const day = Number(dayStr);
      if (!timeRangeGroups[key].includes(day)) {
        timeRangeGroups[key].push(day);
      }
    });
  });

  Object.entries(timeRangeGroups).forEach(([timeRange, days]) => {
    days.sort((a, b) => a - b);

    const dayRanges: Array<{ startDay: number; endDay: number }> = [];
    let currentRange = { startDay: days[0], endDay: days[0] };

    for (let i = 1; i < days.length; i++) {
      if (days[i] === currentRange.endDay + 1) {
        currentRange.endDay = days[i];
      } else {
        dayRanges.push({ ...currentRange });
        currentRange = { startDay: days[i], endDay: days[i] };
      }
    }
    dayRanges.push(currentRange);

    dayRanges.forEach(range => {
      const dayStr = range.startDay === range.endDay
        ? dayNames[range.startDay]
        : `${dayNames[range.startDay]}-${dayNames[range.endDay]}`;
      formatted.push(`${dayStr}: ${timeRange}`);
    });
  });

  return `${formatted.join(' | ')} ${escapeHtml(t('pricing.tiers.pacificTime'))}`;
};
