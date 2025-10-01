import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Plane,
  Heart,
  User,
  Building,
  Calendar,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { getDepartmentDisplayName } from '../../../utils/employeeUtils';
import { Role } from '../../../types/database';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { applyDarkModeMuting } from '../../../utils/colorUtils';

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

// Helper function to format phone number for display
const formatPhoneNumberDisplay = (phone: string): string => {
  if (!phone) return '';

  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');

  // Check if it's a 10-digit US phone number
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  // For other lengths, return as-is or with basic formatting
  return phone;
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

// Helper function to get online status styles with dark mode muting
const getOnlineStatusStyles = (isLoggedIn: boolean, isDarkMode: boolean) => {
  if (isLoggedIn) {
    return {
      backgroundColor: applyDarkModeMuting('#dcfce7', isDarkMode), // green-100
      color: applyDarkModeMuting('#166534', isDarkMode), // green-800
      dotColor: applyDarkModeMuting('#4ade80', isDarkMode) // green-400
    };
  } else {
    return {
      backgroundColor: applyDarkModeMuting('#f3f4f6', isDarkMode), // gray-100
      color: applyDarkModeMuting('#4b5563', isDarkMode), // gray-600
      dotColor: applyDarkModeMuting('#9ca3af', isDarkMode) // gray-400
    };
  }
};

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  middleInitial?: string;
  preferredName?: string;
  pronouns?: string;
  email: string;
  roles: string[];
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
  isLoggedIn?: boolean;
  activeSessions?: number;
  lastActivity?: string;
  isRecentlyActive?: boolean;
  address?: {
    street: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  employeeNumber?: string;
  hireDate?: string;
  department?: string;
  jobTitle?: string;
  managerId?: string;
  employeeStatus?: string;
  terminationDate?: string;
  emergencyContact?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface ViewEmployeeModalProps {
  showViewForm: boolean;
  viewingEmployee: Employee | null;
  employees: Employee[];
  imageLoadErrors: Set<string>;
  availableRoles: Role[];
  onClose: () => void;
  onViewEmployee: (employee: Employee) => void;
  onImageLoadError: (employeeId: string) => void;
}

const ViewEmployeeModal: React.FC<ViewEmployeeModalProps> = ({
  showViewForm,
  viewingEmployee,
  employees,
  imageLoadErrors,
  availableRoles,
  onClose,
  onViewEmployee,
  onImageLoadError
}) => {
  const { theme } = useTheme();
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false
  });

  // Check scroll position and update indicators
  const handleScroll = () => {
    if (!scrollableRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
    const threshold = 5; // Smaller threshold for more sensitive detection

    const canScrollUp = scrollTop > threshold;
    const canScrollDown = scrollTop < scrollHeight - clientHeight - threshold;

    // Debug logging (can be removed later if needed)
    // console.log('Scroll debug:', { scrollTop, scrollHeight, clientHeight, canScrollUp, canScrollDown });

    setScrollState({
      canScrollUp,
      canScrollDown
    });
  };

  // Set up scroll listener and initial check
  useEffect(() => {
    const scrollElement = scrollableRef.current;
    if (!scrollElement) return;

    // Initial check with small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      handleScroll();
    }, 100);

    // Add scroll listener
    scrollElement.addEventListener('scroll', handleScroll);

    return () => {
      clearTimeout(timer);
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [showViewForm, viewingEmployee]);

  if (!showViewForm || !viewingEmployee) {
    return null;
  }

  return (
    <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center p-4 z-50`}>
      <div className={`w-full max-w-2xl border shadow-lg rounded-lg ${themeClasses.bg.modal} max-h-[90vh] flex flex-col`}>
        {/* Fixed Header */}
        <div className={`${themeClasses.bg.secondary} rounded-t-lg p-4 flex-shrink-0 relative`}>
          {/* Close button */}
          <div className="absolute top-4 right-4">
            <button
              onClick={onClose}
              className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} transition-colors`}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Employee Header Info */}
          <div className="flex items-start space-x-4 pr-12">
            {/* Photo Section */}
            <div className="flex-shrink-0">
              {viewingEmployee.photo && !imageLoadErrors.has(viewingEmployee.id) ? (
                <div
                  className={`h-24 w-24 rounded-full overflow-hidden border-4 ${themeClasses.border.primary} shadow-lg`}
                  style={{ backgroundColor: viewingEmployee.photoBackgroundColor || '#f9fafb' }}
                >
                  <img
                    src={viewingEmployee.photo}
                    alt={`${viewingEmployee.firstName} ${viewingEmployee.lastName}`}
                    className="w-full h-full object-cover"
                    style={{
                      transform: `scale(${(viewingEmployee.photoScale || 100) / 100})`,
                      transformOrigin: `${viewingEmployee.photoPositionX || 50}% ${viewingEmployee.photoPositionY || 50}%`
                    }}
                    onError={() => onImageLoadError(viewingEmployee.id)}
                  />
                </div>
              ) : (
                <div className={`h-24 w-24 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center border-4 ${themeClasses.border.primary} shadow-lg`}>
                  <span className="text-2xl font-bold text-white">
                    {viewingEmployee.firstName?.charAt(0).toUpperCase() || 'U'}
                    {viewingEmployee.lastName?.charAt(0).toUpperCase() || ''}
                  </span>
                </div>
              )}
            </div>

            {/* Main Info Section */}
            <div className="flex-1 min-w-0">
              {/* Name and Pronouns */}
              <div className="mb-1">
                <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                  {formatEmployeeDisplayName(viewingEmployee)}
                </h2>
                {viewingEmployee.pronouns && (
                  <p className={`text-sm ${themeClasses.text.secondary} mt-0.5`}>({viewingEmployee.pronouns})</p>
                )}
              </div>

              {/* Title */}
              <div className="mb-2">
                <p className={`text-lg font-medium ${themeClasses.text.secondary}`}>
                  {viewingEmployee.jobTitle || 'No title assigned'}
                </p>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {/* Online/Login Status */}
                <span
                  className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                  style={getOnlineStatusStyles(viewingEmployee.isLoggedIn || false, theme === 'dark')}
                >
                  <div
                    className="w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: getOnlineStatusStyles(viewingEmployee.isLoggedIn || false, theme === 'dark').dotColor }}
                  ></div>
                  {viewingEmployee.isLoggedIn ? 'Online' : 'Offline'}
                </span>

                {/* Active Status */}
                <span
                  className="inline-flex px-2 py-1 text-xs font-medium rounded-full"
                  style={getEmployeeStatusStyles(viewingEmployee, theme === 'dark')}
                >
                  {viewingEmployee.isActive ? 'Active' : 'Inactive'}
                </span>

                {/* Leave Status */}
                {viewingEmployee.isOnVacation && (
                  <span
                    className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: applyDarkModeMuting('#fed7aa', theme === 'dark'), // orange-100
                      color: applyDarkModeMuting('#9a3412', theme === 'dark') // orange-800
                    }}
                  >
                    <Plane className="w-3 h-3 mr-1" />
                    On Vacation
                  </span>
                )}
                {viewingEmployee.isOutSick && (
                  <span
                    className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: applyDarkModeMuting('#fee2e2', theme === 'dark'), // red-100
                      color: applyDarkModeMuting('#991b1b', theme === 'dark') // red-800
                    }}
                  >
                    <Heart className="w-3 h-3 mr-1" />
                    Out Sick
                  </span>
                )}
                {viewingEmployee.isOnOtherLeave && (
                  <span
                    className="inline-flex px-2 py-1 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: applyDarkModeMuting('#e9d5ff', theme === 'dark'), // purple-100
                      color: applyDarkModeMuting('#6b21a8', theme === 'dark') // purple-800
                    }}
                  >
                    Other Leave
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area with indicators outside the scroll flow */}
        <div className="flex-1 relative overflow-hidden">
          {/* Scroll Up Indicator - Fixed to container viewport */}
          {scrollState.canScrollUp && (
            <div className={`absolute top-6 left-1/2 transform -translate-x-1/2 z-20
                           ${themeClasses.bg.secondary} ${themeClasses.border.primary}
                           border rounded-full p-1 shadow-lg opacity-80 hover:opacity-100
                           transition-opacity cursor-pointer animate-bounce pointer-events-auto`}
                 onClick={() => scrollableRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>
              <ChevronUp className={`w-4 h-4 ${themeClasses.text.primary}`} />
            </div>
          )}

          {/* Scroll Down Indicator - Fixed to container viewport */}
          {scrollState.canScrollDown && (
            <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20
                           ${themeClasses.bg.secondary} ${themeClasses.border.primary}
                           border rounded-full p-1 shadow-lg opacity-80 hover:opacity-100
                           transition-opacity cursor-pointer animate-bounce pointer-events-auto`}
                 onClick={() => scrollableRef.current?.scrollTo({
                   top: scrollableRef.current.scrollHeight, behavior: 'smooth'
                 })}>
              <ChevronDown className={`w-4 h-4 ${themeClasses.text.primary}`} />
            </div>
          )}

          <div ref={scrollableRef} className="absolute inset-0 overflow-y-auto p-4">
            {/* Information Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Contact Information */}
          <div className={`${themeClasses.bg.card} border ${themeClasses.border.primary} rounded-lg p-4`}>
            <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2 flex items-center`}>
              <User className={`w-5 h-5 mr-2 ${themeClasses.text.accent}`} />
              Contact Information
            </h3>
            <div className="space-y-1.5">
              <div>
                <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Email</label>
                <div className="mt-1">
                  <a
                    href={`mailto:${viewingEmployee.email}`}
                    className={`${themeClasses.text.accent} hover:${themeClasses.text.secondary} hover:underline transition-colors`}
                  >
                    {viewingEmployee.email}
                  </a>
                </div>
              </div>
              {viewingEmployee.phone && (
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Phone</label>
                  <div className="mt-1">
                    <a
                      href={`tel:${viewingEmployee.phone}`}
                      className={`${themeClasses.text.accent} hover:${themeClasses.text.secondary} hover:underline transition-colors`}
                    >
                      {formatPhoneNumberDisplay(viewingEmployee.phone)}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Employment Details */}
          <div className={`${themeClasses.bg.card} border ${themeClasses.border.primary} rounded-lg p-4`}>
            <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2 flex items-center`}>
              <Building className={`w-5 h-5 mr-2 ${themeClasses.text.accent}`} />
              Employment Details
            </h3>
            <div className="space-y-1.5">
              {viewingEmployee.employeeNumber && (
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Employee Number</label>
                  <div className={`mt-1 ${themeClasses.text.primary} font-mono`}>
                    #{viewingEmployee.employeeNumber}
                  </div>
                </div>
              )}
              <div>
                <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Role(s)</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {viewingEmployee.roles && viewingEmployee.roles.length > 0 ? (
                    viewingEmployee.roles.map(role => {
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
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${themeClasses.bg.secondary} ${themeClasses.text.primary}`}
                    >
                      No roles assigned
                    </span>
                  )}
                </div>
              </div>
              {viewingEmployee.hireDate && (
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Hire Date</label>
                  <div className="mt-1 flex items-center">
                    <Calendar className={`w-4 h-4 mr-1 ${themeClasses.text.muted}`} />
                    <span className={`${themeClasses.text.primary}`}>{viewingEmployee.hireDate}</span>
                  </div>
                </div>
              )}
              {viewingEmployee.department && (
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Department</label>
                  <div className={`mt-1 ${themeClasses.text.primary}`}>
                    {getDepartmentDisplayName(viewingEmployee.department)}
                  </div>
                </div>
              )}
              {viewingEmployee.managerId && (
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Manager</label>
                  <div className="mt-1">
                    <button
                      onClick={() => {
                        const manager = employees.find(emp => emp.id === viewingEmployee.managerId);
                        if (manager) {
                          onViewEmployee(manager);
                        }
                      }}
                      className={`${themeClasses.text.accent} hover:${themeClasses.text.secondary} hover:underline transition-colors cursor-pointer`}
                    >
                      {(() => {
                        const manager = employees.find(emp => emp.id === viewingEmployee.managerId);
                        return manager ? formatEmployeeDisplayName(manager) : 'Unknown Manager';
                      })()}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Emergency Contact */}
          {viewingEmployee.emergencyContact && (
            <div className={`${themeClasses.bg.card} border ${themeClasses.border.primary} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2 flex items-center`}>
                <User className={`w-5 h-5 mr-2`} style={{ color: applyDarkModeMuting('#dc2626', theme === 'dark') }} />
                Emergency Contact
              </h3>
              <div className="space-y-1.5">
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Name</label>
                  <div className={`mt-1 ${themeClasses.text.primary}`}>
                    {viewingEmployee.emergencyContact.firstName} {viewingEmployee.emergencyContact.lastName}
                  </div>
                </div>
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Relationship</label>
                  <div className={`mt-1 ${themeClasses.text.primary}`}>
                    {viewingEmployee.emergencyContact.relationship}
                  </div>
                </div>
                <div>
                  <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Phone</label>
                  <div className="mt-1">
                    <a
                      href={`tel:${viewingEmployee.emergencyContact.phone}`}
                      className={`${themeClasses.text.accent} hover:${themeClasses.text.secondary} hover:underline transition-colors`}
                    >
                      {formatPhoneNumberDisplay(viewingEmployee.emergencyContact.phone)}
                    </a>
                  </div>
                </div>
                {viewingEmployee.emergencyContact.email && (
                  <div>
                    <label className={`text-sm font-medium ${themeClasses.text.secondary}`}>Email</label>
                    <div className="mt-1">
                      <a
                        href={`mailto:${viewingEmployee.emergencyContact.email}`}
                        className={`${themeClasses.text.accent} hover:${themeClasses.text.secondary} hover:underline transition-colors`}
                      >
                        {viewingEmployee.emergencyContact.email}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Address */}
          {viewingEmployee.address && (
            <div className={`${themeClasses.bg.card} border ${themeClasses.border.primary} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2 flex items-center`}>
                <Building className={`w-5 h-5 mr-2`} style={{ color: applyDarkModeMuting('#059669', theme === 'dark') }} />
                Address
              </h3>
              <div className={`${themeClasses.text.primary}`}>
                <div>{viewingEmployee.address.street}</div>
                {viewingEmployee.address.street2 && <div>{viewingEmployee.address.street2}</div>}
                <div>{viewingEmployee.address.city}, {viewingEmployee.address.state} {viewingEmployee.address.zipCode}</div>
                <div>{viewingEmployee.address.country}</div>
              </div>
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewEmployeeModal;