// Ficha do atleta: modal que reúne tudo num só sítio — dados pessoais,
// equipa e treinadores, avaliação para a próxima época, estatística de
// presenças e o histórico de quotas. Só de leitura; o botão "Editar" delega
// no formulário dos Plantéis (callback onEdit).

import { state } from '../store.js';
import { esc, euros } from '../ui.js';
import {
  teamById,
  teamName,
  teamCoaches,
  playerAttendanceStats,
  playerQuotas,
} from '../compute.js';
import {
  REVIEW_LABEL,
  REVIEW_BADGE,
  ATTENDANCE_STATUSES,
  COACH_ROLE_LABEL,
  MONTHS,
} from '../constants.js';
import { canEdit } from '../permissions.js';
import { openClinicalFile } from './clinical-file.js';
import { openPhysicalFile } from './physical-file.js';

// Abre a ficha do atleta. `onEdit` (opcional) é chamado ao clicar em Editar.
export function openPlayerDetail(playerId, { onEdit } = {}) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;

  const team = teamById(player.team_id);
  const coaches = team ? teamCoaches(team.id) : [];
  const att = playerAttendanceStats(playerId);
  const quotas = playerQuotas(playerId);

  const review = player.review_status || 'pendente';
  const initials = (player.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card player-detail" role="dialog" aria-modal="true"
         aria-label="Ficha de ${esc(player.name)}" style="width:min(620px,96vw)">
      <div class="modal__head">
        <h2 class="section-title">Ficha do atleta</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      <div class="pd-hero">
        <span class="pd-avatar" aria-hidden="true">${esc(initials || '?')}</span>
        <div class="pd-hero__info">
          <strong class="pd-hero__name">${esc(player.name)}</strong>
          <span class="muted pd-hero__meta">
            ${player.number ? `Nº ${esc(player.number)}` : 'Sem número'}
            ${player.position ? ` · ${esc(player.position)}` : ''}
            ${team ? ` · ${esc(teamName(team))}` : ''}
          </span>
        </div>
        <span class="badge badge--${REVIEW_BADGE[review] || 'muted'} pd-hero__review">
          ${esc(REVIEW_LABEL[review] || review)}
        </span>
      </div>

      <div class="pd-grid">
        ${dataItem('Ano de nascimento', player.birth_year)}
        ${dataItem('Nº de federado', player.federation_number)}
        ${dataItem('Contacto do encarregado', player.guardian_contact)}
        ${dataItem('Posição', player.position)}
      </div>
      ${player.notes ? `<div class="pd-notes"><span class="pd-label">Observações</span><p>${esc(player.notes)}</p></div>` : ''}

      ${coaches.length
        ? `<div class="pd-section">
             <span class="pd-label">Equipa técnica</span>
             <div class="pd-coaches">
               ${coaches.map((c) => `<span class="team-coach-chip">${esc(c.coach.name)}
                 <span class="badge badge--${c.role === 'principal' ? 'info' : 'muted'}">${esc(COACH_ROLE_LABEL[c.role] || c.role)}</span>
               </span>`).join('')}
             </div>
           </div>`
        : ''}

      <div class="pd-section">
        <span class="pd-label">Presenças nos treinos</span>
        ${att.total
          ? `<div class="pd-att">
               <div class="pd-att__pct">
                 <strong class="stat-pct ${pctClass(att.rate)}">${att.rate}%</strong>
                 <span class="muted">comparência em ${att.total} registo${att.total === 1 ? '' : 's'}</span>
               </div>
               <div class="pd-att__chips">
                 ${ATTENDANCE_STATUSES.map((s) => `<span class="badge badge--${s.badge}">${esc(s.label)}: ${att.counts[s.key]}</span>`).join('')}
                 ${att.semRegisto ? `<span class="badge badge--muted">Sem reg.: ${att.semRegisto}</span>` : ''}
               </div>
             </div>`
          : '<p class="muted" style="margin:0.3rem 0 0">Ainda sem registos de presença.</p>'}
      </div>

      <div class="pd-section">
        <span class="pd-label">Quotas</span>
        ${quotas.list.length
          ? `<div class="pd-quotas-head">
               ${quotas.owedCount
                 ? `<span class="badge badge--warn">${quotas.owedCount} por pagar · ${euros(quotas.owed)}</span>`
                 : '<span class="badge badge--ok">Tudo regularizado</span>'}
               <span class="badge badge--muted">${quotas.paidCount} pago${quotas.paidCount === 1 ? '' : 's'}</span>
             </div>
             <ul class="pd-quota-list">
               ${quotas.list.slice(0, 8).map(quotaLine).join('')}
             </ul>`
          : '<p class="muted" style="margin:0.3rem 0 0">Sem quotas registadas.</p>'}
      </div>

      <div class="modal__actions">
        <button class="btn btn--ghost" id="pd-close" type="button">Fechar</button>
        ${canEdit('clinical') ? '<button class="btn btn--ghost" id="pd-clinical" type="button">Ficha clínica</button>' : ''}
        ${canEdit('physical') ? '<button class="btn btn--ghost" id="pd-physical" type="button">Ficha física</button>' : ''}
        ${onEdit ? '<button class="btn btn--primary" id="pd-edit" type="button">Editar</button>' : ''}
      </div>
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
  overlay.querySelector('#pd-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#pd-edit')?.addEventListener('click', () => {
    close();
    onEdit();
  });
  overlay.querySelector('#pd-clinical')?.addEventListener('click', () => {
    close();
    openClinicalFile(playerId);
  });
  overlay.querySelector('#pd-physical')?.addEventListener('click', () => {
    close();
    openPhysicalFile(playerId);
  });
}

function pctClass(pct) {
  if (pct === null) return '';
  return pct >= 70 ? 'stat-pct--ok' : pct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger';
}

function dataItem(label, value) {
  return `
    <div class="pd-item">
      <span class="pd-label">${esc(label)}</span>
      <span class="pd-value">${value ? esc(value) : '—'}</span>
    </div>
  `;
}

function quotaLine(q) {
  const mes = MONTHS[q.mes - 1] || q.mes;
  const pagoEm = q.pago_em
    ? new Date(q.pago_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
    : null;
  return `
    <li class="pd-quota-row">
      <span class="pd-quota-row__when">${esc(mes)} ${q.ano}</span>
      <span class="pd-quota-row__valor">${euros(Number(q.valor || 0))}</span>
      ${q.pago
        ? `<span class="badge badge--ok">Pago${pagoEm ? ' · ' + pagoEm : ''}</span>`
        : '<span class="badge badge--warn">Pendente</span>'}
    </li>
  `;
}
