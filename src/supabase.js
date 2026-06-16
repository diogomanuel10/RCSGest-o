// Cliente Supabase + verificação das variáveis de ambiente.
//
// As credenciais vêm do ficheiro `.env` (ver `.env.example`) e são lidas
// através de `import.meta.env`. Se faltarem, NÃO criamos o cliente — em vez
// disso a aplicação mostra um ecrã a explicar o que fazer (ver main.js).

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// `true` apenas quando ambas as variáveis estão preenchidas.
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
