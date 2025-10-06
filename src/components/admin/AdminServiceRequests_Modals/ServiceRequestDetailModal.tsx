import React from 'react';
import {
  XCircle,
  Clock,
  CheckCircle,
  Pause,
  Edit2,
  Check,
  X as XIcon,
  RefreshCw,
  MapPin,
  User,
  Mail,
  Phone,
  FileText,
  AlertCircle
} from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequest, ServiceRequestFile, ServiceRequestNote } from './types';
import { ServiceRequestFilesSection, ServiceRequestNotesSection } from './';
import { FileUploadProgress } from '../../../hooks/useFileUploadWithProgress';

interface ServiceRequestDetailModalProps {
  selectedRequest: ServiceRequest;
  requestFiles: ServiceRequestFile[];
  loadingFiles: boolean;
  requestNotes: ServiceRequestNote[];
  loadingNotes: boolean;
  newNoteText: string;
  submittingNote: boolean;
  editingTitle: boolean;
  editingDescription: boolean;
  editedTitle: string;
  editedDescription: string;
  savingEdit: boolean;
  renamingFileId: string | null;
  newFileName: string;
  deletingFileId: string | null;
  uploadingFiles: boolean;
  fileUploads: FileUploadProgress[];
  newlyUploadedFileIds: string[];
  actionError: string | null;
  actionLoading: boolean;
  otherViewers: Array<{userId: string; userName: string; userType: string}>;
  apiBaseUrl: string;
  canViewCosts: boolean;
  canCompleteRequest: boolean;
  isDark: boolean;
  userTimeFormatPreference: '12h' | '24h';
  newlyReceivedNoteId: string | null;
  onClose: () => void;
  onNewNoteChange: (value: string) => void;
  onSubmitNote: () => void;
  onStartEditTitle: () => void;
  onStartEditDescription: () => void;
  onCancelEditTitle: () => void;
  onCancelEditDescription: () => void;
  onEditedTitleChange: (value: string) => void;
  onEditedDescriptionChange: (value: string) => void;
  onSaveTitle: () => void;
  onSaveDescription: () => void;
  onStartRenameFile: (file: ServiceRequestFile) => void;
  onCancelRenameFile: () => void;
  onSaveFileName: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onFileNameChange: (value: string) => void;
  onUploadFiles: (files: FileList) => void;
  onTimeTracking: (action: 'start' | 'stop') => void;
  onShowCompleteModal: () => void;
  onShowStatusModal: () => void;
  formatFullAddress: (locationDetails: ServiceRequest['locationDetails']) => string;
  getMapUrl: (locationDetails: ServiceRequest['locationDetails']) => string;
  formatPhone: (phone: string | null | undefined) => string;
  formatDate: (isoString: string | null) => string;
  formatTime: (isoString: string | null) => string;
  formatDateTime: (isoString: string | null, options?: Intl.DateTimeFormatOptions) => string;
  getStatusIcon: (status: string) => JSX.Element;
}

const ServiceRequestDetailModal: React.FC<ServiceRequestDetailModalProps> = ({
  selectedRequest,
  requestFiles,
  loadingFiles,
  requestNotes,
  loadingNotes,
  newNoteText,
  submittingNote,
  editingTitle,
  editingDescription,
  editedTitle,
  editedDescription,
  savingEdit,
  renamingFileId,
  newFileName,
  deletingFileId,
  uploadingFiles,
  fileUploads,
  newlyUploadedFileIds,
  actionError,
  actionLoading,
  otherViewers,
  apiBaseUrl,
  canViewCosts,
  canCompleteRequest,
  isDark,
  userTimeFormatPreference,
  newlyReceivedNoteId,
  onClose,
  onNewNoteChange,
  onSubmitNote,
  onStartEditTitle,
  onStartEditDescription,
  onCancelEditTitle,
  onCancelEditDescription,
  onEditedTitleChange,
  onEditedDescriptionChange,
  onSaveTitle,
  onSaveDescription,
  onStartRenameFile,
  onCancelRenameFile,
  onSaveFileName,
  onDeleteFile,
  onFileNameChange,
  onUploadFiles,
  onTimeTracking,
  onShowCompleteModal,
  onShowStatusModal,
  formatFullAddress,
  getMapUrl,
  formatPhone,
  formatDate,
  formatTime,
  formatDateTime,
  getStatusIcon
}) => {
  const { isDark: themeDark } = useTheme();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1 mr-4">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => onEditedTitleChange(e.target.value)}
                    className={`flex-1 px-3 py-2 rounded-md text-2xl font-bold ${themeClasses.input}`}
                    disabled={savingEdit}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveTitle();
                      if (e.key === 'Escape') onCancelEditTitle();
                    }}
                  />
                  <button
                    onClick={onSaveTitle}
                    disabled={savingEdit || !editedTitle.trim()}
                    className="p-2 text-green-600 hover:text-green-700 disabled:opacity-50"
                    title="Save"
                  >
                    {savingEdit ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={onCancelEditTitle}
                    disabled={savingEdit}
                    className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    title="Cancel"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                    {selectedRequest.title}
                  </h2>
                  <button
                    onClick={onStartEditTitle}
                    className={`p-1 ${themeClasses.text.muted} hover:text-blue-600`}
                    title="Edit title"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {/* Other Viewers Indicator */}
                  {otherViewers.length > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-full">
                      <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-medium text-green-700 dark:text-green-300">
                        {otherViewers[0].userName} viewing
                      </span>
                    </div>
                  )}
                </div>
              )}
              <p className={`text-lg ${themeClasses.text.secondary} mt-1 font-mono`}>
                {selectedRequest.request_number}
              </p>
            </div>
            <button
              onClick={onClose}
              className={`text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`}
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                selectedRequest.status.toLowerCase() === 'cancelled'
                  ? 'bg-gray-500 text-white'
                  : selectedRequest.status.toLowerCase() === 'submitted'
                  ? 'bg-blue-600 text-white'
                  : selectedRequest.status.toLowerCase() === 'acknowledged'
                  ? `bg-orange-500 ${isDark ? 'text-white' : 'text-black'}`
                  : themeClasses.text.primary
              }`}
              style={
                selectedRequest.status.toLowerCase() === 'cancelled' ||
                selectedRequest.status.toLowerCase() === 'submitted' ||
                selectedRequest.status.toLowerCase() === 'acknowledged'
                  ? {}
                  : { backgroundColor: `${selectedRequest.status_color}20` }
              }
            >
              {getStatusIcon(selectedRequest.status)}
              <span className="ml-1">{selectedRequest.status}</span>
            </span>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${themeClasses.text.primary}`}
              style={{ backgroundColor: `${selectedRequest.urgency_color}20` }}
            >
              {selectedRequest.urgency}
            </span>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${themeClasses.text.primary}`}
              style={{ backgroundColor: `${selectedRequest.priority_color}20` }}
            >
              {selectedRequest.priority} Priority
            </span>
          </div>

          {/* Request Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pb-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <span className={`font-medium ${themeClasses.text.secondary}`}>Service Type:</span>
              <p className={`${themeClasses.text.primary}`}>{selectedRequest.service_type}</p>
            </div>
            <div>
              <span className={`font-medium ${themeClasses.text.secondary}`}>Technician:</span>
              <p className={`${themeClasses.text.primary}`}>
                {selectedRequest.technician_name || 'Unassigned'}
              </p>
            </div>
            <div>
              <span className={`font-medium ${themeClasses.text.secondary}`}>Created:</span>
              <p className={`${themeClasses.text.primary}`}>
                {(() => {
                  const createdAt = selectedRequest.created_at.includes('Z')
                    ? selectedRequest.created_at
                    : selectedRequest.created_at + 'Z';
                  return new Date(createdAt).toLocaleString();
                })()}
              </p>
            </div>
          </div>

          {/* Date/Time & Cost Summary & Location Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
            {/* Date/Time */}
            {(selectedRequest.requested_datetime || (selectedRequest.requested_date && selectedRequest.requested_time_start)) && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Selected Date & Time</h4>
                <div className={`text-lg font-semibold ${themeClasses.text.primary} mb-1`}>
                  {selectedRequest.requested_datetime
                    ? formatDateTime(selectedRequest.requested_datetime, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                    : formatDateTime(selectedRequest.requested_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div className={`text-base ${themeClasses.text.secondary}`}>
                  {selectedRequest.requested_datetime ? (
                    <>
                      {formatTime(selectedRequest.requested_datetime)}
                      {selectedRequest.requested_duration_minutes && (() => {
                        const endTime = new Date(new Date(selectedRequest.requested_datetime!).getTime() + selectedRequest.requested_duration_minutes! * 60000);
                        return ` - ${formatTime(endTime.toISOString())}`;
                      })()}
                      {selectedRequest.cost?.durationHours && ` (${selectedRequest.cost.durationHours}h)`}
                    </>
                  ) : (
                    <>
                      {selectedRequest.requested_time_start || ''}
                      {selectedRequest.requested_time_end && ` - ${selectedRequest.requested_time_end}`}
                      {selectedRequest.cost?.durationHours && ` (${selectedRequest.cost.durationHours}h)`}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Cost Estimate - Only for users with permission */}
            {canViewCosts && selectedRequest.cost && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Estimated Cost</h4>
                <div className={`text-sm ${themeClasses.text.secondary} mb-2`}>
                  Base Rate: ${selectedRequest.cost.baseRate}/hr
                </div>
                {/* Tier Breakdown */}
                {selectedRequest.cost.breakdown && selectedRequest.cost.breakdown.map((block: any, idx: number) => (
                  <div key={idx} className={`text-sm ${themeClasses.text.secondary}`}>
                    {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                  </div>
                ))}
                {/* First Hour Discount */}
                {selectedRequest.cost.firstHourDiscount && selectedRequest.cost.firstHourDiscount > 0 && (
                  <>
                    <div className={`text-sm ${themeClasses.text.secondary} mt-2 pt-2 border-t border-green-200 dark:border-green-700`}>
                      Subtotal: ${selectedRequest.cost.subtotal?.toFixed(2)}
                    </div>
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">
                      🎁 First Hour Comp (New Client):
                    </div>
                    {selectedRequest.cost.firstHourCompBreakdown?.map((compBlock: any, idx: number) => (
                      <div key={idx} className="text-sm text-green-600 dark:text-green-400 ml-4">
                        • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                      </div>
                    ))}
                    {selectedRequest.cost.firstHourCompBreakdown && selectedRequest.cost.firstHourCompBreakdown.length > 1 && (
                      <div className="text-sm text-green-600 dark:text-green-400 font-medium ml-4">
                        Total Discount: -${selectedRequest.cost.firstHourDiscount.toFixed(2)}
                      </div>
                    )}
                  </>
                )}
                <div className={`text-base font-semibold ${themeClasses.text.primary} mt-2 pt-2 border-t border-green-200 dark:border-green-700`}>
                  Total*: ${selectedRequest.cost.total.toFixed(2)}
                </div>
                <div className={`text-xs ${themeClasses.text.muted} mt-1 italic`}>
                  * Actual cost may vary based on time required to complete the service
                </div>
              </div>
            )}
          </div>

          {/* Location & Contact Information */}
          <div className="my-4">
            {selectedRequest.locationDetails && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>Location & Contact</h4>

                <div className="space-y-3">
                  {/* Address */}
                  <div>
                    <span className={`text-xs font-medium ${themeClasses.text.muted} uppercase`}>Address</span>
                    <a
                      href={getMapUrl(selectedRequest.locationDetails)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 mt-1 text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <div>{selectedRequest.locationDetails.street_address_1}</div>
                        {selectedRequest.locationDetails.street_address_2 && (
                          <div>{selectedRequest.locationDetails.street_address_2}</div>
                        )}
                        <div>
                          {selectedRequest.locationDetails.city}, {selectedRequest.locationDetails.state} {selectedRequest.locationDetails.zip_code}
                        </div>
                      </div>
                    </a>
                  </div>

                  {/* Contact Information */}
                  {(selectedRequest.locationDetails.contact_person || selectedRequest.locationDetails.contact_phone || selectedRequest.locationDetails.contact_email) && (
                    <div className="space-y-2">
                      {selectedRequest.locationDetails.contact_person && (
                        <div className={`flex items-center gap-2 text-sm ${themeClasses.text.primary}`}>
                          <User className="h-4 w-4 text-gray-400" />
                          {selectedRequest.locationDetails.contact_person}
                        </div>
                      )}
                      {selectedRequest.locationDetails.contact_email && (
                        <a
                          href={`mailto:${selectedRequest.locationDetails.contact_email}`}
                          className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Mail className="h-4 w-4" />
                          {selectedRequest.locationDetails.contact_email}
                        </a>
                      )}
                      {selectedRequest.locationDetails.contact_phone && (
                        <a
                          href={`tel:${selectedRequest.locationDetails.contact_phone}`}
                          className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Phone className="h-4 w-4" />
                          {formatPhone(selectedRequest.locationDetails.contact_phone)}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Additional Details */}
          {(selectedRequest.scheduled_datetime || selectedRequest.scheduled_date) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <span className={`font-medium ${themeClasses.text.secondary}`}>Scheduled Date:</span>
                <p className={`${themeClasses.text.primary}`}>
                  {selectedRequest.scheduled_datetime ? (
                    <>
                      {formatDate(selectedRequest.scheduled_datetime)}
                      {` at ${formatTime(selectedRequest.scheduled_datetime)}`}
                    </>
                  ) : (
                    <>
                      {formatDate(selectedRequest.scheduled_date)}
                      {selectedRequest.scheduled_time_start && ` at ${selectedRequest.scheduled_time_start}`}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Display error if any */}
          {actionError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {actionError}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 mb-6">
            <div className="flex flex-wrap gap-3">
              {/* Time tracking toggle button - changes based on status */}
              {selectedRequest.technician_name && selectedRequest.status.toLowerCase() !== 'completed' && (
                <>
                  {selectedRequest.status === 'Started' ? (
                    <button
                      onClick={() => onTimeTracking('stop')}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center"
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Work
                    </button>
                  ) : selectedRequest.status === 'Paused' ? (
                    <button
                      onClick={() => onTimeTracking('start')}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Resume Work
                    </button>
                  ) : (
                    <button
                      onClick={() => onTimeTracking('start')}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Start Work
                    </button>
                  )}
                </>
              )}

              {canCompleteRequest && (
                <button
                  onClick={onShowCompleteModal}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete Request
                </button>
              )}

              <button
                onClick={onShowStatusModal}
                disabled={actionLoading}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                Change Status
              </button>
            </div>
          </div>

          {/* Files Section */}
          <ServiceRequestFilesSection
            files={requestFiles}
            loading={loadingFiles}
            fileCount={selectedRequest.file_count || 0}
            renamingFileId={renamingFileId}
            newFileName={newFileName}
            savingEdit={savingEdit}
            deletingFileId={deletingFileId}
            apiBaseUrl={apiBaseUrl}
            uploading={uploadingFiles}
            fileUploads={fileUploads}
            newlyUploadedFileIds={newlyUploadedFileIds}
            onStartRename={onStartRenameFile}
            onCancelRename={onCancelRenameFile}
            onSaveFileName={onSaveFileName}
            onDeleteFile={onDeleteFile}
            onFileNameChange={onFileNameChange}
            onUploadFiles={onUploadFiles}
          />

          {/* Description */}
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>Description</h4>
              {!editingDescription && (
                <button
                  onClick={onStartEditDescription}
                  className={`p-1 ${themeClasses.text.muted} hover:text-blue-600`}
                  title="Edit description"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {editingDescription ? (
              <div>
                <textarea
                  value={editedDescription}
                  onChange={(e) => onEditedDescriptionChange(e.target.value)}
                  className={`w-full px-3 py-2 rounded-md ${themeClasses.input} resize-none`}
                  rows={5}
                  disabled={savingEdit}
                  autoFocus
                  placeholder="Enter description..."
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={onCancelEditDescription}
                    disabled={savingEdit}
                    className="px-3 py-1 rounded-md text-sm bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSaveDescription}
                    disabled={savingEdit}
                    className="px-3 py-1 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingEdit ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p className={`${themeClasses.text.primary} whitespace-pre-wrap text-sm`}>
                {selectedRequest.description || <span className={themeClasses.text.muted}>No description</span>}
              </p>
            )}
          </div>

          {/* Notes Section */}
          <ServiceRequestNotesSection
            notes={requestNotes}
            loading={loadingNotes}
            newNoteText={newNoteText}
            submittingNote={submittingNote}
            onNewNoteChange={onNewNoteChange}
            onSubmitNote={onSubmitNote}
            otherViewers={otherViewers}
            timeFormatPreference={userTimeFormatPreference}
            newlyReceivedNoteId={newlyReceivedNoteId}
          />

          {/* Row 3: Close */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              disabled={actionLoading}
              className={`px-4 py-2 ${themeClasses.bg.secondary} ${themeClasses.text.primary} rounded-lg hover:opacity-80 disabled:opacity-50`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceRequestDetailModal;
