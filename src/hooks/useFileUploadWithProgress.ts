import { useState } from 'react';
import apiService from '../services/apiService';

export interface FileUploadProgress {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'scanning' | 'success' | 'error';
  error?: string;
  fileId?: string;
}

interface UseFileUploadWithProgressProps {
  uploadUrl: string;
  onSuccess?: (uploadedFiles: any[]) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
  getHeaders?: () => Promise<Record<string, string>>;
}

export const useFileUploadWithProgress = ({
  uploadUrl,
  onSuccess,
  onError,
  onComplete,
  getHeaders
}: UseFileUploadWithProgressProps) => {
  const [uploads, setUploads] = useState<FileUploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    const fileArray = Array.from(files);

    // Initialize upload progress for each file
    const initialUploads: FileUploadProgress[] = fileArray.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      progress: 0,
      status: 'pending' as const
    }));

    setUploads(initialUploads);

    try {
      const formData = new FormData();
      fileArray.forEach(file => {
        formData.append('files', file);
      });

      const csrfToken = await apiService.getToken();
      const additionalHeaders = getHeaders ? await getHeaders() : {};

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 70); // 70% for upload
          setUploads(prev => prev.map(u => ({ ...u, progress, status: 'uploading' as const })));
        }
      });

      // Handle completion
      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          // Update status to scanning
          setUploads(prev => prev.map(u => ({ ...u, status: 'scanning' as const, progress: 75 })));

          try {
            const result = JSON.parse(xhr.responseText);

            if (result.success) {
              // Simulate virus scan progress
              await new Promise(resolve => {
                let scanProgress = 75;
                const scanInterval = setInterval(() => {
                  scanProgress += 5;
                  setUploads(prev => prev.map(u => ({
                    ...u,
                    progress: Math.min(scanProgress, 95)
                  })));

                  if (scanProgress >= 95) {
                    clearInterval(scanInterval);
                    resolve(true);
                  }
                }, 200);
              });

              // Mark as success
              setUploads(prev => prev.map((u, index) => ({
                ...u,
                status: 'success' as const,
                progress: 100,
                fileId: result.data?.uploadedFiles?.[index]?.fileId
              })));

              onSuccess?.(result.data?.uploadedFiles || []);
            } else {
              setUploads(prev => prev.map(u => ({
                ...u,
                status: 'error' as const,
                error: result.message || 'Upload failed'
              })));
              onError?.(result.message || 'Upload failed');
            }
          } catch (error) {
            const errorMessage = 'Failed to process server response';
            setUploads(prev => prev.map(u => ({
              ...u,
              status: 'error' as const,
              error: errorMessage
            })));
            onError?.(errorMessage);
          }
        } else {
          const errorMessage = `Upload failed: ${xhr.statusText}`;
          setUploads(prev => prev.map(u => ({
            ...u,
            status: 'error' as const,
            error: errorMessage
          })));
          onError?.(errorMessage);
        }

        setIsUploading(false);
        onComplete?.();
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        const errorMessage = 'Network error during upload';
        setUploads(prev => prev.map(u => ({
          ...u,
          status: 'error' as const,
          error: errorMessage
        })));
        onError?.(errorMessage);
        setIsUploading(false);
        onComplete?.();
      });

      // Open request and set headers
      xhr.open('POST', uploadUrl);
      xhr.setRequestHeader('x-csrf-token', csrfToken);

      // Set additional headers
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      // Set credentials
      xhr.withCredentials = true;

      // Send request
      xhr.send(formData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploads(prev => prev.map(u => ({
        ...u,
        status: 'error' as const,
        error: errorMessage
      })));
      onError?.(errorMessage);
      setIsUploading(false);
      onComplete?.();
    }
  };

  const clearUploads = () => {
    setUploads([]);
  };

  return {
    uploads,
    isUploading,
    uploadFiles,
    clearUploads
  };
};
