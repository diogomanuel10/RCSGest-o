// Vista: Utilizadores (papéis, vínculos e acessos). Visível só ao coordenador.
//   Papel       → o que pode fazer (leitura/treinador/coordenador/atleta).
//   Vínculo     → liga a conta a um registo de treinador ou de atleta.
//   Acessos     → que secções um treinador/leitura pode ver (configurável).

import {
  state,
  updateProfileRole,
  updateProfilePermissions,
  linkCoachToUser,
  linkPlayerToUser,
  createInvitation,
  revokeInvitation,
  deleteOrgMember,
  dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { wireDialog, openModal } from '../modal.js';
import { ROLES, ROLE_LABEL, SECTIONS, DEFAULT_TRAINER_SECTIONS, DEFAULT_FISIO_SECTIONS, DEFAULT_PREP_SECTIONS, DEFAULT_SECCIONISTA_SECTIONS, isCoordenador } from '../permissions.js';
import { planLimit, planLimitReached, currentPlan } from '../plans.js';

// --- Filtros (estado de UI, só nesta vista) --------------------------------
// Um clube com 120 atletas tem 120 perfis, e a lista agrupada por papel só
// resolve metade do problema: o grupo "Atleta" é o plantel inteiro. Procurar
// uma pessoa era abrir o grupo e ler 120 linhas de email — e `profiles` NÃO
// guarda nome, por isso ler emails é o pior caso possível (ninguém reconhece
// a Maria num `familia.costa@sapo.pt`).
//
// Daí a pesquisa procurar também no NOME da ficha vinculada: é o único sítio
// onde o nome da pessoa existe, e é por ele que o coordenador a procura.
// Vivem em variáveis do módulo, como os filtros das outras vistas — é estado
// de UI e não vai à base de dados.
let userSearch = '';
let userRoleFilter = '';
let userLinkFilter = '';   // '' | 'sem' | 'com'
let inviteSearch = '';

// Situação do vínculo de um perfil: a ficha ligada (treinador ou atleta) e se
// o papel dele sequer PEDE uma. Um perfil de leitura sem ficha está certo; um
// atleta sem ficha não vê nada no portal, e é isso que o filtro "Por vincular"
// serve para encontrar.
function linkInfo(p) {
  if (p.role === 'coordenador' || p.role === 'treinador') {
    return { needs: true, row: state.coaches.find((c) => c.user_id === p.id) || null };
  }
  if (p.role === 'atleta') {
    return { needs: true, row: state.players.find((pl) => pl.user_id === p.id) || null };
  }
  return { needs: false, row: null };
}

// Um perfil passa o filtro? A pesquisa cobre email e nome da ficha vinculada.
function profileMatches(p) {
  if (userRoleFilter && p.role !== userRoleFilter) return false;
  const { needs, row } = linkInfo(p);
  if (userLinkFilter === 'sem' && (!needs || row)) return false;
  if (userLinkFilter === 'com' && !row) return false;
  const q = userSearch.trim().toLowerCase();
  if (!q) return true;
  return `${p.email || ''} ${row?.name || ''}`.toLowerCase().includes(q);
}

// Acessos por omissão sugeridos ao convidar, por papel.
const DEFAULT_SECTIONS_BY_ROLE = {
  treinador: DEFAULT_TRAINER_SECTIONS,
  fisioterapeuta: DEFAULT_FISIO_SECTIONS,
  preparador: DEFAULT_PREP_SECTIONS,
  seccionista: DEFAULT_SECCIONISTA_SECTIONS,
  leitura: [],
};
// Papéis com acessos configuráveis por secção (mostram a lista no convite).
const CONFIGURABLE_ROLES = new Set(Object.keys(DEFAULT_SECTIONS_BY_ROLE));

// Constrói o link de convite a partir do token (mesma origem/caminho da app).
function inviteLink(token) {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

// Estado legível de um convite: usado, expirado ou pendente.
function inviteState(inv) {
  if (inv.used_at) return { key: 'usado', label: 'Usado', badge: 'muted' };
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return { key: 'expirado', label: 'Expirado', badge: 'danger' };
  }
  return { key: 'pendente', label: 'Pendente', badge: 'ok' };
}
import { teamName, teamById } from '../compute.js';

export function renderUtilizadores(container) {
  if (!isCoordenador()) {
    container.innerHTML = `
      <header class="page-head"><h1 class="section-title">Utilizadores</h1></header>
      ${emptyHTML('Só o coordenador pode gerir utilizadores.')}
    `;
    return;
  }

  const profiles = [...state.profiles].sort((a, b) =>
    (a.email || '').localeCompare(b.email || '')
  );
  const shown = profiles.filter(profileMatches);
  const filtering = Boolean(userSearch.trim() || userRoleFilter || userLinkFilter);

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Utilizadores</h1>
    </header>

    <section class="card">
      <p class="muted" style="margin-top:0">
        Define o papel de cada pessoa. Quem se regista começa em <strong>Leitura</strong>
        sem acesso a nada — escolhe os acessos para ele poder ver as secções.
        Treinadores devem ser vinculados ao respetivo registo. Para os
        <strong>atletas</strong>, convida-os a partir dos Plantéis: um a um na
        ficha (atleta → Acesso ao portal) ou o plantel inteiro de uma vez
        (equipa → <strong>Convidar para o portal</strong>). Em qualquer dos
        casos o link vai ligado à ficha certa e não há contas trocadas.
      </p>
      <div class="roles-legend">
        ${ROLES.map(
          (r) => `<span class="muted"><strong>${r.label}:</strong> ${esc(r.desc)}</span>`
        ).join('')}
      </div>

      ${profiles.length ? usersFilterHTML(profiles.length, shown.length) : ''}
      ${
        !profiles.length
          ? emptyHTML('Ainda não há outros utilizadores registados.')
          : shown.length
            ? usersGroupedHTML(shown, filtering)
            : emptyHTML('Nenhum utilizador corresponde ao filtro.')
      }
      <p class="settings-msg hidden" id="roles-msg"></p>
    </section>

    <section class="card">
      <header class="page-head" style="margin-bottom:0.6rem">
        <h2 class="section-title">Convites</h2>
        <button class="btn btn--primary btn--sm" id="invite-new" type="button">Criar convite</button>
      </header>
      <p class="muted" style="margin-top:0">
        Gera um link para convidares um treinador ou colaborador. Ele abre o
        link, cria conta e entra automaticamente neste clube, com o papel que
        escolheres. Os dados ficam sempre isolados dos outros clubes.
      </p>
      ${invitesFilterHTML()}
      <div id="invites-list">${invitesListHTML()}</div>
      <p class="settings-msg hidden" id="invites-msg"></p>
    </section>
  `;

  const msg = container.querySelector('#roles-msg');
  function showMsg(text, kind) {
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  }

  // Filtros. A pesquisa redesenha a vista e devolve o foco ao campo (mesma
  // solução dos Plantéis): sem isso, escrever a segunda letra já era noutro
  // sítio. O truque do valor limpo e reposto põe o cursor no fim.
  const searchEl = container.querySelector('#us-search');
  searchEl?.addEventListener('input', (e) => {
    userSearch = e.target.value;
    renderUtilizadores(container);
    const el = container.querySelector('#us-search');
    if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  });
  container.querySelector('#us-role')?.addEventListener('change', (e) => {
    userRoleFilter = e.target.value;
    renderUtilizadores(container);
  });
  container.querySelector('#us-link')?.addEventListener('change', (e) => {
    userLinkFilter = e.target.value;
    renderUtilizadores(container);
  });
  container.querySelector('#us-clear')?.addEventListener('click', () => {
    userSearch = '';
    userRoleFilter = '';
    userLinkFilter = '';
    renderUtilizadores(container);
  });

  const invSearchEl = container.querySelector('#inv-search');
  invSearchEl?.addEventListener('input', (e) => {
    inviteSearch = e.target.value;
    renderUtilizadores(container);
    const el = container.querySelector('#inv-search');
    if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  });

  // Eliminar uma conta. Irreversível — por isso o diálogo pede o email
  // escrito à mão (a mesma decisão do painel da plataforma: numa lista de
  // emails parecidos, lado a lado, um clique não distingue nomes).
  container.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = state.profiles.find((x) => x.id === btn.dataset.delUser);
      if (p) askDeleteUser(p, container);
    });
  });

  container.querySelectorAll('.role-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const role = e.target.value;
      const previous = state.profiles.find((p) => p.id === id)?.role;

      if (e.target.dataset.self && role !== 'coordenador') {
        const ok = confirm('Vais deixar de ser coordenador e perdes o acesso de gestão. Continuar?');
        if (!ok) { e.target.value = previous; return; }
      }

      e.target.disabled = true;
      try {
        await updateProfileRole(id, role);
        // Ao tornar-se treinador sem acessos definidos, sugere os de base.
        const before = state.profiles.find((p) => p.id === id);
        const hadPerms = Array.isArray(before?.permissions) && before.permissions.length > 0;
        if (role === 'treinador' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_TRAINER_SECTIONS]);
        }
        // O fisioterapeuta tem sempre o Departamento Médico; sugere também as
        // secções de apoio (calendário, plantéis) se ainda não tiver acessos.
        if (role === 'fisioterapeuta' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_FISIO_SECTIONS]);
        }
        // O preparador físico tem sempre a Preparação Física; sugere também as
        // secções de apoio (calendário/mapa de jogos, plantéis).
        if (role === 'preparador' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_PREP_SECTIONS]);
        }
        // O seccionista tem acessos configuráveis; sugere as secções
        // administrativas de base se ainda não tiver nada definido.
        if (role === 'seccionista' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_SECCIONISTA_SECTIONS]);
        }
        // Redesenha a vista inteira: mudar de papel muda o GRUPO em que a
        // pessoa aparece, além do vínculo e dos acessos. Corrigir só a linha
        // deixava um treinador listado debaixo de "Leitura".
        renderUtilizadores(container);
        const newMsg = container.querySelector('#roles-msg');
        if (newMsg) {
          newMsg.textContent = `Papel atualizado para ${ROLE_LABEL[role]}.`;
          newMsg.className = 'settings-msg settings-msg--ok';
        }
        return;
      } catch (err) {
        e.target.value = previous;
        showMsg(dbErrorMessage(err), 'error');
      } finally {
        e.target.disabled = false;
      }
    });
  });

  container.querySelectorAll('[data-link-wrap]').forEach(wireLink);
  container.querySelectorAll('[data-acc-wrap]').forEach(wireAccess);

  // --- Convites ---
  const invMsg = container.querySelector('#invites-msg');
  function showInvMsg(text, kind) {
    invMsg.textContent = text;
    invMsg.className = `settings-msg settings-msg--${kind}`;
  }

  container.querySelector('#invite-new')?.addEventListener('click', () => {
    // Limite de utilizadores do plano: conta os perfis do clube + convites por
    // usar. Ao atingir o teto, sugere upgrade em vez de criar mais.
    const pendentes = (state.invitations || []).filter((i) => !i.used_at && (!i.expires_at || new Date(i.expires_at) >= new Date())).length;
    const usados = state.profiles.length;
    if (planLimitReached('users', usados + pendentes)) {
      showInvMsg(
        `Atingiste o limite de utilizadores do plano ${currentPlan().name} (${planLimit('users')}). ` +
        'Faz upgrade do plano para convidares mais pessoas.',
        'error'
      );
      return;
    }
    openInviteModal((inv) => showInviteLinkModal(inv));
  });

  container.querySelectorAll('[data-invite-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyToClipboard(inviteLink(btn.dataset.inviteCopy), btn));
  });

  container.querySelectorAll('[data-invite-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const inv = state.invitations.find((i) => i.id === btn.dataset.inviteRevoke);
      if (!inv) return;
      if (!confirm('Revogar este convite? O link deixa de funcionar.')) return;
      btn.disabled = true;
      try {
        await revokeInvitation(inv.id);
        showInvMsg('Convite revogado.', 'ok');
      } catch (err) {
        showInvMsg(dbErrorMessage(err), 'error');
        btn.disabled = false;
      }
    });
  });

  function wireLink(wrap) {
    if (!wrap) return;
    const sel = wrap.querySelector('.link-select');
    if (!sel) return;
    sel.addEventListener('change', async (e) => {
      const kind = e.target.dataset.kind; // 'coach' | 'player'
      const targetId = e.target.value;
      const userId = e.target.dataset.userid;
      const previous = e.target.dataset.prev;
      e.target.disabled = true;
      try {
        const linkFn = kind === 'coach' ? linkCoachToUser : linkPlayerToUser;
        if (targetId) {
          await linkFn(targetId, userId);
          e.target.dataset.prev = targetId;
          showMsg('Vínculo guardado.', 'ok');
        } else if (previous) {
          await linkFn(previous, null);
          e.target.dataset.prev = '';
          showMsg('Vínculo removido.', 'ok');
        }
      } catch (err) {
        e.target.value = previous;
        showMsg(dbErrorMessage(err), 'error');
      } finally {
        e.target.disabled = false;
      }
    });
  }

  function wireAccess(wrap) {
    if (!wrap) return;
    const btn = wrap.querySelector('[data-acc-config]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const profile = state.profiles.find((p) => p.id === btn.dataset.accConfig);
      openAccessModal(profile, () => {
        // Após guardar, refresca o resumo do botão.
        wrap.innerHTML = accessControl(state.profiles.find((p) => p.id === profile.id));
        wireAccess(wrap);
        showMsg('Acessos atualizados.', 'ok');
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Lista de utilizadores, agrupada
// ---------------------------------------------------------------------------
// Uma lista corrida de emails ordenada alfabeticamente responde à pergunta
// errada. Ninguém procura "quem é o abc@gmail"; procura-se "quem são os meus
// treinadores" ou "quem é que ainda está em Leitura sem acessos nenhuns" — e
// num clube com trinta contas isso obrigava a ler o papel linha a linha.
// Os grupos são por papel, colapsáveis (`<details>`), e o rodapé de cada um
// diz quantas contas tem: o coordenador abre o grupo que lhe interessa e
// fecha o resto.
//
// Os grupos grandes começam fechados de propósito — "Atleta" costuma ser o
// plantel inteiro, e aberto empurrava tudo o resto para fora do ecrã. No
// telemóvel a tabela de cada grupo empilha-se em cartões (`.table--stack`).
const GROUP_OPEN_LIMIT = 12;

// Barra de filtros da lista de utilizadores. Mostra sempre quantos estão à
// vista de quantos há: um filtro que esconde 118 linhas sem o dizer parece um
// ecrã vazio, e o coordenador conclui que perdeu as contas todas.
function usersFilterHTML(total, shown) {
  const filtering = Boolean(userSearch.trim() || userRoleFilter || userLinkFilter);
  return `
    <div class="filter-bar">
      <div class="field field--grow">
        <label for="us-search">Pesquisar</label>
        <input type="search" id="us-search" placeholder="Email ou nome da ficha…" value="${esc(userSearch)}" />
      </div>
      <div class="field">
        <label for="us-role">Papel</label>
        <select id="us-role">
          <option value="">Todos os papéis</option>
          ${ROLES.map((r) => `<option value="${r.key}" ${userRoleFilter === r.key ? 'selected' : ''}>${ROLE_LABEL[r.key]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="us-link">Vínculo</label>
        <select id="us-link">
          <option value="">Todos</option>
          <option value="sem" ${userLinkFilter === 'sem' ? 'selected' : ''}>Por vincular</option>
          <option value="com" ${userLinkFilter === 'com' ? 'selected' : ''}>Vinculados</option>
        </select>
      </div>
      ${filtering
        ? `<div class="field"><button class="btn btn--ghost btn--sm" id="us-clear" type="button">Limpar filtros</button></div>`
        : ''}
      <span class="filters__count muted">${shown} de ${total}</span>
    </div>`;
}

// Filtro dos convites: a lista cresce com cada convite ao portal — um escalão
// convidado em lote são vinte linhas de uma vez, e uma época são centenas.
// Procura pelo email do convite ou pelo nome do atleta a que está ligado.
function invitesFilterHTML() {
  if ((state.invitations || []).length < 8) return '';
  return `
    <div class="filter-bar">
      <div class="field field--grow">
        <label for="inv-search">Pesquisar convite</label>
        <input type="search" id="inv-search" placeholder="Email ou nome do atleta…" value="${esc(inviteSearch)}" />
      </div>
    </div>`;
}

// Um convite passa o filtro? (email do convite ou nome do atleta ligado)
function inviteMatches(inv) {
  const q = inviteSearch.trim().toLowerCase();
  if (!q) return true;
  const player = inv.player_id ? state.players.find((p) => p.id === inv.player_id) : null;
  return `${inv.email || ''} ${player?.name || ''}`.toLowerCase().includes(q);
}

// `filtering` abre TODOS os grupos: quem pesquisou já disse o que procura, e
// ter de abrir à mão o grupo onde o resultado caiu é repetir o mesmo trabalho.
function usersGroupedHTML(profiles, filtering = false) {
  // A ordem dos grupos é a de ROLES (do mais poderoso ao mais restrito) e não
  // a alfabética: é assim que se lê uma estrutura de clube.
  const groups = ROLES
    .map((r) => ({ role: r, list: profiles.filter((p) => p.role === r.key) }))
    .filter((g) => g.list.length);

  // Papéis desconhecidos (uma migração antiga, um valor à mão na BD) não podem
  // simplesmente desaparecer da lista.
  const known = new Set(ROLES.map((r) => r.key));
  const orfaos = profiles.filter((p) => !known.has(p.role));
  if (orfaos.length) groups.push({ role: { key: '', label: 'Outros' }, list: orfaos });

  return groups.map((g) => `
    <details class="group" ${filtering || g.list.length <= GROUP_OPEN_LIMIT ? 'open' : ''}>
      <summary class="group__head">
        <span class="group__title">${esc(g.role.label)}</span>
        <span class="group__count">${g.list.length}</span>
      </summary>
      <div class="table-wrap"><table class="users-table">
        <thead><tr><th>Email</th><th>Papel</th><th>Vínculo</th><th>Acessos</th><th>Conta</th></tr></thead>
        <tbody>${g.list.map(userRow).join('')}</tbody>
      </table></div>
    </details>
  `).join('');
}

function userRow(p) {
  return `
    <tr>
      <td>
        <strong>${esc(p.email || '—')}</strong>
        ${p.id === state.profile?.id ? '<span class="badge badge--muted">tu</span>' : ''}
      </td>
      <td>
        <select class="role-select" data-id="${p.id}"${p.id === state.profile?.id ? ' data-self="1"' : ''}>
          ${ROLES.map(
            (r) => `<option value="${r.key}" ${p.role === r.key ? 'selected' : ''}>${ROLE_LABEL[r.key]}</option>`
          ).join('')}
        </select>
      </td>
      <td><div data-link-wrap="${p.id}">${linkControl(p)}</div></td>
      <td><div data-acc-wrap="${p.id}">${accessControl(p)}</div></td>
      <td>${deleteControl(p)}</td>
    </tr>
  `;
}

// Botão de eliminar a conta — ou a razão por que não há botão nenhum.
//
// Duas contas não se eliminam daqui, e dizer PORQUÊ vale mais do que uma
// célula vazia (um botão em falta lê-se como uma avaria): a própria, e a
// dona do clube. É a mesma lista de salvaguardas que o servidor impõe em
// `delete_org_member` — aqui só se explica, lá é que se garante.
function deleteControl(p) {
  if (p.id === state.profile?.id) {
    return '<span class="muted" style="font-size:0.8rem">A tua conta</span>';
  }
  if (state.org?.owner_id && p.id === state.org.owner_id) {
    return '<span class="muted" style="font-size:0.8rem">Dona do clube</span>';
  }
  return `<button class="btn btn--danger btn--sm" data-del-user="${p.id}" type="button">Eliminar</button>`;
}

// Eliminar uma conta: pede o email escrito à mão e diz o que fica para trás.
//
// A gravação corre DENTRO do onSubmit para o erro do servidor ("esta conta é
// a dona do clube", "não podes eliminar a tua própria conta") aparecer no
// próprio formulário, e não num toast que desaparece.
function askDeleteUser(profile, container) {
  const { row } = linkInfo(profile);
  const email = profile.email || '';
  const fichaNote = row
    ? `A ficha de ${row.name} NÃO é apagada — perde apenas o acesso à app `
      + '(e, se for atleta, o portal e o cartão QR deixam de funcionar até nova conta).'
    : 'Esta conta não está vinculada a nenhuma ficha.';
  openModal({
    title: 'Eliminar conta',
    submitLabel: 'Eliminar definitivamente',
    intro: `Apaga para sempre a conta de ${email || 'este utilizador'}: o login, os acessos `
         + 'e as notificações dela. Não há forma de repor — para a pessoa voltar, é preciso '
         + 'novo convite e nova conta.',
    fields: [
      {
        name: 'confirm',
        label: 'Escreve o email para confirmar',
        required: true,
        placeholder: email,
        hint: fichaNote,
      },
    ],
    async onSubmit(values) {
      if ((values.confirm || '').trim().toLowerCase() !== email.toLowerCase()) {
        throw new Error('O email não coincide com o desta conta.');
      }
      let res;
      try {
        res = await deleteOrgMember(profile.id);
      } catch (err) {
        // As recusas do servidor ("esta conta é a dona do clube") vêm em PT;
        // dbErrorMessage trata as restantes (rede, permissões).
        throw new Error(dbErrorMessage(err));
      }
      renderUtilizadores(container);
      const m = container.querySelector('#roles-msg');
      if (m) {
        const soltas = (res?.unlinked_coaches || 0) + (res?.unlinked_players || 0);
        m.textContent = `Conta ${email} eliminada.`
          + (soltas ? ` ${soltas} ficha${soltas > 1 ? 's ficaram' : ' ficou'} sem conta ligada.` : '');
        m.className = 'settings-msg settings-msg--ok';
      }
    },
  });
}

// Seletor de vínculo: coordenador/treinador → registo de treinador (o
// coordenador pode acumular o papel de treinador); atleta → registo de atleta.
function linkControl(p) {
  if (p.role === 'coordenador' || p.role === 'treinador') {
    const linked = state.coaches.find((c) => c.user_id === p.id)?.id || '';
    const opts = state.coaches
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((c) => `<option value="${c.id}" ${c.id === linked ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('');
    return `
      <select class="link-select" data-kind="coach" data-userid="${p.id}" data-prev="${linked}">
        <option value="">— Sem treinador —</option>${opts}
      </select>`;
  }
  if (p.role === 'atleta') {
    const linked = state.players.find((pl) => pl.user_id === p.id)?.id || '';
    const opts = state.players
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((pl) => {
        const t = teamById(pl.team_id);
        const label = `${pl.name}${t ? ' — ' + teamName(t) : ''}`;
        return `<option value="${pl.id}" ${pl.id === linked ? 'selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
    return `
      <select class="link-select" data-kind="player" data-userid="${p.id}" data-prev="${linked}">
        <option value="">— Sem atleta —</option>${opts}
      </select>`;
  }
  return '<span class="muted" style="font-size:0.8rem">—</span>';
}

// Resumo dos acessos + botão para configurar. Coordenador vê tudo; atleta tem
// o portal; treinador/leitura têm uma lista configurável.
function accessControl(p) {
  if (p.role === 'coordenador') return '<span class="muted" style="font-size:0.8rem">Tudo</span>';
  if (p.role === 'atleta') return '<span class="muted" style="font-size:0.8rem">Portal pessoal</span>';
  const perms = Array.isArray(p.permissions) ? p.permissions : [];
  const n = perms.length;
  return `
    <button class="btn btn--ghost btn--sm" data-acc-config="${p.id}" type="button">
      Configurar (${n}/${SECTIONS.length})
    </button>`;
}

// Modal com as caixas de seleção das secções. onSaved() corre após guardar.
function openAccessModal(profile, onSaved) {
  if (!profile) return;
  const current = new Set(Array.isArray(profile.permissions) ? profile.permissions : []);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="acc-title" style="width:min(520px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="acc-title">Acessos</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p class="muted" style="margin:0 0 0.8rem">
        Escolhe as secções que <strong>${esc(profile.email || 'este utilizador')}</strong> pode ver.
      </p>
      <div class="acc-actions">
        <button class="btn btn--link btn--sm" id="acc-all" type="button">Selecionar tudo</button>
        <button class="btn btn--link btn--sm" id="acc-none" type="button">Limpar</button>
      </div>
      <div class="coach-checks" id="acc-list">
        ${SECTIONS.map((s) => `
          <label class="coach-check">
            <input type="checkbox" value="${s.key}" ${current.has(s.key) ? 'checked' : ''} />
            <span>${esc(s.label)}</span>
          </label>`).join('')}
      </div>
      <div id="acc-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="acc-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="acc-save" type="button">Guardar</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay);
  overlay.querySelector('#acc-cancel').addEventListener('click', close);

  const boxes = () => [...overlay.querySelectorAll('#acc-list input')];
  overlay.querySelector('#acc-all').addEventListener('click', () => boxes().forEach((b) => (b.checked = true)));
  overlay.querySelector('#acc-none').addEventListener('click', () => boxes().forEach((b) => (b.checked = false)));

  overlay.querySelector('#acc-save').addEventListener('click', async () => {
    const permissions = boxes().filter((b) => b.checked).map((b) => b.value);
    const errEl = overlay.querySelector('#acc-err');
    const btn = overlay.querySelector('#acc-save');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await updateProfilePermissions(profile.id, permissions);
      close();
      onSaved?.();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });
}

// Lista dos convites do clube, agrupada pelo ESTADO e não numa lista corrida.
//
// Só os pendentes é que ainda dão trabalho — são os únicos com link para
// copiar e para revogar. Os usados e os expirados são histórico: interessa
// que existam (para se ver que já se convidou aquela pessoa), não que ocupem
// o ecrã. Um clube com um ano de convites tinha os três pendentes perdidos no
// meio de sessenta linhas mortas, por isso só o grupo dos pendentes abre.
const INVITE_GROUPS = [
  { key: 'pendente', label: 'Pendentes', open: true },
  { key: 'usado',    label: 'Usados',    open: false },
  { key: 'expirado', label: 'Expirados', open: false },
];

function invitesListHTML() {
  const all = state.invitations || [];
  if (!all.length) {
    return '<p class="muted" style="font-size:0.85rem;margin:0.4rem 0 0">Ainda não há convites.</p>';
  }
  const invites = all.filter(inviteMatches);
  if (!invites.length) {
    return '<p class="muted" style="font-size:0.85rem;margin:0.4rem 0 0">Nenhum convite corresponde à pesquisa.</p>';
  }
  return INVITE_GROUPS.map((g) => {
    const list = invites.filter((inv) => inviteState(inv).key === g.key);
    if (!list.length) return '';
    return `
      <details class="group" ${g.open || inviteSearch.trim() ? 'open' : ''}>
        <summary class="group__head">
          <span class="group__title">${g.label}</span>
          <span class="group__count">${list.length}</span>
        </summary>
        <div class="table-wrap"><table class="users-table">
          <thead><tr><th>Para</th><th>Papel</th><th>Estado</th><th>Ações</th></tr></thead>
          <tbody>${list.map(inviteRow).join('')}</tbody>
        </table></div>
      </details>`;
  }).join('');
}

function inviteRow(inv) {
  const st = inviteState(inv);
  const pending = st.key === 'pendente';
  return `
    <tr>
      <td>
        ${inv.player_id
          ? `${esc(state.players.find((p) => p.id === inv.player_id)?.name || 'Atleta removido')}
             <span class="badge badge--info">atleta</span>`
          : esc(inv.email || 'Qualquer pessoa com o link')}
      </td>
      <td>${esc(ROLE_LABEL[inv.role] || inv.role)}</td>
      <td><span class="badge badge--${st.badge}">${st.label}</span></td>
      <td>
        ${pending ? `
          <span class="cell-actions">
            <button class="btn btn--ghost btn--sm" data-invite-copy="${esc(inv.token)}" type="button">Copiar link</button>
            <button class="btn btn--link btn--sm" data-invite-revoke="${esc(inv.id)}" type="button">Revogar</button>
          </span>
        ` : '<span class="muted" style="font-size:0.8rem">—</span>'}
      </td>
    </tr>
  `;
}

// Modal para criar um convite: papel, email (opcional) e acessos por secção
// (para os papéis configuráveis). onCreated(inv) corre após criar.
function openInviteModal(onCreated) {
  const invitableRoles = ROLES.filter((r) => r.key !== 'atleta');
  const initialRole = 'treinador';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="inv-title" style="width:min(520px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="inv-title">Novo convite</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="field">
        <label for="inv-role">Papel</label>
        <select id="inv-role">
          ${invitableRoles.map((r) => `<option value="${r.key}" ${r.key === initialRole ? 'selected' : ''}>${ROLE_LABEL[r.key]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="inv-email">Email (opcional)</label>
        <input type="email" id="inv-email" placeholder="para tua referência" />
      </div>
      <div id="inv-sections-wrap">
        <label style="display:block;margin-bottom:0.3rem">Acessos</label>
        <div class="acc-actions">
          <button class="btn btn--link btn--sm" id="inv-all" type="button">Selecionar tudo</button>
          <button class="btn btn--link btn--sm" id="inv-none" type="button">Limpar</button>
        </div>
        <div class="coach-checks" id="inv-sections">
          ${SECTIONS.map((s) => `
            <label class="coach-check">
              <input type="checkbox" value="${s.key}" />
              <span>${esc(s.label)}</span>
            </label>`).join('')}
        </div>
      </div>
      <div id="inv-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="inv-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="inv-create" type="button">Criar convite</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay);
  overlay.querySelector('#inv-cancel').addEventListener('click', close);

  const roleSel = overlay.querySelector('#inv-role');
  const sectionsWrap = overlay.querySelector('#inv-sections-wrap');
  const boxes = () => [...overlay.querySelectorAll('#inv-sections input')];

  // Aplica os acessos por omissão do papel e mostra/esconde a lista.
  function applyRoleDefaults() {
    const role = roleSel.value;
    const configurable = CONFIGURABLE_ROLES.has(role);
    sectionsWrap.style.display = configurable ? '' : 'none';
    const defaults = new Set(DEFAULT_SECTIONS_BY_ROLE[role] || []);
    boxes().forEach((b) => (b.checked = defaults.has(b.value)));
  }
  applyRoleDefaults();
  roleSel.addEventListener('change', applyRoleDefaults);

  overlay.querySelector('#inv-all').addEventListener('click', () => boxes().forEach((b) => (b.checked = true)));
  overlay.querySelector('#inv-none').addEventListener('click', () => boxes().forEach((b) => (b.checked = false)));

  overlay.querySelector('#inv-create').addEventListener('click', async () => {
    const role = roleSel.value;
    const email = overlay.querySelector('#inv-email').value.trim() || null;
    const permissions = CONFIGURABLE_ROLES.has(role)
      ? boxes().filter((b) => b.checked).map((b) => b.value)
      : [];
    const errEl = overlay.querySelector('#inv-err');
    const btn = overlay.querySelector('#inv-create');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'A criar…';
    try {
      const inv = await createInvitation(role, permissions, email);
      close();
      onCreated?.(inv);
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Criar convite';
    }
  });
}

// Modal que mostra o link gerado, pronto a copiar/partilhar.
function showInviteLinkModal(inv) {
  const link = inviteLink(inv.token);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="invl-title" style="width:min(560px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="invl-title">Convite criado 🎉</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p class="muted" style="margin:0 0 0.6rem">
        Envia este link a quem queres convidar (${esc(ROLE_LABEL[inv.role] || inv.role)}).
        É válido durante 14 dias e só pode ser usado uma vez.
      </p>
      <div class="field">
        <input type="text" id="invl-link" readonly value="${esc(link)}" onclick="this.select()" />
      </div>
      <div class="modal__actions">
        <button class="btn btn--primary" id="invl-copy" type="button">Copiar link</button>
        <button class="btn btn--ghost" id="invl-close" type="button">Fechar</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay, { initialFocus: '#invl-link' });
  overlay.querySelector('#invl-close').addEventListener('click', close);
  overlay.querySelector('#invl-copy').addEventListener('click', (e) => copyToClipboard(link, e.currentTarget));
  overlay.querySelector('#invl-link').select?.();
}

// Copia texto para a área de transferência, com feedback no botão.
async function copyToClipboard(text, btn) {
  const original = btn ? btn.textContent : '';
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = original; }, 1500); }
  } catch {
    // Recurso: seleciona um campo temporário para o utilizador copiar à mão.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignora */ }
    ta.remove();
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = original; }, 1500); }
  }
}
