# 🃏 USYD Texas Hold'em Society - 部署指南

## 目前的问题
你的GitHub Pages显示 "Unable to fetch leaderboard" 错误，这是因为前端配置了多个不同的Google Apps Script URL，导致权限和认证混乱。

## 解决方案：统一的Google Apps Script后端

### 第一步：创建Google Sheets数据库

1. 打开 [Google Sheets](https://sheets.google.com)
2. 创建一个新的空白表格
3. 将表格重命名为 "USYD Texas Holdem Leaderboard"
4. **重要**：复制表格的ID（URL中`/spreadsheets/d/`和`/edit`之间的长字符串）1h0xAVd2tABmBV64tZl62i2Vs2wHm7CEDGOYxDeJea9k/

### 第二步：部署Google Apps Script

1. 打开 [Google Apps Script](https://script.google.com)
2. 点击 "新建项目"
3. 删除默认的 `Code.gs` 内容
4. 复制 `google-apps-script/Code.gs` 的完整内容并粘贴进去
5. **修改配置**：
   ```javascript
   const CONFIG = {
     // 替换为你的Google Sheets ID
     SHEET_ID: 'YOUR_GOOGLE_SHEETS_ID_HERE',
     
     // 管理员密码（保持现有密码）
     ADMIN_PASSWORD: 'usydtexasholdem3709@',
     
     // 替换为你的Google邮箱地址
     AUTHORIZED_EMAILS: [
       'your-email@gmail.com',  // 请替换为你的实际邮箱
       // 'another-admin@gmail.com',  // 可以添加更多管理员
     ],
     // ... 其他配置保持不变
   };
   ```

### 第三步：配置Apps Script权限

1. 点击 "部署" → "新部署"
2. 选择类型：**网页应用**
3. 配置：
   - **说明**：`USYD Holdem Leaderboard v1.0`
   - **执行身份**：`我`
   - **谁有权访问**：`任何人` （这很重要！）
4. 点击 "部署"
5. **授权权限**：
   - 点击 "审核权限"
   - 选择你的Google账户
   - 点击 "高级" → "转至USYD Holdem项目（不安全）"
   - 点击 "允许"
6. **复制部署URL**：形如 `https://script.google.com/macros/s/AKfyc.../exec` 
7. https://script.google.com/macros/s/AKfycbwnt_x7f1ly83d7LqYKNR0l16vg9rI0iSlbRiUCl8SkttsHEVNcSrqdOlwYKalnVpqV/exec

### 第四步：更新前端配置

将复制的Apps Script URL替换到以下文件中：

#### `docs/main.js` (第3行)
```javascript
const API_BASE = 'https://script.google.com/macros/s/YOUR_ACTUAL_DEPLOYED_URL/exec';
```

#### `docs/admin.html` (第68行)
```html
<a class="button" href="https://script.google.com/macros/s/YOUR_ACTUAL_DEPLOYED_URL/exec?resource=admin" target="_blank" rel="noopener">
```

#### `docs/admin.js` (第3行)
```javascript
const API_BASE = 'https://script.google.com/macros/s/YOUR_ACTUAL_DEPLOYED_URL/exec';
```

### 第五步：测试功能

1. **测试排行榜**：
   - 打开你的GitHub Pages网站
   - 应该看到空的排行榜（没有错误信息）

2. **测试管理功能**：
   - 点击管理链接或直接访问 `your-site.com/admin.html`
   - 使用你的Google账户登录
   - 应该能看到游戏结果提交界面

3. **提交测试数据**：
   - 在管理界面输入一些测试玩家和排名
   - 输入管理员密码：`usydtexasholdem3709@`
   - 提交后返回主页查看排行榜

### 第六步：添加更多管理员（可选）

如果需要添加更多管理员：

1. 回到Apps Script项目
2. 修改 `CONFIG.AUTHORIZED_EMAILS` 数组
3. 添加新的邮箱地址
4. 重新部署（创建新版本）

### 故障排除

#### 如果还是显示 "Unable to fetch leaderboard"：

1. **检查Apps Script URL**：确保三个文件中的URL完全一致
2. **检查权限设置**：Apps Script部署时必须选择"任何人"可访问
3. **查看浏览器控制台**：按F12查看具体错误信息
4. **检查Google Sheets**：确保Sheets ID正确，且Apps Script有访问权限

#### 如果管理功能无法访问：

1. **检查邮箱白名单**：确保你的Google账户在 `AUTHORIZED_EMAILS` 列表中
2. **检查密码**：确保使用正确的管理员密码
3. **重新授权**：在Apps Script中重新运行授权流程

### 数据结构

系统会自动在你的Google Sheets中创建两个工作表：

1. **players** - 玩家信息
   - `id, nickname, total_points, slogan, avatar_url, finals_played, created_at, updated_at`

2. **score_history** - 积分历史
   - `id, player_id, delta, reason, created_at`

### 安全注意事项

- ✅ 管理功能受Google账户白名单保护
- ✅ 管理操作需要额外的密码验证  
- ✅ 只有授权用户才能提交游戏结果
- ✅ 排行榜数据对所有人可见（符合公开性要求）

---

## 完成后可以删除的文件

部署完成并确认一切正常后，可以删除以下不再需要的文件：
- `backend/` 目录（Python后端）
- `config.json`

保留：
- `docs/` 目录（前端文件）
- `google-apps-script/Code.gs`（备份用）
- 本部署指南

---

**如有问题，请检查各个步骤是否正确完成，特别注意URL配置和权限设置。**
