/* ============================================================
 *  沐車所｜MUCAR — 前端設定
 *  ★ 這個檔案的位置一定要是 assets/config.js（網頁只會讀這一個），
 *    不要把 config.js 放到 repo 最外層。
 * ============================================================ */
window.CARWASH_CONFIG = {
  /*
   * Apps Script「網頁應用程式」網址，長得像：
   *   https://script.google.com/macros/s/AKfycb……/exec
   * 取得方式：Apps Script → 部署 → 管理部署作業 → 複製「網頁應用程式網址」。
   * ⚠️ 不是 Google 試算表的網址（docs.google.com/spreadsheets/...），貼錯網頁會顯示紅色提示。
   */
  API_URL: 'https://script.google.com/macros/s/AKfycbyaAwZK19VEdhTFm0P6k14FxQwuPFX1Kw5Yd3ccaTzqlS6E3NsGEvGyuBR2PQq1mOfy/exec',

  /* 前台公開金鑰，要跟 Code.gs 的 PUBLIC_KEY 一致（純防呆，不是真正密碼） */
  PUBLIC_KEY: 'qazb55665566',

  /* 店名 */
  SHOP_NAME: '沐車所｜MUCAR',

  /* 官方 LINE 連結 */
  LINE_OA_URL: 'https://lin.ee/xUZRgxg',

  /* 匯款收款帳號，顯示在付款步驟 */
  BANK_ACCOUNT: '822-901564285392',

  /* 預約時段挑選的時間間隔（分鐘），30 = 每半小時一個選項 */
  AVAILABILITY_STEP_MIN: 30
};
