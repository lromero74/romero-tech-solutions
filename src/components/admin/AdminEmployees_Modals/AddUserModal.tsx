import React from 'react';
import {
  X,
  Save
} from 'lucide-react';
import { Department, EmployeeStatus } from '../../../types/database';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';

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

interface NewUserData {
  firstName: string;
  lastName: string;
  middleInitial?: string;
  preferredName?: string;
  pronouns?: string;
  email: string;
  roles: string[];
  photo?: string;
  phone?: string;
  address?: {
    street: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  department?: Department;
  jobTitle?: string;
  hireDate?: string;
  employeeStatus?: EmployeeStatus;
  emergencyContact?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
    email?: string;
  };
}

interface AddUserModalProps {
  showAddUserForm: boolean;
  newUserData: NewUserData;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onUserDataChange: (data: NewUserData) => void;
}

const AddUserModal: React.FC<AddUserModalProps> = ({
  showAddUserForm,
  newUserData,
  onClose,
  onSubmit,
  onUserDataChange
}) => {

  if (!showAddUserForm) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className={`relative top-10 mx-auto p-6 border w-full max-w-md shadow-lg rounded-md ${themeClasses.bg.modal} max-h-screen overflow-y-auto`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Add New User</h3>
          <button
            onClick={onClose}
            className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>First Name</label>
              <input
                type="text"
                required
                value={newUserData.firstName}
                onChange={(e) => onUserDataChange({ ...newUserData, firstName: e.target.value })}
                className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter first name"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Last Name</label>
              <input
                type="text"
                required
                value={newUserData.lastName}
                onChange={(e) => onUserDataChange({ ...newUserData, lastName: e.target.value })}
                className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter last name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Middle Initial</label>
              <input
                type="text"
                maxLength={1}
                value={newUserData.middleInitial || ''}
                onChange={(e) => onUserDataChange({ ...newUserData, middleInitial: e.target.value })}
                className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                placeholder="M"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Preferred Name</label>
              <input
                type="text"
                value={newUserData.preferredName || ''}
                onChange={(e) => onUserDataChange({ ...newUserData, preferredName: e.target.value })}
                className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Nickname (e.g., Lou)"
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Preferred Pronouns</label>
            <select
              value={newUserData.pronouns || ''}
              onChange={(e) => onUserDataChange({ ...newUserData, pronouns: e.target.value })}
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
                value={newUserData.email}
                onChange={(e) => onUserDataChange({ ...newUserData, email: e.target.value })}
                className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter email address"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Phone</label>
              <input
                type="tel"
                value={formatPhoneNumberInput(newUserData.phone || '')}
                onChange={(e) => {
                  const raw = extractRawPhoneNumber(e.target.value);
                  onUserDataChange({ ...newUserData, phone: raw });
                }}
                className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Photo Upload */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Profile Photo</label>
            <div className="mt-1 space-y-3">
              {/* File Upload */}
              <div className="flex items-center space-x-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Create a preview URL for the uploaded file
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const dataUrl = event.target?.result as string;
                        onUserDataChange({ ...newUserData, photo: dataUrl });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className={`block w-full text-sm ${themeClasses.text.muted} file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:dark:bg-gray-700 file:hover:bg-gray-200 file:dark:hover:bg-gray-600 file:text-gray-700 file:dark:text-gray-300`}
                />
                <span className={`text-sm ${themeClasses.text.muted}`}>or</span>
              </div>

              {/* URL Input */}
              <input
                type="url"
                value={newUserData.photo && !newUserData.photo.startsWith('data:') ? newUserData.photo : ''}
                onChange={(e) => onUserDataChange({ ...newUserData, photo: e.target.value })}
                className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter photo URL"
              />

              {/* Photo Preview */}
              {newUserData.photo && (
                <div className="mt-2">
                  <img
                    src={newUserData.photo}
                    alt="Profile preview"
                    className={`h-20 w-20 rounded-full object-cover border-2 ${themeClasses.border.primary}`}
                    onError={(e) => {
                      // Hide broken image icon if URL is invalid
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <p className={`text-xs ${themeClasses.text.muted}`}>Upload an image file or enter a URL to a profile photo.</p>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Roles</label>
            <div className="mt-1 space-y-2">
              {['admin', 'technician', 'sales', 'client'].map(roleOption => (
                <label key={roleOption} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={(newUserData.roles || []).includes(roleOption)}
                    onChange={(e) => {
                      const currentRoles = newUserData.roles || [];
                      let newRoles;
                      if (e.target.checked) {
                        newRoles = [...currentRoles, roleOption];
                      } else {
                        newRoles = currentRoles.filter(r => r !== roleOption);
                      }
                      onUserDataChange({ ...newUserData, roles: newRoles });
                    }}
                    className={`mr-2 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500`}
                  />
                  <span className={`text-sm ${themeClasses.text.secondary} capitalize`}>{roleOption}</span>
                </label>
              ))}
            </div>
            <p className={`mt-1 text-xs ${themeClasses.text.muted}`}>Select all roles that apply to this employee</p>
          </div>

          {/* Employee-specific fields (show for admin and technician roles) */}
          {(newUserData.roles && (newUserData.roles.includes('admin') || newUserData.roles.includes('technician'))) && (
            <>
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Job Title</label>
                <input
                  type="text"
                  value={newUserData.jobTitle || ''}
                  onChange={(e) => onUserDataChange({ ...newUserData, jobTitle: e.target.value })}
                  className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="Enter job title"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Department</label>
                <select
                  value={newUserData.department || ''}
                  onChange={(e) => onUserDataChange({ ...newUserData, department: e.target.value as Department || undefined })}
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

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Hire Date</label>
                <input
                  type="date"
                  value={newUserData.hireDate || ''}
                  onChange={(e) => onUserDataChange({ ...newUserData, hireDate: e.target.value })}
                  className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Employment Status</label>
                <select
                  value={newUserData.employeeStatus || 'active'}
                  onChange={(e) => onUserDataChange({ ...newUserData, employeeStatus: e.target.value as EmployeeStatus })}
                  className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>

              {/* Address Section */}
              <div className={`border-t ${themeClasses.border.primary} pt-4 mt-4`}>
                <h4 className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>Address Information</h4>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Street Address</label>
                  <input
                    type="text"
                    value={newUserData.address?.street || ''}
                    onChange={(e) => onUserDataChange({
                      ...newUserData,
                      address: { ...newUserData.address, street: e.target.value } as any
                    })}
                    className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="123 Main Street"
                  />
                </div>
                <div className="mt-3">
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Street Address Line 2</label>
                  <input
                    type="text"
                    value={newUserData.address?.street2 || ''}
                    onChange={(e) => onUserDataChange({
                      ...newUserData,
                      address: { ...newUserData.address, street2: e.target.value } as any
                    })}
                    className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="Apt 4B, Suite 100, etc. (optional)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>City</label>
                    <input
                      type="text"
                      value={newUserData.address?.city || ''}
                      onChange={(e) => onUserDataChange({
                        ...newUserData,
                        address: { ...newUserData.address, city: e.target.value } as any
                      })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>State</label>
                    <input
                      type="text"
                      value={newUserData.address?.state || ''}
                      onChange={(e) => onUserDataChange({
                        ...newUserData,
                        address: { ...newUserData.address, state: e.target.value } as any
                      })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="State"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>ZIP Code</label>
                    <input
                      type="text"
                      value={newUserData.address?.zipCode || ''}
                      onChange={(e) => onUserDataChange({
                        ...newUserData,
                        address: { ...newUserData.address, zipCode: e.target.value } as any
                      })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="12345"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Country</label>
                    <input
                      type="text"
                      value={newUserData.address?.country || ''}
                      onChange={(e) => onUserDataChange({
                        ...newUserData,
                        address: { ...newUserData.address, country: e.target.value } as any
                      })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="Country"
                    />
                  </div>
                </div>
              </div>

              {/* Emergency Contact Section */}
              <div className={`border-t ${themeClasses.border.primary} pt-4 mt-4`}>
                <h4 className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>Emergency Contact</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>First Name</label>
                    <input
                      type="text"
                      value={newUserData.emergencyContact?.firstName || ''}
                      onChange={(e) => onUserDataChange({
                        ...newUserData,
                        emergencyContact: { ...newUserData.emergencyContact, firstName: e.target.value } as any
                      })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Last Name</label>
                    <input
                      type="text"
                      value={newUserData.emergencyContact?.lastName || ''}
                      onChange={(e) => onUserDataChange({
                        ...newUserData,
                        emergencyContact: { ...newUserData.emergencyContact, lastName: e.target.value } as any
                      })}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Relationship</label>
                    <select
                      value={newUserData.emergencyContact?.relationship || ''}
                      onChange={(e) => onUserDataChange({
                        ...newUserData,
                        emergencyContact: { ...newUserData.emergencyContact, relationship: e.target.value } as any
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
                      value={formatPhoneNumberInput(newUserData.emergencyContact?.phone || '')}
                      onChange={(e) => {
                        const raw = extractRawPhoneNumber(e.target.value);
                        onUserDataChange({
                          ...newUserData,
                          emergencyContact: { ...newUserData.emergencyContact, phone: raw } as any
                        });
                      }}
                      className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Email</label>
                  <input
                    type="email"
                    value={newUserData.emergencyContact?.email || ''}
                    onChange={(e) => onUserDataChange({
                      ...newUserData,
                      emergencyContact: { ...newUserData.emergencyContact, email: e.target.value } as any
                    })}
                    className={`mt-1 block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="emergency.contact@example.com"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Add User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUserModal;