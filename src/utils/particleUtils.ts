import { BackgroundBlob, FloatingShape, CircuitLightning } from '../types/ui/particles';

export const createInitialBlob = (): BackgroundBlob => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  vx: (Math.random() - 0.5) * 0.5,
  vy: (Math.random() - 0.5) * 0.5,
  opacity: 1,
  fadeDirection: 'stable' as const
});

export const createFloatingShape = (id: number): FloatingShape => ({
  id,
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  vx: (Math.random() - 0.5) * 0.3,
  vy: (Math.random() - 0.5) * 0.3,
  opacity: 0,
  size: Math.random() * 8 + 4,
  type: (['circle', 'square', 'triangle', 'line'] as const)[Math.floor(Math.random() * 4)],
  rotation: Math.random() * 360,
  rotationSpeed: (Math.random() - 0.5) * 2,
  fadeDirection: 'in' as const,
  color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][Math.floor(Math.random() * 5)],
  maxOpacity: Math.random() * 0.3 + 0.1
});

export const updateBlobPosition = (blob: BackgroundBlob): BackgroundBlob => {
  const newX = blob.x + blob.vx;
  const newY = blob.y + blob.vy;

  let { vx, vy } = blob;

  // Bounce off edges
  if (newX <= 0 || newX >= window.innerWidth) {
    vx = -vx;
  }
  if (newY <= 0 || newY >= window.innerHeight) {
    vy = -vy;
  }

  return {
    ...blob,
    x: Math.max(0, Math.min(window.innerWidth, newX)),
    y: Math.max(0, Math.min(window.innerHeight, newY)),
    vx,
    vy
  };
};

export const updateShapePosition = (shape: FloatingShape): FloatingShape => {
  const newX = shape.x + shape.vx;
  const newY = shape.y + shape.vy;

  let { vx, vy } = shape;

  // Bounce off edges
  if (newX <= 0 || newX >= window.innerWidth) {
    vx = -vx;
  }
  if (newY <= 0 || newY >= window.innerHeight) {
    vy = -vy;
  }

  // Update opacity based on fade direction
  let newOpacity = shape.opacity;
  if (shape.fadeDirection === 'in') {
    newOpacity = Math.min(shape.maxOpacity, shape.opacity + 0.005);
  } else {
    newOpacity = Math.max(0, shape.opacity - 0.005);
  }

  return {
    ...shape,
    x: Math.max(0, Math.min(window.innerWidth, newX)),
    y: Math.max(0, Math.min(window.innerHeight, newY)),
    vx,
    vy,
    opacity: newOpacity,
    rotation: shape.rotation + shape.rotationSpeed
  };
};

export const generateLightningPath = (startX: number, startY: number, endX: number, endY: number, segments = 8): string => {
  let path = `M ${startX} ${startY}`;

  const dx = endX - startX;
  const dy = endY - startY;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const x = startX + dx * t + (Math.random() - 0.5) * 20;
    const y = startY + dy * t + (Math.random() - 0.5) * 20;
    path += ` L ${x} ${y}`;
  }

  path += ` L ${endX} ${endY}`;
  return path;
};

export const createCircuitLightning = (id: number, x: number, y: number): CircuitLightning => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
  const buildSpeed = Math.random() * 1.5 + 0.5;
  const flickerDuration = Math.random() * 500 + 200;
  const fadeDuration = Math.random() * 1000 + 500;

  return {
    id,
    segments: [],
    x,
    y,
    opacity: 1,
    phase: 'building',
    startTime: Date.now(),
    totalDuration: 3000 + Math.random() * 2000,
    color: colors[Math.floor(Math.random() * colors.length)],
    buildSpeed,
    flickerDuration,
    fadeDuration
  };
};