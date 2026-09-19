import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
const base=process.env.PDFNOTE_BASE_PATH||'/';
if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))throw new Error('Invalid PDFNOTE_BASE_PATH');
// Production only: Vite development uses separate script/HMR policies.
const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self' https://accounts.google.com/gsi/ https://www.googleapis.com; frame-src https://accounts.google.com/gsi/; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
export default defineConfig({base,plugins:[{name:'production-csp',apply:'build',transformIndexHtml(){return [{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:csp},injectTo:'head-prepend'},{tag:'meta',attrs:{name:'referrer',content:'strict-origin-when-cross-origin'},injectTo:'head-prepend'}];}},react(),viteStaticCopy({targets:[
  {src:'node_modules/pdfjs-dist/cmaps',dest:'pdfjs',rename:{stripBase:2}},
  {src:'node_modules/pdfjs-dist/standard_fonts',dest:'pdfjs',rename:{stripBase:2}},
  {src:'node_modules/pdfjs-dist/wasm',dest:'pdfjs',rename:{stripBase:2}}
]}),VitePWA({registerType:'prompt', includeAssets:['icon.svg','icon-192.png','icon-512.png'],
  manifest:{name:'頁間 PDFnote',short_name:'頁間',description:'離線 PDF 閱讀與筆記',lang:'zh-Hant',theme_color:'#173f39',background_color:'#f5f4ef',display:'standalone',id:base,scope:base,start_url:base,icons:[{src:base+'icon-192.png',sizes:'192x192',type:'image/png'},{src:base+'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},
  workbox:{globPatterns:['**/*.{js,mjs,css,html,svg,png,bcmap,pfb,ttf,wasm}'],maximumFileSizeToCacheInBytes:12000000,cleanupOutdatedCaches:true,navigateFallback:'index.html'}
})],build:{target:'es2022'},server:{port:5173}});
