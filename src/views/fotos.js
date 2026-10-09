// Vista: Fotos — tirar fotos (ou escolhê-las da galeria) e enviá-las para uma
// pasta no Google Drive de quem as tira. Ver `drive-photos.js`.
//
// Pensado para o dia de um evento (a apresentação do clube, um torneio): o
// telemóvel na mão, a câmara a um toque, e as fotos a subir enquanto se tira a
// seguinte. No fim há UM link — o da pasta — para mandar a quem as quer.
//
// A fila vive em memória: as fotos já estão na galeria do telemóvel, por isso
// perder a fila (fechar o separador) não perde foto nenhuma — só obriga a
// escolhê-las outra vez. O que não pode acontecer é uma foto falhar em
// silêncio: cada linha diz se chegou, e as que falharam têm "Tentar de novo".

import { esc } from '../ui.js';
import { toastOk, toastError } from '../toast.js';
import { branding } from '../branding.js';
import {
  driveConfigured, isConnected, connectDrive, disconnectDrive,
  ensureFolder, cachedFolder, uploadToFolder, shareFolderByLink,
} from '../drive-photos.js';

const NAME_KEY = 'rumia.fotos.lastFolder';
const PARALLEL = 2;

let host = null;
let folderName = readLastName() || defaultFolderName();
let folder = null;        // { id, name, link } da pasta em uso
let items = [];           // { id, file, url, status, progress, error, name }
let seq = 0;
let running = 0;
let busy = false;         // a ligar ao Google / a preparar a pasta

function defaultFolderName() {
  const d = new Date();
  const dia = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const clube = branding().club_name || 'Clube';
  return `${clube} — Fotos ${dia}`;
}

function readLastName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
function saveLastName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* janela privada */ }
}

const pad = (n) => String(n).padStart(2, '0');

// "Apresentação 2026-10-10 18.32.05-3.jpg": a ordem alfabética do Drive passa
// a ser a ordem em que as fotos foram tiradas, e o contador evita dois
// ficheiros com o mesmo nome quando saem duas no mesmo segundo.
function fileNameFor(file, n) {
  const d = file.lastModified ? new Date(file.lastModified) : new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const ext = (file.name?.match(/\.[a-z0-9]{2,5}$/i)?.[0]
    || (file.type?.startsWith('video/') ? '.mp4' : '.jpg')).toLowerCase();
  const base = folderName.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Foto';
  return `${base} ${stamp}-${n}${ext}`;
}

// Seletor de ficheiros (vários). Fica no documento até à escolha, pela razão
// do `pickFile` em ui.js: num iPhone um input solto devolve ficheiros vazios.
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
      status: 'fila',
      progress: 0,
      error: '',
      name: fileNameFor(file, seq),
    });
  });
  paint();
  pump();
}

async function pump() {
  if (!folder || !isConnected()) { paint(); return; }
  while (running < PARALLEL) {
    const it = items.find((i) => i.status === 'fila');
    if (!it) break;
    running += 1;
    it.status = 'enviar';
    it.progress = 0;
    paint();
    uploadToFolder(it.file, folder.id, it.name, (p) => {
      it.progress = p;
      const bar = host?.querySelector(`[data-progress="${it.id}"]`);
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    })
      .then(() => { it.status = 'ok'; it.error = ''; })
      .catch((e) => {
        it.status = 'erro';
        it.error = e.message;
        // A pasta desapareceu (apagada, ou outra conta Google): volta a
        // procurá-la/criá-la no próximo "Tentar de novo".
        if (e.status === 404) folder = null;
      })
      .finally(() => {
        running -= 1;
        const left = items.some((i) => i.status === 'fila' || i.status === 'enviar');
        if (!left && running === 0 && items.some((i) => i.status === 'ok')) {
          const falhas = items.filter((i) => i.status === 'erro').length;
          if (falhas) toastError(`${falhas} ${falhas === 1 ? 'foto não foi enviada' : 'fotos não foram enviadas'} — tenta de novo.`);
        }
        paint();
        pump();
      });
  }
}

async function connectAndPrepare() {
  const name = folderName.trim();
  if (!name) { toastError('Dá um nome à pasta.'); return; }
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
    pump();
  }
}

function retryFailed() {
  items.filter((i) => i.status === 'erro').forEach((i) => { i.status = 'fila'; i.error = ''; });
  if (!folder || !isConnected()) connectAndPrepare();
  else { paint(); pump(); }
}

function clearDone() {
  items = items.filter((i) => {
    if (i.status === 'ok') { if (i.url) URL.revokeObjectURL(i.url); return false; }
    return true;
  });
  paint();
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

async function shareLink() {
  if (!folder) return;
  try {
    await shareFolderByLink(folder.id);
  } catch (e) {
    toastError(e.message);
    return;
  }
  const text = `Fotos: ${folder.name}\n${folder.link}`;
  if (navigator.share) {
    try { await navigator.share({ title: folder.name, text, url: folder.link }); return; } catch { /* cancelado */ }
  }
  await copyLink();
  toastOk('Quem tiver o link já pode ver as fotos.');
}

// Sem Drive configurado: a folha de partilha do telemóvel (onde o Drive
// aparece como destino) é a saída que funciona já, sem configuração nenhuma.
async function shareFiles() {
  const files = items.map((i) => i.file);
  if (!files.length) return;
  if (!navigator.canShare?.({ files })) {
    toastError('Este browser não deixa partilhar ficheiros. Usa a galeria do telemóvel.');
    return;
  }
  try { await navigator.share({ files, title: folderName }); } catch { /* cancelado */ }
}

function statusHTML(it) {
  if (it.status === 'ok') return '<span class="badge badge--ok">No Drive</span>';
  if (it.status === 'erro') return `<span class="badge badge--danger" title="${esc(it.error)}">Falhou</span>`;
  if (it.status === 'enviar') {
    return `<span class="fotos-bar"><span data-progress="${it.id}" style="width:${Math.round(it.progress * 100)}%"></span></span>`;
  }
  return '<span class="badge">À espera</span>';
}

function paint() {
  if (!host || !host.isConnected) return;
  const configured = driveConfigured();
  const connected = isConnected();
  const ready = configured && connected && !!folder;
  const total = items.length;
  const ok = items.filter((i) => i.status === 'ok').length;
  const falhas = items.filter((i) => i.status === 'erro').length;
  const pendentes = items.filter((i) => i.status === 'fila' || i.status === 'enviar').length;
  const known = cachedFolder(folderName.trim());

  host.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Fotos</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          Tira fotos e elas vão logo para uma pasta no teu Google Drive — no fim mandas um só link.
        </p>
      </div>
    </header>

    ${configured ? '' : `
      <div class="card" style="border-left:4px solid var(--warn);margin-bottom:1rem">
        <p style="margin:0 0 .4rem">
          O envio direto para o Google Drive ainda não está ligado nesta instalação
          (falta <code>VITE_GOOGLE_CLIENT_ID</code> — ver o README).
        </p>
        <p class="muted" style="margin:0;font-size:.88rem">
          Até lá: escolhe as fotos aqui e carrega em <strong>Partilhar</strong> — no telemóvel
          aparece o Drive como destino.
        </p>
      </div>`}

    ${configured ? `
      <div class="card" style="margin-bottom:1rem">
        <div class="field" style="margin-bottom:.75rem">
          <label for="fotos-folder">Pasta no Drive</label>
          <input id="fotos-folder" type="text" value="${esc(folderName)}" ${ready ? 'disabled' : ''} maxlength="120">
          ${!ready && known ? '<p class="muted" style="margin:.3rem 0 0;font-size:.82rem">Já usaste esta pasta neste dispositivo — as fotos juntam-se às que lá estão.</p>' : ''}
        </div>
        ${ready ? `
          <p style="margin:0 0 .75rem">
            ✅ A enviar para <a href="${esc(folder.link)}" target="_blank" rel="noopener"><strong>${esc(folder.name)}</strong></a>
          </p>
          <div class="cell-actions" style="flex-wrap:wrap;white-space:normal">
            <button class="btn btn--ghost btn--sm" id="fotos-copy" type="button">Copiar link</button>
            <button class="btn btn--ghost btn--sm" id="fotos-share-link" type="button">Partilhar pasta</button>
            <button class="btn btn--ghost btn--sm" id="fotos-change" type="button">Mudar de pasta</button>
            <button class="btn btn--ghost btn--sm" id="fotos-logout" type="button">Desligar Google</button>
          </div>
          <p class="muted" style="margin:.5rem 0 0;font-size:.8rem">
            "Partilhar pasta" torna-a visível a quem tiver o link (para o grupo dos pais, por exemplo).
          </p>` : `
          <button class="btn btn--accent" id="fotos-connect" type="button" ${busy ? 'disabled' : ''}>
            ${busy ? 'A ligar…' : (connected ? 'Usar esta pasta' : 'Ligar ao Google Drive')}
          </button>`}
      </div>` : ''}

    <div class="fotos-actions">
      <button class="btn btn--accent fotos-big" id="fotos-camera" type="button">📷 Tirar foto</button>
      <button class="btn btn--ghost fotos-big" id="fotos-gallery" type="button">🖼️ Escolher da galeria</button>
    </div>

    ${total ? `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">
          <strong>${configured ? `${ok} de ${total} no Drive` : `${total} ${total === 1 ? 'foto escolhida' : 'fotos escolhidas'}`}</strong>
          <div class="cell-actions" style="flex-wrap:wrap;white-space:normal">
            ${configured && falhas ? `<button class="btn btn--ghost btn--sm" id="fotos-retry" type="button">Tentar de novo (${falhas})</button>` : ''}
            ${configured && ok ? '<button class="btn btn--ghost btn--sm" id="fotos-clear" type="button">Limpar enviadas</button>' : ''}
            ${!configured ? '<button class="btn btn--accent btn--sm" id="fotos-share-files" type="button">Partilhar</button>' : ''}
          </div>
        </div>
        ${configured && !ready && pendentes ? '<p class="muted" style="margin:0 0 .75rem;font-size:.85rem">As fotos ficam à espera até ligares ao Google Drive.</p>' : ''}
        <ul class="fotos-grid">
          ${items.slice().reverse().map((it) => `
            <li class="fotos-item">
              ${it.url
                ? `<img src="${it.url}" alt="" loading="lazy">`
                : '<span class="fotos-item__video" aria-hidden="true">🎬</span>'}
              <div class="fotos-item__status">${configured ? statusHTML(it) : ''}</div>
              ${it.status === 'erro' ? `<p class="fotos-item__err">${esc(it.error)}</p>` : ''}
            </li>`).join('')}
        </ul>
      </div>` : ''}
  `;

  const $ = (id) => host.querySelector(`#${id}`);
  $('fotos-folder')?.addEventListener('input', (e) => { folderName = e.target.value; });
  $('fotos-connect')?.addEventListener('click', connectAndPrepare);
  $('fotos-copy')?.addEventListener('click', copyLink);
  $('fotos-share-link')?.addEventListener('click', shareLink);
  $('fotos-change')?.addEventListener('click', () => { folder = null; paint(); });
  $('fotos-logout')?.addEventListener('click', () => { disconnectDrive(); folder = null; paint(); });
  $('fotos-camera')?.addEventListener('click', async () => addFiles(await pickFiles({ camera: true })));
  $('fotos-gallery')?.addEventListener('click', async () => addFiles(await pickFiles({ camera: false })));
  $('fotos-retry')?.addEventListener('click', retryFailed);
  $('fotos-clear')?.addEventListener('click', clearDone);
  $('fotos-share-files')?.addEventListener('click', shareFiles);
}

export function renderFotos(container) {
  host = container;
  paint();
}
