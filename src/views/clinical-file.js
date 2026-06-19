// Ficha clínica de fisioterapia de um atleta.
//
// Reúne os dados base do atleta e o processo clínico digital: episódios
// clínicos (ex.: lesões) com avaliação inicial, diagnóstico funcional, plano
// de tratamento, evolução, restrições, previsão de retorno e alta, e as sessões
// realizadas em cada episódio. Permite ainda marcar atendimentos.
//
// É um painel próprio (não usa o openModal genérico no corpo) que se re-desenha
// após cada operação no store. Os formulários de criar/editar abrem por cima.

import { state, createRow, updateRow, deleteRow, upsertByPlayer, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import {
  teamById,
  teamName,
  playerEpisodes,
  episodeSessions,
  playerAppointments,
  appointmentConflicts,
  activeEpisode,
  playerMedicalHistory,
} from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  EPISODE_STATUSES,
  EPISODE_STATUS_LABEL,
  EPISODE_STATUS_BADGE,
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_TYPE_BADGE,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_BADGE,
  DEFAULT_LOCATION,
} from '../constants.js';
import { canEdit } from '../permissions.js';

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// Abre a ficha clínica de um atleta.
export function openClinicalFile(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const editable = canEdit('clinical');

  // Episódios expandidos (mostram detalhe + sessões). Por omissão, expande o
  // primeiro (o mais relevante: ativo/recuperação).
  const expanded = new Set();
  const first = playerEpisodes(playerId)[0];
  if (first) expanded.add(first.id);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card clinical-file" role="dialog" aria-modal="true"
         aria-label="Ficha clínica de ${esc(player.name)}" style="width:min(720px,96vw)">
      <div class="modal__head">
        <h2 class="section-title">Ficha clínica</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div data-cf-body></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  overlay.querySelector('.modal__close').focus();

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const body = overlay.querySelector('[data-cf-body]');

  function render() {
    const p = state.players.find((x) => x.id === playerId);
    if (!p) { close(); return; }
    const team = teamById(p.team_id);
    const active = activeEpisode(playerId);
    const episodes = playerEpisodes(playerId);
    const appts = playerAppointments(playerId);
    const hist = playerMedicalHistory(playerId);

    const initials = (p.name || '?')
      .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

    body.innerHTML = `
      <div class="pd-hero">
        <span class="pd-avatar" aria-hidden="true">${esc(initials || '?')}</span>
        <div class="pd-hero__info">
          <strong class="pd-hero__name">${esc(p.name)}</strong>
          <span class="muted pd-hero__meta">
            ${p.number ? `Nº ${esc(p.number)}` : 'Sem número'}
            ${p.position ? ` · ${esc(p.position)}` : ''}
            ${team ? ` · ${esc(teamName(team))}` : ''}
          </span>
        </div>
        <span class="badge badge--${active ? EPISODE_STATUS_BADGE[active.status] : 'ok'} pd-hero__review">
          ${active ? esc(EPISODE_STATUS_LABEL[active.status]) : 'Apto'}
        </span>
      </div>

      <div class="pd-grid">
        ${dataItem('Ano de nascimento', p.birth_year)}
        ${dataItem('Posição', p.position)}
        ${dataItem('Contacto', p.guardian_contact)}
        ${dataItem('Nº de federado', p.federation_number)}
      </div>

      <div class="pd-section">
        <div class="cf-section-head">
          <span class="pd-label">História clínica</span>
          ${editable ? '<button class="btn btn--ghost btn--sm" data-edit-history type="button">Editar</button>' : ''}
        </div>
        ${hist && (hist.limitations || hist.past_injuries || hist.surgeries || hist.chronic_diseases || hist.medication)
          ? `${fieldBlock('Limitações ao treino', hist.limitations)}
             ${fieldBlock('Lesões', hist.past_injuries)}
             ${fieldBlock('Cirurgias', hist.surgeries)}
             ${fieldBlock('Doenças crónicas', hist.chronic_diseases)}
             ${fieldBlock('Medicação', hist.medication)}`
          : '<p class="muted" style="margin:0.3rem 0 0">Sem história clínica registada.</p>'}
      </div>

      <div class="pd-section">
        <div class="cf-section-head">
          <span class="pd-label">Episódios clínicos</span>
          ${editable ? '<button class="btn btn--accent btn--sm" data-add-episode type="button">+ Episódio</button>' : ''}
        </div>
        ${episodes.length
          ? `<div class="cf-episodes">${episodes.map((e) => episodeHTML(e, expanded.has(e.id), editable)).join('')}</div>`
          : '<p class="muted" style="margin:0.3rem 0 0">Sem episódios registados.</p>'}
      </div>

      <div class="pd-section">
        <div class="cf-section-head">
          <span class="pd-label">Atendimentos</span>
          ${editable ? '<button class="btn btn--ghost btn--sm" data-add-appt type="button">+ Atendimento</button>' : ''}
        </div>
        ${appts.length
          ? `<ul class="cf-appt-list">${appts.map((a) => apptLineHTML(a, editable)).join('')}</ul>`
          : '<p class="muted" style="margin:0.3rem 0 0">Sem atendimentos marcados.</p>'}
      </div>

      <div class="modal__actions">
        <button class="btn btn--ghost" data-cf-close type="button">Fechar</button>
      </div>
    `;

    wire();
  }

  function wire() {
    body.querySelector('[data-cf-close]').addEventListener('click', close);
    body.querySelector('[data-add-episode]')?.addEventListener('click', () =>
      openEpisodeForm({ playerId, onSaved: render })
    );
    body.querySelector('[data-add-appt]')?.addEventListener('click', () =>
      openAppointmentForm({ playerId, onSaved: render })
    );
    body.querySelector('[data-edit-history]')?.addEventListener('click', () =>
      openHistoryForm(playerId, render)
    );

    body.querySelectorAll('[data-ep-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.epToggle;
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        render();
      })
    );
    body.querySelectorAll('[data-ep-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const ep = state.clinicalEpisodes.find((e) => e.id === b.dataset.epEdit);
        openEpisodeForm({ playerId, episode: ep, onSaved: render });
      })
    );
    body.querySelectorAll('[data-ep-del]').forEach((b) =>
      b.addEventListener('click', () => removeEpisode(b.dataset.epDel, render))
    );
    body.querySelectorAll('[data-ep-session]').forEach((b) =>
      b.addEventListener('click', () => openSessionForm({ episodeId: b.dataset.epSession, onSaved: render }))
    );
    body.querySelectorAll('[data-ep-appt]').forEach((b) =>
      b.addEventListener('click', () =>
        openAppointmentForm({ playerId, episodeId: b.dataset.epAppt, onSaved: render })
      )
    );
    body.querySelectorAll('[data-session-del]').forEach((b) =>
      b.addEventListener('click', () => removeSession(b.dataset.sessionDel, render))
    );
    body.querySelectorAll('[data-appt-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const ap = state.appointments.find((a) => a.id === b.dataset.apptEdit);
        openAppointmentForm({ playerId, appointment: ap, onSaved: render });
      })
    );
    body.querySelectorAll('[data-appt-del]').forEach((b) =>
      b.addEventListener('click', () => removeAppointment(b.dataset.apptDel, render))
    );
  }

  render();
}

function dataItem(label, value) {
  return `
    <div class="pd-item">
      <span class="pd-label">${esc(label)}</span>
      <span class="pd-value">${value ? esc(value) : '—'}</span>
    </div>`;
}

function episodeHTML(ep, isOpen, editable) {
  const sessions = episodeSessions(ep.id);
  const sub = [ep.body_area, ep.injury_date ? `Início ${fmtDate(ep.injury_date)}` : '']
    .filter(Boolean).join(' · ');

  return `
    <article class="cf-episode">
      <div class="cf-episode__head">
        <button class="cf-episode__toggle" data-ep-toggle="${ep.id}" type="button" aria-expanded="${isOpen}">
          <span class="cf-episode__chevron">${isOpen ? '▾' : '▸'}</span>
          <span>
            <span class="badge badge--${EPISODE_STATUS_BADGE[ep.status] || 'muted'}">${esc(EPISODE_STATUS_LABEL[ep.status] || ep.status)}</span>
            <strong style="margin-left:0.4rem">${esc(ep.title)}</strong>
            ${sub ? `<span class="muted cf-episode__sub">${esc(sub)}</span>` : ''}
          </span>
        </button>
        ${editable
          ? `<div class="cell-actions">
               <button class="btn btn--ghost btn--sm" data-ep-edit="${ep.id}" type="button">Editar</button>
               <button class="btn btn--danger btn--sm" data-ep-del="${ep.id}" type="button">Remover</button>
             </div>`
          : ''}
      </div>
      ${isOpen ? `
        <div class="cf-episode__body">
          <div class="pd-grid">
            ${dataItem('Previsão de retorno', ep.expected_return ? fmtDate(ep.expected_return) : '')}
            ${dataItem('Data de alta', ep.discharge_date ? fmtDate(ep.discharge_date) : '')}
          </div>
          ${fieldBlock('Avaliação inicial', ep.initial_assessment)}
          ${fieldBlock('Diagnóstico funcional', ep.functional_diagnosis)}
          ${fieldBlock('Plano de tratamento', ep.treatment_plan)}
          ${fieldBlock('Restrições ao treino/jogo', ep.restrictions)}
          ${fieldBlock('Evolução', ep.evolution)}

          <div class="cf-section-head" style="margin-top:0.6rem">
            <span class="pd-label">Sessões (${sessions.length})</span>
            ${editable
              ? `<div class="cell-actions">
                   <button class="btn btn--ghost btn--sm" data-ep-session="${ep.id}" type="button">+ Sessão</button>
                   <button class="btn btn--link btn--sm" data-ep-appt="${ep.id}" type="button">Marcar atendimento</button>
                 </div>`
              : ''}
          </div>
          ${sessions.length
            ? `<ul class="cf-session-list">${sessions.map((s) => sessionLineHTML(s, editable)).join('')}</ul>`
            : '<p class="muted" style="margin:0.3rem 0 0">Sem sessões registadas.</p>'}
        </div>` : ''}
    </article>
  `;
}

function fieldBlock(label, value) {
  if (!value) return '';
  return `<div class="pd-notes"><span class="pd-label">${esc(label)}</span><p>${esc(value)}</p></div>`;
}

function sessionLineHTML(s, editable) {
  return `
    <li class="cf-session-row">
      <span class="cf-session-row__date">${esc(fmtDate(s.date))}</span>
      <span class="cf-session-row__notes">${s.notes ? esc(s.notes) : '<span class="muted">—</span>'}</span>
      ${editable ? `<button class="btn btn--link btn--sm" data-session-del="${s.id}" type="button">Apagar</button>` : ''}
    </li>`;
}

function apptLineHTML(a, editable) {
  const when = `${fmtDate(a.date)}${a.time ? ' · ' + esc(a.time.slice(0, 5)) : ''}`;
  return `
    <li class="cf-appt-row">
      <span class="cf-appt-row__when">${when}</span>
      <span class="badge badge--${APPOINTMENT_TYPE_BADGE[a.type] || 'muted'}">${esc(APPOINTMENT_TYPE_LABEL[a.type] || a.type)}</span>
      <span class="badge badge--${APPOINTMENT_STATUS_BADGE[a.status] || 'muted'}">${esc(APPOINTMENT_STATUS_LABEL[a.status] || a.status)}</span>
      ${a.notes ? `<span class="muted cf-appt-row__notes">${esc(a.notes)}</span>` : ''}
      ${editable
        ? `<span class="cell-actions">
             <button class="btn btn--ghost btn--sm" data-appt-edit="${a.id}" type="button">Editar</button>
             <button class="btn btn--danger btn--sm" data-appt-del="${a.id}" type="button">Remover</button>
           </span>`
        : ''}
    </li>`;
}

// --- Formulários ----------------------------------------------------------

function openHistoryForm(playerId, onSaved) {
  const hist = playerMedicalHistory(playerId) || {};
  openModal({
    title: 'História clínica',
    submitLabel: 'Guardar',
    values: hist,
    fields: [
      { name: 'limitations', label: 'Limitações ao treino', type: 'textarea', full: true },
      { name: 'past_injuries', label: 'Lesões', type: 'textarea', full: true },
      { name: 'surgeries', label: 'Cirurgias', type: 'textarea', full: true },
      { name: 'chronic_diseases', label: 'Doenças crónicas', type: 'textarea', full: true },
      { name: 'medication', label: 'Medicação', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      try {
        await upsertByPlayer('medical_history', 'medicalHistory', playerId, {
          limitations: values.limitations?.trim() || null,
          past_injuries: values.past_injuries?.trim() || null,
          surgeries: values.surgeries?.trim() || null,
          chronic_diseases: values.chronic_diseases?.trim() || null,
          medication: values.medication?.trim() || null,
        });
        onSaved?.();
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

export function openEpisodeForm({ playerId, episode, onSaved }) {
  const existing = episode || null;
  openModal({
    title: existing ? 'Editar episódio clínico' : 'Novo episódio clínico',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { status: 'ativo' },
    fields: [
      { name: 'title', label: 'Título / lesão', required: true, full: true, placeholder: 'ex.: Entorse do tornozelo direito' },
      { name: 'body_area', label: 'Zona do corpo', placeholder: 'ex.: Tornozelo' },
      { name: 'status', label: 'Estado', type: 'select', options: EPISODE_STATUSES },
      { name: 'injury_date', label: 'Data da lesão / início', type: 'date' },
      { name: 'expected_return', label: 'Previsão de retorno', type: 'date' },
      { name: 'discharge_date', label: 'Data de alta', type: 'date' },
      { name: 'initial_assessment', label: 'Avaliação inicial', type: 'textarea', full: true },
      { name: 'functional_diagnosis', label: 'Diagnóstico funcional', type: 'textarea', full: true },
      { name: 'treatment_plan', label: 'Plano de tratamento', type: 'textarea', full: true },
      { name: 'restrictions', label: 'Restrições ao treino/jogo', type: 'textarea', full: true },
      { name: 'evolution', label: 'Evolução', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        player_id: playerId,
        title: values.title.trim(),
        body_area: values.body_area?.trim() || null,
        status: values.status || 'ativo',
        injury_date: values.injury_date || null,
        expected_return: values.expected_return || null,
        discharge_date: values.discharge_date || null,
        initial_assessment: values.initial_assessment?.trim() || null,
        functional_diagnosis: values.functional_diagnosis?.trim() || null,
        treatment_plan: values.treatment_plan?.trim() || null,
        restrictions: values.restrictions?.trim() || null,
        evolution: values.evolution?.trim() || null,
      };
      try {
        if (existing) await updateRow('clinical_episodes', 'clinicalEpisodes', existing.id, payload);
        else await createRow('clinical_episodes', 'clinicalEpisodes', payload);
        onSaved?.();
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

function openSessionForm({ episodeId, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: 'Nova sessão',
    submitLabel: 'Adicionar',
    values: { date: today },
    fields: [
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'notes', label: 'Registo da sessão / evolução', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      try {
        await createRow('clinical_sessions', 'clinicalSessions', {
          episode_id: episodeId,
          date: values.date,
          notes: values.notes?.trim() || null,
        });
        onSaved?.();
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

// Formulário de atendimento, com aviso de conflito com treinos/jogos da equipa.
// Modal próprio (não o genérico) para mostrar o aviso em tempo real.
export function openAppointmentForm({ playerId, episodeId, appointment, onSaved }) {
  const existing = appointment || null;
  const player = state.players.find((p) => p.id === playerId);
  const episodes = playerEpisodes(playerId);
  const v = existing || {
    type: 'tratamento',
    date: '',
    time: '',
    end_time: '',
    location: DEFAULT_LOCATION,
    status: 'agendado',
    episode_id: episodeId || '',
    notes: '',
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="appt-title" style="width:min(560px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="appt-title">${existing ? 'Editar atendimento' : 'Marcar atendimento'}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p class="muted" style="margin-top:0">${esc(player?.name || '')}</p>

      <div class="field-grid">
        <div class="field">
          <label for="ap-type">Tipo *</label>
          <select id="ap-type">
            ${APPOINTMENT_TYPES.map((t) => `<option value="${t.key}" ${v.type === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="ap-status">Estado</label>
          <select id="ap-status">
            ${APPOINTMENT_STATUSES.map((s) => `<option value="${s.key}" ${v.status === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="ap-date">Data *</label>
          <input type="date" id="ap-date" value="${esc(v.date || '')}" required />
        </div>
        <div class="field">
          <label for="ap-time">Hora</label>
          <input type="time" id="ap-time" value="${esc((v.time || '').slice(0, 5))}" />
        </div>
        <div class="field">
          <label for="ap-end">Hora de fim</label>
          <input type="time" id="ap-end" value="${esc((v.end_time || '').slice(0, 5))}" />
        </div>
        <div class="field">
          <label for="ap-episode">Episódio (opcional)</label>
          <select id="ap-episode">
            <option value="">— Sem episódio —</option>
            ${episodes.map((e) => `<option value="${e.id}" ${v.episode_id === e.id ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field field--full">
        <label for="ap-location">Local</label>
        <input type="text" id="ap-location" value="${esc(v.location || '')}" />
      </div>
      <div class="field field--full">
        <label for="ap-notes">Observações</label>
        <textarea id="ap-notes">${esc(v.notes || '')}</textarea>
      </div>

      <div class="appt-conflict hidden" id="ap-conflict"></div>
      <div id="ap-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="ap-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="ap-confirm" type="button">${existing ? 'Guardar' : 'Marcar'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  overlay.querySelector('#ap-type').focus();

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#ap-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const conflictEl = overlay.querySelector('#ap-conflict');
  const errEl = overlay.querySelector('#ap-err');

  function checkConflicts() {
    const date = overlay.querySelector('#ap-date').value;
    const time = overlay.querySelector('#ap-time').value;
    const end = overlay.querySelector('#ap-end').value;
    const list = date ? appointmentConflicts(playerId, date, time, end) : [];
    if (list.length) {
      conflictEl.innerHTML = `⚠ Conflito com ${list.length} evento(s) da equipa: ` +
        list.map((ev) => esc(`${(ev.title || ev.type)}${ev.time ? ' ' + ev.time.slice(0, 5) : ''}`)).join(', ');
      conflictEl.classList.remove('hidden');
    } else {
      conflictEl.classList.add('hidden');
      conflictEl.innerHTML = '';
    }
  }
  ['#ap-date', '#ap-time', '#ap-end'].forEach((sel) =>
    overlay.querySelector(sel).addEventListener('input', checkConflicts)
  );
  checkConflicts();

  overlay.querySelector('#ap-confirm').addEventListener('click', async () => {
    const date = overlay.querySelector('#ap-date').value;
    errEl.classList.add('hidden');
    if (!date) {
      errEl.textContent = 'Indica a data do atendimento.';
      errEl.classList.remove('hidden');
      return;
    }
    const payload = {
      player_id: playerId,
      episode_id: overlay.querySelector('#ap-episode').value || null,
      type: overlay.querySelector('#ap-type').value,
      status: overlay.querySelector('#ap-status').value,
      date,
      time: overlay.querySelector('#ap-time').value || null,
      end_time: overlay.querySelector('#ap-end').value || null,
      location: overlay.querySelector('#ap-location').value.trim() || null,
      notes: overlay.querySelector('#ap-notes').value.trim() || null,
    };

    const btn = overlay.querySelector('#ap-confirm');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      if (existing) await updateRow('physio_appointments', 'appointments', existing.id, payload);
      else await createRow('physio_appointments', 'appointments', payload);
      close();
      onSaved?.();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = existing ? 'Guardar' : 'Marcar';
    }
  });
}

async function removeEpisode(id, onSaved) {
  const ep = state.clinicalEpisodes.find((e) => e.id === id);
  const n = episodeSessions(id).length;
  const extra = n ? ` As ${n} sessão(ões) associadas também serão removidas.` : '';
  const ok = await confirmDialog(`Remover o episódio "${ep?.title}"?${extra}`);
  if (!ok) return;
  try {
    await deleteRow('clinical_episodes', 'clinicalEpisodes', id);
    onSaved?.();
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function removeSession(id, onSaved) {
  const ok = await confirmDialog('Apagar esta sessão?');
  if (!ok) return;
  try {
    await deleteRow('clinical_sessions', 'clinicalSessions', id);
    onSaved?.();
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function removeAppointment(id, onSaved) {
  const ok = await confirmDialog('Remover este atendimento?');
  if (!ok) return;
  try {
    await deleteRow('physio_appointments', 'appointments', id);
    onSaved?.();
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
