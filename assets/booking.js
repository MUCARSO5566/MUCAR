(function () {
  'use strict';

  var CFG = window.CARWASH_CONFIG;
  var STEP_MIN = CFG.AVAILABILITY_STEP_MIN || 30;

  var state = {
    tiers: [], vehicleTypes: [], settings: {},
    vehicle: null,
    serviceDay: '', selectedSlot: null, availability: null,
    orderResult: null
  };

  var el = {};
  ['fName', 'fBirthday', 'fPhone', 'fLine', 'fNote',
   'fVehicle', 'vehiclePreview',
   'fDate', 'slotArea',
   'transferFields', 'bankAccountText', 'fTransferDate', 'fLast5',
   'summaryArea', 'transferNoticeArea', 'noticeText', 'copyNotice', 'lineLink',
   'errorBox', 'dupModal', 'dupText'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  function showError(msg) {
    el.errorBox.textContent = msg;
    el.errorBox.hidden = false;
    el.errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { el.errorBox.hidden = true; }

  function showStep(n) {
    for (var i = 1; i <= 5; i++) {
      document.getElementById('step' + i).hidden = (i !== n);
    }
    document.querySelectorAll('.step-dot').forEach(function (d) {
      var s = Number(d.dataset.step);
      d.classList.toggle('active', s === n);
      d.classList.toggle('done', s < n);
    });
    clearError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function parseStr_(s) { return new Date(String(s).replace(' ', 'T')); }
  function fmtHM_(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

  /* ---------------- 開機：拿車型 / 級距 / 設定 ---------------- */

  function boot() {
    return Api.call('bootBooking', {}).then(function (data) {
      state.tiers = data.tiers || [];
      state.vehicleTypes = data.vehicleTypes || [];
      state.settings = data.settings || {};
      renderVehicleOptions();
    }).catch(function (err) { showError(err.message); });
  }

  function renderVehicleOptions() {
    var sel = el.fVehicle;
    sel.innerHTML = '<option value="">請選擇...</option>';
    state.tiers.forEach(function (tier) {
      var list = state.vehicleTypes.filter(function (v) { return String(v.tierId) === String(tier.id); });
      if (!list.length) return;
      var group = document.createElement('optgroup');
      group.label = tier.name + ' $' + tier.price;
      list.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.brand + ' ' + v.model;
        group.appendChild(opt);
      });
      sel.appendChild(group);
    });
    var other = document.createElement('option');
    other.value = 'OTHER';
    other.textContent = '找不到我的車 / 其他';
    sel.appendChild(other);
  }

  /* ---------------- Step 1 ---------------- */

  document.getElementById('toStep2').addEventListener('click', function () {
    var name = el.fName.value.trim();
    var phone = el.fPhone.value.replace(/\D/g, '');
    if (!name) return showError('請輸入姓名');
    if (phone.length < 8 || phone.length > 10) return showError('請輸入正確的聯絡電話');
    showStep(2);
  });

  /* ---------------- Step 2 ---------------- */

  el.fVehicle.addEventListener('change', function () {
    var id = el.fVehicle.value;
    if (!id) { state.vehicle = null; el.vehiclePreview.textContent = ''; return; }
    if (id === 'OTHER') {
      state.vehicle = { id: 'OTHER' };
      el.vehiclePreview.textContent = '找不到您的車型沒關係，送出後老闆會協助確認車型與價格。';
      return;
    }
    var v = state.vehicleTypes.filter(function (x) { return x.id === id; })[0];
    var tier = state.tiers.filter(function (t) { return t.id === v.tierId; })[0];
    state.vehicle = v;
    el.vehiclePreview.textContent = tier ? ('對應級距：' + tier.name + '，參考價格 $' + tier.price + '（實際金額以後端確認為準）') : '';
  });

  document.getElementById('back2').addEventListener('click', function () { showStep(1); });
  document.getElementById('toStep3').addEventListener('click', function () {
    if (!state.vehicle) return showError('請選擇車輛');
    showStep(3);
  });

  /* ---------------- Step 3：預約時段 ---------------- */

  el.fDate.addEventListener('change', function () {
    var day = el.fDate.value;
    if (!day) return;
    state.serviceDay = day;
    state.selectedSlot = null;
    document.getElementById('toStep4').disabled = true;
    el.slotArea.innerHTML = '<p class="hint">載入時段中...</p>';

    Api.call('checkAvailability', { serviceDay: day }).then(function (data) {
      state.availability = data;
      renderSlots(data);
    }).catch(function (err) { el.slotArea.innerHTML = ''; showError(err.message); });
  });

  function renderSlots(avail) {
    var start = parseStr_(avail.businessStart);
    var latest = parseStr_(avail.latestStart);
    var windowHours = avail.windowHours;
    var busy = (avail.busy || []).map(function (b) { return { start: parseStr_(b.start), end: parseStr_(b.end) }; });

    var grid = document.createElement('div');
    grid.className = 'slot-grid';
    var any = false;

    for (var t = start.getTime(); t <= latest.getTime(); t += STEP_MIN * 60000) {
      any = true;
      var slotStart = new Date(t);
      var slotEnd = new Date(t + windowHours * 3600000);
      var blocked = busy.some(function (b) { return slotStart < b.end && b.start < slotEnd; });

      var btn = document.createElement('div');
      btn.className = 'slot-btn' + (blocked ? ' disabled' : '');
      btn.textContent = fmtHM_(slotStart);
      if (!blocked) {
        btn.addEventListener('click', function (s) {
          return function () { selectSlot(s, grid); };
        }(slotStart));
      }
      grid.appendChild(btn);
    }

    el.slotArea.innerHTML = '';
    if (!any) { el.slotArea.innerHTML = '<p class="hint">這天沒有可預約的時段</p>'; return; }
    el.slotArea.appendChild(grid);
  }

  function selectSlot(slotStart, grid) {
    state.selectedSlot = slotStart;
    Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('selected'); });
    Array.prototype.forEach.call(grid.children, function (c) {
      if (c.textContent === fmtHM_(slotStart)) c.classList.add('selected');
    });
    document.getElementById('toStep4').disabled = false;
  }

  document.getElementById('back3').addEventListener('click', function () { showStep(2); });
  document.getElementById('toStep4').addEventListener('click', function () {
    if (!state.selectedSlot) return showError('請選擇預約時段');
    el.bankAccountText.textContent = CFG.BANK_ACCOUNT;
    showStep(4);
  });

  /* ---------------- Step 4：付款方式 ---------------- */

  document.querySelectorAll('input[name="payment"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      document.querySelectorAll('.radio-card').forEach(function (c) { c.classList.remove('selected'); });
      radio.closest('.radio-card').classList.add('selected');
      el.transferFields.hidden = (radio.value !== 'transfer');
    });
  });

  document.getElementById('back4').addEventListener('click', function () { showStep(3); });

  document.getElementById('submitOrder').addEventListener('click', function () {
    var payment = (document.querySelector('input[name="payment"]:checked') || {}).value;
    if (!payment) return showError('請選擇付款方式');

    var payload = buildOrderPayload(payment);
    if (payload.error) return showError(payload.error);

    var phone = payload.data.phone;
    Api.call('checkPhoneActive', { phone: phone }).then(function (res) {
      if (res.hasActive) {
        el.dupText.textContent = '電話 ' + phone + ' 已經有 ' + res.orders.length + ' 筆進行中的預約，仍要建立新的預約嗎？';
        el.dupModal.hidden = false;
        el.dupModal._confirm = function () { submitOrder(payload.data); };
      } else {
        submitOrder(payload.data);
      }
    }).catch(function (err) { showError(err.message); });
  });

  document.getElementById('dupCancel').addEventListener('click', function () { el.dupModal.hidden = true; });
  document.getElementById('dupConfirm').addEventListener('click', function () {
    el.dupModal.hidden = true;
    if (el.dupModal._confirm) el.dupModal._confirm();
  });

  function buildOrderPayload(payment) {
    if (payment === 'transfer') {
      if (!el.fTransferDate.value) return { error: '請選擇匯款日期' };
      if (!/^\d{5}$/.test(el.fLast5.value.trim())) return { error: '請輸入正確的轉出帳號末五碼（5 碼數字）' };
    }
    return {
      data: {
        name: el.fName.value.trim(),
        phone: el.fPhone.value.replace(/\D/g, ''),
        birthday: el.fBirthday.value,
        lineId: el.fLine.value.trim(),
        note: el.fNote.value.trim(),
        vehicleTypeId: state.vehicle.id,
        serviceDay: state.serviceDay,
        startTime: fmtHM_(state.selectedSlot),
        paymentMethod: payment,
        transferDate: payment === 'transfer' ? el.fTransferDate.value : '',
        transferLast5: payment === 'transfer' ? el.fLast5.value.trim() : ''
      }
    };
  }

  function submitOrder(data) {
    var btn = document.getElementById('submitOrder');
    btn.disabled = true;
    Api.call('createOrder', data).then(function (order) {
      state.orderResult = order;
      renderResult(order);
      showStep(5);
    }).catch(function (err) {
      showError(err.message);
    }).finally(function () { btn.disabled = false; });
  }

  /* ---------------- Step 5：完成 ---------------- */

  function renderResult(order) {
    el.lineLink.href = CFG.LINE_OA_URL;
    var vehicleText = order.vehicleBrand ? (order.vehicleBrand + ' ' + order.vehicleModel) : '待確認車型';
    var priceText = order.needsPricing ? '待老闆確認' : ('$' + order.price);

    el.summaryArea.innerHTML =
      '<table>' +
      '<tr><th>訂單編號</th><td>' + order.orderNo + '</td></tr>' +
      '<tr><th>車輛</th><td>' + vehicleText + '</td></tr>' +
      '<tr><th>金額</th><td>' + priceText + '</td></tr>' +
      '<tr><th>預約時段</th><td>' + order.startAt + ' ～ ' + order.endAt + '</td></tr>' +
      '<tr><th>付款方式</th><td>' + (order.paymentMethod === 'transfer' ? '匯款' : '現場付款') + '</td></tr>' +
      '</table>';

    if (order.paymentMethod === 'transfer') {
      var tpl = '【網購匯款通知】\n\n' +
        '訂單編號：' + order.orderNo + '\n' +
        '購買姓名：' + order.customerName + '\n' +
        '聯絡電話：' + order.phone + '\n' +
        '匯款日期：' + order.transferDate + '\n' +
        '匯款金額：' + (order.needsPricing ? '（待確認）' : order.price) + ' 元\n' +
        '轉出帳號末五碼：' + order.transferLast5 + '\n\n' +
        '已完成線上轉帳，請您核對。謝謝！';
      el.noticeText.textContent = tpl;
      el.transferNoticeArea.hidden = false;
    } else {
      el.transferNoticeArea.hidden = true;
    }
  }

  el.copyNotice.addEventListener('click', function () {
    navigator.clipboard.writeText(el.noticeText.textContent).then(function () {
      el.copyNotice.textContent = '已複製！';
      setTimeout(function () { el.copyNotice.textContent = '複製文字'; }, 1500);
    });
  });

  /* ---------------- 初始化 ---------------- */

  document.title = CFG.SHOP_NAME + ' — 線上預約';
  var minDate = new Date();
  el.fDate.min = minDate.toISOString().slice(0, 10);

  boot();
})();
