/**
 * Pricing Utilities
 * Handles graduated/tiered pricing calculations for subscription model
 */

/**
 * Calculate monthly cost using graduated pricing ranges
 *
 * @param {number} deviceCount - Total number of devices
 * @param {Array} pricingRanges - Array of pricing range objects [{start, end, price, description}, ...]
 * @returns {Object} - {totalCost, breakdown: [{range, devices, pricePerDevice, subtotal}, ...]}
 *
 * @example
 * // Pro tier with 10 devices:
 * const ranges = [
 *   {start: 1, end: 2, price: 0.00, description: "Free"},
 *   {start: 3, end: 10, price: 9.99, description: "Pro"}
 * ];
 * calculateGraduatedPrice(10, ranges);
 * // Returns: {
 * //   totalCost: 79.92,
 * //   breakdown: [
 * //     {range: "1-2", devices: 2, pricePerDevice: 0.00, subtotal: 0.00, description: "Free"},
 * //     {range: "3-10", devices: 8, pricePerDevice: 9.99, subtotal: 79.92, description: "Pro"}
 * //   ]
 * // }
 */
export function calculateGraduatedPrice(deviceCount, pricingRanges) {
  if (!pricingRanges || !Array.isArray(pricingRanges) || pricingRanges.length === 0) {
    console.warn('⚠️ No pricing ranges provided, returning $0.00');
    return {
      totalCost: 0.00,
      breakdown: []
    };
  }

  if (deviceCount <= 0) {
    return {
      totalCost: 0.00,
      breakdown: []
    };
  }

  let totalCost = 0.00;
  const breakdown = [];

  // Sort pricing ranges by start position to ensure correct order
  const sortedRanges = [...pricingRanges].sort((a, b) => a.start - b.start);

  for (const range of sortedRanges) {
    const { start, end, price, description } = range;

    // Skip if device count doesn't reach this range
    if (deviceCount < start) {
      break;
    }

    // Calculate how many devices fall in this range
    const devicesInRange = Math.min(deviceCount, end) - start + 1;

    if (devicesInRange > 0) {
      const subtotal = devicesInRange * parseFloat(price);
      totalCost += subtotal;

      breakdown.push({
        range: `${start}-${Math.min(deviceCount, end)}`,
        devices: devicesInRange,
        pricePerDevice: parseFloat(price),
        subtotal: subtotal,
        description: description || `Devices ${start}-${end}`
      });
    }
  }

  return {
    totalCost: parseFloat(totalCost.toFixed(2)),
    breakdown
  };
}

/**
 * Get maximum allowed devices for a tier
 *
 * @param {Array} pricingRanges - Array of pricing range objects
 * @returns {number} - Maximum devices allowed (highest 'end' value in ranges)
 */
export function getMaxDevicesForTier(pricingRanges) {
  if (!pricingRanges || !Array.isArray(pricingRanges) || pricingRanges.length === 0) {
    return 0;
  }

  return Math.max(...pricingRanges.map(range => range.end));
}

/**
 * Validate pricing ranges structure
 *
 * @param {Array} pricingRanges - Array of pricing range objects
 * @returns {Object} - {valid: boolean, errors: string[]}
 */
export function validatePricingRanges(pricingRanges) {
  const errors = [];

  if (!Array.isArray(pricingRanges)) {
    return { valid: false, errors: ['Pricing ranges must be an array'] };
  }

  if (pricingRanges.length === 0) {
    return { valid: false, errors: ['Pricing ranges cannot be empty'] };
  }

  // Check each range has required fields
  pricingRanges.forEach((range, index) => {
    if (typeof range.start !== 'number' || range.start < 1) {
      errors.push(`Range ${index}: 'start' must be a positive number`);
    }
    if (typeof range.end !== 'number' || range.end < range.start) {
      errors.push(`Range ${index}: 'end' must be >= 'start'`);
    }
    if (typeof range.price !== 'number' || range.price < 0) {
      errors.push(`Range ${index}: 'price' must be a non-negative number`);
    }
  });

  // Check for gaps or overlaps
  const sortedRanges = [...pricingRanges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sortedRanges.length; i++) {
    const prevRange = sortedRanges[i - 1];
    const currentRange = sortedRanges[i];

    // Check for gap
    if (currentRange.start > prevRange.end + 1) {
      errors.push(`Gap detected between range ${i - 1} and ${i}: devices ${prevRange.end + 1}-${currentRange.start - 1} have no pricing`);
    }

    // Check for overlap
    if (currentRange.start <= prevRange.end) {
      errors.push(`Overlap detected between range ${i - 1} and ${i}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Format price breakdown for display
 *
 * @param {Array} breakdown - Pricing breakdown from calculateGraduatedPrice
 * @param {string} currency - Currency symbol (default: 'USD')
 * @returns {string} - Formatted breakdown text
 */
export function formatPriceBreakdown(breakdown, currency = 'USD') {
  if (!breakdown || breakdown.length === 0) {
    return 'No devices';
  }

  const currencySymbol = currency === 'USD' ? '$' : currency;

  return breakdown.map(item => {
    const priceText = item.pricePerDevice === 0
      ? 'Free'
      : `${currencySymbol}${item.pricePerDevice.toFixed(2)}/device`;

    return `Devices ${item.range}: ${item.devices} × ${priceText} = ${currencySymbol}${item.subtotal.toFixed(2)}`;
  }).join('\n');
}

/**
 * Get pricing summary for a tier and device count
 *
 * @param {string} tier - Subscription tier name
 * @param {number} deviceCount - Number of devices
 * @param {Array} pricingRanges - Pricing ranges for the tier
 * @param {string} currency - Currency (default: 'USD')
 * @returns {Object} - Pricing summary object
 */
export function getPricingSummary(tier, deviceCount, pricingRanges, currency = 'USD') {
  const { totalCost, breakdown } = calculateGraduatedPrice(deviceCount, pricingRanges);
  const maxDevices = getMaxDevicesForTier(pricingRanges);

  return {
    tier,
    deviceCount,
    maxDevices,
    totalCost,
    currency,
    breakdown,
    formattedBreakdown: formatPriceBreakdown(breakdown, currency),
    isAtLimit: deviceCount >= maxDevices,
    devicesRemaining: Math.max(0, maxDevices - deviceCount)
  };
}
