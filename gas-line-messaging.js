// ============================================
// 🎩 圖文魔術師 - GAS 後端 v2.0
// LINE Messaging API + Google Drive 圖片暫存
// ============================================

// ⚠️ 請填入你的 LINE 設定
const LINE_CHANNEL_TOKEN = '在此貼上你的 Channel Access Token';
const LINE_USER_ID = '在此貼上你的 User ID';

// Google Drive 資料夾名稱（會自動建立）
const DRIVE_FOLDER_NAME = 'LINE圖片暫存';

// ============================================
// 接收請求
// ============================================
function doPost(e) {
  console.log('=== doPost 開始 ===');
  
  try {
    const data = JSON.parse(e.postData.contents);
    console.log('收到 action:', data.action);
    
    switch (data.action) {
      case 'sendImage':
        console.log('→ 處理圖片發送');
        return handleSendImage(data);
      
      case 'testNotify':
        console.log('→ 處理測試通知');
        return handleTestNotify();
      
      default:
        // 相容舊版：直接發送圖片
        if (data.image) {
          return handleSendImage(data);
        }
        return jsonResponse({ success: false, error: '未知的 action' });
    }
  } catch (error) {
    console.error('doPost 錯誤:', error.message);
    return jsonResponse({ success: false, error: error.message });
  }
}

function doGet(e) {
  return HtmlService.createHtmlOutput(`
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: white; }
        h1 { color: #6366f1; }
        .status { background: #0f3460; padding: 15px; border-radius: 10px; margin: 10px 0; }
        .ok { color: #00ff88; }
        .warn { color: #ffaa00; }
        code { background: #333; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>🎩 圖文魔術師 GAS 後端</h1>
      <div class="status">
        <p class="ok">✅ 服務運行中</p>
        <p>📡 LINE Messaging API</p>
        <p>📁 Google Drive 圖片暫存</p>
        <p>⏰ ${new Date().toLocaleString('zh-TW')}</p>
      </div>
      <div class="status">
        <h3>設定狀態</h3>
        <p>Channel Token: ${LINE_CHANNEL_TOKEN && LINE_CHANNEL_TOKEN !== '在此貼上你的 Channel Access Token' ? '<span class="ok">✅ 已設定</span>' : '<span class="warn">⚠️ 未設定</span>'}</p>
        <p>User ID: ${LINE_USER_ID && LINE_USER_ID !== '在此貼上你的 User ID' ? '<span class="ok">✅ 已設定</span>' : '<span class="warn">⚠️ 未設定</span>'}</p>
      </div>
      <div class="status">
        <h3>測試方式</h3>
        <p>1. 在 GAS 編輯器執行 <code>testConnection</code> 測試連線</p>
        <p>2. 執行 <code>testSendImage</code> 測試圖片發送</p>
        <p>3. 執行 <code>testFullFlow</code> 測試完整流程</p>
      </div>
    </body>
    </html>
  `);
}

// ============================================
// 🖼️ 圖片發送
// ============================================
function handleSendImage(data) {
  console.log('=== handleSendImage 開始 ===');
  
  const imageBase64 = data.image;
  const userId = data.userId || LINE_USER_ID;
  const message = data.message || '📸 來自圖文魔術師';
  
  if (!imageBase64) {
    return jsonResponse({ success: false, error: '缺少圖片資料' });
  }
  
  if (!userId || userId === '在此貼上你的 User ID') {
    return jsonResponse({ success: false, error: '缺少 User ID' });
  }
  
  // 上傳到 Google Drive 並取得公開 URL
  const imageUrl = uploadToDrive(imageBase64);
  console.log('圖片 URL:', imageUrl);
  
  if (!imageUrl) {
    return jsonResponse({ success: false, error: '圖片上傳失敗' });
  }
  
  // 發送圖片訊息
  const result = sendLineImageMessage(userId, imageUrl, message);
  
  return jsonResponse({ success: result.success, message: result.message });
}

// ============================================
// 📁 Google Drive 圖片上傳
// ============================================
function uploadToDrive(base64Data) {
  console.log('=== uploadToDrive 開始 ===');
  
  try {
    // 移除 Base64 前綴
    let pureBase64 = base64Data;
    let mimeType = 'image/png';
    
    if (base64Data.includes(',')) {
      const parts = base64Data.split(',');
      pureBase64 = parts[1];
      
      // 解析 MIME 類型
      const mimeMatch = parts[0].match(/data:([^;]+)/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
    }
    
    // 取得或建立資料夾
    const folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
    
    // 建立檔案名稱
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss');
    const extension = mimeType.split('/')[1] || 'png';
    const fileName = `image_${timestamp}.${extension}`;
    
    // 轉換 Base64 為 Blob
    const blob = Utilities.newBlob(Utilities.base64Decode(pureBase64), mimeType, fileName);
    
    // 上傳到 Drive
    const file = folder.createFile(blob);
    console.log('檔案已建立:', file.getName());
    
    // 設定公開存取
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 取得直接連結（用於 LINE）
    const fileId = file.getId();
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    
    console.log('公開 URL:', directUrl);
    
    // 清理舊檔案（保留最近 50 個）
    cleanOldFiles(folder, 50);
    
    return directUrl;
    
  } catch (error) {
    console.error('uploadToDrive 錯誤:', error.message);
    return null;
  }
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  }
  
  console.log('建立新資料夾:', folderName);
  return DriveApp.createFolder(folderName);
}

function cleanOldFiles(folder, keepCount) {
  try {
    const files = folder.getFiles();
    const fileList = [];
    
    while (files.hasNext()) {
      const file = files.next();
      fileList.push({
        file: file,
        date: file.getDateCreated()
      });
    }
    
    // 按日期排序（新的在前）
    fileList.sort((a, b) => b.date - a.date);
    
    // 刪除超過數量的舊檔案
    if (fileList.length > keepCount) {
      console.log(`清理舊檔案: ${fileList.length - keepCount} 個`);
      for (let i = keepCount; i < fileList.length; i++) {
        fileList[i].file.setTrashed(true);
      }
    }
  } catch (error) {
    console.error('cleanOldFiles 錯誤:', error.message);
  }
}

// ============================================
// 📱 LINE Messaging API
// ============================================
function sendLineImageMessage(userId, imageUrl, altText) {
  console.log('=== sendLineImageMessage 開始 ===');
  console.log('發送給:', userId);
  console.log('圖片 URL:', imageUrl);
  
  const url = 'https://api.line.me/v2/bot/message/push';
  
  const payload = {
    to: userId,
    messages: [
      {
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      }
    ]
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + LINE_CHANNEL_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log('LINE API 回應碼:', responseCode);
    console.log('LINE API 回應:', responseText);
    
    if (responseCode === 200) {
      console.log('✅ 圖片發送成功！');
      return { success: true, message: '圖片已發送' };
    } else {
      const errorData = JSON.parse(responseText);
      console.error('❌ LINE API 錯誤:', errorData.message);
      return { success: false, message: errorData.message || '發送失敗' };
    }
  } catch (error) {
    console.error('sendLineImageMessage 錯誤:', error.message);
    return { success: false, message: error.message };
  }
}

// 發送 Flex Message（圖文卡片）
function sendLineFlexMessage(flexMessage, userId) {
  const url = 'https://api.line.me/v2/bot/message/push';
  
  const payload = {
    to: userId || LINE_USER_ID,
    messages: [flexMessage]
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + LINE_CHANNEL_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      return { success: true };
    } else {
      const responseText = response.getContentText();
      console.error('LINE API 錯誤:', responseText);
      return { success: false, error: responseText };
    }
  } catch (error) {
    console.error('sendLineFlexMessage 錯誤:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// 🧪 測試通知
// ============================================
function handleTestNotify() {
  console.log('=== handleTestNotify 開始 ===');
  
  const flexMessage = {
    type: 'flex',
    altText: '🎩 圖文魔術師測試通知',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#6366f1',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '🎩 圖文魔術師',
            color: '#FFFFFF',
            size: 'lg',
            weight: 'bold',
            align: 'center'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1e1e2e',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '✅ 連線測試成功！',
            color: '#00ff88',
            size: 'lg',
            weight: 'bold',
            align: 'center'
          },
          {
            type: 'text',
            text: 'LINE Messaging API 已就緒',
            color: '#888888',
            size: 'sm',
            align: 'center',
            margin: 'md'
          },
          {
            type: 'text',
            text: '🖼️ 圖片推送功能已啟用',
            color: '#818cf8',
            size: 'sm',
            align: 'center',
            margin: 'lg'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0f0f1a',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: new Date().toLocaleString('zh-TW'),
            color: '#666666',
            size: 'xs',
            align: 'center'
          }
        ]
      }
    }
  };
  
  const result = sendLineFlexMessage(flexMessage);
  return jsonResponse({ success: result.success });
}

// ============================================
// 🔧 手動測試函數（在 GAS 編輯器中執行）
// ============================================

// 測試連線
function testConnection() {
  console.log('=== testConnection 開始 ===');
  
  if (!LINE_CHANNEL_TOKEN || LINE_CHANNEL_TOKEN === '在此貼上你的 Channel Access Token') {
    console.log('❌ 請先設定 LINE_CHANNEL_TOKEN');
    return;
  }
  
  if (!LINE_USER_ID || LINE_USER_ID === '在此貼上你的 User ID') {
    console.log('❌ 請先設定 LINE_USER_ID');
    return;
  }
  
  const result = handleTestNotify();
  console.log('測試結果:', result ? '✅ 成功' : '❌ 失敗');
}

// 測試圖片發送（使用網路測試圖片）
function testSendImage() {
  console.log('=== testSendImage 開始 ===');
  
  if (!LINE_CHANNEL_TOKEN || LINE_CHANNEL_TOKEN === '在此貼上你的 Channel Access Token') {
    console.log('❌ 請先設定 LINE_CHANNEL_TOKEN');
    return;
  }
  
  if (!LINE_USER_ID || LINE_USER_ID === '在此貼上你的 User ID') {
    console.log('❌ 請先設定 LINE_USER_ID');
    return;
  }
  
  // 使用網路測試圖片
  const testImageUrl = 'https://via.placeholder.com/800x600/6366f1/ffffff?text=Image+Magic+Test';
  
  const result = sendLineImageMessage(LINE_USER_ID, testImageUrl, '🎩 圖文魔術師測試圖片');
  console.log('測試結果:', result.success ? '✅ 成功' : '❌ 失敗 - ' + result.message);
}

// 測試 Google Drive 上傳
function testDriveUpload() {
  console.log('=== testDriveUpload 開始 ===');
  
  // 建立一個簡單的 1x1 像素 PNG 圖片（紅色）
  // 這是最小的有效 PNG Base64
  const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8DwHwMDAwMjjAEABPkBAfkLUZcAAAAASUVORK5CYII=';
  
  const url = uploadToDrive(testBase64);
  
  if (url) {
    console.log('✅ 上傳成功！');
    console.log('URL:', url);
    console.log('請在瀏覽器開啟此 URL 確認圖片可存取');
  } else {
    console.log('❌ 上傳失敗');
  }
}

// 測試完整流程（Google Drive 上傳 + LINE 發送）
function testFullFlow() {
  console.log('=== testFullFlow 開始 ===');
  
  if (!LINE_CHANNEL_TOKEN || LINE_CHANNEL_TOKEN === '在此貼上你的 Channel Access Token') {
    console.log('❌ 請先設定 LINE_CHANNEL_TOKEN');
    return;
  }
  
  if (!LINE_USER_ID || LINE_USER_ID === '在此貼上你的 User ID') {
    console.log('❌ 請先設定 LINE_USER_ID');
    return;
  }
  
  // 建立一個簡單的測試圖片（紫色方塊）
  console.log('1. 生成測試圖片...');
  // 10x10 紫色 PNG
  const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAKklEQVR42mNgYGD4z0AEYGRk/M9AJGBiYmJgZGQkTiETI+P/////EwwAVLEHBQz/VTYAAAAASUVORK5CYII=';
  
  console.log('2. 上傳到 Google Drive...');
  const imageUrl = uploadToDrive(testBase64);
  
  if (!imageUrl) {
    console.log('❌ 上傳失敗');
    return;
  }
  console.log('圖片 URL:', imageUrl);
  
  console.log('3. 發送到 LINE...');
  const result = sendLineImageMessage(LINE_USER_ID, imageUrl, '🎩 圖文魔術師完整測試');
  
  console.log('測試結果:', result.success ? '✅ 成功！圖片已發送到 LINE' : '❌ 失敗 - ' + result.message);
}

// 使用網路圖片測試（不經過 Drive）
function testWithOnlineImage() {
  console.log('=== testWithOnlineImage 開始 ===');
  
  if (!LINE_CHANNEL_TOKEN || LINE_CHANNEL_TOKEN === '在此貼上你的 Channel Access Token') {
    console.log('❌ 請先設定 LINE_CHANNEL_TOKEN');
    return;
  }
  
  if (!LINE_USER_ID || LINE_USER_ID === '在此貼上你的 User ID') {
    console.log('❌ 請先設定 LINE_USER_ID');
    return;
  }
  
  // 使用 Unsplash 的免費圖片測試
  const testImageUrl = 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&h=600&fit=crop';
  
  console.log('使用測試圖片:', testImageUrl);
  const result = sendLineImageMessage(LINE_USER_ID, testImageUrl, '🎩 圖文魔術師網路圖片測試');
  
  console.log('測試結果:', result.success ? '✅ 成功！' : '❌ 失敗 - ' + result.message);
}

// ============================================
// 工具函數
// ============================================
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
