/**
 * USYD Texas Hold'em Society Leaderboard
 * Unified Google Apps Script backend
 */

// Configuration - 需要根据你的Google账户进行调整
const CONFIG = {
  // Google Sheets ID - 请替换为你的实际Google Sheets ID
  SHEET_ID: "1h0xAVd2tABmBV64tZl62i2Vs2wHm7CEDGOYxDeJea9k",

  // 管理员密码
  ADMIN_PASSWORD: "usydtexasholdem3709@",

  // 授权的Google账户邮箱列表
  AUTHORIZED_EMAILS: [
    "ricardo370902@gmail.com", // 请替换为你的实际邮箱
    // 'another-admin@gmail.com',  // 可以添加更多管理员
  ],

  // 排名积分配置
  RANK_POINTS: {
    1: 200,
    2: 150,
    3: 120,
    4: 100,
    5: 80,
    6: 60,
    7: 50,
    8: 40,
    9: 30,
  },
};

/**
 * 主要的doGet处理函数
 */
function doGet(e) {
  const resource = e.parameter.resource;

  try {
    switch (resource) {
      case "leaderboard":
        return handleLeaderboard(e);
      case "player":
        return handlePlayerDetail(e);
      case "admin":
        return handleAdminPortal(e);
      default:
        return createJsonResponse(
          {
            ok: false,
            error: "Invalid resource",
          },
          400
        );
    }
  } catch (error) {
    console.error("Error in doGet:", error);
    return createJsonResponse(
      {
        ok: false,
        error: "Internal server error",
      },
      500
    );
  }
}

/**
 * 主要的doPost处理函数
 */
function doPost(e) {
  const resource = e.parameter.resource;

  try {
    switch (resource) {
      case "game":
        return handleSubmitGame(e);
      case "player":
        return handleCreatePlayer(e);
      default:
        return createJsonResponse(
          {
            ok: false,
            error: "Invalid resource",
          },
          400
        );
    }
  } catch (error) {
    console.error("Error in doPost:", error);
    return createJsonResponse(
      {
        ok: false,
        error: "Internal server error",
      },
      500
    );
  }
}

/**
 * 处理排行榜请求
 */
function handleLeaderboard(e) {
  try {
    const players = getLeaderboardData();
    return createJsonResponse({
      ok: true,
      players: players,
    });
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return createJsonResponse({
      ok: false,
      error: "Failed to fetch leaderboard data",
    });
  }
}

/**
 * 处理玩家详情请求
 */
function handlePlayerDetail(e) {
  const playerId = parseInt(e.parameter.id);

  if (!playerId) {
    return createJsonResponse(
      {
        ok: false,
        error: "Invalid player ID",
      },
      400
    );
  }

  try {
    const player = getPlayerById(playerId);
    const history = getPlayerHistory(playerId);

    if (!player) {
      return createJsonResponse(
        {
          ok: false,
          error: "Player not found",
        },
        404
      );
    }

    return createJsonResponse({
      ok: true,
      player: player,
      history: history,
    });
  } catch (error) {
    console.error("Error getting player detail:", error);
    return createJsonResponse({
      ok: false,
      error: "Failed to fetch player data",
    });
  }
}

/**
 * 处理管理员门户
 */
function handleAdminPortal(e) {
  // 检查用户邮箱权限
  const userEmail = Session.getActiveUser().getEmail();
  if (!CONFIG.AUTHORIZED_EMAILS.includes(userEmail)) {
    return HtmlService.createHtmlOutput(`
      <html>
        <head>
          <title>Unauthorized</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              margin-top: 50px;
              background: #f5f5f5;
            }
            .error {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Access Denied</h2>
            <p>Your Google account (${userEmail}) is not authorized.</p>
            <p>Please contact the administrator to request access.</p>
          </div>
        </body>
      </html>
    `);
  }

  // 返回管理界面
  return getAdminInterface();
}

/**
 * 处理游戏结果提交
 */
function handleSubmitGame(e) {
  // 验证用户权限
  const userEmail = Session.getActiveUser().getEmail();
  if (!CONFIG.AUTHORIZED_EMAILS.includes(userEmail)) {
    return createJsonResponse(
      {
        ok: false,
        code: "EMAIL",
        error: "Unauthorized email address",
      },
      403
    );
  }

  // 解析POST数据
  let requestData;
  try {
    requestData = JSON.parse(e.postData.contents);
  } catch (error) {
    return createJsonResponse(
      {
        ok: false,
        error: "Invalid JSON data",
      },
      400
    );
  }

  // 验证密码
  if (requestData.passcode !== CONFIG.ADMIN_PASSWORD) {
    return createJsonResponse(
      {
        ok: false,
        code: "PASSCODE",
        error: "Invalid admin passcode",
      },
      403
    );
  }

  // 处理游戏结果
  try {
    const result = submitGameResults(requestData);
    return createJsonResponse({
      ok: true,
      applied: result.applied,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error submitting game:", error);
    return createJsonResponse({
      ok: false,
      error: "Failed to submit game results",
    });
  }
}

/**
 * 创建JSON响应
 */
function createJsonResponse(data, statusCode = 200) {
  const response = ContentService.createTextOutput(
    JSON.stringify(data)
  ).setMimeType(ContentService.MimeType.JSON);

  // Apps Script 不支持直接设置状态码，但我们可以在响应中包含状态信息
  if (statusCode !== 200) {
    data._statusCode = statusCode;
  }

  return response;
}

/**
 * 获取排行榜数据
 */
function getLeaderboardData() {
  const sheet = getPlayersSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const players = [];

  // 跳过标题行
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {
      // 确保有ID
      players.push({
        id: row[0],
        nickname: row[1] || "",
        total_points: row[2] || 0,
        slogan: row[3] || "",
        avatar_url: row[4] || "",
        finals_played: row[5] || 0,
        created_at: row[6] || "",
        updated_at: row[7] || "",
      });
    }
  }

  // 按积分排序
  return players.sort((a, b) => b.total_points - a.total_points);
}

/**
 * 根据ID获取玩家
 */
function getPlayerById(playerId) {
  const players = getLeaderboardData();
  return players.find((p) => p.id == playerId) || null;
}

/**
 * 获取玩家历史记录
 */
function getPlayerHistory(playerId, limit = 20) {
  const sheet = getHistorySheet();
  const data = sheet.getDataRange().getValues();
  const history = [];

  // 跳过标题行，从最新记录开始
  for (let i = data.length - 1; i >= 1 && history.length < limit; i--) {
    const row = data[i];
    if (row[1] == playerId) {
      // player_id 列
      history.push({
        delta: row[2] || 0,
        reason: row[3] || "",
        created_at: row[4] || "",
      });
    }
  }

  return history;
}

/**
 * 提交游戏结果
 */
function submitGameResults(data) {
  const placements = data.placements || [];
  const label = data.label || "Game Result";
  const applied = [];
  const errors = [];

  if (!placements.length) {
    errors.push("No placements provided");
    return { applied, errors };
  }

  const playersSheet = getPlayersSheet();
  const historySheet = getHistorySheet();
  const timestamp = new Date().toISOString();

  for (const placement of placements) {
    try {
      const nickname = placement.nickname;
      const rank = placement.rank;
      const points = placement.points || CONFIG.RANK_POINTS[rank] || 0;

      if (!nickname || !rank) {
        errors.push(`Missing nickname or rank in placement`);
        continue;
      }

      // 查找或创建玩家
      let playerId = findOrCreatePlayer(nickname, playersSheet);

      // 添加积分
      updatePlayerPoints(playerId, points, playersSheet);

      // 记录历史
      addHistoryRecord(
        playerId,
        points,
        `${label} - Rank ${rank}`,
        historySheet,
        timestamp
      );

      applied.push(`${nickname} (+${points})`);
    } catch (error) {
      console.error("Error processing placement:", error);
      errors.push(`Failed to process ${placement.nickname}: ${error.message}`);
    }
  }

  return { applied, errors };
}

/**
 * 查找或创建玩家
 */
function findOrCreatePlayer(nickname, sheet) {
  const data = sheet.getDataRange().getValues();

  // 查找现有玩家
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === nickname) {
      return data[i][0]; // 返回ID
    }
  }

  // 创建新玩家
  const newId = getNextPlayerId(sheet);
  const timestamp = new Date().toISOString();
  sheet.appendRow([
    newId,
    nickname,
    0, // total_points
    "", // slogan
    "", // avatar_url
    0, // finals_played
    timestamp, // created_at
    timestamp, // updated_at
  ]);

  return newId;
}

/**
 * 获取下一个玩家ID
 */
function getNextPlayerId(sheet) {
  const data = sheet.getDataRange().getValues();
  let maxId = 0;

  for (let i = 1; i < data.length; i++) {
    const id = parseInt(data[i][0]);
    if (id > maxId) {
      maxId = id;
    }
  }

  return maxId + 1;
}

/**
 * 更新玩家积分
 */
function updatePlayerPoints(playerId, deltaPoints, sheet) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == playerId) {
      const currentPoints = data[i][2] || 0;
      const newPoints = currentPoints + deltaPoints;
      const finalsPlayed = (data[i][5] || 0) + 1;

      sheet.getRange(i + 1, 3).setValue(newPoints); // total_points
      sheet.getRange(i + 1, 6).setValue(finalsPlayed); // finals_played
      sheet.getRange(i + 1, 8).setValue(new Date().toISOString()); // updated_at
      break;
    }
  }
}

/**
 * 添加历史记录
 */
function addHistoryRecord(playerId, delta, reason, sheet, timestamp) {
  const newId = getNextHistoryId(sheet);
  sheet.appendRow([newId, playerId, delta, reason, timestamp]);
}

/**
 * 获取下一个历史记录ID
 */
function getNextHistoryId(sheet) {
  const data = sheet.getDataRange().getValues();
  let maxId = 0;

  for (let i = 1; i < data.length; i++) {
    const id = parseInt(data[i][0]);
    if (id > maxId) {
      maxId = id;
    }
  }

  return maxId + 1;
}

/**
 * 获取玩家数据表
 */
function getPlayersSheet() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = spreadsheet.getSheetByName("players");

  if (!sheet) {
    // 创建玩家表
    sheet = spreadsheet.insertSheet("players");
    sheet
      .getRange(1, 1, 1, 8)
      .setValues([
        [
          "id",
          "nickname",
          "total_points",
          "slogan",
          "avatar_url",
          "finals_played",
          "created_at",
          "updated_at",
        ],
      ]);
  }

  return sheet;
}

/**
 * 获取历史记录表
 */
function getHistorySheet() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = spreadsheet.getSheetByName("score_history");

  if (!sheet) {
    // 创建历史表
    sheet = spreadsheet.insertSheet("score_history");
    sheet
      .getRange(1, 1, 1, 5)
      .setValues([["id", "player_id", "delta", "reason", "created_at"]]);
  }

  return sheet;
}

/**
 * 获取管理界面HTML
 */
function getAdminInterface() {
  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html>
<head>
  <title>Texas Hold'em Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 15px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    h1 {
      color: #333;
      text-align: center;
      margin-bottom: 30px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
      color: #555;
    }
    input[type="text"] {
      width: 100%;
      padding: 10px;
      border: 2px solid #ddd;
      border-radius: 5px;
      font-size: 16px;
    }
    input[type="text"]:focus {
      border-color: #667eea;
      outline: none;
    }
    .rank-group {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 5px;
      margin-bottom: 10px;
    }
    .rank-label {
      font-weight: bold;
      color: #666;
      min-width: 60px;
    }
    .points-display {
      font-weight: bold;
      color: #28a745;
      min-width: 50px;
      text-align: right;
    }
    .submit-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 15px 30px;
      font-size: 18px;
      border-radius: 5px;
      cursor: pointer;
      width: 100%;
      margin-top: 20px;
    }
    .submit-btn:hover {
      opacity: 0.9;
    }
    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .status {
      margin-top: 20px;
      padding: 15px;
      border-radius: 5px;
      display: none;
    }
    .status.success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
    }
    .status.error {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🃏 Game Results Submission</h1>
    
    <form id="game-form">
      <div class="form-group">
        <label for="game-label">Game Label:</label>
        <input type="text" id="game-label" placeholder="Enter game description" required>
      </div>
      
      <div class="form-group">
        <label>Player Rankings:</label>
        <div id="rankings">
          ${generateRankingInputs()}
        </div>
      </div>
      
      <button type="submit" class="submit-btn" id="submit-btn">Submit Results</button>
    </form>
    
    <div id="status" class="status"></div>
  </div>

  <script>
    const RANK_POINTS = ${JSON.stringify(CONFIG.RANK_POINTS)};
    
    document.getElementById('game-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = document.getElementById('submit-btn');
      const status = document.getElementById('status');
      
      // 收集数据
      const gameLabel = document.getElementById('game-label').value.trim();
      const placements = [];
      
      for (let rank = 1; rank <= 9; rank++) {
        const input = document.getElementById('rank-' + rank);
        const nickname = input.value.trim();
        
        if (nickname) {
          placements.push({
            rank: rank,
            nickname: nickname,
            points: RANK_POINTS[rank] || 0
          });
        }
      }
      
      if (placements.length === 0) {
        showStatus('error', 'Please enter at least one player.');
        return;
      }
      
      // 获取密码
      const passcode = prompt('Enter admin passcode:');
      if (!passcode) {
        return;
      }
      
      // 提交数据
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        
        const response = await fetch(window.location.href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label: gameLabel,
            placements: placements,
            passcode: passcode
          })
        });
        
        const result = await response.json();
        
        if (result.ok) {
          showStatus('success', 'Results submitted successfully! Applied: ' + result.applied.join(', '));
          document.getElementById('game-form').reset();
          setDefaultGameLabel();
        } else {
          showStatus('error', result.error || 'Failed to submit results');
        }
        
      } catch (error) {
        console.error('Error:', error);
        showStatus('error', 'Network error occurred');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Results';
      }
    });
    
    function showStatus(type, message) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.className = 'status ' + type;
      status.style.display = 'block';
      
      if (type === 'success') {
        setTimeout(() => {
          status.style.display = 'none';
        }, 5000);
      }
    }
    
    function setDefaultGameLabel() {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-AU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      document.getElementById('game-label').value = 'Game ' + formatter.format(now);
    }
    
    // 设置默认游戏标签
    setDefaultGameLabel();
  </script>
</body>
</html>
  `);

  return html.setTitle("Texas Hold'em Admin");
}

/**
 * 生成排名输入框HTML
 */
function generateRankingInputs() {
  let html = "";
  for (let rank = 1; rank <= 9; rank++) {
    const points = CONFIG.RANK_POINTS[rank] || 0;
    html += `
      <div class="rank-group">
        <span class="rank-label">Rank ${rank}:</span>
        <input type="text" id="rank-${rank}" placeholder="Player nickname">
        <span class="points-display">${points} pts</span>
      </div>
    `;
  }
  return html;
}
