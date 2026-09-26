(function () {
  'use strict';

  var CFG = window.CARWASH_CONFIG;
  var KEY_STORE = 'mucar_admin_key';   // 管理密碼只存在後台，客人頁面不會讀取
  function $(id) { return document.getElementById(id); }
  function safeGet() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function safeSet(v) { try { v ? localStorage.setItem(KEY_STORE, v) : localStorage.removeItem(KEY_STORE); } catch (e) { /* 無痕模式等 */ } }

  var S = { orders: [], tiers: [], types: [], customers: [], open: null, closures: [] };

  /* ---------------- 呼叫後端（密碼失效時自動回登入畫面） ---------------- */

  function call(action, payload) {
    return Api.call(action, payload).catch(function (err) {
      if (/管理密碼錯誤/.test(err.message)) { logout(); }
      throw err;
    });
  }
  function fail(err) { U.toast(err.message, 'error'); }

  /* ---------------- 登入 / 登出 ---------------- */

  var problem = Api.configProblem();
  if (problem) { $('loginConfig').textContent = problem; $('loginConfig').hidden = false; }

  function showLogin(msg) {
    Api.key = CFG.PUBLIC_KEY;
    $('loginMask').hidden = false;
    $('adminArea').hidden = true;
    $('logoutBtn').hidden = true;
    if (msg) { $('loginError').textContent = msg; $('loginError').hidden = false; }
  }
  function showAdmin() {
    $('loginMask').hidden = true;
    $('adminArea').hidden = false;
    $('logoutBtn').hidden = false;
    $('loginError').hidden = true;
    $('loginPwd').value = '';
    initAdmin();
  }
  function logout() { safeSet(''); showLogin(); }

  function enter(key, silent) {
    Api.key = key;
    return Api.call('listRows', { sheet: 'Settings' }).then(function () {
      safeSet(key);
      showAdmin();
    }).catch(function (err) {
      showLogin(silent && /管理密碼錯誤/.test(err.message) ? '' : err.message);
      if (/管理密碼錯誤/.test(err.message)) safeSet('');
    });
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var k = $('loginPwd').value.trim();
    if (!k) return;
    $('loginBtn').disabled = true;
    enter(k, false).then(function () { $('loginBtn').disabled = false; });
  });
  $('logoutBtn').addEventListener('click', logout);

  /* ---------------- 分頁 ---------------- */

  Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (btn) {
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) { b.classList.toggle('active', b === btn); });
      Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) { p.hidden = true; });
      $('tab-' + btn.dataset.tab).hidden = false;
    });
  });

  function initAdmin() {
    setPreset('week');
    loadSettings();
    loadClosures();
    loadVehicles();
    loadCustomers();
  }

  /* ============================================================
   *  預約訂單
   * ============================================================ */

  function setPreset(p) {
    var t = U.serviceToday();
    var from = t, to = t;
    if (p === 'tomorrow') { from = to = U.addDays(t, 1); }
    else if (p === 'week') { to = U.addDays(t, 6); }
    else if (p === 'all') { from = to = ''; }
    $('ordFrom').value = from;
    $('ordTo').value = to;
    loadOrders();
  }

  function loadOrders() {
    $('ordError').hidden = true;
    return call('listOrders', { from: $('ordFrom').value, to: $('ordTo').value }).then(function (rows) {
      S.orders = rows;
      renderOrders();
      if (S.open) refreshOpen();
    }).catch(function (err) { $('ordError').textContent = err.message; $('ordError').hidden = false; });
  }

  function vehLabel(o) { return (o.vehicleBrand || '') + ' ' + (o.vehicleModel || ''); }
  function priced(o) { return !U.isTrue(o.needsPricing) && o.price !== '' && o.price != null; }

  function stateTag(o) {
    var s = U.orderState(o);
    return s === 'CANCELLED' ? '<span class="tag warn">已取消</span>' : (s === 'DONE' ? '<span class="tag">已完成</span>' : '<span class="tag ok">預約中</span>');
  }
  function verifyTag(o) {
    if (o.status !== 'ACTIVE') return '<span class="hint">—</span>';
    if (o.paymentMethod !== 'transfer') return '<span class="hint">現場付款</span>';
    return U.isTrue(o.verified) ? '<span class="tag ok">已核對</span>' : '<span class="tag amber">未核對</span>';
  }

  function renderOrders() {
    var f = $('ordStatus').value;
    var rows = S.orders.filter(function (o) { return !f || U.orderState(o) === f; });

    var active = S.orders.filter(function (o) { return o.status === 'ACTIVE'; });
    var unverified = active.filter(function (o) { return o.paymentMethod === 'transfer' && !U.isTrue(o.verified); }).length;
    var unpriced = active.filter(function (o) { return !priced(o); }).length;
    $('ordStats').innerHTML =
      '<div class="stat"><b>' + rows.length + '</b>筆</div>' +
      '<div class="stat"><b>' + unverified + '</b>匯款待核對</div>' +
      '<div class="stat"><b>' + unpriced + '</b>待報價</div>';

    var tbody = $('ordTable').querySelector('tbody');
    tbody.innerHTML = rows.map(function (o) {
      var off = o.status !== 'ACTIVE';
      return '<tr class="click' + (off ? ' off' : '') + '" data-order="' + U.esc(o.orderNo) + '">' +
        '<td><b class="strike">' + U.esc(o.serviceDay.slice(5)) + '</b><br><span class="strike">' + U.esc(o.startAt.slice(11, 16)) + '–' + U.esc(o.endAt.slice(11, 16)) + '</span></td>' +
        '<td>' + U.esc(o.customerName) + '<br><span class="hint">' + U.esc(o.phone) + '</span></td>' +
        '<td>' + U.esc(vehLabel(o)) + (U.isTrue(o.needsPricing) ? ' <span class="tag amber">待報價</span>' : '') + '</td>' +
        '<td>' + (priced(o) ? U.money(o.price) : '—') + '</td>' +
        '<td>' + (o.paymentMethod === 'transfer' ? '匯款' : '現場') + '</td>' +
        '<td>' + verifyTag(o) + '</td>' +
        '<td>' + stateTag(o) + '</td></tr>';
    }).join('');
    $('ordEmpty').hidden = rows.length > 0;
    $('ordTable').hidden = rows.length === 0;
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
    b.addEventListener('click', function () { setPreset(b.dataset.preset); });
  });
  $('ordSearch').addEventListener('click', loadOrders);
  $('ordStatus').addEventListener('change', renderOrders);
  $('ordTable').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-order]');
    if (tr) openOrder(tr.dataset.order);
  });

  /* ---------------- 訂單詳情 ---------------- */

  function kv(k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; }

  function openOrder(orderNo) {
    S.open = orderNo;
    $('orderModal').hidden = false;
    refreshOpen();
  }

  function refreshOpen() {
    var o = S.orders.filter(function (x) { return x.orderNo === S.open; })[0];
    if (!o) { $('orderModal').hidden = true; S.open = null; return; }

    $('omTitle').textContent = '訂單 ' + o.orderNo;
    $('omState').innerHTML = stateTag(o);
    var tel = String(o.phone);
    $('omTable').innerHTML =
      kv('客人', U.esc(o.customerName) + '　<a href="tel:' + U.esc(tel) + '">' + U.esc(tel) + '</a>') +
      kv('LINE / 生日', U.esc(o.lineId || '—') + '　/　' + U.esc(o.birthday || '—')) +
      kv('車型', U.esc(vehLabel(o)) + '<br><span class="hint">' + U.esc(o.tierName || '') + '</span>') +
      kv('牽車地址', U.esc(o.pickupAddress || '—') + (o.pickupAddress ? '　<a href="' + U.esc(U.mapUrl(o.pickupAddress)) + '" target="_blank" rel="noopener">開啟地圖</a>' : '')) +
      kv('預約時段', U.esc(o.startAt.slice(0, 16)) + ' ～ ' + U.esc(o.endAt.slice(11, 16))) +
      kv('付款方式', o.paymentMethod === 'transfer'
        ? '匯款<br><span class="hint">' + (U.isTrue(o.verified) ? '已核對（款項已確認）' : '未核對（等客人在官方 LINE 提供截圖與末五碼）') + '</span>'
        : '現場付款') +
      kv('客人備註', U.esc(o.note || '—').replace(/\n/g, '<br>')) +
      kv('建立時間', U.esc(o.createdAt)) +
      (o.status !== 'ACTIVE' ? kv('取消', U.esc((o.cancelledBy === 'admin' ? '店家' : '客人') + ' · ' + o.cancelledAt + (o.cancelReason ? ' · ' + o.cancelReason : ''))) : '');

    $('omPrice').value = priced(o) ? o.price : '';
    $('omPriceHint').textContent = priced(o) ? '' : '此單為「待確認車型」，請確認後填入金額。';
    $('omNote').value = o.adminNote || '';

    var active = o.status === 'ACTIVE';
    $('omSave').hidden = false;
    $('omCancel').hidden = !active;
    $('omVerify').hidden = !(active && o.paymentMethod === 'transfer');
    $('omVerify').textContent = U.isTrue(o.verified) ? '改回未核對' : '標記為已核對';
  }

  function closeOrder() { $('orderModal').hidden = true; S.open = null; }
  $('omClose').addEventListener('click', closeOrder);
  $('orderModal').addEventListener('click', function (e) { if (e.target === this) closeOrder(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOrder(); });

  $('omSave').addEventListener('click', function () {
    var body = { orderNo: S.open, adminNote: $('omNote').value };
    var p = $('omPrice').value.trim();
    if (p !== '') {
      if (isNaN(Number(p)) || Number(p) < 0) return U.toast('金額格式錯誤', 'error');
      body.price = Number(p);
    }
    $('omSave').disabled = true;
    call('updateOrder', body).then(function () { U.toast('已儲存'); return loadOrders(); })
      .catch(fail).then(function () { $('omSave').disabled = false; });
  });

  $('omVerify').addEventListener('click', function () {
    call('toggleVerified', { orderNo: S.open }).then(function () { U.toast('已更新核對狀態'); return loadOrders(); }).catch(fail);
  });

  $('omCancel').addEventListener('click', function () {
    if (!confirm('確定要取消訂單 ' + S.open + ' 嗎？\n時段會釋放，該客人的消費次數也會扣回。')) return;
    var reason = prompt('取消原因（可留空）：', '') || '';
    call('cancelOrder', { orderNo: S.open, reason: reason }).then(function () {
      U.toast('預約已取消');
      closeOrder();
      loadOrders(); loadCustomers();
    }).catch(fail);
  });

  /* ============================================================
   *  時段設定
   * ============================================================ */

  function loadSettings() {
    call('listRows', { sheet: 'Settings' }).then(function (rows) {
      var m = {};
      rows.forEach(function (r) { m[r.key] = r.value; });
      $('windowHoursSel').value = m.windowHours || '3';
    }).catch(fail);
  }

  $('saveWindowHours').addEventListener('click', function () {
    call('saveSettings', { settingKey: 'windowHours', value: $('windowHoursSel').value })
      .then(function () { U.toast('時段長度已更新，之後的新預約會套用'); }).catch(fail);
  });

  $('cloAllDay').addEventListener('change', function () { $('cloRangeFields').hidden = this.checked; });

  function loadClosures() {
    call('listRows', { sheet: 'Closure' }).then(function (rows) {
      S.closures = rows;
      renderClosures();
    }).catch(fail);
  }

  function renderClosures() {
    var today = U.serviceToday();
    var rows = S.closures.slice().sort(function (a, b) { return String(a.serviceDay).localeCompare(String(b.serviceDay)); });
    $('cloTable').querySelector('tbody').innerHTML = rows.map(function (c) {
      var range = U.isTrue(c.allDay) ? '整天' : (String(c.startAt).slice(11, 16) + ' – ' + String(c.endAt).slice(11, 16));
      var past = String(c.serviceDay) < today;
      return '<tr class="' + (past ? 'off' : '') + '"><td>' + U.esc(U.dayLabel(c.serviceDay)) + ' ' + U.esc(c.serviceDay) + '</td><td>' + range + '</td><td>' + U.esc(c.reason || '') +
        '</td><td><button class="btn btn-ghost btn-sm" data-del="' + U.esc(c.id) + '" type="button">刪除</button></td></tr>';
    }).join('');
    $('cloEmpty').hidden = rows.length > 0;
    $('cloTable').hidden = rows.length === 0;
  }

  /** 時鐘時間 → 實際日期時間（00:00–11:59 算隔天，跟後端規則一致） */
  function actualDT(day, hhmm) {
    var h = Number(hhmm.split(':')[0]);
    return (h < 12 ? U.addDays(day, 1) : day) + ' ' + hhmm + ':00';
  }

  $('cloAdd').addEventListener('click', function () {
    var err = $('cloError');
    err.hidden = true;
    var day = $('cloDate').value;
    if (!day) { err.textContent = '請選擇營業日'; err.hidden = false; return; }
    var row = { serviceDay: day, allDay: $('cloAllDay').checked, reason: $('cloReason').value.trim() };

    if (!row.allDay) {
      var s = $('cloStart').value, e = $('cloEnd').value;
      if (!s || !e) { err.textContent = '請輸入關閉的起訖時間'; err.hidden = false; return; }
      row.startAt = actualDT(day, s);
      row.endAt = actualDT(day, e);
      var open = U.wallMs(day + ' 12:00:00'), close = U.wallMs(U.addDays(day, 1) + ' 03:00:00');
      var a = U.wallMs(row.startAt), b = U.wallMs(row.endAt);
      if (!(a < b) || a < open || b > close) {
        err.textContent = '關閉時間必須在營業時間（12:00 – 隔日 03:00）內，而且結束要晚於開始。凌晨時段請填 00:00–03:00。';
        err.hidden = false;
        return;
      }
    }
    call('saveClosure', { row: row }).then(function () {
      $('cloReason').value = '';
      U.toast('已新增關閉設定');
      loadClosures();
    }).catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
  });

  $('cloTable').addEventListener('click', function (e) {
    var id = e.target.dataset.del;
    if (!id || !confirm('確定刪除這筆關閉設定嗎？')) return;
    call('deleteRow', { sheet: 'Closure', id: id }).then(function () { U.toast('已刪除'); loadClosures(); }).catch(fail);
  });

  /* ============================================================
   *  車型計價
   * ============================================================ */

  function loadVehicles() {
    return Promise.all([call('listRows', { sheet: 'VehicleTier' }), call('listRows', { sheet: 'VehicleType' })]).then(function (r) {
      S.tiers = r[0].sort(function (a, b) { return Number(a.sort) - Number(b.sort); });
      S.types = r[1];
      renderTiers();
      $('newTier').innerHTML = S.tiers.map(function (t) { return '<option value="' + U.esc(t.id) + '">' + U.esc(t.name) + '</option>'; }).join('');
      renderVehicles();
    }).catch(fail);
  }

  function renderTiers() {
    $('tierTable').querySelector('tbody').innerHTML = S.tiers.map(function (t) {
      return '<tr><td><b>' + U.esc(t.name) + '</b></td>' +
        '<td><input class="money-in" type="number" min="0" step="10" data-price="' + U.esc(t.id) + '" value="' + U.esc(t.price) + '"></td>' +
        '<td><button class="btn btn-secondary btn-sm" data-save-tier="' + U.esc(t.id) + '" type="button">儲存</button></td></tr>';
    }).join('');
  }

  $('tierTable').addEventListener('click', function (e) {
    var id = e.target.dataset.saveTier;
    if (!id) return;
    var input = $('tierTable').querySelector('input[data-price="' + id + '"]');
    var t = S.tiers.filter(function (x) { return x.id === id; })[0];
    if (input.value === '' || isNaN(Number(input.value)) || Number(input.value) < 0) return U.toast('價格格式錯誤', 'error');
    call('saveVehicleTier', { row: { id: id, name: t.name, price: Number(input.value), sort: t.sort, active: true } })
      .then(function () { U.toast(t.name + ' 價格已更新'); return loadVehicles(); }).catch(fail);
  });

  function renderVehicles() {
    var q = $('vehFilter').value.trim().toLowerCase();
    var list = S.types.filter(function (v) { return !q || (v.brand + ' ' + v.model).toLowerCase().indexOf(q) >= 0; });
    $('vehCount').textContent = '共 ' + list.length + ' 筆' + (q ? '（符合搜尋）' : '') + '；取消勾選「開放預約」的車型不會出現在前台選單。';
    $('vehTable').querySelector('tbody').innerHTML = list.map(function (v) {
      var opts = S.tiers.map(function (t) {
        return '<option value="' + U.esc(t.id) + '"' + (t.id === v.tierId ? ' selected' : '') + '>' + U.esc(t.name) + '</option>';
      }).join('');
      return '<tr><td>' + U.esc(v.brand) + '</td><td>' + U.esc(v.model) + '</td>' +
        '<td><select data-tier-of="' + U.esc(v.id) + '">' + opts + '</select></td>' +
        '<td><input type="checkbox" data-active-of="' + U.esc(v.id) + '"' + (U.isTrue(v.active) ? ' checked' : '') + '></td>' +
        '<td><button class="btn btn-ghost btn-sm" data-del-veh="' + U.esc(v.id) + '" type="button">刪除</button></td></tr>';
    }).join('');
  }

  $('vehFilter').addEventListener('input', renderVehicles);

  $('vehTable').addEventListener('change', function (e) {
    var t = e.target;
    var id = t.dataset.tierOf || t.dataset.activeOf;
    if (!id) return;
    var v = S.types.filter(function (x) { return x.id === id; })[0];
    var row = { id: id, brand: v.brand, model: v.model, sort: v.sort, tierId: v.tierId, active: U.isTrue(v.active) };
    if (t.dataset.tierOf) row.tierId = t.value; else row.active = t.checked;
    call('saveVehicleType', { row: row }).then(function () {
      v.tierId = row.tierId; v.active = row.active;
      U.toast('已儲存');
    }).catch(function (err) { fail(err); loadVehicles(); });
  });

  $('vehTable').addEventListener('click', function (e) {
    var id = e.target.dataset.delVeh;
    if (!id || !confirm('確定刪除這個車型嗎？（歷史訂單不受影響）')) return;
    call('deleteRow', { sheet: 'VehicleType', id: id }).then(function () { U.toast('已刪除'); return loadVehicles(); }).catch(fail);
  });

  $('vehAdd').addEventListener('click', function () {
    var err = $('vehError');
    err.hidden = true;
    var brand = $('newBrand').value.trim(), model = $('newModel').value.trim();
    if (!brand || !model) { err.textContent = '請輸入廠牌與型號'; err.hidden = false; return; }
    var maxSort = S.types.reduce(function (m, v) { return Math.max(m, Number(v.sort) || 0); }, 0);
    call('saveVehicleType', { row: { brand: brand, model: model, tierId: $('newTier').value, sort: maxSort + 1, active: true } })
      .then(function () {
        $('newBrand').value = ''; $('newModel').value = '';
        U.toast('已新增 ' + brand + ' ' + model);
        return loadVehicles();
      }).catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
  });

  /* ============================================================
   *  客戶 CRM
   * ============================================================ */

  function loadCustomers() {
    return call('getCustomers', { q: $('crmSearch').value.trim() }).then(function (rows) {
      S.customers = rows;
      var visits = rows.reduce(function (s, c) { return s + (Number(c.visitCount) || 0); }, 0);
      var spend = rows.reduce(function (s, c) { return s + (Number(c.totalSpend) || 0); }, 0);
      $('crmStats').innerHTML = '<div class="stat"><b>' + rows.length + '</b>位客人</div><div class="stat"><b>' + visits + '</b>次消費</div><div class="stat"><b>' + U.money(spend) + '</b>累計金額</div>';
      $('crmTable').querySelector('tbody').innerHTML = rows.map(function (c) {
        return '<tr class="click" data-phone="' + U.esc(c.phone) + '"><td><b>' + U.esc(c.name) + '</b></td><td>' + U.esc(c.phone) + '</td><td>' + U.esc(c.lineId || '—') +
          '</td><td>' + (Number(c.visitCount) || 0) + '</td><td>' + U.money(c.totalSpend || 0) + '</td><td>' + U.esc(String(c.lastOrderAt).slice(0, 16)) + '</td></tr>';
      }).join('');
      $('crmEmpty').hidden = rows.length > 0;
      $('crmTable').hidden = rows.length === 0;
    }).catch(fail);
  }

  var crmTimer = null;
  $('crmSearch').addEventListener('input', function () { clearTimeout(crmTimer); crmTimer = setTimeout(loadCustomers, 250); });

  $('crmTable').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-phone]');
    if (tr) loadHistory(tr.dataset.phone);
  });

  function loadHistory(phone) {
    call('getCustomerHistory', { phone: phone }).then(function (d) {
      var c = d.customer || {};
      var rows = d.orders.map(function (o) {
        return '<tr class="click' + (o.status !== 'ACTIVE' ? ' off' : '') + '" data-open="' + U.esc(o.orderNo) + '"><td>' + U.esc(o.orderNo) + '</td><td>' + U.esc(o.serviceDay) + '</td><td>' +
          U.esc(vehLabel(o)) + '</td><td>' + (priced(o) ? U.money(o.price) : '待報價') + '</td><td>' + stateTag(o) + '</td></tr>';
      }).join('');
      $('crmHistory').innerHTML =
        '<div class="card" style="margin-top:16px"><h2>' + U.esc(c.name || phone) + ' 的消費紀錄</h2>' +
        '<p class="hint" style="margin:4px 0 12px">' + U.esc(phone) + '　生日 ' + U.esc(c.birthday || '—') + '　共 ' + (Number(c.visitCount) || 0) + ' 次・累計 ' + U.money(c.totalSpend || 0) + '</p>' +
        '<div class="table-scroll"><table class="data" style="min-width:520px"><thead><tr><th>訂單編號</th><th>營業日</th><th>車型</th><th>金額</th><th>狀態</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
      $('crmHistory').scrollIntoView({ behavior: 'smooth', block: 'start' });
      S.historyOrders = d.orders;
    }).catch(fail);
  }

  $('crmHistory').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-open]');
    if (!tr) return;
    var o = (S.historyOrders || []).filter(function (x) { return x.orderNo === tr.dataset.open; })[0];
    if (o && !S.orders.some(function (x) { return x.orderNo === o.orderNo; })) S.orders.push(o);
    openOrder(tr.dataset.open);
  });

  /* ---------------- 啟動 ---------------- */

  var saved = safeGet();
  if (saved && !problem) enter(saved, true); else showLogin();
})();
