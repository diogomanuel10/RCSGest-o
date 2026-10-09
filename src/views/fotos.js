// Vista: Fotos — toda a gente do clube tira fotos; elas acabam todas no
// Google Drive do coordenador.
//
// Num evento (a apresentação do clube, um torneio) as fotos são tiradas por
// atletas, treinadores e pais, em dez telemóveis diferentes, e depois pediam-se
// por WhatsApp uma a uma. Aqui cada um carrega em "Tirar foto" e a foto segue.
//
// O Google só deixa a app escrever no Drive de quem está LIGADO, por isso há
// uma paragem pelo meio (ver `supabase/fotos-clube.sql`):
//   1. quem tira a foto envia-a para o ÁLBUM do clube (bucket `club-photos`);
//   2. o coordenador carrega em "Enviar para o meu Drive" — cada foto sobe
//      para a pasta dele e sai do álbum, que é uma caixa de passagem e não uma
//      galeria (não enche o Storage do clube).
//
// Quem envia não vê as fotos dos outros: o álbum só é lido pelo coordenador.
//
// A fila de envio vive em memória: as fotos já estão na galeria do telemóvel,
// por isso perder a fila não perde foto nenhuma. O que não pode acontecer é
// uma foto falhar em silêncio: cada miniatura diz se chegou.

import { supabase } from '../supabase.js';
import { state } from '../store.js';
import { esc } from '../ui.js';
import { toastOk, toastError } from '../toast.js';
import { branding } from '../branding.js';
import { isCoordenador, isAtleta } from '../permissions.js';
import {
  driveConfigured, isConnected, connectDrive, disconnectDrive,
  ensureFolder, cachedFolder, uploadToFolder, shareFolderByLink,
} from '../drive-photos.js';

const BUCKET = 'club-photos';
const NAME_KEY = 'rumia.fotos.lastFolder';
const PARALLEL = 2;

let host = null;
// --- envio (toda a gente) ---
let items = [];           // { id, file, url, status, error }
let seq = 0;
let running = 0;
let albumMissing = false; // o bucket ainda não existe (falta a migração)
// --- álbum → Drive (coordenador) ---
let folderName = readLastName() || defaultFolderName();
let folder = null;        // { id, name, link }
let busy = false;         // a ligar ao Google / a preparar a pasta
let album = null;         // null = por contar; senão lista de caminhos
let albumError = '';
let sync = null;          // { total, done, failed } enquanto está a enviar
let autoSync = false;     // reenviar sozinho o que for chegando

const orgId = () => state.profile?.org_id;

function defaultFolderName() {
  const d = new Date();
  const dia = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  return `${branding().club_name || 'Clube'} — Fotos ${dia}`;
}
function readLastName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
function saveLastName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* janela privada */ }
}

const pad = (n) => String(n).padStart(2, '0');

// O Storage só aceita caminhos simples: sem acentos nem símbolos.
function ascii(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Quem tirou a foto vai no nome do ficheiro: no Drive é a única coisa que
// distingue as fotos da Ana das do treinador dos infantis.
function whoAmI() {
  const me = state.players.find((p) => p.user_id && p.user_id === state.profile?.id);
  if (me?.name) return me.name;
  const coach = (state.coaches || []).find((c) => c.user_id && c.user_id === state.profile?.id);
  if (coach?.name) return coach.name;
  return (state.profile?.email || '').split('@')[0] || 'clube';
}

// "2026-10-10 18.32.05 Ana Silva k3f9.jpg": a ordem alfabética do Drive é a
// ordem em que as fotos foram tiradas; o sufixo evita colisões.
function objectName(file) {
  const d = file.lastModified ? new Date(file.lastModified) : new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const ext = (file.name?.match(/\.[a-z0-9]{2,5}$/i)?.[0]
    || (file.type?.startsWith('video/') ? '.mp4' : '.jpg')).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp} ${ascii(whoAmI()).slice(0, 40) || 'clube'} ${rand}${ext}`;
}

// Seletor (vários). Fica no documento até à escolha, pela razão do `pickFile`
// em ui.js: num iPhone um input solto devolve ficheiros vazios.
function pickFiles({ camera }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = camera ? 'image/*' : 'image/*,video/*';
    if (camera) input.setAttribute('capture', 'environment');
    else input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    const done = (files) => { input.remove(); resolve(files); };
    input.addEventListener('cancel', () => done([]));
    input.addEventListener('change', () => done([...(input.files || [])]));
    input.click();
  });
}

// ---- Envio para o álbum -----------------------------------------------------

function addFiles(files) {
  const valid = files.filter((f) => f && f.size > 0);
  if (files.length && !valid.length) {
    toastError('As fotos chegaram vazias. Se estão na iCloud, abre-as primeiro na galeria e tenta de novo.');
    return;
  }
  valid.forEach((file) => {
    seq += 1;
    items.push({
      id: seq,
      file,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      status: albumMissing ? 'local' : 'fila',
      error: '',
    });
  });
  paint();
  pump();
}

function pump() {
  if (albumMissing || !orgId()) return;
  while (running < PARALLEL) {
    const it = items.find((i) => i.status === 'fila');
    if (!it) break;
    running += 1;
    it.status = 'enviar';
    paint();
    supabase.storage.from(BUCKET)
      .upload(`${orgId()}/${objectName(it.file)}`, it.file, {
        contentType: it.file.type || 'application/octet-stream',
        upsert: false,
      })
      .then(({ error }) => {
        if (!error) { it.status = 'ok'; return; }
        if (/bucket not found/i.test(error.message || '')) {
          albumMissing = true;
          items.forEach((i) => { if (i.status !== 'ok') i.status = 'local'; });
          return;
        }
        it.status = 'erro';
        it.error = /exceeded|too large|payload/i.test(error.message || '')
          ? 'Ficheiro grande demais (máx. 50 MB).'
          : 'Não foi enviada — verifica a rede.';
      })
      .catch(() => { it.status = 'erro'; it.error = 'Sem ligação — não foi enviada.'; })
      .finally(() => {
        running -= 1;
        const left = items.some((i) => i.status === 'fila' || i.status === 'enviar');
        if (!left) {
          const falhas = items.filter((i) => i.status === 'erro').length;
          if (falhas) toastError(`${falhas} ${falhas === 1 ? 'foto não foi enviada' : 'fotos não foram enviadas'} — tenta de novo.`);
          // O coordenador com o Drive ligado não tem de carregar em mais nada.
          if (isCoordenador()) refreshAlbum().then(() => { if (autoSync && folder && isConnected()) syncToDrive(); });
        }
        paint();
        pump();
      });
  }
}

function retryFailed() {
  items.filter((i) => i.status === 'erro').forEach((i) => { i.status = 'fila'; i.error = ''; });
  paint();
  pump();
}

function clearDone() {
  items = items.filter((i) => {
    if (i.status === 'ok') { if (i.url) URL.revokeObjectURL(i.url); return false; }
    return true;
  });
  paint();
}

// Sem álbum (falta a migração): a folha de partilha do telemóvel, onde o
// Drive e o WhatsApp aparecem como destino.
async function shareFiles() {
  const files = items.filter((i) => i.status === 'local').map((i) => i.file);
  if (!files.length) return;
  if (!navigator.canShare?.({ files })) {
    toastError('Este browser não deixa partilhar ficheiros. Usa a galeria do telemóvel.');
    return;
  }
  try { await navigator.share({ files, title: 'Fotos' }); } catch { /* cancelado */ }
}

// ---- Álbum → Drive (coordenador) ---------------------------------------------

async function refreshAlbum() {
  if (!isCoordenador() || !orgId()) return;
  albumError = '';
  const paths = [];
  try {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from(BUCKET)
        .list(orgId(), { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      (data || []).forEach((o) => {
        if (o.id && !o.name.startsWith('.')) paths.push(`${orgId()}/${o.name}`);
      });
      if (!data || data.length < 100) break;
    }
    album = paths;
  } catch (e) {
    if (/bucket not found/i.test(e?.message || '')) albumMissing = true;
    else albumError = 'Não foi possível ler o álbum.';
    album = album || [];
  }
  paint();
}

async function connectAndPrepare() {
  const name = folderName.trim();
  if (!name) { toastError('Dá um nome à pasta do Drive.'); return; }
  busy = true;
  paint();
  try {
    if (!isConnected()) await connectDrive();
    folder = await ensureFolder(name);
    saveLastName(name);
  } catch (e) {
    toastError(e.message);
  } finally {
    busy = false;
    paint();
  }
}

async function syncToDrive() {
  if (sync || !folder) return;
  if (!isConnected()) { await connectAndPrepare(); if (!isConnected()) return; }
  await refreshAlbum();
  const queue = [...(album || [])];
  if (!queue.length) { toastOk('O álbum está vazio — não há nada para enviar.'); return; }
  sync = { total: queue.length, done: 0, failed: 0 };
  paint();

  const worker = async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      try {
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
        if (error) throw error;
        await uploadToFolder(blob, folder.id, path.split('/').pop());
        // Só sai do álbum DEPOIS de estar no Drive: ao contrário, uma falha a
        // meio perdia a foto.
        await supabase.storage.from(BUCKET).remove([path]);
        sync.done += 1;
      } catch (e) {
        sync.failed += 1;
        if (e?.status === 401) { queue.length = 0; toastError(e.message); }
        if (e?.status === 404) { folder = null; queue.length = 0; toastError(e.message); }
      }
      paint();
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const { done, failed } = sync;
  sync = null;
  await refreshAlbum();
  if (failed) toastError(`${done} enviadas para o Drive, ${failed} ficaram no álbum — tenta de novo.`);
  else toastOk(`${done} ${done === 1 ? 'foto enviada' : 'fotos enviadas'} para o Drive.`);
}

async function copyLink() {
  if (!folder) return;
  try {
    await navigator.clipboard.writeText(folder.link);
    toastOk('Link da pasta copiado.');
  } catch {
    window.prompt('Copia o link da pasta:', folder.link);
  }
}

// "Quem tiver o link pode ver" — para mandar ao grupo dos pais.
async function shareLink() {
  if (!folder) return;
  try {
    await shareFolderByLink(folder.id);
  } catch (e) {
    toastError(e.message);
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ title: folder.name, text: `Fotos: ${folder.name}`, url: folder.link }); return; } catch { /* cancelado */ }
  }
  await copyLink();
  toastOk('Quem tiver o link já pode ver as fotos.');
}

// ---- Desenho ------------------------------------------------------------------

function statusHTML(it) {
  if (it.status === 'ok') return '<span class="badge badge--ok">Enviada</span>';
  if (it.status === 'erro') return '<span class="badge badge--danger">Falhou</span>';
  if (it.status === 'enviar') return '<span class="fotos-bar fotos-bar--busy"><span></span></span>';
  if (it.status === 'local') return '';
  return '<span class="badge">À espera</span>';
}

function driveCardHTML() {
  if (!isCoordenador()) return '';
  const n = album?.length ?? null;
  const known = cachedFolder(folderName.trim());

  if (!driveConfigured()) {
    return `
      <div class="card" style="border-left:4px solid var(--warn);margin-bottom:1rem">
        <h2 style="margin:0 0 .4rem;font-size:1.05rem">Álbum do clube ${n !== null ? `· ${n} ${n === 1 ? 'foto' : 'fotos'}` : ''}</h2>
        <p style="margin:0">
          Para passar o álbum para o teu Google Drive falta configurar
          <code>VITE_GOOGLE_CLIENT_ID</code> (ver o README, secção 4b).
          Até lá as fotos ficam guardadas no álbum, à espera.
        </p>
      </div>`;
  }

  const ready = isConnected() && !!folder;
  return `
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;flex-wrap:wrap">
        <h2 style="margin:0 0 .5rem;font-size:1.05rem">Álbum do clube → o teu Drive</h2>
        <button class="btn btn--ghost btn--sm" id="fotos-refresh" type="button">Atualizar</button>
      </div>
      <p style="margin:0 0 .75rem">
        ${n === null ? 'A contar as fotos…'
          : n === 0 ? 'Não há fotos à espera no álbum.'
          : `<strong>${n}</strong> ${n === 1 ? 'foto à espera' : 'fotos à espera'} de ir para o Drive.`}
        ${albumError ? `<span class="muted"> ${esc(albumError)}</span>` : ''}
      </p>
      <div class="field" style="margin-bottom:.75rem">
        <label for="fotos-folder">Pasta no Drive</label>
        <input id="fotos-folder" type="text" value="${esc(folderName)}" ${ready ? 'disabled' : ''} maxlength="120">
        ${!ready && known ? '<p class="muted" style="margin:.3rem 0 0;font-size:.82rem">Já usaste esta pasta neste dispositivo — as fotos juntam-se às que lá estão.</p>' : ''}
      </div>
      ${ready ? `
        <p style="margin:0 0 .75rem">
          Pasta: <a href="${esc(folder.link)}" target="_blank" rel="noopener"><strong>${esc(folder.name)}</strong></a>
        </p>
        ${sync ? `
          <p style="margin:0 0 .5rem">A enviar ${sync.done + sync.failed} de ${sync.total}…</p>
          <span class="fotos-bar" style="display:block;margin-bottom:.75rem;background:var(--border)">
            <span style="width:${Math.round(((sync.done + sync.failed) / sync.total) * 100)}%"></span>
          </span>` : `
          <button class="btn btn--accent" id="fotos-sync" type="button" ${n ? '' : 'disabled'}>
            Enviar ${n ? n + ' ' : ''}para o meu Drive
          </button>`}
        <label style="display:flex;gap:.5rem;align-items:center;margin:.75rem 0;font-size:.9rem">
          <input type="checkbox" id="fotos-auto" ${autoSync ? 'checked' : ''}>
          Enviar sozinho o que eu tirar neste telemóvel
        </label>
        <div class="cell-actions" style="flex-wrap:wrap;white-space:normal">
          <button class="btn btn--ghost btn--sm" id="fotos-copy" type="button">Copiar link</button>
          <button class="btn btn--ghost btn--sm" id="fotos-share-link" type="button">Partilhar pasta</button>
          <button class="btn btn--ghost btn--sm" id="fotos-change" type="button">Mudar de pasta</button>
          <button class="btn btn--ghost btn--sm" id="fotos-logout" type="button">Desligar Google</button>
        </div>
        <p class="muted" style="margin:.5rem 0 0;font-size:.8rem">
          Cada foto sai do álbum assim que chega ao Drive. "Partilhar pasta" torna-a visível a quem tiver o link.
        </p>` : `
        <button class="btn btn--accent" id="fotos-connect" type="button" ${busy ? 'disabled' : ''}>
          ${busy ? 'A ligar…' : (isConnected() ? 'Usar esta pasta' : 'Ligar ao Google Drive')}
        </button>`}
    </div>`;
}

function paint() {
  if (!host || !host.isConnected) return;
  const total = items.length;
  const ok = items.filter((i) => i.status === 'ok').length;
  const falhas = items.filter((i) => i.status === 'erro').length;
  const locais = items.filter((i) => i.status === 'local').length;

  host.innerHTML = `
    ${isAtleta() ? '<p style="margin:0 0 .75rem"><a href="#/portal">← A minha página</a></p>' : ''}
    <header class="page-head">
      <div>
        <h1 class="section-title">Fotos</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          Tira fotos e envia-as para o álbum do clube — vão todas parar ao mesmo sítio.
        </p>
      </div>
    </header>

    ${albumMissing ? `
      <div class="card" style="border-left:4px solid var(--warn);margin-bottom:1rem">
        <p style="margin:0 0 .4rem">
          O álbum do clube ainda não está ativo${isCoordenador() ? ' (falta correr <code>supabase/fotos-clube.sql</code> no Supabase)' : ''}.
        </p>
        <p class="muted" style="margin:0;font-size:.88rem">
          Até lá: escolhe as fotos e carrega em <strong>Partilhar</strong> — no telemóvel aparece o Drive
          e o WhatsApp como destino.
        </p>
      </div>` : ''}

    <div class="fotos-actions">
      <button class="btn btn--accent fotos-big" id="fotos-camera" type="button">📷 Tirar foto</button>
      <button class="btn btn--ghost fotos-big" id="fotos-gallery" type="button">🖼️ Escolher da galeria</button>
    </div>

    ${total ? `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">
          <strong>${locais ? `${locais} ${locais === 1 ? 'foto escolhida' : 'fotos escolhidas'}` : `${ok} de ${total} enviadas`}</strong>
          <div class="cell-actions" style="flex-wrap:wrap;white-space:normal">
            ${falhas ? `<button class="btn btn--ghost btn--sm" id="fotos-retry" type="button">Tentar de novo (${falhas})</button>` : ''}
            ${ok ? '<button class="btn btn--ghost btn--sm" id="fotos-clear" type="button">Limpar enviadas</button>' : ''}
            ${locais ? '<button class="btn btn--accent btn--sm" id="fotos-share-files" type="button">Partilhar</button>' : ''}
          </div>
        </div>
        <ul class="fotos-grid">
          ${items.slice().reverse().map((it) => `
            <li class="fotos-item">
              ${it.url
                ? `<img src="${it.url}" alt="" loading="lazy">`
                : '<span class="fotos-item__video" aria-hidden="true">🎬</span>'}
              <div class="fotos-item__status">${statusHTML(it)}</div>
              ${it.status === 'erro' ? `<p class="fotos-item__err">${esc(it.error)}</p>` : ''}
            </li>`).join('')}
        </ul>
      </div>` : ''}

    ${isCoordenador() ? `<div style="margin-top:1rem">${driveCardHTML()}</div>` : ''}
  `;

  const $ = (id) => host.querySelector(`#${id}`);
  $('fotos-camera')?.addEventListener('click', async () => addFiles(await pickFiles({ camera: true })));
  $('fotos-gallery')?.addEventListener('click', async () => addFiles(await pickFiles({ camera: false })));
  $('fotos-retry')?.addEventListener('click', retryFailed);
  $('fotos-clear')?.addEventListener('click', clearDone);
  $('fotos-share-files')?.addEventListener('click', shareFiles);
  $('fotos-folder')?.addEventListener('input', (e) => { folderName = e.target.value; });
  $('fotos-connect')?.addEventListener('click', connectAndPrepare);
  $('fotos-refresh')?.addEventListener('click', refreshAlbum);
  $('fotos-sync')?.addEventListener('click', syncToDrive);
  $('fotos-auto')?.addEventListener('change', (e) => { autoSync = e.target.checked; });
  $('fotos-copy')?.addEventListener('click', copyLink);
  $('fotos-share-link')?.addEventListener('click', shareLink);
  $('fotos-change')?.addEventListener('click', () => { folder = null; paint(); });
  $('fotos-logout')?.addEventListener('click', () => { disconnectDrive(); folder = null; paint(); });
}

export function renderFotos(container) {
  const first = host !== container;
  host = container;
  paint();
  if (first && isCoordenador() && album === null) refreshAlbum();
}
