/* js/ui.js — UI Helpers: Toast, Waveform, Particles, Loading */

// ═══════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ️'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING OVERLAY
// ═══════════════════════════════════════════════════════════════════════════
export function showLoading(text = 'Processing...') {
  const overlay = document.getElementById('loading-overlay');
  const label   = document.getElementById('loading-text');
  if (overlay) { overlay.classList.add('show'); }
  if (label)   { label.textContent = text; }
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVEFORM VISUALIZER
// ═══════════════════════════════════════════════════════════════════════════
const BAR_COUNT = 40;
let waveformBars = [];
let waveRafId   = null;
let waveState   = 'idle'; // 'idle' | 'playing' | 'paused'

export function initWaveform(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = '';
  waveformBars = [];

  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    bar.style.setProperty('--delay', `${(0.1 + Math.random() * 0.8).toFixed(2)}s`);
    el.appendChild(bar);
    waveformBars.push(bar);
  }
}

export function waveformPlay() {
  waveState = 'playing';
  waveformBars.forEach(b => b.classList.add('playing'));
  animateWaveform();
}

export function waveformPause() {
  waveState = 'paused';
  waveformBars.forEach(b => {
    b.classList.remove('playing');
    b.style.height = '20px';
  });
  cancelAnimationFrame(waveRafId);
}

export function waveformStop() {
  waveState = 'idle';
  cancelAnimationFrame(waveRafId);
  waveformBars.forEach(b => {
    b.classList.remove('playing');
    b.style.height = '4px';
  });
}

function animateWaveform() {
  if (waveState !== 'playing') return;
  waveformBars.forEach(b => {
    const h = 4 + Math.random() * 48;
    b.style.height = `${h}px`;
  });
  waveRafId = requestAnimationFrame(() => {
    setTimeout(animateWaveform, 80);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND PARTICLE CANVAS
// ═══════════════════════════════════════════════════════════════════════════
let particles = [];
let bgRafId   = null;

export function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Create particles
  particles = Array.from({ length: 60 }, () => createParticle(canvas));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Gradient background
    const grad = ctx.createRadialGradient(
      canvas.width * 0.3, canvas.height * 0.2, 0,
      canvas.width * 0.3, canvas.height * 0.2, canvas.width * 0.7
    );
    grad.addColorStop(0, 'rgba(124,58,237,0.06)');
    grad.addColorStop(0.5, 'rgba(6,182,212,0.03)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw connections between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(124,58,237,${0.08 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw + update particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life += p.lifeSpeed;

      // Bounce off edges
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      const alpha = 0.3 + 0.3 * Math.sin(p.life);

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('ALPHA', alpha.toFixed(2));
      ctx.fill();
    });

    bgRafId = requestAnimationFrame(animate);
  }

  animate();
}

function createParticle(canvas) {
  const colors = [
    'rgba(124,58,237,ALPHA)',
    'rgba(6,182,212,ALPHA)',
    'rgba(167,139,250,ALPHA)',
    'rgba(236,72,153,ALPHA)'
  ];
  return {
    x:         Math.random() * canvas.width,
    y:         Math.random() * canvas.height,
    r:         1 + Math.random() * 2.5,
    vx:        (Math.random() - 0.5) * 0.4,
    vy:        (Math.random() - 0.5) * 0.4,
    life:      Math.random() * Math.PI * 2,
    lifeSpeed: 0.01 + Math.random() * 0.02,
    color:     colors[Math.floor(Math.random() * colors.length)]
  };
}

export function destroyParticles() {
  cancelAnimationFrame(bgRafId);
  particles = [];
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAY BUTTON STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
export function setPlayBtnState(state) {
  const btn = document.getElementById('play-btn');
  if (!btn) return;
  const icons = { idle: '▶', playing: '⏸', paused: '▶', loading: '⏳' };
  btn.textContent = icons[state] || '▶';
  btn.disabled = (state === 'loading');
}

export function setPlaybackStatus(text) {
  const el = document.getElementById('playback-status');
  if (el) el.textContent = text;
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAG AND DROP HIGHLIGHT
// ═══════════════════════════════════════════════════════════════════════════
export function initDropzone(el, onFiles) {
  if (!el) return;

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag-over');
  });

  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files?.length) onFiles(files);
  });
}
