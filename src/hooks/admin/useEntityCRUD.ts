import { useState, useCallback } from 'react';
import { adminService } from '../../services/adminService';

export type EntityType = 'employees' | 'clients' | 'businesses' | 'services' | 'serviceRequests' | 'serviceLocations';

export interface UseEntityCRUDReturn<T> {
  selectedEntity: T | null;
  isLoading: boolean;
  error: string | null;
  setSelectedEntity: (entity: T | null) => void;
  createEntity: (data: any) => Promise<any>;
  updateEntity: (id: string, updates: any) => Promise<any>;
  deleteEntity: (id: string) => Promise<any>;
  softDeleteEntity: (id: string, isDeleted: boolean) => Promise<any>;
  toggleEntityStatus: (id: string) => Promise<any>;
  clearError: () => void;
}

export const useEntityCRUD = <T extends { id: string; isActive?: boolean; softDelete?: boolean; is_active?: boolean; soft_delete?: boolean }>(
  entityType: EntityType
): UseEntityCRUDReturn<T> => {
  const [selectedEntity, setSelectedEntity] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createEntity = useCallback(async (data: any) => {
    setIsLoading(true);
    setError(null);

    try {
      let result;
      switch (entityType) {
        case 'employees':
          result = await adminService.createUser(data);
          break;
        case 'clients':
          result = await adminService.createUser(data);
          break;
        case 'businesses':
          result = await adminService.createBusiness(data);
          break;
        case 'services':
          result = await adminService.createService(data);
          break;
        case 'serviceRequests':
          // TODO: Add createServiceRequest method to adminService
          throw new Error('createServiceRequest not yet implemented');
        case 'serviceLocations':
          result = await adminService.createServiceLocation(data);
          break;
        default:
          throw new Error(`Unsupported entity type: ${entityType}`);
      }
      return result;
    } catch (err: any) {
      const errorMessage = err.message || `Failed to create ${entityType}`;
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [entityType]);

  const updateEntity = useCallback(async (id: string, updates: any) => {
    setIsLoading(true);
    setError(null);

    try {
      let result;
      switch (entityType) {
        case 'employees':
          result = await adminService.updateUser(id, updates);
          break;
        case 'clients':
          result = await adminService.updateUser(id, updates);
          break;
        case 'businesses':
          result = await adminService.updateBusiness(id, updates);
          break;
        case 'services':
          // TODO: Add updateService method to adminService
          throw new Error('updateService not yet implemented');
        case 'serviceRequests':
          // TODO: Add updateServiceRequest method to adminService
          throw new Error('updateServiceRequest not yet implemented');
        case 'serviceLocations':
          result = await adminService.updateServiceLocation(id, updates);
          break;
        default:
          throw new Error(`Unsupported entity type: ${entityType}`);
      }
      return result;
    } catch (err: any) {
      const errorMessage = err.message || `Failed to update ${entityType}`;
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [entityType]);

  const deleteEntity = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      let result;
      switch (entityType) {
        case 'employees':
          result = await adminService.deleteUser(id);
          break;
        case 'clients':
          result = await adminService.deleteUser(id, true); // hardDelete = true for permanent deletion
          break;
        case 'businesses':
          result = await adminService.deleteBusiness(id);
          break;
        case 'services':
          // TODO: Add deleteService method to adminService
          throw new Error('deleteService not yet implemented');
        case 'serviceRequests':
          // TODO: Add deleteServiceRequest method to adminService
          throw new Error('deleteServiceRequest not yet implemented');
        case 'serviceLocations':
          result = await adminService.deleteServiceLocation(id);
          break;
        default:
          throw new Error(`Unsupported entity type: ${entityType}`);
      }
      return result;
    } catch (err: any) {
      const errorMessage = err.message || `Failed to delete ${entityType}`;
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [entityType]);

  const softDeleteEntity = useCallback(async (id: string, isDeleted: boolean) => {
    return updateEntity(id, {
      softDelete: isDeleted,
      soft_delete: isDeleted
    });
  }, [updateEntity]);

  const toggleEntityStatus = useCallback(async (id: string) => {
    if (!selectedEntity) {
      throw new Error('No entity selected');
    }

    // Handle different property names for active status
    const currentStatus = selectedEntity.isActive ?? selectedEntity.is_active ?? true;
    const newStatus = !currentStatus;

    return updateEntity(id, {
      isActive: newStatus,
      is_active: newStatus
    });
  }, [selectedEntity, updateEntity]);

  return {
    selectedEntity,
    isLoading,
    error,
    setSelectedEntity,
    createEntity,
    updateEntity,
    deleteEntity,
    softDeleteEntity,
    toggleEntityStatus,
    clearError,
  };
};