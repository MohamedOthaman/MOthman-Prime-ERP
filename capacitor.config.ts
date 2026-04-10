import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.foodchoice.erp',
  appName: 'Food Choice ERP',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
