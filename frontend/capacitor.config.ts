import type { CapacitorConfig } from '@capacitor/cli';
const local = process.env.CIVICFLOW_ANDROID_LOCAL === 'true';
const config: CapacitorConfig = {
  appId: 'com.civicflow.ai',
  appName: 'CivicFlow AI',
  webDir: 'dist',
  server: { androidScheme: local ? 'http' : 'https', cleartext: local },
  android: { allowMixedContent: local },
};
export default config;
