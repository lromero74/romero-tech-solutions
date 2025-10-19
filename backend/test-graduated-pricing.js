/**
 * Test script for graduated pricing calculations
 * Run with: node backend/test-graduated-pricing.js
 */

import { calculateGraduatedPrice, getMaxDevicesForTier, validatePricingRanges, formatPriceBreakdown } from './utils/pricingUtils.js';

console.log('\n======================================');
console.log('GRADUATED PRICING CALCULATION TESTS');
console.log('======================================\n');

// Test data: pricing ranges from database
const freePricingRanges = [
  { start: 1, end: 2, price: 0.00, description: "Free tier devices" }
];

const proPricingRanges = [
  { start: 1, end: 2, price: 0.00, description: "Free tier devices (inherited)" },
  { start: 3, end: 10, price: 9.99, description: "Pro tier devices" }
];

const enterprisePricingRanges = [
  { start: 1, end: 2, price: 0.00, description: "Free tier devices (inherited)" },
  { start: 3, end: 10, price: 9.99, description: "Pro tier devices (inherited)" },
  { start: 11, end: 50, price: 7.99, description: "Enterprise tier devices" }
];

// Test Cases
const testCases = [
  { tier: 'Free', devices: 2, ranges: freePricingRanges, expected: 0.00 },
  { tier: 'Pro', devices: 5, ranges: proPricingRanges, expected: 29.97 },
  { tier: 'Pro', devices: 10, ranges: proPricingRanges, expected: 79.92 },
  { tier: 'Enterprise', devices: 15, ranges: enterprisePricingRanges, expected: 119.87 },
  { tier: 'Enterprise', devices: 20, ranges: enterprisePricingRanges, expected: 159.82 },
  { tier: 'Enterprise', devices: 50, ranges: enterprisePricingRanges, expected: 399.52 }
];

console.log('Testing Pricing Calculations:\n');

testCases.forEach((testCase) => {
  const { totalCost, breakdown } = calculateGraduatedPrice(testCase.devices, testCase.ranges);
  const passed = Math.abs(totalCost - testCase.expected) < 0.01; // Allow for floating point errors
  const status = passed ? '✅ PASS' : '❌ FAIL';

  console.log(`${status} ${testCase.tier} tier with ${testCase.devices} devices:`);
  console.log(`   Expected: $${testCase.expected.toFixed(2)}, Got: $${totalCost.toFixed(2)}`);

  if (breakdown.length > 0) {
    console.log('   Breakdown:');
    breakdown.forEach((item) => {
      const priceText = item.pricePerDevice === 0 ? 'Free' : `$${item.pricePerDevice.toFixed(2)}/device`;
      console.log(`     - Devices ${item.range}: ${item.devices} × ${priceText} = $${item.subtotal.toFixed(2)}`);
    });
  }
  console.log('');
});

// Test Max Devices
console.log('\nTesting Max Devices Calculation:\n');
console.log(`Free tier max:       ${getMaxDevicesForTier(freePricingRanges)} devices`);
console.log(`Pro tier max:        ${getMaxDevicesForTier(proPricingRanges)} devices`);
console.log(`Enterprise tier max: ${getMaxDevicesForTier(enterprisePricingRanges)} devices`);

// Test Validation
console.log('\n\nTesting Pricing Range Validation:\n');

const validRanges = [
  { start: 1, end: 2, price: 0.00, description: "Valid range" },
  { start: 3, end: 10, price: 9.99, description: "Valid range" }
];

const invalidRanges = [
  { start: 1, end: 2, price: 0.00, description: "Has gap" },
  { start: 5, end: 10, price: 9.99, description: "Gap from 3-4" }
];

const validation1 = validatePricingRanges(validRanges);
console.log(`Valid ranges: ${validation1.valid ? '✅ PASS' : '❌ FAIL'}`);
if (!validation1.valid) {
  console.log(`  Errors: ${validation1.errors.join(', ')}`);
}

const validation2 = validatePricingRanges(invalidRanges);
console.log(`Invalid ranges (with gap): ${!validation2.valid ? '✅ PASS' : '❌ FAIL'}`);
if (!validation2.valid) {
  console.log(`  Expected errors found: ${validation2.errors.length}`);
  validation2.errors.forEach(err => console.log(`    - ${err}`));
}

console.log('\n======================================');
console.log('ALL TESTS COMPLETE');
console.log('======================================\n');
