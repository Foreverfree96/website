// main.js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import './assets/styles.css'; // Import your CSS here

createApp(App).use(router).mount('#app');
