/**
 * Utility functions for color manipulation
 */

/**
 * Converts a hex color to RGB values
 * @param hex - Hex color string (e.g., "#ff0000" or "ff0000")
 * @returns RGB object with r, g, b values (0-255)
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Handle 3-character hex codes
  if (cleanHex.length === 3) {
    const expandedHex = cleanHex.split('').map(char => char + char).join('');
    return hexToRgb(expandedHex);
  }

  // Handle 6-character hex codes
  if (cleanHex.length === 6) {
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  return null;
}

/**
 * Converts RGB values to hex string
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns Hex color string with # prefix
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Mutes a color by reducing its brightness
 * @param color - Hex color string (e.g., "#ff0000")
 * @param factor - Multiplication factor (0.75 = 25% darker)
 * @returns Muted hex color string
 */
export function muteColor(color: string | undefined | null, factor: number = 0.75): string {
  if (!color) return color || '';

  // Handle non-hex colors (CSS color names, rgb(), etc.)
  if (!color.startsWith('#')) {
    return color;
  }

  const rgb = hexToRgb(color);
  if (!rgb) return color;

  // Multiply each channel by the factor to darken
  const mutedR = Math.round(rgb.r * factor);
  const mutedG = Math.round(rgb.g * factor);
  const mutedB = Math.round(rgb.b * factor);

  return rgbToHex(mutedR, mutedG, mutedB);
}

/**
 * Applies color muting for dark mode to role colors
 * @param color - Original color
 * @param isDarkMode - Whether dark mode is active
 * @param muteAmount - How much to mute (default 0.75 = 25% darker)
 * @returns Original color or muted color for dark mode
 */
export function applyDarkModeMuting(
  color: string | undefined | null,
  isDarkMode: boolean,
  muteAmount: number = 0.75
): string {
  if (!isDarkMode) {
    return color || '';
  }

  return muteColor(color, muteAmount);
}