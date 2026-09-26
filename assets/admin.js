(function () {
  'use strict';

  var CFG = window.CARWASH_CONFIG;
  var KEY_STORE = 'mucar_admin_key';   // 管理密碼只存在後台，客人頁面不會讀取
  function $(id) { return document.getElementById(id); }
  function safeGet() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function safeSet(v) { try { v ? localStorage.setItem(KEY_STORE, v) : localStorage.removeItem(KEY_STORE); } catch (e) { /* 無痕模式等 */ } }

  var REQUIRED_BACKEND = 7;   // 這版網站需要的後端 Code.gs 版本（CODE_VER）
  var S = { calMode: 'auto', orders: [], tiers: [], types: [], customers: [], open: null, closures: [] };

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

  /** 檢查已部署的後端是不是最新版；舊版會出現各種奇怪問題，所以直接提醒 */
  function checkBackendVersion() {
    if (problem) return;
    Api.call('ping', {}).then(function (v) {
      if (Number(v.version) < REQUIRED_BACKEND) {
        $('verBanner').innerHTML = '<b>後端程式還不是最新版</b>（目前 v' + U.esc(v.version) + '，這個網站需要 v' + REQUIRED_BACKEND + ' 以上）。' +
          '請把最新的 Code.gs 整份貼進 Apps Script，再用「部署 → 管理部署作業 → 編輯 → 版本選新版本」重新部署（不要用「新增部署作業」，那會產生新網址）。';
        $('verBanner').hidden = false;
      }
    }).catch(function () { /* 連不到就先不提示 */ });
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var k = $('loginPwd').value.trim();
    if (!k) return;
    if (k === CFG.PUBLIC_KEY) {
      $('loginError').textContent = '這是前台金鑰（PUBLIC_KEY），不能當後台密碼。請輸入你在 Code.gs 設定的 ADMIN_KEY。';
      $('loginError').hidden = false;
      return;
    }
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
      btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      try { sessionStorage.setItem('mucar_admin_tab', btn.dataset.tab); } catch (e) { /* ignore */ }
    });
  });

  function initAdmin() {
    setPreset('week');
    loadSettings();
    loadClosures();
    loadVehicles();
    loadCustomers();
    loadNotify();
    var t = '';
    try { t = sessionStorage.getItem('mucar_admin_tab') || ''; } catch (e) { /* ignore */ }
    var tb = t && document.querySelector('[data-tab="' + t + '"]');
    if (tb) tb.click();
  }

  /* ============================================================
   *  預約訂單
   * ============================================================ */

  function markPreset(p) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
      b.classList.toggle('active', b.dataset.preset === p);
    });
  }

  function setPreset(p) {
    markPreset(p);
    var t = U.serviceToday();
    var from = t, to = t;
    if (p === 'tomorrow') { from = to = U.addDays(t, 1); }
    else if (p === 'week') { to = U.addDays(t, 6); }
    else if (p === 'all') { from = to = ''; }
    $('ordFrom').value = from;
    $('ordTo').value = to;
    loadOrders();
  }

  function showRange() {
    var f = $('ordFrom').value, t = $('ordTo').value;
    $('ordRange').textContent = f || t ? '（' + (f || '…') + ' ～ ' + (t || '…') + '）' : '（全部日期）';
  }

  function loadOrders() {
    showRange();
    $('ordError').hidden = true;
    return call('listOrders', { from: $('ordFrom').value, to: $('ordTo').value }).then(function (rows) {
      S.orders = rows;
      renderOrders();
      if (S.open) refreshOpen();
    }).catch(function (err) { $('ordError').textContent = err.message; $('ordError').hidden = false; });
  }

  function vehLabel(o) { return (o.vehicleBrand || '') + ' ' + (o.vehicleModel || ''); }
  function hasPrice(o) { return o.price !== '' && o.price != null; }
  function needsConfirm(o) { return U.isTrue(o.needsPricing); }

  function stateTag(o) {
    var s = U.orderState(o);
    return s === 'CANCELLED' ? '<span class="tag warn">已取消</span>' : (s === 'DONE' ? '<span class="tag">已完成</span>' : '<span class="tag ok">預約中</span>');
  }
  function verifyTag(o) {
    if (o.status !== 'ACTIVE') return '<span class="hint">—</span>';
    if (o.paymentMethod !== 'transfer') return '';
    return U.isTrue(o.verified) ? '<span class="tag ok">已核對</span>' : '<span class="tag amber">未核對</span>';
  }

  /* 注意：下面每一列 <td> 的順序要跟 style.css 裡 table.t-orders 的 nth-child 卡片版面一致 */
  function renderOrders() {
    var f = $('ordStatus').value;
    var rows = S.orders.filter(function (o) { return !f || U.orderState(o) === f; });

    var active = S.orders.filter(function (o) { return o.status === 'ACTIVE'; });
    var unverified = active.filter(function (o) { return o.paymentMethod === 'transfer' && !U.isTrue(o.verified); }).length;
    var unpriced = active.filter(needsConfirm).length;
    $('ordStats').innerHTML =
      '<div class="stat"><b>' + rows.length + '</b>筆</div>' +
      '<div class="stat"><b>' + unverified + '</b>匯款待核對</div>' +
      '<div class="stat"><b>' + unpriced + '</b>待確認</div>';

    var tbody = $('ordTable').querySelector('tbody');
    tbody.innerHTML = rows.map(function (o) {
      var off = o.status !== 'ACTIVE';
      return '<tr class="click' + (off ? ' off' : '') + '" data-order="' + U.esc(o.orderNo) + '">' +
        '<td><b class="strike">' + U.esc(o.serviceDay.slice(5)) + '</b><br><span class="strike">' + U.esc(o.startAt.slice(11, 16)) + '–' + U.esc(o.endAt.slice(11, 16)) + '</span></td>' +
        '<td>' + U.esc(o.customerName) + '<br><span class="hint">' + U.esc(o.phone) + '</span></td>' +
        '<td>' + U.esc(vehLabel(o)) + (needsConfirm(o) ? ' <span class="tag amber">待確認</span>' : '') + '</td>' +
        '<td>' + (hasPrice(o) ? U.money(o.price) : '—') + '</td>' +
        '<td>' + (o.paymentMethod === 'transfer' ? '匯款' : '現場') + '</td>' +
        '<td>' + verifyTag(o) + '</td>' +
        '<td>' + stateTag(o) + '</td></tr>';
    }).join('');
    $('ordEmpty').hidden = rows.length > 0;
    $('ordTable').hidden = rows.length === 0;
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[name="calMode"]'), function (r) {
    r.addEventListener('change', function () {
      Array.prototype.forEach.call(document.querySelectorAll('input[name="calMode"]'), function (x) {
        x.closest('label').classList.toggle('selected', x.checked);
      });
    });
  });

  function inCalendar(o) { var id = String(o.calendarEventId || ''); return id !== '' && id !== 'SKIP'; }

  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
    b.addEventListener('click', function () { setPreset(b.dataset.preset); });
  });
  $('ordSearch').addEventListener('click', loadOrders);
  ['ordFrom', 'ordTo'].forEach(function (id) {
    $(id).addEventListener('change', function () { markPreset(''); loadOrders(); });
  });
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
    U.lockScroll(true);
    refreshOpen();
  }

  function refreshOpen() {
    var o = S.orders.filter(function (x) { return x.orderNo === S.open; })[0];
    if (!o) { $('orderModal').hidden = true; U.lockScroll(false); S.open = null; return; }

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
      kv('Google 日曆', S.calMode === 'off' ? '<span class="hint">日曆功能已關閉</span>' : (inCalendar(o) ? '已加入「沐車所預約」日曆' : '未加入')) +
      kv('建立時間', U.esc(o.createdAt)) +
      (o.status !== 'ACTIVE' ? kv('取消', U.esc((o.cancelledBy === 'admin' ? '店家' : '客人') + ' · ' + o.cancelledAt + (o.cancelReason ? ' · ' + o.cancelReason : ''))) : '');

    $('omPrice').value = hasPrice(o) ? o.price : '';
    $('omPriceHint').textContent = !needsConfirm(o) ? '' :
      (hasPrice(o) ? '客人自選車型，金額為暫估。確認車款後按「儲存」即可取消「待確認」標記。' : '此單為「待確認車型」，請確認後填入金額。');
    $('omNote').value = o.adminNote || '';

    var active = o.status === 'ACTIVE';
    $('omSave').hidden = false;
    $('omCancel').hidden = !active;
    $('omVerify').hidden = !(active && o.paymentMethod === 'transfer');
    $('omVerify').textContent = U.isTrue(o.verified) ? '改回未核對' : '標記為已核對';
    $('omCal').hidden = !(active && S.calMode !== 'off');
    $('omCal').textContent = inCalendar(o) ? '移出 Google 日曆' : '加入 Google 日曆';
  }

  function closeOrder() { $('orderModal').hidden = true; U.lockScroll(false); S.open = null; }
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

  $('omCal').addEventListener('click', function () {
    var o = S.orders.filter(function (x) { return x.orderNo === S.open; })[0];
    if (!o) return;
    var add = !inCalendar(o);
    $('omCal').disabled = true;
    call('setOrderCalendar', { orderNo: S.open, on: add }).then(function () {
      U.toast(add ? '已加入 Google 日曆' : '已從 Google 日曆移出');
      return loadOrders();
    }).catch(fail).then(function () { $('omCal').disabled = false; });
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
          U.esc(vehLabel(o)) + '</td><td>' + (hasPrice(o) ? U.money(o.price) : '待報價') + '</td><td>' + stateTag(o) + '</td></tr>';
      }).join('');
      $('crmHistory').innerHTML =
        '<div class="card" style="margin-top:16px"><h2>' + U.esc(c.name || phone) + ' 的消費紀錄</h2>' +
        '<p class="hint" style="margin:4px 0 12px">' + U.esc(phone) + '　生日 ' + U.esc(c.birthday || '—') + '　共 ' + (Number(c.visitCount) || 0) + ' 次・累計 ' + U.money(c.totalSpend || 0) + '</p>' +
        '<div class="table-scroll"><table class="data cardify t-hist" style="min-width:520px"><thead><tr><th>訂單編號</th><th>營業日</th><th>車型</th><th>金額</th><th>狀態</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
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

  /* ============================================================
   *  通知與日曆
   * ============================================================ */

  function showNotify(st) {
    $('ntMailOn').checked = !!st.notifyEnabled;
    S.calMode = st.calendarMode || (st.calendarEnabled ? 'auto' : 'off');
    Array.prototype.forEach.call(document.querySelectorAll('input[name="calMode"]'), function (r) {
      r.checked = (r.value === S.calMode);
      r.closest('label').classList.toggle('selected', r.checked);
    });
    $('ntEmails').value = (st.emails || []).join('\n');
    $('ntSender').textContent = st.sender || '（部署 Apps Script 的 Google 帳號）';
    $('ntSenderName').textContent = st.senderName || '';
    $('ntQuota').textContent = st.quota == null ? '—' : st.quota + ' 封';
    $('ntCalName').textContent = st.calendarName || '沐車所預約';
    $('ntCalState').textContent = st.calendarReady ? '已建立，運作中' : '尚未建立（收到第一筆預約或按「測試日曆連線」時會自動建立）';
    var le = $('ntLastError');
    if (st.lastError) {
      le.innerHTML = '<b>上一次通知失敗</b>（' + U.esc(st.lastError.at) + '）：' + U.esc(st.lastError.msg);
      le.hidden = false;
    } else {
      le.hidden = true;
    }
  }

  function loadNotify() {
    call('getNotifyStatus', {}).then(showNotify).catch(function (err) {
      $('ntError').textContent = /未知的 action/.test(err.message)
        ? '後端程式還不是最新版，請重新貼上 Code.gs 並部署新版本。' : err.message;
      $('ntError').hidden = false;
    });
  }

  $('ntSave').addEventListener('click', function () {
    $('ntError').hidden = true;
    $('ntSave').disabled = true;
    call('saveNotifySettings', {
      emails: $('ntEmails').value,
      notifyEnabled: $('ntMailOn').checked,
      calendarMode: (document.querySelector('input[name="calMode"]:checked') || {}).value || 'auto'
    }).then(function (st) { showNotify(st); U.toast('通知設定已儲存'); if (S.open) refreshOpen(); })
      .catch(function (err) { $('ntError').textContent = err.message; $('ntError').hidden = false; })
      .then(function () { $('ntSave').disabled = false; });
  });

  function runTest(btn, kind, okMsg) {
    $('ntError').hidden = true;
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = '測試中…';
    call('sendTestNotify', { kind: kind }).then(function (r) {
      U.toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      loadNotify();
    }).catch(function (err) { $('ntError').textContent = err.message; $('ntError').hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  }

  $('ntTestMail').addEventListener('click', function () {
    runTest(this, 'email', function (r) { return '測試信已寄出（' + r.sent + ' 個信箱），請查看收件匣'; });
  });
  $('ntTestCal').addEventListener('click', function () {
    runTest(this, 'calendar', '日曆連線正常：測試行程已建立並立刻刪除');
  });

  /* ============================================================
   *  帳號安全：更改後台密碼
   * ============================================================ */

  $('pwForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('pwError');
    err.hidden = true;
    var cur = $('pwCurrent').value, nw = $('pwNew').value, cf = $('pwConfirm').value;
    function bad(msg) { err.textContent = msg; err.hidden = false; }

    if (!cur || !nw) return bad('請填寫目前的密碼與新密碼');
    if (nw.length < 8) return bad('新密碼至少要 8 個字元');
    if (nw !== cf) return bad('兩次輸入的新密碼不一樣');
    if (nw === cur) return bad('新密碼不能跟目前的密碼相同');
    if (nw === CFG.PUBLIC_KEY) return bad('新密碼不能跟前台金鑰相同');
    if (/mucar|5566|1234|password/i.test(nw) &&
        !confirm('這組密碼含有店名、常見數字或字詞，很容易被猜到，而後台裡有客戶的姓名、電話與地址。\n\n確定仍要使用這組密碼嗎？')) return;

    $('pwBtn').disabled = true;
    call('changeAdminPassword', { currentPassword: cur, newPassword: nw }).then(function () {
      Api.key = nw;
      safeSet(nw);
      $('pwForm').reset();
      U.toast('密碼已更改，下次登入請用新密碼');
    }).catch(function (e2) { bad(e2.message); }).then(function () { $('pwBtn').disabled = false; });
  });

  /* ---------------- 啟動 ---------------- */

  checkBackendVersion();
  var saved = safeGet();
  if (saved && !problem) enter(saved, true); else showLogin();
})();
