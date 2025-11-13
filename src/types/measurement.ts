// Types for 0-100 km/h measurement system

export type MeasurementState = 
  | 'IDLE' 
  | 'ARMED' 
  | 'WAIT_ZERO' 
  | 'RUNNING' 
  | 'DONE';

export interface LocationSample {
  timestamp: number; // Unix timestamp in ms
  speed: number; // m/s, raw from GPS
  speedFiltered: number; // m/s, after filtering
  horizontalAccuracy: number; // meters
  speedAccuracy?: number; // m/s (iOS 13.4+ / Android API 26+)
  latitude: number;
  longitude: number;
  isValid: boolean; // meets quality thresholds
}

export interface SpeedPoint {
  time: number; // seconds since start
  speed: number; // km/h
}

export interface MeasurementResult {
  timeSeconds: number; // Final time to reach target
  distanceMeters: number; // Estimated distance traveled
  finalSpeed: number; // m/s at completion
  avgHorizontalAccuracy: number;
  avgSpeedAccuracy: number;
  sampleCount: number;
  startTime: number;
  endTime: number;
  speedPoints: SpeedPoint[]; // Speed curve data
}

export interface MeasurementConfig {
  targetSpeedMps: number; // 27.78 m/s for 100 km/h
  zeroThreshold: number; // 0.5 m/s
  zeroHoldTime: number; // 1000 ms
  hysteresis: number; // 0.3 m/s
  maxSampleGapMs: number; // 500 ms
  horizontalAccuracyThreshold: number; // 10 m
  speedAccuracyThreshold: number; // 1.0 m/s
  medianWindowSize: number; // 5
  emaAlpha: number; // 0.5
}

export const DEFAULT_CONFIG: MeasurementConfig = {
  targetSpeedMps: 27.78, // 100 km/h
  zeroThreshold: 0.56, // ~2 km/h - veículo deve estar praticamente parado
  zeroHoldTime: 1000, // 1 segundo - tempo para confirmar veículo parado
  hysteresis: 0.3,
  maxSampleGapMs: 500,
  horizontalAccuracyThreshold: 15, // Relaxed from 10 for initial samples
  speedAccuracyThreshold: 2.0, // Relaxed from 1.0 for initial samples
  medianWindowSize: 5,
  emaAlpha: 0.5,
};
