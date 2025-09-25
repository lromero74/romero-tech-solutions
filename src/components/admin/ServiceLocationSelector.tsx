import React, { useState, useEffect } from 'react';
import { CheckSquare, Square, ChevronRight, ChevronDown, MapPin, Building2, Globe, Navigation } from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';

interface LocationItem {
  location_type: string;
  id: number;
  code: string | null;
  name: string;
  parent_id: number | null;
  parent_name: string | null;
}

interface ServiceLocationSelection {
  location_type: string;
  location_id: number;
  notes?: string;
}

interface ServiceLocationSelectorProps {
  initialSelections?: ServiceLocationSelection[];
  onSelectionChange: (selections: ServiceLocationSelection[]) => void;
  disabled?: boolean;
}

interface LocationNode extends LocationItem {
  children?: LocationNode[];
  expanded?: boolean;
  selected?: boolean;
  indeterminate?: boolean;
}

const ServiceLocationSelector: React.FC<ServiceLocationSelectorProps> = ({
  initialSelections = [],
  onSelectionChange,
  disabled = false
}) => {
  const { theme } = useTheme();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationTree, setLocationTree] = useState<LocationNode[]>([]);
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadLocationData();
  }, []);

  // Convert initial selections to Set format
  useEffect(() => {
    const initialSelectionSet = new Set(
      initialSelections.map(s => `${s.location_type}:${s.location_id}`)
    );
    setSelections(initialSelectionSet);
  }, [initialSelections]);

  const loadLocationData = async () => {
    try {
      const response = await fetch('/api/locations/all', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to load location data');

      const data = await response.json();
      setLocations(data.locations);
      buildLocationTree(data.locations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const buildLocationTree = (locationData: LocationItem[]) => {
    // Group by type and build hierarchy
    const states = locationData.filter(l => l.location_type === 'state');
    const counties = locationData.filter(l => l.location_type === 'county');
    const cities = locationData.filter(l => l.location_type === 'city');
    const zipcodes = locationData.filter(l => l.location_type === 'zipcode');
    const areaCodes = locationData.filter(l => l.location_type === 'area_code');

    const tree: LocationNode[] = states.map(state => ({
      ...state,
      expanded: false,
      selected: false,
      indeterminate: false,
      children: counties
        .filter(county => county.parent_id === state.id)
        .map(county => ({
          ...county,
          expanded: false,
          selected: false,
          indeterminate: false,
          children: [
            ...cities
              .filter(city => city.parent_id === county.id)
              .map(city => ({
                ...city,
                expanded: false,
                selected: false,
                indeterminate: false,
                children: zipcodes
                  .filter(zip => zip.parent_id === city.id)
                  .map(zip => ({ ...zip, selected: false, indeterminate: false }))
              })),
            ...areaCodes
              .filter(ac => ac.parent_id === county.id)
              .map(ac => ({ ...ac, selected: false, indeterminate: false }))
          ]
        }))
    }));

    setLocationTree(tree);
  };

  // Update tree with selections and propagate changes
  const updateTreeWithSelections = (tree: LocationNode[], selectionSet: Set<string>): LocationNode[] => {
    return tree.map(node => {
      const nodeKey = `${node.location_type}:${node.id}`;
      const hasChildren = node.children && node.children.length > 0;

      let updatedNode = { ...node };

      if (hasChildren) {
        // Recursively update children
        updatedNode.children = updateTreeWithSelections(node.children!, selectionSet);

        // Calculate parent state based on children
        const selectedChildren = updatedNode.children.filter(child => child.selected);
        const indeterminateChildren = updatedNode.children.filter(child => child.indeterminate);

        if (selectedChildren.length === updatedNode.children.length) {
          updatedNode.selected = true;
          updatedNode.indeterminate = false;
        } else if (selectedChildren.length > 0 || indeterminateChildren.length > 0) {
          updatedNode.selected = false;
          updatedNode.indeterminate = true;
        } else {
          updatedNode.selected = false;
          updatedNode.indeterminate = false;
        }
      } else {
        // Leaf node - check if directly selected
        updatedNode.selected = selectionSet.has(nodeKey);
        updatedNode.indeterminate = false;
      }

      return updatedNode;
    });
  };

  // Get all descendant node keys
  const getAllDescendantKeys = (node: LocationNode): string[] => {
    const keys = [`${node.location_type}:${node.id}`];
    if (node.children) {
      node.children.forEach(child => {
        keys.push(...getAllDescendantKeys(child));
      });
    }
    return keys;
  };

  // Handle checkbox changes with smart cascading
  const handleNodeToggle = (node: LocationNode) => {
    if (disabled) return;

    const nodeKey = `${node.location_type}:${node.id}`;
    const newSelections = new Set(selections);

    if (node.selected || node.indeterminate) {
      // Unselect: remove this node and all descendants
      const keysToRemove = getAllDescendantKeys(node);
      keysToRemove.forEach(key => newSelections.delete(key));
    } else {
      // Select: add this node and all descendants
      const keysToAdd = getAllDescendantKeys(node);
      keysToAdd.forEach(key => newSelections.add(key));
    }

    setSelections(newSelections);

    // Convert to ServiceLocationSelection format and notify parent
    const selectionArray: ServiceLocationSelection[] = Array.from(newSelections).map(key => {
      const [location_type, location_id] = key.split(':');
      return {
        location_type,
        location_id: parseInt(location_id)
      };
    });

    onSelectionChange(selectionArray);
  };

  // Toggle node expansion
  const toggleExpansion = (nodeId: number, locationType: string) => {
    const updateExpansion = (nodes: LocationNode[]): LocationNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId && node.location_type === locationType) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: updateExpansion(node.children) };
        }
        return node;
      });
    };

    setLocationTree(updateExpansion(locationTree));
  };

  // Update the tree whenever selections change
  useEffect(() => {
    setLocationTree(currentTree => updateTreeWithSelections(currentTree, selections));
  }, [selections]);

  const getLocationIcon = (locationType: string) => {
    switch (locationType) {
      case 'state': return <Globe className="w-4 h-4 text-blue-500" />;
      case 'county': return <Building2 className="w-4 h-4 text-green-500" />;
      case 'city': return <MapPin className="w-4 h-4 text-purple-500" />;
      case 'zipcode': return <Navigation className="w-4 h-4 text-orange-500" />;
      case 'area_code': return <span className="w-4 h-4 text-red-500 text-xs font-bold">☎</span>;
      default: return <MapPin className="w-4 h-4" />;
    }
  };

  const renderLocationNode = (node: LocationNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const paddingLeft = depth * 24;

    return (
      <div key={`${node.location_type}-${node.id}`} className="select-none">
        <div
          className={`flex items-center py-2 px-3 hover:${themeClasses[theme].hover} rounded-lg cursor-pointer transition-colors`}
          style={{ paddingLeft: `${paddingLeft + 12}px` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleExpansion(node.id, node.location_type)}
              className="mr-2 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              {node.expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}

          {!hasChildren && <div className="w-5 mr-2" />}

          <button
            onClick={() => handleNodeToggle(node)}
            disabled={disabled}
            className="mr-3 p-0.5"
          >
            {node.selected ? (
              <CheckSquare className="w-5 h-5 text-blue-500" />
            ) : node.indeterminate ? (
              <div className="w-5 h-5 border-2 border-blue-500 bg-blue-100 dark:bg-blue-900 flex items-center justify-center rounded">
                <div className="w-2 h-2 bg-blue-500 rounded-sm" />
              </div>
            ) : (
              <Square className="w-5 h-5 text-gray-400" />
            )}
          </button>

          <div className="flex items-center space-x-2 flex-1">
            {getLocationIcon(node.location_type)}
            <span className={`${themeClasses[theme].text} capitalize font-medium`}>
              {node.name}
            </span>
            {node.code && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({node.code})
              </span>
            )}
          </div>
        </div>

        {hasChildren && node.expanded && (
          <div>
            {node.children!.map(child => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`p-6 ${themeClasses[theme].cardBg} rounded-lg border ${themeClasses[theme].border}`}>
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span className={themeClasses[theme].text}>Loading service locations...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${themeClasses[theme].cardBg} rounded-lg border border-red-300 dark:border-red-700`}>
        <div className="text-red-600 dark:text-red-400">
          Error loading locations: {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClasses[theme].cardBg} rounded-lg border ${themeClasses[theme].border}`}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className={`text-lg font-semibold ${themeClasses[theme].text} flex items-center space-x-2`}>
          <MapPin className="w-5 h-5" />
          <span>Service Area Selection</span>
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Select counties, cities, ZIP codes, or area codes where services are provided.
          Selecting a parent automatically includes all children.
        </p>
      </div>

      <div className="p-4 max-h-96 overflow-y-auto">
        {locationTree.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No location data available
          </div>
        ) : (
          locationTree.map(node => renderLocationNode(node))
        )}
      </div>

      {selections.size > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            <strong>{selections.size}</strong> location{selections.size !== 1 ? 's' : ''} selected
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceLocationSelector;