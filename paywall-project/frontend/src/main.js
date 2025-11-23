// main.js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import './assets/styles.scss';
 // SCSS instead of CSS

createApp(App).use(router).mount('#app');
