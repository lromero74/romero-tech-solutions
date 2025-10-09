/**
 * Admin Rating Questions Management
 * Manage configurable rating questions for service evaluations
 */

import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  Plus,
  Edit2,
  Save,
  X,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { apiService } from '../../services/apiService';
import { useAdminData, RatingQuestion } from '../../contexts/AdminDataContext';

interface QuestionFormData {
  question_key: string;
  question_text: string;
  display_order: number;
  is_active: boolean;
}

interface AdminRatingQuestionsProps {
  ratingQuestions?: RatingQuestion[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

const AdminRatingQuestions: React.FC<AdminRatingQuestionsProps> = ({
  ratingQuestions: propsRatingQuestions,
  loading: propsLoading,
  error: propsError,
  onRefresh: propsOnRefresh
}) => {
  const contextData = useAdminData();

  // Use props if provided, otherwise fall back to context
  const questions = propsRatingQuestions !== undefined ? propsRatingQuestions : contextData.ratingQuestions;
  const refreshRatingQuestions = propsOnRefresh || contextData.refreshRatingQuestions;
  const loading = propsLoading !== undefined ? propsLoading : contextData.loading;
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formData, setFormData] = useState<QuestionFormData>({
    question_key: '',
    question_text: '',
    display_order: 0,
    is_active: true
  });

  // Refresh rating questions on mount
  useEffect(() => {
    if (refreshRatingQuestions && !questions.length) {
      refreshRatingQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset form
  const resetForm = () => {
    setFormData({
      question_key: '',
      question_text: '',
      display_order: questions.length > 0 ? Math.max(...questions.map(q => q.display_order)) + 1 : 0,
      is_active: true
    });
    setShowAddForm(false);
    setEditingId(null);
  };

  // Handle create question
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await apiService.post('/admin/rating-questions', formData);

      resetForm();
      await refreshRatingQuestions(true);
    } catch (err: unknown) {
      console.error('Error creating rating question:', err);
      alert(err instanceof Error ? err.message : 'Failed to create rating question');
    }
  };

  // Handle update question
  const handleUpdate = async (questionId: string) => {
    try {
      await apiService.patch(`/admin/rating-questions/${questionId}`, formData);

      resetForm();
      await refreshRatingQuestions(true);
    } catch (err: unknown) {
      console.error('Error updating rating question:', err);
      alert(err instanceof Error ? err.message : 'Failed to update rating question');
    }
  };

  // Handle delete question
  const handleDelete = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question? This can only be done if no responses exist.')) {
      return;
    }

    try {
      await apiService.delete(`/admin/rating-questions/${questionId}`);

      await refreshRatingQuestions(true);
    } catch (err: unknown) {
      console.error('Error deleting rating question:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete rating question. It may have existing responses.');
    }
  };

  // Handle toggle active status
  const handleToggleActive = async (question: RatingQuestion) => {
    try {
      await apiService.patch(`/admin/rating-questions/${question.id}`, { is_active: !question.is_active });

      await refreshRatingQuestions(true);
    } catch (err: unknown) {
      console.error('Error toggling question status:', err);
      alert(err instanceof Error ? err.message : 'Failed to update question status');
    }
  };

  // Handle reorder (move up/down)
  const handleReorder = async (questionId: string, direction: 'up' | 'down') => {
    const currentIndex = questions.findIndex(q => q.id === questionId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const currentQuestion = questions[currentIndex];
    const targetQuestion = questions[targetIndex];

    try {
      // Swap display orders
      await apiService.patch(`/admin/rating-questions/${currentQuestion.id}/reorder`, { newDisplayOrder: targetQuestion.display_order });

      await refreshRatingQuestions(true);
    } catch (err: unknown) {
      console.error('Error reordering question:', err);
      alert(err instanceof Error ? err.message : 'Failed to reorder question');
    }
  };

  // Start editing
  const startEditing = (question: RatingQuestion) => {
    setFormData({
      question_key: question.question_key,
      question_text: question.question_text,
      display_order: question.display_order,
      is_active: question.is_active
    });
    setEditingId(question.id);
    setShowAddForm(false);
  };

  // Cancel editing
  const cancelEditing = () => {
    resetForm();
  };

  const displayError = propsError || contextData.error;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
            <HelpCircle className="inline-block h-6 w-6 mr-2" />
            Rating Questions
          </h2>
          <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
            Configure the questions clients will answer when rating service requests
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setEditingId(null);
            if (!showAddForm) {
              setFormData({
                question_key: '',
                question_text: '',
                display_order: questions.length > 0 ? Math.max(...questions.map(q => q.display_order)) + 1 : 0,
                is_active: true
              });
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          {showAddForm ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          <span>{showAddForm ? 'Cancel' : 'Add Question'}</span>
        </button>
      </div>

      {/* Filters */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-4`}>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className={`text-sm ${themeClasses.text.primary}`}>Show inactive questions</span>
          </label>
          <div className={`text-sm ${themeClasses.text.secondary}`}>
            <span className="font-medium">Total:</span> {questions.length} |{' '}
            <span className="font-medium">Active:</span> {questions.filter(q => q.is_active).length}
          </div>
        </div>
      </div>

      {/* Error State */}
      {displayError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{displayError}</p>
        </div>
      )}

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <form
          onSubmit={(e) => {
            if (editingId) {
              e.preventDefault();
              handleUpdate(editingId);
            } else {
              handleCreate(e);
            }
          }}
          className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6 space-y-4`}
        >
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
            {editingId ? 'Edit Question' : 'Add New Question'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Question Key */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Question Key (unique identifier)
              </label>
              <input
                type="text"
                required
                value={formData.question_key}
                onChange={(e) => setFormData({ ...formData, question_key: e.target.value })}
                placeholder="e.g., price, speed, accuracy"
                className={`w-full px-3 py-2 border rounded-lg ${themeClasses.bg.input} ${themeClasses.border.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
              <p className={`mt-1 text-xs ${themeClasses.text.tertiary}`}>
                Use lowercase letters and underscores only
              </p>
            </div>

            {/* Display Order */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Display Order
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                className={`w-full px-3 py-2 border rounded-lg ${themeClasses.bg.input} ${themeClasses.border.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>
          </div>

          {/* Question Text */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Question Text
            </label>
            <input
              type="text"
              required
              value={formData.question_text}
              onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
              placeholder="e.g., How would you rate our pricing?"
              className={`w-full px-3 py-2 border rounded-lg ${themeClasses.bg.input} ${themeClasses.border.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
          </div>

          {/* Active Status */}
          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={`text-sm ${themeClasses.text.primary}`}>
                Active (include in rating forms)
              </span>
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex items-center space-x-2 pt-4">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{editingId ? 'Update' : 'Create'} Question</span>
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className={`px-4 py-2 ${themeClasses.button.secondary} rounded-lg transition-colors flex items-center space-x-2`}
            >
              <X className="h-4 w-4" />
              <span>Cancel</span>
            </button>
          </div>
        </form>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Questions List */}
      {!loading && (
        <div className="space-y-3">
          {questions.length === 0 ? (
            <div className={`${themeClasses.bg.card} rounded-lg p-12 text-center`}>
              <HelpCircle className={`h-12 w-12 mx-auto mb-4 ${themeClasses.text.tertiary}`} />
              <p className={`text-lg font-medium ${themeClasses.text.primary}`}>
                No rating questions configured
              </p>
              <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                Add questions that clients will answer when rating service requests
              </p>
            </div>
          ) : (
            questions.map((question, index) => (
              <div
                key={question.id}
                className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-4 ${
                  !question.is_active ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center space-x-4">
                  {/* Drag Handle / Order */}
                  <div className="flex flex-col items-center space-y-1">
                    <button
                      onClick={() => handleReorder(question.id, 'up')}
                      disabled={index === 0}
                      className={`p-1 rounded hover:${themeClasses.bg.hover} disabled:opacity-30 disabled:cursor-not-allowed`}
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <GripVertical className={`h-5 w-5 ${themeClasses.text.tertiary}`} />
                    <button
                      onClick={() => handleReorder(question.id, 'down')}
                      disabled={index === questions.length - 1}
                      className={`p-1 rounded hover:${themeClasses.bg.hover} disabled:opacity-30 disabled:cursor-not-allowed`}
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Question Details */}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className={`text-sm font-mono px-2 py-0.5 rounded ${themeClasses.bg.input} ${themeClasses.text.secondary}`}>
                        {question.question_key}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${themeClasses.bg.input} ${themeClasses.text.tertiary}`}>
                        Order: {question.display_order}
                      </span>
                      {question.is_active ? (
                        <span className="flex items-center text-xs text-green-600 dark:text-green-400">
                          <Eye className="h-3 w-3 mr-1" />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center text-xs text-gray-400">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className={`text-base ${themeClasses.text.primary}`}>{question.question_text}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleToggleActive(question)}
                      className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1 text-sm ${
                        question.is_active
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                      title={question.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {question.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span>{question.is_active ? 'Deactivate' : 'Activate'}</span>
                    </button>
                    <button
                      onClick={() => startEditing(question)}
                      className={`px-3 py-1.5 ${themeClasses.button.secondary} rounded-lg transition-colors flex items-center space-x-1 text-sm`}
                      title="Edit question"
                    >
                      <Edit2 className="h-4 w-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(question.id)}
                      className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-lg transition-colors flex items-center space-x-1 text-sm"
                      title="Delete question"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRatingQuestions;
