const SHEET_PLAYERS = 'Players';
const SHEET_HISTORY = 'ScoreHistory';
const DEFAULT_RANK_POINTS = {
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

function doGet(e) {
  const resource = (e.parameter.resource || '').toLowerCase();
  const limit = parseInt(e.parameter.limit, 10) || 50;
  try {
    if (resource === 'leaderboard') {
      return jsonResponse({ ok: true, players: getLeaderboard(limit) });
    }
    if (resource === 'player') {
      const id = parseInt(e.parameter.id, 10);
      if (!id) {
        return jsonResponse({ ok: false, error: 'Missing player id' });
      }
      return jsonResponse(getPlayerDetail(id));
    }
    return jsonResponse({ ok: false, error: 'Unknown resource' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  const resource = (e.parameter.resource || '').toLowerCase();
  let data = {};
  if (e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' });
    }
  }

  try {
    if (resource === 'game') {
      const summary = recordGameResults(data);
      summary.ok = summary.errors.length === 0;
      return jsonResponse(summary);
    }
    if (resource === 'profile') {
      const result = updatePlayerProfile(data);
      return jsonResponse(result);
    }
    return jsonResponse({ ok: false, error: 'Unknown resource' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function getLeaderboard(limit) {
  const players = readPlayers();
  const histories = readHistory();
  const historyCount = histories.reduce((acc, entry) => {
    const key = entry.player_id;
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  players.forEach((player) => {
    player.finals_played = historyCount[player.id] || 0;
  });

  players.sort((a, b) => {
    const pointsDiff = b.total_points - a.total_points;
    if (pointsDiff !== 0) return pointsDiff;
    return a.nickname.localeCompare(b.nickname);
  });

  return players.slice(0, limit).map((player) => ({
    id: player.id,
    nickname: player.nickname,
    slogan: player.slogan,
    total_points: player.total_points,
    finals_played: player.finals_played,
    updated_at: player.updated_at,
  }));
}

function getPlayerDetail(playerId) {
  const players = readPlayers();
  const allHistories = readHistory();
  const player = players.find((item) => item.id === playerId);
  if (!player) {
    return { ok: false, error: 'Player not found' };
  }

  const historyCount = allHistories.reduce((acc, entry) => {
    const key = entry.player_id;
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const histories = allHistories
    .filter((entry) => entry.player_id === playerId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 25)
    .map((entry) => ({
      delta: entry.delta,
      reason: entry.reason,
      label: entry.label,
      created_at: entry.created_at,
    }));

  player.finals_played = historyCount[player.id] || 0;
  return {
    ok: true,
    player: {
      id: player.id,
      nickname: player.nickname,
      slogan: player.slogan,
      total_points: player.total_points,
      finals_played: player.finals_played,
      created_at: player.created_at,
      updated_at: player.updated_at,
    },
    history: histories,
  };
}

function recordGameResults(data) {
  const placements = Array.isArray(data.placements) ? data.placements : [];
  if (!placements.length) {
    return { ok: false, error: 'placements must include at least one player', applied: [], errors: ['No placements provided'] };
  }

  const label = String(data.label || '').trim() || 'Game result';
  const playersSheet = getSheet(SHEET_PLAYERS);
  const historySheet = getSheet(SHEET_HISTORY);
  const players = readPlayers();
  const histories = readHistory();
  let nextPlayerId = getNextId(players);
  let nextHistoryId = getNextId(histories);
  const nowIso = new Date().toISOString();
  const applied = [];
  const errors = [];

  placements.forEach((placement) => {
    const nickname = String(placement.nickname || '').trim();
    if (!nickname) {
      errors.push('Missing nickname in placement entry');
      return;
    }

    const rank = parseInt(placement.rank, 10);
    const points = placement.points != null ? parseInt(placement.points, 10) : DEFAULT_RANK_POINTS[rank];
    if (Number.isNaN(points)) {
      errors.push(`No point mapping for rank ${rank} (${nickname})`);
      return;
    }

    let player = findPlayerByNickname(players, nickname);
    if (!player) {
      player = createPlayer(playersSheet, players, nextPlayerId, nickname, nowIso);
      nextPlayerId += 1;
    }

    const reason = String(placement.reason || '').trim() || `${label} – Rank ${rank}`;
    const newTotal = player.total_points + points;

    playersSheet.getRange(player._row, 4).setValue(newTotal);
    playersSheet.getRange(player._row, 6).setValue(nowIso);
    player.total_points = newTotal;
    player.updated_at = nowIso;

    historySheet.appendRow([nextHistoryId, player.id, points, reason, label, nowIso]);
    nextHistoryId += 1;
    applied.push(`${nickname} (+${points})`);
  });

  return { applied, errors };
}

function updatePlayerProfile(data) {
  const id = parseInt(data.id, 10);
  if (!id) {
    return { ok: false, error: 'Player id is required' };
  }

  const playersSheet = getSheet(SHEET_PLAYERS);
  const players = readPlayers();
  const player = players.find((item) => item.id === id);
  if (!player) {
    return { ok: false, error: 'Player not found' };
  }

  const updates = [];
  if ('nickname' in data) {
    const nickname = String(data.nickname || '').trim();
    if (!nickname) {
      return { ok: false, error: 'Nickname cannot be empty' };
    }
    playersSheet.getRange(player._row, 2).setValue(nickname);
    player.nickname = nickname;
    updates.push('nickname');
  }

  if ('slogan' in data) {
    const slogan = String(data.slogan || '').trim();
    playersSheet.getRange(player._row, 3).setValue(slogan);
    player.slogan = slogan;
    updates.push('slogan');
  }

  playersSheet.getRange(player._row, 6).setValue(new Date().toISOString());
  return { ok: true, updated: updates };
}

function readPlayers() {
  const sheet = getSheet(SHEET_PLAYERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }

  const players = [];
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    players.push({
      id: Number(row[0]) || 0,
      nickname: String(row[1] || '').trim(),
      slogan: String(row[2] || '').trim(),
      total_points: Number(row[3]) || 0,
      created_at: normalizeDate(row[4]),
      updated_at: normalizeDate(row[5]),
      _row: i + 1,
    });
  }
  return players;
}

function readHistory() {
  const sheet = getSheet(SHEET_HISTORY);
  const range = sheet.getDataRange();
  if (range.getNumRows() <= 1) {
    return [];
  }

  const values = range.getValues();
  const history = [];
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    history.push({
      id: Number(row[0]) || 0,
      player_id: Number(row[1]) || 0,
      delta: Number(row[2]) || 0,
      reason: String(row[3] || '').trim(),
      label: String(row[4] || '').trim(),
      created_at: normalizeDate(row[5]),
      _row: i + 1,
    });
  }
  return history;
}

function findPlayerByNickname(players, nickname) {
  const target = nickname.toLowerCase();
  return players.find((player) => player.nickname.toLowerCase() === target);
}

function createPlayer(sheet, players, nextId, nickname, timestamp) {
  sheet.appendRow([nextId, nickname, '', 0, timestamp, timestamp]);
  const newRow = sheet.getLastRow();
  const player = {
    id: nextId,
    nickname,
    slogan: '',
    total_points: 0,
    created_at: timestamp,
    updated_at: timestamp,
    _row: newRow,
  };
  players.push(player);
  return player;
}

function getNextId(items) {
  return items.reduce((max, item) => {
    const value = Number(item.id) || 0;
    return value > max ? value : max;
  }, 0) + 1;
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) {
    throw new Error(`Sheet not found: ${name}`);
  }
  return sheet;
}

function normalizeDate(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
