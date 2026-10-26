import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'br.com.vendra.zeroa100',
  appName: '0-100 Cronômetro GPS',
  webDir: 'dist',
  plugins: {
    Geolocation: {
      // Request high accuracy for best results
    }
  }
};

export default config;
