/**
 * Date formatting utilities that use translation system for proper capitalization
 * in Spanish and other languages
 */

export interface TranslationFunction {
  (key: string, variables?: { [key: string]: string }, fallback?: string): string;
}

/**
 * Format a date with full weekday and month names using translation system
 * Example output (ES): "Jueves, 2 de Octubre de 2025"
 * Example output (EN): "Thursday, October 2, 2025"
 *
 * @param date - The date to format
 * @param t - Translation function from useClientLanguage
 * @param language - Language code ('en', 'es', etc.)
 * @returns Formatted date string
 */
export function formatLongDate(date: Date, t: TranslationFunction, language: string): string {
  const dayOfWeek = date.getDay(); // 0-6 (Sunday-Saturday)
  const dayOfMonth = date.getDate();
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();

  // Get translated weekday name (capitalized)
  const weekdayName = t(`calendar.daysLong.${dayOfWeek}`, undefined, getDefaultWeekdayName(dayOfWeek));

  // Get translated month name (capitalized)
  const monthName = t(`calendar.months.${getMonthKey(month)}`, undefined, getDefaultMonthName(month));

  // Format based on language conventions
  if (language === 'es') {
    // Spanish format: "Jueves, 2 de Octubre de 2025"
    return `${weekdayName}, ${dayOfMonth} de ${monthName} de ${year}`;
  } else {
    // English format: "Thursday, October 2, 2025"
    return `${weekdayName}, ${monthName} ${dayOfMonth}, ${year}`;
  }
}

/**
 * Format a date with short month and day
 * Example output (ES): "2 de Oct"
 * Example output (EN): "Oct 2"
 *
 * @param date - The date to format
 * @param t - Translation function
 * @param language - Language code
 * @returns Formatted date string
 */
export function formatShortDate(date: Date, t: TranslationFunction, language: string): string {
  const dayOfMonth = date.getDate();
  const month = date.getMonth();

  const monthShort = t(`calendar.monthsShort.${month}`, undefined, getDefaultMonthShort(month));

  if (language === 'es') {
    return `${dayOfMonth} de ${monthShort}`;
  } else {
    return `${monthShort} ${dayOfMonth}`;
  }
}

// Helper functions for default values
function getDefaultWeekdayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek];
}

function getDefaultMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month];
}

function getDefaultMonthShort(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month];
}

function getMonthKey(month: number): string {
  const monthKeys = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  return monthKeys[month];
}
