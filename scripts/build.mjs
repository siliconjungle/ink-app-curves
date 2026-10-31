import{build}from'vite';
await build({configFile:false,publicDir:false,cacheDir:'.local/vite-cache',build:{ssr:'src/service.mjs',outDir:'web',emptyOutDir:false,target:'node22',rollupOptions:{output:{entryFileNames:'server.mjs'}}}});
