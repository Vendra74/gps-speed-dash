import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'app.lovable.152168c52b79425cb1dee5871aaa0424',
  appName: '0-100 Cronômetro GPS',
  webDir: 'dist',
  server: {
    url: 'https://152168c5-2b79-425c-b1de-e5871aaa0424.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Geolocation: {
      // Request high accuracy for best results
    }
  }
};

export default config;
