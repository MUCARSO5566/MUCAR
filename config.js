/* ============================================================
 *  [沐車所｜MUCAR] — 前端設定
 *  換 Apps Script 部署網址、密碼或店名時，只要改這個檔案
 * ============================================================ */
window.CARWASH_CONFIG = {
  /* Apps Script 網頁應用程式網址（結尾要是 /exec），部署完貼進來 */
  API_URL: 'https://docs.google.com/spreadsheets/d/1Vrz7ay6nWcJ7IThSASZoD-CbRvrUKyBm6tJSlHMp0Qs/edit?gid=0#gid=0',

  /* 前台公開金鑰，要跟 Code.gs 的 PUBLIC_KEY 一致（純防呆，不是真正密碼） */
  PUBLIC_KEY: 'qazb5566',

  /* 店名，顯示在頁面標題與各處 */
  SHOP_NAME: '[沐車所｜MUCAR]',

  /* 官方 LINE 連結，結帳完成頁與匯款說明會用到 */
  LINE_OA_URL: 'https://lin.ee/xUZRgxg',

  /* 匯款收款帳號，顯示在付款步驟 */
  BANK_ACCOUNT: '822-901564285392',

  /* 預約時段挑選的時間間隔（分鐘），30 = 每半小時一個選項 */
  AVAILABILITY_STEP_MIN: 30
};
