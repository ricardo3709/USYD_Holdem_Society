/**
 * 配置模板
 * 请复制这个配置到你的Apps Script项目中，并根据实际情况修改
 */

const CONFIG = {
  // 1. Google Sheets ID - 从你的Google Sheets URL中获取
  // URL格式：https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
  SHEET_ID: 'YOUR_GOOGLE_SHEETS_ID_HERE',
  
  // 2. 管理员密码 - 保持当前密码
  ADMIN_PASSWORD: 'usydtexasholdem3709@',
  
  // 3. 授权的Google账户邮箱列表
  // 只有这些邮箱可以访问管理功能
  AUTHORIZED_EMAILS: [
    'your-email@gmail.com',  // 替换为你的Gmail地址
    // 'admin2@gmail.com',   // 可以添加更多管理员
    // 'admin3@gmail.com',
  ],
  
  // 4. 积分配置 - 可以根据需要调整
  RANK_POINTS: {
    1: 200,  // 第一名
    2: 150,  // 第二名
    3: 120,  // 第三名
    4: 100,  // 第四名
    5: 80,   // 第五名
    6: 60,   // 第六名
    7: 50,   // 第七名
    8: 40,   // 第八名
    9: 30,   // 第九名
  }
};

/**
 * 配置完成后的URL替换清单：
 * 
 * 1. docs/main.js (第3行)：
 *    const API_BASE = 'https://script.google.com/macros/s/YOUR_DEPLOYED_URL/exec';
 * 
 * 2. docs/admin.html (第68行)：
 *    href="https://script.google.com/macros/s/YOUR_DEPLOYED_URL/exec?resource=admin"
 * 
 * 3. docs/admin.js (第3行)：
 *    const API_BASE = 'https://script.google.com/macros/s/YOUR_DEPLOYED_URL/exec';
 */
