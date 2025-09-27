import React, { useState, useEffect } from 'react';
import { ChevronDown, Building, Search } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { adminService } from '../../services/adminService';

interface LocationType {
  id: string;
  type_code: string;
  display_name: string;
  category: string;
  description: string;
  icon: string;
  sort_order: number;
}

interface LocationTypeCategory {
  category: string;
  types: LocationType[];
}

interface LocationTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  showSearch?: boolean;
}

const LocationTypeSelector: React.FC<LocationTypeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = "Select location type...",
  showSearch = true
}) => {
  const [categories, setCategories] = useState<LocationTypeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Load location types on mount
  useEffect(() => {
    const loadLocationTypes = async () => {
      try {
        console.log('🔍 Loading location types...');
        const result = await adminService.getLocationTypesByCategory();
        setCategories(result.categories);
        console.log('✅ Location types loaded:', result.categories.length, 'categories');
      } catch (error) {
        console.error('❌ Failed to load location types:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLocationTypes();
  }, []);

  // Filter types based on search term
  const filteredCategories = categories.map(category => ({
    ...category,
    types: category.types.filter(type =>
      type.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(category => category.types.length > 0);

  // Get display name for selected value
  const getSelectedDisplayName = () => {
    for (const category of categories) {
      const type = category.types.find(t => t.type_code === value);
      if (type) return type.display_name;
    }
    return placeholder;
  };

  // Handle selection
  const handleSelect = (typeCode: string) => {
    onChange(typeCode);
    setIsOpen(false);
    setSearchTerm('');
  };

  // Category display names
  const getCategoryDisplayName = (category: string) => {
    const categoryNames: { [key: string]: string } = {
      'corporate': '🏢 Corporate & Business',
      'educational': '🎓 Educational',
      'religious': '⛪ Religious',
      'government': '🏛️ Government & Military',
      'healthcare': '🏥 Healthcare',
      'hospitality': '🍽️ Hospitality & Food Service',
      'cultural': '🎭 Cultural & Entertainment',
      'industrial': '🏭 Industrial & Warehouse',
      'retail': '🛍️ Retail & Commercial',
      'residential': '🏠 Residential & Community',
      'technology': '💻 Technology',
      'other': '📋 Other'
    };
    return categoryNames[category] || category;
  };

  if (loading) {
    return (
      <div className={`relative w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.muted}`}>
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
          Loading location types...
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Selected Value Display */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`relative w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <span className={value ? themeClasses.text.primary : themeClasses.text.muted}>
          {getSelectedDisplayName()}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <ChevronDown className={`w-4 h-4 ${themeClasses.text.muted} transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className={`absolute z-50 mt-1 w-full ${themeClasses.bg.modal} border ${themeClasses.border.primary} rounded-md shadow-lg max-h-96 overflow-hidden`}>
          {/* Search */}
          {showSearch && (
            <div className="p-3 border-b">
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${themeClasses.text.muted}`} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search location types..."
                  className={`w-full pl-10 pr-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
            </div>
          )}

          {/* Categories and Types */}
          <div className="max-h-64 overflow-y-auto">
            {filteredCategories.length === 0 ? (
              <div className={`p-3 text-center ${themeClasses.text.muted}`}>
                {searchTerm ? 'No location types found' : 'No location types available'}
              </div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category.category}>
                  {/* Category Header */}
                  <div className={`px-3 py-2 text-xs font-medium uppercase tracking-wider ${themeClasses.text.muted} ${themeClasses.bg.secondary} border-b`}>
                    {getCategoryDisplayName(category.category)}
                  </div>

                  {/* Location Types */}
                  {category.types.map((type) => (
                    <button
                      key={type.type_code}
                      onClick={() => handleSelect(type.type_code)}
                      className={`w-full px-3 py-2 text-left hover:${themeClasses.bg.hover} focus:outline-none focus:${themeClasses.bg.hover} border-b border-gray-100 dark:border-gray-700 ${
                        value === type.type_code ? `${themeClasses.bg.selected} ${themeClasses.text.primary}` : themeClasses.text.secondary
                      }`}
                    >
                      <div className="flex items-center">
                        <Building className="w-4 h-4 mr-3 flex-shrink-0" />
                        <div>
                          <div className={`font-medium ${themeClasses.text.primary}`}>
                            {type.display_name}
                          </div>
                          {type.description && (
                            <div className={`text-xs ${themeClasses.text.muted} mt-1`}>
                              {type.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default LocationTypeSelector;