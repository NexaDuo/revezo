import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// O site de produção é servido em https://nexaduo.com/revezo/, não na raiz.
// Com `base: './'` o BrowserRouter não tem como saber disso e os <Link>
// apontavam para a raiz do domínio — as telas "caíam para a raiz da URL".
const BASE_PROD = '/revezo/';

/** O GitHub Pages não conhece as rotas do SPA: abrir ou recarregar
 *  /revezo/regras devolve 404. Servir o próprio index.html como página de
 *  404 faz o Pages entregar o app, que então resolve a rota no cliente. */
function spaFallback() {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), spaFallback()],
  // dev e preview rodam na raiz; só o build de produção vai para /revezo/
  base: command === 'build' ? BASE_PROD : '/',
}));
