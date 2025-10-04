/**
 * Backfill invoice snapshots for existing invoices
 * This script populates rate_tiers_snapshot, original_cost_estimate, and actual_hours_breakdown
 * for invoices that were created before these columns were added
 */

import { getPool } from './config/database.js';

const calculateCost = async (pool, date, timeStart, timeEnd, baseRate, isFirstRequest, categoryName) => {
  if (!date || !timeStart || !timeEnd || !baseRate) return null;

  const [startHour, startMin] = timeStart.split(':').map(Number);
  const [endHour, endMin] = timeEnd.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const durationHours = (endMinutes - startMinutes) / 60;

  const requestDate = new Date(date);
  const dayOfWeek = requestDate.getDay();

  const tiersQuery = `
    SELECT tier_name, tier_level, time_start, time_end, rate_multiplier
    FROM service_hour_rate_tiers
    WHERE is_active = true AND day_of_week = $1
    ORDER BY tier_level DESC
  `;
  const tiersResult = await pool.query(tiersQuery, [dayOfWeek]);
  const rateTiers = tiersResult.rows;

  const findRateTier = (hour, minute) => {
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    const matchingTier = rateTiers.find(tier =>
      timeString >= tier.time_start && timeString < tier.time_end
    );
    return matchingTier ? {
      tierName: matchingTier.tier_name,
      multiplier: parseFloat(matchingTier.rate_multiplier)
    } : { tierName: 'Standard', multiplier: 1.0 };
  };

  let totalCost = 0;
  const tierBlocks = [];
  let currentBlock = null;
  let currentHour = startHour;
  let currentMinute = startMin;

  while (currentHour < endHour || (currentHour === endHour && currentMinute < endMin)) {
    const tier = findRateTier(currentHour, currentMinute);
    const incrementCost = (baseRate * tier.multiplier) / 2;
    totalCost += incrementCost;

    if (currentBlock && currentBlock.tierName === tier.tierName && currentBlock.multiplier === tier.multiplier) {
      currentBlock.halfHourCount += 1;
    } else {
      if (currentBlock) {
        const hours = currentBlock.halfHourCount / 2;
        tierBlocks.push({
          tierName: currentBlock.tierName,
          multiplier: currentBlock.multiplier,
          hours,
          cost: hours * baseRate * currentBlock.multiplier
        });
      }
      currentBlock = { tierName: tier.tierName, multiplier: tier.multiplier, halfHourCount: 1 };
    }

    currentMinute += 30;
    if (currentMinute >= 60) {
      currentMinute = 0;
      currentHour += 1;
    }
  }

  if (currentBlock) {
    const hours = currentBlock.halfHourCount / 2;
    tierBlocks.push({
      tierName: currentBlock.tierName,
      multiplier: currentBlock.multiplier,
      hours,
      cost: hours * baseRate * currentBlock.multiplier
    });
  }

  let firstHourDiscount = 0;
  const firstHourCompBreakdown = [];

  if (isFirstRequest && durationHours >= 1) {
    let hoursAccounted = 0;
    for (const block of tierBlocks) {
      if (hoursAccounted >= 1) break;

      const hoursInThisBlock = Math.min(block.hours, 1 - hoursAccounted);
      const discountForThisBlock = hoursInThisBlock * baseRate * block.multiplier;

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
    baseRate,
    rateCategoryName: categoryName,
    durationHours,
    total: finalTotal,
    subtotal: totalCost,
    firstHourDiscount: firstHourDiscount > 0 ? firstHourDiscount : undefined,
    firstHourCompBreakdown: firstHourCompBreakdown.length > 0 ? firstHourCompBreakdown : undefined,
    breakdown: tierBlocks,
    isFirstRequest
  };
};

async function backfillInvoiceSnapshots() {
  const pool = await getPool();

  try {
    console.log('🔄 Starting invoice snapshot backfill...\n');

    // Get all invoices that don't have snapshots
    const invoicesQuery = `
      SELECT
        i.id,
        i.invoice_number,
        i.service_request_id,
        i.base_hourly_rate,
        i.is_first_service_request,
        i.standard_hours,
        i.premium_hours,
        i.emergency_hours,
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
        b.rate_category_id,
        hrc.category_name as rate_category_name
      FROM invoices i
      JOIN service_requests sr ON i.service_request_id = sr.id
      JOIN businesses b ON i.business_id = b.id
      LEFT JOIN hourly_rate_categories hrc ON b.rate_category_id = hrc.id
      WHERE i.rate_tiers_snapshot IS NULL
        OR i.original_cost_estimate IS NULL
        OR i.actual_hours_breakdown IS NULL
    `;

    const invoicesResult = await pool.query(invoicesQuery);
    console.log(`📋 Found ${invoicesResult.rows.length} invoices to backfill\n`);

    if (invoicesResult.rows.length === 0) {
      console.log('✅ No invoices need backfilling');
      return;
    }

    // Get current rate tiers
    const tiersQuery = `
      SELECT tier_name, tier_level, day_of_week, time_start, time_end, rate_multiplier
      FROM service_hour_rate_tiers
      WHERE is_active = true
      ORDER BY tier_level DESC
    `;
    const tiersResult = await pool.query(tiersQuery);
    const tiers = tiersResult.rows;

    for (const invoice of invoicesResult.rows) {
      console.log(`📝 Processing invoice ${invoice.invoice_number}...`);

      // Calculate original cost estimate
      let originalCostEstimate = null;
      if (invoice.requested_date && invoice.requested_time_start && invoice.requested_time_end) {
        originalCostEstimate = await calculateCost(
          pool,
          invoice.requested_date,
          invoice.requested_time_start,
          invoice.requested_time_end,
          parseFloat(invoice.base_hourly_rate),
          invoice.is_first_service_request || false,
          invoice.rate_category_name || 'Standard'
        );
      }

      // Get time entries
      const timeEntriesQuery = `
        SELECT start_time, end_time
        FROM service_request_time_entries
        WHERE service_request_id = $1
        ORDER BY start_time
      `;
      const timeEntriesResult = await pool.query(timeEntriesQuery, [invoice.service_request_id]);

      // Build chronological minutes array
      const chronologicalMinutes = [];
      for (let i = 0; i < timeEntriesResult.rows.length; i++) {
        const entry = timeEntriesResult.rows[i];
        const isLastEntry = i === timeEntriesResult.rows.length - 1;

        const startTime = new Date(entry.start_time);
        const rawEndTime = new Date(entry.end_time);

        let endTime = rawEndTime;
        if (isLastEntry) {
          const endMinutes = rawEndTime.getUTCMinutes();
          const roundedUpMinutes = Math.ceil(endMinutes / 15) * 15;
          endTime = new Date(rawEndTime);
          if (roundedUpMinutes === 60) {
            endTime.setUTCHours(endTime.getUTCHours() + 1);
            endTime.setUTCMinutes(0, 0, 0);
          } else {
            endTime.setUTCMinutes(roundedUpMinutes, 0, 0);
          }
        }

        let currentTime = new Date(startTime);
        while (currentTime < endTime) {
          const dayOfWeek = currentTime.getUTCDay();
          const hours = String(currentTime.getUTCHours()).padStart(2, '0');
          const minutes = String(currentTime.getUTCMinutes()).padStart(2, '0');
          const seconds = String(currentTime.getUTCSeconds()).padStart(2, '0');
          const timeString = `${hours}:${minutes}:${seconds}`;

          let assignedTier = 'Standard';
          for (const tier of tiers) {
            if (tier.day_of_week === dayOfWeek && timeString >= tier.time_start && timeString < tier.time_end) {
              assignedTier = tier.tier_name;
              break;
            }
          }

          chronologicalMinutes.push({ timestamp: new Date(currentTime), tier: assignedTier });
          currentTime.setMinutes(currentTime.getMinutes() + 1);
        }
      }

      // Build actual hours breakdown
      const actualHoursBreakdown = {
        timeEntries: timeEntriesResult.rows.map(entry => ({
          startTime: entry.start_time,
          endTime: entry.end_time
        })),
        standard: {
          actualMinutes: chronologicalMinutes.filter(m => m.tier === 'Standard').length,
          actualHours: (chronologicalMinutes.filter(m => m.tier === 'Standard').length / 60).toFixed(2),
          roundedHours: parseFloat(invoice.standard_hours || 0).toFixed(2)
        },
        premium: {
          actualMinutes: chronologicalMinutes.filter(m => m.tier === 'Premium').length,
          actualHours: (chronologicalMinutes.filter(m => m.tier === 'Premium').length / 60).toFixed(2),
          roundedHours: parseFloat(invoice.premium_hours || 0).toFixed(2)
        },
        emergency: {
          actualMinutes: chronologicalMinutes.filter(m => m.tier === 'Emergency').length,
          actualHours: (chronologicalMinutes.filter(m => m.tier === 'Emergency').length / 60).toFixed(2),
          roundedHours: parseFloat(invoice.emergency_hours || 0).toFixed(2)
        }
      };

      // Update invoice with snapshots
      const updateQuery = `
        UPDATE invoices
        SET
          rate_tiers_snapshot = $1,
          original_cost_estimate = $2,
          actual_hours_breakdown = $3,
          updated_at = NOW()
        WHERE id = $4
      `;

      await pool.query(updateQuery, [
        JSON.stringify(tiers),
        JSON.stringify(originalCostEstimate),
        JSON.stringify(actualHoursBreakdown),
        invoice.id
      ]);

      console.log(`   ✅ Updated invoice ${invoice.invoice_number}`);
    }

    console.log(`\n✅ Backfill complete! Updated ${invoicesResult.rows.length} invoices`);

  } catch (error) {
    console.error('❌ Error during backfill:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the backfill
backfillInvoiceSnapshots().catch(console.error);
