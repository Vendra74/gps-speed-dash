import { LocationSample } from "@/types/measurement";

/**
 * CSV Logger for measurement data
 */
export class CsvLogger {
  private lines: string[] = [];
  private startTime: number = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.lines = [];
    this.startTime = 0;
    this.addHeader();
  }

  private addHeader(): void {
    this.lines.push(
      "timestamp_iso,t_elapsed_ms,v_raw_mps,v_filt_mps,hAcc_m,sAcc_mps,lat,lon,state,is_valid"
    );
  }

  start(timestamp: number): void {
    this.startTime = timestamp;
  }

  addSample(sample: LocationSample, state: string): void {
    const elapsed = this.startTime > 0 ? sample.timestamp - this.startTime : 0;
    const iso = new Date(sample.timestamp).toISOString();
    const sAcc = sample.speedAccuracy !== undefined ? sample.speedAccuracy.toFixed(2) : "N/A";
    
    this.lines.push(
      [
        iso,
        elapsed.toFixed(0),
        sample.speed.toFixed(3),
        sample.speedFiltered.toFixed(3),
        sample.horizontalAccuracy.toFixed(2),
        sAcc,
        sample.latitude.toFixed(6),
        sample.longitude.toFixed(6),
        state,
        sample.isValid ? "1" : "0",
      ].join(",")
    );
  }

  getCsv(): string {
    return this.lines.join("\n");
  }

  getBlob(): Blob {
    return new Blob([this.getCsv()], { type: "text/csv;charset=utf-8;" });
  }

  async exportCsv(filename: string = "0-100_measurement.csv"): Promise<void> {
    const blob = this.getBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
