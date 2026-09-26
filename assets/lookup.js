(function () {
  'use strict';

  var CFG = window.CARWASH_CONFIG;
  function $(id) { return document.getElementById(id); }
  var current = null;

  var problem = Api.configProblem();
  if (problem) { $('configBanner').textContent = problem; $('configBanner').hidden = false; }

  function showError(msg) { $('errorBox').textContent = msg; $('errorBox').hidden = false; }
  function clearError() { $('errorBox').hidden = true; }

  function stateTag(o) {
    var s = U.orderState(o);
    if (s === 'CANCELLED') return '<span class="tag warn">已取消</span>';
    if (s === 'DONE') return '<span class="tag">已完成</span>';
    return '<span class="tag ok">預約中</span>';
  }

  function row(k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; }

  function render(o) {
    current = o;
    var hasPrice = o.price !== '' && o.price != null;
    var priceText = !hasPrice ? '待店家確認' : (U.isTrue(o.needsPricing) ? U.money(o.price) + '（暫估，店家確認車款後為準）' : U.money(o.price));
    var state = U.orderState(o);
    var html =
      '<section class="panel" style="margin-top:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">' +
      '<h2>訂單 ' + U.esc(o.orderNo) + '</h2>' + stateTag(o) + '</div>' +
      '<table class="kv">' +
      row('姓名', U.esc(o.customerName)) +
      row('預約時段', U.esc(o.startAt.slice(0, 16)) + ' ～ ' + U.esc(o.endAt.slice(11, 16))) +
      row('車種', U.esc(o.vehicleBrand + ' ' + o.vehicleModel)) +
      row('洗車費用', U.esc(priceText)) +
      row('牽車地址', U.esc(o.pickupAddress || '—')) +
      row('付款方式', o.paymentMethod === 'transfer' ? '匯款' : '現場付款') +
      (o.note ? row('備註', U.esc(o.note)) : '') +
      '</table>';

    if (state === 'ACTIVE') {
      html += '<div class="btn-row" style="margin-top:18px">' +
        '<button class="btn btn-danger btn-block" id="cancelBtn" type="button">取消這筆預約</button></div>' +
        '<p class="hint" style="margin-top:10px">取消後時段會立即釋放；若已到預約時間或需要更改內容，請直接聯繫官方 LINE。</p>';
    } else if (state === 'DONE') {
      html += '<p class="hint" style="margin-top:14px">這筆預約的時段已結束。</p>';
    }
    html += '<div class="btn-row" style="margin-top:14px"><a class="btn btn-line btn-block" href="' + U.esc(CFG.LINE_OA_URL) + '" target="_blank" rel="noopener">聯繫官方 LINE</a></div></section>';
    $('resultArea').innerHTML = html;
  }

  function search() {
    clearError();
    $('resultArea').innerHTML = '';
    var phone = $('fPhone').value.replace(/\D/g, '');
    var orderNo = $('fOrderNo').value.trim();
    if (!phone || !orderNo) return showError('請輸入電話與訂單編號');

    var btn = $('searchBtn');
    btn.disabled = true; btn.textContent = '查詢中…';
    Api.call('lookupOrder', { phone: phone, orderNo: orderNo }).then(render).catch(function (err) {
      showError(err.message);
    }).then(function () { btn.disabled = false; btn.textContent = '查詢'; });
  }

  $('searchBtn').addEventListener('click', search);
  ['fPhone', 'fOrderNo'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
  });

  $('resultArea').addEventListener('click', function (e) {
    if (e.target.id !== 'cancelBtn' || !current) return;
    $('cancelText').textContent = '訂單 ' + current.orderNo + '（' + current.startAt.slice(0, 16) + '）。取消後這個時段會釋放給其他人預約。';
    $('cancelModal').hidden = false;
  });
  $('cancelNo').addEventListener('click', function () { $('cancelModal').hidden = true; });
  $('cancelYes').addEventListener('click', function () {
    var btn = $('cancelYes');
    btn.disabled = true;
    Api.call('cancelOrder', { phone: current.phone, orderNo: current.orderNo }).then(function () {
      $('cancelModal').hidden = true;
      current.status = 'CANCELLED';
      render(current);
      U.toast('預約已取消');
    }).catch(function (err) {
      $('cancelModal').hidden = true;
      showError(err.message);
    }).then(function () { btn.disabled = false; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $('cancelModal').hidden = true;
  });
})();
