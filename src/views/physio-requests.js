// Pedidos de fisioterapia — o canal que faltava, do treinador para a fisio.
//
// A app já sabia dizer ao treinador o que a fisio decidiu (a disponibilidade
// do atleta, no perfil). Não sabia dizer à fisio o que o treinador viu: "a
// Rita queixa-se do ombro" saía da app para o WhatsApp, e ali não há fila, não
// há estado e não há resposta — quem avisou nunca soube se alguém viu.
//
// Quem PEDE é o treinador (ou o coordenador, que em metade dos clubes trata do
// plantel); quem TRIA é a fisio. A separação não é de UI: o trigger
// `guard_physio_triage` recusa a triagem a quem pediu. A atleta não entra aqui
// por lado nenhum — tudo o que seja uma queixa passa pelo treinador.
//
// Este módulo é o sítio único do pedido: o formulário de quem pede, a fila de
// quem tria e o bloco que aparece na ficha do atleta. O formulário de
// atendimento (clinical-file.js) é carregado só no momento de agendar — é o
// que evita que os dois módulos se importem um ao outro em círculo.

import {
  state, createPhysioRequest, triagePhysioRequest, updateRow, deleteRow, dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML, wireEmptyAction } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit, canTriagePhysio, isClubWide } from '../permissions.js';
import {
  teamName, teamById, myTeams,
  playerPhysioRequests, openPhysioRequest, pendingPhysioRequests,
} from '../compute.js';
import {
  PHYSIO_TRAINING_STATES,
  PHYSIO_TRAINING_LABEL,
  PHYSIO_TRAINING_BADGE,
  PHYSIO_REQUEST_STATUS_LABEL,
  PHYSIO_REQUEST_STATUS_BADGE,
  PHYSIO_REQUEST_OPEN,
} from '../constants.js';

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '';

const playerName = (id) => state.players.find((p) => p.id === id)?.name || 'Atleta';

// Aviso único de migração em falta. Sem a tabela, a fila fica vazia — e uma
// fila vazia lê-se como "ninguém pediu nada", que é mentira.
function physioRequestsMissingHTML() {
  return `
    <div class="alert alert--warn">
      Falta correr a migração <code>supabase/pedidos-fisioterapia.sql</code> no Supabase.
      Até lá não é possível enviar pedidos à fisioterapia.
    </div>`;
}

// --- Formulário de quem pede ---------------------------------------------
//
// Três perguntas e mais nenhuma. Quem preenche isto está no pavilhão, muitas
// vezes no telemóvel e com o treino a decorrer: um formulário com zona do
// corpo, tipo de dor e escala de 1 a 10 é um formulário que se responde ao
// calhas — e uma queixa classificada ao calhas ajuda a decidir menos do que
// uma frase escrita por quem viu.
//
// Não há campo de prioridade: a prioridade é a data que a fisio marcar. O que
// o treinador declara é um facto que ele observa — se a atleta está a treinar,
// a treinar limitada ou parada — e é isso que ordena a fila.
export function openPhysioRequestForm({ playerId, request, onSaved } = {}) {
  const existing = request || null;
  const fixed = playerId || existing?.player_id || null;
  const player = fixed ? state.players.find((p) => p.id === fixed) : null;

  // Sem atleta fixo (o coordenador a abrir da fila), escolhe-se pelo nome, com
  // a equipa ao lado: num clube há duas Marias.
  const teams = myTeams();
  const teamIds = new Set(teams.map((t) => t.id));
  const options = state.players
    .filter((p) => isClubWide() || teamIds.has(p.team_id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const t = teamById(p.team_id);
      return { key: p.id, label: t ? `${p.name} — ${teamName(t)}` : p.name };
    });

  openModal({
    title: existing ? 'Editar pedido' : 'Pedir fisioterapia',
    submitLabel: existing ? 'Guardar' : 'Enviar à fisioterapia',
    intro: player
      ? `Sobre ${player.name}. Isto chega à fisioterapia, que marca o atendimento conforme a agenda e responde aqui — descreve o que viste, que o diagnóstico é dela.`
      : 'Isto chega à fisioterapia, que marca o atendimento conforme a agenda e responde aqui — descreve o que viste, que o diagnóstico é dela.',
    fields: [
      ...(fixed ? [] : [{
        name: 'player_id', label: 'Atleta', type: 'select', required: true, full: true, options,
      }]),
      {
        name: 'complaint', label: 'O que se passa', type: 'textarea', required: true, full: true,
        placeholder: 'ex.: queixa-se do ombro direito a rematar; já tinha dito na semana passada',
        hint: 'O que viste ou o que ela te disse.',
      },
      {
        name: 'since', label: 'Desde quando', type: 'date',
        hint: 'Opcional. "Há duas semanas" e "ontem" são queixas diferentes.',
      },
      {
        name: 'training', label: 'Como está a treinar', type: 'select', required: true,
        options: PHYSIO_TRAINING_STATES.map((s) => ({ key: s.key, label: s.label })),
        hint: 'É isto que ordena a fila da fisioterapia.',
      },
    ],
    values: {
      complaint: existing?.complaint || '',
      since: existing?.since || '',
      training: existing?.training || 'normal',
    },
    onSubmit: async (v) => {
      const target = fixed || v.player_id;
      if (!target) throw new Error('Escolhe o atleta.');

      // Um pedido vivo por atleta. Sem isto, uma queixa que demora duas
      // semanas a resolver-se acaba com três pedidos iguais na fila, e a fisio
      // passa a triar duplicados em vez de atletas.
      const aberto = openPhysioRequest(target);
      if (!existing && aberto) {
        throw new Error(
          aberto.status === 'agendado'
            ? 'Já há um pedido deste atleta com atendimento marcado. Fala com a fisioterapia em vez de abrir outro.'
            : 'Já há um pedido deste atleta à espera de triagem.'
        );
      }

      const payload = {
        complaint: v.complaint.trim(),
        since: v.since || null,
        training: v.training,
      };
      try {
        if (existing) {
          await updateRow('physio_requests', 'physioRequests', existing.id, payload);
        } else {
          await createPhysioRequest({ ...payload, player_id: target });
        }
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
      onSaved?.();
    },
  });
}

// --- Triagem --------------------------------------------------------------

// Agendar é marcar o atendimento — não há um segundo ecrã de agenda, porque a
// agenda já é a agenda. O formulário de atendimento abre com o atleta já
// escolhido e a queixa à vista, e o pedido fica ligado ao que sair de lá.
async function scheduleRequest(req, onDone) {
  const { openAppointmentForm } = await import('./clinical-file.js');
  openAppointmentForm({
    playerId: req.player_id,
    context: `Pedido do treinador: ${req.complaint}`,
    onSaved: async (appt) => {
      if (!appt?.id) return;
      try {
        await triagePhysioRequest(req.id, 'agendado', {
          appointmentId: appt.id,
          // O episódio só vem se o atendimento o trouxer: quem decide que uma
          // queixa é um episódio clínico é quem a avalia, e é lá que se abre.
          episodeId: appt.episode_id || null,
        });
      } catch (err) {
        alert(dbErrorMessage(err));
      }
      onDone?.();
    },
  });
}

// Dispensar PEDE motivo. Um pedido devolvido em silêncio volta como o mesmo
// pedido na semana seguinte — e, pior, ensina o treinador a não voltar a
// pedir, que é como tudo isto volta para o telemóvel.
function dismissRequest(req, onDone) {
  openModal({
    title: 'Dispensar pedido',
    submitLabel: 'Dispensar',
    intro: `Sobre ${playerName(req.player_id)}. O motivo chega a quem pediu, por notificação.`,
    fields: [{
      name: 'triage_note', label: 'Motivo', type: 'textarea', required: true, full: true,
      placeholder: 'ex.: já está a ser seguida por este mesmo problema — sem necessidade de novo atendimento',
    }],
    onSubmit: async (v) => {
      try {
        await triagePhysioRequest(req.id, 'dispensado', { note: v.triage_note });
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
      onDone?.();
    },
  });
}

// Fechar à mão: a fisio viu a atleta no corredor e resolveu-se ali. O fecho
// normal é automático (o atendimento marcado passa a "realizado"), por isso
// isto é a saída para o que não passou pela agenda.
async function closeRequest(req, onDone) {
  const ok = await confirmDialog(
    `Dar como resolvido o pedido sobre ${playerName(req.player_id)}?`,
    { confirmLabel: 'Dar como resolvido', danger: false }
  );
  if (!ok) return;
  try {
    await triagePhysioRequest(req.id, 'fechado');
  } catch (err) {
    alert(dbErrorMessage(err));
  }
  onDone?.();
}

// Voltar à fila: o atendimento foi cancelado ou marcado por engano. Sem esta
// saída, um pedido agendado cujo atendimento desapareceu ficava "agendado"
// para sempre — fora da fila e sem ninguém a olhar para ele.
async function reopenRequest(req, onDone) {
  const ok = await confirmDialog(
    `Devolver à fila o pedido sobre ${playerName(req.player_id)}? O atendimento marcado deixa de lhe estar ligado.`,
    { confirmLabel: 'Devolver à fila', danger: false }
  );
  if (!ok) return;
  try {
    await triagePhysioRequest(req.id, 'novo', { appointmentId: null });
  } catch (err) {
    alert(dbErrorMessage(err));
  }
  onDone?.();
}

// Retirar o que se pediu: a atleta apareceu no dia seguinte sem queixa
// nenhuma. Só enquanto ninguém lhe pegou — depois de triado é histórico.
async function withdrawRequest(req, onDone) {
  const ok = await confirmDialog(`Retirar o pedido sobre ${playerName(req.player_id)}?`);
  if (!ok) return;
  try {
    await deleteRow('physio_requests', 'physioRequests', req.id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
  onDone?.();
}

// Liga os botões de triagem de um contentor já desenhado. Um sítio só: os
// mesmos botões aparecem na fila e na ficha do atleta, e escritos duas vezes
// divergiam à primeira correção.
function wirePhysioRequestActions(container, onDone) {
  const find = (id) => state.physioRequests.find((r) => r.id === id);
  container.querySelectorAll('[data-preq-schedule]').forEach((b) =>
    b.addEventListener('click', () => scheduleRequest(find(b.dataset.preqSchedule), onDone))
  );
  container.querySelectorAll('[data-preq-dismiss]').forEach((b) =>
    b.addEventListener('click', () => dismissRequest(find(b.dataset.preqDismiss), onDone))
  );
  container.querySelectorAll('[data-preq-close]').forEach((b) =>
    b.addEventListener('click', () => closeRequest(find(b.dataset.preqClose), onDone))
  );
  container.querySelectorAll('[data-preq-reopen]').forEach((b) =>
    b.addEventListener('click', () => reopenRequest(find(b.dataset.preqReopen), onDone))
  );
  container.querySelectorAll('[data-preq-edit]').forEach((b) =>
    b.addEventListener('click', () => openPhysioRequestForm({ request: find(b.dataset.preqEdit), onSaved: onDone }))
  );
  container.querySelectorAll('[data-preq-withdraw]').forEach((b) =>
    b.addEventListener('click', () => withdrawRequest(find(b.dataset.preqWithdraw), onDone))
  );
}

// --- Desenho de um pedido -------------------------------------------------

// A resposta da fisio ao pedido: a marcação ou o motivo por que não há uma.
function triageLineHTML(req) {
  if (req.status === 'agendado') {
    const appt = state.appointments.find((a) => a.id === req.appointment_id);
    if (!appt) return '<span class="muted">Atendimento marcado (já não existe na agenda).</span>';
    const hora = appt.time ? ` às ${esc(appt.time.slice(0, 5))}` : '';
    return `<span>Atendimento a ${esc(fmtDate(appt.date))}${hora}${appt.location ? ' · ' + esc(appt.location) : ''}.</span>`;
  }
  if (req.triage_note) return `<span>${esc(req.triage_note)}</span>`;
  return '';
}

function actionsHTML(req, { triage, mine }) {
  const btns = [];
  if (triage) {
    if (req.status === 'novo') {
      btns.push(`<button class="btn btn--accent btn--sm" data-preq-schedule="${req.id}" type="button">Marcar atendimento</button>`);
      btns.push(`<button class="btn btn--ghost btn--sm" data-preq-close="${req.id}" type="button">Resolvido</button>`);
      btns.push(`<button class="btn btn--ghost btn--sm" data-preq-dismiss="${req.id}" type="button">Dispensar</button>`);
    } else if (req.status === 'agendado') {
      btns.push(`<button class="btn btn--ghost btn--sm" data-preq-close="${req.id}" type="button">Resolvido</button>`);
      btns.push(`<button class="btn btn--ghost btn--sm" data-preq-reopen="${req.id}" type="button">Devolver à fila</button>`);
    }
  }
  // Quem pediu corrige ou retira o que escreveu enquanto ninguém lhe pegou.
  if (mine && req.status === 'novo' && !triage) {
    btns.push(`<button class="btn btn--ghost btn--sm" data-preq-edit="${req.id}" type="button">Editar</button>`);
    btns.push(`<button class="btn btn--ghost btn--sm" data-preq-withdraw="${req.id}" type="button">Retirar</button>`);
  }
  return btns.length ? `<div class="row row--wrap" style="gap:0.4rem;margin-top:0.5rem">${btns.join('')}</div>` : '';
}

// Um pedido, com o nome do atleta por cima quando a lista é de vários.
export function physioRequestHTML(req, { triage = false, withName = false } = {}) {
  const mine = req.requested_by === state.profile?.id;
  const linha = triageLineHTML(req);
  return `
    <li class="preq-item">
      <div class="med-stats" style="margin:0 0 0.35rem">
        ${withName ? `<strong>${esc(playerName(req.player_id))}</strong>` : ''}
        <span class="badge badge--${PHYSIO_TRAINING_BADGE[req.training] || 'muted'}">${esc(PHYSIO_TRAINING_LABEL[req.training] || req.training)}</span>
        <span class="badge badge--${PHYSIO_REQUEST_STATUS_BADGE[req.status] || 'muted'}">${esc(PHYSIO_REQUEST_STATUS_LABEL[req.status] || req.status)}</span>
        ${req.since ? `<span class="badge badge--muted">Desde ${esc(fmtDate(req.since))}</span>` : ''}
      </div>
      <p style="margin:0">${esc(req.complaint)}</p>
      ${linha ? `<p class="muted" style="margin:0.3rem 0 0;font-size:0.86rem">${linha}</p>` : ''}
      ${actionsHTML(req, { triage, mine })}
    </li>
  `;
}

// --- A fila da triagem (separador "Pedidos" do Departamento Médico) -------

export function renderPhysioRequestsBody(container) {
  if (!state.physioRequestsReady) {
    container.innerHTML = physioRequestsMissingHTML();
    return;
  }

  const rerender = () => renderPhysioRequestsBody(container);
  const triage = canTriagePhysio();
  const canAsk = canEdit('physio_requests');

  const fila = pendingPhysioRequests();
  const agendados = state.physioRequests.filter((r) => r.status === 'agendado');
  // O histórico fecha-se de origem: é o que já foi resolvido, e a fila é o
  // trabalho. Aberto, empurrava para fora do ecrã exatamente o que se veio ver.
  const fechados = state.physioRequests
    .filter((r) => !PHYSIO_REQUEST_OPEN.includes(r.status))
    .slice(0, 25);

  container.innerHTML = `
    ${canAsk ? `
      <div class="row row--wrap" style="justify-content:flex-end;margin-bottom:0.8rem">
        <button class="btn btn--accent" id="preq-add" type="button">+ Pedido</button>
      </div>` : ''}

    <section class="card" style="margin-bottom:1rem">
      <h2 class="section-title upcoming-card__title">Por triar${fila.length ? ` (${fila.length})` : ''}</h2>
      ${fila.length
        ? `<ul class="cf-appt-list">${fila.map((r) => physioRequestHTML(r, { triage, withName: true })).join('')}</ul>`
        : emptyHTML('Nenhum pedido à espera de triagem.', {
            icone: '🩹',
            action: canAsk ? { key: 'preq-add', label: '+ Fazer um pedido' } : null,
          })}
    </section>

    ${agendados.length ? `
      <section class="card" style="margin-bottom:1rem">
        <h2 class="section-title upcoming-card__title">Com atendimento marcado (${agendados.length})</h2>
        <ul class="cf-appt-list">${agendados.map((r) => physioRequestHTML(r, { triage, withName: true })).join('')}</ul>
      </section>` : ''}

    ${fechados.length ? `
      <details class="group">
        <summary>Resolvidos e dispensados (${fechados.length})</summary>
        <ul class="cf-appt-list">${fechados.map((r) => physioRequestHTML(r, { triage: false, withName: true })).join('')}</ul>
      </details>` : ''}
  `;

  container.querySelector('#preq-add')?.addEventListener('click', () => openPhysioRequestForm({ onSaved: rerender }));
  wireEmptyAction(container, 'preq-add', () => openPhysioRequestForm({ onSaved: rerender }));
  wirePhysioRequestActions(container, rerender);
}

// --- O bloco na ficha do atleta ------------------------------------------
//
// A fila responde "quem vejo a seguir"; a ficha responde "porque é que esta
// atleta está aqui". Quem abre a ficha a partir do Painel ou da fila tem de
// ver a queixa que deu origem a tudo, sem voltar atrás.
export function renderPhysioRequestsInto(container, playerId, { onChanged } = {}) {
  if (!state.physioRequestsReady) { container.innerHTML = ''; return; }

  const rerender = () => {
    renderPhysioRequestsInto(container, playerId, { onChanged });
    onChanged?.();
  };
  const triage = canTriagePhysio();
  const canAsk = canEdit('physio_requests');
  const list = playerPhysioRequests(playerId);
  const abertos = list.filter((r) => PHYSIO_REQUEST_OPEN.includes(r.status));
  const antigos = list.filter((r) => !PHYSIO_REQUEST_OPEN.includes(r.status));

  // Sem pedidos e sem nada para pedir, o bloco não existe: uma secção vazia em
  // todas as fichas do clube é ruído em todas elas.
  if (!list.length && !canAsk) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="pd-section">
      <div class="cf-section-head">
        <span class="pd-label">Pedidos do treinador</span>
        ${canAsk && !abertos.length
          ? '<button class="btn btn--ghost btn--sm" id="preq-new" type="button">Pedir fisioterapia</button>'
          : ''}
      </div>
      ${abertos.length
        ? `<ul class="cf-appt-list">${abertos.map((r) => physioRequestHTML(r, { triage })).join('')}</ul>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem pedidos por resolver.</p>'}
      ${antigos.length
        ? `<details class="group" style="margin-top:0.5rem">
             <summary>Pedidos anteriores (${antigos.length})</summary>
             <ul class="cf-appt-list">${antigos.map((r) => physioRequestHTML(r, { triage: false })).join('')}</ul>
           </details>`
        : ''}
    </div>
  `;

  container.querySelector('#preq-new')?.addEventListener('click', () =>
    openPhysioRequestForm({ playerId, onSaved: rerender })
  );
  wirePhysioRequestActions(container, rerender);
}
