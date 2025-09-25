import { useState, useCallback, useRef } from 'react';
import { BackgroundBlob, FloatingShape, CircuitLightning } from '../types/ui/particles';
import {
  createInitialBlob,
  createFloatingShape,
  updateBlobPosition,
  updateShapePosition,
  createCircuitLightning,
  generateLightningPath
} from '../utils/particleUtils';

export const useBackgroundBlobs = (count: number = 5) => {
  const [backgroundBlobs, setBackgroundBlobs] = useState<BackgroundBlob[]>(() =>
    Array.from({ length: count }, createInitialBlob)
  );

  const updateBlobs = useCallback(() => {
    setBackgroundBlobs(blobs => blobs.map(updateBlobPosition));
  }, []);

  return { backgroundBlobs, updateBlobs };
};

export const useFloatingShapes = (maxCount: number = 15) => {
  const [floatingShapes, setFloatingShapes] = useState<FloatingShape[]>([]);
  const nextShapeId = useRef(0);

  const addShape = useCallback(() => {
    if (floatingShapes.length < maxCount) {
      setFloatingShapes(shapes => [...shapes, createFloatingShape(nextShapeId.current++)]);
    }
  }, [floatingShapes.length, maxCount]);

  const updateShapes = useCallback(() => {
    setFloatingShapes(shapes =>
      shapes
        .map(updateShapePosition)
        .map(shape => {
          if (shape.fadeDirection === 'in' && shape.opacity >= shape.maxOpacity) {
            return { ...shape, fadeDirection: 'out' as const };
          }
          return shape;
        })
        .filter(shape => shape.opacity > 0.001)
    );
  }, []);

  return { floatingShapes, updateShapes, addShape };
};

export const useCircuitLightning = () => {
  const [circuitLightning, setCircuitLightning] = useState<CircuitLightning[]>([]);
  const nextLightningId = useRef(0);

  const createLightning = useCallback((x: number, y: number) => {
    const lightning = createCircuitLightning(nextLightningId.current++, x, y);

    // Generate initial segments
    const numBranches = Math.floor(Math.random() * 4) + 2;
    const segments = [];

    for (let i = 0; i < numBranches; i++) {
      const angle = (Math.PI * 2 * i) / numBranches + (Math.random() - 0.5) * 0.5;
      const length = Math.random() * 80 + 40;
      const endX = x + Math.cos(angle) * length;
      const endY = y + Math.sin(angle) * length;

      segments.push({
        path: generateLightningPath(x, y, endX, endY),
        startTime: Date.now() + i * 100 * lightning.buildSpeed,
        duration: 200 * lightning.buildSpeed,
        visible: false,
        startX: x,
        startY: y,
        endX,
        endY,
        parentIndex: -1
      });
    }

    lightning.segments = segments;
    setCircuitLightning(prev => [...prev, lightning]);
  }, []);

  const updateLightning = useCallback(() => {
    const now = Date.now();

    setCircuitLightning(lightnings =>
      lightnings
        .map(lightning => {
          const elapsed = now - lightning.startTime;

          if (elapsed > lightning.totalDuration) {
            return null;
          }

          const updatedLightning = { ...lightning };

          // Update segments visibility during building phase
          if (lightning.phase === 'building') {
            updatedLightning.segments = lightning.segments.map(segment => ({
              ...segment,
              visible: now >= segment.startTime && now <= segment.startTime + segment.duration
            }));

            // Check if building phase is complete
            const buildingComplete = lightning.segments.every(segment =>
              now > segment.startTime + segment.duration
            );

            if (buildingComplete) {
              updatedLightning.phase = 'flicker';
            }
          }

          // Handle flicker phase
          if (lightning.phase === 'flicker') {
            const flickerStart = lightning.startTime + lightning.segments.reduce((max, segment) =>
              Math.max(max, segment.startTime + segment.duration - lightning.startTime), 0
            );

            if (now > flickerStart + lightning.flickerDuration) {
              updatedLightning.phase = 'fade';
            }
          }

          // Handle fade phase
          if (lightning.phase === 'fade') {
            const fadeStart = lightning.startTime + lightning.segments.reduce((max, segment) =>
              Math.max(max, segment.startTime + segment.duration - lightning.startTime), 0
            ) + lightning.flickerDuration;

            const fadeProgress = Math.min(1, (now - fadeStart) / lightning.fadeDuration);
            updatedLightning.opacity = 1 - fadeProgress;
          }

          return updatedLightning;
        })
        .filter((lightning): lightning is CircuitLightning => lightning !== null)
    );
  }, []);

  return { circuitLightning, createLightning, updateLightning };
};