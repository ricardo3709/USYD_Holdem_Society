// Replace with the deployed Apps Script Web App URL (same as in docs/main.js).
// TODO: 请将下面的URL替换为你部署的统一Apps Script的实际URL
const API_BASE = 'https://script.google.com/macros/s/AKfycbwnt_x7f1ly83d7LqYKNR0l16vg9rI0iSlbRiUCl8SkttsHEVNcSrqdOlwYKalnVpqV/exec';
const ADMIN_PASSCODE_KEY = 'uhs_admin_passcode';
const DEFAULT_POINTS = {
  1: 200,
  2: 150,
  3: 120,
  4: 100,
  5: 80,
  6: 60,
  7: 50,
  8: 40,
  9: 30,
};
const DEFAULT_BOARD_ID = 'alltime';

const form = document.getElementById('result-form');
const statusBox = document.getElementById('status');
const labelInput = document.getElementById('label');
const boardSelect = document.getElementById('board-select');

let adminPasscode = sessionStorage.getItem(ADMIN_PASSCODE_KEY) || null;
let boards = [];
let activeBoardId = DEFAULT_BOARD_ID;

init();

function init() {
  if (!form) {
    return;
  }

  if (!ensurePasscode()) {
    toggleForm(true);
    showStatus('error', 'Admin passcode required. Refresh to retry.');
    return;
  }

  loadBoards();

  if (labelInput) {
    labelInput.value = suggestLabel();
  }

  if (boardSelect) {
    boardSelect.addEventListener('change', () => {
      activeBoardId = getSelectedBoardId();
      if (labelInput && (!labelInput.value || labelInput.value.startsWith('Game '))) {
        labelInput.value = suggestLabel();
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();

    const placements = collectPlacements();
    if (!placements) {
      return;
    }
    const boardId = getSelectedBoardId();
    if (boardSelect && !boardId) {
      showStatus('error', 'Select a leaderboard / season before submitting.');
      return;
    }

    try {
      toggleForm(true);
      const payload = {
        label: labelInput.value.trim(),
        placements,
        passcode: adminPasscode,
        board_id: boardId,
      };
      const response = await fetch(`${API_BASE}?resource=game`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!body.ok) {
        if (body.code === 'PASSCODE') {
          handleAuthFailure('Invalid passcode. Please refresh and enter the correct code.');
          return;
        }
        if (body.code === 'EMAIL') {
          handleAuthFailure('Your Google account is not authorized to submit results.');
          return;
        }
        showStatus('error', formatErrors(body));
        return;
      }

      showStatus('success', formatSummary(body, getBoardLabel(boardId)));
      form.reset();
      if (boardSelect) {
        boardSelect.value = boardId;
      }
      activeBoardId = boardId;
      if (labelInput) {
        labelInput.value = suggestLabel();
      }
    } catch (error) {
      console.error(error);
      showStatus('error', 'Network error: unable to submit results.');
    } finally {
      toggleForm(false);
    }
  });
}

async function loadBoards() {
  if (!boardSelect) {
    return;
  }

  boardSelect.disabled = true;
  boardSelect.innerHTML = '<option value=\"\">Loading…</option>';

  try {
    const response = await fetch(`${API_BASE}?resource=leaderboard`);
    const body = await response.json();
    if (!body.ok) {
      throw new Error(body.error || 'Failed to load leaderboards');
    }
    boards = Array.isArray(body.boards) ? body.boards : [];
    activeBoardId = body.activeBoard || (boards[0]?.id ?? DEFAULT_BOARD_ID);
    renderBoardOptions();
  } catch (error) {
    console.error('Failed to load boards:', error);
    boards = [{ id: DEFAULT_BOARD_ID, label: 'All Time' }];
    activeBoardId = DEFAULT_BOARD_ID;
    renderBoardOptions();
  }
}

function renderBoardOptions() {
  if (!boardSelect) {
    return;
  }

  boardSelect.innerHTML = '';

  const list = boards.length ? boards : [{ id: DEFAULT_BOARD_ID, label: 'All Time' }];
  list.forEach((board) => {
    const option = document.createElement('option');
    option.value = board.id;
    option.textContent = board.label || board.id;
    boardSelect.appendChild(option);
  });

  if (!activeBoardId || !list.some((board) => board.id === activeBoardId)) {
    activeBoardId = list[0].id;
  }

  boardSelect.value = activeBoardId;
  boardSelect.disabled = false;

  activeBoardId = boardSelect.value || activeBoardId || DEFAULT_BOARD_ID;

  if (labelInput && (!labelInput.value || labelInput.value.startsWith('Game '))) {
    labelInput.value = suggestLabel();
  }
}

function collectPlacements() {
  const rows = Array.from(document.querySelectorAll('[data-rank-row]'));
  const placements = [];

  rows.forEach((row) => {
    const rank = Number(row.getAttribute('data-rank-row'));
    const input = row.querySelector('input');
    const nickname = (input?.value || '').trim();

    if (!nickname) {
      row.classList.remove('admin-row--error');
      return;
    }

    row.classList.remove('admin-row--error');
    placements.push({
      rank,
      nickname,
      points: DEFAULT_POINTS[rank],
    });
  });

  if (!placements.length) {
    showStatus('error', 'Enter at least one player result before submitting.');
    return null;
  }

  return placements;
}

function toggleForm(disabled) {
  if (!form) {
    return;
  }
  const elements = form.querySelectorAll('input, button, select');
  elements.forEach((element) => {
    element.disabled = disabled;
  });
}

function clearStatus() {
  statusBox.hidden = true;
  statusBox.textContent = '';
  statusBox.classList.remove('admin-status--error', 'admin-status--success');
}

function ensurePasscode() {
  if (adminPasscode) {
    return true;
  }
  const input = window.prompt('Enter admin passcode');
  if (!input) {
    return false;
  }
  adminPasscode = input.trim();
  if (!adminPasscode) {
    return false;
  }
  sessionStorage.setItem(ADMIN_PASSCODE_KEY, adminPasscode);
  return true;
}

function handleAuthFailure(message) {
  sessionStorage.removeItem(ADMIN_PASSCODE_KEY);
  adminPasscode = null;
  toggleForm(true);
  showStatus('error', message);
}

function showStatus(type, message) {
  statusBox.hidden = false;
  statusBox.textContent = message;
  statusBox.classList.toggle('admin-status--error', type === 'error');
  statusBox.classList.toggle('admin-status--success', type === 'success');
}

function formatSummary(body, boardLabel) {
  const applied = Array.isArray(body.applied) && body.applied.length
    ? body.applied.join(', ')
    : 'Results recorded';
  let message = `${applied}.`;
  if (boardLabel) {
    message += ` Saved to ${boardLabel}.`;
  }
  if (body.errors?.length) {
    message += ` Issues: ${body.errors.join('; ')}`;
  } else {
    message += ' Leaderboard recalculated.';
  }
  return message;
}

function formatErrors(body) {
  if (body?.errors?.length) {
    return `No updates applied. Issues: ${body.errors.join('; ')}`;
  }
  return body?.error || 'Unable to submit game results.';
}

function getSelectedBoardId() {
  if (!boardSelect) {
    return activeBoardId || DEFAULT_BOARD_ID;
  }
  const value = boardSelect.value ? boardSelect.value.trim() : '';
  if (value) {
    activeBoardId = value;
    return value;
  }
  return activeBoardId || DEFAULT_BOARD_ID;
}

function getBoardLabel(boardId) {
  const lookup = boards.find((board) => board.id === boardId);
  if (lookup?.label) {
    return lookup.label.trim();
  }
  if (!boardId || boardId === DEFAULT_BOARD_ID) {
    return 'All Time';
  }
  return boardId.trim();
}

function suggestLabel() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const boardLabel = getBoardLabel(activeBoardId);
  return `Game ${formatter.format(now)}${boardLabel ? ` – ${boardLabel}` : ''}`;
}
