/**
 * Linear interpolation for precise target crossing time
 */
export function interpolateTargetCrossing(
  t1: number,
  v1: number,
  t2: number,
  v2: number,
  target: number
): number {
  // Linear interpolation: t_hit = t1 + (target - v1) * (t2 - t1) / (v2 - v1)
  if (v2 === v1) return t2; // Avoid division by zero
  return t1 + ((target - v1) * (t2 - t1)) / (v2 - v1);
}

/**
 * Convert m/s to km/h
 */
export function mpsToKmh(mps: number): number {
  return mps * 3.6;
}

/**
 * Convert km/h to m/s
 */
export function kmhToMps(kmh: number): number {
  return kmh / 3.6;
}
