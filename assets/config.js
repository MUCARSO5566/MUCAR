/* ============================================================
 *  [你的洗車品牌] — 前端設定
 *  換 Apps Script 部署網址、密碼或店名時，只要改這個檔案
 * ============================================================ */
window.CARWASH_CONFIG = {
  /* Apps Script 網頁應用程式網址（結尾要是 /exec），部署完貼進來 */
  API_URL: 'PUT_YOUR_APPS_SCRIPT_EXEC_URL_HERE',

  /* 前台公開金鑰，要跟 Code.gs 的 PUBLIC_KEY 一致（純防呆，不是真正密碼） */
  PUBLIC_KEY: 'carwash-public',

  /* 店名，顯示在頁面標題與各處 */
  SHOP_NAME: '[你的洗車品牌]',

  /* 官方 LINE 連結，結帳完成頁與匯款說明會用到 */
  LINE_OA_URL: 'https://lin.ee/xUZRgxg',

  /* 匯款收款帳號，顯示在付款步驟 */
  BANK_ACCOUNT: '822-901564285392',

  /* 預約時段挑選的時間間隔（分鐘），30 = 每半小時一個選項 */
  AVAILABILITY_STEP_MIN: 30
};
