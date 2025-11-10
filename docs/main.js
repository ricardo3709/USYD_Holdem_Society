// Replace this value with your published Apps Script Web App URL.
// TODO: 请将下面的URL替换为你部署的统一Apps Script的实际URL
const API_BASE = 'https://script.google.com/macros/s/AKfycbwnt_x7f1ly83d7LqYKNR0l16vg9rI0iSlbRiUCl8SkttsHEVNcSrqdOlwYKalnVpqV/exec';
const leaderboardBody = document.getElementById('leaderboard-body');
const searchInput = document.getElementById('search');
const playerCountEl = document.getElementById('player-count');
const emptyStateEl = document.getElementById('empty-state');
const refreshBtn = document.getElementById('refresh');
const boardSelect = document.getElementById('leaderboard-select');
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
let availableBoards = [];
let currentBoard = '';
let badgeTooltipEl;
let activeBadgeTarget = null;

init();

function init() {
  attachEvents();
  loadLeaderboard();
}

function attachEvents() {
  searchInput.addEventListener('input', () => {
    applySearchFilter();
    renderLeaderboard();
  });

  refreshBtn.addEventListener('click', () => {
    loadLeaderboard();
  });

  if (boardSelect) {
    boardSelect.addEventListener('change', (event) => {
      currentBoard = event.target.value;
      // Clear search to avoid filtering with stale text when board swaps
      searchInput.value = '';
      loadLeaderboard(currentBoard);
    });
  }

  panelClose.addEventListener('click', () => {
    panel.setAttribute('hidden', '');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      panel.setAttribute('hidden', '');
      hideBadgeTooltip();
    }
  });

  document.addEventListener('click', handleBadgeClick, true);
  window.addEventListener('scroll', hideBadgeTooltip, true);
  window.addEventListener('resize', hideBadgeTooltip);
}

async function loadLeaderboard(boardId = currentBoard) {
  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Loading…';
    if (boardSelect) {
      boardSelect.disabled = true;
    }

    const params = new URLSearchParams({ resource: 'leaderboard' });
    if (boardId) {
      params.set('board', boardId);
    }

    const response = await fetch(`${API_BASE}?${params.toString()}`);
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || 'Failed to load leaderboard');
    }
    players = payload.players || [];
    updateBoardSelector(payload.boards, payload.activeBoard ?? boardId);
    applySearchFilter();
    
    // 清理玩家详情缓存，确保数据是最新的
    playerDetailsCache.clear();
    
    renderLeaderboard();
  } catch (error) {
    console.error(error);
    alert('Unable to fetch leaderboard. Please check that the Google Sheets backend is reachable.');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
    if (boardSelect) {
      boardSelect.disabled = !availableBoards.length;
    }
  }
}

function renderLeaderboard() {
  leaderboardBody.innerHTML = '';
  hideBadgeTooltip();
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
      <td class="badges-cell">
        ${renderBadgesCell(player)}
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

function updateBoardSelector(boardList = [], suggestedActiveBoard) {
  if (!boardSelect) return;

  const normalizedBoards = Array.isArray(boardList)
    ? boardList
        .map((board) => ({
          id:
            board?.id ??
            board?.value ??
            board?.slug ??
            '',
          label:
            board?.label ??
            board?.name ??
            board?.title ??
            board?.id ??
            board?.value ??
            'Leaderboard',
        }))
        .filter((board) => board.id)
    : [];

  if (!normalizedBoards.length) {
    availableBoards = [];
    currentBoard = '';
    boardSelect.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'All players';
    boardSelect.appendChild(option);
    boardSelect.disabled = true;
    return;
  }

  availableBoards = normalizedBoards;
  boardSelect.innerHTML = '';
  normalizedBoards.forEach((board) => {
    const option = document.createElement('option');
    option.value = board.id;
    option.textContent = board.label;
    boardSelect.appendChild(option);
  });

  const preferred = suggestedActiveBoard || currentBoard || normalizedBoards[0].id;
  boardSelect.value = normalizedBoards.some((board) => board.id === preferred)
    ? preferred
    : normalizedBoards[0].id;
  currentBoard = boardSelect.value;
  boardSelect.disabled = false;
}

function applySearchFilter() {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    filteredPlayers = [...players];
    return;
  }
  filteredPlayers = players.filter((player) =>
    player.nickname.toLowerCase().includes(term),
  );
}

function renderBadgesCell(player) {
  const badgeList = sanitizeBadgeList(player?.badges);
  if (!badgeList.length) {
    return '';
  }
  const label = `${player?.nickname ?? 'Player'} badges`;
  return `
    <div class="badge-stack" role="list" aria-label="${escapeHtml(label)}">
      ${badgeList.map((badge, index) => renderBadgeChip(badge, player?.id, index)).join('')}
    </div>
  `;
}

function renderBadgeChip(badge, playerId, index) {
  const icon = escapeHtml(badge.icon);
  const description = escapeHtml(badge.label || 'Achievement');
  const badgeId = escapeHtml(`${playerId ?? 'player'}-${index}`);
  return `
    <button
      type="button"
      class="badge-chip"
      data-tooltip="${description}"
      data-badge-id="${badgeId}"
      aria-label="${description}"
    >
      <span aria-hidden="true">${icon}</span>
    </button>
  `;
}

function sanitizeBadgeList(badges) {
  if (!Array.isArray(badges)) {
    return [];
  }
  return badges
    .map((badge) => {
      if (!badge) return null;
      if (typeof badge === 'string') {
        const trimmed = badge.trim();
        return trimmed
          ? { icon: trimmed, label: trimmed }
          : null;
      }
      const icon = String(badge.icon ?? badge.emoji ?? '🏅').trim() || '🏅';
      const label = String(badge.label ?? badge.text ?? badge.title ?? icon).trim();
      return { icon, label };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function handleBadgeClick(event) {
  const badgeButton = event.target.closest('.badge-chip');
  if (!badgeButton || badgeButton.classList.contains('badge-chip--empty')) {
    hideBadgeTooltip();
    return;
  }
  event.stopPropagation();
  toggleBadgeTooltip(badgeButton);
}

function toggleBadgeTooltip(target) {
  const tooltipText = target.dataset.tooltip;
  if (!tooltipText) {
    return;
  }
  const tooltip = ensureBadgeTooltip();
  if (activeBadgeTarget === target && !tooltip.hasAttribute('hidden')) {
    hideBadgeTooltip();
    return;
  }

  activeBadgeTarget = target;
  tooltip.textContent = tooltipText;
  tooltip.removeAttribute('hidden');

  const targetRect = target.getBoundingClientRect();
  let left = targetRect.left + targetRect.width / 2;
  let top = targetRect.top + targetRect.height + 10;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  const tooltipRect = tooltip.getBoundingClientRect();
  const minLeft = tooltipRect.width / 2 + 8;
  const maxLeft = window.innerWidth - tooltipRect.width / 2 - 8;
  if (left < minLeft) {
    left = minLeft;
  } else if (left > maxLeft) {
    left = maxLeft;
  }
  tooltip.style.left = `${left}px`;

  const maxTop = window.innerHeight - tooltipRect.height - 8;
  if (top > maxTop) {
    tooltip.style.top = `${Math.max(targetRect.top - tooltipRect.height - 10, 8)}px`;
  }
}

function ensureBadgeTooltip() {
  if (!badgeTooltipEl) {
    badgeTooltipEl = document.createElement('div');
    badgeTooltipEl.id = 'badge-tooltip';
    badgeTooltipEl.className = 'badge-tooltip';
    badgeTooltipEl.setAttribute('hidden', '');
    document.body.appendChild(badgeTooltipEl);
  }
  return badgeTooltipEl;
}

function hideBadgeTooltip() {
  if (!badgeTooltipEl) {
    return;
  }
  badgeTooltipEl.setAttribute('hidden', '');
  badgeTooltipEl.textContent = '';
  activeBadgeTarget = null;
}
