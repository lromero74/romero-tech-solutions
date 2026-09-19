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

export default {
  resolveSortParameters,
  parseCappedLimit
};
