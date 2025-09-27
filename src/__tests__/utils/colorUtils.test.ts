import { hexToRgb, rgbToHex, muteColor, applyDarkModeMuting } from '../../utils/colorUtils';

describe('colorUtils', () => {
  describe('hexToRgb', () => {
    it('should convert 6-digit hex colors to RGB', () => {
      const result = hexToRgb('#FF0000');
      expect(result).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should convert 3-digit hex colors to RGB', () => {
      const result = hexToRgb('#F00');
      expect(result).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should handle hex colors without hash', () => {
      const result = hexToRgb('FF0000');
      expect(result).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should return null for invalid hex colors', () => {
      const result = hexToRgb('invalid');
      expect(result).toBeNull();
    });

    it('should handle mixed case hex colors', () => {
      const result = hexToRgb('#aB12Cd');
      expect(result).toEqual({ r: 171, g: 18, b: 205 });
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      const result = rgbToHex(255, 0, 0);
      expect(result).toBe('#ff0000');
    });

    it('should handle values outside 0-255 range', () => {
      const result = rgbToHex(-10, 300, 128);
      expect(result).toBe('#00ff80');
    });

    it('should pad single digit hex values', () => {
      const result = rgbToHex(1, 2, 3);
      expect(result).toBe('#010203');
    });
  });

  describe('muteColor', () => {
    it('should mute a color by default factor', () => {
      const result = muteColor('#FF0000');
      const rgb = hexToRgb(result);
      expect(rgb).toEqual({ r: 191, g: 0, b: 0 }); // 255 * 0.75 = 191.25 → 191
    });

    it('should mute a color by custom factor', () => {
      const result = muteColor('#FF0000', 0.5);
      const rgb = hexToRgb(result);
      expect(rgb).toEqual({ r: 128, g: 0, b: 0 }); // 255 * 0.5 = 127.5 → 128
    });

    it('should handle null and undefined colors', () => {
      expect(muteColor(null)).toBe('');
      expect(muteColor(undefined)).toBe('');
    });

    it('should return non-hex colors unchanged', () => {
      const result = muteColor('red');
      expect(result).toBe('red');
    });

    it('should handle invalid hex colors', () => {
      const result = muteColor('#invalid');
      expect(result).toBe('#invalid');
    });
  });

  describe('applyDarkModeMuting', () => {
    it('should return original color in light mode', () => {
      const result = applyDarkModeMuting('#FF0000', false);
      expect(result).toBe('#FF0000');
    });

    it('should mute color in dark mode', () => {
      const result = applyDarkModeMuting('#FF0000', true);
      expect(result).not.toBe('#FF0000');
      expect(result.length).toBe(7); // Should be a valid hex color
    });

    it('should handle null colors gracefully', () => {
      const result = applyDarkModeMuting(null, true);
      expect(result).toBe('');
    });

    it('should use custom mute amount', () => {
      const result1 = applyDarkModeMuting('#FF0000', true, 0.5);
      const result2 = applyDarkModeMuting('#FF0000', true, 0.8);
      expect(result1).not.toBe(result2);
    });
  });
});