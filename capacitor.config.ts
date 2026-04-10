import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.b2a4688a8a3840faa0a93c29506c6b49',
  appName: 'Reservas-Pleno',
  webDir: 'dist',
  server: {
    url: 'https://b2a4688a-8a38-40fa-a0a9-3c29506c6b49.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#252c58',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;