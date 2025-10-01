/**
 * Admin Service Types Management
 * Manages service types with translation support and icon selection
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Save,
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
import { themeClasses } from '../../contexts/ThemeContext';
import { adminService } from '../../services/adminService';

// MSP Service Icons mapping
const MSP_SERVICE_ICONS = {
  'Monitor': { icon: Monitor, name: 'Monitor', category: 'Infrastructure' },
  'Server': { icon: Server, name: 'Server', category: 'Infrastructure' },
  'HardDrive': { icon: HardDrive, name: 'Hard Drive', category: 'Infrastructure' },
  'Router': { icon: Router, name: 'Router/Network', category: 'Infrastructure' },
  'Laptop': { icon: Laptop, name: 'Laptop', category: 'Infrastructure' },
  'Smartphone': { icon: Smartphone, name: 'Mobile Device', category: 'Infrastructure' },
  'Printer': { icon: Printer, name: 'Printer', category: 'Infrastructure' },
  'Wifi': { icon: Wifi, name: 'WiFi/Wireless', category: 'Network' },
  'Network': { icon: Network, name: 'Network Services', category: 'Network' },
  'Globe': { icon: Globe, name: 'Internet/Web Services', category: 'Network' },
  'Shield': { icon: Shield, name: 'Security/Protection', category: 'Security' },
  'Lock': { icon: Lock, name: 'Access Control', category: 'Security' },
  'Eye': { icon: Eye, name: 'Monitoring/Surveillance', category: 'Security' },
  'AlertTriangle': { icon: AlertTriangle, name: 'Alerts/Warnings', category: 'Security' },
  'Cloud': { icon: Cloud, name: 'Cloud Services', category: 'Cloud' },
  'Database': { icon: Database, name: 'Database/Storage', category: 'Cloud' },
  'Mail': { icon: Mail, name: 'Email Services', category: 'Communication' },
  'Phone': { icon: Phone, name: 'Phone/VoIP', category: 'Communication' },
  'Headphones': { icon: Headphones, name: 'Help Desk/Support', category: 'Support' },
  'LifeBuoy': { icon: LifeBuoy, name: 'Emergency Support', category: 'Support' },
  'Wrench': { icon: Wrench, name: 'Maintenance/Repair', category: 'Support' },
  'Code': { icon: Code, name: 'Software Development', category: 'Software' },
  'Bug': { icon: Bug, name: 'Bug Fixes/Troubleshooting', category: 'Software' },
  'Settings': { icon: Settings, name: 'Configuration/Setup', category: 'Software' },
  'Activity': { icon: Activity, name: 'System Monitoring', category: 'Monitoring' },
  'BarChart3': { icon: BarChart3, name: 'Analytics/Reporting', category: 'Monitoring' },
  'Zap': { icon: Zap, name: 'Performance Optimization', category: 'Monitoring' },
  'Users': { icon: Users, name: 'User Management', category: 'Business' },
  'Building': { icon: Building, name: 'Office/Building Services', category: 'Business' },
  'FileText': { icon: FileText, name: 'Documentation/Compliance', category: 'Business' }
};

interface ServiceType {
  id: string;
  type_code: string;
  category: string;
  name_en: string;
  description_en: string;
  name_es?: string;
  description_es?: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  icon?: string;
}

interface FormData {
  type_code: string;
  category: string;
  name_en: string;
  description_en: string;
  name_es?: string;
  description_es?: string;
  sort_order: number;
  icon?: string;
}

const AdminServiceTypes: React.FC = () => {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('sort_order');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<ServiceType | null>(null);
  const [formData, setFormData] = useState<FormData>({
    type_code: '',
    category: '',
    name_en: '',
    description_en: '',
    name_es: '',
    description_es: '',
    sort_order: 999,
    icon: 'Settings'
  });

  useEffect(() => {
    loadServiceTypes();
  }, []);

  const loadServiceTypes = async () => {
    try {
      setLoading(true);
      const response = await adminService.get('/service-types/admin');
      setServiceTypes(response.data.serviceTypes);
    } catch (error) {
      console.error('Error loading service types:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingType) {
        await adminService.put(`/service-types/${editingType.id}`, formData);
      } else {
        await adminService.post('/service-types', formData);
      }
      await loadServiceTypes();
      handleCloseForm();
    } catch (error) {
      console.error('Error saving service type:', error);
    }
  };

  const handleEdit = (serviceType: ServiceType) => {
    setEditingType(serviceType);
    setFormData({
      type_code: serviceType.type_code,
      category: serviceType.category,
      name_en: serviceType.name_en,
      description_en: serviceType.description_en,
      name_es: serviceType.name_es || '',
      description_es: serviceType.description_es || '',
      sort_order: serviceType.sort_order,
      icon: serviceType.icon
    });
    setShowForm(true);
  };

  const handleToggleActive = async (serviceType: ServiceType) => {
    try {
      await adminService.patch(`/service-types/${serviceType.id}/toggle`);
      await loadServiceTypes();
    } catch (error) {
      console.error('Error toggling service type:', error);
    }
  };

  const handleDelete = async (serviceType: ServiceType) => {
    if (!confirm(`Are you sure you want to delete "${serviceType.name_en}"?`)) return;
    try {
      await adminService.delete(`/service-types/${serviceType.id}`);
      await loadServiceTypes();
    } catch (error) {
      console.error('Error deleting service type:', error);
      alert('Cannot delete this service type. It may be a system type or in use.');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingType(null);
    setFormData({
      type_code: '',
      category: '',
      name_en: '',
      description_en: '',
      name_es: '',
      description_es: '',
      sort_order: 999,
      icon: 'Settings'
    });
  };

  const filteredAndSortedTypes = serviceTypes
    .filter(type =>
      type.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.description_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.type_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortBy as keyof ServiceType];
      const bVal = b[sortBy as keyof ServiceType];
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

  const getIconComponent = (iconName?: string) => {
    if (!iconName || !MSP_SERVICE_ICONS[iconName as keyof typeof MSP_SERVICE_ICONS]) {
      return Settings;
    }
    return MSP_SERVICE_ICONS[iconName as keyof typeof MSP_SERVICE_ICONS].icon;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Service Types Management</h1>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Service Type
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1 relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${themeClasses.text.muted}`} />
          <input
            type="text"
            placeholder="Search service types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary}`}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className={`px-4 py-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.primary}`}
        >
          <option value="sort_order">Sort Order</option>
          <option value="name_en">Name</option>
          <option value="category">Category</option>
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className={`p-2 rounded-lg ${themeClasses.bg.hover}`}
        >
          <ArrowUpDown className="w-5 h-5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Service Types</div>
          <div className="text-2xl font-bold text-green-600">{serviceTypes.length}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Active</div>
          <div className="text-2xl font-bold text-blue-600">
            {serviceTypes.filter(t => t.is_active).length}
          </div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>System Types</div>
          <div className="text-2xl font-bold text-purple-600">
            {serviceTypes.filter(t => t.is_system).length}
          </div>
        </div>
      </div>

      {/* Service Types List */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedTypes.map((type) => {
            const IconComponent = getIconComponent(type.icon);
            return (
              <div
                key={type.id}
                className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md} ${
                  !type.is_active ? 'opacity-50' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <IconComponent className="w-6 h-6 text-blue-500" />
                    <div>
                      <h3 className={`font-semibold ${themeClasses.text.primary}`}>
                        {type.name_en}
                      </h3>
                      <span className={`text-xs ${themeClasses.text.muted}`}>{type.category}</span>
                    </div>
                  </div>
                  {type.is_system && (
                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                      System
                    </span>
                  )}
                </div>

                <p className={`text-sm ${themeClasses.text.secondary} mb-3 line-clamp-2`}>
                  {type.description_en}
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(type)}
                    className="flex-1 inline-flex items-center justify-center px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleActive(type)}
                    className={`px-3 py-1 text-sm rounded ${
                      type.is_active
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-800 hover:bg-green-200'
                    }`}
                  >
                    {type.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {!type.is_system && (
                    <button
                      onClick={() => handleDelete(type)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className={`relative top-10 mx-auto p-6 border w-full max-w-2xl shadow-lg rounded-md ${themeClasses.bg.modal} max-h-screen overflow-y-auto mb-10`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                {editingType ? 'Edit Service Type' : 'Add New Service Type'}
              </h3>
              <button
                onClick={handleCloseForm}
                className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Code */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                  Type Code * (lowercase-with-hyphens)
                </label>
                <input
                  type="text"
                  required
                  pattern="[a-z0-9-]+"
                  value={formData.type_code}
                  onChange={(e) => setFormData({ ...formData, type_code: e.target.value.toLowerCase() })}
                  className={`mt-1 block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  placeholder="network-support"
                  disabled={!!editingType}
                />
              </div>

              {/* Category */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                  Category *
                </label>
                <input
                  type="text"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className={`mt-1 block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  placeholder="Network, Software, Hardware, etc."
                />
              </div>

              {/* English Fields */}
              <div className="border-t pt-4">
                <h4 className={`text-sm font-semibold mb-3 ${themeClasses.text.primary}`}>English Translation</h4>
                <div className="space-y-3">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                      Name (English) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name_en}
                      onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                      className={`mt-1 block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                      placeholder="Network Support"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                      Description (English) *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={formData.description_en}
                      onChange={(e) => setFormData({ ...formData, description_en: e.target.value })}
                      className={`mt-1 block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                      placeholder="Provide network troubleshooting and support"
                    />
                  </div>
                </div>
              </div>

              {/* Spanish Fields */}
              <div className="border-t pt-4">
                <h4 className={`text-sm font-semibold mb-3 ${themeClasses.text.primary}`}>Spanish Translation (Optional)</h4>
                <div className="space-y-3">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                      Name (Spanish)
                    </label>
                    <input
                      type="text"
                      value={formData.name_es}
                      onChange={(e) => setFormData({ ...formData, name_es: e.target.value })}
                      className={`mt-1 block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                      placeholder="Soporte de Red"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                      Description (Spanish)
                    </label>
                    <textarea
                      rows={3}
                      value={formData.description_es}
                      onChange={(e) => setFormData({ ...formData, description_es: e.target.value })}
                      className={`mt-1 block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                      placeholder="Proporcionar solución de problemas y soporte de red"
                    />
                  </div>
                </div>
              </div>

              {/* Sort Order */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                  Sort Order
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 999 })}
                  className={`mt-1 block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
              </div>

              {/* Icon Picker */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                  Icon
                </label>
                <div className={`grid grid-cols-8 gap-2 max-h-60 overflow-y-auto p-2 border ${themeClasses.border.primary} rounded-md`}>
                  {Object.entries(MSP_SERVICE_ICONS).map(([key, iconData]) => {
                    const IconComponent = iconData.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: key })}
                        className={`p-2 rounded-md border-2 flex items-center justify-center h-12 ${
                          formData.icon === key
                            ? 'border-green-500 bg-green-50'
                            : themeClasses.border.primary
                        }`}
                        title={iconData.name}
                      >
                        <IconComponent className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingType ? 'Update' : 'Create'} Service Type
                </button>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServiceTypes;
