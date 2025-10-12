import React from 'react';
import { ModalState, ModalName } from '../../../hooks/admin/useModalManager';
import { useAdminData, Employee, Client, Business, Service, ServiceRequest, ServiceLocation } from '../../../contexts/AdminDataContext';
import { useEntityCRUD } from '../../../hooks/admin/useEntityCRUD';
import { useEnhancedAuth } from '../../../contexts/EnhancedAuthContext';
import { authService } from '../../../services/authService';

// Import all modal components
import AddClientModal from '../AdminClients_Modals/AddClientModal';
import EditClientModal from '../AdminClients_Modals/EditClientModal';
import AddBusinessModal from '../AdminBusinesses_Modals/AddBusinessModal';
import EditBusinessModal from '../AdminBusinesses_Modals/EditBusinessModal';
import AddServiceLocationModal from '../AdminServiceLocations_Modals/AddServiceLocationModal';
import EditServiceLocationModal from '../AdminServiceLocations_Modals/EditServiceLocationModal';
// Employee modals handled by AdminViewRouter directly for now
// import AddUserModal from '../AdminEmployees_Modals/AddUserModal';
// import EditEmployeeModal from '../AdminEmployees_Modals/EditEmployeeModal';
import ChangePasswordModal from './ChangePasswordModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import TrustedDeviceManagement from '../../shared/TrustedDeviceManagement';
import GenericModal from '../../shared/GenericModal';

interface AdminModalManagerProps {
  modals: ModalState;
  onCloseModal: (modalName: ModalName) => void;
  selectedEntities: {
    client: Client | null;
    business: Business | null;
    serviceLocation: ServiceLocation | null;
    employee: Employee | null;
    service: Service | null;
    serviceRequest: ServiceRequest | null;
  };
  serviceLocationPrefillBusinessName?: string;
  onRefresh: () => Promise<void>;
  // Delete confirmation props
  deleteConfirmation?: {
    entityType: string;
    entityName: string;
    entityId: string;
    deleteType?: 'soft' | 'hard';
    customMessage?: string;
  };
  onDeleteConfirm?: () => Promise<void>;
}

export const AdminModalManager: React.FC<AdminModalManagerProps> = ({
  modals,
  onCloseModal,
  selectedEntities,
  serviceLocationPrefillBusinessName,
  // onRefresh,
  deleteConfirmation,
  onDeleteConfirm
}) => {
  const { businesses, refreshBusinesses, refreshServiceLocations, refreshClients } = useAdminData();
  const { user } = useEnhancedAuth();

  // Initialize CRUD hooks
  const clientCRUD = useEntityCRUD<Client>('clients');
  const businessCRUD = useEntityCRUD<Business>('businesses');
  const serviceLocationCRUD = useEntityCRUD<ServiceLocation>('serviceLocations');
  // const employeeCRUD = useEntityCRUD<Employee>('employees');
  // const serviceCRUD = useEntityCRUD<Service>('services');
  // const serviceRequestCRUD = useEntityCRUD<ServiceRequest>('serviceRequests');

  // Client handlers
  const handleAddClient = async (clientData: unknown) => {
    try {
      const result = await clientCRUD.createEntity(clientData);
      // Use targeted refresh instead of full refresh for better performance and reliability
      await refreshClients();
      onCloseModal('addClient');
      return result; // Return the result for potential modal flow continuation
    } catch (error) {
      console.error('Error adding client:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  const handleUpdateClient = async (clientData: unknown) => {
    if (!selectedEntities.client?.id) return;
    try {
      await clientCRUD.updateEntity(selectedEntities.client.id, clientData);
      // Use targeted refresh instead of full refresh for better performance and reliability
      await refreshClients();
      onCloseModal('editClient');
    } catch (error) {
      console.error('Error updating client:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  // Employee handlers - currently unused but kept for future implementation
  // const handleAddEmployee = async (employeeData: unknown) => {
  //   try {
  //     const result = await employeeCRUD.createEntity(employeeData);
  //     await refreshEmployees();
  //     onCloseModal('addEmployee');
  //     return result;
  //   } catch (error) {
  //     console.error('Error adding employee:', error);
  //     throw error;
  //   }
  // };

  // const handleUpdateEmployee = async (employeeData: unknown) => {
  //   if (!selectedEntities.employee?.id) return;
  //   try {
  //     await employeeCRUD.updateEntity(selectedEntities.employee.id, employeeData);
  //     await refreshEmployees();
  //     onCloseModal('editEmployee');
  //   } catch (error) {
  //     console.error('Error updating employee:', error);
  //     throw error;
  //   }
  // };

  // Business handlers
  const handleAddBusiness = async (businessData: unknown) => {
    try {
      console.log('🟢 Creating business:', businessData);
      await businessCRUD.createEntity(businessData);
      console.log('🟢 Business created successfully');

      // WebSocket will handle the refresh automatically
      onCloseModal('addBusiness');
    } catch (error) {
      console.error('🔴 Error adding business:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  const handleUpdateBusiness = async (businessData: unknown) => {
    if (!selectedEntities.business?.id) return;
    try {
      await businessCRUD.updateEntity(selectedEntities.business.id, businessData);
      // WebSocket will handle the refresh automatically
      onCloseModal('editBusiness');
    } catch (error) {
      console.error('Error updating business:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  // Service Location handlers
  const handleAddServiceLocation = async (serviceLocationData: unknown) => {
    try {
      const result = await serviceLocationCRUD.createEntity(serviceLocationData);
      // WebSocket will handle the refresh automatically
      onCloseModal('addServiceLocation');
      return result; // Return the result so modal can continue its flow
    } catch (error) {
      console.error('Error adding service location:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  const handleUpdateServiceLocation = async (serviceLocationId: string, serviceLocationData: unknown) => {
    try {
      console.log('=== HANDLE UPDATE SERVICE LOCATION ===');
      console.log('Service Location ID:', serviceLocationId);
      console.log('Service Location Data:', serviceLocationData);
      await serviceLocationCRUD.updateEntity(serviceLocationId, serviceLocationData);
      // Wait for WebSocket to trigger refresh, then close modal
      await new Promise(resolve => setTimeout(resolve, 300));
      onCloseModal('editServiceLocation');
    } catch (error) {
      console.error('Error updating service location:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  // Change password handler
  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await authService.changePassword(currentPassword, newPassword);
      onCloseModal('changePassword');
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  };

  // Delete confirmation handler
  const handleDeleteConfirm = async () => {
    if (!onDeleteConfirm) return;

    try {
      await onDeleteConfirm();
      onCloseModal('deleteConfirm');
    } catch (error) {
      console.error('Error in delete confirmation:', error);
      throw error;
    }
  };

  return (
    <>
      {/* Employee Modals - Currently handled by AdminViewRouter directly */}
      {/* TODO: Migrate employee modals to AdminModalManager when refactoring is complete */}

      {/* Client Modals */}
      <AddClientModal
        showModal={modals.addClient}
        onClose={() => onCloseModal('addClient')}
        onSubmit={handleAddClient}
      />

      <EditClientModal
        showModal={modals.editClient}
        onClose={() => onCloseModal('editClient')}
        onSubmit={handleUpdateClient}
        client={selectedEntities.client}
      />

      {/* Business Modals */}
      <AddBusinessModal
        showModal={modals.addBusiness}
        onClose={() => onCloseModal('addBusiness')}
        onSubmit={handleAddBusiness}
        businesses={businesses}
      />

      <EditBusinessModal
        showModal={modals.editBusiness}
        onClose={() => onCloseModal('editBusiness')}
        onSubmit={handleUpdateBusiness}
        business={selectedEntities.business}
        businesses={businesses}
      />

      {/* Service Location Modals */}
      <AddServiceLocationModal
        showModal={modals.addServiceLocation}
        onClose={() => onCloseModal('addServiceLocation')}
        onSubmit={handleAddServiceLocation}
        prefillBusinessName={serviceLocationPrefillBusinessName}
      />

      <EditServiceLocationModal
        showModal={modals.editServiceLocation}
        onClose={() => onCloseModal('editServiceLocation')}
        onSubmit={handleUpdateServiceLocation}
        serviceLocation={selectedEntities.serviceLocation}
        businesses={businesses}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={modals.changePassword}
        onClose={() => onCloseModal('changePassword')}
        onSubmit={handleChangePassword}
        userEmail={user?.email}
        userName={user?.name}
      />

      {/* Trusted Devices Modal */}
      <GenericModal
        isOpen={modals.trustedDevices}
        onClose={() => onCloseModal('trustedDevices')}
        title="Manage Trusted Devices"
        maxWidth="4xl"
      >
        <TrustedDeviceManagement isDarkMode={false} />
      </GenericModal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        showModal={modals.deleteConfirm}
        onClose={() => onCloseModal('deleteConfirm')}
        onConfirm={handleDeleteConfirm}
        entityName={deleteConfirmation?.entityName || ''}
        entityType={deleteConfirmation?.entityType || 'item'}
        deleteType={deleteConfirmation?.deleteType || 'soft'}
        customMessage={deleteConfirmation?.customMessage}
      />

      {/* TODO: Add other modals as they become available */}
      {/*
        IMPORTANT: When implementing future handlers, follow this pattern:

        const handleAddEntity = async (entityData: any) => {
          try {
            const result = await entityCRUD.createEntity(entityData);
            await refreshSpecificEntity(); // Use targeted refresh (e.g., refreshEmployees, refreshServices)
            onCloseModal('addEntity');
            return result; // Return result for modal flow continuation
          } catch (error) {
            console.error('Error adding entity:', error);
            throw error; // Re-throw to let modal handle error
          }
        };

        Remember to add the specific refresh function to useAdminData() destructuring above!
      */}
      {/* Employee modals are now implemented above */}
      {/*

      <AddServiceModal
        showModal={modals.addService}
        onClose={() => onCloseModal('addService')}
        onSubmit={handleAddService}
      />

      <EditServiceModal
        showModal={modals.editService}
        onClose={() => onCloseModal('editService')}
        onSubmit={handleUpdateService}
        service={selectedEntities.service}
      />

      <AddServiceRequestModal
        showModal={modals.addServiceRequest}
        onClose={() => onCloseModal('addServiceRequest')}
        onSubmit={handleAddServiceRequest}
      />

      <EditServiceRequestModal
        showModal={modals.editServiceRequest}
        onClose={() => onCloseModal('editServiceRequest')}
        onSubmit={handleUpdateServiceRequest}
        serviceRequest={selectedEntities.serviceRequest}
      />

      <DeleteConfirmModal
        showModal={modals.deleteConfirm}
        onClose={() => onCloseModal('deleteConfirm')}
        onConfirm={handleDeleteConfirm}
        entityName={getEntityName()}
        entityType={getEntityType()}
      />
      */}
    </>
  );
};

/*
  DELETE CONFIRMATION SYSTEM USAGE EXAMPLE:

  In your parent component:

  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const { openModal } = useModalManager();

  // Function to initiate delete confirmation
  const handleDeleteClick = (entity) => {
    setDeleteConfirmation({
      entityType: 'client',
      entityName: `${entity.firstName} ${entity.lastName}`,
      entityId: entity.id,
      deleteType: 'soft', // or 'hard'
      customMessage: 'This will remove the client from all active projects.' // optional
    });
    openModal('deleteConfirm');
  };

  // Function to handle the actual deletion
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation) return;

    try {
      if (deleteConfirmation.deleteType === 'hard') {
        await adminService.deleteClient(deleteConfirmation.entityId);
      } else {
        await adminService.softDeleteClient(deleteConfirmation.entityId);
      }

      // Refresh the appropriate data
      await refreshClients();

      // Clear the confirmation state
      setDeleteConfirmation(null);
    } catch (error) {
      console.error('Delete failed:', error);
      // Handle error (show toast, etc.)
    }
  };

  // In your JSX:
  <AdminModalManager
    modals={modals}
    onCloseModal={closeModal}
    selectedEntities={selectedEntities}
    onRefresh={refreshAllData}
    deleteConfirmation={deleteConfirmation}
    onDeleteConfirm={handleDeleteConfirm}
  />
*/