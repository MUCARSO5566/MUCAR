/* ============================================================
 *  與 Apps Script 溝通
 *
 *  註：Apps Script 不支援 CORS preflight，所以 POST 一律用
 *      Content-Type: text/plain（simple request，不觸發 preflight）
 *      後端用 e.postData.contents 自己 JSON.parse。
 *
 *  預設用 config.js 裡的 PUBLIC_KEY；admin.html 登入後會呼叫
 *  Api.setKey(管理密碼) 換成管理金鑰，該分頁往後的請求都會用新金鑰。
 * ============================================================ */
(function (global) {
  'use strict';

  var KEY_STORE = 'carwash_key';

  function parse(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (text.indexOf('doGet') >= 0 || text.indexOf('doPost') >= 0) {
        throw new Error('後端程式碼還沒貼上或還沒重新部署');
      }
      throw new Error('後端回應格式錯誤，請確認部署權限是「任何人」');
    }
    if (!data.ok) throw new Error(data.error || '未知錯誤');
    return data.data;
  }

  var Api = {
    key: localStorage.getItem(KEY_STORE) || (global.CARWASH_CONFIG && global.CARWASH_CONFIG.PUBLIC_KEY) || '',

    setKey: function (k) {
      this.key = k || '';
      if (k) localStorage.setItem(KEY_STORE, k);
      else localStorage.removeItem(KEY_STORE);
    },

    call: function (action, payload) {
      var body = JSON.stringify(Object.assign({ action: action, key: this.key }, payload || {}));
      return fetch(global.CARWASH_CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow'
      }).then(function (res) {
        return res.text();
      }).then(parse).catch(function (err) {
        if (err instanceof TypeError) throw new Error('連不到後端，請檢查網路或 API 網址');
        throw err;
      });
    }
  };

  global.Api = Api;
})(window);
