import React from 'react';
import { ExternalLink, Edit2, Check, X, RefreshCw, MapPin, User, Phone, Mail } from 'lucide-react';
import { ServiceRequest, ServiceRequestFile, ServiceRequestNote, ThemeClasses } from './types';
import { getStatusColor, getPriorityColor, formatFullAddress, getMapUrl, formatPhone, canCancelRequest } from './utils';
import { formatLongDate } from '../../../utils/dateFormatter';
import ServiceRequestFilesSection from './ServiceRequestFilesSection';
import ServiceRequestNotesSection from './ServiceRequestNotesSection';
import { FileUploadProgress } from '../../../hooks/useFileUploadWithProgress';

interface ServiceRequestDetailModalProps {
  selectedRequest: ServiceRequest;
  editingTitle: boolean;
  editingDescription: boolean;
  editedTitle: string;
  editedDescription: string;
  savingEdit: boolean;
  otherViewers: Array<{userId: string; userName: string; userType: string}>;
  requestFiles: ServiceRequestFile[];
  loadingFiles: boolean;
  requestNotes: ServiceRequestNote[];
  loadingNotes: boolean;
  newNoteText: string;
  submittingNote: boolean;
  newlyReceivedNoteId: string | null;
  renamingFileId: string | null;
  newFileName: string;
  deletingFileId: string | null;
  uploadingFiles: boolean;
  fileUploads: FileUploadProgress[];
  newlyUploadedFileIds: string[];
  isDarkMode: boolean;
  authUser: any;
  language: string;
  t: (key: string, params?: any, fallback?: string) => string;
  themeClasses: ThemeClasses;
  onClose: () => void;
  onStartEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelEditTitle: () => void;
  onEditedTitleChange: (title: string) => void;
  onStartEditDescription: () => void;
  onSaveDescription: () => void;
  onCancelEditDescription: () => void;
  onEditedDescriptionChange: (description: string) => void;
  onStartRenameFile: (file: ServiceRequestFile) => void;
  onSaveFileName: (fileId: string) => void;
  onCancelRenameFile: () => void;
  onDeleteFile: (fileId: string) => void;
  onUploadFiles: (files: FileList) => void;
  onFileNameChange: (name: string) => void;
  onNoteTextChange: (text: string) => void;
  onSubmitNote: () => void;
  onCancelRequest: (request: ServiceRequest) => void;
}

const ServiceRequestDetailModal: React.FC<ServiceRequestDetailModalProps> = ({
  selectedRequest,
  editingTitle,
  editingDescription,
  editedTitle,
  editedDescription,
  savingEdit,
  otherViewers,
  requestFiles,
  loadingFiles,
  requestNotes,
  loadingNotes,
  newNoteText,
  submittingNote,
  newlyReceivedNoteId,
  renamingFileId,
  newFileName,
  deletingFileId,
  uploadingFiles,
  fileUploads,
  newlyUploadedFileIds,
  isDarkMode,
  authUser,
  language,
  t,
  themeClasses,
  onClose,
  onStartEditTitle,
  onSaveTitle,
  onCancelEditTitle,
  onEditedTitleChange,
  onStartEditDescription,
  onSaveDescription,
  onCancelEditDescription,
  onEditedDescriptionChange,
  onStartRenameFile,
  onSaveFileName,
  onCancelRenameFile,
  onDeleteFile,
  onUploadFiles,
  onFileNameChange,
  onNoteTextChange,
  onSubmitNote,
  onCancelRequest
}) => {
  const getLocale = () => language === 'es' ? 'es-ES' : 'en-US';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 mr-4">
                {editingTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => onEditedTitleChange(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-md text-lg font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
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
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                      {selectedRequest.title}
                    </h3>
                    <button
                      onClick={onStartEditTitle}
                      className="p-1 text-gray-400 hover:text-blue-600"
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
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <ExternalLink className="h-5 w-5 rotate-45" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedRequest.status, isDarkMode)}`}>
                  {t(`status.${selectedRequest.status}`, undefined, selectedRequest.status)}
                </span>
                {selectedRequest.priority && (
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${getPriorityColor(selectedRequest.priority)}`}>
                    {t(`priority.${selectedRequest.priority}`, undefined, selectedRequest.priority)} {t('serviceRequests.priority', undefined, 'Priority')}
                  </span>
                )}
              </div>

              {/* Request Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pb-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.requestNumber', undefined, 'Request #')}:</span>
                  <p className="text-gray-900 dark:text-white">{selectedRequest.requestNumber}</p>
                </div>
                {selectedRequest.serviceType && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.serviceType', undefined, 'Service Type')}:</span>
                    <p className="text-gray-900 dark:text-white">{selectedRequest.serviceType}</p>
                  </div>
                )}
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.created', undefined, 'Created')}:</span>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(selectedRequest.createdAt).toLocaleString(getLocale())}
                  </p>
                </div>
              </div>

              {/* Date & Time Block */}
              {selectedRequest.cost && (selectedRequest.requestedDatetime || (selectedRequest.requestedDate && selectedRequest.requestedTimeStart && selectedRequest.requestedTimeEnd)) && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{t('serviceRequests.selectedDateTime', undefined, 'Selected Date & Time')}</h4>
                  {selectedRequest.requestedDatetime && selectedRequest.requestedDurationMinutes ? (
                    <>
                      <div className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        {formatLongDate(new Date(selectedRequest.requestedDatetime), t, language)}
                      </div>
                      <div className="text-base text-blue-800 dark:text-blue-200">
                        {new Date(selectedRequest.requestedDatetime).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })} - {new Date(new Date(selectedRequest.requestedDatetime).getTime() + selectedRequest.requestedDurationMinutes * 60000).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })} ({(selectedRequest.requestedDurationMinutes / 60).toFixed(1)}h)
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        {formatLongDate(new Date(selectedRequest.requestedDate!), t, language)}
                      </div>
                      <div className="text-base text-blue-800 dark:text-blue-200">
                        {selectedRequest.requestedTimeStart!.substring(0, 5)} - {selectedRequest.requestedTimeEnd!.substring(0, 5)} ({selectedRequest.cost.durationHours}h)
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Cost Estimate Block */}
              {selectedRequest.cost && (
                <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">{t('serviceRequests.costEstimate', undefined, 'Cost Estimate')}</h4>
                  <div className="space-y-1">
                    <div className="text-sm text-green-700 dark:text-green-300">
                      {t('serviceRequests.baseRatePerHour', { rate: String(selectedRequest.cost.baseRate) }, 'Base Rate')} ({selectedRequest.cost.rateCategoryName || 'Standard'}): ${selectedRequest.cost.baseRate}/hr
                    </div>
                    {/* Tier Breakdown */}
                    {selectedRequest.cost.breakdown && selectedRequest.cost.breakdown.map((block, idx) => (
                      <div key={idx} className="text-sm text-green-700 dark:text-green-300">
                        {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                      </div>
                    ))}
                    {/* First Hour Discount */}
                    {selectedRequest.cost.firstHourDiscount && selectedRequest.cost.firstHourDiscount > 0 && (
                      <>
                        <div className="text-sm text-green-700 dark:text-green-300 mt-1 pt-1 border-t border-green-200 dark:border-green-700">
                          {t('serviceRequests.subtotal', 'Subtotal')}: ${selectedRequest.cost.subtotal?.toFixed(2)}
                        </div>
                        <div className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">
                          🎁 {t('serviceRequests.firstHourComp', 'First Hour Comp (New Client)')}:
                        </div>
                        {selectedRequest.cost.firstHourCompBreakdown?.map((compBlock, idx) => (
                          <div key={idx} className="text-sm text-green-700 dark:text-green-300 ml-4">
                            • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                          </div>
                        ))}
                        {selectedRequest.cost.firstHourCompBreakdown && selectedRequest.cost.firstHourCompBreakdown.length > 1 && (
                          <div className="text-sm text-green-700 dark:text-green-300 font-medium ml-4">
                            {t('serviceRequests.totalDiscount', 'Total Discount')}: -${selectedRequest.cost.firstHourDiscount.toFixed(2)}
                          </div>
                        )}
                      </>
                    )}
                    <div className="text-base font-semibold text-green-900 dark:text-green-100 mt-2 pt-1 border-t border-green-200 dark:border-green-700">
                      {t('serviceRequests.totalEstimate', { total: selectedRequest.cost.total.toFixed(2) }, 'Total*: ${{total}}')}
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1 italic">
                      * {t('scheduler.costDisclaimer', undefined, 'Actual cost may vary based on time required to complete the service')}
                    </div>
                  </div>
                </div>
              )}

              {/* Location & Contact Information Side-by-Side on larger screens */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

                {/* Location & Contact Information */}
                {selectedRequest.locationDetails && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('serviceRequests.locationContact', undefined, 'Location & Contact')}</h4>

                    <div className="space-y-3">
                      {/* Address */}
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('serviceRequests.address', undefined, 'Address')}</span>
                        <a
                          href={getMapUrl(selectedRequest.locationDetails)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 mt-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <div>{selectedRequest.locationDetails.streetAddress1}</div>
                            {selectedRequest.locationDetails.streetAddress2 && (
                              <div>{selectedRequest.locationDetails.streetAddress2}</div>
                            )}
                            <div>
                              {selectedRequest.locationDetails.city}, {selectedRequest.locationDetails.state} {selectedRequest.locationDetails.zipCode}
                            </div>
                          </div>
                        </a>
                      </div>

                      {/* Contact Information - Compact */}
                      <div className="space-y-2">
                        {selectedRequest.locationDetails.contactPerson && (
                          <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                            <User className="h-4 w-4 text-gray-400" />
                            {selectedRequest.locationDetails.contactPerson}
                          </div>
                        )}

                        {selectedRequest.locationDetails.contactEmail && (
                          <a
                            href={`mailto:${selectedRequest.locationDetails.contactEmail}`}
                            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <Mail className="h-4 w-4" />
                            {selectedRequest.locationDetails.contactEmail}
                          </a>
                        )}

                        {selectedRequest.locationDetails.contactPhone && (
                          <a
                            href={`tel:${selectedRequest.locationDetails.contactPhone}`}
                            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <Phone className="h-4 w-4" />
                            {formatPhone(selectedRequest.locationDetails.contactPhone)}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Details */}
              {(selectedRequest.scheduledDate) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {selectedRequest.scheduledDate && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.scheduledDate', undefined, 'Scheduled Date')}:</span>
                      <p className="text-gray-900 dark:text-white">
                        {new Date(selectedRequest.scheduledDate).toLocaleDateString(getLocale())}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Files Section */}
              <ServiceRequestFilesSection
                fileCount={selectedRequest.fileCount}
                loadingFiles={loadingFiles}
                files={requestFiles}
                renamingFileId={renamingFileId}
                newFileName={newFileName}
                deletingFileId={deletingFileId}
                uploadingFiles={uploadingFiles}
                fileUploads={fileUploads}
                newlyUploadedFileIds={newlyUploadedFileIds}
                savingEdit={savingEdit}
                t={t}
                themeClasses={themeClasses}
                onStartRename={onStartRenameFile}
                onSaveFileName={onSaveFileName}
                onCancelRename={onCancelRenameFile}
                onDeleteFile={onDeleteFile}
                onUploadFiles={onUploadFiles}
                onFileNameChange={onFileNameChange}
              />

              {/* Description Section */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('serviceRequests.description', undefined, 'Description')}</h4>
                  {!editingDescription && (
                    <button
                      onClick={onStartEditDescription}
                      className="p-1 text-gray-400 hover:text-blue-600"
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
                      className={`w-full px-3 py-2 border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
                      rows={5}
                      disabled={savingEdit}
                      autoFocus
                      placeholder={t('serviceRequests.descriptionPlaceholder', undefined, 'Enter description...')}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={onCancelEditDescription}
                        disabled={savingEdit}
                        className="px-3 py-1 rounded-md text-sm bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50"
                      >
                        {t('common.cancel', undefined, 'Cancel')}
                      </button>
                      <button
                        onClick={onSaveDescription}
                        disabled={savingEdit}
                        className="px-3 py-1 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {savingEdit ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            {t('common.saving', undefined, 'Saving...')}
                          </>
                        ) : (
                          t('common.save', undefined, 'Save')
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                    {selectedRequest.description || <span className="text-gray-500 dark:text-gray-400">{t('serviceRequests.noDescription', undefined, 'No description')}</span>}
                  </p>
                )}
              </div>

              {/* Notes Section */}
              <ServiceRequestNotesSection
                notes={requestNotes}
                loadingNotes={loadingNotes}
                newNoteText={newNoteText}
                submittingNote={submittingNote}
                newlyReceivedNoteId={newlyReceivedNoteId}
                otherViewers={otherViewers}
                authUser={authUser}
                t={t}
                locale={getLocale()}
                themeClasses={themeClasses}
                onNoteTextChange={onNoteTextChange}
                onSubmitNote={onSubmitNote}
              />
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
            >
              {t('general.close', undefined, 'Close')}
            </button>
            {canCancelRequest(selectedRequest) && (
              <button
                onClick={() => {
                  onClose();
                  onCancelRequest(selectedRequest);
                }}
                className="w-full inline-flex justify-center rounded-md border border-red-300 dark:border-red-700 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm"
              >
                {t('serviceRequests.cancel', undefined, 'Cancel')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceRequestDetailModal;
