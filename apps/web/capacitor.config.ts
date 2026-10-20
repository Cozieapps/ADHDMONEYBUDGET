import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.sori.bloom',
  appName: 'Sori Bloom',
  webDir: 'dist',
  android: { path: '../android' },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_sori',
      iconColor: '#275649',
    },
  },
};

export default config;
