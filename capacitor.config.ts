import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dairysmartai.app',
  appName: 'Dairy Smart AI',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
