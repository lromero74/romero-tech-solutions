import React, { useEffect } from 'react';
import {
  UserPlus,
  Edit,
  UserX,
  Search,
  X,
  Heart,
  Plane,
  ToggleLeft,
  ToggleRight,
  Calendar,
  User,
  Eye,
  Trash2,
  Undo2,
  Loader,
  UserCheck,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { getDepartmentDisplayName } from '../../utils/employeeUtils';
import { Department, EmployeeStatus, Role } from '../../types/database';
import { themeClasses, useTheme } from '../../contexts/ThemeContext';
import adminService from '../../services/adminService';
import EditEmployeeModal from './AdminEmployees_Modals/EditEmployeeModal';
import ViewEmployeeModal from './AdminEmployees_Modals/ViewEmployeeModal';
import AddUserModal from './AdminEmployees_Modals/AddUserModal';
import { applyDarkModeMuting } from '../../utils/colorUtils';

// Helper function to format employee display name
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



// Helper function to get role styles from database with dark mode muting
const getRoleStyles = (roleName: string, availableRoles: Role[], isDarkMode: boolean) => {
  const role = availableRoles.find(r => r.name === roleName);
  if (role) {
    const backgroundColor = applyDarkModeMuting(role.background_color || '#e5e7eb', isDarkMode);
    const textColor = applyDarkModeMuting(role.text_color || '#374151', isDarkMode);
    const borderColor = applyDarkModeMuting(role.border_color || role.background_color || '#e5e7eb', isDarkMode);

    return {
      backgroundColor,
      color: textColor,
      borderColor,
      border: `1px solid ${borderColor}`
    };
  }
  // Fallback to default green for unknown roles (also muted in dark mode)
  const fallbackBg = applyDarkModeMuting('#dcfce7', isDarkMode);
  const fallbackText = applyDarkModeMuting('#166534', isDarkMode);

  return {
    backgroundColor: fallbackBg,
    color: fallbackText,
    borderColor: fallbackBg,
    border: `1px solid ${fallbackBg}`
  };
};

// Helper function to get employee status styles with dark mode muting
const getEmployeeStatusStyles = (user: Employee, isDarkMode: boolean) => {
  let backgroundColor: string;
  let textColor: string;

  if (!user.isActive) {
    backgroundColor = '#fee2e2'; // red-100
    textColor = '#991b1b'; // red-800
  } else if (user.isOutSick) {
    backgroundColor = '#fee2e2'; // red-100
    textColor = '#991b1b'; // red-800
  } else if (user.isOnVacation) {
    backgroundColor = '#fed7aa'; // orange-100
    textColor = '#9a3412'; // orange-800
  } else if (user.isOnOtherLeave) {
    backgroundColor = '#e9d5ff'; // purple-100
    textColor = '#6b21a8'; // purple-800
  } else {
    backgroundColor = '#dcfce7'; // green-100
    textColor = '#166534'; // green-800
  }

  return {
    backgroundColor: applyDarkModeMuting(backgroundColor, isDarkMode),
    color: applyDarkModeMuting(textColor, isDarkMode)
  };
};

// Helper function to get employee status text color with dark mode muting
const getEmployeeStatusTextColor = (employeeStatus: string, isDarkMode: boolean) => {
  let textColor: string;

  switch (employeeStatus) {
    case 'active':
      textColor = '#059669'; // green-600
      break;
    case 'on_leave':
      textColor = '#ea580c'; // orange-600
      break;
    case 'terminated':
      textColor = '#dc2626'; // red-600
      break;
    default:
      textColor = '#4b5563'; // gray-600
      break;
  }

  return applyDarkModeMuting(textColor, isDarkMode);
};

interface Employee {
  id: string;
  // Name fields (breaking up name into components)
  firstName: string;
  lastName: string;
  middleInitial?: string;
  preferredName?: string; // Nickname/preferred name (e.g., "John" for "Jonathan")
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
  photoBackgroundColor?: string;
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

interface NewUserData {
  // Name fields
  firstName: string;
  lastName: string;
  middleInitial?: string;
  preferredName?: string; // Nickname/preferred name (e.g., "John" for "Jonathan")
  pronouns?: string;
  // Basic info
  email: string;
  roles: string[]; // Employee roles - one to many relationship
  photo?: string;
  phone?: string;
  // Address fields
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  // Employee-specific fields
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

interface AdminEmployeesProps {
  employees: Employee[];
  employeeRoleFilter: string;
  setEmployeeRoleFilter: (value: string) => void;
  employeeStatusFilter: string;
  setEmployeeStatusFilter: (value: string) => void;
  employeeDepartmentFilter?: string;
  setEmployeeDepartmentFilter?: (value: string) => void;
  employeeOnlineFilter?: string;
  setEmployeeOnlineFilter?: (value: string) => void;
  employeeSortBy: string;
  setEmployeeSortBy: (value: string) => void;
  employeeSortOrder: string;
  setEmployeeSortOrder: (value: string) => void;
  employeeSearchTerm: string;
  setEmployeeSearchTerm: (value: string) => void;
  showAddUserForm: boolean;
  setShowAddUserForm: (value: boolean) => void;
  newUserData: NewUserData;
  setNewUserData: (data: NewUserData) => void;
  getFilteredAndSortedEmployees: () => Employee[];
  clearEmployeeFilters: () => void;
  toggleUserStatus: (userId: string, statusType: 'active' | 'vacation' | 'sick' | 'other') => Promise<void>;
  handleAddUser: (e: React.FormEvent) => void;
  updateEmployee?: (employeeId: string, updates: Partial<Employee>) => void;
  currentUser?: { id: string; email: string; };
  onSoftDeleteEmployee?: (employee: Employee) => void;
  onHardDeleteEmployee?: (employee: Employee) => void;
  onTerminateEmployee?: (employee: Employee) => void;
  onRehireEmployee?: (employee: Employee) => void;
  loadingEmployeeOperations?: Record<string, boolean>;
}

const AdminEmployees: React.FC<AdminEmployeesProps> = ({
  employees,
  employeeRoleFilter,
  setEmployeeRoleFilter,
  employeeStatusFilter,
  setEmployeeStatusFilter,
  employeeDepartmentFilter,
  setEmployeeDepartmentFilter,
  employeeOnlineFilter,
  setEmployeeOnlineFilter,
  employeeSortBy,
  setEmployeeSortBy,
  employeeSortOrder,
  setEmployeeSortOrder,
  employeeSearchTerm,
  setEmployeeSearchTerm,
  showAddUserForm,
  setShowAddUserForm,
  newUserData,
  setNewUserData,
  getFilteredAndSortedEmployees,
  clearEmployeeFilters,
  toggleUserStatus,
  handleAddUser,
  updateEmployee,
  currentUser,
  onSoftDeleteEmployee,
  onHardDeleteEmployee,
  onTerminateEmployee,
  onRehireEmployee,
  loadingEmployeeOperations = {}
}) => {
  const { theme } = useTheme();
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null);
  const [showEditForm, setShowEditForm] = React.useState(false);
  const [viewingEmployee, setViewingEmployee] = React.useState<Employee | null>(null);
  const [showViewForm, setShowViewForm] = React.useState(false);
  const [imageLoadErrors, setImageLoadErrors] = React.useState<Set<string>>(new Set());
  const [showPhotoModal, setShowPhotoModal] = React.useState(false);
  const [selectedPhoto, setSelectedPhoto] = React.useState<{ src: string; alt: string; employee: Employee } | null>(null);
  const [availableRoles, setAvailableRoles] = React.useState<Role[]>([]);

  // Scroll indicators state
  const [scrollState, setScrollState] = React.useState({
    canScrollUp: false,
    canScrollDown: false,
    isNearTop: true,
    isNearBottom: false
  });

  // Header measurement
  const headerRef = React.useRef<HTMLTableSectionElement>(null);
  const [headerHeight, setHeaderHeight] = React.useState(64); // fallback value

  // Measure header height
  useEffect(() => {
    if (headerRef.current) {
      const height = headerRef.current.offsetHeight;
      setHeaderHeight(height);
    }
  }, [employees]); // Recalculate when data changes

  // Handle scroll events for fade indicators
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;
    const threshold = 10; // pixels

    const canScrollUp = scrollTop > threshold;
    const canScrollDown = scrollTop < scrollHeight - clientHeight - threshold;
    const isNearTop = scrollTop <= threshold;
    const isNearBottom = scrollTop >= scrollHeight - clientHeight - threshold;

    setScrollState({
      canScrollUp,
      canScrollDown,
      isNearTop,
      isNearBottom
    });
  };

  // Handle ESC key to close view modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showViewForm) {
        setShowViewForm(false);
      }
    };

    if (showViewForm) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showViewForm]);

  // Fetch available roles on component mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const roles = await adminService.getRoles();
        setAvailableRoles(roles);
      } catch (error) {
        console.error('Error fetching roles:', error);
      }
    };

    fetchRoles();
  }, []);

  // Helper function to handle column sorting
  const handleSort = (column: string) => {
    if (employeeSortBy === column) {
      // If already sorting by this column, toggle direction
      setEmployeeSortOrder(employeeSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new column, default to ascending
      setEmployeeSortBy(column);
      setEmployeeSortOrder('asc');
    }
  };

  // Helper function to get sort indicator
  const getSortIndicator = (column: string) => {
    if (employeeSortBy === column) {
      return employeeSortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕'; // Show bidirectional arrow when not actively sorted
  };

  const handleEditEmployee = (employee: Employee) => {
    // Ensure photo positioning defaults are set if not present
    const employeeWithDefaults = {
      ...employee,
      photoPositionX: employee.photoPositionX ?? 50,
      photoPositionY: employee.photoPositionY ?? 50,
      photoScale: employee.photoScale ?? 100
    };

    console.log('=== SETTING EDITING EMPLOYEE ===');
    console.log('Original employee photo data:', {
      photoPositionX: employee.photoPositionX,
      photoPositionY: employee.photoPositionY,
      photoScale: employee.photoScale
    });
    console.log('Employee with defaults:', {
      photoPositionX: employeeWithDefaults.photoPositionX,
      photoPositionY: employeeWithDefaults.photoPositionY,
      photoScale: employeeWithDefaults.photoScale
    });

    setEditingEmployee(employeeWithDefaults);
    setShowEditForm(true);
  };

  const handleViewEmployee = (employee: Employee) => {
    setViewingEmployee({ ...employee });
    setShowViewForm(true);
  };

  const handleUpdateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || !updateEmployee) return;

    // Get the original employee from the employees list for comparison
    const originalEmployee = employees.find(emp => emp.id === editingEmployee.id);
    if (!originalEmployee) {
      console.error('Original employee not found for comparison');
      return;
    }

    console.log('=== UPDATING EMPLOYEE ===');
    console.log('Employee ID:', editingEmployee.id);

    // Calculate only the changed fields
    const changes: Partial<Employee> = {};

    // Compare each field and only include changed ones
    if (editingEmployee.firstName !== originalEmployee.firstName) {
      changes.firstName = editingEmployee.firstName;
    }
    if (editingEmployee.lastName !== originalEmployee.lastName) {
      changes.lastName = editingEmployee.lastName;
    }
    if (editingEmployee.middleInitial !== originalEmployee.middleInitial) {
      changes.middleInitial = editingEmployee.middleInitial;
    }
    if (editingEmployee.preferredName !== originalEmployee.preferredName) {
      changes.preferredName = editingEmployee.preferredName;
    }
    if (editingEmployee.pronouns !== originalEmployee.pronouns) {
      changes.pronouns = editingEmployee.pronouns;
    }
    if (editingEmployee.phone !== originalEmployee.phone) {
      changes.phone = editingEmployee.phone;
    }
    if (editingEmployee.employeeNumber !== originalEmployee.employeeNumber) {
      changes.employeeNumber = editingEmployee.employeeNumber;
    }
    if (editingEmployee.jobTitle !== originalEmployee.jobTitle) {
      changes.jobTitle = editingEmployee.jobTitle;
    }
    if (editingEmployee.hireDate !== originalEmployee.hireDate) {
      changes.hireDate = editingEmployee.hireDate;
    }
    if (editingEmployee.employeeStatus !== originalEmployee.employeeStatus) {
      changes.employeeStatus = editingEmployee.employeeStatus;
    }
    if (editingEmployee.terminationDate !== originalEmployee.terminationDate) {
      changes.terminationDate = editingEmployee.terminationDate;
    }
    if (editingEmployee.isActive !== originalEmployee.isActive) {
      changes.isActive = editingEmployee.isActive;
    }
    if (editingEmployee.isOnVacation !== originalEmployee.isOnVacation) {
      changes.isOnVacation = editingEmployee.isOnVacation;
    }
    if (editingEmployee.isOutSick !== originalEmployee.isOutSick) {
      changes.isOutSick = editingEmployee.isOutSick;
    }
    if (editingEmployee.isOnOtherLeave !== originalEmployee.isOnOtherLeave) {
      changes.isOnOtherLeave = editingEmployee.isOnOtherLeave;
    }
    if (editingEmployee.photo !== originalEmployee.photo) {
      changes.photo = editingEmployee.photo;
    }
    if (editingEmployee.photoPositionX !== originalEmployee.photoPositionX) {
      changes.photoPositionX = editingEmployee.photoPositionX;
    }
    if (editingEmployee.photoPositionY !== originalEmployee.photoPositionY) {
      changes.photoPositionY = editingEmployee.photoPositionY;
    }
    if (editingEmployee.photoScale !== originalEmployee.photoScale) {
      changes.photoScale = editingEmployee.photoScale;
    }
    if (editingEmployee.photoBackgroundColor !== originalEmployee.photoBackgroundColor) {
      changes.photoBackgroundColor = editingEmployee.photoBackgroundColor;
    }

    // Compare roles arrays
    const originalRoles = JSON.stringify(originalEmployee.roles || []);
    const currentRoles = JSON.stringify(editingEmployee.roles || []);
    if (originalRoles !== currentRoles) {
      changes.roles = editingEmployee.roles;
    }

    // Compare department
    if (JSON.stringify(editingEmployee.department) !== JSON.stringify(originalEmployee.department)) {
      changes.department = editingEmployee.department;
    }

    // Compare address
    if (JSON.stringify(editingEmployee.address) !== JSON.stringify(originalEmployee.address)) {
      changes.address = editingEmployee.address;
    }

    // Compare emergency contact
    if (JSON.stringify(editingEmployee.emergencyContact) !== JSON.stringify(originalEmployee.emergencyContact)) {
      changes.emergencyContact = editingEmployee.emergencyContact;
    }

    console.log('=== PARTIAL UPDATE COMPARISON ===');
    console.log('Original employee data (selected fields):', {
      firstName: originalEmployee.firstName,
      lastName: originalEmployee.lastName,
      photo: originalEmployee.photo,
      photoPositionX: originalEmployee.photoPositionX,
      photoPositionY: originalEmployee.photoPositionY,
      photoScale: originalEmployee.photoScale,
      photoBackgroundColor: originalEmployee.photoBackgroundColor,
      department: originalEmployee.department,
      roles: originalEmployee.roles
    });
    console.log('Current employee data (selected fields):', {
      firstName: editingEmployee.firstName,
      lastName: editingEmployee.lastName,
      photo: editingEmployee.photo,
      photoPositionX: editingEmployee.photoPositionX,
      photoPositionY: editingEmployee.photoPositionY,
      photoScale: editingEmployee.photoScale,
      photoBackgroundColor: editingEmployee.photoBackgroundColor,
      department: editingEmployee.department,
      roles: editingEmployee.roles
    });
    console.log('Changes to send (partial update):', changes);
    console.log('Number of fields changed:', Object.keys(changes).length);

    // Only submit if there are actual changes
    if (Object.keys(changes).length === 0) {
      console.log('No changes detected, closing modal without API call');
      setShowEditForm(false);
      setEditingEmployee(null);
      return;
    }

    updateEmployee(editingEmployee.id, changes);
    setShowEditForm(false);
    setEditingEmployee(null);
  };

  const handlePhotoClick = (photoSrc: string, employeeName: string, employee: Employee) => {
    setSelectedPhoto({
      src: photoSrc,
      alt: `${employeeName} - Full Size Photo`,
      employee: employee
    });
    setShowPhotoModal(true);
  };
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Employee Management</h1>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowAddUserForm(true)}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themeClasses.button.primary}`}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Employee
          </button>
        </div>
      </div>

      {/* Edit Employee Form Modal */}
      <EditEmployeeModal
        showEditForm={showEditForm}
        editingEmployee={editingEmployee}
        availableRoles={availableRoles}
        onClose={() => setShowEditForm(false)}
        onSubmit={handleUpdateEmployee}
        onEmployeeChange={setEditingEmployee}
      />

      {/* View Employee Card Modal */}
      <ViewEmployeeModal
        showViewForm={showViewForm}
        viewingEmployee={viewingEmployee}
        employees={employees}
        imageLoadErrors={imageLoadErrors}
        availableRoles={availableRoles}
        onClose={() => setShowViewForm(false)}
        onViewEmployee={setViewingEmployee}
        onImageLoadError={(employeeId) => setImageLoadErrors(prev => new Set([...prev, employeeId]))}
      />

      {/* Add User Form Modal */}
      <AddUserModal
        showAddUserForm={showAddUserForm}
        newUserData={newUserData}
        onClose={() => setShowAddUserForm(false)}
        onSubmit={handleAddUser}
        onUserDataChange={setNewUserData}
      />

      {/* Photo Modal */}
      {showPhotoModal && selectedPhoto && (
        <div
          className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50`}
          onClick={() => {
            setShowPhotoModal(false);
            setSelectedPhoto(null);
          }}
        >
          <div className={`relative max-w-4xl max-h-screen p-4 ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary}`}>
            <button
              onClick={() => {
                setShowPhotoModal(false);
                setSelectedPhoto(null);
              }}
              className={`absolute top-2 right-2 ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 z-10 transition-colors border ${themeClasses.border.primary}`}
            >
              <X className="w-6 h-6" />
            </button>

            {/* Large Photo Display with Same Transform Logic */}
            <div
              className="relative w-96 h-96 rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-50"
              style={{ backgroundColor: selectedPhoto.employee.photoBackgroundColor || '#f9fafb' }}
            >
              <img
                src={selectedPhoto.src}
                alt={selectedPhoto.alt}
                className="w-full h-full object-cover"
                style={{
                  transform: `scale(${(selectedPhoto.employee.photoScale || 100) / 100})`,
                  transformOrigin: `${selectedPhoto.employee.photoPositionX || 50}% ${selectedPhoto.employee.photoPositionY || 50}%`
                }}
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            {/* Employee Info */}
            <div className={`mt-4 text-center ${themeClasses.text.primary}`}>
              <h3 className="text-lg font-medium">{formatEmployeeDisplayName(selectedPhoto.employee)}</h3>
              {selectedPhoto.employee.jobTitle && (
                <p className={`text-sm ${themeClasses.text.secondary}`}>{selectedPhoto.employee.jobTitle}</p>
              )}
              {selectedPhoto.employee.department && (
                <p className={`text-sm ${themeClasses.text.secondary}`}>{getDepartmentDisplayName(selectedPhoto.employee.department)}</p>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>Filtered Results</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{getFilteredAndSortedEmployees().length}</div>
          <div className={`text-xs ${themeClasses.text.muted}`}>of {employees.length} total</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>Active Employees</div>
          <div
            className="text-2xl font-bold"
            style={{ color: applyDarkModeMuting('#059669', theme === 'dark') }}
          >
            {employees.filter(u => u.isActive && !u.isOnVacation && !u.isOutSick && !u.isOnOtherLeave).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>Inactive</div>
          <div
            className="text-2xl font-bold"
            style={{ color: applyDarkModeMuting('#dc2626', theme === 'dark') }}
          >
            {employees.filter(u => !u.isActive).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>On Vacation</div>
          <div
            className="text-2xl font-bold"
            style={{ color: applyDarkModeMuting('#ea580c', theme === 'dark') }}
          >
            {employees.filter(u => u.isOnVacation).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>Out Sick</div>
          <div
            className="text-2xl font-bold"
            style={{ color: applyDarkModeMuting('#ef4444', theme === 'dark') }}
          >
            {employees.filter(u => u.isOutSick).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>Other Leave</div>
          <div
            className="text-2xl font-bold"
            style={{ color: applyDarkModeMuting('#9333ea', theme === 'dark') }}
          >
            {employees.filter(u => u.isOnOtherLeave).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>Logged In</div>
          <div
            className="text-2xl font-bold"
            style={{ color: applyDarkModeMuting('#2563eb', theme === 'dark') }}
          >
            {employees.filter(u => u.isLoggedIn).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.tertiary}`}>Not Logged In</div>
          <div className="text-2xl font-bold text-gray-600">
            {employees.filter(u => !u.isLoggedIn).length}
          </div>
        </div>
      </div>

      {/* Employee Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4`}>Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>Search</label>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${themeClasses.text.muted}`} />
              <input
                type="text"
                placeholder="Search employees..."
                value={employeeSearchTerm}
                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                className={`pl-10 w-full rounded-md shadow-sm ${themeClasses.input}`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>Department</label>
            <select
              className={`w-full rounded-md ${themeClasses.input}`}
              value={employeeDepartmentFilter || 'all'}
              onChange={(e) => setEmployeeDepartmentFilter && setEmployeeDepartmentFilter(e.target.value)}
            >
              <option value="all">All Departments</option>
              <option value="administration">Administration</option>
              <option value="technical">Technical</option>
              <option value="customer_service">Customer Service</option>
              <option value="management">Management</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>Role</label>
            <select
              className={`w-full rounded-md ${themeClasses.input}`}
              value={employeeRoleFilter}
              onChange={(e) => setEmployeeRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="sales">Sales</option>
              <option value="technician">Technician</option>
            </select>
          </div>

          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>Status</label>
            <select
              className={`w-full rounded-md ${themeClasses.input}`}
              value={employeeStatusFilter}
              onChange={(e) => setEmployeeStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="vacation">On Vacation</option>
              <option value="sick">Out Sick</option>
              <option value="other">Other Leave</option>
              <option value="available">Available</option>
            </select>
          </div>

          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>Online Status</label>
            <div className="flex items-center justify-between">
              <select
                className={`w-full rounded-md ${themeClasses.input}`}
                value={employeeOnlineFilter || 'all'}
                onChange={(e) => setEmployeeOnlineFilter && setEmployeeOnlineFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            onClick={clearEmployeeFilters}
          >
            <X className="w-4 h-4 mr-2" />
            Clear All Filters
          </button>
        </div>
      </div>

      {/* Employees Table */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden relative border ${themeClasses.border.primary}`}>
        <div className="flex flex-col relative" style={{ height: 'calc(100vh - 370px)' }}> {/* Dynamic height container */}

          {/* Top fade gradient - positioned exactly at the bottom edge of sticky header */}
          {scrollState.canScrollUp && (
            <div
              className="absolute left-0 right-0 h-6 bg-gradient-to-b from-white/90 to-transparent dark:from-gray-800/90 dark:to-transparent pointer-events-none z-20"
              style={{ top: `${headerHeight - 1}px` }}
            />
          )}

          {/* Bottom fade gradient - positioned relative to the container, not scrollable content */}
          {scrollState.canScrollDown && (
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white/90 to-transparent dark:from-gray-800/90 dark:to-transparent pointer-events-none z-20" />
          )}

          {/* Scroll indicators - positioned just below the fade gradient */}
          {scrollState.canScrollUp && (
            <div
              className="absolute right-4 z-30 flex items-center space-x-1 text-gray-500 dark:text-gray-400 text-xs pointer-events-none"
              style={{ top: `${headerHeight + 4}px` }}
            >
              <ChevronUp className="w-3 h-3 animate-bounce" />
              <span className="font-medium">More above</span>
            </div>
          )}

          {scrollState.canScrollDown && (
            <div className="absolute bottom-1 right-4 z-30 flex items-center space-x-1 text-gray-500 dark:text-gray-400 text-xs pointer-events-none">
              <ChevronDown className="w-3 h-3 animate-bounce" />
              <span className="font-medium">More below</span>
            </div>
          )}

          <div
            className="overflow-y-auto flex-1"
            onScroll={handleScroll}
          > {/* Scrollable table container */}
            <table className={`w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed min-w-0 border-collapse border-b ${themeClasses.border.primary}`}>
              <thead ref={headerRef} className={`${themeClasses.bg.secondary} sticky top-0 z-10`}>
                <tr>
                  <th className={`w-1/5 px-3 py-2 text-left text-xs font-medium border-l border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('name')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Employee
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('name')}</span>
                    </button>
                  </th>
                  <th className={`w-16 px-2 py-2 text-left text-xs font-medium border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('employeeNumber')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Emp#
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('employeeNumber')}</span>
                    </button>
                  </th>
                  <th className={`w-20 px-2 py-2 text-left text-xs font-medium ${themeClasses.border.primary} border-r`}>
                    <button
                      onClick={() => handleSort('department')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Dept
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('department')}</span>
                    </button>
                  </th>
                  <th className={`w-20 px-2 py-2 text-left text-xs font-medium ${themeClasses.border.primary} border-r`}>
                    <button
                      onClick={() => handleSort('role')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Role(s)
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('role')}</span>
                    </button>
                  </th>
                  <th className={`w-24 px-2 py-2 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider ${themeClasses.border.primary} border-r`}>Employment</th>
                  <th className={`w-24 px-2 py-2 text-left text-xs font-medium border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('status')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Status
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('status')}</span>
                    </button>
                  </th>
                  <th className={`w-20 px-2 py-2 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider ${themeClasses.border.primary} border-r`}>Online</th>
                  <th className={`w-24 px-2 py-2 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider ${themeClasses.border.primary} border-r`}>Controls</th>
                  <th className={`w-20 px-2 py-2 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>Actions</th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {getFilteredAndSortedEmployees().map((user) => (
                  <tr
                    key={user.id}
                    className={user.softDelete ? 'opacity-60 bg-gray-50 dark:bg-gray-800' : ''}
                  >
                    <td className={`px-3 py-2 pr-4 border-l border-r ${themeClasses.border.primary}`}>
                      <div className="flex items-center">
                        <div className="h-8 w-8 flex-shrink-0">
                          {user.photo && !imageLoadErrors.has(user.id) ? (
                            <div
                              className="relative h-8 w-8 rounded-full overflow-hidden border-2 border-gray-300 cursor-pointer hover:border-blue-400 transition-colors"
                              style={{ backgroundColor: user.photoBackgroundColor || 'transparent' }}
                              onClick={() => handlePhotoClick(user.photo!, `${user.firstName} ${user.lastName}`, user)}
                            >
                              <img
                                src={user.photo}
                                alt={`${user.firstName} ${user.lastName}`}
                                className="w-full h-full object-cover"
                                style={{
                                  transform: `scale(${(user.photoScale || 100) / 100})`,
                                  transformOrigin: `${user.photoPositionX || 50}% ${user.photoPositionY || 50}%`
                                }}
                                onError={() => {
                                  // Mark this image as failed and re-render
                                  setImageLoadErrors(prev => new Set([...prev, user.id]));
                                }}
                              />
                            </div>
                          ) : (
                            <div className={`h-8 w-8 rounded-full ${themeClasses.bg.secondary} flex items-center justify-center`}>
                              <span className={`text-xs font-medium ${themeClasses.text.primary}`}>
                                {user.firstName?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-2 min-w-0 flex-1">
                          <div className={`text-sm font-medium ${themeClasses.text.primary} break-words`}>
                            {formatEmployeeDisplayName(user)}
                            {user.pronouns && (
                              <span className={`ml-2 text-xs ${themeClasses.text.muted} font-normal`}>({user.pronouns})</span>
                            )}
                          </div>
                          <div className={`text-sm ${themeClasses.text.secondary} break-words`}>{user.email}</div>
                          {user.jobTitle && (
                            <div className={`text-xs ${themeClasses.text.muted} break-words`}>{user.jobTitle}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Employee Number Column */}
                    <td className={`px-2 py-2 pr-4 border-r ${themeClasses.border.primary}`}>
                      {user.employeeNumber ? (
                        <span className={`text-xs font-mono ${themeClasses.text.primary}`}>{user.employeeNumber}</span>
                      ) : (
                        <span className={`text-xs ${themeClasses.text.muted}`}>-</span>
                      )}
                    </td>
                    {/* Department Column */}
                    <td className={`px-2 py-2 pr-4 border-r ${themeClasses.border.primary}`}>
                      {user.department ? (
                        <span className={`text-xs ${themeClasses.text.secondary} break-words`}>{getDepartmentDisplayName(user.department)}</span>
                      ) : (
                        <span className={`text-xs ${themeClasses.text.muted}`}>-</span>
                      )}
                    </td>
                    <td className={`px-2 py-2 pr-4 border-r ${themeClasses.border.primary}`}>
                      <div className="flex flex-wrap gap-1">
                        {user.roles && user.roles.length > 0 ? (
                          user.roles.map(role => {
                            const styles = getRoleStyles(role, availableRoles, theme === 'dark');
                            return (
                              <span
                                key={role}
                                className="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                                style={styles}
                              >
                                {role}
                              </span>
                            );
                          })
                        ) : (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${themeClasses.bg.secondary} ${themeClasses.text.primary}`}>
                            No roles assigned
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 py-2 pr-4 border-r ${themeClasses.border.primary}`}>
                      <div className="space-y-1">
                        {user.hireDate && (
                          <div className="flex items-center">
                            <Calendar className={`w-3 h-3 mr-1 ${themeClasses.text.muted}`} />
                            <span className={`text-xs ${themeClasses.text.secondary}`}>
                              Hired {user.hireDate}
                            </span>
                          </div>
                        )}
                        {user.employeeStatus && (
                          <div className="flex items-center">
                            <User className={`w-3 h-3 mr-1 ${themeClasses.text.muted}`} />
                            <span
                              className="text-xs font-medium"
                              style={{ color: getEmployeeStatusTextColor(user.employeeStatus, theme === 'dark') }}
                            >
                              {user.employeeStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                        )}
                        {!user.hireDate && !user.employeeStatus && (
                          <span className={`text-xs ${themeClasses.text.muted}`}>No employment data</span>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 py-2 pr-4 border-r ${themeClasses.border.primary}`}>
                      <span
                        className="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                        style={getEmployeeStatusStyles(user, theme === 'dark')}
                      >
                        {!user.isActive ? 'Inactive' :
                         user.isOutSick ? 'Out Sick' :
                         user.isOnVacation ? 'On Vacation' :
                         user.isOnOtherLeave ? 'Other Leave' :
                         'Active'}
                      </span>
                    </td>
                    <td className={`px-2 py-2 pr-4 border-r ${themeClasses.border.primary}`}>
                      <div className="flex items-center justify-center">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: user.isLoggedIn ?
                              applyDarkModeMuting('#10b981', theme === 'dark') :
                              applyDarkModeMuting('#ef4444', theme === 'dark')
                          }}
                          title={user.isLoggedIn ?
                            (user.isRecentlyActive ? 'Online' : 'Logged In') :
                            'Offline'
                          }
                        ></div>
                        {user.isLoggedIn && user.activeSessions && user.activeSessions > 1 && (
                          <span className={`text-xs ${themeClasses.text.accent} ml-1`} title={`${user.activeSessions} active sessions`}>
                            {user.activeSessions}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 py-2 pr-4 border-r ${themeClasses.border.primary}`}>
                      <div className="flex flex-wrap items-center gap-1 mr-2">
                        {/* Active/Inactive Toggle */}
                        <button
                          onClick={() => toggleUserStatus(user.id, 'active')}
                          className={`p-1 rounded ${user.isActive ? '' : `${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}`}
                          style={{
                            color: user.isActive ?
                              applyDarkModeMuting('#059669', theme === 'dark') :
                              undefined
                          }}
                          onMouseEnter={(e) => {
                            if (user.isActive) {
                              e.currentTarget.style.color = applyDarkModeMuting('#065f46', theme === 'dark');
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (user.isActive) {
                              e.currentTarget.style.color = applyDarkModeMuting('#059669', theme === 'dark');
                            }
                          }}
                          title={user.isActive ? 'Deactivate User' : 'Activate User'}
                        >
                          {user.isActive ? (
                            <ToggleRight className="w-5 h-5" />
                          ) : (
                            <ToggleLeft className="w-5 h-5" />
                          )}
                        </button>

                        {/* Vacation Toggle (only for employees) */}
                        {user.userType === 'employee' && user.isActive && (
                          <button
                            onClick={() => toggleUserStatus(user.id, 'vacation')}
                            className={`p-1 rounded ${user.isOnVacation ? '' : `${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}`}
                            style={{
                              color: user.isOnVacation ?
                                applyDarkModeMuting('#ea580c', theme === 'dark') :
                                undefined
                            }}
                            onMouseEnter={(e) => {
                              if (user.isOnVacation) {
                                e.currentTarget.style.color = applyDarkModeMuting('#c2410c', theme === 'dark');
                              } else {
                                e.currentTarget.style.color = applyDarkModeMuting('#ea580c', theme === 'dark');
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (user.isOnVacation) {
                                e.currentTarget.style.color = applyDarkModeMuting('#ea580c', theme === 'dark');
                              } else {
                                e.currentTarget.style.color = '';
                              }
                            }}
                            title={user.isOnVacation ? 'Return from Vacation' : 'Set On Vacation'}
                          >
                            <Plane className="w-4 h-4" />
                          </button>
                        )}

                        {/* Sick Toggle (only for employees) */}
                        {user.userType === 'employee' && user.isActive && (
                          <button
                            onClick={() => toggleUserStatus(user.id, 'sick')}
                            className={`p-1 rounded ${user.isOutSick ? '' : `${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}`}
                            style={{
                              color: user.isOutSick ?
                                applyDarkModeMuting('#dc2626', theme === 'dark') :
                                undefined
                            }}
                            onMouseEnter={(e) => {
                              if (user.isOutSick) {
                                e.currentTarget.style.color = applyDarkModeMuting('#b91c1c', theme === 'dark');
                              } else {
                                e.currentTarget.style.color = applyDarkModeMuting('#dc2626', theme === 'dark');
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (user.isOutSick) {
                                e.currentTarget.style.color = applyDarkModeMuting('#dc2626', theme === 'dark');
                              } else {
                                e.currentTarget.style.color = '';
                              }
                            }}
                            title={user.isOutSick ? 'Return from Sick Leave' : 'Set Out Sick'}
                          >
                            <Heart className="w-4 h-4" />
                          </button>
                        )}

                        {/* Other Leave Toggle (only for employees) */}
                        {user.userType === 'employee' && user.isActive && (
                          <button
                            onClick={() => toggleUserStatus(user.id, 'other')}
                            className={`p-1 rounded ${user.isOnOtherLeave ? '' : `${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}`}
                            style={{
                              color: user.isOnOtherLeave ?
                                applyDarkModeMuting('#9333ea', theme === 'dark') :
                                undefined
                            }}
                            onMouseEnter={(e) => {
                              if (user.isOnOtherLeave) {
                                e.currentTarget.style.color = applyDarkModeMuting('#7c3aed', theme === 'dark');
                              } else {
                                e.currentTarget.style.color = applyDarkModeMuting('#9333ea', theme === 'dark');
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (user.isOnOtherLeave) {
                                e.currentTarget.style.color = applyDarkModeMuting('#9333ea', theme === 'dark');
                              } else {
                                e.currentTarget.style.color = '';
                              }
                            }}
                            title={user.isOnOtherLeave ? 'Return from Other Leave' : 'Set Other Leave'}
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 py-2 pr-4 text-sm font-medium border-r ${themeClasses.border.primary}`}>
                      <button
                        onClick={() => handleViewEmployee(user)}
                        className="text-green-600 hover:text-green-900 mr-3"
                        title="View employee"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditEmployee(user)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                        title="Edit employee"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {/* Only show delete buttons if this is not the current user */}
                      {currentUser && currentUser.id !== user.id && (
                        <>
                          {/* Soft Delete/Restore Button */}
                          <button
                            onClick={() => {
                              console.log('🖱️ Soft delete button clicked for:', user.employeeNumber, user.firstName, user.lastName);
                              console.log('Current user.softDelete:', user.softDelete);
                              console.log('Full user object:', user);
                              onSoftDeleteEmployee?.(user);
                            }}
                            disabled={loadingEmployeeOperations?.[user.id]}
                            className={`mr-2 ${user.softDelete ? 'text-green-600 hover:text-green-900' : 'text-orange-600 hover:text-orange-900'} disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={user.softDelete ? "Restore employee" : "Soft delete employee"}
                          >
                            {loadingEmployeeOperations?.[user.id] ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : user.softDelete ? (
                              <Undo2 className="w-4 h-4" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                          {/* Hard Delete Button */}
                          <button
                            onClick={() => onHardDeleteEmployee?.(user)}
                            disabled={loadingEmployeeOperations?.[user.id]}
                            className="text-red-600 hover:text-red-900 mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Permanently delete employee"
                          >
                            {loadingEmployeeOperations?.[user.id] ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                          {/* Terminate/Rehire Button */}
                          {user.employeeStatus === 'terminated' ? (
                            <button
                              onClick={() => onRehireEmployee?.(user)}
                              disabled={loadingEmployeeOperations?.[user.id]}
                              className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Rehire employee"
                            >
                              {loadingEmployeeOperations?.[user.id] ? (
                                <Loader className="w-4 h-4 animate-spin" />
                              ) : (
                                <UserCheck className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => onTerminateEmployee?.(user)}
                              disabled={loadingEmployeeOperations?.[user.id]}
                              className="text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Terminate employee"
                            >
                              {loadingEmployeeOperations?.[user.id] ? (
                                <Loader className="w-4 h-4 animate-spin" />
                              ) : (
                                <UserX className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminEmployees;