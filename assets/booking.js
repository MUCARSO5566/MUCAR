(function () {
  'use strict';

  var CFG = window.CARWASH_CONFIG;
  var STEP_MIN = Number(CFG.AVAILABILITY_STEP_MIN) || 30;
  var OTHER = '__OTHER__';
  var DAYS_AHEAD = 21;

  function $(id) { return document.getElementById(id); }

  var S = {
    step: 1,
    tiers: [], types: [], loaded: false,
    vehicle: null,          // 車型物件，或 { id: 'OTHER' }
    day: '', slot: null, avail: null, availSeq: 0,
    payment: '', order: null
  };

  /* ---------------- 共用 ---------------- */

  function showError(msg) {
    var box = $('errorBox');
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { $('errorBox').hidden = true; }

  function setErr(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  function mark(inputId, bad) {
    var el = $(inputId);
    if (el) el.setAttribute('aria-invalid', bad ? 'true' : 'false');
  }

  function tierOf(v) {
    return S.tiers.filter(function (t) { return String(t.id) === String(v.tierId); })[0] || null;
  }

  function vehicleText() {
    if (!S.vehicle) return '';
    if (S.vehicle.id === 'OTHER') return '其他：' + $('fOther').value.trim();
    return S.vehicle.brand + ' ' + S.vehicle.model;
  }

  function priceInfo() {
    if (!S.vehicle || S.vehicle.id === 'OTHER') return { tier: '待店家確認車型', price: null };
    var t = tierOf(S.vehicle);
    return { tier: t ? t.name : '', price: t ? Number(t.price) : null };
  }

  function windowHours() { return S.avail ? Number(S.avail.windowHours) : 3; }

  function slotRange(ms) {
    var end = ms + windowHours() * 3600000;
    var nextDay = new Date(end).getUTCDate() !== new Date(ms).getUTCDate();
    return U.hm(ms) + ' – ' + (nextDay ? '隔日 ' : '') + U.hm(end);
  }

  function slotText() {
    if (!S.slot) return '';
    var startsNextDay = new Date(S.slot).getUTCHours() < 12;
    var label = U.dayLabel(startsNextDay ? U.addDays(S.day, 1) : S.day);
    return label + ' ' + slotRange(S.slot);
  }

  /* ---------------- 步驟導覽 ---------------- */

  var LABELS = { 1: '下一步', 2: '下一步', 3: '下一步', 4: '下一步', 5: '送出預約' };

  function go(n) {
    S.step = n;
    for (var i = 1; i <= 5; i++) $('step' + i).hidden = (i !== n);
    $('stepDone').hidden = true;
    var items = document.querySelectorAll('#stepper li');
    Array.prototype.forEach.call(items, function (li, idx) {
      li.classList.toggle('active', idx + 1 === n);
      li.classList.toggle('done', idx + 1 < n);
    });
    $('btnBack').hidden = (n === 1);
    $('btnNext').textContent = LABELS[n];
    $('btnNext').disabled = (n === 5 && !$('fAgree').checked);
    clearError();
    renderSummary();
    if (n === 3 && !S.day) selectDay(U.serviceToday());
    if (n === 4) prepPayment();
    if (n === 5) renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSummary() {
    var chips = [];
    if (S.step >= 3 && S.vehicle) {
      var p = priceInfo();
      chips.push('<span class="chip"><b>' + U.esc(vehicleText()) + '</b>' + (p.price != null ? ' · ' + U.money(p.price) : ' · 待確認') + '</span>');
    }
    if (S.step >= 4 && S.slot) chips.push('<span class="chip"><b>' + U.esc(slotText()) + '</b></span>');
    var box = $('summary');
    box.innerHTML = chips.join('');
    box.hidden = !chips.length;
  }

  /* ---------------- Step 1 ---------------- */

  function validateStep1() {
    var ok = true;
    var name = $('fName').value.trim();
    var phone = $('fPhone').value.replace(/\D/g, '');
    setErr('errName', ''); setErr('errPhone', '');
    mark('fName', false); mark('fPhone', false);
    if (!name) { setErr('errName', '請輸入姓名'); mark('fName', true); ok = false; }
    if (phone.length < 8 || phone.length > 10) { setErr('errPhone', '請輸入正確的聯絡電話（例如 0912345678）'); mark('fPhone', true); ok = false; }
    if (!ok) (name ? $('fPhone') : $('fName')).focus();
    return ok;
  }

  /* ---------------- Step 2：車型 ---------------- */

  function loadVehicles() {
    $('vehLoading').hidden = false;
    $('vehFail').hidden = true;
    $('vehForm').hidden = true;

    var problem = Api.configProblem();
    if (problem) {
      $('configBanner').textContent = problem;
      $('configBanner').hidden = false;
    }

    return Api.call('bootBooking', {}).then(function (data) {
      S.tiers = data.tiers || [];
      S.types = (data.vehicleTypes || []).filter(function (v) { return !!tierOf(v); });
      if (!S.types.length) throw new Error('目前沒有可選的車型，請聯絡店家。');
      S.loaded = true;
      renderBrands();
      $('vehLoading').hidden = true;
      $('vehForm').hidden = false;
    }).catch(function (err) {
      S.loaded = false;
      $('vehLoading').hidden = true;
      $('vehFailMsg').textContent = '無法載入車型資料：' + err.message;
      $('vehFail').hidden = false;
    });
  }

  function renderBrands() {
    var brands = [];
    S.types.forEach(function (v) { if (brands.indexOf(v.brand) < 0) brands.push(v.brand); });
    brands.sort(function (a, b) { return a.localeCompare(b, 'en'); });
    $('fBrand').innerHTML = '<option value="">請選擇廠牌</option>' +
      brands.map(function (b) { return '<option value="' + U.esc(b) + '">' + U.esc(b) + '</option>'; }).join('') +
      '<option value="' + OTHER + '">其他 / 找不到我的車</option>';
    onBrandChange();
  }

  function onBrandChange() {
    var brand = $('fBrand').value;
    S.vehicle = null;
    $('pricePreview').hidden = true;
    $('otherField').hidden = (brand !== OTHER);
    $('modelField').hidden = (brand === OTHER);

    if (brand === OTHER) {
      S.vehicle = { id: 'OTHER' };
      showPreview();
      return;
    }
    var sel = $('fModel');
    if (!brand) {
      sel.disabled = true;
      sel.innerHTML = '<option value="">請先選擇廠牌</option>';
      return;
    }
    var models = S.types.filter(function (v) { return v.brand === brand; })
      .sort(function (a, b) { return String(a.model).localeCompare(String(b.model), 'en', { numeric: true }); });
    sel.disabled = false;
    sel.innerHTML = '<option value="">請選擇車型</option>' + models.map(function (v) {
      var t = tierOf(v);
      return '<option value="' + U.esc(v.id) + '">' + U.esc(v.model) + (t ? '　' + U.esc(t.name) : '') + '</option>';
    }).join('');
  }

  function onModelChange() {
    var id = $('fModel').value;
    S.vehicle = S.types.filter(function (v) { return v.id === id; })[0] || null;
    mark('fModel', false);
    showPreview();
  }

  function showPreview() {
    if (!S.vehicle) { $('pricePreview').hidden = true; return; }
    var p = priceInfo();
    $('ppTier').textContent = p.tier ? '車型級距：' + p.tier : '';
    $('ppPrice').textContent = p.price != null ? U.money(p.price) : '待店家確認';
    $('pricePreview').hidden = false;
  }

  function validateStep2() {
    mark('fBrand', false); mark('fModel', false); mark('fOther', false);
    if (!S.loaded) { showError('車型資料尚未載入，請按「重新載入」。'); return false; }
    if (!$('fBrand').value) { mark('fBrand', true); showError('請選擇廠牌'); $('fBrand').focus(); return false; }
    if ($('fBrand').value === OTHER) {
      if (!$('fOther').value.trim()) { mark('fOther', true); showError('請填寫您的車款'); $('fOther').focus(); return false; }
      return true;
    }
    if (!S.vehicle) { mark('fModel', true); showError('請選擇車型'); $('fModel').focus(); return false; }
    return true;
  }

  /* ---------------- Step 3：地址與時段 ---------------- */

  function renderDates() {
    var today = U.serviceToday();
    var html = '';
    for (var i = 0; i < DAYS_AHEAD; i++) {
      var d = U.addDays(today, i);
      var sub = i === 0 ? '今天' : (i === 1 ? '明天' : U.weekday(d));
      var md = new Date(U.wallMs(d));
      html += '<button type="button" class="date-chip' + (d === S.day ? ' selected' : '') + '" data-day="' + d + '">' +
        '<small>' + sub + '</small><b>' + (md.getUTCMonth() + 1) + '/' + md.getUTCDate() + '</b></button>';
    }
    $('dates').innerHTML = html;
  }

  function selectDay(day) {
    S.day = day;
    S.slot = null;
    $('picked').hidden = true;
    renderDates();
    var seq = ++S.availSeq;
    $('slotArea').innerHTML = '<p class="hint">載入時段中…</p>';

    Api.call('checkAvailability', { serviceDay: day }).then(function (data) {
      if (seq !== S.availSeq) return;
      S.avail = data;
      renderSlots();
    }).catch(function (err) {
      if (seq !== S.availSeq) return;
      $('slotArea').innerHTML = '<div class="alert alert-danger">無法載入時段：' + U.esc(err.message) +
        '<br><button type="button" class="btn btn-secondary btn-sm" id="slotRetry">重新載入</button></div>';
    });
  }

  function renderSlots() {
    var a = S.avail;
    var start = U.wallMs(a.businessStart), latest = U.wallMs(a.latestStart);
    var now = U.wallMs(a.now), win = Number(a.windowHours) * 3600000;
    var busy = (a.busy || []).map(function (b) { return { s: U.wallMs(b.start), e: U.wallMs(b.end) }; });

    var groups = { pm: [], eve: [], night: [] };
    var anyOpen = false;

    for (var t = start; t <= latest; t += STEP_MIN * 60000) {
      var past = t <= now;
      var full = busy.some(function (b) { return t < b.e && b.s < t + win; });
      var disabled = past || full;
      if (!disabled) anyOpen = true;
      var h = new Date(t).getUTCHours();
      var g = h < 12 ? 'night' : (h < 18 ? 'pm' : 'eve');
      groups[g].push(
        '<button type="button" class="slot' + (t === S.slot ? ' selected' : '') + '" data-ms="' + t + '"' +
        (disabled ? ' disabled title="' + (past ? '已過' : '已被預約') + '"' : '') + '>' +
        U.hm(t) + (g === 'night' ? '<small>隔日</small>' : '') + '</button>');
    }

    var titles = { pm: '下午', eve: '晚間', night: '凌晨（隔日）' };
    var html = '';
    ['pm', 'eve', 'night'].forEach(function (k) {
      if (!groups[k].length) return;
      html += '<div class="slot-group"><h3>' + titles[k] + '</h3><div class="slot-grid">' + groups[k].join('') + '</div></div>';
    });
    if (!anyOpen) html = '<div class="alert alert-warn" style="margin-top:14px">這一天已額滿或時段已過，請選擇其他日期。</div>' + html;

    html += '<div class="legend"><span><i></i>可預約</span><span><i class="full"></i>已滿 / 已過</span><span><i class="sel"></i>已選擇</span></div>' +
      '<div class="hint">每筆預約約佔用 ' + a.windowHours + ' 小時；請選擇「專員到府牽車」的時間。</div>';
    $('slotArea').innerHTML = html;
    showPicked();
  }

  function selectSlot(ms) {
    S.slot = ms;
    Array.prototype.forEach.call(document.querySelectorAll('.slot'), function (b) {
      b.classList.toggle('selected', Number(b.dataset.ms) === ms);
    });
    showPicked();
  }

  function showPicked() {
    var el = $('picked');
    if (!S.slot) { el.hidden = true; return; }
    el.textContent = '已選擇：' + slotText() + '（約 ' + windowHours() + ' 小時）';
    el.hidden = false;
  }

  function validateStep3() {
    var addr = $('fAddress').value.trim();
    setErr('errAddress', ''); mark('fAddress', false);
    if (addr.length < 5) {
      setErr('errAddress', '請填寫完整的牽車地址（縣市、路名、門牌）');
      mark('fAddress', true);
      $('fAddress').focus();
      return false;
    }
    if (!S.day) { showError('請選擇預約日期'); return false; }
    if (!S.slot) { showError('請選擇預約時段'); return false; }
    return true;
  }

  /* ---------------- Step 4：付款 ---------------- */

  function prepPayment() {
    $('bankAccount').textContent = CFG.BANK_ACCOUNT;
    var p = priceInfo();
    $('bankHint').textContent = p.price != null
      ? '洗車費用 ' + U.money(p.price) + '；牽車費用依實際距離評估，由店家確認後另行通知。'
      : '費用由店家確認車型與距離後通知。';
  }

  function onPayChange() {
    var v = (document.querySelector('input[name="payment"]:checked') || {}).value || '';
    S.payment = v;
    $('payTransferLabel').classList.toggle('selected', v === 'transfer');
    $('payOnsiteLabel').classList.toggle('selected', v === 'onsite');
    $('transferFields').hidden = (v !== 'transfer');
    clearError();
  }

  function validateStep4() {
    if (!S.payment) { showError('請選擇付款方式'); return false; }
    return true;
  }

  /* ---------------- Step 5：確認 ---------------- */

  function row(k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; }

  function renderReview() {
    var p = priceInfo();
    var html =
      row('姓名', U.esc($('fName').value.trim())) +
      row('電話', U.esc($('fPhone').value.replace(/\D/g, ''))) +
      row('車型', U.esc(vehicleText()) + (p.tier ? '<br><span class="hint">' + U.esc(p.tier) + '</span>' : '')) +
      row('洗車費用', p.price != null ? U.money(p.price) : '待店家確認') +
      row('牽車地址', U.esc($('fAddress').value.trim()).replace(/\n/g, '<br>')) +
      row('預約時段', U.esc(slotText())) +
      row('付款方式', S.payment === 'transfer'
        ? '匯款<br><span class="hint">匯款後請把截圖與轉出帳號末五碼傳到官方 LINE</span>'
        : '現場付款');
    var note = $('fNote').value.trim();
    if (note) html += row('備註', U.esc(note).replace(/\n/g, '<br>'));
    $('reviewTable').innerHTML = html;
  }

  /* ---------------- 送出 ---------------- */

  function payload() {
    var isOther = S.vehicle.id === 'OTHER';
    return {
      name: $('fName').value.trim(),
      phone: $('fPhone').value.replace(/\D/g, ''),
      birthday: $('fBirthday').value,
      lineId: $('fLine').value.trim(),
      note: $('fNote').value.trim(),
      pickupAddress: $('fAddress').value.trim(),
      vehicleTypeId: isOther ? 'OTHER' : S.vehicle.id,
      otherVehicle: isOther ? $('fOther').value.trim() : '',
      serviceDay: S.day,
      startTime: U.hm(S.slot),
      paymentMethod: S.payment
    };
  }

  function setBusy(on) {
    $('btnNext').disabled = on;
    $('btnBack').disabled = on;
    $('btnNext').textContent = on ? '送出中…' : LABELS[5];
  }

  function submit() {
    if (!$('fAgree').checked) return showError('請先勾選同意服務須知');
    setBusy(true);
    clearError();
    var data = payload();

    Api.call('checkPhoneActive', { phone: data.phone }).then(function (res) {
      if (res.hasActive) {
        $('dupText').textContent = '電話 ' + data.phone + ' 目前已有 ' + res.orders.length + ' 筆進行中的預約，確定還要再預約一筆嗎？';
        $('dupModal').hidden = false;
        $('dupConfirm').focus();
        return null;
      }
      return create(data);
    }).catch(function (err) {
      setBusy(false);
      $('btnNext').disabled = !$('fAgree').checked;
      showError(err.message);
    });
  }

  function create(data) {
    return Api.call('createOrder', data).then(function (order) {
      S.order = order;
      showDone(order);
    }).catch(function (err) {
      setBusy(false);
      $('btnNext').disabled = !$('fAgree').checked;
      if (/時段|已被預約|已經過了|可預約範圍/.test(err.message)) {
        go(3);
        selectDay(S.day);
        showError(err.message + '（請重新選擇時段）');
      } else {
        showError(err.message);
      }
    });
  }

  /* ---------------- 完成頁 ---------------- */

  function showDone(o) {
    for (var i = 1; i <= 5; i++) $('step' + i).hidden = true;
    $('stepDone').hidden = false;
    $('actionbar').hidden = true;
    $('summary').hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll('#stepper li'), function (li) { li.className = 'done'; });
    clearError();

    $('doneOrderNo').textContent = o.orderNo;
    $('lineLink').href = CFG.LINE_OA_URL;

    var priced = !o.needsPricing && o.price !== '' && o.price != null;
    $('doneTable').innerHTML =
      row('預約時段', U.esc(o.startAt.slice(5, 16)) + ' ～ ' + U.esc(o.endAt.slice(5, 16))) +
      row('車型', U.esc(o.vehicleBrand + ' ' + o.vehicleModel)) +
      row('洗車費用', priced ? U.money(o.price) : '待店家確認') +
      row('牽車地址', U.esc(o.pickupAddress)) +
      row('付款方式', o.paymentMethod === 'transfer' ? '匯款' : '現場付款');

    if (o.paymentMethod === 'transfer') {
      var n = U.taipeiNow();
      var eg = n.y + '/' + U.pad2(n.M) + '/' + U.pad2(n.d);
      $('noticeText').textContent = [
        '【網購匯款通知】',
        '',
        '* 訂單編號：' + o.orderNo,
        '* 購買姓名：' + o.customerName,
        '* 聯絡電話：' + o.phone,
        '* 匯款日期：[年/月/日，如：' + eg + ']',
        '* 匯款金額：' + (priced ? o.price : '[待店家確認後填寫]') + ' 元',
        '* 轉出帳號末五碼：[請填寫您用來轉帳的帳戶末 5 碼]',
        '',
        '已完成線上轉帳，請您核對。謝謝！'
      ].join('\n');
      $('transferNoticeArea').hidden = false;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 事件綁定 ---------------- */

  $('btnNext').addEventListener('click', function () {
    var n = S.step;
    if (n === 1 && validateStep1()) go(2);
    else if (n === 2 && validateStep2()) go(3);
    else if (n === 3 && validateStep3()) go(4);
    else if (n === 4 && validateStep4()) go(5);
    else if (n === 5) submit();
  });
  $('btnBack').addEventListener('click', function () { if (S.step > 1) go(S.step - 1); });

  $('fBrand').addEventListener('change', onBrandChange);
  $('fModel').addEventListener('change', onModelChange);
  $('vehRetry').addEventListener('click', loadVehicles);

  $('dates').addEventListener('click', function (e) {
    var b = e.target.closest('.date-chip');
    if (b) selectDay(b.dataset.day);
  });
  $('slotArea').addEventListener('click', function (e) {
    var s = e.target.closest('.slot');
    if (s && !s.disabled) return selectSlot(Number(s.dataset.ms));
    if (e.target.id === 'slotRetry') selectDay(S.day);
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="payment"]'), function (r) {
    r.addEventListener('change', onPayChange);
  });
  $('fAgree').addEventListener('change', function () { $('btnNext').disabled = !this.checked; });

  $('copyBank').addEventListener('click', function () {
    U.copyText(CFG.BANK_ACCOUNT.replace(/\D/g, '')).then(function () { U.toast('帳號已複製'); }, function () { U.toast('複製失敗，請手動選取', 'error'); });
  });
  $('copyNotice').addEventListener('click', function () {
    U.copyText($('noticeText').textContent).then(function () { U.toast('已複製，請貼到官方 LINE'); }, function () { U.toast('複製失敗，請手動選取文字', 'error'); });
  });

  $('dupCancel').addEventListener('click', function () {
    $('dupModal').hidden = true;
    setBusy(false);
    $('btnNext').disabled = !$('fAgree').checked;
  });
  $('dupConfirm').addEventListener('click', function () {
    $('dupModal').hidden = true;
    create(payload());
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('dupModal').hidden) $('dupCancel').click();
  });

  /* ---------------- 初始化 ---------------- */

  MUCAR_CONTENT.renderFlow($('noticeFlow'));
  MUCAR_CONTENT.renderTips($('noticeTips'));
  renderDates();
  go(1);
  loadVehicles();
})();
