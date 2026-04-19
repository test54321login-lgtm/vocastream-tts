/* js/history.js — TTS History: API calls + DOM rendering */
import { authFetch } from './auth.js';
import { showToast } from './ui.js';

// ── Save a TTS session ─────────────────────────────────────────────────────
export async function saveHistory(text, engine, language, voice = '') {
  try {
    await authFetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, engine, language, voice })
    });
  } catch (err) {
    // Non-critical — log but don't surface to user
    console.warn('[History] Save failed:', err.message);
  }
}

// ── Load history list ──────────────────────────────────────────────────────
export async function loadHistory() {
  const res = await authFetch('/api/history');
  if (!res.ok) throw new Error('Failed to load history');
  const data = await res.json();
  return data.items || [];
}

// ── Delete a history item ──────────────────────────────────────────────────
export async function deleteHistory(id) {
  const res = await authFetch(`/api/history?id=${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete item');
}

// ── Render history list into DOM ───────────────────────────────────────────
export async function renderHistory(container, onReplay) {
  container.innerHTML = `
    <div class="skeleton" style="height:72px;border-radius:12px;"></div>
    <div class="skeleton" style="height:72px;border-radius:12px;margin-top:12px;"></div>
    <div class="skeleton" style="height:72px;border-radius:12px;margin-top:12px;"></div>
  `;

  let items;
  try {
    items = await loadHistory();
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Failed to load history</p>
        <span>${err.message}</span>
      </div>`;
    return;
  }

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔇</div>
        <p>No history yet</p>
        <span>Your TTS sessions will appear here after you speak some text.</span>
      </div>`;
    return;
  }

  container.innerHTML = '';
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.style.animationDelay = `${i * 0.05}s`;

    const engineBadge = item.engine === 'webspeech'
      ? `<span class="history-engine-badge badge-web">🌐 Web Speech</span>`
      : `<span class="history-engine-badge badge-natural">🤖 Natural</span>`;

    const date = new Date(item.createdAt).toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short'
    });

    const langLabel = { en: 'English', hi: 'Hindi', bn: 'Bengali', or: 'Odia' }[item.language] || item.language;
    const voiceInfo = item.voice ? ` · ${item.voice}` : '';

    el.innerHTML = `
      ${engineBadge}
      <div class="history-content">
        <div class="history-text" title="${escapeHtml(item.fullText || item.textSnippet)}">
          ${escapeHtml(item.textSnippet)}
        </div>
        <div class="history-meta">${date} · ${langLabel}${voiceInfo}</div>
      </div>
      <div class="history-actions">
        <button class="btn-icon replay-btn" title="Replay" data-id="${item._id}">▶</button>
        <button class="btn-icon danger delete-btn" title="Delete" data-id="${item._id}">🗑</button>
      </div>
    `;

    // Replay
    el.querySelector('.replay-btn').addEventListener('click', async () => {
      if (onReplay) onReplay(item.fullText || item.textSnippet, item.engine, item.language, item.voice);
    });

    // Delete
    el.querySelector('.delete-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        await deleteHistory(item._id);
        el.style.animation = 'fadeIn 0.2s ease reverse';
        setTimeout(() => el.remove(), 200);
        showToast('History item deleted', 'success');
      } catch {
        btn.disabled = false;
        btn.textContent = '🗑';
        showToast('Failed to delete item', 'error');
      }
    });

    container.appendChild(el);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
