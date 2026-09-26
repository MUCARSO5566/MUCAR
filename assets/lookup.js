(function () {
  'use strict';

  var el = {};
  ['fPhone', 'fOrderNo', 'searchBtn', 'errorBox', 'resultArea', 'cancelBtn'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var current = null;

  function showError(msg) { el.errorBox.textContent = msg; el.errorBox.hidden = false; }
  function clearError() { el.errorBox.hidden = true; }

  function statusTag(status) {
    if (status === 'CANCELLED') return '<span class="tag warn">已取消</span>';
    return '<span class="tag ok">預約中</span>';
  }

  function render(order) {
    current = order;
    var vehicleText = order.vehicleBrand ? (order.vehicleBrand + ' ' + order.vehicleModel) : '待確認車型';
    var priceText = order.needsPricing ? '待老闆確認' : ('$' + order.price);

    el.resultArea.innerHTML =
      '<div class="card">' +
      '<h3>訂單 ' + order.orderNo + ' ' + statusTag(order.status) + '</h3>' +
      '<table>' +
      '<tr><th>姓名</th><td>' + order.customerName + '</td></tr>' +
      '<tr><th>車輛</th><td>' + vehicleText + '</td></tr>' +
      '<tr><th>金額</th><td>' + priceText + '</td></tr>' +
      '<tr><th>預約時段</th><td>' + order.startAt + ' ～ ' + order.endAt + '</td></tr>' +
      '<tr><th>付款方式</th><td>' + (order.paymentMethod === 'transfer' ? '匯款' : '現場付款') + '</td></tr>' +
      '</table>' +
      '</div>';

    el.cancelBtn.hidden = (order.status !== 'ACTIVE');
  }

  el.searchBtn.addEventListener('click', function () {
    clearError();
    el.resultArea.innerHTML = '';
    el.cancelBtn.hidden = true;

    var phone = el.fPhone.value.replace(/\D/g, '');
    var orderNo = el.fOrderNo.value.trim();
    if (!phone || !orderNo) return showError('請輸入電話與訂單編號');

    Api.call('lookupOrder', { phone: phone, orderNo: orderNo }).then(render).catch(function (err) {
      showError(err.message);
    });
  });

  el.cancelBtn.addEventListener('click', function () {
    if (!current) return;
    if (!confirm('確定要取消訂單 ' + current.orderNo + ' 嗎？取消後這個時段會釋放給其他人預約。')) return;

    Api.call('cancelOrder', { phone: current.phone, orderNo: current.orderNo }).then(function () {
      current.status = 'CANCELLED';
      render(current);
    }).catch(function (err) { showError(err.message); });
  });

  document.title = (window.CARWASH_CONFIG.SHOP_NAME) + ' — 查詢 / 取消預約';
})();
