import { useState } from 'react';
import { Business, Client, ServiceLocation } from '../../../../contexts/AdminDataContext';
import { adminService } from '../../../../services/adminService';
import { ConfirmationDialogState } from '../AdminViewRouter.types';

interface UseBusinessHandlersProps {
  businessCRUD: {
    createEntity: (data: unknown) => Promise<unknown>;
    updateEntity: (id: string, data: unknown) => Promise<void>;
    deleteEntity: (id: string) => Promise<void>;
  };
  refreshBusinesses: () => Promise<void>;
  refreshAllData: () => Promise<void>;
  serviceLocations: ServiceLocation[];
  clients: Client[];
  setConfirmationDialog: React.Dispatch<React.SetStateAction<ConfirmationDialogState>>;
}

export function useBusinessHandlers({
  businessCRUD,
  refreshBusinesses,
  refreshAllData,
  serviceLocations,
  clients,
  setConfirmationDialog,
}: UseBusinessHandlersProps) {
  // Business modal state
  const [showEditBusinessModal, setShowEditBusinessModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [showAddBusinessModal, setShowAddBusinessModal] = useState(false);
  const [loadingBusinessOperations, setLoadingBusinessOperations] = useState<Record<string, boolean>>({});

  const handleEditBusiness = (business: unknown) => {
    setSelectedBusiness(business);
    setShowEditBusinessModal(true);
  };

  const handleCloseBusinessModal = () => {
    setShowEditBusinessModal(false);
    setSelectedBusiness(null);
  };

  const handleAddBusiness = () => {
    setShowAddBusinessModal(true);
  };

  const handleCloseAddBusinessModal = () => {
    setShowAddBusinessModal(false);
  };

  const handleCreateBusiness = async (businessData: unknown) => {
    try {
      await businessCRUD.createEntity(businessData);
      await refreshBusinesses();
      setShowAddBusinessModal(false);
    } catch (error) {
      console.error('Failed to create business:', error);
      throw error;
    }
  };

  const handleDeleteBusiness = (business: unknown) => {
    // Count related records that will be deleted
    const businessData = business as Business;
    const relatedServiceLocations = serviceLocations.filter(sl => sl.business_name === businessData.businessName);
    const relatedClients = clients.filter(client => client.businessName === businessData.businessName);

    const serviceLocationCount = relatedServiceLocations.length;
    const clientCount = relatedClients.length;

    // Create a detailed warning message
    let message = `⚠️ WARNING: This action cannot be undone!\n\nDeleting "${businessData.businessName}" will permanently remove:\n\n• The business record`;

    if (serviceLocationCount > 0) {
      message += `\n• ${serviceLocationCount} service location${serviceLocationCount !== 1 ? 's' : ''}`;
    }

    if (clientCount > 0) {
      message += `\n• ${clientCount} client${clientCount !== 1 ? 's' : ''}`;
    }

    message += '\n\nAll associated data will be permanently lost. Are you sure you want to continue?';

    setConfirmationDialog({
      isOpen: true,
      title: 'Permanently Delete Business',
      message,
      onConfirm: async () => {
        // Close the dialog immediately when user confirms
        setConfirmationDialog(prev => ({ ...prev, isOpen: false }));

        try {
          // Set loading state for this specific business to show spinner
          setLoadingBusinessOperations(prev => ({ ...prev, [businessData.id]: true }));

          console.log('🔴 Starting cascade delete for business:', businessData.businessName);

          // Delete related service locations first
          for (const serviceLocation of relatedServiceLocations) {
            try {
              await adminService.deleteServiceLocation(serviceLocation.id, serviceLocation.business_id);
              console.log('Deleted service location:', serviceLocation.location_name);
            } catch (error) {
              console.error('Failed to delete service location:', serviceLocation.location_name, error);
            }
          }

          // Delete related clients
          for (const client of relatedClients) {
            try {
              await adminService.deleteUser(client.id, true); // hardDelete = true
              console.log('Deleted client:', client.firstName, client.lastName);
            } catch (error) {
              console.error('Failed to delete client:', client.firstName, client.lastName, error);
            }
          }

          // Finally delete the business
          await businessCRUD.deleteEntity(businessData.id);
          console.log('🔴 Deleted business:', businessData.businessName);

          // Refresh all data
          await refreshAllData();

        } catch (error) {
          console.error('Failed to delete business:', error);
          setConfirmationDialog({
            isOpen: true,
            title: 'Delete Failed',
            message: 'Failed to delete business. Please try again or contact support.',
            confirmButtonText: 'OK',
            onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
          });
        } finally {
          // Clear loading state for this specific business
          setLoadingBusinessOperations(prev => {
            const newState = { ...prev };
            delete newState[businessData.id];
            return newState;
          });
        }
      }
    });
  };

  const handleUpdateBusiness = async (businessId: string, updates: unknown) => {
    try {
      await businessCRUD.updateEntity(businessId, updates);
      setShowEditBusinessModal(false);
      setSelectedBusiness(null);
      await refreshAllData();
    } catch (error) {
      console.error('Failed to update business:', error);
      throw error;
    }
  };

  return {
    // State
    showEditBusinessModal,
    selectedBusiness,
    showAddBusinessModal,
    loadingBusinessOperations,
    setLoadingBusinessOperations,
    // Handlers
    handleEditBusiness,
    handleCloseBusinessModal,
    handleAddBusiness,
    handleCloseAddBusinessModal,
    handleCreateBusiness,
    handleDeleteBusiness,
    handleUpdateBusiness,
  };
}
