import React, { useEffect, useState } from 'react';
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
  otherViewers?: Array<{userId: string; userName: string; userType: string}>;
  timeFormatPreference?: '12h' | '24h';
  newlyReceivedNoteId?: string | null; // ID of note that was just received via websocket
}

/**
 * Format a timestamp to show both local time and UTC
 * @param timestamp - ISO timestamp string
 * @param timeFormat - '12h' or '24h' format preference (defaults to '12h')
 */
const formatTimestampWithUTC = (timestamp: string, timeFormat: '12h' | '24h' = '12h'): { local: string; utc: string } => {
  const date = new Date(timestamp);
  const use12Hour = timeFormat === '12h';

  // Format local time
  const local = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: use12Hour
  });

  // Format UTC time
  const utc = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: use12Hour,
    timeZone: 'UTC'
  });

  return { local, utc };
};

const ServiceRequestNotesSection: React.FC<ServiceRequestNotesSectionProps> = ({
  notes,
  loading,
  newNoteText,
  submittingNote,
  onNewNoteChange,
  onSubmitNote,
  otherViewers = [],
  timeFormatPreference = '12h',
  newlyReceivedNoteId = null
}) => {
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);

  // Auto-remove highlight after 3 seconds
  useEffect(() => {
    if (newlyReceivedNoteId) {
      setHighlightedNoteId(newlyReceivedNoteId);
      const timer = setTimeout(() => {
        setHighlightedNoteId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [newlyReceivedNoteId]);

  return (
    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>Notes</h4>
        {otherViewers.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-full">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-green-700 dark:text-green-300">
              {otherViewers[0].userName}
            </span>
          </div>
        )}
      </div>

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
          {notes.map((note, index) => {
            const timestamps = formatTimestampWithUTC(note.created_at, timeFormatPreference);
            const isHighlighted = highlightedNoteId === note.id;
            return (
              <div key={note.id}>
                {index > 0 && <hr className="border-gray-300 dark:border-gray-600 mb-3" />}
                <div className={`
                  p-2 rounded-lg transition-all duration-300
                  ${isHighlighted ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-400/50 dark:ring-blue-500 dark:shadow-blue-500/50' : ''}
                `}>
                  <div className={`text-xs ${themeClasses.text.muted} mb-1`}>
                    <span className="font-medium">{note.created_by_name}</span>
                    {' • '}
                    <span className="inline-flex flex-col sm:flex-row sm:gap-1">
                      <span>{timestamps.local} (Local)</span>
                      <span className="hidden sm:inline">•</span>
                      <span>{timestamps.utc} (UTC)</span>
                    </span>
                  </div>
                  <p className={`text-sm ${themeClasses.text.primary} whitespace-pre-wrap`}>
                    {note.note_text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={`text-sm ${themeClasses.text.muted}`}>No notes yet</p>
      )}
    </div>
  );
};

export default ServiceRequestNotesSection;
