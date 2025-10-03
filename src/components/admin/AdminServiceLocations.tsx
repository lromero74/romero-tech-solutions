import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Edit,
  Power,
  Trash2,
  X,
  Undo2,
  MapPin,
  Building2,
  Loader2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import LocationContacts from './LocationContacts';
import { usePermission } from '../../hooks/usePermission';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';

interface ServiceLocation {
  id: string;
  business_id: string;
  address_label: string;
  location_name?: string;
  location_type: string;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  contact_person?: string;
  contact_phone?: string;
  notes?: string;
  is_active: boolean;
  soft_delete: boolean;
  created_at: string;
  updated_at: string;
  business_name: string;
}

interface Business {
  id: string;
  businessName: string;
  contactEmail?: string;
  contactPhone?: string;
  industry?: string;
  locationCount: number;
  isActive: boolean;
  softDelete: boolean;
  createdAt: string;
  updatedAt: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

interface AdminServiceLocationsProps {
  serviceLocations: ServiceLocation[];
  businesses: Business[];
  onEditServiceLocation?: (serviceLocation: ServiceLocation) => void;
  onDeleteServiceLocation?: (serviceLocation: ServiceLocation) => void;
  onSoftDeleteServiceLocation?: (serviceLocation: ServiceLocation) => void;
  toggleServiceLocationStatus?: (locationId: string, statusType: 'active' | 'inactive') => Promise<void>;
  onAddServiceLocation?: () => void;
  serviceLocationBusinessFilter: string;
  setServiceLocationBusinessFilter: (filter: string) => void;
  serviceLocationStatusFilter: string;
  setServiceLocationStatusFilter: (filter: string) => void;
  serviceLocationSearchTerm: string;
  setServiceLocationSearchTerm: (term: string) => void;
  serviceLocationLocationTypeFilter: string;
  setServiceLocationLocationTypeFilter: (filter: string) => void;
  serviceLocationSortBy: string;
  setServiceLocationSortBy: (value: string) => void;
  serviceLocationSortOrder: string;
  setServiceLocationSortOrder: (value: string) => void;
  clearServiceLocationFilters: () => void;
  getFilteredAndSortedServiceLocations: () => ServiceLocation[];
  showInactiveServiceLocations: boolean;
  toggleShowInactiveServiceLocations: () => void;
  showSoftDeletedServiceLocations: boolean;
  toggleShowSoftDeletedServiceLocations: () => void;
  onBusinessNameClick?: (businessName: string) => void;
  loadingServiceLocationOperations?: Record<string, boolean>;
}

const AdminServiceLocations: React.FC<AdminServiceLocationsProps> = ({
  serviceLocations,
  businesses,
  onEditServiceLocation,
  onDeleteServiceLocation,
  onSoftDeleteServiceLocation,
  toggleServiceLocationStatus,
  onAddServiceLocation,
  serviceLocationBusinessFilter,
  setServiceLocationBusinessFilter,
  serviceLocationStatusFilter,
  setServiceLocationStatusFilter,
  serviceLocationSearchTerm,
  setServiceLocationSearchTerm,
  serviceLocationLocationTypeFilter,
  setServiceLocationLocationTypeFilter,
  serviceLocationSortBy,
  setServiceLocationSortBy,
  serviceLocationSortOrder,
  setServiceLocationSortOrder,
  clearServiceLocationFilters,
  getFilteredAndSortedServiceLocations,
  showInactiveServiceLocations,
  toggleShowInactiveServiceLocations,
  showSoftDeletedServiceLocations,
  toggleShowSoftDeletedServiceLocations,
  onBusinessNameClick,
  loadingServiceLocationOperations = {}
}) => {
  const filteredServiceLocations = getFilteredAndSortedServiceLocations();

  // Permission checks
  const { checkPermission } = usePermission();
  const canAdd = checkPermission('add.service_locations.enable');
  const canModify = checkPermission('modify.service_locations.enable');
  const canSoftDelete = checkPermission('softDelete.service_locations.enable');
  const canHardDelete = checkPermission('hardDelete.service_locations.enable');
  const canViewSoftDeleted = checkPermission('view.soft_deleted_service_locations.enable');
  const canViewStats = checkPermission('view.service_location_stats.enable');

  // Permission denied modal state
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Helper function to check if a service location can be restored
  const canServiceLocationBeRestored = (location: ServiceLocation): boolean => {
    if (!location.soft_delete) return true; // Not soft deleted, no restriction

    // Check if parent business is soft deleted
    const parentBusiness = businesses.find(b => b.businessName === location.business_name);
    return !parentBusiness?.softDelete; // Can restore if parent business is not soft deleted
  };

  // Get unique business names for the business filter dropdown
  const uniqueBusinessNames = [...new Set(serviceLocations.map(location => location.business_name))].sort();

  // Scroll indicators state
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    isNearTop: true,
    isNearBottom: false
  });

  // Header measurement
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const [headerHeight, setHeaderHeight] = useState(80); // fallback value

  useEffect(() => {
    if (headerRef.current) {
      const height = headerRef.current.offsetHeight;
      setHeaderHeight(height);
    }
  }, [filteredServiceLocations]); // Recalculate when data changes

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


  // Helper function to handle column sorting
  const handleSort = (column: string) => {
    if (serviceLocationSortBy === column) {
      // If already sorting by this column, toggle direction
      setServiceLocationSortOrder(serviceLocationSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new column, default to ascending
      setServiceLocationSortBy(column);
      setServiceLocationSortOrder('asc');
    }
  };

  // Helper function to get sort indicator
  const getSortIndicator = (column: string) => {
    if (serviceLocationSortBy === column) {
      return serviceLocationSortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕'; // Show bidirectional arrow when not actively sorted
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Service Location Management</h1>
        {canAdd ? (
          <button
            onClick={onAddServiceLocation}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Service Location
          </button>
        ) : (
          <button
            onClick={() => setPermissionDenied({
              show: true,
              action: 'Add Service Location',
              requiredPermission: 'add.service_locations.enable',
              message: 'You do not have permission to add service locations'
            })}
            disabled
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed opacity-50"
            title="Admin, Sales, or Executive role required"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Service Location
          </button>
        )}
      </div>

      {/* Summary Stats */}
      {canViewStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Locations</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{filteredServiceLocations.filter(l => !l.soft_delete).length}</div>
          <div className={`text-xs ${themeClasses.text.muted}`}>of {serviceLocations.filter(l => !l.soft_delete).length} total</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Active Locations</div>
          <div className="text-2xl font-bold text-green-600">
            {filteredServiceLocations.filter(l => l.is_active && !l.soft_delete).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Headquarters</div>
          <div className="text-2xl font-bold text-purple-600">
            {filteredServiceLocations.filter(l => l.is_headquarters && !l.soft_delete).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Inactive Locations</div>
          <div className="text-2xl font-bold text-red-600">
            {filteredServiceLocations.filter(l => !l.is_active && !l.soft_delete).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Soft Deleted</div>
          <div className="text-2xl font-bold text-orange-600">
            {serviceLocations.filter(l => l.soft_delete).length}
          </div>
        </div>
      </div>
      )}

      {/* Service Location Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4`}>Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Search</label>
            <input
              type="text"
              value={serviceLocationSearchTerm}
              onChange={(e) => setServiceLocationSearchTerm(e.target.value)}
              placeholder="Search locations..."
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Show Inactive</label>
            <button
              onClick={toggleShowInactiveServiceLocations}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                showInactiveServiceLocations ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showInactiveServiceLocations ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {canViewSoftDeleted && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Show Soft Deleted</label>
              <button
                onClick={toggleShowSoftDeletedServiceLocations}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  showSoftDeletedServiceLocations ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showSoftDeletedServiceLocations ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={clearServiceLocationFilters}
              className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Service Location Table - Desktop */}
      <div className={`hidden lg:block ${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden relative border ${themeClasses.border.primary}`}>
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
            <table className={`w-full table-auto divide-y divide-gray-200 dark:divide-gray-700 border-collapse border-b ${themeClasses.border.primary}`}>
              <thead ref={headerRef} className={`${themeClasses.bg.secondary} sticky top-0 z-10`}>
              {/* Filter Row */}
              <tr className={`${themeClasses.bg.tertiary}`}>
                <th className={`px-3 py-2 border-l border-r ${themeClasses.border.primary} w-auto`}>
                  <select
                    value={serviceLocationBusinessFilter}
                    onChange={(e) => setServiceLocationBusinessFilter(e.target.value)}
                    className={`block w-full text-xs rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:border-blue-500 focus:ring-blue-500`}
                  >
                    <option value="all">All Businesses</option>
                    {uniqueBusinessNames.map(businessName => (
                      <option key={businessName} value={businessName}>
                        {businessName}
                      </option>
                    ))}
                  </select>
                </th>
                <th className={`px-3 py-2 border-r ${themeClasses.border.primary} w-auto`}>
                  {/* No filter for Location */}
                </th>
                <th className={`px-2 py-2 border-r ${themeClasses.border.primary}`}>
                  {/* No filter for Address */}
                </th>
                <th className={`px-2 py-2 border-r ${themeClasses.border.primary}`}>
                  {/* No filter for Contact */}
                </th>
                <th className={`px-1 py-2 border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                  <select
                    value={serviceLocationLocationTypeFilter}
                    onChange={(e) => setServiceLocationLocationTypeFilter(e.target.value)}
                    className={`block w-full text-xs rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:border-blue-500 focus:ring-blue-500`}
                  >
                    <option value="all">All Types</option>
                    {[...new Set(serviceLocations.map(location => location.location_type))].sort().map(locationType => (
                      <option key={locationType} value={locationType}>
                        {locationType.charAt(0).toUpperCase() + locationType.slice(1)}
                      </option>
                    ))}
                  </select>
                </th>
                <th className={`px-1 py-2 border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                  <select
                    value={serviceLocationStatusFilter}
                    onChange={(e) => setServiceLocationStatusFilter(e.target.value)}
                    className={`block w-full text-xs rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:border-blue-500 focus:ring-blue-500`}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </th>
                <th className={`px-1 py-2 border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                  {/* No filter for Actions */}
                </th>
              </tr>
              {/* Header Row */}
              <tr>
                <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-l border-r ${themeClasses.border.primary} w-auto`}>
                  <button
                    onClick={() => handleSort('business_name')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Business
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('business_name')}</span>
                  </button>
                </th>
                <th className={`px-3 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto`}>
                  <button
                    onClick={() => handleSort('location_name')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Location
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('location_name')}</span>
                  </button>
                </th>
                <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  Address
                </th>
                <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  Contact
                </th>
                <th className={`px-1 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                  <button
                    onClick={() => handleSort('location_type')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Type
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('location_type')}</span>
                  </button>
                </th>
                <th className={`px-1 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                  <button
                    onClick={() => handleSort('is_active')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Status
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('is_active')}</span>
                  </button>
                </th>
                <th className={`px-1 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
              {filteredServiceLocations.map((location) => (
                <tr key={location.id} className={`${themeClasses.bg.hover}`}>
                  <td className={`px-2 py-3  border-l border-r ${themeClasses.border.primary}`}>
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className={`h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center`}>
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="ml-4">
                        {location.business_name ? (
                          <button
                            onClick={() => onBusinessNameClick?.(location.business_name)}
                            className={`text-sm font-medium cursor-pointer transition-colors duration-200 text-left ${themeClasses.text.primary}`}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#2563eb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '';
                            }}
                            title="Click to view this business"
                          >
                            {location.business_name}
                          </button>
                        ) : (
                          <div className={`text-sm font-medium ${themeClasses.text.primary}`}>N/A</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={`px-2 py-3  border-r ${themeClasses.border.primary}`}>
                    <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {location.location_name || location.address_label}
                    </div>
                  </td>
                  <td className={`px-2 py-3 border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => {
                        const fullAddress = `${location.street}, ${location.city}, ${location.state} ${location.zip_code}${location.country && location.country !== 'USA' ? ', ' + location.country : ''}`;
                        const encodedAddress = encodeURIComponent(fullAddress);
                        const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
                        window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                      }}
                      className={`text-sm ${themeClasses.text.primary} hover:${themeClasses.text.accent} transition-colors cursor-pointer text-left w-full group`}
                      title="Click to open in maps"
                    >
                      <div className="flex items-center">
                        <MapPin className={`w-4 h-4 ${themeClasses.text.muted} group-hover:text-blue-600 mr-1 transition-colors`} />
                        <div className="group-hover:text-blue-600 transition-colors">
                          <div>{location.street}</div>
                          <div>{location.city}, {location.state} {location.zip_code}</div>
                          {location.country !== 'USA' && <div>{location.country}</div>}
                        </div>
                      </div>
                    </button>
                  </td>
                  <td className={`px-2 py-3 border-r ${themeClasses.border.primary}`}>
                    <LocationContacts serviceLocationId={location.id} showAll={false} />
                  </td>
                  <td className={`px-2 py-3  border-r ${themeClasses.border.primary}`}>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      location.location_type === 'headquarters' ? 'bg-purple-100 text-purple-800 dark:bg-purple-100/75 dark:text-purple-800/75' :
                      location.location_type === 'branch' ? 'bg-blue-100 text-blue-800 dark:bg-blue-100/75 dark:text-blue-800/75' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-100/75 dark:text-gray-800/75'
                    }`}>
                      {location.location_type}
                    </span>
                  </td>
                  <td className={`px-2 py-3  border-r ${themeClasses.border.primary}`}>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      location.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-100/75 dark:text-green-800/75'
                        : 'bg-red-100 text-red-800 dark:bg-red-100/75 dark:text-red-800/75'
                    }`}>
                      {location.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className={`px-2 py-3  text-sm font-medium border-r ${themeClasses.border.primary}`}>
                    {/* Show actions based on permissions */}
                    {(canModify || canSoftDelete || canHardDelete) ? (
                      <div className="flex items-center space-x-2">
                        {/* Edit Button */}
                        {canModify && (
                          <button
                            onClick={() => onEditServiceLocation?.(location)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit service location"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {/* Toggle Active/Inactive Button */}
                        {canModify && (
                          <button
                            onClick={() => toggleServiceLocationStatus?.(location.id, location.is_active ? 'inactive' : 'active')}
                            disabled={loadingServiceLocationOperations[location.id]}
                            className={`${location.is_active ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'} ${loadingServiceLocationOperations[location.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={loadingServiceLocationOperations[location.id] ? "Processing..." : location.is_active ? "Deactivate location" : "Activate location"}
                          >
                            {loadingServiceLocationOperations[location.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Power className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* Soft Delete/Restore Button */}
                        {canSoftDelete && (
                          <button
                            onClick={() => onSoftDeleteServiceLocation?.(location)}
                            disabled={loadingServiceLocationOperations[location.id]}
                            className={`${
                              location.soft_delete && !canServiceLocationBeRestored(location)
                                ? 'text-gray-400'
                                : location.soft_delete
                                  ? 'text-blue-600 hover:text-blue-900'
                                  : 'text-orange-600 hover:text-orange-900'
                            } ${loadingServiceLocationOperations[location.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={
                              loadingServiceLocationOperations[location.id]
                                ? "Processing..."
                                : location.soft_delete && !canServiceLocationBeRestored(location)
                                  ? "Cannot restore: parent business is soft deleted"
                                  : location.soft_delete
                                    ? "Restore location"
                                    : "Soft delete location"
                            }
                          >
                            {loadingServiceLocationOperations[location.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : location.soft_delete ? (
                              <Undo2 className="w-4 h-4" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* Hard Delete Button */}
                        {canHardDelete && (
                          <button
                            onClick={() => onDeleteServiceLocation?.(location)}
                            disabled={loadingServiceLocationOperations[location.id]}
                            className={`text-red-600 hover:text-red-900 ${loadingServiceLocationOperations[location.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={loadingServiceLocationOperations[location.id] ? "Processing..." : "Permanently delete location"}
                          >
                            {loadingServiceLocationOperations[location.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className={`text-xs ${themeClasses.text.muted} text-center`}>-</div>
                    )}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Service Location Cards - Mobile */}
      <div className="lg:hidden space-y-4">
        {filteredServiceLocations.map((location) => (
          <div
            key={location.id}
            className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg border ${themeClasses.border.primary} p-4`}
          >
            {/* Header with business icon and location name */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="h-12 w-12 flex-shrink-0">
                  <div className={`h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center`}>
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-base font-semibold ${themeClasses.text.primary} truncate`}>
                    {location.location_name || location.address_label}
                  </h3>
                  {location.business_name ? (
                    <button
                      onClick={() => onBusinessNameClick?.(location.business_name)}
                      className={`text-sm cursor-pointer transition-colors duration-200 text-left ${themeClasses.text.secondary} hover:text-blue-600 truncate block`}
                      title="Click to view this business"
                    >
                      {location.business_name}
                    </button>
                  ) : (
                    <div className={`text-sm ${themeClasses.text.secondary}`}>N/A</div>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ml-2 ${
                location.is_active
                  ? 'bg-green-100 text-green-800 dark:bg-green-100/75 dark:text-green-800/75'
                  : 'bg-red-100 text-red-800 dark:bg-red-100/75 dark:text-red-800/75'
              }`}>
                {location.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Location details grid */}
            <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
              <div className="col-span-2">
                <span className={`text-xs ${themeClasses.text.muted}`}>Address</span>
                <button
                  onClick={() => {
                    const fullAddress = `${location.street}, ${location.city}, ${location.state} ${location.zip_code}${location.country && location.country !== 'USA' ? ', ' + location.country : ''}`;
                    const encodedAddress = encodeURIComponent(fullAddress);
                    const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
                    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className={`text-sm ${themeClasses.text.primary} hover:text-blue-600 transition-colors text-left w-full mt-1`}
                  title="Click to open in maps"
                >
                  <div className="flex items-start">
                    <MapPin className={`w-4 h-4 ${themeClasses.text.muted} mr-1 mt-0.5 flex-shrink-0`} />
                    <div>
                      <div>{location.street}</div>
                      <div>{location.city}, {location.state} {location.zip_code}</div>
                      {location.country !== 'USA' && <div>{location.country}</div>}
                    </div>
                  </div>
                </button>
              </div>
              <div>
                <span className={`text-xs ${themeClasses.text.muted}`}>Type</span>
                <div className="mt-1">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    location.location_type === 'headquarters' ? 'bg-purple-100 text-purple-800 dark:bg-purple-100/75 dark:text-purple-800/75' :
                    location.location_type === 'branch' ? 'bg-blue-100 text-blue-800 dark:bg-blue-100/75 dark:text-blue-800/75' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-100/75 dark:text-gray-800/75'
                  }`}>
                    {location.location_type}
                  </span>
                </div>
              </div>
              <div className="col-span-2">
                <span className={`text-xs ${themeClasses.text.muted}`}>Contact</span>
                <div className="mt-1">
                  <LocationContacts serviceLocationId={location.id} showAll={false} />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {(canModify || canSoftDelete || canHardDelete) && (
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                {/* Edit Button */}
                {canModify && (
                  <button
                    onClick={() => onEditServiceLocation?.(location)}
                    className="p-2 text-blue-600 hover:text-blue-900 dark:text-blue-400"
                    title="Edit service location"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                )}

                {/* Toggle Active/Inactive Button */}
                {canModify && (
                  <button
                    onClick={() => toggleServiceLocationStatus?.(location.id, location.is_active ? 'inactive' : 'active')}
                    disabled={loadingServiceLocationOperations[location.id]}
                    className={`p-2 ${location.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} ${loadingServiceLocationOperations[location.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={loadingServiceLocationOperations[location.id] ? "Processing..." : location.is_active ? "Deactivate location" : "Activate location"}
                  >
                    {loadingServiceLocationOperations[location.id] ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Power className="w-5 h-5" />
                    )}
                  </button>
                )}

                {/* Soft Delete/Restore Button */}
                {canSoftDelete && (
                  <button
                    onClick={() => onSoftDeleteServiceLocation?.(location)}
                    disabled={loadingServiceLocationOperations[location.id]}
                    className={`p-2 ${
                      location.soft_delete && !canServiceLocationBeRestored(location)
                        ? 'text-gray-400'
                        : location.soft_delete
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-orange-600 dark:text-orange-400'
                    } ${loadingServiceLocationOperations[location.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={
                      loadingServiceLocationOperations[location.id]
                        ? "Processing..."
                        : location.soft_delete && !canServiceLocationBeRestored(location)
                          ? "Cannot restore: parent business is soft deleted"
                          : location.soft_delete
                            ? "Restore location"
                            : "Soft delete location"
                    }
                  >
                    {loadingServiceLocationOperations[location.id] ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : location.soft_delete ? (
                      <Undo2 className="w-5 h-5" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                )}

                {/* Hard Delete Button */}
                {canHardDelete && (
                  <button
                    onClick={() => onDeleteServiceLocation?.(location)}
                    disabled={loadingServiceLocationOperations[location.id]}
                    className={`p-2 text-red-600 hover:text-red-900 dark:text-red-400 ${loadingServiceLocationOperations[location.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={loadingServiceLocationOperations[location.id] ? "Processing..." : "Permanently delete location"}
                  >
                    {loadingServiceLocationOperations[location.id] ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <X className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {filteredServiceLocations.length === 0 && (
          <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
            <p className={`${themeClasses.text.secondary}`}>No service locations found matching your filters.</p>
          </div>
        )}
      </div>

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={permissionDenied.show}
        onClose={() => setPermissionDenied({ show: false })}
        action={permissionDenied.action}
        requiredPermission={permissionDenied.requiredPermission}
        message={permissionDenied.message}
      />
    </div>
  );
};

export default AdminServiceLocations;