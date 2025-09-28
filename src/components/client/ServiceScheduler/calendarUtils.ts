export const generateCalendar = (currentDate: Date) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const days = [];
  const current = new Date(startDate);

  // Generate 6 weeks (42 days) to ensure full month coverage
  for (let i = 0; i < 42; i++) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
};

export const isToday = (date: Date) => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

export const isSameMonth = (date: Date, currentDate: Date) => {
  return date.getMonth() === currentDate.getMonth() &&
         date.getFullYear() === currentDate.getFullYear();
};

export const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const getWeekDays = () => {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
};

export const navigateMonth = (currentDate: Date, direction: 'prev' | 'next') => {
  const newDate = new Date(currentDate);
  if (direction === 'prev') {
    newDate.setMonth(newDate.getMonth() - 1);
  } else {
    newDate.setMonth(newDate.getMonth() + 1);
  }
  return newDate;
};

export const getMonthTranslationKey = (monthIndex: number) => {
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  return `calendar.months.${monthNames[monthIndex]}`;
};

export const getMonthShortTranslationKey = (monthIndex: number) => {
  return `calendar.monthsShort.${monthIndex}`;
};

export const getDayTranslationKey = (dayIndex: number) => {
  return `calendar.days.${dayIndex}`;
};