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

/**
 * Kalman Filter for GPS speed tracking
 * Models vehicle dynamics: position, velocity, acceleration
 */
export class KalmanFilter {
  // State vector: [position, velocity, acceleration]
  private x: number[] = [0, 0, 0]; // m, m/s, m/s²
  
  // State covariance matrix (3x3) - flattened
  private P: number[] = [
    1000, 0, 0,    // Initial uncertainty in position
    0, 100, 0,     // Initial uncertainty in velocity
    0, 0, 10       // Initial uncertainty in acceleration
  ];
  
  // Process noise covariance
  private Q: number;
  
  // Last update timestamp
  private lastTime: number | null = null;

  constructor(processNoise: number = 0.5) {
    this.Q = processNoise;
  }

  /**
   * Predict step - propagate state forward in time
   */
  private predict(dt: number): void {
    // State transition: x_k = F * x_{k-1}
    // F = [1, dt, 0.5*dt²]
    //     [0,  1,      dt ]
    //     [0,  0,       1 ]
    
    const pos = this.x[0];
    const vel = this.x[1];
    const acc = this.x[2];
    
    // Update state
    this.x[0] = pos + vel * dt + 0.5 * acc * dt * dt;
    this.x[1] = vel + acc * dt;
    this.x[2] = acc; // Assume constant acceleration model
    
    // Update covariance: P = F * P * F^T + Q
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt2 * dt2;
    
    // Process noise matrix Q based on continuous white noise acceleration model
    const q11 = (dt4 / 4) * this.Q;
    const q12 = (dt3 / 2) * this.Q;
    const q13 = (dt2 / 2) * this.Q;
    const q22 = dt2 * this.Q;
    const q23 = dt * this.Q;
    const q33 = this.Q;
    
    // Simplified P update (assuming diagonal dominance for efficiency)
    this.P[0] += this.P[1] * dt + q11; // P[0][0]
    this.P[1] += this.P[2] * dt + q12; // P[0][1]
    this.P[4] += q22;                   // P[1][1]
    this.P[8] += q33;                   // P[2][2]
  }

  /**
   * Update step - incorporate new measurement
   */
  private update(measurement: number, measurementNoise: number): void {
    // Measurement matrix H = [0, 1, 0] (we measure velocity)
    // Innovation: y = z - H * x
    const innovation = measurement - this.x[1];
    
    // Innovation covariance: S = H * P * H^T + R
    const S = this.P[4] + measurementNoise; // P[1][1] + R
    
    // Kalman gain: K = P * H^T * S^-1
    const K = [
      this.P[1] / S,  // K[0]
      this.P[4] / S,  // K[1]
      this.P[7] / S   // K[2]
    ];
    
    // Update state: x = x + K * y
    this.x[0] += K[0] * innovation;
    this.x[1] += K[1] * innovation;
    this.x[2] += K[2] * innovation;
    
    // Update covariance: P = (I - K * H) * P
    const kh1 = K[1];
    this.P[0] -= K[0] * this.P[1];
    this.P[1] -= kh1 * this.P[1];
    this.P[2] -= K[2] * this.P[1];
    this.P[4] -= kh1 * this.P[4];
    this.P[8] -= K[2] * this.P[7];
  }

  /**
   * Process new GPS speed measurement
   * @param rawSpeed Speed in m/s from GPS
   * @param timestamp Current timestamp in ms
   * @param speedAccuracy GPS speed accuracy in m/s (if available)
   * @returns Filtered speed in m/s
   */
  filter(rawSpeed: number, timestamp: number, speedAccuracy?: number): number {
    // Ensure non-negative speed
    rawSpeed = Math.max(0, rawSpeed);
    
    // Calculate time delta
    const dt = this.lastTime !== null ? (timestamp - this.lastTime) / 1000 : 0.1;
    this.lastTime = timestamp;
    
    // Predict state forward
    if (dt > 0 && dt < 1) { // Sanity check on dt
      this.predict(dt);
    }
    
    // Measurement noise (variance)
    // Use GPS accuracy if available, otherwise use default
    const R = speedAccuracy !== undefined 
      ? Math.max(0.1, speedAccuracy * speedAccuracy)
      : 1.0;
    
    // Update with measurement
    this.update(rawSpeed, R);
    
    // Return filtered velocity (ensure non-negative)
    return Math.max(0, this.x[1]);
  }

  /**
   * Get current estimated acceleration in m/s²
   */
  getAcceleration(): number {
    return this.x[2];
  }

  /**
   * Reset filter state
   */
  reset(): void {
    this.x = [0, 0, 0];
    this.P = [
      1000, 0, 0,
      0, 100, 0,
      0, 0, 10
    ];
    this.lastTime = null;
  }
}
