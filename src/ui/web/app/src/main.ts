import 'animate.css';

import { createApp } from 'vue';

import App from './App.vue';
import { initializeUiLocale } from './lib/i18n';
import { router } from './router';
import './styles.css';

initializeUiLocale();

const app = createApp(App);
app.use(router);
app.mount('#app');
