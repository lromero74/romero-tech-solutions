import React from 'react';
import { RefreshCw } from 'lucide-react';
import { ServiceRequestNote, ThemeClasses } from './types';
import { formatTimestampWithUTC } from './utils';

interface ServiceRequestNotesSectionProps {
  notes: ServiceRequestNote[];
  loadingNotes: boolean;
  newNoteText: string;
  submittingNote: boolean;
  newlyReceivedNoteId: string | null;
  otherViewers: Array<{userId: string; userName: string; userType: string}>;
  authUser: any;
  t: (key: string, params?: any, fallback?: string) => string;
  locale: string;
  themeClasses: ThemeClasses;
  onNoteTextChange: (text: string) => void;
  onSubmitNote: () => void;
}

const ServiceRequestNotesSection: React.FC<ServiceRequestNotesSectionProps> = ({
  notes,
  loadingNotes,
  newNoteText,
  submittingNote,
  newlyReceivedNoteId,
  otherViewers,
  authUser,
  t,
  locale,
  themeClasses,
  onNoteTextChange,
  onSubmitNote
}) => {
  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('serviceRequests.notes', undefined, 'Notes')}</h4>
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
          onChange={(e) => onNoteTextChange(e.target.value)}
          placeholder={t('serviceRequests.addNotePlaceholder', undefined, 'Add a note...')}
          className={`w-full px-3 py-2 border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
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
                {t('serviceRequests.submittingNote', undefined, 'Submitting...')}
              </span>
            ) : (
              t('serviceRequests.addNote', undefined, 'Add Note')
            )}
          </button>
        </div>
      </div>

      {/* Notes List */}
      {loadingNotes ? (
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>{t('serviceRequests.loadingNotes', undefined, 'Loading notes...')}</span>
        </div>
      ) : notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note, index) => {
            const timestamps = formatTimestampWithUTC(note.createdAt, locale, (authUser?.timeFormatPreference as '12h' | '24h') || '12h');
            const isHighlighted = newlyReceivedNoteId === note.id;
            return (
              <div key={note.id}>
                {index > 0 && <hr className="border-gray-300 dark:border-gray-600 mb-3" />}
                <div className={`
                  p-2 rounded-lg transition-all duration-300
                  ${isHighlighted ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-400/50 dark:ring-blue-500 dark:shadow-blue-500/50' : ''}
                `}>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span className="font-medium">{note.createdByName}</span>
                    {' • '}
                    <span className="inline-flex flex-col sm:flex-row sm:gap-1">
                      <span>{timestamps.local} ({t('serviceRequests.localTime', undefined, 'Local')})</span>
                      <span className="hidden sm:inline">•</span>
                      <span>{timestamps.utc} (UTC)</span>
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                    {note.noteText}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('serviceRequests.noNotes', undefined, 'No notes yet')}</p>
      )}
    </div>
  );
};

export default ServiceRequestNotesSection;
