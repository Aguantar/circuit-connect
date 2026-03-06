import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'circuit-connect',
  brand: {
    displayName: '불을 켜줘', // 화면에 노출될 앱의 한글 이름으로 바꿔주세요.
    primaryColor: '#F59E0B', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    icon: '',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
  webViewProps: {
    type: 'game',
  },
});
