import { useEffect } from 'react';
import type { ActiveIndicators, OscillatorHeights } from '../types';

interface UseOscillatorHeightsProps {
  activeIndicators: ActiveIndicators;
  setOscillatorHeights: (heights: OscillatorHeights) => void;
}

export const useOscillatorHeights = ({
  activeIndicators,
  setOscillatorHeights,
}: UseOscillatorHeightsProps) => {
  useEffect(() => {
    const hasRSI = activeIndicators.rsi === true;
    const hasMACD = activeIndicators.macd === true;
    const hasStochastic = activeIndicators.stochastic === true;
    const hasWilliamsR = activeIndicators.williamsR === true;
    const hasROC = activeIndicators.roc === true;
    const hasATR = activeIndicators.atr === true;

    const oscillatorCount =
      (hasRSI ? 1 : 0) +
      (hasMACD ? 1 : 0) +
      (hasStochastic ? 1 : 0) +
      (hasWilliamsR ? 1 : 0) +
      (hasROC ? 1 : 0) +
      (hasATR ? 1 : 0);

    // Calculate dynamic heights based on number of oscillators
    // Total available space is ~92% (leaving 8% for slider at bottom)
    let mainHeight = 92; // Default when no oscillators
    let oscillatorHeight = 0;

    if (oscillatorCount > 0) {
      // Reserve 8% for the slider by using 92% total
      const availableSpace = 92;

      if (oscillatorCount === 1) {
        mainHeight = 65;
        oscillatorHeight = 27; // 65 + 27 = 92
      } else if (oscillatorCount === 2) {
        mainHeight = 55;
        oscillatorHeight = 18.5; // 55 + 18.5 + 18.5 = 92
      } else if (oscillatorCount === 3) {
        mainHeight = 50;
        oscillatorHeight = 14; // 50 + 14*3 = 92
      } else if (oscillatorCount === 4) {
        mainHeight = 46;
        oscillatorHeight = 11.5; // 46 + 11.5*4 = 92
      } else if (oscillatorCount === 5) {
        mainHeight = 42;
        oscillatorHeight = 10; // 42 + 10*5 = 92
      } else if (oscillatorCount === 6) {
        mainHeight = 38;
        oscillatorHeight = 9; // 38 + 9*6 = 92
      }
    }

    setOscillatorHeights({
      main: mainHeight,
      rsi: hasRSI ? oscillatorHeight : 0,
      macd: hasMACD ? oscillatorHeight : 0,
      stochastic: hasStochastic ? oscillatorHeight : 0,
      williamsR: hasWilliamsR ? oscillatorHeight : 0,
      roc: hasROC ? oscillatorHeight : 0,
      atr: hasATR ? oscillatorHeight : 0,
    });
  }, [
    activeIndicators.rsi,
    activeIndicators.macd,
    activeIndicators.stochastic,
    activeIndicators.williamsR,
    activeIndicators.roc,
    activeIndicators.atr,
    setOscillatorHeights,
  ]);
};
