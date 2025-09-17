// Replace with the deployed Apps Script Web App URL (same as in docs/main.js).
const API_BASE = 'https://script.google.com/macros/s/AKfycbzn3FsmAThFnfDEEamvjC4FuZDcdOb8dgNo5nunOaf7D-l-1iwxw0g0wD7pQlQk2wZP/exec';
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

const form = document.getElementById('result-form');
const statusBox = document.getElementById('status');
const labelInput = document.getElementById('label');

let adminPasscode = sessionStorage.getItem(ADMIN_PASSCODE_KEY) || null;

init();

function init() {
  if (!ensurePasscode()) {
    toggleForm(true);
    showStatus('error', 'Admin passcode required. Refresh to retry.');
    return;
  }

  if (labelInput) {
    labelInput.value = suggestLabel();
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();

    const placements = collectPlacements();
    if (!placements) {
      return;
    }

    try {
      toggleForm(true);
      const payload = {
        label: labelInput.value.trim(),
        placements,
        passcode: adminPasscode,
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

      showStatus('success', formatSummary(body));
      form.reset();
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
  const elements = form.querySelectorAll('input, button');
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

function formatSummary(body) {
  const applied = Array.isArray(body.applied) && body.applied.length
    ? body.applied.join(', ')
    : 'Results recorded';
  if (body.errors?.length) {
    return `${applied}. Issues: ${body.errors.join('; ')}`;
  }
  return `${applied}. Leaderboard recalculated.`;
}

function formatErrors(body) {
  if (body?.errors?.length) {
    return `No updates applied. Issues: ${body.errors.join('; ')}`;
  }
  return body?.error || 'Unable to submit game results.';
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
  return `Game ${formatter.format(now)}`;
}
