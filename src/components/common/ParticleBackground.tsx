import React, { useCallback } from 'react';

interface ParticleBackgroundProps {
  containerRef?: React.RefObject<HTMLElement>;
  boundaries?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

const ParticleBackground: React.FC<ParticleBackgroundProps> = ({ containerRef, boundaries }) => {
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [isTabVisible, setIsTabVisible] = React.useState(true);
  const [backgroundBlobs, setBackgroundBlobs] = React.useState<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    opacity: number;
    fadeDirection: 'in' | 'out' | 'stable';
  }>>([]);
  const [circuitLightning, setCircuitLightning] = React.useState<Array<{
    id: number;
    segments: Array<{
      path: string;
      startTime: number;
      duration: number;
      visible: boolean;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      parentIndex: number; // -1 for root segments
    }>;
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
  }>>([]);
  const [floatingShapes, setFloatingShapes] = React.useState<Array<{
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
  }>>([]);
  const rafRef = React.useRef<number>();
  const shapeIdRef = React.useRef(0);
  const lightningIdRef = React.useRef(0);
  const lastLightningTime = React.useRef(0);
  const lastFrameTime = React.useRef(Date.now());

  // Get effective boundaries for particle constraint
  const getEffectiveBoundaries = React.useCallback(() => {
    if (boundaries) {
      return boundaries;
    }

    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect();
      return {
        left: 0,
        top: 0,
        right: rect.width,
        bottom: rect.height
      };
    }

    // Fallback to window dimensions
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  }, [boundaries, containerRef]);

  // Generate circuit lightning segments with timing
  const generateCircuitSegments = useCallback((startX: number, startY: number): Array<{
    path: string;
    startTime: number;
    duration: number;
    visible: boolean;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    parentIndex: number;
  }> => {
    const bounds = getEffectiveBoundaries();
    const screenHeight = bounds.bottom;
    const topThird = screenHeight / 3;
    const bottomThird = screenHeight * 2 / 3;

    // Determine weighting based on vertical position
    const getDirectionWeights = (y: number) => {
      const directions = [
        { angle: 0, name: 'E', index: 0 },    // East
        { angle: 45, name: 'NE', index: 1 },  // Northeast
        { angle: 90, name: 'N', index: 2 },   // North
        { angle: 135, name: 'NW', index: 3 }, // Northwest
        { angle: 180, name: 'W', index: 4 },  // West
        { angle: 225, name: 'SW', index: 5 }, // Southwest
        { angle: 270, name: 'S', index: 6 },  // South
        { angle: 315, name: 'SE', index: 7 }  // Southeast
      ];

      // Default equal weights
      const weights = [1, 1, 1, 1, 1, 1, 1, 1];

      if (y <= topThird) {
        // Top third: favor SW, S, SE (downward directions)
        weights[5] = 3; // SW
        weights[6] = 3; // S
        weights[7] = 3; // SE
      } else if (y >= bottomThird) {
        // Bottom third: favor NW, N, NE (upward directions)
        weights[1] = 3; // NE
        weights[2] = 3; // N
        weights[3] = 3; // NW
      }

      return { directions, weights };
    };

    // Weighted random selection
    const selectWeightedDirection = (weights: number[], availableIndices: number[]) => {
      const availableWeights = availableIndices.map(i => weights[i]);
      const totalWeight = availableWeights.reduce((sum, weight) => sum + weight, 0);

      if (totalWeight === 0) return availableIndices[0]; // Fallback

      let random = Math.random() * totalWeight;
      for (let i = 0; i < availableIndices.length; i++) {
        random -= availableWeights[i];
        if (random <= 0) {
          return availableIndices[i];
        }
      }
      return availableIndices[availableIndices.length - 1]; // Fallback
    };

    const segments: Array<{
      path: string;
      startTime: number;
      duration: number;
      visible: boolean;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      parentIndex: number;
    }> = [];

    const { directions, weights } = getDirectionWeights(startY);

    // Generate main trunk first
    const trunkLength = Math.floor(Math.random() * 8) + 5; // 5-12 segments for main trunk
    let currentX = startX;
    let currentY = startY;
    let lastDirectionIndex = Math.floor(Math.random() * 8);

    for (let i = 0; i < trunkLength; i++) {
      // For trunk, allow slight direction changes (adjacent directions)
      const availableDirections = [
        lastDirectionIndex,
        (lastDirectionIndex + 1) % 8,
        (lastDirectionIndex - 1 + 8) % 8
      ];

      const chosenDirectionIndex = selectWeightedDirection(weights, availableDirections);
      const direction = directions[chosenDirectionIndex];
      const length = Math.random() * 60 + 30; // 30-90px segments

      const radians = (direction.angle * Math.PI) / 180;
      const deltaX = Math.cos(radians) * length;
      const deltaY = Math.sin(radians) * length;

      const newX = currentX + deltaX;
      const newY = currentY + deltaY;

      // Keep within screen bounds
      const boundedX = Math.max(bounds.left + 50, Math.min(bounds.right - 50, newX));
      const boundedY = Math.max(bounds.top + 50, Math.min(bounds.bottom - 50, newY));

      segments.push({
        path: `M ${currentX} ${currentY} L ${boundedX} ${boundedY}`,
        startTime: i * 100 + Math.random() * 50, // Sequential timing with small random offset
        duration: Math.random() * 200 + 150, // 150-350ms to draw each segment
        visible: false,
        startX: currentX,
        startY: currentY,
        endX: boundedX,
        endY: boundedY,
        parentIndex: i === 0 ? -1 : i - 1 // First segment has no parent, others connect to previous
      });

      currentX = boundedX;
      currentY = boundedY;
      lastDirectionIndex = chosenDirectionIndex;
    }

    // Generate branches from random points along the trunk
    const numBranches = Math.floor(Math.random() * 2) + 1; // 1-2 branches

    for (let b = 0; b < numBranches; b++) {
      // Pick a random trunk segment to branch from (not the first or last)
      const branchFromIndex = Math.floor(Math.random() * (trunkLength - 2)) + 1;
      const branchPoint = segments[branchFromIndex];

      // Choose a random point along the branch segment to start from
      const t = Math.random() * 0.6 + 0.2; // 20%-80% along the segment
      const branchStartX = branchPoint.startX + (branchPoint.endX - branchPoint.startX) * t;
      const branchStartY = branchPoint.startY + (branchPoint.endY - branchPoint.startY) * t;

      // Generate branch segments
      const branchLength = Math.floor(Math.random() * 3) + 2; // 2-4 segments per branch
      let branchX = branchStartX;
      let branchY = branchStartY;
      let branchDirectionIndex = Math.floor(Math.random() * 8);

      for (let i = 0; i < branchLength; i++) {
        // Branches also limited to 45-degree turns
        const availableDirections = [
          branchDirectionIndex,
          (branchDirectionIndex + 1) % 8,
          (branchDirectionIndex - 1 + 8) % 8
        ];

        const chosenDirectionIndex = selectWeightedDirection(weights, availableDirections);
        const direction = directions[chosenDirectionIndex];
        const length = Math.random() * 40 + 20; // 20-60px segments for branches

        const radians = (direction.angle * Math.PI) / 180;
        const deltaX = Math.cos(radians) * length;
        const deltaY = Math.sin(radians) * length;

        const newX = branchX + deltaX;
        const newY = branchY + deltaY;

        // Keep within screen bounds
        const boundedX = Math.max(bounds.left, Math.min(bounds.right, newX));
        const boundedY = Math.max(bounds.top, Math.min(bounds.bottom, newY));

        const segmentIndex = segments.length;
        const parentIndex = i === 0 ? branchFromIndex : segmentIndex - 1;

        // Branch timing starts after its parent trunk segment is visible
        const parentStartTime = segments[parentIndex].startTime + segments[parentIndex].duration;

        segments.push({
          path: `M ${branchX} ${branchY} L ${boundedX} ${boundedY}`,
          startTime: parentStartTime + (i * 80) + Math.random() * 40, // Sequential after parent
          duration: Math.random() * 150 + 100, // 100-250ms for branch segments
          visible: false,
          startX: branchX,
          startY: branchY,
          endX: boundedX,
          endY: boundedY,
          parentIndex: parentIndex
        });

        branchX = boundedX;
        branchY = boundedY;
        branchDirectionIndex = chosenDirectionIndex;
      }
    }

    return segments;
  }, [getEffectiveBoundaries]);

  // Handle particle generation from external clicks
  const handleParticleGeneration = useCallback((clickX: number, clickY: number) => {
    
    // 1/5 chance (20%) to spawn lightning
    if (Math.random() < 0.2) {
      const colors = [
        'rgba(59, 130, 246, 0.8)',   // blue
        'rgba(20, 184, 166, 0.8)',   // teal
        'rgba(99, 102, 241, 0.8)',   // indigo
        'rgba(168, 85, 247, 0.8)',   // purple
        'rgba(34, 197, 94, 0.8)',    // green
        'rgba(245, 158, 11, 0.8)',   // amber
        'rgba(255, 255, 255, 0.9)'   // white
      ];
      
      // Generate random speed and lifetime characteristics
      const buildSpeed = Math.random() * 1.9 + 0.1; // 0.1 to 2.0 (fast to slow)
      const flickerDuration = Math.random() * 1500 + 200; // 200ms to 1700ms
      const fadeDuration = Math.random() * 1000 + 500; // 500ms to 1500ms
      
      const newLightning = {
        id: lightningIdRef.current++,
        segments: generateCircuitSegments(clickX, clickY, buildSpeed),
        x: clickX,
        y: clickY,
        opacity: 1,
        phase: 'building' as const,
        startTime: Date.now(),
        totalDuration: flickerDuration + fadeDuration,
        color: colors[Math.floor(Math.random() * colors.length)],
        buildSpeed: buildSpeed,
        flickerDuration: flickerDuration,
        fadeDuration: fadeDuration
      };
      
      setCircuitLightning(prev => [...prev, newLightning]);
    } else {
      // Generate 3-8 random particles at click location
      const numParticles = Math.floor(Math.random() * 6) + 3; // 3-8 particles
      const colors = [
        'rgba(59, 130, 246, 0.6)',   // blue
        'rgba(20, 184, 166, 0.6)',   // teal
        'rgba(99, 102, 241, 0.6)',   // indigo
        'rgba(34, 197, 94, 0.6)',    // green
        'rgba(168, 85, 247, 0.6)',   // purple
        'rgba(236, 72, 153, 0.6)',   // pink
        'rgba(245, 158, 11, 0.6)',   // amber
        'rgba(255, 255, 255, 0.5)'   // white
      ];
      
      const getRandomType = () => {
        const rand = Math.random();
        if (rand < 0.4) return 'line';      // 40%
        if (rand < 0.6) return 'circle';    // 20%
        if (rand < 0.8) return 'square';    // 20%
        return 'triangle';                  // 20%
      };
      
      const newParticles = Array.from({ length: numParticles }, () => ({
        id: shapeIdRef.current++,
        x: clickX + (Math.random() - 0.5) * 40, // Spread particles around click point
        y: clickY + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 4, // Higher initial velocity for click particles
        vy: (Math.random() - 0.5) * 4,
        opacity: 0,
        size: Math.random() * 16 + 6, // Slightly larger than normal particles
        type: getRandomType(),
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 5,
        fadeDirection: 'in' as const,
        maxOpacity: Math.random() * 0.6 + 0.4, // Higher opacity for click particles
        color: colors[Math.floor(Math.random() * colors.length)]
      }));
      
      setFloatingShapes(prev => [...prev, ...newParticles]);
    }
  }, [generateCircuitSegments]);

  // Initialize background blobs
  React.useEffect(() => {
    const bounds = getEffectiveBoundaries();
    const initialBlobs = Array.from({ length: 5 }, () => ({
      x: Math.random() * bounds.right,
      y: Math.random() * bounds.bottom,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      opacity: 1,
      fadeDirection: 'stable' as const
    }));
    setBackgroundBlobs(initialBlobs);
  }, [getEffectiveBoundaries]);

  // Listen for particle generation events
  React.useEffect(() => {
    const handleCustomParticleEvent = (e: CustomEvent) => {
      handleParticleGeneration(e.detail.x, e.detail.y);
    };

    window.addEventListener('generateParticles', handleCustomParticleEvent as EventListener);
    return () => {
      window.removeEventListener('generateParticles', handleCustomParticleEvent as EventListener);
    };
  }, [handleParticleGeneration]);

  // Check if two line segments intersect - COMMENTED OUT (UNUSED)
  // const doLinesIntersect = (
  //   x1: number, y1: number, x2: number, y2: number,
  //   x3: number, y3: number, x4: number, y4: number
  // ): boolean => {
  //   const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  //   if (Math.abs(denom) < 0.0001) return false; // Lines are parallel
  //
  //   const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  //   const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  //
  //   // Only consider it an intersection if lines actually cross (not just touch at endpoints)
  //   return t > 0.1 && t < 0.9 && u > 0.1 && u < 0.9;
  // };

  // Check if a new segment would intersect with existing segments - COMMENTED OUT (UNUSED)
  // const wouldIntersect = (
  //   newX1: number, newY1: number, newX2: number, newY2: number,
  //   occupiedSegments: Array<{x1: number, y1: number, x2: number, y2: number}>
  // ): boolean => {
  //   // Only check against segments that aren't connected to this one
  //   return occupiedSegments.some(segment => {
  //     // Skip if this segment connects to the existing segment (shares an endpoint)
  //     const sharesEndpoint =
  //       (Math.abs(newX1 - segment.x1) < 1 && Math.abs(newY1 - segment.y1) < 1) ||
  //       (Math.abs(newX1 - segment.x2) < 1 && Math.abs(newY1 - segment.y2) < 1) ||
  //       (Math.abs(newX2 - segment.x1) < 1 && Math.abs(newY2 - segment.y1) < 1) ||
  //       (Math.abs(newX2 - segment.x2) < 1 && Math.abs(newY2 - segment.y2) < 1);
  //
  //     if (sharesEndpoint) return false;
  //
  //     return doLinesIntersect(newX1, newY1, newX2, newY2, segment.x1, segment.y1, segment.x2, segment.y2);
  //   });
  // };

  // Generate all paths and return as separate strings - COMMENTED OUT (UNUSED)
  // const generateAllPaths = (
  //   startX: number,
  //   startY: number,
  //   maxSegments: number = 15,
  //   currentDepth: number = 0,
  //   maxDepth: number = 3,
  //   branchCounter: { count: number } = { count: 0 },
  //   occupiedSegments: Array<{x1: number, y1: number, x2: number, y2: number}> = []
  // ): string[] => {
  //   const singlePath = generateSinglePath(startX, startY, maxSegments, currentDepth, maxDepth, branchCounter, occupiedSegments, true);
  //   return singlePath.allPaths || [singlePath.mainPath || singlePath as string];
  // };

  // const generateSinglePath = (
  //   startX: number,
  //   startY: number,
  //   maxSegments: number = 15,
  //   currentDepth: number = 0,
  //   maxDepth: number = 3,
  //   branchCounter: { count: number } = { count: 0 },
  //   occupiedSegments: Array<{x1: number, y1: number, x2: number, y2: number}> = [],
  //   returnAllPaths: boolean = false
  // ): string | { mainPath: string; allPaths: string[] } => {
    // // Prevent infinite recursion by limiting branch depth
  //     if (currentDepth >= maxDepth) {
  //       // Return a simple path with no branches when max depth is reached
  //       const segments = Math.floor(Math.random() * 5) + 3; // 3-7 segments for deep branches
  //       let path = `M ${startX} ${startY}`;
  //       let currentX = startX;
  //       let currentY = startY;
  //       
  //       const directions = [
  //         { angle: 0, name: 'E' },    // East
  //         { angle: 45, name: 'NE' },  // Northeast  
  //         { angle: 90, name: 'N' },   // North
  //         { angle: 135, name: 'NW' }, // Northwest
  //         { angle: 180, name: 'W' },  // West
  //         { angle: 225, name: 'SW' }, // Southwest
  //         { angle: 270, name: 'S' },  // South
  //         { angle: 315, name: 'SE' }  // Southeast
  //       ];
  //       
  //       for (let i = 0; i < segments; i++) {
  //         const direction = directions[Math.floor(Math.random() * directions.length)];
  //         const length = Math.random() * 60 + 15; // 15-75px segments
  //         
  //         const radians = (direction.angle * Math.PI) / 180;
  //         const deltaX = Math.cos(radians) * length;
  //         const deltaY = Math.sin(radians) * length;
  //         
  //         currentX += deltaX;
  //         currentY += deltaY;
  //         
  //         // Keep within screen bounds
  //         const bounds = getEffectiveBoundaries();
  //         currentX = Math.max(bounds.left, Math.min(bounds.right, currentX));
  //         currentY = Math.max(bounds.top, Math.min(bounds.bottom, currentY));
  //         
  //         // Add this segment to occupied segments (for deep branches, we don't track intersections)
  //         const prevX = i === 0 ? startX : currentX - deltaX;
  //         const prevY = i === 0 ? startY : currentY - deltaY;
  //         occupiedSegments.push({ x1: prevX, y1: prevY, x2: currentX, y2: currentY });
  //         
  //         path += ` L ${currentX} ${currentY}`;
  //       }
  //       
  //       return returnAllPaths ? { mainPath: path, allPaths: [path] } : path;
  //     }
  //     
  //     const segments = Math.floor(Math.random() * (maxSegments || 15)) + 3; // 3-15 segments (or custom max)
  //     let path = `M ${startX} ${startY}`;
  //     let currentX = startX;
  //     let currentY = startY;
  //     const allPaths: string[] = [];
  //     
  //     // Cardinal directions: N, NE, E, SE, S, SW, W, NW
  //     const directions = [
  //       { angle: 0, name: 'E' },    // East
  //       { angle: 45, name: 'NE' },  // Northeast  
  //       { angle: 90, name: 'N' },   // North
  //       { angle: 135, name: 'NW' }, // Northwest
  //       { angle: 180, name: 'W' },  // West
  //       { angle: 225, name: 'SW' }, // Southwest
  //       { angle: 270, name: 'S' },  // South
  //       { angle: 315, name: 'SE' }  // Southeast
  //     ];
  //     
  //     let lastDirectionIndex = -1;
  //     let consecutiveTurns = 0;
  //     let lastTurnDirection = 0; // -1 for counter-clockwise, 1 for clockwise, 0 for none
  //     
  //     for (let i = 0; i < segments; i++) {
  //       let availableDirections;
  //       
  //       if (lastDirectionIndex === -1) {
  //         // First segment - any direction is valid
  //         availableDirections = directions.map((_, index) => index);
  //       } else {
  //         // Get adjacent directions (exactly 45 degrees clockwise and counter-clockwise)
  //         const clockwiseIndex = (lastDirectionIndex + 1) % 8;
  //         const counterClockwiseIndex = (lastDirectionIndex - 1 + 8) % 8;
  //         
  //         // Only allow exactly 45-degree turns (adjacent directions only)
  //         availableDirections = [lastDirectionIndex, clockwiseIndex, counterClockwiseIndex];
  //         
  //         // Filter out directions that would exceed consecutive turn limit
  //         if (consecutiveTurns >= 4) {
  //           availableDirections = availableDirections.filter(dirIndex => {
  //             const turnDirection = getTurnDirection(lastDirectionIndex, dirIndex);
  //             return turnDirection !== lastTurnDirection;
  //           });
  //         }
  //       }
  //       
  //       // Filter out directions that would cause intersections
  //       availableDirections = availableDirections.filter(dirIndex => {
  //         const direction = directions[dirIndex];
  //         const length = Math.random() * 80 + 20; // Same length calculation as below
  //         
  //         const radians = (direction.angle * Math.PI) / 180;
  //         const deltaX = Math.cos(radians) * length;
  //         const deltaY = Math.sin(radians) * length;
  //         
  //         let testX = currentX + deltaX;
  //         let testY = currentY + deltaY;
  //         
  //         // Keep within screen bounds for test
  //         const bounds = getEffectiveBoundaries();
  //         testX = Math.max(bounds.left, Math.min(bounds.right, testX));
  //         testY = Math.max(bounds.top, Math.min(bounds.bottom, testY));
  //         
  //         // Check if this segment would intersect with existing segments
  //         return !wouldIntersect(currentX, currentY, testX, testY, occupiedSegments);
  //       });
  //       
  //       // If no valid directions available, break the path
  //       if (availableDirections.length === 0) {
  //         break;
  //       }
  //       
  //       const chosenDirectionIndex = availableDirections[Math.floor(Math.random() * availableDirections.length)];
  //       const direction = directions[chosenDirectionIndex];
  //       const length = Math.random() * 80 + 20; // 20-100px segments
  //       
  //       const radians = (direction.angle * Math.PI) / 180;
  //       const deltaX = Math.cos(radians) * length;
  //       const deltaY = Math.sin(radians) * length;
  //       
  //       const prevX = currentX;
  //       const prevY = currentY;
  //       
  //       currentX += deltaX;
  //       currentY += deltaY;
  //       
  //       // Keep within screen bounds
  //       const bounds = getEffectiveBoundaries();
  //       currentX = Math.max(bounds.left, Math.min(bounds.right, currentX));
  //       currentY = Math.max(bounds.top, Math.min(bounds.bottom, currentY));
  //       
  //       // Add this segment to occupied segments
  //       occupiedSegments.push({ x1: prevX, y1: prevY, x2: currentX, y2: currentY });
  //       
  //       path += ` L ${currentX} ${currentY}`;
  //       
  //       // Random chance to create a branch (30% chance, but not on first or last segment)
  //       if (i > 0 && i < segments - 1 && Math.random() < 0.3 && currentDepth < maxDepth && branchCounter.count < 4) {
  //         // Create up to 4 branches from this point
  //         const rand = Math.random();
  //         let numBranches;
  //         if (rand < 0.4) numBranches = 1;      // 40% chance for 1 branch
  //         else if (rand < 0.7) numBranches = 2; // 30% chance for 2 branches
  //         else if (rand < 0.9) numBranches = 3; // 20% chance for 3 branches
  //         else numBranches = 4;                 // 10% chance for 4 branches
  //         
  //         // Limit branches to not exceed terminal point limit
  //         const remainingTerminals = 4 - branchCounter.count;
  //         numBranches = Math.min(numBranches, remainingTerminals);
  //         
  //         for (let b = 0; b < numBranches; b++) {
  //           branchCounter.count++;
  //           // Generate branch with fewer segments (3-8)
  //           const branchSegments = Math.floor(Math.random() * 6) + 3;
  //           const branchResult = generateSinglePath(currentX, currentY, branchSegments, currentDepth + 1, maxDepth, branchCounter, occupiedSegments, true);
  //           if (typeof branchResult === 'object' && branchResult.allPaths) {
  //             allPaths.push(...branchResult.allPaths);
  //           } else if (typeof branchResult === 'string') {
  //             allPaths.push(branchResult);
  //           }
  //         }
  //       }
  //       
  //       // Update turn tracking
  //       if (lastDirectionIndex !== -1) {
  //         const turnDirection = getTurnDirection(lastDirectionIndex, chosenDirectionIndex);
  //         if (turnDirection === lastTurnDirection && turnDirection !== 0) {
  //           consecutiveTurns++;
  //         } else {
  //           consecutiveTurns = turnDirection !== 0 ? 1 : 0;
  //           lastTurnDirection = turnDirection;
  //         }
  //       }
  //       
  //       lastDirectionIndex = chosenDirectionIndex;
  //     }
  //     
  //     if (returnAllPaths) {
  //       return { mainPath: path, allPaths: [path, ...allPaths] };
  //     }
  //     
  //     // For backward compatibility, combine all paths
  //     return [path, ...allPaths].join(' ');
  //   };
  
  // Helper function to determine turn direction - COMMENTED OUT (UNUSED)
  // const getTurnDirection = (fromIndex: number, toIndex: number) => {
  //   const diff = (toIndex - fromIndex + 8) % 8;
  //   if (diff === 1) return 1;  // Clockwise
  //   if (diff === 7) return -1; // Counter-clockwise
  //   return 0; // No turn (shouldn't happen with adjacent directions)
  // };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsTabVisible(isVisible);

      if (isVisible) {
        // Reset timing when tab becomes visible again
        lastFrameTime.current = Date.now();
        lastLightningTime.current = Date.now();
      } else {
        // Clear any accumulated particles when tab becomes hidden
        setCircuitLightning([]);
        setFloatingShapes(prev => prev.filter(shape => shape.fadeDirection !== 'out'));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Generate circuit lightning periodically
  React.useEffect(() => {
    // Don't even set up the interval if tab is not visible
    if (!isTabVisible) return;

    const generateLightning = () => {
      // Double check visibility at generation time
      if (!isTabVisible || document.hidden) return;

      const now = Date.now();
      // Lightning frequency: every 10-20 seconds (max 6 per minute)
      const timeSinceLastLightning = now - lastLightningTime.current;
      const nextLightningDelay = Math.random() * 10000 + 10000; // 10-20 seconds

      if (timeSinceLastLightning > nextLightningDelay) {
        const colors = [
          'rgba(59, 130, 246, 0.8)',   // blue
          'rgba(20, 184, 166, 0.8)',   // teal
          'rgba(99, 102, 241, 0.8)',   // indigo
          'rgba(168, 85, 247, 0.8)',   // purple
          'rgba(34, 197, 94, 0.8)',    // green
          'rgba(245, 158, 11, 0.8)',   // amber
          'rgba(255, 255, 255, 0.9)'   // white
        ];

        const bounds = getEffectiveBoundaries();
        const startX = bounds.left + Math.random() * (bounds.right - bounds.left);
        const startY = bounds.top + Math.random() * (bounds.bottom - bounds.top);

        // Generate random speed and lifetime characteristics
        const buildSpeed = Math.random() * 1.9 + 0.1; // 0.1 to 2.0 (fast to slow)
        const flickerDuration = Math.random() * 1500 + 200; // 200ms to 1700ms
        const fadeDuration = Math.random() * 1000 + 500; // 500ms to 1500ms

        const newLightning = {
          id: lightningIdRef.current++,
          segments: generateCircuitSegments(startX, startY, buildSpeed),
          x: startX,
          y: startY,
          opacity: 1,
          phase: 'building' as const,
          startTime: now,
          totalDuration: Math.random() * 2000 + 2000, // 2-4 seconds total
          color: colors[Math.floor(Math.random() * colors.length)],
          buildSpeed: buildSpeed,
          flickerDuration: flickerDuration,
          fadeDuration: fadeDuration
        };

        setCircuitLightning(prev => [...prev, newLightning]);
        lastLightningTime.current = now;
      }
    };

    const interval = setInterval(generateLightning, 100); // Check every 100ms
    return () => clearInterval(interval);
  }, [isTabVisible, generateCircuitSegments, getEffectiveBoundaries]);
  // Generate new floating shapes periodically
  React.useEffect(() => {
    const generateShape = () => {
      const colors = [
        'rgba(59, 130, 246, 0.3)',   // blue
        'rgba(20, 184, 166, 0.3)',   // teal
        'rgba(99, 102, 241, 0.3)',   // indigo
        'rgba(34, 197, 94, 0.3)',    // green
        'rgba(168, 85, 247, 0.3)',   // purple
        'rgba(236, 72, 153, 0.3)',   // pink
        'rgba(245, 158, 11, 0.3)',   // amber
        'rgba(255, 255, 255, 0.2)'   // white
      ];
      
      // Weighted selection: line 40%, others 20% each
      const getRandomType = () => {
        const rand = Math.random();
        if (rand < 0.4) return 'line';      // 40%
        if (rand < 0.6) return 'circle';    // 20%
        if (rand < 0.8) return 'square';    // 20%
        return 'triangle';                  // 20%
      };
      
      const bounds = getEffectiveBoundaries();
      return {
        id: shapeIdRef.current++,
        x: bounds.left + Math.random() * (bounds.right - bounds.left),
        y: bounds.top + Math.random() * (bounds.bottom - bounds.top),
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        opacity: 0,
        size: Math.random() * 12 + 4,
        type: getRandomType(),
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 3,
        fadeDirection: 'in' as const,
        maxOpacity: Math.random() * 0.4 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
    };

    // Initial shapes
    const initialShapes = Array.from({ length: 50 }, generateShape);
    setFloatingShapes(initialShapes);

    // Only set up interval if tab is visible
    if (!isTabVisible) return;

    // Add new shapes periodically
    const interval = setInterval(() => {
      // Double check visibility at generation time
      if (!isTabVisible || document.hidden) return;

      setFloatingShapes(prev => {
        // Remove shapes that have faded out completely
        const activeShapes = prev.filter(shape =>
          !(shape.fadeDirection === 'out' && shape.opacity <= 0)
        );

        // Add new shape if we have fewer than 30
        if (activeShapes.length < 60) {
          return [...activeShapes, generateShape()];
        }

        return activeShapes;
      });
    }, Math.random() * 3000 + 1000); // Random interval between 1-4 seconds

    return () => clearInterval(interval);
  }, [isTabVisible, getEffectiveBoundaries]);

  React.useEffect(() => {
    // Don't start animation if tab is not visible
    if (!isTabVisible) return;

    const animate = () => {
      // Don't animate if tab is not visible
      if (!isTabVisible || document.hidden) {
        // Stop the animation loop completely when tab is not visible
        return;
      }
      
      const now = Date.now();
      const deltaTime = now - lastFrameTime.current;
      lastFrameTime.current = now;
      
      // Skip frame if too much time has passed (tab was inactive)
      if (deltaTime > 100) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }
      
      // Animate background blobs
      setBackgroundBlobs(prevBlobs => {
        return prevBlobs.map((blob) => {
          // Add small random forces for natural movement
          const randomForceX = (Math.random() - 0.5) * 0.02;
          const randomForceY = (Math.random() - 0.5) * 0.02;
          
          // Update velocity with random forces and damping
          let newVx = blob.vx + randomForceX;
          let newVy = blob.vy + randomForceY;
          
          // Apply damping to prevent runaway velocities
          newVx *= 0.99;
          newVy *= 0.99;
          
          // Limit maximum velocity
          const maxVel = 0.8;
          const speed = Math.sqrt(newVx * newVx + newVy * newVy);
          if (speed > maxVel) {
            newVx = (newVx / speed) * maxVel;
            newVy = (newVy / speed) * maxVel;
          }
          
          // Update position with boundary constraints
          let newX = blob.x + newVx;
          let newY = blob.y + newVy;

          const bounds = getEffectiveBoundaries();

          // Enforce hard boundaries - bounce off edges
          if (newX <= bounds.left || newX >= bounds.right) {
            newVx = -newVx * 0.8; // Reverse and dampen velocity
            newX = Math.max(bounds.left, Math.min(bounds.right, newX));
          }

          if (newY <= bounds.top || newY >= bounds.bottom) {
            newVy = -newVy * 0.8; // Reverse and dampen velocity
            newY = Math.max(bounds.top, Math.min(bounds.bottom, newY));
          }

          // Velocities are already updated in boundary check above

          // Handle opacity and fading
          let newOpacity = blob.opacity;
          let newFadeDirection = blob.fadeDirection;

          // Check if blob is too close to edges for smooth fading (visual only)
          const fadeMargin = 50;
          const isNearFadeEdge = newX < bounds.left + fadeMargin || newX > bounds.right - fadeMargin ||
                                newY < bounds.top + fadeMargin || newY > bounds.bottom - fadeMargin;

          if (isNearFadeEdge && blob.fadeDirection === 'stable') {
            newFadeDirection = 'out';
          }
          
          // Handle fading
          if (blob.fadeDirection === 'out') {
            newOpacity -= 0.02;
            if (newOpacity <= 0) {
              // Reset blob to new random position and fade in
              const bounds = getEffectiveBoundaries();
              newX = bounds.left + Math.random() * (bounds.right - bounds.left);
              newY = bounds.top + Math.random() * (bounds.bottom - bounds.top);
              newVx = (Math.random() - 0.5) * 0.5;
              newVy = (Math.random() - 0.5) * 0.5;
              newOpacity = 0;
              newFadeDirection = 'in';
            }
          } else if (blob.fadeDirection === 'in') {
            newOpacity += 0.02;
            if (newOpacity >= 1) {
              newOpacity = 1;
              newFadeDirection = 'stable';
            }
          }
          
          return {
            x: newX,
            y: newY,
            vx: newVx,
            vy: newVy,
            opacity: newOpacity,
            fadeDirection: newFadeDirection
          };
        });
      });
      
      // Animate circuit lightning
      setCircuitLightning(prevLightning => {
        const now = Date.now();
        
        // Don't update lightning if tab is not visible
        if (!isTabVisible) {
          return prevLightning;
        }
        
        return prevLightning.filter(lightning => {
          const timeSinceStart = now - lightning.startTime;
          
          if (lightning.phase === 'building') {
            // Update segment visibility based on timing and parent visibility
            lightning.segments.forEach(segment => {
              if (!segment.visible && timeSinceStart >= segment.startTime) {
                // Check if parent is visible (or if this is a root segment)
                if (segment.parentIndex === -1 || lightning.segments[segment.parentIndex].visible) {
                  segment.visible = true;
                }
              }
            });
            
            // Check if all segments are visible and building phase is complete
            const allVisible = lightning.segments.every(segment => segment.visible);
            const buildingComplete = timeSinceStart >= Math.max(...lightning.segments.map(s => s.startTime + s.duration));
            
            if (allVisible && buildingComplete) {
              lightning.phase = 'flicker';
              // Reset the start time for flicker phase to begin timing from now
              lightning.startTime = now;
            }
            
            // Flicker during build phase - segments flicker as they appear
            lightning.opacity = Math.random() * 0.7 + 0.3; // 0.3 to 1.0
          } else if (lightning.phase === 'flicker') {
            // Random opacity between 10% and 100% for more dramatic flicker
            lightning.opacity = Math.random() * 0.9 + 0.1; // 0.1 to 1.0
            
            // Check if flicker duration has elapsed
            if (timeSinceStart >= lightning.flickerDuration) {
              lightning.phase = 'fade';
              // Reset the start time for fade phase to begin timing from now
              lightning.startTime = now;
            }
          } else if (lightning.phase === 'fade') {
            // Fade phase: gradual fade out
            const fadeRate = 0.03 * (1000 / lightning.fadeDuration); // Adjust fade rate based on desired fade duration
            lightning.opacity -= fadeRate;
            if (lightning.opacity <= 0) {
              return false; // Remove this lightning
            }
          }
          return true;
        });
      });
      
      // Animate floating shapes
      setFloatingShapes(prevShapes => {
        return prevShapes.map(shape => {
          // Calculate mouse repulsion force
          const mouseDistance = Math.sqrt(
            Math.pow(shape.x - mousePos.x, 2) + Math.pow(shape.y - mousePos.y, 2)
          );
          
          // Repulsion strength - stronger when closer, max effect within 150px
          const repulsionRadius = 150;
          const repulsionStrength = mouseDistance < repulsionRadius 
            ? (repulsionRadius - mouseDistance) / repulsionRadius * 0.1 // Max strength of 0.1
            : 0;
          
          // Calculate repulsion direction (away from mouse)
          const repulsionX = mouseDistance > 0 ? (shape.x - mousePos.x) / mouseDistance * repulsionStrength : 0;
          const repulsionY = mouseDistance > 0 ? (shape.y - mousePos.y) / mouseDistance * repulsionStrength : 0;
          
          // Update velocity with repulsion force
          let newVx = shape.vx + repulsionX;
          let newVy = shape.vy + repulsionY;
          
          // Apply some damping to prevent infinite acceleration
          const maxVelocity = 2;
          const currentSpeed = Math.sqrt(newVx * newVx + newVy * newVy);
          if (currentSpeed > maxVelocity) {
            newVx = (newVx / currentSpeed) * maxVelocity;
            newVy = (newVy / currentSpeed) * maxVelocity;
          }
          
          // Update position using new velocity
          let newX = shape.x + newVx;
          let newY = shape.y + newVy;

          // Enforce hard boundaries - bounce off edges
          const bounds = getEffectiveBoundaries();
          if (newX <= bounds.left || newX >= bounds.right) {
            newVx = -newVx * 0.7; // Reverse and dampen velocity
            newX = Math.max(bounds.left, Math.min(bounds.right, newX));
          }

          if (newY <= bounds.top || newY >= bounds.bottom) {
            newVy = -newVy * 0.7; // Reverse and dampen velocity
            newY = Math.max(bounds.top, Math.min(bounds.bottom, newY));
          }
          
          // Update rotation
          const newRotation = shape.rotation + shape.rotationSpeed;
          
          // Update opacity based on fade direction
          let newOpacity = shape.opacity;
          let newFadeDirection = shape.fadeDirection;
          
          if (shape.fadeDirection === 'in') {
            newOpacity += 0.01;
            if (newOpacity >= shape.maxOpacity) {
              newOpacity = shape.maxOpacity;
              // Random chance to start fading out
              if (Math.random() < 0.005) {
                newFadeDirection = 'out';
              }
            }
          } else {
            newOpacity -= 0.005;
            if (newOpacity <= 0) {
              newOpacity = 0;
            }
          }
          
          return {
            ...shape,
            vx: newVx,
            vy: newVy,
            x: newX,
            y: newY,
            rotation: newRotation,
            opacity: newOpacity,
            fadeDirection: newFadeDirection
          };
        });
      });
      
      rafRef.current = requestAnimationFrame(animate);
    };
    
    rafRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [mousePos, isTabVisible, getEffectiveBoundaries]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        clipPath: boundaries ? `inset(${boundaries.top}px ${window.innerWidth - boundaries.right}px ${window.innerHeight - boundaries.bottom}px ${boundaries.left}px)` : undefined
      }}
    >
      {/* Circuit Lightning */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 2 }}>
        <defs>
          {/* Create glow filters for different colors */}
          <filter id="lightning-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="lightning-glow-teal" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="lightning-glow-white" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="lightning-glow-purple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="lightning-glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="lightning-glow-amber" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {circuitLightning.map(lightning => (
          <g key={lightning.id}>
            {lightning.segments.map((segment, index) => (
              <g key={index}>
                {/* Outer glow layer */}
                <path
                  d={segment.path}
                  stroke={lightning.color}
                  strokeWidth="6"
                  fill="none"
                  opacity={segment.visible ? lightning.opacity * 0.3 : 0}
                  filter={`url(#lightning-glow-${lightning.color.includes('59, 130, 246') ? 'blue' : 
                    lightning.color.includes('20, 184, 166') ? 'teal' :
                    lightning.color.includes('255, 255, 255') ? 'white' :
                    lightning.color.includes('168, 85, 247') ? 'purple' :
                    lightning.color.includes('34, 197, 94') ? 'green' :
                    lightning.color.includes('245, 158, 11') ? 'amber' : 'blue'})`}
                  style={{
                    transition: lightning.phase === 'building' || lightning.phase === 'flicker' ? 'none' : (segment.visible ? 'opacity 0.1s ease-in' : 'none')
                  }}
                />
                {/* Middle glow layer */}
                <path
                  d={segment.path}
                  stroke={lightning.color}
                  strokeWidth="3"
                  fill="none"
                  opacity={segment.visible ? lightning.opacity * 0.6 : 0}
                  style={{
                    filter: 'blur(1px)',
                    transition: lightning.phase === 'building' || lightning.phase === 'flicker' ? 'none' : (segment.visible ? 'opacity 0.1s ease-in' : 'none')
                  }}
                />
                {/* Core lightning bolt */}
                <path
                  d={segment.path}
                  stroke={lightning.color}
                  strokeWidth="1.5"
                  fill="none"
                  opacity={segment.visible ? lightning.opacity : 0}
                  style={{
                    filter: 'brightness(1.5)',
                    transition: lightning.phase === 'building' || lightning.phase === 'flicker' ? 'none' : (segment.visible ? 'opacity 0.1s ease-in' : 'none')
                  }}
                />
                {/* Inner bright core */}
                <path
                  d={segment.path}
                  stroke="rgba(255, 255, 255, 0.9)"
                  strokeWidth="0.5"
                  fill="none"
                  opacity={segment.visible ? lightning.opacity * 0.8 : 0}
                  style={{
                    transition: lightning.phase === 'building' || lightning.phase === 'flicker' ? 'none' : (segment.visible ? 'opacity 0.1s ease-in' : 'none')
                  }}
                />
              </g>
            ))}
          </g>
        ))}
      </svg>
      
      {/* Dynamic Floating Shapes */}
      {floatingShapes.map(shape => {
        const shapeStyle = {
          position: 'absolute' as const,
          left: `${shape.x}px`,
          top: `${shape.y}px`,
          width: `${shape.size}px`,
          height: shape.type === 'line' ? '2px' : `${shape.size}px`,
          opacity: shape.opacity,
          transform: `rotate(${shape.rotation}deg)`,
          backgroundColor: shape.color,
          transition: 'opacity 0.5s ease-out',
          pointerEvents: 'none' as const,
          zIndex: 1
        };

        if (shape.type === 'circle') {
          return (
            <div
              key={shape.id}
              style={{
                ...shapeStyle,
                borderRadius: '50%'
              }}
            />
          );
        } else if (shape.type === 'square') {
          return (
            <div
              key={shape.id}
              style={shapeStyle}
            />
          );
        } else if (shape.type === 'triangle') {
          return (
            <div
              key={shape.id}
              style={{
                ...shapeStyle,
                width: 0,
                height: 0,
                backgroundColor: 'transparent',
                borderLeft: `${shape.size / 2}px solid transparent`,
                borderRight: `${shape.size / 2}px solid transparent`,
                borderBottom: `${shape.size}px solid ${shape.color}`
              }}
            />
          );
        } else { // line
          return (
            <div
              key={shape.id}
              style={{
                ...shapeStyle,
                width: `${shape.size * 2}px`
              }}
            />
          );
        }
      })}
      
      {/* Background Blobs */}
      {backgroundBlobs.map((blob, index) => {
        const sizes = ['w-96 h-96', 'w-64 h-64', 'w-48 h-48', 'w-32 h-32', 'w-80 h-80'];
        const blurs = ['blur-3xl', 'blur-2xl', 'blur-xl', 'blur-lg', 'blur-3xl'];
        const gradients = [
          'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(147, 197, 253, 0.2) 50%, transparent 100%)',
          'radial-gradient(circle, rgba(20, 184, 166, 0.4) 0%, rgba(153, 246, 228, 0.2) 50%, transparent 100%)',
          'radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, rgba(196, 181, 253, 0.2) 50%, transparent 100%)',
          'radial-gradient(circle, rgba(34, 197, 94, 0.3) 0%, rgba(134, 239, 172, 0.1) 50%, transparent 100%)',
          'radial-gradient(ellipse 120% 80%, rgba(168, 85, 247, 0.3) 0%, rgba(196, 181, 253, 0.1) 40%, transparent 100%)'
        ];
        const opacityMultipliers = [0.1, 0.15, 0.2, 0.25, 0.08];
        
        return (
          <div 
            key={index}
            className={`absolute ${sizes[index]} rounded-full ${blurs[index]} transition-all duration-1000 ease-out`}
            style={{
              background: gradients[index],
              transform: `translate(${blob.x}px, ${blob.y}px)${index === 4 ? ` rotate(${blob.x * 0.1}deg)` : ''}`,
              opacity: blob.opacity * opacityMultipliers[index]
            }}
          />
        );
      })}
    </div>
  );
};

export default ParticleBackground;