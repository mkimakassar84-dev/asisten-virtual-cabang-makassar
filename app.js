/*
 * app.js — pengontrol utama UI: chat, fetch data, speech-to-text, text-to-speech.
 * Riwayat chat hanya disimpan di memori (hilang saat halaman ditutup/refresh).
 */

const chatLog = document.getElementById('chatLog');
const statusBar = document.getElementById('statusBar');
const composer = document.getElementById('composer');
const textInput = document.getElementById('textInput');
const micBtn = document.getElementById('micBtn');
const refreshBtn = document.getElementById('refreshBtn');

let dataStore = { status: 'loading' };

function addMessage(role, text, { speakable = false } = {}) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;

  const textNode = document.createElement('div');
  textNode.textContent = text;
  el.appendChild(textNode);

  if (speakable && 'speechSynthesis' in window) {
    const speakBtn = document.createElement('button');
    speakBtn.className = 'msg-speak-btn';
    speakBtn.setAttribute('aria-label', 'Dengarkan jawaban');
    speakBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0014 7.97v8.05A4.5 4.5 0 0016.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
    speakBtn.addEventListener('click', () => speak(text));
    el.appendChild(speakBtn);
  }

  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'id-ID';
  window.speechSynthesis.speak(utter);
}

function setStatus(message, isError = false) {
  statusBar.textContent = message;
  statusBar.classList.toggle('error', isError);
}

function formatWaktu(date) {
  return date.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

async function refreshData({ announce = true } = {}) {
  setStatus('Memuat data...');
  refreshBtn.disabled = true;
  try {
    dataStore = await loadAllData();
    if (dataStore.usingDemoData) {
      setStatus(`Data contoh (demo) · diperbarui ${formatWaktu(dataStore.lastUpdated)}`, true);
    } else {
      setStatus(`Data terbaru · diperbarui ${formatWaktu(dataStore.lastUpdated)}`);
    }
    if (announce) {
      addMessage('system', `Data diperbarui pukul ${formatWaktu(dataStore.lastUpdated)}.`);
    }
  } catch (err) {
    dataStore = { status: 'error' };
    setStatus('Gagal memuat data. Periksa koneksi internet lalu coba lagi.', true);
    if (announce) {
      addMessage('system', 'Gagal memuat data. Coba tekan tombol refresh di kanan atas.');
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

function handleAsk(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  addMessage('user', trimmed);
  const answer = answerQuestion(trimmed, dataStore);
  addMessage('bot', answer, { speakable: true });
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = textInput.value;
  textInput.value = '';
  handleAsk(q);
});

refreshBtn.addEventListener('click', () => refreshData({ announce: true }));

/* ---------------------------- Speech-to-text ---------------------------- */

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isRecording = false;

if (SpeechRecognitionImpl) {
  recognizer = new SpeechRecognitionImpl();
  recognizer.lang = 'id-ID';
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  recognizer.addEventListener('result', (e) => {
    const transcript = e.results[0][0].transcript;
    handleAsk(transcript);
  });

  recognizer.addEventListener('end', () => {
    isRecording = false;
    micBtn.classList.remove('recording');
  });

  recognizer.addEventListener('error', () => {
    isRecording = false;
    micBtn.classList.remove('recording');
    addMessage('system', 'Tidak dapat mengenali suara. Coba lagi atau ketik pertanyaan.');
  });

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      recognizer.stop();
      return;
    }
    isRecording = true;
    micBtn.classList.add('recording');
    recognizer.start();
  });
} else {
  micBtn.disabled = true;
  micBtn.title = 'Input suara tidak didukung di perangkat ini';
}

/* -------------------------------- Init ---------------------------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

addMessage('bot', 'Halo! Saya Asisten Virtual Cabang Makassar. Tanyakan soal penjualan, revenue, piutang, stok gudang, delivery, atau kinerja tim.');
refreshData({ announce: false });
