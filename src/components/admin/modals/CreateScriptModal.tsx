import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { automationService, ScriptCategory } from '../../../services/automationService';

interface CreateScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateScriptModal: React.FC<CreateScriptModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ScriptCategory[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    script_name: '',
    script_type: 'bash' as 'bash' | 'powershell' | 'python' | 'node',
    category_id: '',
    description: '',
    script_content: '',
    is_builtin: false,
    tags: '',
    platform_windows: false,
    platform_linux: true,
    platform_macos: true,
    timeout_seconds: 300,
    requires_elevation: false,
  });

  // Load categories on mount
  useEffect(() => {
    if (isOpen) {
      loadCategories();
    }
  }, [isOpen]);

  const loadCategories = async () => {
    try {
      const response = await automationService.getCategories();
      if (response.success && response.data) {
        setCategories(response.data.categories);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.script_name.trim()) {
        setError('Script name is required');
        setLoading(false);
        return;
      }

      if (!formData.script_content.trim()) {
        setError('Script content is required');
        setLoading(false);
        return;
      }

      if (!formData.category_id) {
        setError('Please select a category');
        setLoading(false);
        return;
      }

      // Build platform array
      const platforms: string[] = [];
      if (formData.platform_windows) platforms.push('windows');
      if (formData.platform_linux) platforms.push('linux');
      if (formData.platform_macos) platforms.push('macos');

      if (platforms.length === 0) {
        setError('Please select at least one platform');
        setLoading(false);
        return;
      }

      // Parse tags
      const tagsArray = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const response = await automationService.createScript({
        script_name: formData.script_name.trim(),
        script_type: formData.script_type,
        category_id: formData.category_id,
        description: formData.description.trim() || null,
        script_content: formData.script_content.trim(),
        is_builtin: formData.is_builtin,
        tags: tagsArray.length > 0 ? tagsArray : null,
        platform_compatibility: platforms,
        timeout_seconds: formData.timeout_seconds,
        requires_elevation: formData.requires_elevation,
      });

      if (response.success) {
        // Reset form
        setFormData({
          script_name: '',
          script_type: 'bash',
          category_id: '',
          description: '',
          script_content: '',
          is_builtin: false,
          tags: '',
          platform_windows: false,
          platform_linux: true,
          platform_macos: true,
          timeout_seconds: 300,
          requires_elevation: false,
        });
        onSuccess();
        onClose();
      } else {
        setError(response.message || 'Failed to create script');
      }
    } catch (err) {
      setError('An error occurred while creating the script');
      console.error('Create script error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Create Automation Script</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Error Display */}
            {error && (
              <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Script Name */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Script Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.script_name}
                onChange={(e) => handleInputChange('script_name', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                placeholder="e.g., Clear Temp Files"
                required
              />
            </div>

            {/* Script Type and Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Script Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.script_type}
                  onChange={(e) => handleInputChange('script_type', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  required
                >
                  <option value="bash">Bash</option>
                  <option value="powershell">PowerShell</option>
                  <option value="python">Python</option>
                  <option value="node">Node.js</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => handleInputChange('category_id', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  required
                >
                  <option value="">Select a category...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.category_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                rows={3}
                placeholder="Describe what this script does..."
              />
            </div>

            {/* Script Content */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Script Content <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.script_content}
                onChange={(e) => handleInputChange('script_content', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input} font-mono text-sm`}
                rows={12}
                placeholder="Enter your script code here..."
                required
              />
            </div>

            {/* Platform Compatibility */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Platform Compatibility <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.platform_windows}
                    onChange={(e) => handleInputChange('platform_windows', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Windows</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.platform_linux}
                    onChange={(e) => handleInputChange('platform_linux', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Linux</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.platform_macos}
                    onChange={(e) => handleInputChange('platform_macos', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>macOS</span>
                </label>
              </div>
            </div>

            {/* Timeout and Elevation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Timeout (seconds)
                </label>
                <input
                  type="number"
                  value={formData.timeout_seconds}
                  onChange={(e) => handleInputChange('timeout_seconds', parseInt(e.target.value) || 300)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  min={10}
                  max={3600}
                />
              </div>

              <div className="flex items-center pt-8">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.requires_elevation}
                    onChange={(e) => handleInputChange('requires_elevation', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Requires Admin/Elevation</span>
                </label>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => handleInputChange('tags', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                placeholder="e.g., maintenance, cleanup, security"
              />
            </div>

            {/* Is Built-in (for system scripts) */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_builtin}
                  onChange={(e) => handleInputChange('is_builtin', e.target.checked)}
                  className="mr-2"
                />
                <span className={themeClasses.text.primary}>Mark as Built-in System Script</span>
              </label>
              <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                Built-in scripts are provided by the system and cannot be deleted by users
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2 rounded-lg ${themeClasses.button.secondary}`}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={`px-6 py-2 rounded-lg ${themeClasses.button.primary}`}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Script'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateScriptModal;
