import React from 'react';
import { BackgroundBlob } from '../../types/ui/particles';

interface BackgroundBlobRendererProps {
  blobs: BackgroundBlob[];
}

const BackgroundBlobRenderer: React.FC<BackgroundBlobRendererProps> = ({ blobs }) => {
  return (
    <>
      {blobs.map((blob, index) => (
        <div
          key={index}
          className="absolute pointer-events-none"
          style={{
            left: blob.x,
            top: blob.y,
            transform: 'translate(-50%, -50%)',
            opacity: blob.opacity * 0.3,
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            filter: 'blur(20px)',
            transition: 'opacity 0.3s ease-in-out'
          }}
        />
      ))}
    </>
  );
};

export default BackgroundBlobRenderer;