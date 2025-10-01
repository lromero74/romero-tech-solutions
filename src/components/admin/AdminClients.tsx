import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Edit,
  Power,
  Trash2,
  X,
  Undo2,
  Loader2,
  ChevronUp,
  ChevronDown,
  MapPin
} from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';

interface Client {
  id: string;
  email: string;
  name: string;
  businessName?: string;
  serviceLocationAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  role: string;
  photo?: string;
  photoPositionX?: number;
  photoPositionY?: number;
  photoScale?: number;
  photoBackgroundColor?: string;
  softDelete?: boolean;
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

interface AdminClientsProps {
  clients: Client[];
  businesses: Business[];
  clientStatusFilter: string;
  setClientStatusFilter: (filter: string) => void;
  clientBusinessFilter: string;
  setClientBusinessFilter: (filter: string) => void;
  clientSearchTerm: string;
  setClientSearchTerm: (term: string) => void;
  clientSortBy: string;
  setClientSortBy: (value: string) => void;
  clientSortOrder: string;
  setClientSortOrder: (value: string) => void;
  clearClientFilters: () => void;
  toggleUserStatus: (userId: string, statusType: 'active' | 'vacation' | 'sick') => Promise<void>;
  getFilteredAndSortedClients: () => Client[];
  onAddClient?: () => void;
  onEditClient?: (client: Client) => void;
  onDeleteClient?: (client: Client) => void;
  onSoftDeleteClient?: (client: Client) => void;
  showInactiveClients: boolean;
  toggleShowInactiveClients: () => void;
  showSoftDeletedClients: boolean;
  toggleShowSoftDeletedClients: () => void;
  loadingClientOperations?: Record<string, boolean>;
  onBusinessNameClick?: (businessName: string) => void;
}

// Helper function to open address in default maps application
const openInMaps = (address: { street: string; city: string; state: string; zipCode: string; country?: string }) => {
  const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}${address.country ? ', ' + address.country : ''}`;
  const encodedAddress = encodeURIComponent(fullAddress);
  const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
  window.open(mapsUrl, '_blank', 'noopener,noreferrer');
};

const AdminClients: React.FC<AdminClientsProps> = ({
  clients,
  businesses,
  clientStatusFilter,
  setClientStatusFilter,
  clientBusinessFilter,
  setClientBusinessFilter,
  clientSearchTerm,
  setClientSearchTerm,
  clientSortBy,
  setClientSortBy,
  clientSortOrder,
  setClientSortOrder,
  clearClientFilters,
  toggleUserStatus,
  getFilteredAndSortedClients,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onSoftDeleteClient,
  showInactiveClients,
  toggleShowInactiveClients,
  showSoftDeletedClients,
  toggleShowSoftDeletedClients,
  loadingClientOperations = {},
  onBusinessNameClick
}) => {
  const filteredClients = getFilteredAndSortedClients();

  // Permission checks
  const { checkPermission } = usePermission();
  const canAdd = checkPermission('add.users.enable');
  const canModify = checkPermission('modify.users.enable');
  const canModifyPhoto = checkPermission('modify.users.photo.enable');
  const canSoftDelete = checkPermission('softDelete.users.enable');
  const canHardDelete = checkPermission('hardDelete.users.enable');

  // Permission denied modal state
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Helper function to check if a client can be restored
  const canClientBeRestored = (client: Client): boolean => {
    if (!client.softDelete) return true; // Not soft deleted, no restriction

    // Check if parent business is soft deleted
    const parentBusiness = businesses.find(b => b.businessName === client.businessName);
    return !parentBusiness?.softDelete; // Can restore if parent business is not soft deleted
  };

  // Get unique business names for the business filter dropdown
  const uniqueBusinessNames = [...new Set(clients.map(client => client.businessName).filter(Boolean))].sort();

  // Photo modal state
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ src: string; alt: string; client: Client } | null>(null);

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
  }, [filteredClients]); // Recalculate when data changes

  const handlePhotoClick = (client: Client) => {
    if (client.photo) {
      setSelectedPhoto({
        src: client.photo,
        alt: `${client.name || 'Client'} profile photo`,
        client: client
      });
      setShowPhotoModal(true);
    }
  };

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
    if (clientSortBy === column) {
      // If already sorting by this column, toggle direction
      setClientSortOrder(clientSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new column, default to ascending
      setClientSortBy(column);
      setClientSortOrder('asc');
    }
  };

  // Helper function to get sort indicator
  const getSortIndicator = (column: string) => {
    if (clientSortBy === column) {
      return clientSortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕'; // Show bidirectional arrow when not actively sorted
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Client Management</h1>
        {canAdd ? (
          <button
            onClick={onAddClient}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </button>
        ) : (
          <button
            onClick={() => setPermissionDenied({
              show: true,
              action: 'Add Client',
              requiredPermission: 'add.users.enable',
              message: 'You do not have permission to add clients'
            })}
            disabled
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed opacity-50"
            title="Admin, Sales, or Executive role required"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </button>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Clients</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{filteredClients.filter(c => !c.softDelete).length}</div>
          <div className={`text-xs ${themeClasses.text.muted}`}>of {clients.filter(c => !c.softDelete).length} total</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Active Clients</div>
          <div className="text-2xl font-bold text-green-600">
            {filteredClients.filter(c => c.isActive && !c.softDelete).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Inactive Clients</div>
          <div className="text-2xl font-bold text-red-600">
            {filteredClients.filter(c => !c.isActive && !c.softDelete).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Verified Emails</div>
          <div className="text-2xl font-bold text-blue-600">
            {filteredClients.filter(c => c.emailVerified && !c.softDelete).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Soft Deleted</div>
          <div className="text-2xl font-bold text-orange-600">
            {clients.filter(c => c.softDelete).length}
          </div>
        </div>
      </div>

      {/* Client Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4`}>Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Search</label>
            <input
              type="text"
              value={clientSearchTerm}
              onChange={(e) => setClientSearchTerm(e.target.value)}
              placeholder="Search clients..."
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Show Inactive</label>
            <button
              onClick={toggleShowInactiveClients}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                showInactiveClients ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showInactiveClients ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Show Soft Deleted</label>
            <button
              onClick={toggleShowSoftDeletedClients}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                showSoftDeletedClients ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showSoftDeletedClients ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearClientFilters}
              className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Client Table - Desktop */}
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
                  <th className={`px-2 py-2 border-l border-r ${themeClasses.border.primary} w-auto`}>
                    {/* No filter for Client */}
                  </th>
                  <th className={`px-2 py-2 border-r ${themeClasses.border.primary} w-auto`}>
                    <select
                      value={clientBusinessFilter}
                      onChange={(e) => setClientBusinessFilter(e.target.value)}
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
                  <th className={`px-2 py-2 border-r ${themeClasses.border.primary} w-auto`}>
                    {/* No filter for Email */}
                  </th>
                  <th className={`px-2 py-2 border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                    <select
                      value={clientStatusFilter}
                      onChange={(e) => setClientStatusFilter(e.target.value)}
                      className={`block w-full text-xs rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:border-blue-500 focus:ring-blue-500`}
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </th>
                  <th className={`px-2 py-2 border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                    {/* No filter for Created */}
                  </th>
                  <th className={`px-2 py-2 border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                    {/* No filter for Actions */}
                  </th>
                </tr>
                {/* Header Row */}
                <tr>
                  <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-l border-r ${themeClasses.border.primary} w-auto`}>
                    <button
                      onClick={() => handleSort('name')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Client
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('name')}</span>
                    </button>
                  </th>
                  <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto`}>
                    <button
                      onClick={() => handleSort('businessName')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Business
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('businessName')}</span>
                    </button>
                  </th>
                  <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto`}>
                    <button
                      onClick={() => handleSort('email')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Email
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('email')}</span>
                    </button>
                  </th>
                  <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                    <button
                      onClick={() => handleSort('status')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Status
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('status')}</span>
                    </button>
                  </th>
                  <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                    <button
                      onClick={() => handleSort('createdAt')}
                      className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                    >
                      Created
                      <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('createdAt')}</span>
                    </button>
                  </th>
                  <th className={`px-2 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary} w-auto min-w-0`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredClients.map((client) => (
                  <tr key={client.id} className={`${themeClasses.bg.hover}`}>
                    <td className={`px-2 py-3 border-l border-r ${themeClasses.border.primary}`}>
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {client.photo ? (
                            <div
                              className="relative h-10 w-10 rounded-full overflow-hidden border-2 border-gray-300 cursor-pointer hover:border-blue-400 transition-colors"
                              style={{ backgroundColor: client.photoBackgroundColor || 'transparent' }}
                              onClick={() => handlePhotoClick(client)}
                            >
                              <img
                                src={client.photo}
                                alt={`${client.name || 'Client'} profile`}
                                className="w-full h-full object-cover"
                                style={{
                                  transform: `scale(${(client.photoScale || 100) / 100})`,
                                  transformOrigin: `${client.photoPositionX || 50}% ${client.photoPositionY || 50}%`
                                }}
                                onError={(e) => {
                                  // Fall back to initials if image fails to load
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.parentElement?.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            </div>
                          ) : null}
                          <div className={`h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center ${client.photo ? 'hidden' : ''}`}>
                            <span className="text-sm font-medium text-white">
                              {client.name ? client.name.charAt(0).toUpperCase() : 'C'}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className={`text-sm font-medium ${themeClasses.text.primary}`}>{client.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-2 py-3 border-r ${themeClasses.border.primary}`}>
                      <div>
                        {client.businessName ? (
                          <button
                            onClick={() => onBusinessNameClick?.(client.businessName)}
                            className={`text-sm font-medium cursor-pointer transition-colors duration-200 text-left ${themeClasses.text.primary}`}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#2563eb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '';
                            }}
                            title="Click to view this business"
                          >
                            {client.businessName}
                          </button>
                        ) : (
                          <div className={`text-sm font-medium ${themeClasses.text.primary}`}>N/A</div>
                        )}
                        {client.serviceLocationAddress && (
                          <button
                            onClick={() => openInMaps(client.serviceLocationAddress!)}
                            className={`text-xs ${themeClasses.text.secondary} hover:${themeClasses.text.accent} underline cursor-pointer transition-colors duration-200 mt-1 block text-left`}
                            title="Click to open in maps"
                          >
                            {client.serviceLocationAddress.street}, {client.serviceLocationAddress.city}, {client.serviceLocationAddress.state} {client.serviceLocationAddress.zipCode}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 py-3 border-r ${themeClasses.border.primary}`}>
                      <div className={`text-sm ${themeClasses.text.primary}`}>{client.email}</div>
                      <div className={`text-sm ${themeClasses.text.secondary}`}>
                        {client.emailVerified ? 'Verified' : 'Unverified'}
                      </div>
                    </td>
                    <td className={`px-2 py-3 border-r ${themeClasses.border.primary}`}>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        client.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-100/75 dark:text-green-800/75'
                          : 'bg-red-100 text-red-800 dark:bg-red-100/75 dark:text-red-800/75'
                      }`}>
                        {client.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={`px-2 py-3 text-sm ${themeClasses.text.primary} border-r ${themeClasses.border.primary}`}>
                      {new Date(client.createdAt).toLocaleDateString()}
                    </td>
                    <td className={`px-2 py-3 text-sm font-medium border-r ${themeClasses.border.primary}`}>
                      <div className="flex items-center space-x-2">
                        {/* Edit Button */}
                        {canModify ? (
                          <button
                            onClick={() => onEditClient?.(client)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit client"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setPermissionDenied({
                              show: true,
                              action: 'Edit Client',
                              requiredPermission: 'modify.users.enable',
                              message: 'You do not have permission to modify clients'
                            })}
                            disabled
                            className="text-gray-300 cursor-not-allowed opacity-50"
                            title="Technician, Admin, or Executive role required"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {/* Toggle Active/Inactive Button */}
                        {canModify ? (
                          <button
                            onClick={() => toggleUserStatus(client.id, client.isActive ? 'inactive' : 'active')}
                            disabled={loadingClientOperations[client.id]}
                            className={`${client.isActive ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'} ${loadingClientOperations[client.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={client.isActive ? "Deactivate client" : "Activate client"}
                          >
                            {loadingClientOperations[client.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Power className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            disabled
                            className="text-gray-300 cursor-not-allowed opacity-50"
                            title="Technician, Admin, or Executive role required"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        )}

                        {/* Soft Delete/Restore Button */}
                        {canSoftDelete ? (
                          <button
                            onClick={() => onSoftDeleteClient?.(client)}
                            disabled={loadingClientOperations[client.id]}
                            className={`${
                              client.softDelete && !canClientBeRestored(client)
                                ? 'text-gray-400'
                                : client.softDelete
                                  ? 'text-blue-600 hover:text-blue-900'
                                  : 'text-orange-600 hover:text-orange-900'
                            } ${loadingClientOperations[client.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={
                              client.softDelete && !canClientBeRestored(client)
                                ? "Cannot restore: parent business is soft deleted"
                                : client.softDelete
                                  ? "Restore client"
                                  : "Soft delete client"
                            }
                          >
                            {loadingClientOperations[client.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : client.softDelete ? (
                              <Undo2 className="w-4 h-4" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => setPermissionDenied({
                              show: true,
                              action: client.softDelete ? 'Restore Client' : 'Soft Delete Client',
                              requiredPermission: 'softDelete.users.enable',
                              message: 'You do not have permission to soft delete clients'
                            })}
                            disabled
                            className="text-gray-300 cursor-not-allowed opacity-50"
                            title="Admin or Executive role required"
                          >
                            {client.softDelete ? (
                              <Undo2 className="w-4 h-4" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* Hard Delete Button */}
                        {canHardDelete ? (
                          <button
                            onClick={() => onDeleteClient?.(client)}
                            disabled={loadingClientOperations[client.id]}
                            className={`text-red-600 hover:text-red-900 ${loadingClientOperations[client.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Permanently delete client"
                          >
                            {loadingClientOperations[client.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => setPermissionDenied({
                              show: true,
                              action: 'Permanently Delete Client',
                              requiredPermission: 'hardDelete.users.enable',
                              message: 'You do not have permission to permanently delete clients'
                            })}
                            disabled
                            className="text-gray-300 cursor-not-allowed opacity-50"
                            title="Executive role required"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
              style={{ backgroundColor: selectedPhoto.client.photoBackgroundColor || '#f9fafb' }}
            >
              <img
                src={selectedPhoto.src}
                alt={selectedPhoto.alt}
                className="w-full h-full object-cover"
                style={{
                  transform: `scale(${(selectedPhoto.client.photoScale || 100) / 100})`,
                  transformOrigin: `${selectedPhoto.client.photoPositionX || 50}% ${selectedPhoto.client.photoPositionY || 50}%`
                }}
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            {/* Client Info */}
            <div className={`mt-4 text-center ${themeClasses.text.primary}`}>
              <h3 className="text-lg font-medium">{selectedPhoto.client.name}</h3>
              {selectedPhoto.client.businessName && (
                <p className={`text-sm ${themeClasses.text.secondary}`}>{selectedPhoto.client.businessName}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Client Cards - Mobile */}
      <div className="lg:hidden space-y-4">
        {filteredClients.map((client) => (
          <div
            key={client.id}
            className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg border ${themeClasses.border.primary} p-4`}
          >
            {/* Header with photo and name */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="h-12 w-12 flex-shrink-0">
                  {client.photo ? (
                    <div
                      className="relative h-12 w-12 rounded-full overflow-hidden border-2 border-gray-300 cursor-pointer hover:border-blue-400 transition-colors"
                      style={{ backgroundColor: client.photoBackgroundColor || 'transparent' }}
                      onClick={() => handlePhotoClick(client)}
                    >
                      <img
                        src={client.photo}
                        alt={`${client.name || 'Client'} profile`}
                        className="w-full h-full object-cover"
                        style={{
                          transform: `scale(${(client.photoScale || 100) / 100})`,
                          transformOrigin: `${client.photoPositionX || 50}% ${client.photoPositionY || 50}%`
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    </div>
                  ) : null}
                  <div className={`h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center ${client.photo ? 'hidden' : ''}`}>
                    <span className="text-lg font-medium text-white">
                      {client.name ? client.name.charAt(0).toUpperCase() : 'C'}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-base font-semibold ${themeClasses.text.primary} truncate`}>
                    {client.name}
                  </h3>
                  <p className={`text-sm ${themeClasses.text.secondary} truncate`}>{client.email}</p>
                </div>
              </div>

              {/* Status badge */}
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ml-2 ${
                client.isActive
                  ? 'bg-green-100 text-green-800 dark:bg-green-100/75 dark:text-green-800/75'
                  : 'bg-red-100 text-red-800 dark:bg-red-100/75 dark:text-red-800/75'
              }`}>
                {client.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Client details grid */}
            <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
              <div className="col-span-2">
                <span className={`text-xs ${themeClasses.text.muted}`}>Business</span>
                {client.businessName ? (
                  <button
                    onClick={() => onBusinessNameClick?.(client.businessName)}
                    className={`text-sm font-medium cursor-pointer transition-colors duration-200 text-left ${themeClasses.text.primary} hover:text-blue-600 mt-1 block`}
                    title="Click to view this business"
                  >
                    {client.businessName}
                  </button>
                ) : (
                  <div className={`text-sm font-medium ${themeClasses.text.primary} mt-1`}>N/A</div>
                )}
              </div>
              {client.serviceLocationAddress && (
                <div className="col-span-2">
                  <span className={`text-xs ${themeClasses.text.muted}`}>Service Location</span>
                  <button
                    onClick={() => openInMaps(client.serviceLocationAddress!)}
                    className={`text-sm ${themeClasses.text.primary} hover:text-blue-600 transition-colors text-left w-full mt-1`}
                    title="Click to open in maps"
                  >
                    <div className="flex items-start">
                      <MapPin className={`w-4 h-4 ${themeClasses.text.muted} mr-1 mt-0.5 flex-shrink-0`} />
                      <div>
                        <div>{client.serviceLocationAddress.street}</div>
                        <div>{client.serviceLocationAddress.city}, {client.serviceLocationAddress.state} {client.serviceLocationAddress.zipCode}</div>
                      </div>
                    </div>
                  </button>
                </div>
              )}
              <div>
                <span className={`text-xs ${themeClasses.text.muted}`}>Email Status</span>
                <p className={`text-sm ${themeClasses.text.primary} mt-1`}>
                  {client.emailVerified ? 'Verified' : 'Unverified'}
                </p>
              </div>
              <div>
                <span className={`text-xs ${themeClasses.text.muted}`}>Created</span>
                <p className={`text-sm ${themeClasses.text.primary} mt-1`}>
                  {new Date(client.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              {/* Edit Button */}
              {canModify ? (
                <button
                  onClick={() => onEditClient?.(client)}
                  className="p-2 text-blue-600 hover:text-blue-900 dark:text-blue-400"
                  title="Edit client"
                >
                  <Edit className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => setPermissionDenied({
                    show: true,
                    action: 'Edit Client',
                    requiredPermission: 'modify.users.enable',
                    message: 'You do not have permission to modify clients'
                  })}
                  disabled
                  className="p-2 text-gray-300 cursor-not-allowed opacity-50"
                  title="Technician, Admin, or Executive role required"
                >
                  <Edit className="w-5 h-5" />
                </button>
              )}

              {/* Toggle Active/Inactive Button */}
              {canModify ? (
                <button
                  onClick={() => toggleUserStatus(client.id, client.isActive ? 'inactive' : 'active')}
                  disabled={loadingClientOperations[client.id]}
                  className={`p-2 ${client.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} ${loadingClientOperations[client.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={client.isActive ? "Deactivate client" : "Activate client"}
                >
                  {loadingClientOperations[client.id] ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Power className="w-5 h-5" />
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="p-2 text-gray-300 cursor-not-allowed opacity-50"
                  title="Technician, Admin, or Executive role required"
                >
                  <Power className="w-5 h-5" />
                </button>
              )}

              {/* Soft Delete/Restore Button */}
              {canSoftDelete ? (
                <button
                  onClick={() => onSoftDeleteClient?.(client)}
                  disabled={loadingClientOperations[client.id]}
                  className={`p-2 ${
                    client.softDelete && !canClientBeRestored(client)
                      ? 'text-gray-400'
                      : client.softDelete
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-orange-600 dark:text-orange-400'
                  } ${loadingClientOperations[client.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={
                    client.softDelete && !canClientBeRestored(client)
                      ? "Cannot restore: parent business is soft deleted"
                      : client.softDelete
                        ? "Restore client"
                        : "Soft delete client"
                  }
                >
                  {loadingClientOperations[client.id] ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : client.softDelete ? (
                    <Undo2 className="w-5 h-5" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setPermissionDenied({
                    show: true,
                    action: client.softDelete ? 'Restore Client' : 'Soft Delete Client',
                    requiredPermission: 'softDelete.users.enable',
                    message: 'You do not have permission to soft delete clients'
                  })}
                  disabled
                  className="p-2 text-gray-300 cursor-not-allowed opacity-50"
                  title="Admin or Executive role required"
                >
                  {client.softDelete ? (
                    <Undo2 className="w-5 h-5" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              )}

              {/* Hard Delete Button */}
              {canHardDelete ? (
                <button
                  onClick={() => onDeleteClient?.(client)}
                  disabled={loadingClientOperations[client.id]}
                  className={`p-2 text-red-600 hover:text-red-900 dark:text-red-400 ${loadingClientOperations[client.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Permanently delete client"
                >
                  {loadingClientOperations[client.id] ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <X className="w-5 h-5" />
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setPermissionDenied({
                    show: true,
                    action: 'Permanently Delete Client',
                    requiredPermission: 'hardDelete.users.enable',
                    message: 'You do not have permission to permanently delete clients'
                  })}
                  disabled
                  className="p-2 text-gray-300 cursor-not-allowed opacity-50"
                  title="Executive role required"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {filteredClients.length === 0 && (
          <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
            <p className={`${themeClasses.text.secondary}`}>No clients found matching your filters.</p>
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

export default AdminClients;