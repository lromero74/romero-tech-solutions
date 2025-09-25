// Re-export all admin hooks for easier importing
export { useModalManager } from './useModalManager';
export type { ModalName, ModalState, UseModalManagerReturn } from './useModalManager';

export { useEmployeeFilters } from './useEmployeeFilters';
export type { EmployeeFilters, UseEmployeeFiltersReturn } from './useEmployeeFilters';

export { useClientFilters } from './useClientFilters';
export type { ClientFilters, UseClientFiltersReturn } from './useClientFilters';

export { useBusinessFilters } from './useBusinessFilters';
export type { BusinessFilters, UseBusinessFiltersReturn } from './useBusinessFilters';

export { useServiceLocationFilters } from './useServiceLocationFilters';
export type { ServiceLocationFilters, UseServiceLocationFiltersReturn } from './useServiceLocationFilters';

export { useEntityCRUD } from './useEntityCRUD';
export type { EntityType, UseEntityCRUDReturn } from './useEntityCRUD';