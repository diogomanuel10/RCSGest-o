// Convites para o portal, para um plantel inteiro.
//
// Convidar atleta a atleta funciona para um caso isolado e falha para o uso
// real: dar acesso a um escalão são vinte fichas abertas, vinte cliques e
// vinte links copiados um a um — cada um a apagar o anterior do clipboard.
// Aqui geram-se todos de uma vez e, sobretudo, ENVIAM-SE: o contacto do
// encarregado já está na ficha, por isso cada linha tem o email ou o WhatsApp
// pronto a abrir, com o texto escrito. Quem não tem contacto entra na folha
// imprimível (um talão com QR por atleta), que é como isto chega aos escalões
// onde ninguém tem telemóvel.
//
// Os links continuam a ser um por atleta e ligados à ficha (é o servidor que
// o garante): não há aqui nenhum link "da equipa" que várias pessoas pudessem
// abrir, o que trocaria contas — exatamente o que o convite ligado à ficha
// existe para evitar.

import { state, createInvitationsBulk, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { toastOk, toastError } from '../toast.js';
import { teamName } from '../compute.js';
import { branding } from '../branding.js';

// Link de convite a partir do token (mesma origem/caminho da app).
export function inviteLink(token) {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

// Convite pendente e ainda válido de um atleta (o expirado não conta: o link
// existe mas já não abre nada).
function pendingInvite(playerId) {
  return (state.invitations || []).find(
    (i) => i.player_id === playerId && !i.used_at && new Date(i.expires_at) > new Date()
  );
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

// O contacto do encarregado é texto livre (a ficha aceita "telefone ou email").
// Adivinha-se o canal para dar o botão certo — e não se adivinha mais nada:
// sem contacto reconhecível, a linha fica só com o link para copiar.
function contactChannel(raw) {
  const v = (raw || '').trim();
  if (!v) return null;
  if (v.includes('@')) return { kind: 'email', value: v.toLowerCase() };
  const digits = v.replace(/\D/g, '');
  if (digits.length < 9) return null;
  // O wa.me exige indicativo. Nove dígitos sem indicativo é um número
  // português; qualquer coisa maior já o traz.
  const intl = v.trim().startsWith('+') ? digits : digits.length === 9 ? `351${digits}` : digits;
  return { kind: 'phone', value: intl };
}

// Texto que segue com o link. Escrito para o encarregado de educação, que é
// quem recebe a mensagem na formação.
function inviteMessage(player, url, invite) {
  const club = branding().club_name || 'clube';
  return (
    `Olá! Este é o link de acesso de ${player.name} ao portal do ${club}: ${url}\n\n` +
    `Basta abrir o link, criar conta e fica logo ligado à ficha. ` +
    `O link é pessoal e válido até ${fmtDate(invite.expires_at)}.`
  );
}

// Abre o painel de convites de uma equipa.
export function openPortalInvites(teamId) {
  const team = state.teams.find((t) => t.id === teamId);
  const roster = state.players
    .filter((p) => p.team_id === teamId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card modal--wide" role="dialog" aria-modal="true" aria-labelledby="inv-title">
      <div class="modal__head">
        <h2 class="section-title" id="inv-title">Convidar para o portal — ${esc(teamName(team))}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div id="inv-body"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="inv-close" type="button">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#inv-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const body = overlay.querySelector('#inv-body');
  render();

  // Desenha (e redesenha, depois de gerar) o corpo do painel. Um atleta está
  // sempre num de três sítios: já entra na app, tem link por enviar, ou falta
  // gerar-lhe o link.
  function render() {
    const linked = roster.filter((p) => p.user_id);
    const ready = roster
      .filter((p) => !p.user_id && pendingInvite(p.id))
      .map((p) => ({ player: p, invite: pendingInvite(p.id) }));
    const todo = roster.filter((p) => !p.user_id && !pendingInvite(p.id));

    body.innerHTML = `
      ${roster.length ? '' : '<p class="muted">Esta equipa ainda não tem atletas.</p>'}

      ${todo.length ? `
        <div class="inv-block">
          <div class="inv-block__head">
            <h3 class="inv-block__title">Sem link (${todo.length})</h3>
            <button class="btn btn--link btn--sm" id="inv-toggle-all" type="button">Desmarcar todos</button>
          </div>
          <div class="coach-checks" id="inv-picks">
            ${todo.map((p) => `
              <label class="coach-check">
                <input type="checkbox" value="${p.id}" checked />
                <span>${esc(p.name)}</span>
              </label>`).join('')}
          </div>
          <div class="row row--wrap" style="gap:0.5rem;margin-top:0.6rem">
            <button class="btn btn--primary btn--sm" id="inv-generate" type="button">Gerar links</button>
          </div>
        </div>` : ''}

      ${ready.length ? `
        <div class="inv-block">
          <div class="inv-block__head">
            <h3 class="inv-block__title">Prontos a enviar (${ready.length})</h3>
            <div class="row row--wrap" style="gap:0.4rem">
              <button class="btn btn--ghost btn--sm" id="inv-copy-all" type="button">Copiar todos</button>
              <button class="btn btn--ghost btn--sm" id="inv-csv" type="button">Descarregar (.csv)</button>
              <button class="btn btn--ghost btn--sm" id="inv-print" type="button">Folha para imprimir</button>
            </div>
          </div>
          <div class="inv-list">
            ${ready.map((r) => inviteRowHTML(r)).join('')}
          </div>
        </div>` : ''}

      ${linked.length ? `
        <p class="muted" style="margin:0.8rem 0 0;font-size:0.85rem">
          ${linked.length === 1 ? '1 atleta já entra' : `${linked.length} atletas já entram`} na app
          e não precisa${linked.length === 1 ? '' : 'm'} de convite.
        </p>` : ''}
    `;

    wire(ready);
  }

  function inviteRowHTML({ player, invite }) {
    const url = inviteLink(invite.token);
    const ch = contactChannel(player.guardian_contact);
    const sendLabel = ch?.kind === 'email' ? 'Email' : ch?.kind === 'phone' ? 'WhatsApp' : '';
    return `
      <div class="inv-row" data-player="${player.id}">
        <div class="inv-row__main">
          <strong class="inv-row__name">${esc(player.name)}</strong>
          <span class="inv-row__meta muted">
            ${ch ? esc(player.guardian_contact) : 'Sem contacto na ficha'} · válido até ${esc(fmtDate(invite.expires_at))}
          </span>
          <code class="inv-row__link">${esc(url)}</code>
        </div>
        <div class="inv-row__actions">
          <button class="btn btn--ghost btn--sm" data-copy="${player.id}" type="button">Copiar</button>
          ${sendLabel ? `<button class="btn btn--accent btn--sm" data-send="${player.id}" type="button">${sendLabel}</button>` : ''}
        </div>
      </div>
    `;
  }

  function wire(ready) {
    const picks = () => [...body.querySelectorAll('#inv-picks input:checked')].map((c) => c.value);
    const rowOf = (id) => ready.find((r) => r.player.id === id);

    body.querySelector('#inv-toggle-all')?.addEventListener('click', (e) => {
      const boxes = [...body.querySelectorAll('#inv-picks input')];
      const on = boxes.some((b) => !b.checked);
      boxes.forEach((b) => { b.checked = on; });
      e.currentTarget.textContent = on ? 'Desmarcar todos' : 'Marcar todos';
    });

    body.querySelector('#inv-generate')?.addEventListener('click', async (e) => {
      const ids = picks();
      if (!ids.length) {
        toastError('Escolhe pelo menos um atleta.');
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'A gerar…';
      try {
        const rows = await createInvitationsBulk(ids);
        // Zero links não é um erro do servidor: são atletas que entretanto já
        // tinham conta. Dizer "0 links gerados" deixava o coordenador à espera
        // de uma lista que não vai aparecer.
        if (rows.length) {
          toastOk(`${rows.length} link${rows.length === 1 ? '' : 's'} de convite ${rows.length === 1 ? 'gerado' : 'gerados'}.`);
        } else {
          toastError('Nenhum link gerado — estes atletas já têm conta na app.');
        }
        render();
      } catch (err) {
        toastError(dbErrorMessage(err));
        btn.disabled = false;
        btn.textContent = 'Gerar links';
      }
    });

    body.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = rowOf(btn.dataset.copy);
        if (!r) return;
        copy(inviteLink(r.invite.token), 'Link copiado.');
      });
    });

    // O envio abre a app do canal com o texto já escrito. Não se envia nada
    // pelas costas do coordenador: quem carrega em "Enviar" vê a mensagem
    // antes de a mandar.
    body.querySelectorAll('[data-send]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = rowOf(btn.dataset.send);
        if (!r) return;
        const ch = contactChannel(r.player.guardian_contact);
        const text = inviteMessage(r.player, inviteLink(r.invite.token), r.invite);
        const href = ch.kind === 'email'
          ? `mailto:${encodeURIComponent(ch.value)}?subject=${encodeURIComponent(
              `Acesso ao portal — ${r.player.name}`
            )}&body=${encodeURIComponent(text)}`
          : `https://wa.me/${ch.value}?text=${encodeURIComponent(text)}`;
        window.open(href, '_blank');
      });
    });

    body.querySelector('#inv-copy-all')?.addEventListener('click', () => {
      const text = ready
        .map((r) => `${r.player.name}: ${inviteLink(r.invite.token)}`)
        .join('\n');
      copy(text, `${ready.length} link${ready.length === 1 ? '' : 's'} ${ready.length === 1 ? 'copiado' : 'copiados'}.`);
    });

    body.querySelector('#inv-csv')?.addEventListener('click', () => downloadCsv(ready, team));

    body.querySelector('#inv-print')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'A gerar…';
      try {
        const { openInviteSlips } = await import('../invite-slips.js');
        await openInviteSlips(
          ready.map((r) => ({ player: r.player, url: inviteLink(r.invite.token), expiresAt: r.invite.expires_at })),
          team
        );
      } catch (err) {
        toastError(err?.message || 'Não foi possível gerar a folha.');
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  }
}

function copy(text, okMsg) {
  navigator.clipboard?.writeText(text).then(
    () => toastOk(okMsg),
    () => toastError('O browser não deixou copiar. Seleciona o link e copia à mão.')
  );
}

// Lista em .csv, para quem prefere trabalhar os envios na folha de cálculo ou
// no email em massa. Ponto e vírgula e BOM: é o que o Excel em português abre
// sem perguntar nada nem estragar os acentos.
function downloadCsv(ready, team) {
  const esc4 = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Atleta', 'Contacto', 'Link', 'Válido até'].map(esc4).join(';')];
  ready.forEach((r) => {
    lines.push([
      r.player.name,
      r.player.guardian_contact || '',
      inviteLink(r.invite.token),
      fmtDate(r.invite.expires_at),
    ].map(esc4).join(';'));
  });

  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `convites-${(teamName(team) || 'equipa').toLowerCase().replace(/\s+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
