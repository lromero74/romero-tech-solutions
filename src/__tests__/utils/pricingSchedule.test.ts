import { generateScheduleFromSummary } from '../../utils/pricingSchedule';

const plainT = (key: string) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const m = key.match(/^common\.days\.(sun|mon|tue|wed|thu|fri|sat)$/);
  if (m) {
    return days[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[1])];
  }
  if (key === 'pricing.tiers.pacificTime') return 'PT';
  return key;
};

const slot = (overrides = {}) => ({
  tierName: 'Standard',
  tierLevel: 1,
  dayOfWeek: 1,
  timeStart: '08:00',
  timeEnd: '17:00',
  multiplier: 1,
  ...overrides
});

describe('generateScheduleFromSummary', () => {
  it('formats weekday ranges and times', () => {
    const out = generateScheduleFromSummary([slot()], 'Standard', plainT);
    expect(out).toBe('Mon: 8am-5pm PT');
  });

  it('returns empty string when the tier has no slots', () => {
    expect(generateScheduleFromSummary([slot()], 'Premium', plainT)).toBe('');
  });

  it('neutralizes markup injected through translated day names', () => {
    const evilT = (key: string) =>
      key === 'common.days.mon' ? '<img src=x onerror=alert(1)>' : plainT(key);
    const out = generateScheduleFromSummary([slot()], 'Standard', evilT);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('neutralizes markup injected through the time-suffix translation', () => {
    const evilT = (key: string) =>
      key === 'pricing.tiers.pacificTime' ? '<script>alert(1)</script>' : plainT(key);
    const out = generateScheduleFromSummary([slot()], 'Standard', evilT);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});
