import React from 'react';
import { Search } from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { Filters, Status, Technician } from './types';

interface FilterBarProps {
  filters: Filters;
  statuses: Status[];
  technicians: Technician[];
  filterPresets: Array<{ id: string; name: string; description: string }>;
  uniqueClients: Array<{ id: string; name: string }>;
  onFiltersChange: (filters: Filters) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  statuses,
  technicians,
  filterPresets,
  uniqueClients,
  onFiltersChange
}) => {
  const { isDark } = useTheme();

  const handleFilterChange = (key: keyof Filters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      status: '*Open',
      urgency: 'all',
      priority: 'all',
      business: 'all',
      technician: 'all'
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.status !== '*Open' ||
    filters.urgency !== 'all' ||
    filters.priority !== 'all' ||
    filters.business !== 'all' ||
    filters.technician !== 'all';

  return (
    <div className={`hidden md:block ${themeClasses.bg.card} border ${themeClasses.border.primary} rounded-lg p-6`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Search */}
        <div className="md:col-span-2 lg:col-span-3 xl:col-span-2">
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Search
          </label>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${themeClasses.text.muted}`} />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Request #, title, client, business..."
              className={`w-full pl-10 pr-4 py-2 rounded-lg ${themeClasses.input}`}
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="all">All Statuses</option>
            {/* Admin-defined filter presets (with * prefix) */}
            {filterPresets.map(preset => (
              <option key={preset.id} value={`*${preset.name}`}>
                *{preset.name} {preset.description ? `- ${preset.description}` : ''}
              </option>
            ))}
            {/* Individual statuses from database */}
            {statuses
              .filter(s => s.is_active)
              .sort((a, b) => a.display_order - b.display_order)
              .map(status => (
                <option key={status.id} value={status.name}>
                  {status.name}
                </option>
              ))}
          </select>
        </div>

        {/* Urgency */}
        <div>
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Urgency
          </label>
          <select
            value={filters.urgency}
            onChange={(e) => handleFilterChange('urgency', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="all">All Urgencies</option>
            <option value="normal">Normal</option>
            <option value="prime">Prime</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Priority
          </label>
          <select
            value={filters.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Technician */}
        <div>
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Technician
          </label>
          <select
            value={filters.technician}
            onChange={(e) => handleFilterChange('technician', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="all">All Technicians</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name}
              </option>
            ))}
          </select>
        </div>

        {/* Client/Business */}
        <div>
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Client
          </label>
          <select
            value={filters.business}
            onChange={(e) => handleFilterChange('business', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="all">All Clients</option>
            {uniqueClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className="mt-4">
          <button
            onClick={clearFilters}
            className={`text-sm ${themeClasses.text.link} hover:underline`}
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterBar;
