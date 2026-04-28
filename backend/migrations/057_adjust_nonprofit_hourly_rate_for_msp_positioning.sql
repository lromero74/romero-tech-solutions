/*
  Adjust nonprofit hourly pricing to match the 2026 MSP/service positioning.

  Companion code:
  - src/pages/Pricing.tsx now leads with managed IT support plans and treats
    hourly pricing as non-managed/project/break-fix support.
  - src/translations/en.ts and src/translations/es.ts describe nonprofit
    managed-plan discounts separately from hourly nonprofit support.

  Rationale:
  - Public prospecting targets small organizations that may become managed
    service clients.
  - The previous $65/hr nonprofit hourly rate was too low to sustainably
    support professional onsite/remote service in San Diego County.
  - Friends & Family remains an internal/manual rate category and is not
    exposed on the public pricing page.
*/

UPDATE hourly_rate_categories
SET
  base_hourly_rate = 100.00,
  description = 'Discounted hourly rate for qualified non-profit organizations',
  updated_at = CURRENT_TIMESTAMP
WHERE category_name = 'Non-Profit';
