import { useState } from 'react';
import { Client } from '../../../../contexts/AdminDataContext';
import { adminService } from '../../../../services/adminService';
import { UserCreationContext } from '../AdminViewRouter.types';

interface UseClientHandlersProps {
  clientCRUD: {
    createEntity: (data: unknown) => Promise<{ id?: string } | void>;
    updateEntity: (id: string, data: unknown) => Promise<void>;
  };
}

export function useClientHandlers({
  clientCRUD,
}: UseClientHandlersProps) {
  // Client modal state
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [loadingClientOperations, setLoadingClientOperations] = useState<Record<string, boolean>>({});

  // State to track service location context for user creation
  const [userCreationContext, setUserCreationContext] = useState<UserCreationContext | null>(null);

  const handleEditClient = (client: unknown) => {
    setSelectedClient(client as Client);
    setShowEditClientModal(true);
  };

  const handleCloseClientModal = () => {
    setShowEditClientModal(false);
    setSelectedClient(null);
  };

  const handleAddClient = () => {
    setShowAddClientModal(true);
  };

  const handleCloseAddClientModal = () => {
    setShowAddClientModal(false);
  };

  const handleCreateClient = async (clientData: unknown) => {
    try {
      const result = await clientCRUD.createEntity(clientData);

      // If this client was created from service location modal, create location contact
      if (userCreationContext && result?.id) {
        try {
          await adminService.createLocationContact({
            service_location_id: userCreationContext.serviceLocationId,
            user_id: result.id,
            contact_role: 'contact',
            is_primary_contact: true, // First contact is primary
            notes: 'Added as first contact for this location'
          });
          console.log('Location contact relationship created successfully');
        } catch (contactError) {
          console.error('Failed to create location contact relationship:', contactError);
          // Don't throw here - user was created successfully, just log the contact relationship error
        }
      }

      setShowAddClientModal(false);
      setUserCreationContext(null); // Clear the context
      // Refresh client data if needed
    } catch (error) {
      console.error('Failed to create client:', error);
      throw error;
    }
  };

  const handleUpdateClient = async (clientId: string, updates: unknown) => {
    try {
      await clientCRUD.updateEntity(clientId, updates);
      setShowEditClientModal(false);
      setSelectedClient(null);
      // Refresh client data if needed
    } catch (error) {
      console.error('Failed to update client:', error);
      throw error;
    }
  };

  return {
    // State
    showEditClientModal,
    selectedClient,
    showAddClientModal,
    userCreationContext,
    setUserCreationContext,
    loadingClientOperations,
    setLoadingClientOperations,
    // Handlers
    handleEditClient,
    handleCloseClientModal,
    handleAddClient,
    handleCloseAddClientModal,
    handleCreateClient,
    handleUpdateClient,
  };
}
