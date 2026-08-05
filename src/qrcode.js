// Códigos QR dos atletas: gerar a imagem, ler pela câmara e traduzir o
// conteúdo. Tanto o gerador (`qrcode`) como o leitor de recurso (`jsqr`) são
// carregados dinamicamente — só quem abre os cartões ou o quiosque os paga
// (mesmo padrão do SheetJS em `players-xlsx.js`).

const loadEncoder = () => import('qrcode');
const loadDecoder = () => import('jsqr');

// Prefixo do conteúdo do QR. Serve para o quiosque descartar de imediato
// qualquer outro código que apareça à frente da câmara (bilhetes, embalagens,
// links) sem sequer falar com o servidor.
export const QR_PREFIX = 'RUMIA:';

// O que fica gravado no cartão do atleta. Nunca é o `id` do registo: é o
// `qr_token`, que se pode regenerar quando um cartão se perde.
export function qrPayload(player) {
  return player?.qr_token ? QR_PREFIX + player.qr_token : null;
}

// Extrai o token de um código lido. Devolve null se não for um cartão nosso.
export function parseQrPayload(raw) {
  const text = String(raw || '').trim();
  if (!text.startsWith(QR_PREFIX)) return null;
  const token = text.slice(QR_PREFIX.length).trim();
  return /^[a-f0-9]{8,64}$/i.test(token) ? token : null;
}

// Token novo para um cartão (mesmo formato do default do Postgres: hex).
export function newQrToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Desenha um QR em SVG (escala com o contentor, imprime nítido em qualquer
// tamanho — ao contrário de um PNG). Devolve o markup pronto a inserir.
export async function qrSvg(text, { margin = 0 } = {}) {
  const QRCode = await loadEncoder();
  const api = QRCode.default || QRCode;
  return api.toString(text, {
    type: 'svg',
    margin,
    // 'M' aguenta ~15% do código danificado: chega para um cartão plastificado
    // com dedadas, sem encher o quadrado de módulos minúsculos.
    errorCorrectionLevel: 'M',
  });
}

// --- Leitura pela câmara -------------------------------------------------

// Cria um leitor de QR ligado a um <video>. Usa o `BarcodeDetector` nativo
// quando existe (Android/Chrome, muito mais leve) e cai no jsQR sobre um
// <canvas> nos browsers que não o têm (Safari/iOS).
//
//   const scanner = createScanner({ video, onCode: (t) => …, onError: … });
//   await scanner.start();  // pede a câmara
//   scanner.stop();
export function createScanner({ video, onCode, onError, interval = 120 }) {
  let stream = null;
  let timer = null;
  let detector = null;
  let decodeFrame = null;
  let canvas = null;
  let ctx = null;
  let busy = false;
  let stopped = true;
  // Evita disparar o mesmo cartão 30 vezes por segundo enquanto está à frente
  // da câmara: o mesmo código só volta a contar passado este tempo.
  let lastCode = null;
  let lastAt = 0;
  const REPEAT_MS = 2500;

  async function start() {
    stopped = false;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();

    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        }
      } catch {
        detector = null;
      }
    }

    if (!detector) {
      const jsQR = await loadDecoder();
      decodeFrame = jsQR.default || jsQR;
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    timer = setInterval(tick, interval);
  }

  async function tick() {
    if (busy || stopped || video.readyState < 2) return;
    busy = true;
    try {
      let raw = null;
      if (detector) {
        const found = await detector.detect(video);
        raw = found[0]?.rawValue || null;
      } else {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          raw = decodeFrame(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
        }
      }
      if (raw) {
        const now = Date.now();
        if (raw !== lastCode || now - lastAt > REPEAT_MS) {
          lastCode = raw;
          lastAt = now;
          onCode?.(raw);
        }
      }
    } catch (err) {
      onError?.(err);
    } finally {
      busy = false;
    }
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  // Depois de um registo, esquecer o último código deixa o mesmo atleta voltar
  // a passar sem esperar pelo tempo de repetição (ex.: correção de um engano).
  function reset() {
    lastCode = null;
    lastAt = 0;
  }

  return { start, stop, reset };
}

// Mensagem em PT para o erro de acesso à câmara — o motivo é quase sempre
// permissão negada ou página sem HTTPS, e a mensagem nativa é críptica.
export function cameraErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Acesso à câmara recusado. Autoriza a câmara nas definições do browser e tenta de novo.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Não foi encontrada nenhuma câmara neste dispositivo.';
  }
  if (name === 'NotReadableError') {
    return 'A câmara está a ser usada por outra aplicação.';
  }
  if (!window.isSecureContext) {
    return 'A câmara só funciona em páginas seguras (https).';
  }
  return 'Não foi possível ligar a câmara.';
}
