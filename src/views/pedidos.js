// Vista: Pedidos de Equipamento (separador de Equipamentos).
//
// O inventário diz o que o clube TEM; as encomendas dizem o tamanho de cada
// atleta. Nenhum dos dois responde à pergunta que aparece mesmo — "a Ana
// rasgou as meias, arranjas-lhe umas?". Isso vivia em mensagens de telemóvel:
// quem pede não sabe se foi tratado e quem trata não tem lista para trabalhar.
//
// Quem PEDE é o treinador (é ele que vê a atleta); quem DECIDE é o
// coordenador/seccionista (é quem paga o material). A separação não é de UI —
// o trigger `guard_request_decision` recusa a decisão a quem pediu.

import { state, createEquipmentRequest, decideEquipmentRequest, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, wireEmptyAction, PAGE_SIZE } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit, canDecideRequests, isClubWide } from '../permissions.js';
import {
  teamName, myTeams, equipmentArticles, playerSizes,
  articleLabel as configuredArticleLabel,
} from '../compute.js';
import {
  REQUEST_REASONS,
  REQUEST_REASON_LABEL,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_BADGE,
} from '../constants.js';

// Filtros e paginação são estado de UI: vivem no módulo, não na base de dados.
let statusFilter = 'abertos'; // 'abertos' | chave de estado | 'todos'
let teamFilter = '';
let page = 1;

// Corpo do separador "Pedidos" (renderizado pelo orquestrador Equipamentos).
export function renderPedidosBody(container) {
  const canRequest = canEdit('equipment_requests');
  const canDecide = canDecideRequests();

  // Sem a migração a lista fica vazia — e uma lista vazia diz "ainda não há
  // pedidos", que é mentira. Avisa-se quem pode resolver.
  if (!state.equipmentRequestsReady) {
    container.innerHTML = `
      <div class="alert alert--warn">
        Falta correr a migração <code>supabase/pedidos-equipamento.sql</code> no Supabase.
        Até lá não é possível registar pedidos de equipamento.
      </div>`;
    return;
  }

  const teams = myTeams().slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const teamIds = new Set(teams.map((t) => t.id));
  const playerById = Object.fromEntries(state.players.map((p) => [p.id, p]));

  // O RLS já recorta os pedidos das equipas do treinador; aqui recorta-se
  // também a cache, para o mesmo ecrã ser coerente com o resto da app.
  const all = state.equipmentRequests
    .filter((r) => {
      const p = playerById[r.player_id];
      return p && (isClubWide() || teamIds.has(p.team_id));
    })
    .sort(byUrgency);

  const counts = { pendente: 0, aprovado: 0, entregue: 0, recusado: 0 };
  all.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });

  const rows = all.filter((r) => {
    if (teamFilter && playerById[r.player_id]?.team_id !== teamFilter) return false;
    if (statusFilter === 'todos') return true;
    if (statusFilter === 'abertos') return r.status === 'pendente' || r.status === 'aprovado';
    return r.status === statusFilter;
  });
  const pg = paginate(rows, page, PAGE_SIZE);

  container.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="filters" style="margin:0;padding:0;background:none;border:none;align-items:flex-end">
        ${teams.length > 1 ? `
          <div>
            <label for="req-team">Equipa</label>
            <select id="req-team">
              <option value="">Todas</option>
              ${teams.map((t) => `<option value="${t.id}" ${t.id === teamFilter ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
            </select>
          </div>` : ''}
        <div>
          <label for="req-status">Estado</label>
          <select id="req-status">
            <option value="abertos" ${statusFilter === 'abertos' ? 'selected' : ''}>Por resolver</option>
            ${REQUEST_STATUSES.map((s) => `<option value="${s.key}" ${statusFilter === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
            <option value="todos" ${statusFilter === 'todos' ? 'selected' : ''}>Todos</option>
          </select>
        </div>
        ${canRequest ? '<button class="btn btn--accent" id="add-req" type="button" style="margin-left:auto">+ Pedido</button>' : ''}
      </div>
    </div>

    <section class="cards-grid aval-summary" style="margin-bottom:1.2rem">
      <div class="card metric metric--warn aval-metric">
        <span class="metric__label">Por decidir</span>
        <strong class="metric__value">${counts.pendente}</strong>
      </div>
      <div class="card metric metric--info aval-metric">
        <span class="metric__label">Aprovados</span>
        <strong class="metric__value">${counts.aprovado}</strong>
      </div>
      <div class="card metric metric--green aval-metric">
        <span class="metric__label">Entregues</span>
        <strong class="metric__value">${counts.entregue}</strong>
      </div>
      <div class="card metric metric--red aval-metric">
        <span class="metric__label">Recusados</span>
        <strong class="metric__value">${counts.recusado}</strong>
      </div>
    </section>

    ${rows.length
      ? `<div class="card" style="padding:0;overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Atleta</th>
                <th>Artigo</th>
                <th>Tam.</th>
                <th>Qt.</th>
                <th>Motivo</th>
                <th>Pedido por</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${pg.items.map((r) => rowHTML(r, playerById[r.player_id], canDecide)).join('')}
            </tbody>
          </table>
         </div>
         ${paginationHTML({ ...pg, id: 'req' })}`
      : emptyHTML(
          all.length
            ? 'Nenhum pedido neste filtro.'
            : 'Ainda não há pedidos de equipamento.',
          {
            icone: '🧦',
            action: canRequest && !all.length ? { key: 'add-req', label: '+ Fazer um pedido' } : null,
          }
        )
    }
  `;

  container.querySelector('#req-team')?.addEventListener('change', (e) => {
    teamFilter = e.target.value;
    page = 1;
    renderPedidosBody(container);
  });
  container.querySelector('#req-status')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    page = 1;
    renderPedidosBody(container);
  });
  container.querySelector('#add-req')?.addEventListener('click', () => openForm());
  wireEmptyAction(container, 'add-req', () => openForm());
  container.querySelectorAll('[data-edit-req]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.editReq))
  );
  container.querySelectorAll('[data-cancel-req]').forEach((b) =>
    b.addEventListener('click', () => cancelRequest(b.dataset.cancelReq))
  );
  container.querySelectorAll('[data-decide]').forEach((b) =>
    b.addEventListener('click', () => decide(b.dataset.decide, b.dataset.status))
  );
  wirePagination(container, 'req', pg.page, pg.totalPages, (np) => {
    page = np;
    renderPedidosBody(container);
  });
}

// Ordem: primeiro o que está por resolver (mais antigo à frente — é o que já
// espera há mais tempo), depois o histórico do mais recente para trás.
const OPEN_ORDER = { pendente: 0, aprovado: 1, entregue: 2, recusado: 2 };
function byUrgency(a, b) {
  const oa = OPEN_ORDER[a.status] ?? 3;
  const ob = OPEN_ORDER[b.status] ?? 3;
  if (oa !== ob) return oa - ob;
  const da = a.created_at || '';
  const db = b.created_at || '';
  return oa < 2 ? da.localeCompare(db) : db.localeCompare(da);
}

function articleLabel(req) {
  if (req.article === 'outro') return req.article_other?.trim() || 'Outro artigo';
  // Passa pela lista configurada do clube, e essa também traduz os artigos
  // já desativados: um pedido de dezembro tem de continuar a dizer "Blusão".
  return configuredArticleLabel(req.article);
}

// Quem pediu. O nome do treinador vem da ficha (coaches.user_id); só o
// coordenador tem a lista de perfis, por isso o email é recurso, não regra.
function requesterLabel(uid) {
  if (!uid) return '—';
  if (uid === state.profile?.id) return 'Tu';
  const coach = state.coaches.find((c) => c.user_id === uid);
  if (coach) return coach.name;
  // Pedido feito pela PRÓPRIA atleta, do portal. Distingui-lo importa para
  // quem decide: um pedido do treinador já passou por um adulto que viu o
  // material, e este não — e a resposta vai ser lida por ela.
  const player = state.players.find((p) => p.user_id === uid);
  if (player) return `${player.name} (a própria)`;
  const profile = state.profiles?.find((p) => p.id === uid);
  return profile?.email || '—';
}

function rowHTML(req, player, canDecide) {
  const badge = REQUEST_STATUS_BADGE[req.status] || 'muted';
  const label = REQUEST_STATUS_LABEL[req.status] || req.status;
  // Editar/cancelar é de quem pediu, e só enquanto ninguém decidiu — depois
  // disso o pedido é histórico (espelha as políticas de UPDATE/DELETE).
  const mine = req.requested_by && req.requested_by === state.profile?.id;
  const canAmend = mine && req.status === 'pendente';

  return `
    <tr>
      <td>
        <span class="enc-player-name">${esc(player?.name || 'Atleta removido')}</span>
        ${player ? `<span class="muted" style="display:block;font-size:0.8rem">${esc(teamName(state.teams.find((t) => t.id === player.team_id)) || '')}</span>` : ''}
      </td>
      <td>${esc(articleLabel(req))}</td>
      <td>${req.size ? `<span class="badge badge--info">${esc(req.size)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${req.quantity}</td>
      <td>
        ${esc(REQUEST_REASON_LABEL[req.reason] || req.reason)}
        ${req.notes ? `<span class="muted" style="display:block;font-size:0.8rem">${esc(req.notes)}</span>` : ''}
      </td>
      <td>
        ${esc(requesterLabel(req.requested_by))}
        <span class="muted" style="display:block;font-size:0.8rem">${esc(shortDate(req.created_at))}</span>
      </td>
      <td>
        <span class="badge badge--${badge}">${esc(label)}</span>
        ${req.decision_note ? `<span class="muted" style="display:block;font-size:0.8rem">${esc(req.decision_note)}</span>` : ''}
      </td>
      <td class="cell-actions">
        ${canDecide && req.status === 'pendente' ? `
          <button class="btn btn--ghost btn--sm" data-decide="${req.id}" data-status="aprovado" type="button">Aprovar</button>
          <button class="btn btn--danger btn--sm" data-decide="${req.id}" data-status="recusado" type="button">Recusar</button>` : ''}
        ${canDecide && req.status === 'aprovado' ? `
          <button class="btn btn--ghost btn--sm" data-decide="${req.id}" data-status="entregue" type="button">Marcar entregue</button>` : ''}
        ${canAmend ? `
          <button class="btn btn--ghost btn--sm" data-edit-req="${req.id}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-cancel-req="${req.id}" type="button">Cancelar</button>` : ''}
      </td>
    </tr>
  `;
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('pt-PT');
}

// --- Decidir --------------------------------------------------------------

async function decide(id, status) {
  const req = state.equipmentRequests.find((r) => r.id === id);
  if (!req) return;

  // A recusa PEDE motivo: uma recusa sem explicação volta como o mesmo pedido
  // na semana seguinte, e o treinador fica sem saber se pode resolver de outra
  // maneira. Aprovar e entregar não precisam de conversa.
  if (status === 'recusado') {
    openModal({
      title: 'Recusar pedido',
      submitLabel: 'Recusar',
      fields: [{
        name: 'decision_note', label: 'Motivo', type: 'textarea', required: true, full: true,
        placeholder: 'ex.: sem stock até janeiro — usar as do ano passado',
        hint: 'Chega a quem pediu, por notificação.',
      }],
      onSubmit: async (v) => {
        try {
          await decideEquipmentRequest(id, 'recusado', v.decision_note);
        } catch (err) {
          throw new Error(dbErrorMessage(err));
        }
      },
    });
    return;
  }

  try {
    await decideEquipmentRequest(id, status);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function cancelRequest(id) {
  const req = state.equipmentRequests.find((r) => r.id === id);
  const player = state.players.find((p) => p.id === req?.player_id);
  const ok = await confirmDialog(
    `Cancelar o pedido de ${articleLabel(req || {})} para ${player?.name || 'este atleta'}?`
  );
  if (!ok) return;
  try {
    await deleteRow('equipment_requests', 'equipmentRequests', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

// --- Formulário -----------------------------------------------------------

// Opções de artigo: a lista da encomenda mais "outro". O "outro" existe porque
// o material que se pede a meio da época é muitas vezes o que não está na
// lista de equipamento oficial (joelheiras, uma bola para levar para casa).
function articleOptions() {
  return [
    ...equipmentArticles().map((a) => ({ key: a.key, label: a.label })),
    { key: 'outro', label: 'Outro artigo…' },
  ];
}

// Tamanho já registado na ficha do atleta para aquele artigo.
function sizeFromFile(playerId, article) {
  if (!playerId || !article || article === 'outro') return '';
  return playerSizes(playerId)[article] || '';
}

function openForm(id, draft) {
  const existing = id ? state.equipmentRequests.find((r) => r.id === id) : null;
  const teams = myTeams().slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));

  const base = existing
    ? { ...existing, team_id: state.players.find((p) => p.id === existing.player_id)?.team_id || '' }
    : { quantity: '1', reason: 'novo', team_id: teamFilter || teams[0]?.id || '' };
  const values = draft || base;

  const teamId = values.team_id || '';
  const article = values.article || '';
  const articles = equipmentArticles();
  // Os tamanhos possíveis são os que o clube definiu PARA ESTE ARTIGO. Sem
  // nenhum definido (as meias, o "outro"), o campo é texto livre.
  const articleSizes = articles.find((a) => a.key === article)?.sizes || [];

  const players = state.players
    .filter((p) => !teamId || p.team_id === teamId)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Se o atleta escolhido já não é da equipa filtrada, o campo fica vazio em
  // vez de guardar em silêncio um atleta que já não está na lista.
  if (values.player_id && !players.some((p) => p.id === values.player_id)) {
    values.player_id = '';
  }

  const suggested = sizeFromFile(values.player_id, article);

  const fields = [
    ...(teams.length > 1 ? [{
      name: 'team_id', label: 'Equipa', type: 'select', required: true, reactive: true,
      placeholder: 'Escolher equipa…',
      options: teams.map((t) => ({ key: t.id, label: teamName(t) })),
    }] : []),
    {
      name: 'player_id', label: 'Atleta', type: 'select', required: true, reactive: true,
      placeholder: players.length ? 'Escolher atleta…' : 'Esta equipa não tem atletas',
      options: players.map((p) => ({ key: p.id, label: p.number ? `${p.number} · ${p.name}` : p.name })),
    },
    {
      name: 'article', label: 'Artigo', type: 'select', required: true, reactive: true,
      placeholder: 'Escolher artigo…',
      options: articleOptions(),
    },
  ];

  if (article === 'outro') {
    fields.push({
      name: 'article_other', label: 'Qual?', required: true,
      placeholder: 'ex.: joelheiras',
    });
  }

  // O tamanho vem pré-preenchido da ficha, mas é editável: um pedido acontece
  // muitas vezes porque o tamanho registado deixou de servir.
  fields.push(
    articleSizes.length
      ? {
          name: 'size', label: 'Tamanho', type: 'select',
          placeholder: '— Não definido —',
          options: articleSizes.map((s) => ({ key: s, label: s })),
          hint: suggested ? `Da ficha do atleta: ${suggested}.` : 'A ficha do atleta ainda não tem este tamanho.',
        }
      : {
          name: 'size', label: 'Tamanho', type: 'text',
          placeholder: 'ex.: 38',
          hint: suggested ? `Da ficha do atleta: ${suggested}.` : undefined,
        }
  );

  fields.push(
    { name: 'quantity', label: 'Quantidade', type: 'number', required: true, default: '1' },
    {
      name: 'reason', label: 'Motivo', type: 'select', required: true,
      options: REQUEST_REASONS.map((r) => ({ key: r.key, label: r.label })),
      hint: 'É o que decide entre aprovar e recusar.',
    },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Opcional…' },
  );

  let close;
  close = openModal({
    title: existing ? 'Editar pedido' : 'Novo pedido de equipamento',
    submitLabel: existing ? 'Guardar' : 'Pedir',
    values: { ...values, size: values.size ?? suggested },
    fields,
    // Trocar de equipa, de atleta ou de artigo reconstrói o formulário. O
    // tamanho é recalculado da ficha nessas três mudanças — deixar lá o "M" do
    // artigo anterior é pior do que não sugerir nada.
    onFieldChange: (name, current) => {
      close?.();
      const next = { ...values, ...current };
      if (name === 'team_id' || name === 'player_id' || name === 'article') delete next.size;
      openForm(id, next);
    },
    onSubmit: async (v) => {
      const qty = parseInt(v.quantity, 10) || 1;
      const payload = {
        player_id: v.player_id,
        article: v.article,
        article_other: v.article === 'outro' ? v.article_other?.trim() || null : null,
        size: v.size?.trim() || null,
        quantity: Math.min(Math.max(qty, 1), 50),
        reason: v.reason || 'novo',
        notes: v.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('equipment_requests', 'equipmentRequests', id, payload);
        else await createEquipmentRequest(payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}
