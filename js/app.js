/* js/app.js — Main Application Controller */
import { initRouter, registerRoute, navigate } from './router.js';
import { login, register, clearSession, isAuthenticated, getUser } from './auth.js';
import {
  speak, stopTTS, togglePlayPause, setEngine, setCallbacks,
  getVoices, getIsPlaying, getIsPaused, getEngine, getChunkInfo
} from './tts.js';
import { parseFile, parseFolder, fetchURL, formatFileSize, fileIcon } from './parsers.js';
import { recognizeImage, prewarmOCR } from './ocr.js';
import { saveHistory, renderHistory } from './history.js';
import {
  showToast, showLoading, hideLoading,
  initWaveform, waveformPlay, waveformPause, waveformStop,
  initParticles, setPlayBtnState, setPlaybackStatus,
  initDropzone
} from './ui.js';

// ═══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }

  initParticles('bg-canvas');

  // Routes
  registerRoute('/',        showLanding);
  registerRoute('/landing', showLanding);
  registerRoute('/auth',    showAuthPage);
  registerRoute('/login',   showAuthPage);
  registerRoute('/app',     showApp);
  registerRoute('/studio',  showApp);
  registerRoute('/history', showHistoryView);
  registerRoute('*', () => {
    if (isAuthenticated()) navigate('/app');
    else navigate('/');
  });

  initAuthListeners();
  initLandingListeners();
  initNavListeners();
  initEngineListeners();
  initTabListeners();
  initFileListeners();
  initControlListeners();
  initPlaybackListeners();
  initOfflineListener();

  setCallbacks({
    onPlay:     onTTSPlay,
    onPause:    onTTSPause,
    onEnd:      onTTSEnd,
    onProgress: onTTSProgress
  });

  initWaveform('waveform');
  initRouter();
});

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO BACKGROUND SWITCHER
// ═══════════════════════════════════════════════════════════════════════════
let currentBgVideo = null;

function switchBgVideo(id) {
  if (currentBgVideo === id) return;
  const allVideos = document.querySelectorAll('.bg-video');
  const target    = document.getElementById(id);
  if (!target) return;

  allVideos.forEach(v => v.classList.remove('active'));

  // Start playing before making visible
  target.play().catch(() => {});
  target.classList.add('active');
  currentBgVideo = id;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE ROUTING
// ═══════════════════════════════════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function showView(id) {
  document.querySelectorAll('#page-main .main-content').forEach(v => v.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function showLanding() {
  if (isAuthenticated()) { navigate('/app'); return; }
  showPage('page-landing');
  switchBgVideo('bg-studio'); // molecular network for landing
  initLanding3D();
}

function showAuthPage() {
  if (isAuthenticated()) { navigate('/app'); return; }
  showPage('page-auth');
  switchBgVideo('bg-auth'); // sound wave for auth
}

function showApp() {
  if (!isAuthenticated()) { navigate('/auth'); return; }
  showPage('page-main');
  showView('view-studio');
  updateNavLinks('/app');
  updateUserDisplay();
  loadVoices();
  switchBgVideo('bg-studio'); // molecular for studio
  setTimeout(() => prewarmOCR(), 2000);
}

function showHistoryView() {
  if (!isAuthenticated()) { navigate('/auth'); return; }
  showPage('page-main');
  showView('view-history');
  updateNavLinks('/history');
  updateUserDisplay();
  switchBgVideo('bg-history'); // holographic cube for history
  renderHistory(
    document.getElementById('history-list'),
    (text, engine, language, voice) => {
      navigate('/app');
      setTimeout(() => replayItem(text, engine, language, voice), 300);
    }
  );
}

function updateNavLinks(active) {
  document.querySelectorAll('.nav-link[data-route]').forEach(a => {
    a.classList.toggle('active', a.dataset.route === active);
  });
}

function updateUserDisplay() {
  const user = getUser();
  const el   = document.getElementById('user-email-display');
  if (el && user) el.textContent = user.email;
}

// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE — Three.js 3D scene
// ═══════════════════════════════════════════════════════════════════════════
let threeScene = null;

function initLanding3D() {
  const canvas = document.getElementById('landing-3d');
  if (!canvas || threeScene) return;

  // Wait for Three.js CDN
  waitForLib(() => window.THREE, 'Three.js', 8000).then(() => {
    buildThreeScene(canvas);
  }).catch(() => {
    console.warn('[3D] Three.js failed to load');
  });
}

function waitForLib(getter, name, timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (getter()) { resolve(); return; }
    const start = Date.now();
    const id = setInterval(() => {
      if (getter()) { clearInterval(id); resolve(); }
      else if (Date.now() - start > timeout) { clearInterval(id); reject(new Error(name + ' timeout')); }
    }, 100);
  });
}

function buildThreeScene(canvas) {
  const THREE = window.THREE;
  const W = canvas.clientWidth  || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  // Scene + Camera
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
  camera.position.set(0, 0, 5);

  // ── Central icosahedron (main hero object) ─────────────────────────────
  const geoIco = new THREE.IcosahedronGeometry(1.2, 1);
  const matIco = new THREE.MeshPhongMaterial({
    color:       0x7c3aed,
    emissive:    0x3b0fa0,
    specular:    0xa78bfa,
    shininess:   80,
    wireframe:   false,
    transparent: true,
    opacity:     0.85,
  });
  const ico = new THREE.Mesh(geoIco, matIco);
  scene.add(ico);

  // Wireframe overlay on top of ico
  const matWire = new THREE.MeshBasicMaterial({
    color:       0xa78bfa,
    wireframe:   true,
    transparent: true,
    opacity:     0.25,
  });
  const icoWire = new THREE.Mesh(geoIco, matWire);
  icoWire.scale.setScalar(1.01);
  scene.add(icoWire);

  // ── Outer ring (torus) ─────────────────────────────────────────────────
  const geoTorus = new THREE.TorusGeometry(2.2, 0.015, 8, 100);
  const matTorus = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.5 });
  const torus1 = new THREE.Mesh(geoTorus, matTorus);
  torus1.rotation.x = Math.PI * 0.4;
  scene.add(torus1);

  const torus2 = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.012, 8, 100),
    new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.35 })
  );
  torus2.rotation.x = Math.PI * 0.6;
  torus2.rotation.y = Math.PI * 0.3;
  scene.add(torus2);

  // ── Floating particles around the ico ─────────────────────────────────
  const particleCount = 300;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 2.5 + Math.random() * 2.5;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geoPts = new THREE.BufferGeometry();
  geoPts.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const matPts = new THREE.PointsMaterial({
    color: 0xc4b5fd, size: 0.035, transparent: true, opacity: 0.7
  });
  const points = new THREE.Points(geoPts, matPts);
  scene.add(points);

  // ── Lights ─────────────────────────────────────────────────────────────
  const amb = new THREE.AmbientLight(0x1a0050, 2);
  scene.add(amb);

  const pLight1 = new THREE.PointLight(0x7c3aed, 8, 12);
  pLight1.position.set(3, 3, 3);
  scene.add(pLight1);

  const pLight2 = new THREE.PointLight(0x06b6d4, 6, 12);
  pLight2.position.set(-3, -2, 2);
  scene.add(pLight2);

  const pLight3 = new THREE.PointLight(0xec4899, 4, 8);
  pLight3.position.set(0, -4, -2);
  scene.add(pLight3);

  // ── Mouse parallax ─────────────────────────────────────────────────────
  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // Touch parallax for mobile
  document.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    mouseX = (t.clientX / window.innerWidth  - 0.5) * 2;
    mouseY = (t.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // ── Resize handler ─────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }, { passive: true });

  // ── Animate ────────────────────────────────────────────────────────────
  let rafId;
  let t = 0;

  function animate() {
    rafId = requestAnimationFrame(animate);
    t += 0.008;

    // Icosahedron rotation + breathing
    ico.rotation.x = t * 0.3 + mouseY * 0.15;
    ico.rotation.y = t * 0.5 + mouseX * 0.15;
    icoWire.rotation.copy(ico.rotation);

    // Pulsing scale (breathing effect)
    const breathe = 1 + Math.sin(t * 1.5) * 0.04;
    ico.scale.setScalar(breathe);
    icoWire.scale.setScalar(breathe * 1.01);

    // Torus rings counter-rotate
    torus1.rotation.z = t * 0.4;
    torus2.rotation.z = -t * 0.25;
    torus1.rotation.y = mouseX * 0.2;
    torus2.rotation.x = Math.PI * 0.6 + mouseY * 0.2;

    // Points slow drift
    points.rotation.y = t * 0.05;
    points.rotation.x = t * 0.03;

    // Light orbit
    pLight1.position.x = Math.cos(t * 0.7) * 4;
    pLight1.position.z = Math.sin(t * 0.7) * 4;
    pLight2.position.x = Math.cos(t * 0.5 + Math.PI) * 3;
    pLight2.position.z = Math.sin(t * 0.5 + Math.PI) * 3;

    // Camera gentle sway
    camera.position.x += (mouseX * 0.4 - camera.position.x) * 0.04;
    camera.position.y += (-mouseY * 0.3 - camera.position.y) * 0.04;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }

  animate();
  threeScene = { renderer, scene, camera, rafId };
}

// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE LISTENERS
// ═══════════════════════════════════════════════════════════════════════════
function initLandingListeners() {
  document.getElementById('landing-get-started')?.addEventListener('click',  () => navigate('/auth'));
  document.getElementById('landing-signin')?.addEventListener('click',       () => navigate('/auth'));
  document.getElementById('landing-footer-cta-btn')?.addEventListener('click', () => navigate('/auth'));
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH EVENTS
// ═══════════════════════════════════════════════════════════════════════════
function initAuthListeners() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-form`)?.classList.add('active');
    });
  });

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn   = document.getElementById('login-btn');
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    btn.classList.add('loading'); btn.disabled = true;
    try {
      await login(email, pass);
      navigate('/app');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.classList.remove('loading'); btn.disabled = false;
    }
  });

  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn     = document.getElementById('register-btn');
    const email   = document.getElementById('reg-email').value.trim();
    const pass    = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (pass !== confirm) { showToast('Passwords do not match.', 'error'); return; }
    if (pass.length < 8)  { showToast('Password must be at least 8 characters.', 'error'); return; }
    btn.classList.add('loading'); btn.disabled = true;
    try {
      await register(email, pass);
      navigate('/app');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.classList.remove('loading'); btn.disabled = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function initNavListeners() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    stopTTS();
    clearSession();
    navigate('/');
    showToast('Signed out successfully.', 'success');
  });

  document.querySelectorAll('.nav-link[data-route]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.route);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE TOGGLE
// ═══════════════════════════════════════════════════════════════════════════
function initEngineListeners() {
  document.querySelectorAll('.engine-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const engine = btn.dataset.engine;
      setEngine(engine);
      const isWeb = engine === 'webspeech';
      document.getElementById('voice-control').style.display   = isWeb ? '' : 'none';
      document.getElementById('lang-control').style.display    = isWeb ? 'none' : '';
      document.getElementById('speaker-control').style.display = isWeb ? 'none' : '';
      document.getElementById('pitch-control').style.display   = isWeb ? '' : 'none';
      const notice = document.getElementById('natural-offline-notice');
      if (notice) notice.classList.toggle('show', !isWeb && !navigator.onLine);
      stopTTS();
      setPlayBtnState('idle');
      setPlaybackStatus('Idle');
      waveformStop();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT TABS
// ═══════════════════════════════════════════════════════════════════════════
function initTabListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  const textarea  = document.getElementById('main-text');
  const charCount = document.getElementById('char-count');
  textarea?.addEventListener('input', () => {
    if (charCount) charCount.textContent = textarea.value.length.toLocaleString();
    togglePlayButton();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
function initFileListeners() {
  const fileInput = document.getElementById('file-input');
  fileInput?.addEventListener('change', () => handleSingleFile(fileInput.files[0]));
  initDropzone(document.getElementById('file-dropzone'), (files) => handleSingleFile(files[0]));

  const folderInput = document.getElementById('folder-input');
  folderInput?.addEventListener('change', () => handleFolder(folderInput.files));
  initDropzone(document.getElementById('folder-dropzone'), (files) => handleFolder(files));

  const ocrInput = document.getElementById('ocr-input');
  ocrInput?.addEventListener('change', () => handleOCR(ocrInput.files[0]));
  initDropzone(document.getElementById('ocr-dropzone'), (files) => handleOCR(files[0]));

  document.getElementById('url-fetch-btn')?.addEventListener('click', handleURLFetch);
  document.getElementById('url-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleURLFetch();
  });

  ['file-extracted-text','folder-extracted-text','ocr-text','url-extracted-text'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', togglePlayButton);
  });
}

async function handleSingleFile(file) {
  if (!file) return;
  const preview = document.getElementById('file-preview');
  const wrap    = document.getElementById('file-extracted-wrap');
  const output  = document.getElementById('file-extracted-text');
  preview.innerHTML = renderFileItem(file, 'loading');
  showLoading(`Parsing ${file.name}...`);
  try {
    const text = await parseFile(file);
    preview.innerHTML = renderFileItem(file, 'done');
    output.value = text;
    wrap.style.display = 'block';
    togglePlayButton();
    showToast(`Extracted ${text.length.toLocaleString()} characters`, 'success');
  } catch (err) {
    preview.innerHTML = renderFileItem(file, 'error');
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleFolder(files) {
  if (!files?.length) return;
  const listEl = document.getElementById('folder-file-list');
  const wrap   = document.getElementById('folder-extracted-wrap');
  const output = document.getElementById('folder-extracted-text');
  const supported = Array.from(files).filter(f =>
    ['pdf','docx','doc','txt'].includes(f.name.split('.').pop().toLowerCase())
  );
  if (!supported.length) { showToast('No supported files (PDF, DOCX, TXT)', 'error'); return; }
  listEl.innerHTML = supported.map(f => renderFileItem(f, 'loading')).join('');
  const results = await parseFolder(files, ({ index, status }) => {
    const items = listEl.querySelectorAll('.file-item');
    if (items[index]) {
      items[index].querySelector('.file-status').textContent =
        status === 'done' ? '✅ Done' : status === 'error' ? '❌ Error' : '⏳ Processing...';
      items[index].querySelector('.file-status').className = `file-status ${status}`;
    }
  });
  const combined = results.filter(r => r.status === 'done' && r.text)
    .map(r => `=== ${r.file} ===\n${r.text}`).join('\n\n');
  if (combined) {
    output.value = combined;
    wrap.style.display = 'block';
    togglePlayButton();
    showToast(`Parsed ${results.filter(r=>r.status==='done').length}/${supported.length} files`, 'success');
  } else {
    showToast('No text extracted from folder.', 'error');
  }
}

async function handleOCR(file) {
  if (!file) return;
  const preview  = document.getElementById('ocr-preview');
  const progress = document.getElementById('ocr-progress');
  const progFill = document.getElementById('ocr-progress-fill');
  const progText = document.getElementById('ocr-progress-text');
  const wrap     = document.getElementById('ocr-extracted-wrap');
  const output   = document.getElementById('ocr-text');
  const lang     = document.getElementById('ocr-lang-select').value;

  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  progress.style.display = 'block';
  wrap.style.display = 'none';

  const progressHandler = (e) => {
    const { status, progress: pct } = e.detail;
    const label = status === 'recognizing text'
      ? `Recognizing text... ${Math.round((pct||0)*100)}%`
      : `${status}...`;
    progText.textContent = label;
    progFill.style.width = `${Math.round((pct||0)*100)}%`;
  };
  window.addEventListener('ocr-progress', progressHandler);

  try {
    const { text, confidence } = await recognizeImage(file, lang);
    output.value = text;
    wrap.style.display = 'block';
    togglePlayButton();
    showToast(`OCR complete — ${confidence}% confidence`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    progress.style.display = 'none';
    window.removeEventListener('ocr-progress', progressHandler);
  }
}

async function handleURLFetch() {
  const input  = document.getElementById('url-input');
  const btn    = document.getElementById('url-fetch-btn');
  const wrap   = document.getElementById('url-extracted-wrap');
  const output = document.getElementById('url-extracted-text');
  const url    = input?.value.trim();
  if (!url) { showToast('Please enter a URL.', 'info'); return; }
  btn.disabled = true; btn.textContent = '⏳ Fetching...';
  try {
    const text = await fetchURL(url);
    if (!text.trim()) throw new Error('No readable text found at this URL.');
    output.value = text;
    wrap.style.display = 'block';
    togglePlayButton();
    showToast(`Fetched ${text.length.toLocaleString()} characters`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Fetch →';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYBACK
// ═══════════════════════════════════════════════════════════════════════════
function initControlListeners() {
  document.getElementById('rate-slider')?.addEventListener('input', (e) => {
    document.getElementById('rate-val').textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
  });
  document.getElementById('pitch-slider')?.addEventListener('input', (e) => {
    document.getElementById('pitch-val').textContent = parseFloat(e.target.value).toFixed(1);
  });
}

function initPlaybackListeners() {
  document.getElementById('play-btn')?.addEventListener('click', handlePlayPause);
  document.getElementById('stop-btn')?.addEventListener('click', () => stopTTS());
}

function handlePlayPause() {
  const text      = getActiveText();
  if (!text.trim()) { showToast('No text to speak.', 'info'); return; }
  const isPlaying = getIsPlaying();
  const isPaused  = getIsPaused();
  if (!isPlaying && !isPaused) {
    setPlayBtnState('loading');
    const options = buildTTSOptions();
    togglePlayPause(text, options);
    saveHistory(text, getEngine(), options.language || 'en', options.voice || '');
  } else {
    togglePlayPause(text);
  }
}

function buildTTSOptions() {
  const engine = getEngine();
  const rate   = parseFloat(document.getElementById('rate-slider')?.value || 1);
  if (engine === 'webspeech') {
    return {
      voice: document.getElementById('voice-select')?.value,
      rate,
      pitch: parseFloat(document.getElementById('pitch-slider')?.value || 1)
    };
  }
  return { language: document.getElementById('lang-select')?.value || 'en',
           speaker:  document.getElementById('speaker-select')?.value || 'meera',
           rate };
}

function getActiveText() {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  const map = {
    text:   () => document.getElementById('main-text')?.value || '',
    file:   () => document.getElementById('file-extracted-text')?.value || '',
    folder: () => document.getElementById('folder-extracted-text')?.value || '',
    ocr:    () => document.getElementById('ocr-text')?.value || '',
    url:    () => document.getElementById('url-extracted-text')?.value || ''
  };
  return (map[activeTab] || map.text)();
}

function togglePlayButton() {
  const text    = getActiveText();
  const playBtn = document.getElementById('play-btn');
  const stopBtn = document.getElementById('stop-btn');
  if (playBtn) playBtn.disabled = !text.trim();
  if (stopBtn) stopBtn.disabled = !text.trim() && !getIsPlaying();
}

function onTTSPlay() {
  setPlayBtnState('playing');
  const { total } = getChunkInfo();
  setPlaybackStatus(total > 1 ? `Part 1 / ${total}` : 'Playing');
  waveformPlay();
  document.getElementById('stop-btn').disabled = false;
}

function onTTSPause() {
  setPlayBtnState('paused');
  setPlaybackStatus('Paused');
  waveformPause();
}

function onTTSEnd() {
  setPlayBtnState('idle');
  setPlaybackStatus('Idle');
  waveformStop();
  togglePlayButton();
}

function onTTSProgress(current, total) {
  setPlaybackStatus(`Part ${current} / ${total}`);
}

async function loadVoices() {
  const select = document.getElementById('voice-select');
  if (!select) return;
  const voices = await getVoices();
  if (!voices.length) { select.innerHTML = '<option value="">No voices available</option>'; return; }
  const preferred = voices.filter(v =>
    v.lang.startsWith('en') || v.lang.startsWith('hi') ||
    v.lang.startsWith('bn') || v.lang.startsWith('or')
  );
  const others  = voices.filter(v => !preferred.includes(v));
  select.innerHTML = [...preferred, ...others].map(v =>
    `<option value="${v.name}">${v.name} (${v.lang})${v.default?' ★':''}</option>`
  ).join('');
}

function replayItem(text, engine, language, voice) {
  document.querySelector(`.engine-btn[data-engine="${engine}"]`)?.click();
  if (engine === 'natural') {
    const s = document.getElementById('lang-select');
    if (s) s.value = language;
  } else if (voice) {
    const s = document.getElementById('voice-select');
    if (s) s.value = voice;
  }
  const ta = document.getElementById('main-text');
  if (ta) {
    ta.value = text;
    document.querySelector('[data-tab="text"]')?.click();
    document.getElementById('char-count').textContent = text.length.toLocaleString();
  }
  togglePlayButton();
}

// ═══════════════════════════════════════════════════════════════════════════
// OFFLINE
// ═══════════════════════════════════════════════════════════════════════════
function initOfflineListener() {
  const badge  = document.getElementById('offline-badge');
  const notice = document.getElementById('natural-offline-notice');
  const update = () => {
    const offline   = !navigator.onLine;
    const isNatural = getEngine() === 'natural';
    badge?.classList.toggle('show', offline);
    notice?.classList.toggle('show', offline && isNatural);
  };
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function renderFileItem(file, status) {
  const icon       = fileIcon(file.name);
  const size       = formatFileSize(file.size);
  const statusText = { done: '✅ Done', loading: '⏳ Processing...', error: '❌ Error' };
  return `<div class="file-item">
    <span class="file-icon">${icon}</span>
    <span class="file-name">${file.name}</span>
    <span class="file-size">${size}</span>
    <span class="file-status ${status}">${statusText[status]}</span>
  </div>`;
}
