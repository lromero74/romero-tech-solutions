export const resolveSortParameters = ({
  sortBy,
  sortOrder,
  allowedSortBy = [],
  defaultSortBy,
  defaultSortOrder = 'DESC'
}) => {
  const sortValue = typeof sortBy === 'string' ? sortBy : defaultSortBy;
  const safeSortBy = allowedSortBy.includes(sortValue) ? sortValue : defaultSortBy;

  const orderValue = typeof sortOrder === 'string'
    ? sortOrder.toUpperCase()
    : defaultSortOrder;
  const safeSortOrder = orderValue === 'ASC' ? 'ASC' : 'DESC';

  return {
    safeSortBy,
    safeSortOrder,
  };
};

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 500;

// Parse a client-supplied list limit (`?limit=`) into a safe integer.
// Non-numeric, zero, and negative values fall back to the default;
// values above maxValue are clamped so a single request cannot force
// a full-table scan and serialize an unbounded result set.
export const parseCappedLimit = (value, defaultValue = DEFAULT_LIST_LIMIT, maxValue = MAX_LIST_LIMIT) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
};

export const DEFAULT_LIST_PAGE = 1;
export const MAX_LIST_PAGE = 1000;

// Parse a client-supplied page number (`?page=`) into a safe integer.
// Missing, non-numeric, and sub-1 values fall back to page 1 (a page of 0
// or less would produce a negative OFFSET and a 500); absurdly deep pages
// are clamped so one request cannot force a near-full-table OFFSET scan.
export const parseCappedPage = (value, defaultValue = DEFAULT_LIST_PAGE, maxValue = MAX_LIST_PAGE) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
};

export default {
  resolveSortParameters,
  parseCappedLimit,
  parseCappedPage
};
