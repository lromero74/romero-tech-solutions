import React, { useEffect, useState } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { Role, Department, EmployeeStatus } from '../../../types/database';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { applyDarkModeMuting } from '../../../utils/colorUtils';

interface Employee {
  id: string;
  // Name fields (breaking up name into components)
  firstName: string;
  lastName: string;
  middleInitial?: string;
  preferredName?: string; // Nickname/preferred name (e.g., "Lou" for "Louis")
  pronouns?: string;
  // Basic info
  email: string;
  role?: string; // Legacy field for backward compatibility
  roles: string[]; // Employee roles - one to many relationship
  userType: string;
  photo?: string;
  photoPositionX?: number;
  photoPositionY?: number;
  photoScale?: number;
  phone?: string;
  isActive: boolean;
  isOnVacation?: boolean;
  isOutSick?: boolean;
  isOnOtherLeave?: boolean;
  isLoggedIn?: boolean; // Real-time login status from backend
  activeSessions?: number; // Number of active sessions
  lastActivity?: string; // Last activity timestamp
  isRecentlyActive?: boolean; // Recently active (within 5 minutes)
  // Address fields (broken into components)
  address?: {
    street: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  // Employee-specific fields
  employeeNumber?: string;
  hireDate?: string;
  department?: Department;
  jobTitle?: string;
  managerId?: string;
  employeeStatus?: EmployeeStatus;
  terminationDate?: string;
  emergencyContact?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
    email?: string;
  };
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

interface EditEmployeeModalProps {
  showEditForm: boolean;
  editingEmployee: Employee;
  availableRoles: Role[];
  onClose: () => void;
  onSubmit: (data: Employee) => void;
  onEmployeeChange: (employee: Employee) => void;
}

// Helper function to format employee display name (commented out as unused)
/*
const formatEmployeeDisplayName = (employee: Employee): string => {
  const { firstName, lastName, middleInitial, preferredName } = employee;
  let fullName = firstName;

  if (middleInitial) {
    fullName += ` ${middleInitial}.`;
  }

  if (preferredName && preferredName !== firstName) {
    fullName += ` (${preferredName})`;
  }

  fullName += ` ${lastName}`;

  return fullName;
};
*/

// Helper function to format phone number input (real-time)
const formatPhoneNumberInput = (value: string): string => {
  // Remove all non-numeric characters
  const cleaned = value.replace(/\D/g, '');
  // Limit to 10 digits
  const limited = cleaned.slice(0, 10);
  // Apply formatting based on length
  if (limited.length === 0) {
    return '';
  } else if (limited.length <= 3) {
    return `(${limited}`;
  } else if (limited.length <= 6) {
    return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  } else {
    return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
  }
};

// Helper function to extract raw phone number (remove formatting)
const extractRawPhoneNumber = (formattedPhone: string): string => {
  return formattedPhone.replace(/\D/g, '');
};

const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  showEditForm,
  editingEmployee,
  availableRoles,
  onClose,
  onSubmit,
  onEmployeeChange
}) => {
  const { theme } = useTheme();
  const [originalEmployee, setOriginalEmployee] = useState<Employee | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Track original employee data when modal opens
  useEffect(() => {
    if (showEditForm && editingEmployee && !originalEmployee) {
      setOriginalEmployee({ ...editingEmployee });
    } else if (!showEditForm) {
      setOriginalEmployee(null);
    }
  }, [showEditForm, editingEmployee, originalEmployee]);

  const hasChanges = (): boolean => {
    if (!originalEmployee || !editingEmployee) return false;
    return JSON.stringify(originalEmployee) !== JSON.stringify(editingEmployee);
  };

  const handleClose = () => {
    if (hasChanges()) {
      setShowConfirmModal(true);
      return;
    }
    onClose();
  };

  const handleConfirmClose = () => {
    setShowConfirmModal(false);
    onClose();
  };

  const handleCancelClose = () => {
    setShowConfirmModal(false);
  };

  // ESC key handler
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showEditForm) {
        handleClose();
      }
    };

    if (showEditForm) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showEditForm, handleClose]);

  const handleSubmit = (e: React.FormEvent) => {
    onSubmit(e);
  };

  const updateEmployee = (updates: Partial<Employee>) => {
    onEmployeeChange({ ...editingEmployee, ...updates });
  };

  if (!showEditForm || !editingEmployee) return null;

  return (
    <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
      <div className={`relative w-full max-w-6xl max-h-full ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-hidden flex flex-col`}>
        <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Edit Employee</h3>
          <button
            onClick={handleClose}
            className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 transition-colors border ${themeClasses.border.primary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1">
            <div className="space-y-6">
          {/* Main Layout: Two columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left Column */}
            <div className="space-y-6">
              {/* Personal Information */}
              <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
                <h4 className={`text-md font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Personal Information
                </h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>First Name</label>
                      <input
                        type="text"
                        required
                        value={editingEmployee.firstName || ''}
                        onChange={(e) => updateEmployee({ firstName: e.target.value })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Last Name</label>
                      <input
                        type="text"
                        required
                        value={editingEmployee.lastName || ''}
                        onChange={(e) => updateEmployee({ lastName: e.target.value })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Middle Initial</label>
                      <input
                        type="text"
                        maxLength={1}
                        value={editingEmployee.middleInitial || ''}
                        onChange={(e) => updateEmployee({ middleInitial: e.target.value })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="M"
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Preferred Name</label>
                      <input
                        type="text"
                        value={editingEmployee.preferredName || ''}
                        onChange={(e) => updateEmployee({ preferredName: e.target.value })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="Nickname (e.g., Lou)"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Preferred Pronouns</label>
                    <select
                      value={editingEmployee.pronouns || ''}
                      onChange={(e) => updateEmployee({ pronouns: e.target.value })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                    >
                      <option value="">Select pronouns</option>
                      <option value="he/him/his">he/him/his</option>
                      <option value="she/her/hers">she/her/hers</option>
                      <option value="they/them/their">they/them/their</option>
                      <option value="ze/zir/zirs">ze/zir/zirs</option>
                      <option value="xe/xem/xyr">xe/xem/xyr</option>
                      <option value="ey/em/eir">ey/em/eir</option>
                      <option value="fae/faer/faers">fae/faer/faers</option>
                      <option value="any pronouns">any pronouns</option>
                      <option value="ask me">ask me</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Email</label>
                      <input
                        type="email"
                        required
                        value={editingEmployee.email}
                        onChange={(e) => updateEmployee({ email: e.target.value })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="Enter email address"
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Phone</label>
                      <input
                        type="tel"
                        value={formatPhoneNumberInput(editingEmployee.phone || '')}
                        onChange={(e) => {
                          const raw = extractRawPhoneNumber(e.target.value);
                          updateEmployee({ phone: raw });
                        }}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Employment Details */}
              <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
                <h4 className={`text-md font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
                  <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6" />
                  </svg>
                  Employment Details
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Roles</label>
                    <div className="mt-1 space-y-2">
                      {availableRoles.map(role => (
                        <label key={role.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={(editingEmployee.roles || []).includes(role.name)}
                            onChange={(e) => {
                              const currentRoles = editingEmployee.roles || [];
                              let newRoles;
                              if (e.target.checked) {
                                newRoles = [...currentRoles, role.name];
                              } else {
                                newRoles = currentRoles.filter(r => r !== role.name);
                              }
                              updateEmployee({ roles: newRoles });
                            }}
                            className={`mr-2 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500`}
                          />
                          <span
                            className="text-sm font-medium"
                            style={{
                              color: applyDarkModeMuting(role.text_color, theme === 'dark'),
                              backgroundColor: applyDarkModeMuting(role.background_color, theme === 'dark'),
                              borderColor: applyDarkModeMuting(role.border_color, theme === 'dark'),
                              border: '1px solid',
                              borderRadius: '0.25rem',
                              padding: '0.125rem 0.5rem'
                            }}
                          >
                            {role.display_name}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className={`mt-1 text-xs ${themeClasses.text.muted}`}>Select all roles that apply to this employee</p>
                  </div>

                  {(editingEmployee.roles && (editingEmployee.roles.includes('admin') || editingEmployee.roles.includes('technician'))) && (
                    <>
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Job Title</label>
                        <input
                          type="text"
                          value={editingEmployee.jobTitle || ''}
                          onChange={(e) => updateEmployee({ jobTitle: e.target.value })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="Enter job title"
                        />
                      </div>

                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Department</label>
                        <select
                          value={editingEmployee.department || ''}
                          onChange={(e) => {
                            updateEmployee({ department: e.target.value as Department || undefined });
                          }}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        >
                          <option value="">Select Department</option>
                          <option value="administration">Administration</option>
                          <option value="technical">Technical Services</option>
                          <option value="customer_service">Customer Service</option>
                          <option value="management">Management</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Hire Date</label>
                    <input
                      type="date"
                      value={editingEmployee.hireDate || ''}
                      onChange={(e) => updateEmployee({ hireDate: e.target.value })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Employment Status</label>
                    <select
                      value={editingEmployee.employeeStatus || 'active'}
                      onChange={(e) => updateEmployee({ employeeStatus: e.target.value as EmployeeStatus })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="on_leave">On Leave</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>

                  {/* Employee ID field - Read Only */}
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Employee ID</label>
                    <input
                      type="text"
                      value={editingEmployee.employeeNumber || 'Not assigned'}
                      readOnly
                      className={`mt-1 block w-full border ${themeClasses.border.primary} rounded-md shadow-sm ${themeClasses.bg.card} ${themeClasses.text.muted} cursor-not-allowed`}
                      placeholder="e.g., RT-A-2024-001"
                    />
                    <p className={`mt-1 text-xs ${themeClasses.text.muted}`}>Employee numbers are automatically assigned and cannot be changed.</p>
                  </div>
                </div>
              </div>

              {/* Work Status */}
              <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
                <h4 className={`text-md font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
                  <svg className="w-5 h-5 mr-2 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Work Status
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingEmployee.isActive || false}
                        onChange={(e) => updateEmployee({ isActive: e.target.checked })}
                        className={`mr-2 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500`}
                      />
                      <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Active Employee</span>
                    </label>
                    <p className={`mt-1 text-xs ${themeClasses.text.muted}`}>Whether the employee is currently active</p>
                  </div>

                  {/* Mutually Exclusive Leave Status */}
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-3`}>Leave Status</label>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="leaveStatus"
                          checked={!editingEmployee.isOnVacation && !editingEmployee.isOutSick && !editingEmployee.isOnOtherLeave}
                          onChange={() => updateEmployee({
                            isOnVacation: false,
                            isOutSick: false,
                            isOnOtherLeave: false
                          })}
                          className={`mr-2 border ${themeClasses.border.primary} text-green-600 focus:ring-green-500`}
                        />
                        <span className={`text-sm ${themeClasses.text.secondary}`}>Working (Not on leave)</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="leaveStatus"
                          checked={editingEmployee.isOnVacation || false}
                          onChange={() => updateEmployee({
                            isOnVacation: true,
                            isOutSick: false,
                            isOnOtherLeave: false
                          })}
                          className={`mr-2 border ${themeClasses.border.primary} text-orange-600 focus:ring-orange-500`}
                        />
                        <span className={`text-sm ${themeClasses.text.secondary}`}>On Vacation</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="leaveStatus"
                          checked={editingEmployee.isOutSick || false}
                          onChange={() => updateEmployee({
                            isOnVacation: false,
                            isOutSick: true,
                            isOnOtherLeave: false
                          })}
                          className={`mr-2 border ${themeClasses.border.primary} text-red-600 focus:ring-red-500`}
                        />
                        <span className={`text-sm ${themeClasses.text.secondary}`}>Out Sick</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="leaveStatus"
                          checked={editingEmployee.isOnOtherLeave || false}
                          onChange={() => updateEmployee({
                            isOnVacation: false,
                            isOutSick: false,
                            isOnOtherLeave: true
                          })}
                          className={`mr-2 border ${themeClasses.border.primary} text-purple-600 focus:ring-purple-500`}
                        />
                        <span className={`text-sm ${themeClasses.text.secondary}`}>Other Leave</span>
                      </label>
                    </div>
                    <p className={`mt-2 text-xs ${themeClasses.text.muted}`}>Select one leave status option (mutually exclusive)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Profile Photo */}
              <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
                <h4 className={`text-md font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
                  <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Profile Photo
                </h4>
                <div className="space-y-3">
                  {/* File Upload */}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Check file size (2.5MB = 2,621,440 bytes)
                          if (file.size > 2621440) {
                            alert('Photo size must be less than 2.5MB. Please choose a smaller image.');
                            e.target.value = '';
                            return;
                          }

                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const dataUrl = event.target?.result as string;
                            updateEmployee({ photo: dataUrl });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className={`block w-full text-sm ${themeClasses.text.muted} file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:dark:bg-gray-700 file:hover:bg-gray-200 file:dark:hover:bg-gray-600 file:text-gray-700 file:dark:text-gray-300`}
                    />
                  </div>
                  {/* URL Input */}
                  <input
                    type="url"
                    value={editingEmployee.photo && !editingEmployee.photo.startsWith('data:') ? editingEmployee.photo : ''}
                    onChange={(e) => updateEmployee({ photo: e.target.value })}
                    className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2`}
                    placeholder="Enter photo URL"
                  />
                  {/* Photo Preview */}
                  {editingEmployee.photo && (
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <div className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-gray-300">
                          <img
                            src={editingEmployee.photo}
                            alt="Profile preview"
                            className="w-full h-full object-cover"
                            style={{
                              transform: `scale(${(editingEmployee.photoScale || 100) / 100})`,
                              transformOrigin: `${editingEmployee.photoPositionX || 50}% ${editingEmployee.photoPositionY || 50}%`
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      </div>

                      {/* Photo Crop Tool */}
                      <div className="space-y-3">
                        <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                          Photo Crop Tool - Drag to position, use slider to zoom
                        </div>
                        <div className="flex justify-center">
                          <div className="relative">
                            {/* Photo Container */}
                            <div
                              className="relative w-80 h-80 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50 hover:border-gray-400 transition-colors duration-150 cursor-move"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const startPosX = editingEmployee.photoPositionX || 50;
                                const startPosY = editingEmployee.photoPositionY || 50;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                  const deltaX = ((moveEvent.clientX - startX) / 320) * 100;
                                  const deltaY = ((moveEvent.clientY - startY) / 320) * 100;

                                  // Always use inverted movement for natural feel
                                  let newPosX = startPosX - deltaX;
                                  let newPosY = startPosY - deltaY;

                                  // Keep within bounds
                                  newPosX = Math.max(0, Math.min(100, newPosX));
                                  newPosY = Math.max(0, Math.min(100, newPosY));

                                  updateEmployee({
                                    photoPositionX: newPosX,
                                    photoPositionY: newPosY
                                  });
                                };

                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                  document.body.style.userSelect = '';
                                  document.body.style.cursor = '';
                                };

                                document.body.style.userSelect = 'none';
                                document.body.style.cursor = 'move';
                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                            >
                              <img
                                src={editingEmployee.photo}
                                alt="Photo crop preview"
                                className="w-full h-full object-cover pointer-events-none"
                                style={{
                                  transform: `scale(${(editingEmployee.photoScale || 100) / 100})`,
                                  transformOrigin: `${editingEmployee.photoPositionX || 50}% ${editingEmployee.photoPositionY || 50}%`
                                }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>

                            {/* Instructions */}
                            <div className={`text-xs ${themeClasses.text.muted} text-center mt-2`}>
                              Drag image to position • Use slider below to zoom
                            </div>

                            {/* Zoom Slider */}
                            <div className="mt-4 w-80">
                              <div className={`text-xs ${themeClasses.text.secondary} mb-2 flex justify-between`}>
                                <span>Zoom: {editingEmployee.photoScale || 100}%</span>
                                <span>100% - 400%</span>
                              </div>
                              <input
                                type="range"
                                min="100"
                                max="400"
                                step="5"
                                value={editingEmployee.photoScale || 100}
                                onChange={(e) => updateEmployee({ photoScale: parseInt(e.target.value) })}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                                style={{
                                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(((editingEmployee.photoScale || 100) - 100) / 300) * 100}%, #e5e7eb ${(((editingEmployee.photoScale || 100) - 100) / 300) * 100}%, #e5e7eb 100%)`
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Current Values Display */}
                        <div className={`text-xs ${themeClasses.text.muted} text-center space-y-1`}>
                          <div>Position: {Number(editingEmployee.photoPositionX || 50).toFixed(1)}%, {Number(editingEmployee.photoPositionY || 50).toFixed(1)}%</div>
                          <div>Scale: {editingEmployee.photoScale || 100}%</div>
                        </div>

                        {/* Reset Controls */}
                        <div className="flex justify-center space-x-4">
                          <button
                            type="button"
                            onClick={() => updateEmployee({ photoPositionX: 50, photoPositionY: 50 })}
                            className={`px-3 py-1 text-xs ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} border ${themeClasses.border.primary} rounded transition-colors`}
                          >
                            Center
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEmployee({ photoScale: 100 })}
                            className={`px-3 py-1 text-xs ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} border ${themeClasses.border.primary} rounded transition-colors`}
                          >
                            Reset Size
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEmployee({ photoPositionX: 50, photoPositionY: 50, photoScale: 100 })}
                            className={`px-3 py-1 text-xs ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} border ${themeClasses.border.primary} rounded transition-colors`}
                          >
                            Reset All
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className={`text-xs ${themeClasses.text.muted}`}>Upload an image file or enter a URL to a profile photo.</p>
                </div>
              </div>

              {/* Address Information */}
              {(editingEmployee.roles && (editingEmployee.roles.includes('admin') || editingEmployee.roles.includes('technician'))) && (
                <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
                  <h4 className={`text-md font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
                    <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Address Information
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Street Address</label>
                      <input
                        type="text"
                        value={editingEmployee.address?.street || ''}
                        onChange={(e) => updateEmployee({
                          address: { ...editingEmployee.address, street: e.target.value }
                        })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Street Address Line 2</label>
                      <input
                        type="text"
                        value={editingEmployee.address?.street2 || ''}
                        onChange={(e) => updateEmployee({
                          address: { ...editingEmployee.address, street2: e.target.value }
                        })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="Apt 4B, Suite 100, etc. (optional)"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>City</label>
                        <input
                          type="text"
                          value={editingEmployee.address?.city || ''}
                          onChange={(e) => updateEmployee({
                            address: { ...editingEmployee.address, city: e.target.value }
                          })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>State</label>
                        <input
                          type="text"
                          value={editingEmployee.address?.state || ''}
                          onChange={(e) => updateEmployee({
                            address: { ...editingEmployee.address, state: e.target.value }
                          })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="State"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>ZIP Code</label>
                        <input
                          type="text"
                          value={editingEmployee.address?.zipCode || ''}
                          onChange={(e) => updateEmployee({
                            address: { ...editingEmployee.address, zipCode: e.target.value }
                          })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="12345"
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Country</label>
                        <input
                          type="text"
                          value={editingEmployee.address?.country || ''}
                          onChange={(e) => updateEmployee({
                            address: { ...editingEmployee.address, country: e.target.value }
                          })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="Country"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Emergency Contact */}
              {(editingEmployee.roles && (editingEmployee.roles.includes('admin') || editingEmployee.roles.includes('technician'))) && (
                <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
                  <h4 className={`text-md font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
                    <svg className="w-5 h-5 mr-2 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Emergency Contact
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>First Name</label>
                        <input
                          type="text"
                          value={editingEmployee.emergencyContact?.firstName || ''}
                          onChange={(e) => updateEmployee({
                            emergencyContact: { ...editingEmployee.emergencyContact, firstName: e.target.value }
                          })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Last Name</label>
                        <input
                          type="text"
                          value={editingEmployee.emergencyContact?.lastName || ''}
                          onChange={(e) => updateEmployee({
                            emergencyContact: { ...editingEmployee.emergencyContact, lastName: e.target.value }
                          })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="Last name"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Relationship</label>
                        <select
                          value={editingEmployee.emergencyContact?.relationship || ''}
                          onChange={(e) => updateEmployee({
                            emergencyContact: { ...editingEmployee.emergencyContact, relationship: e.target.value }
                          })}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        >
                          <option value="">Select relationship</option>
                          <option value="spouse">Spouse</option>
                          <option value="parent">Parent</option>
                          <option value="child">Child</option>
                          <option value="sibling">Sibling</option>
                          <option value="partner">Partner</option>
                          <option value="friend">Friend</option>
                          <option value="other_family">Other Family Member</option>
                          <option value="guardian">Guardian</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Phone</label>
                        <input
                          type="tel"
                          value={formatPhoneNumberInput(editingEmployee.emergencyContact?.phone || '')}
                          onChange={(e) => {
                            const raw = extractRawPhoneNumber(e.target.value);
                            updateEmployee({
                              emergencyContact: { ...editingEmployee.emergencyContact, phone: raw }
                            });
                          }}
                          className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Email</label>
                      <input
                        type="email"
                        value={editingEmployee.emergencyContact?.email || ''}
                        onChange={(e) => updateEmployee({
                          emergencyContact: { ...editingEmployee.emergencyContact, email: e.target.value }
                        })}
                        className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="emergency.contact@example.com"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

            </div>
          </div>

          <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              type="button"
              onClick={handleClose}
              className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
            >
              <Save className="w-4 h-4 mr-2" />
              Update Employee
            </button>
          </div>
        </form>
      </div>

      {/* Custom Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className={`${themeClasses.bg.modal} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-orange-400" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Unsaved Changes
                </h3>
              </div>
            </div>
            <div className="mb-6">
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                You have unsaved changes. Are you sure you want to close without saving?
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancelClose}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} hover:${themeClasses.bg.card} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                Continue Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditEmployeeModal;