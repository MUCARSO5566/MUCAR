/* ============================================================
 *  與 Apps Script 溝通
 *
 *  註：Apps Script 不支援 CORS preflight，所以 POST 一律用
 *      Content-Type: text/plain（simple request，不觸發 preflight）
 *      後端用 e.postData.contents 自己 JSON.parse。
 *
 *  Api.key 預設是 config.js 的 PUBLIC_KEY（客人頁面用）。
 *  後台（admin.js）登入後會自己把 Api.key 換成管理密碼，
 *  而且管理密碼只存在後台頁面，不會被客人頁面拿去用。
 * ============================================================ */
(function (global) {
  'use strict';

  var CFG = global.CARWASH_CONFIG || {};
  var EXEC_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/|macros\/)s\/[^/]+\/exec$/;
  var LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

  /** 檢查 config.js 的 API_URL 有沒有填對；回傳問題描述，沒問題回傳空字串 */
  function configProblem() {
    var url = String(CFG.API_URL || '').trim();
    if (!url || /PUT_YOUR/.test(url)) {
      return '網站還沒設定後端網址：請在 assets/config.js 填入 Apps Script「網頁應用程式」網址（結尾是 /exec）。';
    }
    if (/docs\.google\.com\/spreadsheets/.test(url)) {
      return 'config.js 的 API_URL 填成「Google 試算表」網址了。要填的是 Apps Script 部署後的「網頁應用程式」網址：https://script.google.com/macros/s/……/exec';
    }
    if (!EXEC_RE.test(url) && !LOCAL_RE.test(url)) {
      return 'config.js 的 API_URL 格式不正確，應該長得像 https://script.google.com/macros/s/AKfyc……/exec';
    }
    return '';
  }

  /** 只有「讀取」類的請求才會自動重試一次（重送不會造成重複寫入） */
  var READS = ['ping', 'bootBooking', 'checkAvailability', 'checkPhoneActive', 'lookupOrder',
    'listOrders', 'listRows', 'getCustomers', 'getCustomerHistory'];

  var lastServerMs;

  function parse(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      var msg = (text.indexOf('doGet') >= 0 || text.indexOf('doPost') >= 0)
        ? '後端程式碼還沒貼上或還沒重新部署'
        : '後端回應格式錯誤，請確認 Apps Script 部署權限是「任何人」；如果剛剛才能用，請稍後再試一次';
      var err = new Error(msg);
      err.retryable = true;   // Google 偶爾會臨時回一頁 HTML 錯誤頁
      throw err;
    }
    lastServerMs = data.ms;
    if (!data.ok) throw new Error(data.error || '未知錯誤');
    return data.data;
  }

  var Api = {
    key: CFG.PUBLIC_KEY || '',
    configProblem: configProblem,

    call: function (action, payload) {
      var problem = configProblem();
      if (problem) return Promise.reject(new Error(problem));

      var body = JSON.stringify(Object.assign({}, payload || {}, { action: action, key: this.key }));
      function send() {
        return fetch(CFG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: body,
          redirect: 'follow'
        }).then(function (res) {
          return res.text();
        }).then(parse).catch(function (err) {
          if (err instanceof TypeError) {
            var e2 = new Error('連不到後端，請檢查網路，或確認 config.js 的 API_URL 是否正確');
            e2.retryable = true;
            throw e2;
          }
          throw err;
        });
      }

      var canRetry = READS.indexOf(action) >= 0;
      var t0 = Date.now();
      return send().catch(function (err) {
        if (!(canRetry && err.retryable)) throw err;
        return new Promise(function (r) { setTimeout(r, 900); }).then(send);
      }).then(function (data) {
        // 想知道慢在哪：開瀏覽器的開發人員工具 → Console，可以看到每個請求「總共花多久 / Apps Script 本身花多久」
        if (window.console && console.debug) console.debug('[api] ' + action + '：總共 ' + (Date.now() - t0) + ' ms，後端執行 ' + (lastServerMs == null ? '?' : lastServerMs) + ' ms');
        return data;
      });
    },

    /** 送出後不等回應、也不管成功與否（例如：預約成功後叫後端去處理排隊中的通知信）；keepalive 讓使用者關掉頁面請求也會送完 */
    fire: function (action, payload) {
      if (configProblem()) return;
      try {
        fetch(CFG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({}, payload || {}, { action: action, key: this.key })),
          redirect: 'follow',
          keepalive: true
        }).catch(function () { /* 忽略 */ });
      } catch (e) { /* 忽略 */ }
    }
  };

  global.Api = Api;
})(window);
