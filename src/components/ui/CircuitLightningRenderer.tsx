import React from 'react';
import { CircuitLightning } from '../../types/ui/particles';

interface CircuitLightningRendererProps {
  lightnings: CircuitLightning[];
}

const CircuitLightningRenderer: React.FC<CircuitLightningRendererProps> = ({ lightnings }) => {
  return (
    <svg
      className="absolute inset-0 pointer-events-none w-full h-full"
      style={{ zIndex: 10 }}
    >
      {lightnings.map(lightning => (
        <g key={lightning.id} opacity={lightning.opacity}>
          {lightning.segments.map((segment, segmentIndex) => {
            if (!segment.visible && lightning.phase === 'building') {
              return null;
            }

            const flickerOpacity = lightning.phase === 'flicker'
              ? Math.random() > 0.3 ? 1 : 0.3
              : 1;

            return (
              <g key={segmentIndex}>
                {/* Glow effect */}
                <path
                  d={segment.path}
                  stroke={lightning.color}
                  strokeWidth="4"
                  fill="none"
                  opacity={flickerOpacity * 0.3}
                  filter="blur(2px)"
                />
                {/* Main lightning */}
                <path
                  d={segment.path}
                  stroke={lightning.color}
                  strokeWidth="1.5"
                  fill="none"
                  opacity={flickerOpacity}
                />
                {/* Bright core */}
                <path
                  d={segment.path}
                  stroke="white"
                  strokeWidth="0.5"
                  fill="none"
                  opacity={flickerOpacity * 0.8}
                />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
};

export default CircuitLightningRenderer;