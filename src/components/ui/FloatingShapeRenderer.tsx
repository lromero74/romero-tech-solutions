import React from 'react';
import { FloatingShape } from '../../types/ui/particles';

interface FloatingShapeRendererProps {
  shapes: FloatingShape[];
}

const FloatingShapeRenderer: React.FC<FloatingShapeRendererProps> = ({ shapes }) => {
  const renderShape = (shape: FloatingShape) => {
    const baseStyle = {
      position: 'absolute' as const,
      left: shape.x,
      top: shape.y,
      opacity: shape.opacity,
      transform: `translate(-50%, -50%) rotate(${shape.rotation}deg)`,
      transition: 'opacity 0.1s ease-in-out',
      pointerEvents: 'none' as const
    };

    switch (shape.type) {
      case 'circle':
        return (
          <div
            key={shape.id}
            style={{
              ...baseStyle,
              width: shape.size,
              height: shape.size,
              backgroundColor: shape.color,
              borderRadius: '50%'
            }}
          />
        );
      case 'square':
        return (
          <div
            key={shape.id}
            style={{
              ...baseStyle,
              width: shape.size,
              height: shape.size,
              backgroundColor: shape.color
            }}
          />
        );
      case 'triangle':
        return (
          <div
            key={shape.id}
            style={{
              ...baseStyle,
              width: 0,
              height: 0,
              borderLeft: `${shape.size / 2}px solid transparent`,
              borderRight: `${shape.size / 2}px solid transparent`,
              borderBottom: `${shape.size}px solid ${shape.color}`
            }}
          />
        );
      case 'line':
        return (
          <div
            key={shape.id}
            style={{
              ...baseStyle,
              width: shape.size * 2,
              height: '2px',
              backgroundColor: shape.color
            }}
          />
        );
      default:
        return null;
    }
  };

  return <>{shapes.map(renderShape)}</>;
};

export default FloatingShapeRenderer;