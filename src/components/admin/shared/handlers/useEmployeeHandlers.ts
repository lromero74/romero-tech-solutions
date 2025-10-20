import { useState } from 'react';
import { Employee } from '../../../../contexts/AdminDataContext';
import { adminService } from '../../../../services/adminService';
import { ConfirmationDialogState } from '../AdminViewRouter.types';

interface UseEmployeeHandlersProps {
  employeeCRUD: {
    updateEntity: (id: string, data: unknown) => Promise<void>;
  };
  setConfirmationDialog: React.Dispatch<React.SetStateAction<ConfirmationDialogState>>;
  user: { id: string } | null;
}

export function useEmployeeHandlers({
  employeeCRUD,
  setConfirmationDialog,
  user,
}: UseEmployeeHandlersProps) {
  // Loading state for employee operations
  const [loadingEmployeeOperations, setLoadingEmployeeOperations] = useState<Record<string, boolean>>({});

  // Wrapper function to update employee (WebSocket will handle real-time updates)
  const handleUpdateEmployee = async (employeeId: string, updates: unknown) => {
    try {
      await employeeCRUD.updateEntity(employeeId, updates);
      // No need to refresh - WebSocket will broadcast the update to all admins
      console.log('✅ Employee updated, waiting for WebSocket broadcast...');
    } catch (error) {
      console.error('Failed to update employee:', error);
      throw error;
    }
  };

  // Employee delete handlers
  const handleSoftDeleteEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const shouldRestore = empData.softDelete; // If currently deleted, restore it
      // const actionType = shouldRestore ? 'restore' : 'soft delete'; // Unused variable
      const entityName = `${empData.firstName} ${empData.lastName}`;

      setConfirmationDialog({
        isOpen: true,
        title: shouldRestore ? 'Confirm Employee Restore' : 'Confirm Employee Soft Delete',
        message: shouldRestore
          ? `Are you sure you want to restore "${entityName}"? They will be able to access the system again.`
          : `Are you sure you want to soft delete "${entityName}"? They will be moved to inactive status but data will be preserved.`,
        onConfirm: async () => {
          try {
            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));
            console.log(`🔄 Soft ${shouldRestore ? 'restoring' : 'deleting'} employee:`, empData.employeeNumber, empData.firstName, empData.lastName);
            console.log('Current softDelete status:', empData.softDelete);

            await adminService.softDeleteUser(empData.id, shouldRestore);
            console.log('✅ Soft delete API call completed, waiting for WebSocket broadcast...');

            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to soft delete employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee soft delete:', error);
    }
  };

  const handleHardDeleteEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const entityName = `${empData.firstName} ${empData.lastName}`;

      setConfirmationDialog({
        isOpen: true,
        title: 'Confirm Permanent Employee Deletion',
        message: `Are you sure you want to permanently delete "${entityName}"? This action cannot be undone and will remove all employee data including records, assignments, and history.`,
        onConfirm: async () => {
          try {
            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));
            await adminService.deleteUser(empData.id, true); // hardDelete = true
            console.log('✅ Hard delete API call completed, waiting for WebSocket broadcast...');
            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to hard delete employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee hard delete:', error);
    }
  };

  const handleTerminateEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const entityName = `${empData.firstName} ${empData.lastName}`;

      setConfirmationDialog({
        isOpen: true,
        title: 'Confirm Employee Termination',
        message: `Are you sure you want to terminate "${entityName}"? This will set their employment status to terminated and they will no longer be able to access the system.`,
        onConfirm: async () => {
          try {
            // Prevent self-termination
            if (user && empData.id === user.id) {
              console.warn('Cannot terminate your own account');
              return;
            }

            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));

            const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

            // Update employment status to terminated, set inactive, and record termination date
            await employeeCRUD.updateEntity(empData.id, {
              employeeStatus: 'terminated',
              isActive: false,
              terminationDate: today
            });
            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to terminate employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee termination:', error);
    }
  };

  const handleRehireEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const entityName = `${empData.firstName} ${empData.lastName}`;
      setConfirmationDialog({
        isOpen: true,
        title: 'Confirm Employee Rehire',
        message: `Are you sure you want to rehire "${entityName}"? This will update their employment status to active, set their hire date to today, and clear any termination date.`,
        confirmButtonText: 'Rehire Employee',
        confirmButtonColor: 'green',
        iconType: 'success',
        onConfirm: async () => {
          try {
            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));

            const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

            // Update employment status to active, set new hire date, clear termination date
            await employeeCRUD.updateEntity(empData.id, {
              employeeStatus: 'active',
              hireDate: today,
              terminationDate: null,
              isActive: true
            });
            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to rehire employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee rehire:', error);
    }
  };

  return {
    // State
    loadingEmployeeOperations,
    setLoadingEmployeeOperations,
    // Handlers
    handleUpdateEmployee,
    handleSoftDeleteEmployee,
    handleHardDeleteEmployee,
    handleTerminateEmployee,
    handleRehireEmployee,
  };
}
