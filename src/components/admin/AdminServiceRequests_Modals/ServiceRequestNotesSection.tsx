import React from 'react';
import { RefreshCw } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequestNote } from './types';

interface ServiceRequestNotesSectionProps {
  notes: ServiceRequestNote[];
  loading: boolean;
  newNoteText: string;
  submittingNote: boolean;
  onNewNoteChange: (text: string) => void;
  onSubmitNote: () => void;
}

const ServiceRequestNotesSection: React.FC<ServiceRequestNotesSectionProps> = ({
  notes,
  loading,
  newNoteText,
  submittingNote,
  onNewNoteChange,
  onSubmitNote
}) => {
  return (
    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
      <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>Notes</h4>

      {/* Add Note Form */}
      <div className="mb-4">
        <textarea
          value={newNoteText}
          onChange={(e) => onNewNoteChange(e.target.value)}
          placeholder="Add a note..."
          className={`w-full px-3 py-2 rounded-md ${themeClasses.input} resize-none`}
          rows={3}
          disabled={submittingNote}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={onSubmitNote}
            disabled={!newNoteText.trim() || submittingNote}
            className={`px-4 py-2 rounded-md text-white ${
              !newNoteText.trim() || submittingNote
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            } transition-colors text-sm`}
          >
            {submittingNote ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Submitting...
              </span>
            ) : (
              'Add Note'
            )}
          </button>
        </div>
      </div>

      {/* Notes List */}
      {loading ? (
        <div className={`flex items-center gap-2 ${themeClasses.text.secondary}`}>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading notes...</span>
        </div>
      ) : notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note, index) => (
            <div key={note.id}>
              {index > 0 && <hr className="border-gray-300 dark:border-gray-600 mb-3" />}
              <div className={`text-xs ${themeClasses.text.muted} mb-1`}>
                <span className="font-medium">{note.created_by_name}</span>
                {' • '}
                <span>{new Date(note.created_at).toLocaleString()}</span>
              </div>
              <p className={`text-sm ${themeClasses.text.primary} whitespace-pre-wrap`}>
                {note.note_text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className={`text-sm ${themeClasses.text.muted}`}>No notes yet</p>
      )}
    </div>
  );
};

export default ServiceRequestNotesSection;
