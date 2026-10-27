// Dois pontos de entrada no mesmo projeto:
//   index.html  a aplicação (com login)
//   site.html   o site público de cada clube (<clube>.rumia.pt), sem login
// O site não importa nada da app: é uma página leve, para abrir no telemóvel
// de quem chegou por um link do Instagram.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        site: resolve(__dirname, 'site.html'),
      },
    },
  },
});
