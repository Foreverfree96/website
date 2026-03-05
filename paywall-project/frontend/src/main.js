// main.js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/styles.scss';

import * as Sentry from '@sentry/vue';

// Create Vue app
const app = createApp(App);

// Initialize Sentry with Vue‑bundle tracing integration
Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN,  // your DSN from .env
  integrations: [
    // Use the built‑in browser tracing integration for Vue
    Sentry.browserTracingIntegration({ router }),
  ],
  tracesSampleRate: 1.0, // adjust as needed
});

app.use(router);
app.mount('#app');
