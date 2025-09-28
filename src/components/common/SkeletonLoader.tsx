import React from 'react';

interface SkeletonLoaderProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  rounded?: boolean;
  lines?: number;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = '1rem',
  className = '',
  rounded = false,
  lines = 1,
}) => {
  const skeletonStyle = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className={`bg-gray-200 animate-pulse ${rounded ? 'rounded-full' : 'rounded'}`}
            style={{
              ...skeletonStyle,
              width: index === lines - 1 && lines > 1 ? '75%' : skeletonStyle.width,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`bg-gray-200 animate-pulse ${rounded ? 'rounded-full' : 'rounded'} ${className}`}
      style={skeletonStyle}
    />
  );
};

export default SkeletonLoader;