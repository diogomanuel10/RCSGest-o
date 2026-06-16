# Central RCS

Painel de gestão do **Real Clube Senhorense** (clube de voleibol fundado em
2002, com sede no Pavilhão Municipal da Senhora da Hora, Matosinhos).

Reúne num só sítio o que andava espalhado: **patrocínios, plantéis, calendário
e treinadores**, com login e dados guardados numa base de dados Supabase.

## O que faz

- **Painel** — total angariado vs meta da época, contactos em curso, nº de
  atletas e treinadores, barra de progresso e próximos eventos.
- **Patrocínios** — níveis Ouro (3000 €), Prata (1500 €) e Bronze (500 €);
  tabela de empresas com filtros e CRUD. Confirmar exige escolher um nível.
- **Plantéis** — equipas por género, com escalão, treinador e atletas.
- **Calendário** — eventos por ordem cronológica, com filtros e distinção
  entre passado e futuro.
- **Treinadores** — fichas com contacto, notas e equipas que orientam.
- **Definições** — época e meta editáveis; exportar/importar backup `.json`.

## Stack

- [Vite](https://vitejs.dev/) (template *vanilla* JavaScript — sem framework)
- [Supabase](https://supabase.com/) para autenticação e base de dados
- `@supabase/supabase-js`

---

## 1. Configurar o Supabase (uma vez)

> Estes passos só podem ser feitos por ti, no painel do Supabase.

1. Cria conta em [supabase.com](https://supabase.com) e cria um **projeto novo**
   (guarda a password da base de dados).
2. Em **Project Settings → API**, copia o **Project URL** e a chave
   **anon public**.
3. Em **SQL Editor → New query**, cola e corre todo o ficheiro
   [`supabase/schema.sql`](supabase/schema.sql). Cria as tabelas, as políticas
   de segurança (RLS) e os dados iniciais. Podes correr mais do que uma vez.
4. Em **Authentication → Providers/Settings**, desativa
   **"Allow new users to sign up"** (sem registo público).
5. Em **Authentication → Users**, cria o teu utilizador (email + password).
   É com este que entras. Cria outros para quem mais precisar de aceder.

## 2. Ligar a aplicação ao Supabase

Cria um ficheiro `.env` na raiz do projeto (a partir de `.env.example`):

```
VITE_SUPABASE_URL=https://o-teu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=a-tua-anon-public-key
```

> A chave *anon* é segura no navegador **porque o RLS está ativo**. Nunca uses
> aqui a `service_role` key.

## 3. Correr localmente

```bash
npm install
npm run dev
```

Abre o endereço que aparece no terminal (por omissão
`http://localhost:5173`). Inicia sessão com o utilizador que criaste no
Supabase.

Para gerar a versão de produção:

```bash
npm run build      # gera a pasta dist/
npm run preview    # pré-visualiza a build
```

## Resolução de problemas

- **Ecrã "Falta ligar ao Supabase"** — o `.env` não existe ou está incompleto.
  Confirma as duas variáveis e reinicia o `npm run dev`.
- **"Email ou palavra-passe incorretos"** — confirma o utilizador em
  Authentication → Users no Supabase.
- **Erros a carregar/guardar dados** — confirma que correste o
  `supabase/schema.sql` e que o RLS está ativo.
