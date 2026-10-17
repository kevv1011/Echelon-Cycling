import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { browserHeaders } from './security-headers.js';
import { validatedApiBase } from './src/utils/apiConfig.js';
export default defineConfig(({mode,command})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  const api=validatedApiBase(env.VITE_API_URL);
  const productionHeaders=browserHeaders(api);
  return {plugins:[react(),{name:'production-csp',transformIndexHtml(){if(command!=='build')return [];return [{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:productionHeaders['Content-Security-Policy'].replace("; frame-ancestors 'none'",'')},injectTo:'head-prepend'}];}}],server:{host:'127.0.0.1',port:5173,strictPort:true,headers:browserHeaders(api,true),proxy:{'/api':{target:'http://127.0.0.1:8000',changeOrigin:false}}},preview:{host:'127.0.0.1',port:4173,strictPort:true,headers:productionHeaders,proxy:{'/api':{target:'http://127.0.0.1:8000',changeOrigin:false}}}};
});
