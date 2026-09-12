import { defineConfig } from 'vitest/config';

// Os testes cobrem a camada de CÁLCULO (`compute.js`, `permissions.js`,
// `ui.js`), que é onde um erro não dá exceção nenhuma: dá um número errado,
// num painel, que ninguém consegue verificar a olho. As vistas escrevem HTML e
// ligam eventos — isso vê-se no ecrã; uma taxa de comparência de 61% quando
// devia ser 74% não se vê em lado nenhum.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
