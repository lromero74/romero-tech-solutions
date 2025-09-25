import { useState, useCallback } from 'react';

export type ModalName =
  | 'addClient'
  | 'editClient'
  | 'addBusiness'
  | 'editBusiness'
  | 'addServiceLocation'
  | 'editServiceLocation'
  | 'deleteConfirm'
  | 'addEmployee'
  | 'editEmployee'
  | 'addService'
  | 'editService'
  | 'addServiceRequest'
  | 'editServiceRequest'
  | 'changePassword';

export interface ModalState {
  addClient: boolean;
  editClient: boolean;
  addBusiness: boolean;
  editBusiness: boolean;
  addServiceLocation: boolean;
  editServiceLocation: boolean;
  deleteConfirm: boolean;
  addEmployee: boolean;
  editEmployee: boolean;
  addService: boolean;
  editService: boolean;
  addServiceRequest: boolean;
  editServiceRequest: boolean;
  changePassword: boolean;
}

export interface UseModalManagerReturn {
  modals: ModalState;
  openModal: (modalName: ModalName) => void;
  closeModal: (modalName: ModalName) => void;
  closeAllModals: () => void;
  isAnyModalOpen: boolean;
}

const initialModalState: ModalState = {
  addClient: false,
  editClient: false,
  addBusiness: false,
  editBusiness: false,
  addServiceLocation: false,
  editServiceLocation: false,
  deleteConfirm: false,
  addEmployee: false,
  editEmployee: false,
  addService: false,
  editService: false,
  addServiceRequest: false,
  editServiceRequest: false,
  changePassword: false,
};

export const useModalManager = (): UseModalManagerReturn => {
  const [modals, setModals] = useState<ModalState>(initialModalState);

  const openModal = useCallback((modalName: ModalName) => {
    setModals(prev => ({
      ...prev,
      [modalName]: true
    }));
  }, []);

  const closeModal = useCallback((modalName: ModalName) => {
    setModals(prev => ({
      ...prev,
      [modalName]: false
    }));
  }, []);

  const closeAllModals = useCallback(() => {
    setModals(initialModalState);
  }, []);

  const isAnyModalOpen = Object.values(modals).some(isOpen => isOpen);

  return {
    modals,
    openModal,
    closeModal,
    closeAllModals,
    isAnyModalOpen
  };
};