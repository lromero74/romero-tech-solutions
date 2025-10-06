import React, { useState } from 'react';
import { Briefcase, Edit, Trash2, Users, Building, X, MapPin, Undo2, Power, Loader2, User } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';

interface Business {
  id: string;
  businessName: string;
  domainEmails: string;
  address: {
    street: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  locationCount: number;
  isActive: boolean;
  softDelete?: boolean;
  isIndividual?: boolean;
  createdAt: string;
  logo?: string;
  logoPositionX?: number;
  logoPositionY?: number;
  logoScale?: number;
  logoBackgroundColor?: string;
  rateCategoryName?: string;
  baseHourlyRate?: number;
}

interface Client {
  id: string;
  email: string;
  name: string;
  businessName?: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  role: string;
}

interface AdminBusinessesProps {
  businesses: Business[];
  clients: Client[];
  onEditBusiness?: (business: Business) => void;
  onDeleteBusiness?: (business: Business) => void;
  onSoftDeleteBusiness?: (business: Business) => void;
  toggleBusinessStatus?: (businessId: string, statusType: 'active' | 'inactive') => Promise<void>;
  onAddBusiness?: () => void;
  onClientCountClick?: (businessId: string, businessName: string, clientCount: number, authorizedDomains: string[]) => void;
  onLocationCountClick?: (businessName: string) => void;
  businessStatusFilter: string;
  setBusinessStatusFilter: (filter: string) => void;
  businessSearchTerm: string;
  setBusinessSearchTerm: (term: string) => void;
  businessSortBy: string;
  setBusinessSortBy: (value: string) => void;
  businessSortOrder: string;
  setBusinessSortOrder: (value: string) => void;
  businessNameFilter: string;
  setBusinessNameFilter: (filter: string) => void;
  businessClientCountFilter: string;
  setBusinessClientCountFilter: (filter: string) => void;
  clearBusinessFilters: () => void;
  getFilteredAndSortedBusinesses: () => Business[];
  showInactiveBusinesses: boolean;
  toggleShowInactiveBusinesses: () => void;
  showSoftDeletedBusinesses: boolean;
  toggleShowSoftDeletedBusinesses: () => void;
  loadingBusinessOperations?: Record<string, boolean>;
}

const AdminBusinesses: React.FC<AdminBusinessesProps> = ({
  businesses,
  clients,
  onEditBusiness,
  onDeleteBusiness,
  onSoftDeleteBusiness,
  toggleBusinessStatus,
  onAddBusiness,
  onClientCountClick,
  onLocationCountClick,
  businessStatusFilter,
  setBusinessStatusFilter,
  businessSearchTerm,
  setBusinessSearchTerm,
  businessSortBy,
  setBusinessSortBy,
  businessSortOrder,
  setBusinessSortOrder,
  businessNameFilter,
  setBusinessNameFilter,
  businessClientCountFilter,
  setBusinessClientCountFilter,
  clearBusinessFilters,
  getFilteredAndSortedBusinesses,
  showInactiveBusinesses,
  toggleShowInactiveBusinesses,
  showSoftDeletedBusinesses,
  toggleShowSoftDeletedBusinesses,
  loadingBusinessOperations = {}
}) => {
  const filteredBusinesses = getFilteredAndSortedBusinesses();

  // Permission checks
  const { checkPermission } = usePermission();
  const canAdd = checkPermission('add.businesses.enable');
  const canModify = checkPermission('modify.businesses.enable');
  const canSoftDelete = checkPermission('softDelete.businesses.enable');
  const canHardDelete = checkPermission('hardDelete.businesses.enable');
  const canViewSoftDeleted = checkPermission('view.soft_deleted_businesses.enable');
  const canViewStats = checkPermission('view.business_stats.enable');
  const canViewRateCategories = checkPermission('view.business_rate_categories.enable');

  // Permission denied modal state
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Logo modal state
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [selectedLogo, setSelectedLogo] = useState<{ src: string; alt: string; business: Business } | null>(null);

  const handleLogoClick = (business: Business) => {
    if (business.logo) {
      setSelectedLogo({
        src: business.logo,
        alt: `${business.businessName || 'Business'} logo`,
        business: business
      });
      setShowLogoModal(true);
    }
  };

  // Final debug - what data is the component actually receiving?

  // Function to get clients for a specific business
  const getClientsForBusiness = (businessName: string) => {
    return clients.filter(client => client.businessName === businessName);
  };

  // Helper function to handle column sorting
  const handleSort = (column: string) => {
    if (businessSortBy === column) {
      // If already sorting by this column, toggle direction
      setBusinessSortOrder(businessSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new column, default to ascending
      setBusinessSortBy(column);
      setBusinessSortOrder('asc');
    }
  };

  // Helper function to get sort indicator
  const getSortIndicator = (column: string) => {
    if (businessSortBy === column) {
      return businessSortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕'; // Show bidirectional arrow when not actively sorted
  };

  // Helper function to open address in default maps application
  const openInMaps = (address: { street: string; city: string; state: string; zipCode: string; country: string }) => {
    const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}${address.country ? ', ' + address.country : ''}`;
    const encodedAddress = encodeURIComponent(fullAddress);

    // Use a universal maps URL that works across platforms
    const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;

    // Open in new tab/window
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Business Management</h1>
        {canAdd ? (
          <button
            onClick={onAddBusiness}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
          >
            <Briefcase className="w-4 h-4 mr-2" />
            Add Business
          </button>
        ) : (
          <button
            onClick={() => setPermissionDenied({
              show: true,
              action: 'Add Business',
              requiredPermission: 'add.businesses.enable',
              message: 'You do not have permission to add businesses'
            })}
            disabled
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed opacity-50"
            title="Sales or Executive role required"
          >
            <Briefcase className="w-4 h-4 mr-2" />
            Add Business
          </button>
        )}
      </div>

      {/* Summary Stats - Hidden from users without permission */}
      {canViewStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Businesses</div>
            <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{filteredBusinesses.filter(b => !b.softDelete).length}</div>
            <div className={`text-xs ${themeClasses.text.muted}`}>of {businesses.filter(b => !b.softDelete).length} total</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Active Businesses</div>
            <div className="text-2xl font-bold text-green-600">
              {filteredBusinesses.filter(b => b.isActive && !b.softDelete).length}
            </div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Inactive Businesses</div>
            <div className="text-2xl font-bold text-red-600">
              {filteredBusinesses.filter(b => !b.isActive && !b.softDelete).length}
            </div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Clients</div>
            <div className="text-2xl font-bold text-blue-600">
              {filteredBusinesses.reduce((total, business) => {
                return total + getClientsForBusiness(business.businessName).length;
              }, 0)}
            </div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Soft Deleted</div>
            <div className="text-2xl font-bold text-orange-600">
              {businesses.filter(b => b.softDelete).length}
            </div>
          </div>
        </div>
      )}

      {/* Business Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4`}>Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Search</label>
            <input
              type="text"
              value={businessSearchTerm}
              onChange={(e) => setBusinessSearchTerm(e.target.value)}
              placeholder="Search businesses..."
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Show Inactive</label>
            <button
              onClick={toggleShowInactiveBusinesses}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                showInactiveBusinesses ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showInactiveBusinesses ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {/* Show Soft Deleted toggle - only visible to users with permission */}
          {canViewSoftDeleted && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Show Soft Deleted</label>
              <button
                onClick={toggleShowSoftDeletedBusinesses}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  showSoftDeletedBusinesses ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showSoftDeletedBusinesses ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={clearBusinessFilters}
              className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Business Table - Desktop */}
      <div className={`hidden lg:block ${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className={`min-w-full divide-y divide-gray-200 dark:divide-gray-700 border-b border-gray-200 dark:border-gray-700`}>
            <thead className={themeClasses.bg.secondary}>
              {/* Filter Row */}
              <tr className={`${themeClasses.bg.tertiary} border-b ${themeClasses.border.primary}`}>
                <th className={`px-6 py-2 border-l border-r ${themeClasses.border.primary}`}>
                  <select
                    value={businessNameFilter}
                    onChange={(e) => setBusinessNameFilter(e.target.value)}
                    className={`block w-full text-xs rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:border-blue-500 focus:ring-blue-500`}
                  >
                    <option value="all">All Businesses</option>
                    {[...new Set(businesses.map(b => b.businessName))].sort().map(businessName => (
                      <option key={businessName} value={businessName}>
                        {businessName}
                      </option>
                    ))}
                  </select>
                </th>
                <th className={`px-6 py-2 border-r ${themeClasses.border.primary}`}>
                  {/* No filter for Domain Emails */}
                </th>
                <th className={`px-6 py-2 border-r ${themeClasses.border.primary}`}>
                  {/* No filter for Address */}
                </th>
                <th className={`px-6 py-2 border-r ${themeClasses.border.primary}`}>
                  {/* No filter for Locations */}
                </th>
                <th className={`px-6 py-2 border-r ${themeClasses.border.primary}`}>
                  <select
                    value={businessClientCountFilter}
                    onChange={(e) => setBusinessClientCountFilter(e.target.value)}
                    className={`block w-full text-xs rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:border-blue-500 focus:ring-blue-500`}
                  >
                    <option value="all">All Clients</option>
                    <option value="0">0 clients</option>
                    <option value="1-5">1-5 clients</option>
                    <option value="5-10">5-10 clients</option>
                    <option value=">10">&gt;10 clients</option>
                  </select>
                </th>
                <th className={`px-6 py-2 border-r ${themeClasses.border.primary}`}>
                  <select
                    value={businessStatusFilter}
                    onChange={(e) => setBusinessStatusFilter(e.target.value)}
                    className={`block w-full text-xs rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:border-blue-500 focus:ring-blue-500`}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </th>
                <th className={`px-6 py-2 border-r ${themeClasses.border.primary}`}>
                  {/* No filter for Rate Category */}
                </th>
                <th className={`px-6 py-2 border-r ${themeClasses.border.primary}`}>
                  {/* No filter for Actions */}
                </th>
              </tr>
              {/* Header Row */}
              <tr>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-l border-r ${themeClasses.border.primary}`}>
                  <button
                    onClick={() => handleSort('businessName')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Business Name
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('businessName')}</span>
                  </button>
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  <button
                    onClick={() => handleSort('domainEmails')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Domain Emails
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('domainEmails')}</span>
                  </button>
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  Address
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  <button
                    onClick={() => handleSort('locationCount')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Locations
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('locationCount')}</span>
                  </button>
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  <button
                    onClick={() => handleSort('clientCount')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Clients
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('clientCount')}</span>
                  </button>
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  <button
                    onClick={() => handleSort('isActive')}
                    className={`flex items-center ${themeClasses.text.secondary} hover:${themeClasses.text.accent} ${themeClasses.bg.hover} uppercase tracking-wider cursor-pointer transition-colors duration-150 rounded px-1 py-1 -mx-1 -my-1`}
                  >
                    Status
                    <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator('isActive')}</span>
                  </button>
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  Hourly Rate
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
              {filteredBusinesses.map((business, index) => {
                const businessClients = getClientsForBusiness(business.businessName);
                return (
                  <tr key={`${business.id}-${index}`} className={`${themeClasses.bg.hover}`}>
                    <td className={`px-6 py-4 whitespace-nowrap border-l border-r ${themeClasses.border.primary}`}>
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 relative">
                          {business.logo ? (
                            <div
                              className="relative h-10 w-10 rounded-full overflow-hidden border-2 border-gray-300 cursor-pointer hover:border-blue-400 transition-colors"
                              style={{ backgroundColor: business.logoBackgroundColor || 'transparent' }}
                              onClick={() => handleLogoClick(business)}
                            >
                              <img
                                src={business.logo}
                                alt={`${business.businessName || 'Business'} logo`}
                                className="w-full h-full object-cover"
                                style={{
                                  transform: `scale(${(business.logoScale || 100) / 100})`,
                                  transformOrigin: `${business.logoPositionX || 50}% ${business.logoPositionY || 50}%`
                                }}
                                onError={(e) => {
                                  // Fall back to building icon if image fails to load
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.parentElement?.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                              <div className="hidden h-10 w-10 rounded-full bg-purple-500 items-center justify-center">
                                {business.isIndividual ? (
                                  <User className="h-6 w-6 text-white" />
                                ) : (
                                  <Building className="h-6 w-6 text-white" />
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className={`h-10 w-10 rounded-full ${business.isIndividual ? 'bg-blue-500' : 'bg-purple-500'} flex items-center justify-center`}>
                              {business.isIndividual ? (
                                <User className="h-6 w-6 text-white" />
                              ) : (
                                <Building className="h-6 w-6 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className={`text-sm font-medium ${themeClasses.text.primary}`}>{business.businessName}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 border-r ${themeClasses.border.primary}`}>
                      <div className={`text-sm ${themeClasses.text.primary}`}>
                        {business.domainEmails ? (
                          business.domainEmails.split(', ').map((domain, index) => (
                            <div key={index} className="leading-tight">
                              {domain.trim()}
                            </div>
                          ))
                        ) : (
                          <span className={themeClasses.text.muted}>No domains</span>
                        )}
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                      <button
                        onClick={() => openInMaps(business.address)}
                        className={`text-sm ${themeClasses.text.primary} hover:${themeClasses.text.accent} transition-colors cursor-pointer text-left w-full group`}
                        title="Click to open in maps"
                      >
                        <div className="flex items-center">
                          <MapPin className={`w-4 h-4 ${themeClasses.text.muted} group-hover:text-blue-600 mr-1 transition-colors`} />
                          <span className="group-hover:text-blue-600 transition-colors">
                            {business.address?.street || 'No street'}
                            {business.address?.street2 && ` ${business.address.street2}`}
                          </span>
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary} group-hover:text-blue-500 mt-1 transition-colors`}>
                          {business.address?.city || 'N/A'}, {business.address?.state || 'N/A'} {business.address?.zipCode || 'No zip'}
                        </div>
                      </button>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                      <div className={`text-sm ${themeClasses.text.primary}`}>
                        <div className="flex items-center">
                          <Building className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                          <button
                            onClick={() => onLocationCountClick?.(business.businessName)}
                            className={`text-blue-600 hover:text-blue-800 underline transition-colors duration-200 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-1 -mx-1`}
                            title={`View service locations for ${business.businessName}`}
                          >
                            {business.locationCount || 0} locations
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                      <div className={`text-sm ${themeClasses.text.primary}`}>
                        <div className="flex items-center">
                          <Users className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                          <button
                            onClick={() => {
                              const domains = business.domainEmails ? business.domainEmails.split(', ') : [];
                              onClientCountClick?.(business.id, business.businessName, businessClients.length, domains);
                            }}
                            className={`${businessClients.length === 0 ? 'text-green-600 hover:text-green-800' : 'text-blue-600 hover:text-blue-800'} underline transition-colors duration-200 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-1 -mx-1`}
                            title={businessClients.length === 0 ? `Add client for ${business.businessName}` : `View clients for ${business.businessName}`}
                          >
                            {businessClients.length} clients
                          </button>
                        </div>
                        {businessClients.length > 0 && (
                          <div className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                            {businessClients.filter(c => c.isActive).length} active
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        business.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-100/75 dark:text-green-800/75'
                          : 'bg-red-100 text-red-800 dark:bg-red-100/75 dark:text-red-800/75'
                      }`}>
                        {business.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                      <div className={`text-sm ${themeClasses.text.primary}`}>
                        {canViewRateCategories && (
                          <div className="font-medium">{business.rateCategoryName || 'Standard'}</div>
                        )}
                        <div className={`${canViewRateCategories ? 'text-xs' : 'text-sm font-medium'} ${themeClasses.text.secondary}`}>
                          ${business.baseHourlyRate || 75}/hr
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium border-r ${themeClasses.border.primary}`}>
                      {/* Show actions based on permissions */}
                      {(canModify || canSoftDelete || canHardDelete) ? (
                        <div className="flex items-center space-x-2">
                          {/* Edit Button */}
                          {canModify ? (
                            <button
                              onClick={() => onEditBusiness?.(business)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit business"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setPermissionDenied({
                                show: true,
                                action: 'Edit Business',
                                requiredPermission: 'modify.businesses.enable',
                                message: 'You do not have permission to modify businesses'
                              })}
                              disabled
                              className="text-gray-300 cursor-not-allowed opacity-50"
                              title="Sales, Admin, or Executive role required"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {/* Toggle Active/Inactive Button */}
                          {canModify ? (
                            <button
                              onClick={() => toggleBusinessStatus?.(business.id, business.isActive ? 'inactive' : 'active')}
                              disabled={loadingBusinessOperations[business.id]}
                              className={`${business.isActive ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'} ${loadingBusinessOperations[business.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title={loadingBusinessOperations[business.id] ? "Processing..." : business.isActive ? "Deactivate business" : "Activate business"}
                            >
                              {loadingBusinessOperations[business.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              disabled
                              className="text-gray-300 cursor-not-allowed opacity-50"
                              title="Sales, Admin, or Executive role required"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          )}

                          {/* Soft Delete/Restore Button */}
                          {canSoftDelete ? (
                            <button
                              onClick={() => onSoftDeleteBusiness?.(business)}
                              disabled={loadingBusinessOperations[business.id]}
                              className={`${business.softDelete ? 'text-blue-600 hover:text-blue-900' : 'text-orange-600 hover:text-orange-900'} ${loadingBusinessOperations[business.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title={loadingBusinessOperations[business.id] ? "Processing..." : business.softDelete ? "Restore business" : "Soft delete business"}
                            >
                              {loadingBusinessOperations[business.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : business.softDelete ? (
                                <Undo2 className="w-4 h-4" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => setPermissionDenied({
                                show: true,
                                action: business.softDelete ? 'Restore Business' : 'Soft Delete Business',
                                requiredPermission: 'softDelete.businesses.enable',
                                message: 'You do not have permission to soft delete businesses'
                              })}
                              disabled
                              className="text-gray-300 cursor-not-allowed opacity-50"
                              title="Admin or Executive role required"
                            >
                              {business.softDelete ? (
                                <Undo2 className="w-4 h-4" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {/* Hard Delete Button */}
                          {canHardDelete ? (
                            <button
                              onClick={() => onDeleteBusiness?.(business)}
                              disabled={loadingBusinessOperations[business.id]}
                              className={`text-red-600 hover:text-red-900 ${loadingBusinessOperations[business.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title={loadingBusinessOperations[business.id] ? "Processing..." : "Permanently delete business"}
                            >
                              {loadingBusinessOperations[business.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => setPermissionDenied({
                                show: true,
                                action: 'Permanently Delete Business',
                                requiredPermission: 'hardDelete.businesses.enable',
                                message: 'You do not have permission to permanently delete businesses'
                              })}
                              disabled
                              className="text-gray-300 cursor-not-allowed opacity-50"
                              title="Executive role required"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className={`text-xs ${themeClasses.text.muted} text-center`}>-</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Logo Modal */}
      {showLogoModal && selectedLogo && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70] p-4"
          onClick={() => setShowLogoModal(false)}
        >
          <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowLogoModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            <div
              className="inline-block rounded-lg shadow-2xl"
              style={{
                backgroundColor: selectedLogo.business.logoBackgroundColor || 'transparent',
                maxHeight: 'calc(100vh - 100px)'
              }}
            >
              <img
                src={selectedLogo.src}
                alt={selectedLogo.alt}
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{ maxHeight: 'calc(100vh - 100px)' }}
              />
            </div>
            {/* Business Info */}
            <div className={`mt-4 text-center ${themeClasses.text.primary}`}>
              <h3 className="text-lg font-medium text-white">{selectedLogo.business.businessName}</h3>
              {selectedLogo.business.address && (
                <p className={`text-sm text-gray-300`}>
                  {selectedLogo.business.address.street}, {selectedLogo.business.address.city}, {selectedLogo.business.address.state}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Business Cards - Mobile */}
      <div className="lg:hidden space-y-4">
        {filteredBusinesses.map((business, index) => {
          const businessClients = getClientsForBusiness(business.businessName);
          return (
            <div
              key={`${business.id}-${index}`}
              className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg border ${themeClasses.border.primary} p-4`}
            >
              {/* Header with logo and name */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="h-12 w-12 flex-shrink-0">
                    {business.logo ? (
                      <div
                        className="relative h-12 w-12 rounded-full overflow-hidden border-2 border-gray-300 cursor-pointer hover:border-blue-400 transition-colors"
                        style={{ backgroundColor: business.logoBackgroundColor || 'transparent' }}
                        onClick={() => handleLogoClick(business)}
                      >
                        <img
                          src={business.logo}
                          alt={`${business.businessName || 'Business'} logo`}
                          className="w-full h-full object-cover"
                          style={{
                            transform: `scale(${(business.logoScale || 100) / 100})`,
                            transformOrigin: `${business.logoPositionX || 50}% ${business.logoPositionY || 50}%`
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.parentElement?.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div className="hidden h-12 w-12 rounded-full bg-purple-500 items-center justify-center">
                          {business.isIndividual ? (
                            <User className="h-6 w-6 text-white" />
                          ) : (
                            <Building className="h-6 w-6 text-white" />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`h-12 w-12 rounded-full ${business.isIndividual ? 'bg-blue-500' : 'bg-purple-500'} flex items-center justify-center`}>
                        {business.isIndividual ? (
                          <User className="h-6 w-6 text-white" />
                        ) : (
                          <Building className="h-6 w-6 text-white" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-base font-semibold ${themeClasses.text.primary} truncate`}>
                      {business.businessName}
                    </h3>
                  </div>
                </div>

                {/* Status badge */}
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ml-2 ${
                  business.isActive
                    ? 'bg-green-100 text-green-800 dark:bg-green-100/75 dark:text-green-800/75'
                    : 'bg-red-100 text-red-800 dark:bg-red-100/75 dark:text-red-800/75'
                }`}>
                  {business.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Business details grid */}
              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div className="col-span-2">
                  <span className={`text-xs ${themeClasses.text.muted}`}>Domain Emails</span>
                  <div className={`text-sm ${themeClasses.text.primary} mt-1`}>
                    {business.domainEmails ? (
                      business.domainEmails.split(', ').map((domain, index) => (
                        <div key={index} className="leading-tight">
                          {domain.trim()}
                        </div>
                      ))
                    ) : (
                      <span className={themeClasses.text.muted}>No domains</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className={`text-xs ${themeClasses.text.muted}`}>Address</span>
                  <button
                    onClick={() => openInMaps(business.address)}
                    className={`text-sm ${themeClasses.text.primary} hover:text-blue-600 transition-colors text-left w-full mt-1`}
                    title="Click to open in maps"
                  >
                    <div className="flex items-start">
                      <MapPin className={`w-4 h-4 ${themeClasses.text.muted} mr-1 mt-0.5 flex-shrink-0`} />
                      <div>
                        <div>
                          {business.address?.street || 'No street'}
                          {business.address?.street2 && ` ${business.address.street2}`}
                        </div>
                        <div>{business.address?.city || 'N/A'}, {business.address?.state || 'N/A'} {business.address?.zipCode || 'No zip'}</div>
                      </div>
                    </div>
                  </button>
                </div>
                <div>
                  <span className={`text-xs ${themeClasses.text.muted}`}>Locations</span>
                  <div className="flex items-center mt-1">
                    <Building className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                    <button
                      onClick={() => onLocationCountClick?.(business.businessName)}
                      className={`text-blue-600 hover:text-blue-800 underline transition-colors`}
                      title={`View service locations for ${business.businessName}`}
                    >
                      {business.locationCount || 0}
                    </button>
                  </div>
                </div>
                <div>
                  <span className={`text-xs ${themeClasses.text.muted}`}>Clients</span>
                  <div className="flex items-center mt-1">
                    <Users className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                    <button
                      onClick={() => {
                        const domains = business.domainEmails ? business.domainEmails.split(', ') : [];
                        onClientCountClick?.(business.id, business.businessName, businessClients.length, domains);
                      }}
                      className={`${businessClients.length === 0 ? 'text-green-600 hover:text-green-800' : 'text-blue-600 hover:text-blue-800'} underline transition-colors`}
                      title={businessClients.length === 0 ? `Add client for ${business.businessName}` : `View clients for ${business.businessName}`}
                    >
                      {businessClients.length}
                    </button>
                  </div>
                  {businessClients.length > 0 && (
                    <div className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                      {businessClients.filter(c => c.isActive).length} active
                    </div>
                  )}
                </div>
                <div>
                  <span className={`text-xs ${themeClasses.text.muted}`}>Hourly Rate</span>
                  <div className="mt-1">
                    {canViewRateCategories && (
                      <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                        {business.rateCategoryName || 'Standard'}
                      </div>
                    )}
                    <div className={`${canViewRateCategories ? 'text-xs' : 'text-sm font-medium'} ${themeClasses.text.secondary}`}>
                      ${business.baseHourlyRate || 75}/hr
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                {/* Edit Button */}
                {canModify ? (
                  <button
                    onClick={() => onEditBusiness?.(business)}
                    className="p-2 text-blue-600 hover:text-blue-900 dark:text-blue-400"
                    title="Edit business"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setPermissionDenied({
                      show: true,
                      action: 'Edit Business',
                      requiredPermission: 'modify.businesses.enable',
                      message: 'You do not have permission to modify businesses'
                    })}
                    disabled
                    className="p-2 text-gray-300 cursor-not-allowed opacity-50"
                    title="Sales, Admin, or Executive role required"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                )}

                {/* Toggle Active/Inactive Button */}
                {canModify ? (
                  <button
                    onClick={() => toggleBusinessStatus?.(business.id, business.isActive ? 'inactive' : 'active')}
                    disabled={loadingBusinessOperations[business.id]}
                    className={`p-2 ${business.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} ${loadingBusinessOperations[business.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={loadingBusinessOperations[business.id] ? "Processing..." : business.isActive ? "Deactivate business" : "Activate business"}
                  >
                    {loadingBusinessOperations[business.id] ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Power className="w-5 h-5" />
                    )}
                  </button>
                ) : (
                  <button
                    disabled
                    className="p-2 text-gray-300 cursor-not-allowed opacity-50"
                    title="Sales, Admin, or Executive role required"
                  >
                    <Power className="w-5 h-5" />
                  </button>
                )}

                {/* Soft Delete/Restore Button */}
                {canSoftDelete ? (
                  <button
                    onClick={() => onSoftDeleteBusiness?.(business)}
                    disabled={loadingBusinessOperations[business.id]}
                    className={`p-2 ${business.softDelete ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'} ${loadingBusinessOperations[business.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={loadingBusinessOperations[business.id] ? "Processing..." : business.softDelete ? "Restore business" : "Soft delete business"}
                  >
                    {loadingBusinessOperations[business.id] ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : business.softDelete ? (
                      <Undo2 className="w-5 h-5" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setPermissionDenied({
                      show: true,
                      action: business.softDelete ? 'Restore Business' : 'Soft Delete Business',
                      requiredPermission: 'softDelete.businesses.enable',
                      message: 'You do not have permission to soft delete businesses'
                    })}
                    disabled
                    className="p-2 text-gray-300 cursor-not-allowed opacity-50"
                    title="Admin or Executive role required"
                  >
                    {business.softDelete ? (
                      <Undo2 className="w-5 h-5" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                )}

                {/* Hard Delete Button */}
                {canHardDelete ? (
                  <button
                    onClick={() => onDeleteBusiness?.(business)}
                    disabled={loadingBusinessOperations[business.id]}
                    className={`p-2 text-red-600 hover:text-red-900 dark:text-red-400 ${loadingBusinessOperations[business.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={loadingBusinessOperations[business.id] ? "Processing..." : "Permanently delete business"}
                  >
                    {loadingBusinessOperations[business.id] ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setPermissionDenied({
                      show: true,
                      action: 'Permanently Delete Business',
                      requiredPermission: 'hardDelete.businesses.enable',
                      message: 'You do not have permission to permanently delete businesses'
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
          );
        })}

        {/* Empty state */}
        {filteredBusinesses.length === 0 && (
          <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
            <p className={`${themeClasses.text.secondary}`}>No businesses found matching your filters.</p>
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

export default AdminBusinesses;