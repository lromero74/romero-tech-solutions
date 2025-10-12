import { useEffect, useMemo } from 'react';
import type { OscillatorHeights, ActiveIndicators } from '../types';

interface UseChartResizeProps {
  isDragging: string | null;
  setIsDragging: (dragging: string | null) => void;
  chartContainerRef: React.RefObject<HTMLDivElement>;
  dragOffsetRef: React.MutableRefObject<number>;
  oscillatorHeights: OscillatorHeights;
  setOscillatorHeights: (heights: OscillatorHeights) => void;
  setChartHeight: (height: number) => void;
  activeIndicators: ActiveIndicators;
}

export const useChartResize = ({
  isDragging,
  setIsDragging,
  chartContainerRef,
  dragOffsetRef,
  oscillatorHeights,
  setOscillatorHeights,
  setChartHeight,
  activeIndicators,
}: UseChartResizeProps) => {
  // Build array of active oscillators in order (same as ChartContainer)
  const activeOscillators = useMemo(() => {
    return [
      { key: 'rsi', active: activeIndicators.rsi === true, height: oscillatorHeights.rsi },
      { key: 'macd', active: activeIndicators.macd === true, height: oscillatorHeights.macd },
      { key: 'stochastic', active: activeIndicators.stochastic === true, height: oscillatorHeights.stochastic },
      { key: 'williamsR', active: activeIndicators.williamsR === true, height: oscillatorHeights.williamsR },
      { key: 'roc', active: activeIndicators.roc === true, height: oscillatorHeights.roc },
      { key: 'atr', active: activeIndicators.atr === true, height: oscillatorHeights.atr },
    ].filter(osc => osc.active);
  }, [activeIndicators, oscillatorHeights]);

  useEffect(() => {
    if (!isDragging || !chartContainerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = chartContainerRef.current;
      if (!container) return;

      if (isDragging === 'card-height') {
        // Resizing the entire card height
        const rect = container.getBoundingClientRect();
        const adjustedMouseY = e.clientY - rect.top - dragOffsetRef.current;
        const newHeight = Math.max(200, Math.min(1000, adjustedMouseY));
        setChartHeight(newHeight);
        return;
      }

      const rect = container.getBoundingClientRect();
      const adjustedMouseY = e.clientY - rect.top - dragOffsetRef.current;
      const percentY = (adjustedMouseY / rect.height) * 100;

      // Parse handle name to determine which panels are being resized
      if (isDragging.startsWith('main-')) {
        // Resizing between main chart and first oscillator
        const newMainHeight = Math.max(30, Math.min(70, percentY));
        const totalOscillatorHeight = 100 - newMainHeight;

        // Distribute the change proportionally among all oscillators
        const currentTotalOscHeight = activeOscillators.reduce((sum, osc) => sum + osc.height, 0);
        const newHeights: Partial<OscillatorHeights> = { main: newMainHeight };

        activeOscillators.forEach((osc) => {
          const proportion = osc.height / currentTotalOscHeight;
          const newHeight = Math.max(10, totalOscillatorHeight * proportion);
          newHeights[osc.key as keyof OscillatorHeights] = newHeight;
        });

        setOscillatorHeights({
          ...oscillatorHeights,
          ...newHeights,
        });
      } else {
        // Resizing between two oscillators
        const [topIndex, bottomIndex] = isDragging.split('-').map(Number);

        if (topIndex >= 0 && bottomIndex < activeOscillators.length) {
          // Calculate cumulative top of the top panel
          let cumulativeTop = oscillatorHeights.main;
          for (let i = 0; i < topIndex; i++) {
            cumulativeTop += activeOscillators[i].height;
          }

          // Calculate available space for these two panels
          const topOsc = activeOscillators[topIndex];
          const bottomOsc = activeOscillators[bottomIndex];
          const totalAvailable = topOsc.height + bottomOsc.height;

          // Calculate new heights based on mouse position
          const relativeY = percentY - cumulativeTop;
          const newTopHeight = Math.max(10, Math.min(totalAvailable - 10, relativeY));
          const newBottomHeight = Math.max(10, totalAvailable - newTopHeight);

          const newHeights: Partial<OscillatorHeights> = {
            [topOsc.key]: newTopHeight,
            [bottomOsc.key]: newBottomHeight,
          };

          setOscillatorHeights({
            ...oscillatorHeights,
            ...newHeights,
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, oscillatorHeights, activeIndicators, chartContainerRef, dragOffsetRef, setIsDragging, setOscillatorHeights, setChartHeight, activeOscillators]);

  const handleResizeMouseDown = (panelName: string) => (e: React.MouseEvent) => {
    e.preventDefault();

    const container = chartContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;

    // Calculate the handle's current position (in pixels)
    let handleY = 0;

    if (panelName === 'card-height') {
      handleY = rect.height; // Bottom of container
    } else if (panelName.startsWith('main-')) {
      // Handle between main chart and first oscillator
      handleY = (oscillatorHeights.main / 100) * rect.height;
    } else {
      // Handle between two oscillators
      const [topIndex] = panelName.split('-').map(Number);

      let cumulativeTop = oscillatorHeights.main;
      for (let i = 0; i <= topIndex; i++) {
        cumulativeTop += activeOscillators[i].height;
      }

      handleY = (cumulativeTop / 100) * rect.height;
    }

    // Store the offset between mouse position and handle position
    dragOffsetRef.current = mouseY - handleY;

    setIsDragging(panelName);
  };

  return {
    handleResizeMouseDown,
  };
};
