/**
 * Signal processing filters for GPS speed data
 */

/**
 * Calculate median of an array
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Exponential Moving Average (EMA)
 * @param current Current value
 * @param previous Previous EMA value
 * @param alpha Smoothing factor (0-1), higher = more responsive
 */
export function ema(current: number, previous: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}

/**
 * Maintains a sliding window for median filtering
 */
export class MedianFilter {
  private window: number[] = [];
  private windowSize: number;

  constructor(windowSize: number) {
    this.windowSize = windowSize;
  }

  add(value: number): number {
    this.window.push(value);
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }
    return median(this.window);
  }

  reset(): void {
    this.window = [];
  }
}

/**
 * Combined Median + EMA filter
 */
export class SpeedFilter {
  private medianFilter: MedianFilter;
  private emaValue: number | null = null;
  private alpha: number;

  constructor(windowSize: number, emaAlpha: number) {
    this.medianFilter = new MedianFilter(windowSize);
    this.alpha = emaAlpha;
  }

  filter(rawSpeed: number): number {
    // Step 1: Median filter
    const medianFiltered = this.medianFilter.add(rawSpeed);

    // Step 2: EMA
    if (this.emaValue === null) {
      this.emaValue = medianFiltered;
    } else {
      this.emaValue = ema(medianFiltered, this.emaValue, this.alpha);
    }

    return this.emaValue;
  }

  reset(): void {
    this.medianFilter.reset();
    this.emaValue = null;
  }
}
