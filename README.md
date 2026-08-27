# Rumia

Plataforma de **gestão desportiva para clubes**. Cada clube personaliza a sua
identidade (nome, lema, cores e emblema) nas Definições — ver a secção
_Personalização_ em [`CLAUDE.md`](CLAUDE.md).

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
- **Definições** — época, meta, identidade do clube, escalões e limiares.
- **Utilizadores** — o coordenador define o papel de cada pessoa.

## Papéis (permissões)

- **Coordenador** — acesso total (inclui Definições e gestão de Utilizadores).
- **Treinador** — edita Plantéis e Calendário; vê o resto.
- **Leitura** — apenas consulta.

Quem se regista começa em **Leitura**; o coordenador promove em **Utilizadores**.
As permissões são impostas pela base de dados (RLS), não só pela interface.

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
   [`supabase/schema.sql`](supabase/schema.sql). Cria as tabelas, os perfis e
   papéis, as políticas de segurança (RLS) e os dados iniciais. Podes correr
   mais do que uma vez. A seguir, e **por esta ordem**, corre os restantes
   guiões da pasta `supabase/`: `notifications.sql`, `multitenant.sql`,
   `plans.sql` (e `plans-consolidacao.sql`, se já tinhas os cinco planos
   antigos), `qrcode-presencas.sql` (presenças por QR / modo quiosque),
   `trainer-notifications.sql`, `convite-atleta.sql` (convites ligados à
   ficha do atleta), `portal-atleta.sql`, `comunicacao.sql` (respostas do
   atleta + avisos do clube), `resultados.sql` (resultados de jogo),
   `tatica.sql` (Decisão Tática: cenários de leitura de jogo + respostas),
   `exercicios.sql` (biblioteca de exercícios do clube) e
   `painel-avisos.sql` (limiares do clube + avisos por utilizador),
   `dados-exemplo.sql` (clube de demonstração para quem se regista),
   `web-push.sql` (notificações no telemóvel — ver secção 5) e
   `eliminar-clubes.sql` (eliminar clubes e contas no painel da plataforma).
   Todos são seguros de re-executar.
4. Em **Authentication → Sign In / Providers**, garante que
   **"Allow new users to sign up"** está **ativo** — a app permite criar conta
   por email e password no separador "Criar conta".
   - Se mantiveres **"Confirm email"** ativo (recomendado), cada nova conta
     recebe um email de confirmação e só consegue entrar depois de confirmar.
   - Em alternativa, podes criar contas manualmente em
     **Authentication → Users**.
5. **Coordenador inicial.** O `schema.sql` promove automaticamente a conta
   `diomanuel10@gmail.com` a coordenador — mas só *depois* de essa conta se
   registar (o perfil é criado no registo). Por isso: **regista-te primeiro** na
   app e **volta a correr o `schema.sql`** (ou só a última linha de `update`).
   Para outro email, edita essa linha no fim do `schema.sql`. A partir daí,
   geres todos os papéis dentro da app, em **Utilizadores**.

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

## 4. Notificações no telemóvel (Android e iOS)

Sem isto a app funciona na mesma: as notificações aparecem no sino, dentro da
app. Com isto chegam ao telemóvel **com a app fechada**, como as de qualquer
outra aplicação.

1. **Gera as chaves VAPID** (uma vez, na tua máquina):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Chave pública → site.** No `.env` (e nas variáveis do Vercel):

   ```
   VITE_VAPID_PUBLIC_KEY=a-chave-publica
   ```

3. **Chave privada → servidor.** Publica a Edge Function e dá-lhe os segredos:

   ```bash
   supabase functions deploy send-push
   supabase secrets set VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=... \
                        VAPID_SUBJECT=mailto:o-teu@email
   ```

   A chave privada **nunca** vai para o `.env` nem para o browser.

4. **Liga o gatilho.** Corre `supabase/web-push.sql` no SQL Editor e preenche
   o `update` que está no fim do ficheiro (URL da função + `service_role` key).
   A partir daí, cada notificação criada na app sai para os dispositivos.

5. **No telemóvel**, cada pessoa ativa uma vez: sino → **Ativar notificações**.

> **iPhone/iPad:** a Apple só entrega notificações a uma app **instalada no
> ecrã principal**. No Safari, Partilhar → *Adicionar ao ecrã principal*, e
> abrir a Rumia por esse ícone (iOS 16.4 ou mais recente). A app avisa disto
> sozinha a quem esteja nessa situação. No Android funciona no browser e
> instalada.

## 5. Publicar no Vercel

A app é um site estático (Vite), por isso assenta bem no Vercel.

1. Faz **push** do código para o GitHub (já está no repositório).
2. Em [vercel.com](https://vercel.com), **Add New → Project** e importa este
   repositório. O Vercel deteta o **Vite** automaticamente:
   - *Framework Preset*: **Vite**
   - *Build Command*: `npm run build`
   - *Output Directory*: `dist`
   - (o ficheiro [`vercel.json`](vercel.json) já trata do *fallback* para a app)
3. Em **Settings → Environment Variables**, adiciona as **duas** variáveis
   (os mesmos valores do teu `.env`, que **não** vai no Git):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   > Em Vite, as variáveis são lidas durante o *build*. Se as adicionares depois
   > do primeiro deploy, faz **Redeploy** para entrarem em vigor.
4. **Deploy.** No fim ficas com um endereço tipo `https://o-teu-projeto.vercel.app`.
5. No **Supabase → Authentication → URL Configuration**, mete esse endereço em
   **Site URL** (e em *Redirect URLs*). Assim os emails de confirmação de conta
   apontam para o site publicado, e não para `localhost`.

Cada novo *push* para o branch de produção volta a publicar automaticamente.

## Resolução de problemas

- **Ecrã "Falta ligar ao Supabase"** — o `.env` (local) ou as variáveis de
  ambiente (Vercel) não estão definidas. No Vercel, confirma-as e faz *Redeploy*.
- **"Email ou palavra-passe incorretos"** — confirma o utilizador em
  Authentication → Users no Supabase.
- **Erros a carregar/guardar dados** — confirma que correste o
  `supabase/schema.sql` e que o RLS está ativo.
- **Link de confirmação aponta para localhost** — define o **Site URL** no
  Supabase com o endereço do Vercel (passo 5 acima).
