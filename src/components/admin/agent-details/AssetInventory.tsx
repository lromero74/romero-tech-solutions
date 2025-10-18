import React, { useState, useEffect } from 'react';
import { themeClasses } from '../../../contexts/ThemeContext';
import agentService, {
  HardwareInventory as HardwareInventoryType,
  SoftwareInventory,
  StorageDevice,
} from '../../../services/agentService';

interface AssetInventoryProps {
  agentId: string;
}

type TabType = 'hardware' | 'software' | 'storage';

const AssetInventory: React.FC<AssetInventoryProps> = ({ agentId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('hardware');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hardware state
  const [hardware, setHardware] = useState<HardwareInventoryType | null>(null);
  const [hasHardwareData, setHasHardwareData] = useState(false);

  // Software state
  const [software, setSoftware] = useState<SoftwareInventory[]>([]);
  const [softwareStats, setSoftwareStats] = useState<{
    total_packages: number;
    package_managers_count: number;
    categories_count: number;
    total_size_mb: number;
  } | null>(null);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareFilter, setSoftwareFilter] = useState({
    package_manager: '',
    category: '',
  });

  // Storage state
  const [storage, setStorage] = useState<StorageDevice[]>([]);
  const [storageStats, setStorageStats] = useState<{
    total_devices: number;
    total_capacity_gb: number;
    devices_with_issues: number;
  } | null>(null);

  // Load hardware inventory
  const loadHardwareInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentService.getHardwareInventory(agentId);
      if (response.success && response.data) {
        setHardware(response.data.hardware);
        setHasHardwareData(response.data.has_data);
      } else {
        setError(response.message || 'Failed to load hardware inventory');
      }
    } catch (err) {
      setError('Error loading hardware inventory');
      console.error('Hardware inventory error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load software inventory
  const loadSoftwareInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentService.getSoftwareInventory(agentId, {
        search: softwareSearch || undefined,
        package_manager: softwareFilter.package_manager || undefined,
        category: softwareFilter.category || undefined,
      });
      if (response.success && response.data) {
        setSoftware(response.data.software);
        setSoftwareStats(response.data.stats);
      } else {
        setError(response.message || 'Failed to load software inventory');
      }
    } catch (err) {
      setError('Error loading software inventory');
      console.error('Software inventory error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load storage inventory
  const loadStorageInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentService.getStorageInventory(agentId);
      if (response.success && response.data) {
        setStorage(response.data.storage);
        setStorageStats(response.data.stats);
      } else {
        setError(response.message || 'Failed to load storage inventory');
      }
    } catch (err) {
      setError('Error loading storage inventory');
      console.error('Storage inventory error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'hardware') {
      loadHardwareInventory();
    } else if (activeTab === 'software') {
      loadSoftwareInventory();
    } else if (activeTab === 'storage') {
      loadStorageInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, activeTab, softwareSearch, softwareFilter]);

  // Format bytes to human-readable
  const formatBytes = (bytes: number | null): string => {
    if (bytes === null || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Render hardware details
  const renderHardwareTab = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      );
    }

    if (!hasHardwareData || !hardware) {
      return (
        <div className={`text-center py-12 ${themeClasses.text.secondary}`}>
          <p>No hardware inventory data available.</p>
          <p className="text-sm mt-2">Data will be collected on the next inventory scan (runs every 24 hours).</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* CPU Information */}
        <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
          <h3 className={`text-lg font-semibold mb-3 ${themeClasses.text.primary}`}>Processor (CPU)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Model:</span>
              <p className={themeClasses.text.primary}>{hardware.cpu_model || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Architecture:</span>
              <p className={themeClasses.text.primary}>{hardware.cpu_architecture || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Cores:</span>
              <p className={themeClasses.text.primary}>{hardware.cpu_cores || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Threads:</span>
              <p className={themeClasses.text.primary}>{hardware.cpu_threads || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Speed:</span>
              <p className={themeClasses.text.primary}>
                {hardware.cpu_speed_mhz ? `${hardware.cpu_speed_mhz} MHz` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Memory Information */}
        <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
          <h3 className={`text-lg font-semibold mb-3 ${themeClasses.text.primary}`}>Memory (RAM)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Total Memory:</span>
              <p className={themeClasses.text.primary}>
                {hardware.total_memory_gb ? `${Number(hardware.total_memory_gb).toFixed(2)} GB` : 'N/A'}
              </p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Memory Type:</span>
              <p className={themeClasses.text.primary}>{hardware.memory_type || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Memory Speed:</span>
              <p className={themeClasses.text.primary}>
                {hardware.memory_speed_mhz ? `${hardware.memory_speed_mhz} MHz` : 'N/A'}
              </p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Slots Used:</span>
              <p className={themeClasses.text.primary}>
                {hardware.memory_slots_used || 'N/A'}
                {hardware.memory_slots_total ? ` of ${hardware.memory_slots_total}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* System Information */}
        <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
          <h3 className={`text-lg font-semibold mb-3 ${themeClasses.text.primary}`}>System Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Manufacturer:</span>
              <p className={themeClasses.text.primary}>{hardware.manufacturer || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Model:</span>
              <p className={themeClasses.text.primary}>{hardware.model || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Serial Number:</span>
              <p className={themeClasses.text.primary}>{hardware.serial_number || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Chassis Type:</span>
              <p className={themeClasses.text.primary}>{hardware.chassis_type || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Motherboard:</span>
              <p className={themeClasses.text.primary}>
                {hardware.motherboard_manufacturer || ''} {hardware.motherboard_model || 'N/A'}
              </p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>BIOS Version:</span>
              <p className={themeClasses.text.primary}>{hardware.bios_version || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Display & Network */}
        <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
          <h3 className={`text-lg font-semibold mb-3 ${themeClasses.text.primary}`}>Display & Network</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Display Count:</span>
              <p className={themeClasses.text.primary}>{hardware.display_count || 0}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Primary Resolution:</span>
              <p className={themeClasses.text.primary}>{hardware.primary_display_resolution || 'N/A'}</p>
            </div>
            <div>
              <span className={`text-sm ${themeClasses.text.secondary}`}>Network Interfaces:</span>
              <p className={themeClasses.text.primary}>{hardware.network_interface_count || 0}</p>
            </div>
          </div>
        </div>

        {/* Battery (if applicable) */}
        {hardware.has_battery && (
          <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
            <h3 className={`text-lg font-semibold mb-3 ${themeClasses.text.primary}`}>Battery</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className={`text-sm ${themeClasses.text.secondary}`}>Health:</span>
                <p className={themeClasses.text.primary}>
                  {hardware.battery_health_percent ? `${hardware.battery_health_percent}%` : 'N/A'}
                </p>
              </div>
              <div>
                <span className={`text-sm ${themeClasses.text.secondary}`}>Cycle Count:</span>
                <p className={themeClasses.text.primary}>{hardware.battery_cycle_count || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div className={`text-sm ${themeClasses.text.secondary} text-right`}>
          Last updated: {formatDate(hardware.last_updated_at)}
        </div>
      </div>
    );
  };

  // Render software tab
  const renderSoftwareTab = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Statistics */}
        {softwareStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Total Packages</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {softwareStats.total_packages || 0}
              </p>
            </div>
            <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Package Managers</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {softwareStats.package_managers_count || 0}
              </p>
            </div>
            <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Categories</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {softwareStats.categories_count || 0}
              </p>
            </div>
            <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Total Size</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {softwareStats.total_size_mb
                  ? `${(Number(softwareStats.total_size_mb) / 1024).toFixed(1)} GB`
                  : 'N/A'}
              </p>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search software..."
            value={softwareSearch}
            onChange={(e) => setSoftwareSearch(e.target.value)}
            className={`flex-1 px-4 py-2 rounded-lg ${themeClasses.input}`}
          />
          <select
            value={softwareFilter.package_manager}
            onChange={(e) =>
              setSoftwareFilter({ ...softwareFilter, package_manager: e.target.value })
            }
            className={`px-4 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="">All Package Managers</option>
            <option value="brew">Homebrew</option>
            <option value="apt">APT</option>
            <option value="yum">YUM/DNF</option>
            <option value="snap">Snap</option>
            <option value="flatpak">Flatpak</option>
          </select>
        </div>

        {/* Software Table */}
        {software.length === 0 ? (
          <div className={`text-center py-12 ${themeClasses.text.secondary}`}>
            <p>No software packages found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.card}>
                <tr>
                  <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${themeClasses.text.secondary}`}>
                    Name
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${themeClasses.text.secondary}`}>
                    Version
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${themeClasses.text.secondary}`}>
                    Publisher
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${themeClasses.text.secondary}`}>
                    Package Manager
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${themeClasses.text.secondary}`}>
                    Category
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${themeClasses.text.secondary}`}>
                    Size
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-200 dark:divide-gray-700`}>
                {software.map((sw) => (
                  <tr key={sw.id} className={themeClasses.bg.card}>
                    <td className={`px-4 py-3 ${themeClasses.text.primary}`}>{sw.software_name}</td>
                    <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                      {sw.software_version || 'N/A'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                      {sw.software_publisher || 'N/A'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                      {sw.package_manager || 'N/A'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                      {sw.software_category || 'N/A'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                      {sw.size_mb ? `${Number(sw.size_mb).toFixed(1)} MB` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Render storage tab
  const renderStorageTab = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Statistics */}
        {storageStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Total Devices</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {storageStats.total_devices || 0}
              </p>
            </div>
            <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Total Capacity</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {storageStats.total_capacity_gb
                  ? `${Number(storageStats.total_capacity_gb).toFixed(1)} GB`
                  : 'N/A'}
              </p>
            </div>
            <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Devices with Issues</p>
              <p className={`text-2xl font-bold ${storageStats.devices_with_issues > 0 ? 'text-red-500 dark:text-red-400' : themeClasses.text.primary}`}>
                {storageStats.devices_with_issues || 0}
              </p>
            </div>
          </div>
        )}

        {/* Storage Devices */}
        {storage.length === 0 ? (
          <div className={`text-center py-12 ${themeClasses.text.secondary}`}>
            <p>No storage devices found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {storage.map((device) => (
              <div key={device.id} className={`${themeClasses.bg.card} p-4 rounded-lg`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                      {device.device_name}
                    </h4>
                    <p className={`text-sm ${themeClasses.text.secondary}`}>
                      {device.model || 'Unknown Model'}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      device.health_status === 'Healthy'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}
                  >
                    {device.health_status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <span className={`text-sm ${themeClasses.text.secondary}`}>Type:</span>
                    <p className={themeClasses.text.primary}>{device.device_type || 'N/A'}</p>
                  </div>
                  <div>
                    <span className={`text-sm ${themeClasses.text.secondary}`}>Capacity:</span>
                    <p className={themeClasses.text.primary}>
                      {device.capacity_gb ? `${Number(device.capacity_gb).toFixed(1)} GB` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className={`text-sm ${themeClasses.text.secondary}`}>Interface:</span>
                    <p className={themeClasses.text.primary}>{device.interface_type || 'N/A'}</p>
                  </div>
                </div>

                {/* SMART Data */}
                {device.smart_status && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h5 className={`text-sm font-semibold mb-2 ${themeClasses.text.primary}`}>
                      SMART Status
                    </h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <span className={`text-xs ${themeClasses.text.secondary}`}>Status:</span>
                        <p className={`text-sm ${themeClasses.text.primary}`}>{device.smart_status}</p>
                      </div>
                      <div>
                        <span className={`text-xs ${themeClasses.text.secondary}`}>Temperature:</span>
                        <p className={`text-sm ${themeClasses.text.primary}`}>
                          {device.smart_temperature_c ? `${device.smart_temperature_c}°C` : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className={`text-xs ${themeClasses.text.secondary}`}>Power-On Hours:</span>
                        <p className={`text-sm ${themeClasses.text.primary}`}>
                          {device.smart_power_on_hours?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className={`text-xs ${themeClasses.text.secondary}`}>Reallocated Sectors:</span>
                        <p className={`text-sm ${themeClasses.text.primary}`}>
                          {device.smart_reallocated_sectors || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('hardware')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'hardware'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : themeClasses.text.secondary
          }`}
        >
          Hardware
        </button>
        <button
          onClick={() => setActiveTab('software')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'software'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : themeClasses.text.secondary
          }`}
        >
          Software
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'storage'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : themeClasses.text.secondary
          }`}
        >
          Storage
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Tab Content */}
      <div>
        {activeTab === 'hardware' && renderHardwareTab()}
        {activeTab === 'software' && renderSoftwareTab()}
        {activeTab === 'storage' && renderStorageTab()}
      </div>
    </div>
  );
};

export default AssetInventory;
