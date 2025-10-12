import { useEffect, useMemo } from 'react';

interface UseChartEffectsProps {
  showIndicatorsMenu: boolean;
  setShowIndicatorsMenu: (show: boolean) => void;
  indicatorsButtonRef: React.RefObject<HTMLButtonElement>;
  dropdownRef: React.RefObject<HTMLDivElement>;
  selectedTimeWindow: number;
  setCurrentZoom: (zoom: { start: number; end: number } | null) => void;
  setIsInitialRender: (value: boolean) => void;
  zoomTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  chartData: any[];
  currentZoom: { start: number; end: number } | null;
  isInitialRender: boolean;
}

export const useChartEffects = ({
  showIndicatorsMenu,
  setShowIndicatorsMenu,
  indicatorsButtonRef,
  dropdownRef,
  selectedTimeWindow,
  setCurrentZoom,
  setIsInitialRender,
  zoomTimeoutRef,
  chartData,
  currentZoom,
  isInitialRender,
}: UseChartEffectsProps) => {
  // Click-outside detection and scroll handling for dropdown menu
  useEffect(() => {
    if (!showIndicatorsMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        indicatorsButtonRef.current &&
        !indicatorsButtonRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowIndicatorsMenu(false);
      }
    };

    const handleScroll = () => {
      setShowIndicatorsMenu(false);
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showIndicatorsMenu, indicatorsButtonRef, dropdownRef, setShowIndicatorsMenu]);

  // Handle time window change - reset zoom
  useEffect(() => {
    setCurrentZoom(null);
    setIsInitialRender(true);
  }, [selectedTimeWindow, setCurrentZoom, setIsInitialRender]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, [zoomTimeoutRef]);

  // Calculate initial zoom based on time window
  const initialZoomRange = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 100];

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - selectedTimeWindow * 60 * 60 * 1000);

    let startIndex = 0;
    for (let i = chartData.length - 1; i >= 0; i--) {
      const dataTime = new Date(chartData[i].timestamp);
      if (dataTime >= cutoffTime) {
        startIndex = i;
      } else {
        break;
      }
    }

    const startPercent = (startIndex / chartData.length) * 100;
    return [startPercent, 100];
  }, [chartData, selectedTimeWindow]);

  // Get the zoom range to use (current zoom if available, otherwise initial)
  const activeZoomRange = useMemo(() => {
    if (currentZoom && !isInitialRender) {
      return [currentZoom.start, currentZoom.end];
    }
    return initialZoomRange;
  }, [currentZoom, isInitialRender, initialZoomRange]);

  return {
    initialZoomRange,
    activeZoomRange,
  };
};
