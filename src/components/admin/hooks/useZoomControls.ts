import { useState, useEffect, useRef, useMemo } from 'react';
import { ZoomDomain, ChartDisplayType } from '../MetricsChart.types';

interface UseZoomControlsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chartData: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candlestickData: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heikenAshiData: any[];
  chartDisplayType: ChartDisplayType;
  calculateInitialZoomDomain: ZoomDomain | null;
  selectedTimeWindow: number;
  setSelectedTimeWindow: (window: number) => void;
}

export function useZoomControls({
  chartData,
  candlestickData,
  heikenAshiData,
  chartDisplayType,
  calculateInitialZoomDomain,
  selectedTimeWindow,
  setSelectedTimeWindow,
}: UseZoomControlsProps) {
  // Zoom and pan state
  const [zoomDomain, setZoomDomain] = useState<ZoomDomain | null>(null);
  const [animatedZoomDomain, setAnimatedZoomDomain] = useState<ZoomDomain | null>(null);
  const hasInitializedZoom = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const isInitialMount = useRef<boolean>(true);
  const prevChartDisplayType = useRef<ChartDisplayType>('line');
  const prevDataLengthRef = useRef<number>(0);
  const zoomDomainRef = useRef<ZoomDomain | null>(null);
  const timeWindowChangedByBrushRef = useRef<boolean>(false);

  // Get the active domain (for both display and calculations)
  const activeDomain = useMemo(() => {
    return animatedZoomDomain || zoomDomain;
  }, [animatedZoomDomain, zoomDomain]);

  // Calculate zoom percentage for display
  const zoomPercentage = useMemo(() => {
    if (!activeDomain || !chartData || chartData.length === 0) return 100;
    const visibleRange = activeDomain.endIndex - activeDomain.startIndex + 1;
    return Math.round((visibleRange / chartData.length) * 100);
  }, [activeDomain, chartData]);

  // Keep ref in sync with state
  useEffect(() => {
    zoomDomainRef.current = zoomDomain;
  }, [zoomDomain]);

  // Smooth animation for zoom domain changes
  useEffect(() => {
    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // If no zoom domain or no previous animated domain, set immediately
    if (!zoomDomain || !animatedZoomDomain) {
      setAnimatedZoomDomain(zoomDomain);
      return;
    }

    // Calculate the difference to determine if we should animate
    const startDiff = Math.abs(zoomDomain.startIndex - animatedZoomDomain.startIndex);
    const endDiff = Math.abs(zoomDomain.endIndex - animatedZoomDomain.endIndex);

    // If change is very small, set immediately to avoid jitter
    if (startDiff < 2 && endDiff < 2) {
      setAnimatedZoomDomain(zoomDomain);
      return;
    }

    // Smooth animation using requestAnimationFrame
    const startTime = performance.now();
    const duration = 200;
    const startDomain = { ...animatedZoomDomain };
    const targetDomain = { ...zoomDomain };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function: easeOutCubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate between start and target
      const newStartIndex = startDomain.startIndex + (targetDomain.startIndex - startDomain.startIndex) * easedProgress;
      const newEndIndex = startDomain.endIndex + (targetDomain.endIndex - startDomain.endIndex) * easedProgress;

      setAnimatedZoomDomain({
        startIndex: Math.round(newStartIndex),
        endIndex: Math.round(newEndIndex),
      });

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomDomain]);

  // Initialize zoom domain only on first mount
  useEffect(() => {
    if (!hasInitializedZoom.current && calculateInitialZoomDomain) {
      setZoomDomain(calculateInitialZoomDomain);

      setTimeout(() => {
        hasInitializedZoom.current = true;
        isInitialMount.current = false;
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart auto-follow: only follow when right brush is at the most recent data
  useEffect(() => {
    if (!chartData || chartData.length === 0) return;

    // Only act when new data arrives (length increases)
    const dataLengthIncreased = chartData.length > prevDataLengthRef.current;
    const prevDataLength = prevDataLengthRef.current;
    prevDataLengthRef.current = chartData.length;

    if (!dataLengthIncreased) return;

    // If we have a zoom domain, check if the right handle is at the end
    const currentZoomDomain = zoomDomainRef.current;
    if (currentZoomDomain) {
      const isAtEnd = currentZoomDomain.endIndex >= prevDataLength - 2;

      if (isAtEnd) {
        // Shift the zoom window forward to follow new data
        const zoomRange = currentZoomDomain.endIndex - currentZoomDomain.startIndex;
        const newEndIndex = chartData.length - 1;
        const newStartIndex = Math.max(0, newEndIndex - zoomRange);

        setZoomDomain({ startIndex: newStartIndex, endIndex: newEndIndex });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData.length]);

  // Auto-zoom disabled - keep X interval the same when switching between line and candlestick
  useEffect(() => {
    prevChartDisplayType.current = chartDisplayType;
  }, [chartDisplayType]);

  // When selectedTimeWindow changes, apply the new zoom window
  useEffect(() => {
    if (timeWindowChangedByBrushRef.current) {
      return;
    }

    if (hasInitializedZoom.current && calculateInitialZoomDomain) {
      setZoomDomain(calculateInitialZoomDomain);
    }
  }, [selectedTimeWindow, calculateInitialZoomDomain]);

  // Zoom handlers
  const handleZoomIn = () => {
    if (!chartData || chartData.length === 0) return;

    const currentStart = zoomDomain?.startIndex ?? 0;
    const currentEnd = zoomDomain?.endIndex ?? chartData.length - 1;
    const currentRange = currentEnd - currentStart;

    // Zoom in by 25%
    const newRange = Math.max(10, Math.floor(currentRange * 0.75));
    const center = Math.floor((currentStart + currentEnd) / 2);
    const newStart = Math.max(0, center - Math.floor(newRange / 2));
    const newEnd = Math.min(chartData.length - 1, newStart + newRange);

    setZoomDomain({ startIndex: newStart, endIndex: newEnd });
  };

  const handleZoomOut = () => {
    if (!chartData || chartData.length === 0) return;

    const currentStart = zoomDomain?.startIndex ?? 0;
    const currentEnd = zoomDomain?.endIndex ?? chartData.length - 1;
    const currentRange = currentEnd - currentStart;

    // Zoom out by 33%
    const newRange = Math.min(chartData.length - 1, Math.floor(currentRange * 1.33));
    const center = Math.floor((currentStart + currentEnd) / 2);
    const newStart = Math.max(0, center - Math.floor(newRange / 2));
    const newEnd = Math.min(chartData.length - 1, newStart + newRange);

    // If we're at full range, reset zoom
    if (newStart === 0 && newEnd === chartData.length - 1) {
      setZoomDomain(null);
    } else {
      setZoomDomain({ startIndex: newStart, endIndex: newEnd });
    }
  };

  const handleResetZoom = () => {
    setZoomDomain(null);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBrushChange = (domain: any) => {
    // Ignore brush changes during initial mount
    if (isInitialMount.current || !hasInitializedZoom.current) {
      return;
    }

    if (domain && domain.startIndex !== undefined && domain.endIndex !== undefined) {
      let startIndex = domain.startIndex;
      let endIndex = domain.endIndex;

      // Convert indices from candle space to chartData space if needed
      if (chartDisplayType === 'candlestick' && candlestickData.length > 0 && chartData.length > 0) {
        const ratio = chartData.length / candlestickData.length;
        startIndex = Math.max(0, Math.floor(domain.startIndex * ratio));
        endIndex = Math.min(chartData.length - 1, Math.ceil(domain.endIndex * ratio));
      } else if (chartDisplayType === 'heiken-ashi' && heikenAshiData.length > 0 && chartData.length > 0) {
        const ratio = chartData.length / heikenAshiData.length;
        startIndex = Math.max(0, Math.floor(domain.startIndex * ratio));
        endIndex = Math.min(chartData.length - 1, Math.ceil(domain.endIndex * ratio));
      }

      const newDomain = { startIndex, endIndex };
      setZoomDomain(newDomain);

      // Calculate the time range and update the Window dropdown to closest match
      if (chartData && chartData.length > 0 && startIndex < chartData.length && endIndex < chartData.length) {
        const startTime = new Date(chartData[startIndex].timestamp).getTime();
        const endTime = new Date(chartData[endIndex].timestamp).getTime();
        const durationMs = endTime - startTime;
        const durationHours = durationMs / (1000 * 60 * 60);

        const timeWindowOptions = [1, 4, 12, 24, 48, 168];
        let closestWindow = timeWindowOptions[0];
        let minDiff = Math.abs(durationHours - closestWindow);

        for (const option of timeWindowOptions) {
          const diff = Math.abs(durationHours - option);
          if (diff < minDiff) {
            minDiff = diff;
            closestWindow = option;
          }
        }

        if (closestWindow !== selectedTimeWindow) {
          timeWindowChangedByBrushRef.current = true;
          setSelectedTimeWindow(closestWindow);
          setTimeout(() => {
            timeWindowChangedByBrushRef.current = false;
          }, 50);
        }
      }
    }
  };

  const handleJumpToNow = () => {
    if (!chartData || chartData.length === 0) return;

    if (calculateInitialZoomDomain) {
      setZoomDomain(calculateInitialZoomDomain);
    } else {
      setZoomDomain(null);
    }
  };

  return {
    zoomDomain,
    animatedZoomDomain,
    activeDomain,
    zoomPercentage,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleBrushChange,
    handleJumpToNow,
  };
}
