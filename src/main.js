import Vue from 'vue';
import App from './App.vue';
import 'normalize.css';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
// 主题层放在 Element 之后，否则覆盖不生效
import './styles/theme.css';

Vue.config.productionTip = false;
Vue.use(ElementUI);

new Vue({
  render: (h) => h(App),
}).$mount('#app');
