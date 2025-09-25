import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  X,
  Save,
  DollarSign,
  Clock,
  Settings,
  ArrowUpDown,
  // MSP Service Icons
  Monitor,
  Wifi,
  Shield,
  Server,
  HardDrive,
  Cloud,
  Network,
  Database,
  Smartphone,
  Laptop,
  Printer,
  Router,
  Lock,
  Eye,
  AlertTriangle,
  Zap,
  Globe,
  Mail,
  Phone,
  Headphones,
  LifeBuoy,
  Wrench,
  Code,
  Bug,
  Activity,
  BarChart3,
  FileText,
  Users,
  Building
} from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';

// MSP Service Icons mapping
const MSP_SERVICE_ICONS = {
  // Infrastructure & Hardware
  'Monitor': { icon: Monitor, name: 'Monitor', category: 'Infrastructure' },
  'Server': { icon: Server, name: 'Server', category: 'Infrastructure' },
  'HardDrive': { icon: HardDrive, name: 'Hard Drive', category: 'Infrastructure' },
  'Router': { icon: Router, name: 'Router/Network', category: 'Infrastructure' },
  'Laptop': { icon: Laptop, name: 'Laptop', category: 'Infrastructure' },
  'Smartphone': { icon: Smartphone, name: 'Mobile Device', category: 'Infrastructure' },
  'Printer': { icon: Printer, name: 'Printer', category: 'Infrastructure' },

  // Network & Connectivity
  'Wifi': { icon: Wifi, name: 'WiFi/Wireless', category: 'Network' },
  'Network': { icon: Network, name: 'Network Services', category: 'Network' },
  'Globe': { icon: Globe, name: 'Internet/Web Services', category: 'Network' },

  // Security
  'Shield': { icon: Shield, name: 'Security/Protection', category: 'Security' },
  'Lock': { icon: Lock, name: 'Access Control', category: 'Security' },
  'Eye': { icon: Eye, name: 'Monitoring/Surveillance', category: 'Security' },
  'AlertTriangle': { icon: AlertTriangle, name: 'Alerts/Warnings', category: 'Security' },

  // Cloud & Data
  'Cloud': { icon: Cloud, name: 'Cloud Services', category: 'Cloud' },
  'Database': { icon: Database, name: 'Database/Storage', category: 'Cloud' },

  // Communication
  'Mail': { icon: Mail, name: 'Email Services', category: 'Communication' },
  'Phone': { icon: Phone, name: 'Phone/VoIP', category: 'Communication' },

  // Support & Maintenance
  'Headphones': { icon: Headphones, name: 'Help Desk/Support', category: 'Support' },
  'LifeBuoy': { icon: LifeBuoy, name: 'Emergency Support', category: 'Support' },
  'Wrench': { icon: Wrench, name: 'Maintenance/Repair', category: 'Support' },

  // Software & Development
  'Code': { icon: Code, name: 'Software Development', category: 'Software' },
  'Bug': { icon: Bug, name: 'Bug Fixes/Troubleshooting', category: 'Software' },
  'Settings': { icon: Settings, name: 'Configuration/Setup', category: 'Software' },

  // Monitoring & Analytics
  'Activity': { icon: Activity, name: 'System Monitoring', category: 'Monitoring' },
  'BarChart3': { icon: BarChart3, name: 'Analytics/Reporting', category: 'Monitoring' },
  'Zap': { icon: Zap, name: 'Performance Optimization', category: 'Monitoring' },

  // Business & Management
  'Users': { icon: Users, name: 'User Management', category: 'Business' },
  'Building': { icon: Building, name: 'Office/Building Services', category: 'Business' },
  'FileText': { icon: FileText, name: 'Documentation/Compliance', category: 'Business' }
};

interface Service {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  estimatedHours: number;
  category?: string;
  isActive?: boolean;
  icon?: string;
}

interface AdminServicesProps {
  services: Service[];
  setServices: (services: Service[]) => void;
  showAddServiceForm: boolean;
  setShowAddServiceForm: (show: boolean) => void;
  newServiceData: any;
  setNewServiceData: (data: any) => void;
  handleAddService: (e: React.FormEvent) => void;
}

const AdminServices: React.FC<AdminServicesProps> = ({
  services,
  setServices,
  showAddServiceForm,
  setShowAddServiceForm,
  newServiceData,
  setNewServiceData,
  handleAddService
}) => {
  const { theme } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  // Filter and sort services
  const getFilteredAndSortedServices = () => {
    const filtered = services.filter(service =>
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      const aValue = a[sortBy as keyof Service];
      const bValue = b[sortBy as keyof Service];

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  };

  // Handle service deletion
  const handleDeleteService = (serviceId: string) => {
    if (window.confirm('Are you sure you want to delete this service?')) {
      setServices(services.filter(service => service.id !== serviceId));
    }
  };

  // Handle service editing
  const handleEditService = (service: Service) => {
    setEditingService(service);
    setShowEditForm(true);
  };

  const handleUpdateService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;

    setServices(services.map(service =>
      service.id === editingService.id ? editingService : service
    ));
    setShowEditForm(false);
    setEditingService(null);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSortBy('name');
    setSortOrder('asc');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Service Management</h1>
        <button
          onClick={() => setShowAddServiceForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Service
        </button>
      </div>

      {/* Add Service Form Modal */}
      {showAddServiceForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className={`relative top-10 mx-auto p-6 border w-full max-w-md shadow-lg rounded-md ${themeClasses.bg.modal} max-h-screen overflow-y-auto`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Add New Service</h3>
              <button
                onClick={() => setShowAddServiceForm(false)}
                className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddService} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Service Name</label>
                <input
                  type="text"
                  required
                  value={newServiceData.name || ''}
                  onChange={(e) => setNewServiceData({ ...newServiceData, name: e.target.value })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  placeholder="Enter service name"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Description</label>
                <textarea
                  required
                  value={newServiceData.description || ''}
                  onChange={(e) => setNewServiceData({ ...newServiceData, description: e.target.value })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  rows={3}
                  placeholder="Enter service description"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Base Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={newServiceData.basePrice || 0}
                  onChange={(e) => setNewServiceData({ ...newServiceData, basePrice: parseFloat(e.target.value) || 0 })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Estimated Hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={newServiceData.estimatedHours || 0}
                  onChange={(e) => setNewServiceData({ ...newServiceData, estimatedHours: parseFloat(e.target.value) || 0 })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  placeholder="0"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Service Icon</label>
                <div className={`mt-2 grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 border ${themeClasses.border.primary} rounded-md`}>
                  {Object.entries(MSP_SERVICE_ICONS).map(([key, iconData]) => {
                    const IconComponent = iconData.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewServiceData({ ...newServiceData, icon: key })}
                        className={`p-2 rounded-md border-2 flex flex-col items-center justify-center h-16 ${themeClasses.bg.hover} ${
                          newServiceData.icon === key
                            ? 'border-green-500 bg-green-50'
                            : themeClasses.border.primary
                        }`}
                        title={iconData.name}
                      >
                        <IconComponent className={`w-5 h-5 ${themeClasses.text.secondary}`} />
                        <span className={`text-xs ${themeClasses.text.muted} mt-1 text-center leading-tight`}>
                          {iconData.name.split('/')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className={`mt-1 text-xs ${themeClasses.text.muted}`}>
                  Select an icon that best represents this service. Icons are categorized by service type.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddServiceForm(false)}
                  className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.hover}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Add Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Service Form Modal */}
      {showEditForm && editingService && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className={`relative top-10 mx-auto p-6 border w-full max-w-md shadow-lg rounded-md ${themeClasses.bg.modal} max-h-screen overflow-y-auto`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Edit Service</h3>
              <button
                onClick={() => setShowEditForm(false)}
                className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateService} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Service Name</label>
                <input
                  type="text"
                  required
                  value={editingService.name}
                  onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Description</label>
                <textarea
                  required
                  value={editingService.description}
                  onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  rows={3}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Base Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editingService.basePrice}
                  onChange={(e) => setEditingService({ ...editingService, basePrice: parseFloat(e.target.value) || 0 })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Estimated Hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={editingService.estimatedHours}
                  onChange={(e) => setEditingService({ ...editingService, estimatedHours: parseFloat(e.target.value) || 0 })}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
                  className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.hover}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Update Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="flex items-center">
            <Search className={`w-4 h-4 mr-2 ${themeClasses.text.muted}`} />
            <input
              type="text"
              placeholder="Search services..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`flex-1 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
            />
          </div>

          <div className="flex items-center">
            <ArrowUpDown className={`w-4 h-4 mr-2 ${themeClasses.text.muted}`} />
            <span className={`text-sm font-medium ${themeClasses.text.secondary} mr-2`}>Sort:</span>
            <select
              className={`rounded-md text-sm flex-1 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="basePrice">Price</option>
              <option value="estimatedHours">Hours</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className={`ml-2 p-1 ${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <div>
            <button
              className={`px-3 py-2 text-sm ${themeClasses.bg.secondary} ${themeClasses.bg.hover} rounded-md ${themeClasses.text.secondary}`}
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Services</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{services.length}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Filtered Results</div>
          <div className="text-2xl font-bold text-green-600">{getFilteredAndSortedServices().length}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Avg. Price</div>
          <div className="text-2xl font-bold text-blue-600">
            ${services.length > 0 ? (services.reduce((sum, s) => sum + s.basePrice, 0) / services.length).toFixed(0) : '0'}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Avg. Hours</div>
          <div className="text-2xl font-bold text-purple-600">
            {services.length > 0 ? (services.reduce((sum, s) => sum + s.estimatedHours, 0) / services.length).toFixed(1) : '0'}
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {getFilteredAndSortedServices().map((service) => (
          <div key={service.id} className={`${themeClasses.bg.card} overflow-hidden ${themeClasses.shadow.md} rounded-lg hover:${themeClasses.shadow.lg} transition-shadow`}>
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>{service.name}</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditService(service)}
                    className="text-blue-600 hover:text-blue-800"
                    title="Edit service"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteService(service.id)}
                    className="text-red-600 hover:text-red-800"
                    title="Delete service"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>{service.description}</p>

              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <DollarSign className="w-4 h-4 text-green-500 mr-1" />
                  <span className={`text-lg font-semibold ${themeClasses.text.primary}`}>${service.basePrice}</span>
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 text-blue-500 mr-1" />
                  <span className={`text-sm ${themeClasses.text.secondary}`}>{service.estimatedHours}h</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {getFilteredAndSortedServices().length === 0 && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6 text-center`}>
          <Settings className={`mx-auto h-12 w-12 ${themeClasses.text.muted}`} />
          <h3 className={`mt-2 text-sm font-medium ${themeClasses.text.primary}`}>No services found</h3>
          <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
            {searchTerm ? 'Try adjusting your search terms.' : 'Get started by creating a new service.'}
          </p>
          {!searchTerm && (
            <div className="mt-6">
              <button
                onClick={() => setShowAddServiceForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Service
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminServices;