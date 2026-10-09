// Fotos para o Google Drive de quem as tira.
//
// A Rumia não guarda as fotos: entrega-as ao Drive. As fotos de uma
// apresentação, de um torneio ou de um jogo são para PARTILHAR (com os pais,
// com quem faz as redes sociais) e o Drive já faz isso melhor do que qualquer
// galeria que a app tivesse — além de não pôr centenas de megabytes no
// Storage do clube.
//
// - O login é o do Google (Google Identity Services, carregado só quando se
//   carrega em "Ligar ao Google Drive"). O token vive em MEMÓRIA, não no
//   dispositivo: dura uma hora e, se expirar, pede-se outra vez.
// - O âmbito é `drive.file`: a app só vê as pastas e ficheiros que ELA criou.
//   Não lê o resto do Drive de ninguém, e é um âmbito que o Google não obriga
//   a verificar.
// - O envio é "resumable" e não "multipart": o multipart está limitado a 5 MB
//   e uma foto de telemóvel moderno passa disso (um vídeo passa sempre).

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const driveConfigured = () => !!GOOGLE_CLIENT_ID;

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FOLDERS_KEY = 'rumia.fotos.folders';

let token = null;        // { value, expiresAt }
let gisPromise = null;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Não foi possível contactar o Google. Verifica a ligação à internet.'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export function isConnected() {
  return !!token && token.expiresAt > Date.now() + 60_000;
}

// Tem de ser chamado a partir de um clique: abre a janela do Google.
export async function connectDrive() {
  if (!driveConfigured()) throw new Error('O Google Drive não está configurado nesta instalação.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error) {
          reject(new Error(res.error === 'access_denied'
            ? 'O acesso ao Drive não foi autorizado.'
            : `O Google recusou o acesso (${res.error}).`));
          return;
        }
        token = { value: res.access_token, expiresAt: Date.now() + (Number(res.expires_in) || 3600) * 1000 };
        resolve();
      },
      error_callback: (err) => {
        reject(new Error(err?.type === 'popup_closed'
          ? 'A janela do Google foi fechada antes de terminar.'
          : 'Não foi possível abrir a janela do Google (bloqueador de pop-ups?).'));
      },
    });
    client.requestAccessToken({ prompt: token ? '' : 'select_account' });
  });
}

export function disconnectDrive() {
  if (token && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(token.value, () => {}); } catch { /* sem efeito */ }
  }
  token = null;
}

class DriveError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function friendly(status, fallback) {
  if (status === 401) return 'A ligação ao Google expirou — liga outra vez.';
  if (status === 403) return 'O Google recusou o pedido (sem permissão ou Drive cheio).';
  if (status === 404) return 'A pasta já não existe no Drive.';
  return fallback;
}

async function api(path, { method = 'GET', body, query } = {}) {
  if (!isConnected()) throw new DriveError('A ligação ao Google expirou — liga outra vez.', 401);
  const url = new URL(API + path);
  Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token.value}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) token = null;
  if (!res.ok) throw new DriveError(friendly(res.status, `Erro do Google Drive (${res.status}).`), res.status);
  return res.status === 204 ? null : res.json();
}

// ---- Pastas ---------------------------------------------------------------
// Guarda-se o id da pasta por nome, no dispositivo, para a segunda sessão do
// dia cair na mesma pasta em vez de criar "Apresentação (2)".

function readFolders() {
  try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || '{}') || {}; } catch { return {}; }
}
function writeFolders(map) {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(map)); } catch { /* janela privada */ }
}

export function cachedFolder(name) {
  return readFolders()[name] || null;
}

function escapeQuery(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Devolve { id, name, link } da pasta com este nome (cria-a se não existir).
export async function ensureFolder(name) {
  const map = readFolders();
  const known = map[name];
  if (known?.id) {
    try {
      const f = await api(`/files/${known.id}`, { query: { fields: 'id,name,webViewLink,trashed' } });
      if (!f.trashed) return remember(name, f);
    } catch (e) {
      if (e.status === 401) throw e;
      // 404: a pasta foi apagada ou é de outra conta Google — procura/cria.
    }
  }
  const found = await api('/files', {
    query: {
      q: `name='${escapeQuery(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: 'files(id,name,webViewLink)',
      spaces: 'drive',
      pageSize: '1',
    },
  });
  if (found.files?.length) return remember(name, found.files[0]);
  const created = await api('/files', {
    method: 'POST',
    query: { fields: 'id,name,webViewLink' },
    body: { name, mimeType: FOLDER_MIME },
  });
  return remember(name, created);
}

function remember(name, f) {
  const folder = { id: f.id, name: f.name, link: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}` };
  const map = readFolders();
  map[name] = folder;
  writeFolders(map);
  return folder;
}

// "Quem tiver o link pode ver" — é o que permite mandar o link da pasta para
// o grupo dos pais sem os convidar um a um.
export async function shareFolderByLink(folderId) {
  await api(`/files/${folderId}/permissions`, {
    method: 'POST',
    body: { role: 'reader', type: 'anyone' },
  });
}

// ---- Envio ------------------------------------------------------------------

// Envia um ficheiro para a pasta. `onProgress(0..1)` é chamado durante a
// subida (é XHR e não fetch por isso: o fetch não diz quanto já subiu).
export async function uploadToFolder(file, folderId, name, onProgress) {
  if (!isConnected()) throw new DriveError('A ligação ao Google expirou — liga outra vez.', 401);
  const type = file.type || 'application/octet-stream';
  const start = await fetch(`${UPLOAD}?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.value}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  if (start.status === 401) token = null;
  if (!start.ok) throw new DriveError(friendly(start.status, `Erro do Google Drive (${start.status}).`), start.status);
  const session = start.headers.get('Location');
  if (!session) throw new DriveError('O Google não devolveu o endereço de envio.', 0);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', session);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        if (xhr.status === 401) token = null;
        reject(new DriveError(friendly(xhr.status, `O envio falhou (${xhr.status}).`), xhr.status));
      }
    };
    xhr.onerror = () => reject(new DriveError('Sem ligação — a foto não chegou ao Drive.', 0));
    xhr.send(file);
  });
}
