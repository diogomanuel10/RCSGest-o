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

import { state, regeneratePlayerQr, createInvitation, dbErrorMessage } from '../store.js';
import { esc, euros } from '../ui.js';
import { confirmDialog } from '../modal.js';
import { toastError, toastOk } from '../toast.js';
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
  playerGameShare,
  sport,
  playerAge,
  nextBirthday,
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
import { canAccess, canEdit, canManageUsers } from '../permissions.js';
import { renderClinicalInto } from './clinical-file.js';
import { renderPhysicalInto } from './physical-file.js';
import { renderDocumentsInto } from './documents-section.js';

// Nascimento na ficha: a data completa quando existe (com a idade e o próximo
// aniversário), e o ano quando é só o que se sabe. Não se escreve "—" para
// uma coisa que alguém tem de ir preencher: mostra-se o que falta.
function birthLine(player) {
  const idade = playerAge(player);
  const next = nextBirthday(player);
  if (player.birth_date) {
    const quando = next?.days === 0
      ? ' · faz anos hoje 🎂'
      : next && next.days <= 30
        ? ` · faz ${next.turning} em ${next.days} dia${next.days === 1 ? '' : 's'}`
        : '';
    return `${fmtDate(player.birth_date)}${idade ? ` · ${idade.age} anos` : ''}${quando}`;
  }
  if (player.birth_year) return `${player.birth_year} (falta o dia)`;
  return '';
}

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// --- Navegação para o perfil (página inteira, sem modal) ------------------
// O app-shell regista aqui como abrir o perfil; assim o perfil é desenhado no
// conteúdo principal (integrado na navegação) e sobrevive às atualizações.
let _opener = null;
let _activeTab = 'geral';

export function registerProfileOpener(fn) { _opener = fn; }

function allowedTabs() {
  const tabs = [{ key: 'geral', label: 'Geral' }];
  if (canAccess('medico')) tabs.push({ key: 'fisioterapia', label: 'Fisioterapia' });
  if (canAccess('fisica')) tabs.push({ key: 'fisica', label: 'Prep. física' });
  return tabs;
}

// Ponto de entrada usado em toda a app. `onEdit` (opcional) edita os dados base
// (Plantéis); `tab` define o separador inicial. Delega no app-shell, que mostra
// o perfil como página.
export function openAthleteProfile(playerId, opts = {}) {
  const tabs = allowedTabs();
  _activeTab = tabs.some((t) => t.key === opts.tab) ? opts.tab : 'geral';
  if (_opener) _opener(playerId, opts);
}

// Renderiza o perfil (página inteira) no `container`. Chamado pelo app-shell
// (paint), por isso o separador ativo persiste através de `_activeTab`.
export function renderAthleteProfilePage(container, playerId, { onEdit, onBack } = {}) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) { onBack?.(); return; }

  const tabs = allowedTabs();
  if (!tabs.some((t) => t.key === _activeTab)) _activeTab = 'geral';

  const initials = (player.name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  container.innerHTML = `
    <div class="athlete-page">
      <header class="page-head ap-page-head">
        <div class="ap-head">
          <button class="btn btn--ghost btn--sm" data-ap-back type="button">← Voltar</button>
          <span class="pd-avatar" aria-hidden="true">${esc(initials || '?')}</span>
          <div>
            <strong class="pd-hero__name">${esc(player.name)}</strong>
            <span class="muted pd-hero__meta">${headMeta(player)}</span>
          </div>
        </div>
        <div class="row" style="gap:0.4rem">
          <button class="btn btn--ghost" data-ap-report type="button">Ficha (imprimir)</button>
          ${onEdit ? '<button class="btn btn--primary" data-ap-edit type="button">Editar dados</button>' : ''}
        </div>
      </header>

      <div class="ap-tabs" role="tablist">
        ${tabs.map((t) => `<button class="ap-tab ${t.key === _activeTab ? 'ap-tab--active' : ''}" data-tab="${t.key}" type="button" role="tab">${esc(t.label)}</button>`).join('')}
      </div>

      <div class="ap-body" data-ap-body></div>
    </div>
  `;

  const body = container.querySelector('[data-ap-body]');

  function paintTab() {
    container.querySelectorAll('[data-tab]').forEach((b) =>
      b.classList.toggle('ap-tab--active', b.dataset.tab === _activeTab)
    );
    if (_activeTab === 'fisioterapia') renderClinicalInto(body, playerId, {});
    else if (_activeTab === 'fisica') renderPhysicalInto(body, playerId, {});
    else renderGeral(body, playerId);
  }

  container.querySelector('[data-ap-back]')?.addEventListener('click', () => onBack?.());
  container.querySelector('[data-ap-edit]')?.addEventListener('click', () => onEdit?.());
  // Ficha imprimível: só inclui as secções que quem a gera já podia ver na
  // app. O módulo é um chunk à parte, carregado a pedido.
  container.querySelector('[data-ap-report]')?.addEventListener('click', async () => {
    try {
      const { openAthleteReport } = await import('../athlete-report.js');
      openAthleteReport(playerId);
    } catch (err) {
      toastError(err.message || 'Não foi possível gerar a ficha.');
    }
  });
  container.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { _activeTab = b.dataset.tab; paintTab(); })
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

function renderGeral(container, playerId, _opts = {}) {
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
  // Participação em jogo. No voleibol conta-se em pontos (não há relógio); a
  // percentagem só existe se houver parciais registados, que são o denominador.
  const emPontos = sport() === 'voleibol';
  const share = playerGameShare(playerId);

  container.innerHTML = `
    <div class="med-stats" style="margin-bottom:0.6rem">
      <span class="badge badge--${AVAILABILITY_BADGE[status] || 'muted'}">${esc(AVAILABILITY_LABEL[status] || status)}</span>
      ${av?.expected_return ? `<span class="badge badge--muted">Retorno: ${esc(fmtDate(av.expected_return))}</span>` : ''}
      <span class="badge badge--${REVIEW_BADGE[review] || 'muted'}">${esc(REVIEW_LABEL[review] || review)}</span>
    </div>
    ${av?.limitations ? `<div class="pd-notes"><span class="pd-label">Limitações ao treino</span><p>${esc(av.limitations)}</p></div>` : ''}

    <div class="pd-grid">
      ${dataItem('Nascimento', birthLine(player))}
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

    ${share.jogos
      ? `<div class="pd-section">
           <span class="pd-label">Participação em jogo</span>
           <div class="pd-grid">
             ${dataItem(emPontos ? 'Pontos jogados' : 'Minutos jogados', String(share.jogados))}
             ${dataItem('Do total disputado', share.share != null ? share.share + '%' : '')}
             ${dataItem('Jogos com registo', String(share.jogos))}
           </div>
         </div>`
      : ''}

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

    ${player.qr_token && canEdit('players')
      ? `<div class="pd-section" id="ap-qr">
           <span class="pd-label">Cartão QR</span>
           <div class="pd-qr">
             <div class="pd-qr__code" id="ap-qr-code" aria-label="Código QR do atleta"></div>
             <div class="pd-qr__side">
               <p class="muted" style="margin:0 0 0.5rem;font-size:0.85rem">
                 Passar este código no quiosque à entrada regista a presença no
                 treino a decorrer.
               </p>
               <div class="row row--wrap" style="gap:0.5rem">
                 <button class="btn btn--ghost btn--sm" type="button" id="ap-qr-print">Imprimir cartão</button>
                 <button class="btn btn--ghost btn--sm" type="button" id="ap-qr-new">Emitir cartão novo</button>
               </div>
             </div>
           </div>
         </div>`
      : ''}

    ${canManageUsers() ? portalAccessHTML(player) : ''}

    ${canEdit('documents') ? '<div id="ap-docs-placeholder"></div>' : ''}
  `;

  const docsEl = container.querySelector('#ap-docs-placeholder');
  if (docsEl) renderDocumentsInto(docsEl, playerId);
  if (container.querySelector('#ap-qr')) wireQrCard(container, player, team);
  if (container.querySelector('#ap-portal')) wirePortalAccess(container, player);
}

// --- Acesso ao portal -----------------------------------------------------
// O convite nasce AQUI, na ficha do atleta, e não na lista de utilizadores.
// A diferença é toda: aqui o coordenador escolhe a pessoa pelo NOME, numa
// ficha que já conhece. Na lista de utilizadores só há emails — e ligar a
// conta errada dá ao atleta as presenças, as quotas e o cartão QR de outro.
function portalAccessHTML(player) {
  const linked = !!player.user_id;
  const invite = (state.invitations || []).find(
    (i) => i.player_id === player.id && !i.used_at && new Date(i.expires_at) > new Date()
  );

  return `
    <div class="pd-section" id="ap-portal">
      <span class="pd-label">Acesso ao portal</span>
      ${linked
        ? `<p class="muted" style="margin:0.3rem 0 0;font-size:0.86rem">
             <span class="badge badge--ok">Conta ligada</span>
             Este atleta já entra na app e vê a sua página pessoal.
           </p>`
        : `<p class="muted" style="margin:0.3rem 0 0.6rem;font-size:0.86rem">
             ${invite
               ? 'Já há um convite por usar. O link liga a conta a esta ficha — quem o abrir fica a ser este atleta.'
               : 'Gera um link de convite para este atleta entrar na app. O link já vem ligado a esta ficha, por isso não há contas trocadas.'}
           </p>
           <div class="row row--wrap" style="gap:0.5rem">
             <button class="btn btn--ghost btn--sm" type="button" id="ap-portal-invite">
               ${invite ? 'Gerar link novo' : 'Convidar para o portal'}
             </button>
             ${invite ? '<button class="btn btn--ghost btn--sm" type="button" id="ap-portal-copy">Copiar link</button>' : ''}
           </div>
           <p class="pd-invite-link hidden" id="ap-portal-link"></p>`}
    </div>
  `;
}

function wirePortalAccess(container, player) {
  const linkEl = container.querySelector('#ap-portal-link');
  const showLink = (token) => {
    const url = `${window.location.origin}${window.location.pathname}?invite=${token}`;
    linkEl.textContent = url;
    linkEl.classList.remove('hidden');
    navigator.clipboard?.writeText(url).then(
      () => toastOk('Link copiado. Envia-o a este atleta.'),
      () => toastOk('Link gerado — copia-o abaixo.')
    );
  };

  container.querySelector('#ap-portal-copy')?.addEventListener('click', () => {
    const invite = (state.invitations || []).find(
      (i) => i.player_id === player.id && !i.used_at
    );
    if (invite) showLink(invite.token);
  });

  container.querySelector('#ap-portal-invite')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'A gerar…';
    try {
      // Papel e permissões vêm do servidor (força 'atleta'); aqui só se diz
      // de que atleta se trata.
      const inv = await createInvitation('atleta', [], null, player.id);
      showLink(inv.token);
    } catch (err) {
      toastError(dbErrorMessage(err));
      btn.disabled = false;
      btn.textContent = 'Convidar para o portal';
    }
  });
}

// Cartão QR do atleta: pré-visualização, impressão de um cartão avulso e
// emissão de um token novo (o que se faz quando um cartão se perde — o antigo
// deixa de registar presenças).
async function wireQrCard(container, player, team) {
  const codeEl = container.querySelector('#ap-qr-code');
  const { qrSvg, qrPayload, newQrToken } = await import('../qrcode.js');
  try {
    codeEl.innerHTML = await qrSvg(qrPayload(player));
  } catch {
    codeEl.innerHTML = '<span class="muted">Não foi possível desenhar o código.</span>';
  }

  container.querySelector('#ap-qr-print')?.addEventListener('click', async () => {
    try {
      const { openQrCards } = await import('../players-qr.js');
      await openQrCards([player], team);
    } catch (err) {
      toastError(err?.message || 'Não foi possível gerar o cartão.');
    }
  });

  container.querySelector('#ap-qr-new')?.addEventListener('click', async () => {
    const ok = await confirmDialog(
      `Emitir um cartão novo para ${player.name}? O cartão anterior deixa de registar presenças e tem de ser reimpresso.`,
      { confirmLabel: 'Emitir novo', danger: false }
    );
    if (!ok) return;
    try {
      await regeneratePlayerQr(player.id, newQrToken());
    } catch (err) {
      toastError(dbErrorMessage(err));
    }
  });
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
