import { describe, expect, it } from 'vitest';
import { fillDailyForward } from '../volumeSeries';

describe('fillDailyForward', () => {
  it('returns [] for empty input', () => {
    expect(fillDailyForward([], '2026-05-10')).toEqual([]);
  });

  it('returns single point unchanged when start === end', () => {
    const out = fillDailyForward(
      [{ time: '2026-05-10', value: 100 }],
      '2026-05-10',
    );
    expect(out).toEqual([{ time: '2026-05-10', value: 100 }]);
  });

  it('extends a single past point forward to endDate with the same value', () => {
    const out = fillDailyForward(
      [{ time: '2026-05-08', value: 50 }],
      '2026-05-10',
    );
    expect(out).toEqual([
      { time: '2026-05-08', value: 50 },
      { time: '2026-05-09', value: 50 },
      { time: '2026-05-10', value: 50 },
    ]);
  });

  it('fills the gap between two sparse points with carry-forward', () => {
    const out = fillDailyForward(
      [
        { time: '2026-05-01', value: 100 },
        { time: '2026-05-04', value: 250 },
      ],
      '2026-05-04',
    );
    expect(out).toEqual([
      { time: '2026-05-01', value: 100 },
      { time: '2026-05-02', value: 100 },
      { time: '2026-05-03', value: 100 },
      { time: '2026-05-04', value: 250 },
    ]);
  });

  it('handles the user-reported "August 2025 to today" gap (cumulative monotonic)', () => {
    const out = fillDailyForward(
      [
        { time: '2025-08-01', value: 100 },
        { time: '2026-05-10', value: 250 },
      ],
      '2026-05-10',
    );
    // 2025-08-01 through 2026-05-10 inclusive = 283 days.
    expect(out.length).toBe(283);
    expect(out[0]).toEqual({ time: '2025-08-01', value: 100 });
    expect(out[out.length - 1]).toEqual({ time: '2026-05-10', value: 250 });
    // Every intermediate day should hold the prior value (100) until the
    // jump on 2026-05-10.
    expect(out.slice(1, -1).every((p) => p.value === 100)).toBe(true);
  });

  it('extends past lastPointDate when endDate is later', () => {
    const out = fillDailyForward(
      [
        { time: '2026-05-01', value: 100 },
        { time: '2026-05-03', value: 200 },
      ],
      '2026-05-05',
    );
    expect(out.length).toBe(5);
    expect(out[3]).toEqual({ time: '2026-05-04', value: 200 });
    expect(out[4]).toEqual({ time: '2026-05-05', value: 200 });
  });

  it('extends to lastPointDate (does not truncate) when endDate is earlier', () => {
    const out = fillDailyForward(
      [
        { time: '2026-05-01', value: 100 },
        { time: '2026-05-05', value: 300 },
      ],
      '2026-05-03', // earlier than lastPointDate
    );
    expect(out.length).toBe(5);
    expect(out[out.length - 1]).toEqual({ time: '2026-05-05', value: 300 });
  });

  it('crosses a UTC year boundary correctly (no DST drift)', () => {
    const out = fillDailyForward(
      [
        { time: '2025-12-30', value: 100 },
        { time: '2026-01-02', value: 150 },
      ],
      '2026-01-02',
    );
    expect(out.map((p) => p.time)).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('crosses a leap day correctly', () => {
    const out = fillDailyForward(
      [
        { time: '2024-02-28', value: 100 },
        { time: '2024-03-01', value: 200 },
      ],
      '2024-03-01',
    );
    expect(out.map((p) => p.time)).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });
});
