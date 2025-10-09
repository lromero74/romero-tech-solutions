/**
 * Admin Testimonials Management
 * Manage client testimonials with approval, editing, and deletion capabilities
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Star,
  Search,
  Edit2,
  Check,
  X,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  FileText,
  CheckCircle,
  Clock
} from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { apiService } from '../../services/apiService';
import { useAdminData, Testimonial } from '../../contexts/AdminDataContext';

interface AdminTestimonialsProps {
  testimonials?: Testimonial[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

const AdminTestimonials: React.FC<AdminTestimonialsProps> = ({
  testimonials: propsTestimonials,
  loading: propsLoading,
  error: propsError,
  onRefresh: propsOnRefresh
}) => {
  const contextData = useAdminData();

  // Use props if provided, otherwise fall back to context
  const testimonials = propsTestimonials !== undefined ? propsTestimonials : contextData.testimonials;
  const refreshTestimonials = propsOnRefresh || contextData.refreshTestimonials;
  const loading = propsLoading !== undefined ? propsLoading : contextData.loading;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [sortBy, setSortBy] = useState<'created_at' | 'score' | 'client_name'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState('');

  // Refresh testimonials on mount and when filter changes
  useEffect(() => {
    if (refreshTestimonials && !testimonials.length) {
      refreshTestimonials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle approve testimonial
  const handleApprove = async (testimonialId: string, withEdit: boolean = false) => {
    try {
      const payload: { editedText?: string } = {};
      if (withEdit && editingId === testimonialId) {
        payload.editedText = editedText;
      }

      await apiService.patch(`/admin/testimonials/${testimonialId}/approve`, payload);

      // Clear editing state
      setEditingId(null);
      setEditedText('');

      // Refresh testimonials
      await refreshTestimonials(true);
    } catch (err: unknown) {
      console.error('Error approving testimonial:', err);
      alert(err instanceof Error ? err.message : 'Failed to approve testimonial');
    }
  };

  // Handle edit testimonial text only (without approving)
  const handleEditTextOnly = async (testimonialId: string) => {
    try {
      await apiService.patch(`/admin/testimonials/${testimonialId}/edit`, { editedText });

      // Clear editing state
      setEditingId(null);
      setEditedText('');

      // Refresh testimonials
      await refreshTestimonials(true);
    } catch (err: unknown) {
      console.error('Error editing testimonial:', err);
      alert(err instanceof Error ? err.message : 'Failed to edit testimonial');
    }
  };

  // Handle unapprove testimonial
  const handleUnapprove = async (testimonialId: string) => {
    if (!confirm('Are you sure you want to unapprove this testimonial?')) {
      return;
    }

    try {
      await apiService.patch(`/admin/testimonials/${testimonialId}/unapprove`, {});

      await refreshTestimonials(true);
    } catch (err: unknown) {
      console.error('Error unapproving testimonial:', err);
      alert(err instanceof Error ? err.message : 'Failed to unapprove testimonial');
    }
  };

  // Handle delete testimonial
  const handleDelete = async (testimonialId: string) => {
    if (!confirm('Are you sure you want to permanently delete this testimonial? This action cannot be undone.')) {
      return;
    }

    try {
      await apiService.delete(`/admin/testimonials/${testimonialId}`);

      await refreshTestimonials(true);
    } catch (err: unknown) {
      console.error('Error deleting testimonial:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete testimonial');
    }
  };

  // Start editing
  const startEditing = (testimonial: Testimonial) => {
    setEditingId(testimonial.id);
    setEditedText(testimonial.edited_testimonial_text || testimonial.original_testimonial_text);
    setExpandedId(testimonial.id);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setEditedText('');
  };

  // Filter and sort testimonials
  const filteredTestimonials = testimonials
    .filter(t => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        t.client_name?.toLowerCase().includes(searchLower) ||
        t.original_testimonial_text?.toLowerCase().includes(searchLower) ||
        t.edited_testimonial_text?.toLowerCase().includes(searchLower);

      return matchesSearch;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'score':
          comparison = a.total_score - b.total_score;
          break;
        case 'client_name':
          comparison = (a.client_name || '').localeCompare(b.client_name || '');
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Get display name
  const getDisplayName = (testimonial: Testimonial) => {
    const names = testimonial.client_name?.split(' ') || [];
    switch (testimonial.display_name_preference) {
      case 'first':
        return names[0] || 'Anonymous';
      case 'last':
        return names[names.length - 1] || 'Anonymous';
      case 'full':
        return testimonial.client_name || 'Anonymous';
      case 'anonymous':
      default:
        return 'Anonymous';
    }
  };

  // Render star rating
  const renderStars = (score: number) => {
    const maxScore = 20;
    const percentage = (score / maxScore) * 100;
    const stars = Math.round((score / maxScore) * 5);

    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i <= stars
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
        ))}
        <span className={`text-sm font-medium ml-2 ${themeClasses.text.secondary}`}>
          {score}/20 ({percentage}%)
        </span>
      </div>
    );
  };

  const displayError = propsError || contextData.error;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
            <MessageSquare className="inline-block h-6 w-6 mr-2" />
            Client Testimonials
          </h2>
          <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
            Review, edit, and approve client testimonials for public display
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-4`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${themeClasses.text.tertiary}`} />
              <input
                type="text"
                placeholder="Search testimonials..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg ${themeClasses.bg.input} ${themeClasses.border.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pending' | 'approved')}
              className={`w-full px-4 py-2 border rounded-lg ${themeClasses.bg.input} ${themeClasses.border.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            >
              <option value="all">All Testimonials</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
            </select>
          </div>

          {/* Sort */}
          <div className="flex space-x-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'created_at' | 'score' | 'client_name')}
              className={`flex-1 px-4 py-2 border rounded-lg ${themeClasses.bg.input} ${themeClasses.border.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            >
              <option value="created_at">Date</option>
              <option value="score">Score</option>
              <option value="client_name">Client</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className={`px-3 py-2 border rounded-lg ${themeClasses.button.secondary} ${themeClasses.border.primary} hover:${themeClasses.bg.hover}`}
            >
              {sortOrder === 'asc' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex space-x-6">
          <div className={`text-sm ${themeClasses.text.secondary}`}>
            <span className="font-medium">Total:</span> {testimonials.length}
          </div>
          <div className={`text-sm ${themeClasses.text.secondary}`}>
            <span className="font-medium">Pending:</span>{' '}
            {testimonials.filter(t => !t.is_approved).length}
          </div>
          <div className={`text-sm ${themeClasses.text.secondary}`}>
            <span className="font-medium">Approved:</span>{' '}
            {testimonials.filter(t => t.is_approved).length}
          </div>
          <div className={`text-sm ${themeClasses.text.secondary}`}>
            <span className="font-medium">Public Display:</span>{' '}
            {testimonials.filter(t => t.is_approved && t.allow_public_display).length}
          </div>
        </div>
      </div>

      {/* Error State */}
      {displayError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{displayError}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Testimonials List */}
      {!loading && (
        <div className="space-y-4">
          {filteredTestimonials.length === 0 ? (
            <div className={`${themeClasses.bg.card} rounded-lg p-12 text-center`}>
              <MessageSquare className={`h-12 w-12 mx-auto mb-4 ${themeClasses.text.tertiary}`} />
              <p className={`text-lg font-medium ${themeClasses.text.primary}`}>
                No testimonials found
              </p>
              <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                {searchTerm
                  ? 'Try adjusting your search filters'
                  : 'Testimonials will appear here after clients submit them'}
              </p>
            </div>
          ) : (
            filteredTestimonials.map((testimonial) => (
              <div
                key={testimonial.id}
                className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden ${
                  testimonial.is_approved ? 'border-l-4 border-green-500' : 'border-l-4 border-yellow-500'
                }`}
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <User className={`h-5 w-5 ${themeClasses.text.tertiary}`} />
                        <span className={`font-semibold ${themeClasses.text.primary}`}>
                          {getDisplayName(testimonial)}
                        </span>
                        {testimonial.is_approved && (
                          <CheckCircle className="h-5 w-5 text-green-500" title="Approved" />
                        )}
                        {!testimonial.is_approved && (
                          <Clock className="h-5 w-5 text-yellow-500" title="Pending Review" />
                        )}
                        {testimonial.allow_public_display && (
                          <Eye className="h-5 w-5 text-blue-500" title="Public Display Allowed" />
                        )}
                        {!testimonial.allow_public_display && (
                          <EyeOff className="h-5 w-5 text-gray-400" title="Private" />
                        )}
                      </div>
                      {renderStars(testimonial.total_score)}
                      <div className={`mt-2 flex items-center space-x-4 text-xs ${themeClasses.text.tertiary}`}>
                        <span className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {new Date(testimonial.created_at).toLocaleDateString()}
                        </span>
                        {testimonial.was_edited && (
                          <span className="flex items-center text-orange-500">
                            <FileText className="h-3 w-3 mr-1" />
                            Edited
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2">
                      {!testimonial.is_approved && (
                        <button
                          onClick={() => handleApprove(testimonial.id)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-1 text-sm"
                          title="Approve as-is"
                        >
                          <Check className="h-4 w-4" />
                          <span>Approve</span>
                        </button>
                      )}
                      {testimonial.is_approved && (
                        <button
                          onClick={() => handleUnapprove(testimonial.id)}
                          className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center space-x-1 text-sm"
                          title="Unapprove"
                        >
                          <X className="h-4 w-4" />
                          <span>Unapprove</span>
                        </button>
                      )}
                      <button
                        onClick={() => startEditing(testimonial)}
                        className={`px-3 py-1.5 ${themeClasses.button.secondary} rounded-lg transition-colors flex items-center space-x-1 text-sm`}
                        title="Edit testimonial text"
                      >
                        <Edit2 className="h-4 w-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(testimonial.id)}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-1 text-sm"
                        title="Delete permanently"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === testimonial.id ? null : testimonial.id)}
                        className={`px-3 py-1.5 ${themeClasses.button.secondary} rounded-lg transition-colors`}
                      >
                        {expandedId === testimonial.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Testimonial Text Preview */}
                  {expandedId !== testimonial.id && (
                    <div className={`${themeClasses.text.secondary} text-sm line-clamp-2`}>
                      {testimonial.edited_testimonial_text || testimonial.original_testimonial_text}
                    </div>
                  )}

                  {/* Expanded View */}
                  {expandedId === testimonial.id && (
                    <div className="mt-4 space-y-4">
                      {/* Original Text (if edited) */}
                      {testimonial.was_edited && (
                        <div>
                          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                            Original Testimonial:
                          </label>
                          <div className={`p-3 rounded-lg ${themeClasses.bg.input} ${themeClasses.text.secondary} text-sm border-l-4 border-gray-400`}>
                            {testimonial.original_testimonial_text}
                          </div>
                        </div>
                      )}

                      {/* Current/Edited Text */}
                      {editingId === testimonial.id ? (
                        <div>
                          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                            {testimonial.was_edited ? 'Edit Testimonial:' : 'Testimonial:'}
                          </label>
                          <textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            rows={4}
                            className={`w-full px-3 py-2 border rounded-lg ${themeClasses.bg.input} ${themeClasses.border.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            placeholder="Edit testimonial text..."
                          />
                          <div className="mt-2 flex items-center space-x-2">
                            <button
                              onClick={() => handleEditTextOnly(testimonial.id)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                            >
                              <Check className="h-4 w-4" />
                              <span>Save Edit</span>
                            </button>
                            {!testimonial.is_approved && (
                              <button
                                onClick={() => handleApprove(testimonial.id, true)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                              >
                                <Check className="h-4 w-4" />
                                <span>Save & Approve</span>
                              </button>
                            )}
                            <button
                              onClick={cancelEditing}
                              className={`px-4 py-2 ${themeClasses.button.secondary} rounded-lg transition-colors flex items-center space-x-2`}
                            >
                              <X className="h-4 w-4" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                            {testimonial.was_edited ? 'Edited Testimonial:' : 'Testimonial:'}
                          </label>
                          <div className={`p-3 rounded-lg ${themeClasses.bg.input} ${themeClasses.text.primary} border-l-4 ${
                            testimonial.was_edited ? 'border-orange-500' : 'border-blue-500'
                          }`}>
                            {testimonial.edited_testimonial_text || testimonial.original_testimonial_text}
                          </div>
                        </div>
                      )}

                      {/* Approval Info */}
                      {testimonial.is_approved && testimonial.approved_by_name && (
                        <div className={`text-sm ${themeClasses.text.tertiary} flex items-center space-x-2`}>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>
                            Approved by {testimonial.approved_by_name} on{' '}
                            {new Date(testimonial.approved_at!).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AdminTestimonials;
