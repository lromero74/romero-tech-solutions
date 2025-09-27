import React from 'react';
import { themeClasses } from '../../contexts/ThemeContext';

interface PhotoUploadInterfaceProps {
  photo: string;
  photoPositionX: number;
  photoPositionY: number;
  photoScale: number;
  photoBackgroundColor?: string;
  enableBackgroundColor?: boolean;
  onPhotoChange: (photo: string) => void;
  onPositionChange: (x: number, y: number) => void;
  onScaleChange: (scale: number) => void;
  onBackgroundColorChange?: (color: string | null) => void;
  onBackgroundColorToggle?: (enabled: boolean) => void;
  className?: string;
}

export const PhotoUploadInterface: React.FC<PhotoUploadInterfaceProps> = ({
  photo,
  photoPositionX,
  photoPositionY,
  photoScale,
  photoBackgroundColor,
  enableBackgroundColor = false,
  onPhotoChange,
  onPositionChange,
  onScaleChange,
  onBackgroundColorChange,
  onBackgroundColorToggle,
  className = ""
}) => {

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (2.5MB = 2,621,440 bytes)
      if (file.size > 2621440) {
        alert('Photo size must be less than 2.5MB. Please choose a smaller image.');
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        onPhotoChange(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePositionReset = () => {
    onPositionChange(50, 50);
  };

  const handleScaleReset = () => {
    onScaleChange(100);
  };

  const handleResetAll = () => {
    onPositionChange(50, 50);
    onScaleChange(100);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* File Upload */}
      <div>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className={`block w-full text-sm ${themeClasses.text.muted} file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:dark:bg-gray-700 file:hover:bg-gray-200 file:dark:hover:bg-gray-600 file:text-gray-700 file:dark:text-gray-300`}
        />
      </div>

      {/* URL Input */}
      <input
        type="url"
        value={photo && !photo.startsWith('data:') ? photo : ''}
        onChange={(e) => onPhotoChange(e.target.value)}
        className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2`}
        placeholder="Enter photo URL"
      />

      {/* Background Color Controls */}
      {onBackgroundColorToggle && onBackgroundColorChange && (
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={enableBackgroundColor}
                onChange={(e) => {
                  onBackgroundColorToggle(e.target.checked);
                  if (!e.target.checked) {
                    onBackgroundColorChange(null);
                  } else if (!photoBackgroundColor) {
                    onBackgroundColorChange('#F8FAFC'); // Default off-white
                  }
                }}
                className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                Enable Background Color
              </span>
            </label>
          </div>

          {enableBackgroundColor && (
            <div className="flex items-center space-x-3">
              <label className={`text-sm ${themeClasses.text.secondary}`}>
                Background Color:
              </label>
              <input
                type="color"
                value={photoBackgroundColor || '#F8FAFC'}
                onChange={(e) => onBackgroundColorChange(e.target.value)}
                className="w-12 h-8 rounded border border-gray-300 cursor-pointer"
              />
              <span className={`text-xs ${themeClasses.text.muted}`}>
                {photoBackgroundColor || '#F8FAFC'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Photo Preview */}
      {photo && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div
              className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-gray-300"
              style={{
                backgroundColor: enableBackgroundColor && photoBackgroundColor ? photoBackgroundColor : 'transparent'
              }}
            >
              <img
                src={photo}
                alt="Profile preview"
                className="w-full h-full object-cover"
                style={{
                  transform: `scale(${photoScale / 100})`,
                  transformOrigin: `${photoPositionX}% ${photoPositionY}%`
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </div>

          {/* Photo Crop Tool */}
          <div className="space-y-3">
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>
              Photo Crop Tool - Drag to position, scroll to zoom
            </div>
            <div className="flex justify-center">
              <div className="relative">
                {/* Photo Container */}
                <div
                  className="relative w-80 h-80 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50 hover:border-gray-400 transition-colors duration-150 cursor-move"
                  style={{
                    backgroundColor: enableBackgroundColor && photoBackgroundColor ? photoBackgroundColor : 'transparent'
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startPosX = photoPositionX;
                    const startPosY = photoPositionY;

                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      const deltaX = ((moveEvent.clientX - startX) / 320) * 100;
                      const deltaY = ((moveEvent.clientY - startY) / 320) * 100;

                      // Always use inverted movement for natural feel
                      let newPosX = startPosX - deltaX;
                      let newPosY = startPosY - deltaY;

                      // Keep within bounds
                      newPosX = Math.max(0, Math.min(100, newPosX));
                      newPosY = Math.max(0, Math.min(100, newPosY));

                      onPositionChange(newPosX, newPosY);
                    };

                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove);
                      document.removeEventListener('mouseup', handleMouseUp);
                      document.body.style.userSelect = '';
                      document.body.style.cursor = '';
                    };

                    document.body.style.userSelect = 'none';
                    document.body.style.cursor = 'move';
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                  }}
                >
                  <img
                    src={photo}
                    alt="Photo crop preview"
                    className="w-full h-full object-cover pointer-events-none"
                    style={{
                      transform: `scale(${photoScale / 100})`,
                      transformOrigin: `${photoPositionX}% ${photoPositionY}%`
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>

                {/* Instructions */}
                <div className={`text-xs ${themeClasses.text.muted} text-center mt-2`}>
                  Drag image to position • Use slider below to zoom
                </div>

                {/* Zoom Slider */}
                <div className="mt-4 w-80">
                  <div className={`text-xs ${themeClasses.text.secondary} mb-2 flex justify-between`}>
                    <span>Zoom: {photoScale}%</span>
                    <span>100% - 400%</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="400"
                    step="5"
                    value={photoScale}
                    onChange={(e) => onScaleChange(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((photoScale - 100) / 300) * 100}%, #e5e7eb ${((photoScale - 100) / 300) * 100}%, #e5e7eb 100%)`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Current Values Display */}
            <div className={`text-xs ${themeClasses.text.muted} text-center space-y-1`}>
              <div>Position: {Number(photoPositionX).toFixed(1)}%, {Number(photoPositionY).toFixed(1)}%</div>
              <div>Scale: {photoScale}%</div>
            </div>

            {/* Reset Controls */}
            <div className="flex justify-center space-x-4">
              <button
                type="button"
                onClick={handlePositionReset}
                className={`px-3 py-1 text-xs ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} border ${themeClasses.border.primary} rounded transition-colors`}
              >
                Center
              </button>
              <button
                type="button"
                onClick={handleScaleReset}
                className={`px-3 py-1 text-xs ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} border ${themeClasses.border.primary} rounded transition-colors`}
              >
                Reset Size
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className={`px-3 py-1 text-xs ${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} border ${themeClasses.border.primary} rounded transition-colors`}
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      <p className={`text-xs ${themeClasses.text.muted}`}>Upload an image file or enter a URL to a profile photo.</p>
    </div>
  );
};