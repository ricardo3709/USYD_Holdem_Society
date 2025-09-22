// Replace this value with your published Apps Script Web App URL.
// TODO: 请将下面的URL替换为你部署的统一Apps Script的实际URL
const API_BASE = 'https://script.google.com/macros/s/AKfycbwnt_x7f1ly83d7LqYKNR0l16vg9rI0iSlbRiUCl8SkttsHEVNcSrqdOlwYKalnVpqV/exec';
const leaderboardBody = document.getElementById('leaderboard-body');
const searchInput = document.getElementById('search');
const playerCountEl = document.getElementById('player-count');
const emptyStateEl = document.getElementById('empty-state');
const refreshBtn = document.getElementById('refresh');
const panel = document.getElementById('player-panel');
const panelClose = document.getElementById('panel-close');
const panelNickname = document.getElementById('panel-nickname');
const panelPoints = document.getElementById('panel-points');
const panelSlogan = document.getElementById('panel-slogan');
const panelHistory = document.getElementById('panel-history');
const panelFinals = document.getElementById('panel-finals');

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

let players = [];
let filteredPlayers = [];
let playerDetailsCache = new Map(); // 添加玩家详情缓存

init();

function init() {
  attachEvents();
  loadLeaderboard();
}

function attachEvents() {
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.trim().toLowerCase();
    filteredPlayers = players.filter((player) =>
      player.nickname.toLowerCase().includes(term),
    );
    renderLeaderboard();
  });

  refreshBtn.addEventListener('click', () => {
    loadLeaderboard();
  });

  panelClose.addEventListener('click', () => {
    panel.setAttribute('hidden', '');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      panel.setAttribute('hidden', '');
    }
  });
}

async function loadLeaderboard() {
  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Loading…';
    const response = await fetch(`${API_BASE}?resource=leaderboard`);
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || 'Failed to load leaderboard');
    }
    players = payload.players || [];
    filteredPlayers = [...players];
    
    // 清理玩家详情缓存，确保数据是最新的
    playerDetailsCache.clear();
    
    renderLeaderboard();
  } catch (error) {
    console.error(error);
    alert('Unable to fetch leaderboard. Please check that the Google Sheets backend is reachable.');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

function renderLeaderboard() {
  leaderboardBody.innerHTML = '';
  playerCountEl.textContent = filteredPlayers.length.toString();

  if (!filteredPlayers.length) {
    emptyStateEl.removeAttribute('hidden');
    return;
  }

  emptyStateEl.setAttribute('hidden', '');

  filteredPlayers.forEach((player, index) => {
    const tr = document.createElement('tr');
    tr.dataset.rank = (index + 1).toString();
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <div class="player-cell">
          <div class="player-info">
            <span class="player-nickname">${escapeHtml(player.nickname)}</span>
          </div>
        </div>
      </td>
      <td>${player.total_points.toLocaleString()}</td>
      <td>${player.finals_played?.toLocaleString?.() ?? player.finals_played ?? 0}</td>
    `;
    tr.addEventListener('click', () => showPlayerDetail(player.id));
    leaderboardBody.appendChild(tr);
  });
}

async function showPlayerDetail(playerId) {
  try {
    // 先隐藏面板
    panel.setAttribute('hidden', '');
    
    // 添加加载状态
    panelNickname.textContent = 'Loading...';
    panelPoints.textContent = '—';
    panelSlogan.textContent = '—';
    panelFinals.textContent = '—';
    panelHistory.innerHTML = '<li>Loading history...</li>';
    
    // 立即显示面板（带加载状态）
    panel.removeAttribute('hidden');
    
    let payload;
    
    // 检查缓存
    if (playerDetailsCache.has(playerId)) {
      payload = playerDetailsCache.get(playerId);
    } else {
      // 没有缓存，从服务器获取
      const response = await fetch(`${API_BASE}?resource=player&id=${playerId}`);
      payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error || `Failed to load player ${playerId}`);
      }
      
      // 缓存结果（5分钟过期）
      playerDetailsCache.set(playerId, payload);
      setTimeout(() => playerDetailsCache.delete(playerId), 5 * 60 * 1000);
    }
    
    const { player, history } = payload;
    
    // 更新UI
    panelNickname.textContent = player.nickname;
    panelPoints.textContent = player.total_points.toLocaleString();
    panelSlogan.textContent = player.slogan || 'No slogan yet.';
    panelFinals.textContent = `${player.finals_played ?? 0} final table appearances`;
    panelHistory.innerHTML = '';

    if (!history.length) {
      const li = document.createElement('li');
      li.textContent = 'No recent score changes.';
      panelHistory.appendChild(li);
    } else {
      history.forEach((item) => {
        const li = document.createElement('li');
        const positive = item.delta >= 0 ? '+' : '';
        li.innerHTML = `
          <span>${positive}${item.delta}</span>
          <span>${item.reason || '—'}</span>
        `;
        panelHistory.appendChild(li);
      });
    }

  } catch (error) {
    console.error(error);
    panelNickname.textContent = 'Error';
    panelPoints.textContent = '—';
    panelSlogan.textContent = 'Unable to load player details';
    panelFinals.textContent = '—';
    panelHistory.innerHTML = '<li>Failed to load history</li>';
  }
}

function formatTimestamp(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return dateFormatter.format(parsed);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
