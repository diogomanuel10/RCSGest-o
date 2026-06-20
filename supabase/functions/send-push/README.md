# Notificações push — configuração

A app já está pronta para PWA e push. Falta gerar as chaves VAPID e publicar a
Edge Function que envia as notificações. Faz isto uma vez.

## 1. Gerar as chaves VAPID

```bash
npx web-push generate-vapid-keys
```

Guarda as duas chaves (pública e privada).

## 2. Configurar a chave PÚBLICA no frontend

No `.env` (e nas variáveis do Vercel) define:

```
VITE_VAPID_PUBLIC_KEY=<chave pública>
```

Sem esta variável, o sino das notificações não aparece (push fica desligado).

## 3. Aplicar o schema e publicar a função

```bash
# cria a tabela push_subscriptions (corre o schema.sql no SQL Editor do Supabase,
# ou via CLI). Depois:

supabase functions deploy send-push

# Secrets do servidor (a chave privada NUNCA vai para o frontend):
supabase secrets set \
  VAPID_PUBLIC_KEY=<chave pública> \
  VAPID_PRIVATE_KEY=<chave privada> \
  VAPID_SUBJECT=mailto:geral@oteuclube.pt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas
automaticamente pelo Supabase nas Edge Functions — não as definas à mão.

## 4. Usar

- Cada utilizador ativa as notificações no **sino** da barra de topo (pede
  permissão ao navegador e regista o dispositivo).
- O coordenador envia em **Definições → Notificações** (título, mensagem e grupo
  de destinatários). Só o coordenador o pode fazer (validado na função).

## Notas

- **iOS/iPadOS**: o push só funciona depois de a app ser **instalada** no ecrã
  principal (Partilhar → Adicionar ao ecrã principal), iOS 16.4+.
- A função remove sozinha as subscrições mortas (dispositivos que desinstalaram
  ou bloquearam).
- Para enviar a um grupo, usa o campo de destinatários; o corpo do pedido aceita
  `roles` (lista de papéis) ou `user_ids` (utilizadores específicos).
