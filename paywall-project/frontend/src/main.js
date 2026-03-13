// =============================================================================
// main.js
// Application entry point.
//
// Responsibilities:
//   - Creates the root Vue application instance from App.vue
//   - Registers the Vue Router plugin so <router-view> and navigation work
//     throughout the entire component tree
//   - Imports the global SCSS stylesheet so base/shared styles are available
//     before any component renders
//   - Mounts the app into the #app div defined in index.html
// =============================================================================

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/styles.scss';

// Create the root Vue 3 application instance
const app = createApp(App);

// Register the router — makes $router/$route available and activates
// <RouterView> / <RouterLink> globally
app.use(router);

// Mount into the <div id="app"> element in index.html
app.mount('#app');
