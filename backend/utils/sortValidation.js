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

export default {
  resolveSortParameters
};
