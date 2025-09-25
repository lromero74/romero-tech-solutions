export interface BackgroundBlob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  fadeDirection: 'in' | 'out' | 'stable';
}

export interface CircuitLightningSegment {
  path: string;
  startTime: number;
  duration: number;
  visible: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  parentIndex: number; // -1 for root segments
}

export interface CircuitLightning {
  id: number;
  segments: CircuitLightningSegment[];
  x: number;
  y: number;
  opacity: number;
  phase: 'building' | 'flicker' | 'fade';
  startTime: number;
  totalDuration: number;
  color: string;
  buildSpeed: number; // Multiplier for build timing (0.1 = very fast, 1.0 = normal, 2.0 = slow)
  flickerDuration: number; // How long to flicker in ms
  fadeDuration: number; // How long to fade in ms
}

export interface FloatingShape {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  size: number;
  type: 'circle' | 'square' | 'triangle' | 'line';
  rotation: number;
  rotationSpeed: number;
  fadeDirection: 'in' | 'out';
  color: string;
  maxOpacity: number;
}

export interface ParticleConfig {
  maxBlobs: number;
  maxShapes: number;
  animationSpeed: number;
  colors: string[];
}