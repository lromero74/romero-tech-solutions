import React from 'react';
import { X } from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';

interface PhotoModalProps {
  showPhotoModal: boolean;
  selectedPhoto: { src: string; alt: string } | null;
  onClose: () => void;
}

const PhotoModal: React.FC<PhotoModalProps> = ({
  showPhotoModal,
  selectedPhoto,
  onClose
}) => {
  const { theme } = useTheme();
  if (!showPhotoModal || !selectedPhoto) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50`}
      onClick={onClose}
    >
      <div className={`relative max-w-4xl max-h-screen p-4 ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary}`}>
        <button
          onClick={onClose}
          className={`absolute top-2 right-2 ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 z-10 transition-colors border ${themeClasses.border.primary}`}
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={selectedPhoto.src}
          alt={selectedPhoto.alt}
          className={`max-w-full max-h-full object-contain rounded-lg border ${themeClasses.border.secondary} shadow-lg`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

export default PhotoModal;