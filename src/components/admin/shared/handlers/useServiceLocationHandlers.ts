import { useState } from 'react';
import { ServiceLocation } from '../../../../contexts/AdminDataContext';
import { ServiceLocationPrefillData } from '../AdminViewRouter.types';

interface UseServiceLocationHandlersProps {
  serviceLocationCRUD: {
    createEntity: (data: unknown) => Promise<unknown>;
    updateEntity: (id: string, data: unknown) => Promise<void>;
  };
  refreshAllData: () => Promise<void>;
}

export function useServiceLocationHandlers({
  serviceLocationCRUD,
  refreshAllData,
}: UseServiceLocationHandlersProps) {
  // Service Location modal state
  const [showEditServiceLocationModal, setShowEditServiceLocationModal] = useState(false);
  const [selectedServiceLocation, setSelectedServiceLocation] = useState<ServiceLocation | null>(null);
  const [showAddServiceLocationModal, setShowAddServiceLocationModal] = useState(false);
  const [serviceLocationPrefillData, setServiceLocationPrefillData] = useState<ServiceLocationPrefillData | null>(null);
  const [loadingServiceLocationOperations, setLoadingServiceLocationOperations] = useState<Record<string, boolean>>({});

  const handleEditServiceLocation = (location: unknown) => {
    setSelectedServiceLocation(location as ServiceLocation);
    setShowEditServiceLocationModal(true);
  };

  const handleCloseServiceLocationModal = () => {
    setShowEditServiceLocationModal(false);
    setSelectedServiceLocation(null);
  };

  const handleCloseAddServiceLocationModal = () => {
    setShowAddServiceLocationModal(false);
    setServiceLocationPrefillData(null);
  };

  const handleOpenServiceLocationModalFromBusiness = (businessName: string, address: { street: string; city: string; state: string; zipCode: string; country?: string; }) => {
    setServiceLocationPrefillData({ businessName, address });
    setShowAddServiceLocationModal(true);
  };

  const handleCreateServiceLocation = async (locationData: unknown) => {
    try {
      const result = await serviceLocationCRUD.createEntity(locationData);
      setShowAddServiceLocationModal(false);
      // Refresh service location data
      await refreshAllData();
      return result;
    } catch (error) {
      console.error('Failed to create service location:', error);
      throw error;
    }
  };

  const handleUpdateServiceLocation = async (locationId: string, updates: unknown) => {
    try {
      await serviceLocationCRUD.updateEntity(locationId, updates);
      setShowEditServiceLocationModal(false);
      setSelectedServiceLocation(null);
      // Refresh service location data
      await refreshAllData();
    } catch (error) {
      console.error('Failed to update service location:', error);
      throw error;
    }
  };

  return {
    // State
    showEditServiceLocationModal,
    selectedServiceLocation,
    showAddServiceLocationModal,
    setShowAddServiceLocationModal,
    serviceLocationPrefillData,
    loadingServiceLocationOperations,
    setLoadingServiceLocationOperations,
    // Handlers
    handleEditServiceLocation,
    handleCloseServiceLocationModal,
    handleCloseAddServiceLocationModal,
    handleOpenServiceLocationModalFromBusiness,
    handleCreateServiceLocation,
    handleUpdateServiceLocation,
  };
}
