// Cliente Supabase + verificação das variáveis de ambiente.
//
// As credenciais vêm do ficheiro `.env` (ver `.env.example`) e são lidas
// através de `import.meta.env`. Se faltarem, NÃO criamos o cliente — em vez
// disso a aplicação mostra um ecrã a explicar o que fazer (ver main.js).

import { createClient } from '@supabase/supabase-js';

// Normaliza os valores das variáveis de ambiente: remove espaços/quebras de
// linha à volta e aspas que às vezes ficam agarradas ao colar a chave no `.env`
// ou no painel do Vercel. Uma chave com uma quebra de linha no fim corrompe o
// cabeçalho `apikey` e o Supabase responde "No API key found in request".
function cleanEnv(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

const url = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const anonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

// `true` apenas quando ambas as variáveis estão preenchidas (após limpeza).
export const isConfigured = Boolean(url && anonKey);

// Só criamos o cliente se estiver configurado; caso contrário fica `null`
// e o arranque da app encarrega-se de mostrar o ecrã de ajuda.
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true, // manter a sessão entre recargas
        autoRefreshToken: true,
      },
    })
  : null;
