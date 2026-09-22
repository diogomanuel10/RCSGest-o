-- =====================================================================
-- Rumia — O que a família já pagou da encomenda
-- =====================================================================
-- Corre DEPOIS de schema.sql, multitenant.sql, artigos-configuraveis.sql e
-- confirmacao-tamanhos.sql. Pode ser corrido várias vezes sem problema.
--
-- Porquê: a tabela das Encomendas sabia o que cada atleta veste e quanto
-- custa a encomenda da equipa — e não sabia quem já tinha pago. Essa parte
-- vivia numa folha de cálculo à parte, ou num caderno ao balcão, e ninguém a
-- cruzava com a lista que foi ao fornecedor. Daí saía sempre a mesma coisa:
-- material entregue que ninguém cobrou, e uma família a pagar duas vezes
-- porque quem recebeu na terça não era quem estava lá no sábado.
--
-- É o mesmo buraco que o `paid_at` dos Pedidos tapou do outro lado do
-- módulo (ver `circuito-pedidos.sql`), e a decisão é a mesma:
--
--   • É uma MARCA na linha da encomenda — está pago ou está por pagar — e
--     não uma tabela de pagamentos nem um lançamento no Financeiro. Quem
--     recebe ao balcão precisa de saber em quem já pode riscar o nome; o
--     registo contabilístico é outra coisa, e ligar as duas é uma decisão à
--     parte.
--   • O VALOR não se guarda aqui. É a soma dos artigos que a atleta tem
--     preenchidos, ao preço de HOJE (as Definições), a mesma estimativa que
--     o resumo da encomenda e o custo dos pedidos já usam. Um valor gravado
--     na linha seria um segundo dono do mesmo número, a divergir do resumo
--     no dia em que o preço mudasse.
--
-- O que cria:
--   1. `player_sizes.paid_at` / `paid_by` — quem já pagou a sua encomenda
--   2. Nada mais: o RLS de `player_sizes` já decide quem escreve aqui
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A marca de pago
-- ---------------------------------------------------------------------
-- `paid_by` é quem RECEBEU (o coordenador, o seccionista ao balcão), não
-- quem pagou — do outro lado está muitas vezes um encarregado de educação
-- sem conta na app. É a mesma leitura do `confirmed_by`: serve para saber a
-- quem perguntar quando a família disser que já entregou o dinheiro.
alter table player_sizes add column if not exists paid_at timestamptz;
alter table player_sizes add column if not exists paid_by uuid references auth.users(id) on delete set null;

-- Quem falta pagar é a pergunta que se faz a esta tabela, e é sempre sobre
-- as linhas por cobrar — o índice parcial é o que serve a lista.
create index if not exists idx_player_sizes_unpaid on player_sizes (paid_at)
  where paid_at is null;

-- ---------------------------------------------------------------------
-- 2. Quem dá a quitação
-- ---------------------------------------------------------------------
-- Não leva trigger de guarda, ao contrário do `guard_request_decision` dos
-- Pedidos. Lá era preciso porque a política de UPDATE deixa QUEM PEDIU
-- corrigir o seu próprio pedido — incluindo uma atleta, que assim se podia
-- marcar como paga. Aqui a política `sizes_write` já é só do coordenador e
-- do seccionista: ninguém de fora do secretariado escreve nesta tabela, e é
-- esse mesmo secretariado que já dá a quitação das quotas.
--
-- Deixado explícito para que a próxima política de escrita sobre
-- `player_sizes` — uma que abra a linha à atleta, por exemplo, como houve a
-- tentação de fazer em `players` — não abra com ela o `paid_at`.

-- ---------------------------------------------------------------------
-- 3. Mudar um tamanho NÃO desmarca o pagamento
-- ---------------------------------------------------------------------
-- O `clear_sizes_confirmation` limpa a confirmação da família a cada
-- alteração de tamanhos, e está certo: uma confirmação é sobre valores
-- concretos, e dizer "confirmado" sobre dados que ninguém viu é pior do que
-- não ter marca nenhuma.
--
-- Com o pagamento é ao contrário, e por isso o trigger não lhe toca: o
-- dinheiro foi entregue, e corrigir depois uma gralha no nome a estampar não
-- o desentrega. Desmarcar por causa de uma correção mandava o clube cobrar
-- outra vez a quem já tinha pago — que é exatamente o erro que isto vem
-- resolver. Se a encomenda mudar ao ponto de haver mais a cobrar, quem
-- recebe desmarca à mão e volta a marcar; é uma decisão de quem está ao
-- balcão, não de um trigger.
