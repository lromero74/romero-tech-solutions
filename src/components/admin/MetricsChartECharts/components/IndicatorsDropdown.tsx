import React from 'react';
import { createPortal } from 'react-dom';
import { themeClasses } from '../../../../contexts/ThemeContext';
import type { ActiveIndicators, DropdownPosition } from '../types';

interface IndicatorsDropdownProps {
  show: boolean;
  dropdownPosition: DropdownPosition | null;
  dropdownRef: React.RefObject<HTMLDivElement>;
  activeIndicators: ActiveIndicators;
  onToggleIndicator: (key: keyof ActiveIndicators) => void;
}

const MOVING_AVERAGES = [
  { key: 'sma7' as const, label: 'SMA (7)', color: '#f59e0b' },
  { key: 'sma20' as const, label: 'SMA (20)', color: '#64748b' },
  { key: 'sma25' as const, label: 'SMA (25)', color: '#10b981' },
  { key: 'sma99' as const, label: 'SMA (99)', color: '#8b5cf6' },
  { key: 'ema12' as const, label: 'EMA (12)', color: '#06b6d4' },
  { key: 'ema26' as const, label: 'EMA (26)', color: '#ec4899' },
];

const OSCILLATORS = [
  { key: 'bb' as const, label: 'Bollinger Bands' },
  { key: 'rsi' as const, label: 'RSI (14)' },
  { key: 'macd' as const, label: 'MACD (12, 26, 9)' },
  { key: 'stochastic' as const, label: 'Stochastic (14, 3, 3)' },
  { key: 'williamsR' as const, label: 'Williams %R (14)' },
  { key: 'roc' as const, label: 'ROC (12)' },
  { key: 'atr' as const, label: 'ATR (14)' },
];

export const IndicatorsDropdown: React.FC<IndicatorsDropdownProps> = ({
  show,
  dropdownPosition,
  dropdownRef,
  activeIndicators,
  onToggleIndicator,
}) => {
  if (!show || !dropdownPosition) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={`fixed z-[60] ${themeClasses.bg.card} ${themeClasses.shadow.lg} rounded-lg border ${themeClasses.border.primary} py-2 min-w-[200px]`}
      style={{
        top: `${dropdownPosition.top}px`,
        right: `${dropdownPosition.right}px`,
      }}
    >
      <div className={`px-3 py-1 text-xs font-semibold ${themeClasses.text.secondary} uppercase`}>
        Moving Averages
      </div>
      {MOVING_AVERAGES.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={(e) => {
            e.stopPropagation();
            onToggleIndicator(key);
          }}
          className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }}></div>
            {label}
          </div>
          {activeIndicators[key] && (
            <span className="text-blue-500">✓</span>
          )}
        </button>
      ))}

      <div className={`mx-2 my-1 border-t ${themeClasses.border.primary}`}></div>

      <div className={`px-3 py-1 text-xs font-semibold ${themeClasses.text.secondary} uppercase`}>
        Oscillators
      </div>
      {OSCILLATORS.map(({ key, label }) => (
        <button
          key={key}
          onClick={(e) => {
            e.stopPropagation();
            onToggleIndicator(key);
          }}
          className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
        >
          <span>{label}</span>
          {activeIndicators[key] && (
            <span className="text-blue-500">✓</span>
          )}
        </button>
      ))}
    </div>,
    document.body
  );
};
