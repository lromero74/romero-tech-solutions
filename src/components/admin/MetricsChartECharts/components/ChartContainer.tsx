import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { OscillatorHeights, ActiveIndicators } from '../types';

interface ChartContainerProps {
  chartElement: React.ReactNode;
  chartContainerRef: React.RefObject<HTMLDivElement>;
  activeIndicators: ActiveIndicators;
  oscillatorHeights: OscillatorHeights;
  isDragging: string | null;
  handleResizeMouseDown: (panelName: string) => (e: React.MouseEvent) => void;
}

export const ChartContainer: React.FC<ChartContainerProps> = ({
  chartElement,
  chartContainerRef,
  activeIndicators,
  oscillatorHeights,
  isDragging,
  handleResizeMouseDown,
}) => {
  // Build array of active oscillators in order
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

  // Map oscillator keys to display names
  const oscillatorLabels: Record<string, string> = {
    rsi: 'RSI (14)',
    macd: 'MACD (12, 26, 9)',
    stochastic: 'Stochastic (14, 3, 3)',
    williamsR: 'Williams %R (14)',
    roc: 'ROC (12)',
    atr: 'ATR (14)',
  };

  return (
    <div className="relative" ref={chartContainerRef}>
      {chartElement}

      {/* Oscillator panel labels */}
      {activeOscillators.map((osc, index) => {
        // Calculate cumulative top position for this oscillator
        let cumulativeTop = oscillatorHeights.main;
        for (let i = 0; i < index; i++) {
          cumulativeTop += activeOscillators[i].height;
        }

        return (
          <div
            key={`label-${osc.key}`}
            className="absolute left-2 z-40 pointer-events-none"
            style={{
              top: `${cumulativeTop}%`,
              marginTop: '4px',
            }}
          >
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-900/80 px-2 py-0.5 rounded">
              {oscillatorLabels[osc.key]}
            </span>
          </div>
        );
      })}

      {/* Dynamic resize handles between oscillators */}
      {activeOscillators.length > 0 && (
        <>
          {/* Handle between main chart and first oscillator */}
          <div
            className={`absolute left-0 right-0 h-1 cursor-row-resize z-50 hover:bg-blue-500 hover:opacity-30 transition-opacity ${
              isDragging === 'main-0' ? 'bg-blue-500 opacity-50' : ''
            }`}
            style={{
              top: `${oscillatorHeights.main}%`,
              transform: 'translateY(-50%)',
            }}
            onMouseDown={handleResizeMouseDown('main-0')}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-gray-500 dark:bg-gray-500"></div>
          </div>

          {/* Handles between consecutive oscillators */}
          {activeOscillators.slice(0, -1).map((osc, index) => {
            // Calculate cumulative top position
            let cumulativeTop = oscillatorHeights.main;
            for (let i = 0; i <= index; i++) {
              cumulativeTop += activeOscillators[i].height;
            }

            const handleName = `${index}-${index + 1}`;

            return (
              <div
                key={handleName}
                className={`absolute left-0 right-0 h-1 cursor-row-resize z-50 hover:bg-blue-500 hover:opacity-30 transition-opacity ${
                  isDragging === handleName ? 'bg-blue-500 opacity-50' : ''
                }`}
                style={{
                  top: `${cumulativeTop}%`,
                  transform: 'translateY(-50%)',
                }}
                onMouseDown={handleResizeMouseDown(handleName)}
              >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-gray-500 dark:bg-gray-500"></div>
              </div>
            );
          })}
        </>
      )}

      {/* Card height resize handle */}
      <div
        className={`absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize z-50 hover:bg-blue-500 hover:opacity-30 transition-opacity ${
          isDragging === 'card-height' ? 'bg-blue-500 opacity-50' : ''
        }`}
        onMouseDown={handleResizeMouseDown('card-height')}
      >
        <div className="absolute inset-x-0 bottom-1 h-1 bg-gray-500 dark:bg-gray-500"></div>
      </div>
    </div>
  );
};
