// Perfil do Atleta — vista unificada do atleta, com separadores.
//
// Reúne num só sítio tudo o que diz respeito ao atleta, mostrando cada
// separador conforme as permissões de quem vê:
//   • Geral        — dados pessoais, equipa, avaliação, disponibilidade,
//                    dados físicos, presenças e quotas (visível a quem vê o atleta).
//   • Fisioterapia — ficha clínica (coordenador + fisioterapeuta).
//   • Prep. física — ficha física (coordenador + preparador físico).
//
// O treinador vê o separador Geral, que inclui um resumo de disponibilidade e
// limitações ao treino (sem aceder ao detalhe clínico), além da última
// avaliação física.

import { state } from '../store.js';
import { esc, euros } from '../ui.js';
import {
  teamById,
  teamName,
  teamCoaches,
  playerAttendanceStats,
  playerQuotas,
  playerAvailability,
  physicalProfile,
  bmi,
  playerTests,
} from '../compute.js';
import {
  REVIEW_LABEL,
  REVIEW_BADGE,
  ATTENDANCE_STATUSES,
  COACH_ROLE_LABEL,
  MONTHS,
  AVAILABILITY_LABEL,
  AVAILABILITY_BADGE,
  PHYSICAL_TEST_LABEL,
  PHYSICAL_TEST_UNIT,
} from '../constants.js';
import { canAccess } from '../permissions.js';
import { renderClinicalInto } from './clinical-file.js';
import { renderPhysicalInto } from './physical-file.js';

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// Abre o perfil do atleta. `onEdit` (opcional) edita os dados base (Plantéis);
// `tab` define o separador inicial ('geral' | 'fisioterapia' | 'fisica').
export function openAthleteProfile(playerId, { onEdit, tab } = {}) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;

  const tabs = [{ key: 'geral', label: 'Geral' }];
  if (canAccess('medico')) tabs.push({ key: 'fisioterapia', label: 'Fisioterapia' });
  if (canAccess('fisica')) tabs.push({ key: 'fisica', label: 'Prep. física' });

  let active = tabs.some((t) => t.key === tab) ? tab : 'geral';

  const initials = (player.name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card athlete-profile" role="dialog" aria-modal="true"
         aria-label="Perfil de ${esc(player.name)}" style="width:min(720px,96vw)">
      <div class="modal__head">
        <div class="ap-head">
          <span class="pd-avatar" aria-hidden="true">${esc(initials || '?')}</span>
          <div>
            <strong class="pd-hero__name">${esc(player.name)}</strong>
            <span class="muted pd-hero__meta">${headMeta(player)}</span>
          </div>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      <div class="ap-tabs" role="tablist">
        ${tabs.map((t) => `<button class="ap-tab ${t.key === active ? 'ap-tab--active' : ''}" data-tab="${t.key}" type="button" role="tab">${esc(t.label)}</button>`).join('')}
      </div>

      <div class="ap-body" data-ap-body></div>

      <div class="modal__actions">
        <button class="btn btn--ghost" data-ap-close type="button">Fechar</button>
        ${onEdit ? '<button class="btn btn--primary" data-ap-edit type="button">Editar dados</button>' : ''}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  overlay.querySelector('.modal__close').focus();

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('[data-ap-close]').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-ap-edit]')?.addEventListener('click', () => { close(); onEdit(); });

  const body = overlay.querySelector('[data-ap-body]');

  function paintTab() {
    overlay.querySelectorAll('[data-tab]').forEach((b) =>
      b.classList.toggle('ap-tab--active', b.dataset.tab === active)
    );
    if (active === 'fisioterapia') renderClinicalInto(body, playerId, {});
    else if (active === 'fisica') renderPhysicalInto(body, playerId, {});
    else renderGeral(body, playerId);
  }

  overlay.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { active = b.dataset.tab; paintTab(); })
  );

  paintTab();
}

function headMeta(player) {
  const team = teamById(player.team_id);
  return [
    player.number ? `Nº ${esc(player.number)}` : 'Sem número',
    player.position ? esc(player.position) : '',
    team ? esc(teamName(team)) : '',
  ].filter(Boolean).join(' · ');
}

// --- Separador Geral ------------------------------------------------------

function renderGeral(container, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  const team = teamById(player.team_id);
  const coaches = team ? teamCoaches(team.id) : [];
  const att = playerAttendanceStats(playerId);
  const quotas = playerQuotas(playerId);
  const review = player.review_status || 'pendente';

  const av = playerAvailability(playerId);
  const status = av?.status || 'apto';
  const prof = physicalProfile(playerId);
  const imc = bmi(playerId);
  const lastTest = playerTests(playerId)[0];

  container.innerHTML = `
    <div class="med-stats" style="margin-bottom:0.6rem">
      <span class="badge badge--${AVAILABILITY_BADGE[status] || 'muted'}">${esc(AVAILABILITY_LABEL[status] || status)}</span>
      ${av?.expected_return ? `<span class="badge badge--muted">Retorno: ${esc(fmtDate(av.expected_return))}</span>` : ''}
      <span class="badge badge--${REVIEW_BADGE[review] || 'muted'}">${esc(REVIEW_LABEL[review] || review)}</span>
    </div>
    ${av?.limitations ? `<div class="pd-notes"><span class="pd-label">Limitações ao treino</span><p>${esc(av.limitations)}</p></div>` : ''}

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

    ${(prof?.height_cm || prof?.weight_kg || imc != null || lastTest)
      ? `<div class="pd-section">
           <span class="pd-label">Dados físicos</span>
           <div class="pd-grid">
             ${dataItem('Altura', prof?.height_cm ? `${prof.height_cm} cm` : '')}
             ${dataItem('Peso', prof?.weight_kg ? `${prof.weight_kg} kg` : '')}
             ${dataItem('IMC', imc != null ? String(imc) : '')}
             ${dataItem('Última avaliação', lastTest ? lastTestLabel(lastTest) : '')}
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
           <ul class="pd-quota-list">${quotas.list.slice(0, 8).map(quotaLine).join('')}</ul>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem quotas registadas.</p>'}
    </div>
  `;
}

function lastTestLabel(t) {
  const name = t.type === 'outro' && t.label ? t.label : PHYSICAL_TEST_LABEL[t.type] || t.type;
  const unit = t.unit || PHYSICAL_TEST_UNIT[t.type] || '';
  const val = t.value != null ? ` ${t.value}${unit ? ' ' + unit : ''}` : '';
  return `${name}${val} (${fmtDate(t.date)})`;
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
    </div>`;
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
    </li>`;
}
