import React, { useState } from 'react';
import { X } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { deploymentService } from '../../../services/deploymentService';

interface CreatePackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreatePackageModal: React.FC<CreatePackageModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    package_name: '',
    package_version: '',
    publisher: '',
    description: '',
    package_type: 'exe' as 'msi' | 'exe' | 'deb' | 'rpm' | 'pkg' | 'dmg',
    package_category: '',
    source_type: 'url' as 'url' | 'repository' | 'local_upload',
    source_url: '',
    checksum_type: 'sha256',
    checksum_value: '',
    install_command: '',
    requires_reboot: false,
    requires_elevated: true,
    is_approved: false,
    is_public: true,
    tags: '',
    os_windows: false,
    os_linux: false,
    os_macos: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.package_name.trim()) {
        setError('Package name is required');
        setLoading(false);
        return;
      }

      // Validate source URL if source_type is url
      if (formData.source_type === 'url' && !formData.source_url.trim()) {
        setError('Source URL is required when source type is URL');
        setLoading(false);
        return;
      }

      // Build supported OS array
      const supportedOS: string[] = [];
      if (formData.os_windows) supportedOS.push('windows');
      if (formData.os_linux) supportedOS.push('linux');
      if (formData.os_macos) supportedOS.push('macos');

      if (supportedOS.length === 0) {
        setError('Please select at least one supported operating system');
        setLoading(false);
        return;
      }

      // Parse tags
      const tagsArray = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const response = await deploymentService.createPackage({
        package_name: formData.package_name.trim(),
        package_version: formData.package_version.trim() || undefined,
        publisher: formData.publisher.trim() || undefined,
        description: formData.description.trim() || undefined,
        package_type: formData.package_type,
        package_category: formData.package_category.trim() || undefined,
        supported_os: supportedOS,
        source_type: formData.source_type,
        source_url: formData.source_url.trim() || undefined,
        checksum_type: formData.checksum_type,
        checksum_value: formData.checksum_value.trim() || undefined,
        install_command: formData.install_command.trim() || undefined,
        requires_reboot: formData.requires_reboot,
        requires_elevated: formData.requires_elevated,
        is_approved: formData.is_approved,
        is_public: formData.is_public,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      });

      if (response.success) {
        // Reset form
        setFormData({
          package_name: '',
          package_version: '',
          publisher: '',
          description: '',
          package_type: 'exe',
          package_category: '',
          source_type: 'url',
          source_url: '',
          checksum_type: 'sha256',
          checksum_value: '',
          install_command: '',
          requires_reboot: false,
          requires_elevated: true,
          is_approved: false,
          is_public: true,
          tags: '',
          os_windows: false,
          os_linux: false,
          os_macos: false,
        });
        onSuccess();
        onClose();
      } else {
        setError(response.message || 'Failed to create package');
      }
    } catch (err) {
      setError('An error occurred while creating the package');
      console.error('Create package error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Create Software Package</h2>
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

            {/* Package Name and Version */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Package Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.package_name}
                  onChange={(e) => handleInputChange('package_name', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="e.g., Google Chrome, Microsoft Office"
                  required
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Version
                </label>
                <input
                  type="text"
                  value={formData.package_version}
                  onChange={(e) => handleInputChange('package_version', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="e.g., 120.0.6099.129"
                />
              </div>
            </div>

            {/* Publisher and Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Publisher
                </label>
                <input
                  type="text"
                  value={formData.publisher}
                  onChange={(e) => handleInputChange('publisher', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="e.g., Google LLC, Microsoft Corporation"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Category
                </label>
                <input
                  type="text"
                  value={formData.package_category}
                  onChange={(e) => handleInputChange('package_category', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="e.g., Productivity, Security, Browsers"
                />
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
                placeholder="Describe what this package does..."
              />
            </div>

            {/* Package Type and Source Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Package Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.package_type}
                  onChange={(e) => handleInputChange('package_type', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  required
                >
                  <option value="exe">Windows EXE</option>
                  <option value="msi">Windows MSI</option>
                  <option value="deb">Linux DEB</option>
                  <option value="rpm">Linux RPM</option>
                  <option value="pkg">macOS PKG</option>
                  <option value="dmg">macOS DMG</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Source Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.source_type}
                  onChange={(e) => handleInputChange('source_type', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  required
                >
                  <option value="url">URL Download</option>
                  <option value="repository">Package Repository</option>
                  <option value="local_upload">Local Upload</option>
                </select>
              </div>
            </div>

            {/* Source URL (conditional) */}
            {formData.source_type === 'url' && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Source URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formData.source_url}
                  onChange={(e) => handleInputChange('source_url', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="https://example.com/package.exe"
                  required={formData.source_type === 'url'}
                />
              </div>
            )}

            {/* Checksum */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Checksum Type
                </label>
                <select
                  value={formData.checksum_type}
                  onChange={(e) => handleInputChange('checksum_type', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                >
                  <option value="md5">MD5</option>
                  <option value="sha1">SHA1</option>
                  <option value="sha256">SHA256</option>
                  <option value="sha512">SHA512</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Checksum Value
                </label>
                <input
                  type="text"
                  value={formData.checksum_value}
                  onChange={(e) => handleInputChange('checksum_value', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input} font-mono text-sm`}
                  placeholder="Optional - for package verification"
                />
              </div>
            </div>

            {/* Install Command */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Custom Install Command
              </label>
              <input
                type="text"
                value={formData.install_command}
                onChange={(e) => handleInputChange('install_command', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input} font-mono text-sm`}
                placeholder="e.g., /S /quiet /norestart (leave empty for default)"
              />
              <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                Optional custom installation parameters. If left empty, default silent install will be used.
              </p>
            </div>

            {/* Operating System Support */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Supported Operating Systems <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.os_windows}
                    onChange={(e) => handleInputChange('os_windows', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Windows</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.os_linux}
                    onChange={(e) => handleInputChange('os_linux', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Linux</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.os_macos}
                    onChange={(e) => handleInputChange('os_macos', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>macOS</span>
                </label>
              </div>
            </div>

            {/* Package Flags */}
            <div className="space-y-3">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.requires_reboot}
                    onChange={(e) => handleInputChange('requires_reboot', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Requires Reboot</span>
                </label>
                <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                  Check if this package requires a system reboot after installation
                </p>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.requires_elevated}
                    onChange={(e) => handleInputChange('requires_elevated', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Requires Admin/Elevation</span>
                </label>
                <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                  Check if this package requires administrator or root privileges
                </p>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_approved}
                    onChange={(e) => handleInputChange('is_approved', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Approved for Deployment</span>
                </label>
                <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                  Mark this package as approved and ready for deployment
                </p>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_public}
                    onChange={(e) => handleInputChange('is_public', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Public Package</span>
                </label>
                <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                  Make this package available to all businesses
                </p>
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
                placeholder="e.g., browser, productivity, security"
              />
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
            {loading ? 'Creating...' : 'Create Package'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePackageModal;
