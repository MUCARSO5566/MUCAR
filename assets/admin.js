(function () {
  'use strict';

  var CFG = window.CARWASH_CONFIG;
  document.title = CFG.SHOP_NAME + ' — 後台管理';

  var el = {};
  ['loginMask', 'loginPwd', 'loginBtn', 'loginError', 'adminArea', 'logoutBtn',
   'ordFrom', 'ordTo', 'ordSearch', 'ordError', 'ordTable',
   'windowHoursSel', 'saveWindowHours',
   'cloDate', 'cloAllDay', 'cloRangeFields', 'cloStart', 'cloEnd', 'cloReason', 'cloAdd', 'cloError', 'cloTable',
   'tierTable', 'vehFilter', 'newBrand', 'newModel', 'newTier', 'vehAdd', 'vehError', 'vehTable',
   'crmSearch', 'crmTable', 'crmHistory'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var state = { tiers: [], vehicleTypes: [] };

  /* ---------------- 登入 ---------------- */

  function showLogin() {
    Api.setKey('');
    el.loginMask.hidden = false;
    el.adminArea.hidden = true;
    el.logoutBtn.hidden = true;
  }

  function showAdmin() {
    el.loginMask.hidden = true;
    el.adminArea.hidden = false;
    el.logoutBtn.hidden = false;
    initAdmin();
  }

  function tryEnter() {
    Api.call('listRows', { sheet: 'Settings' }).then(showAdmin).catch(showLogin);
  }

  el.loginBtn.addEventListener('click', function () {
    el.loginError.hidden = true;
    Api.setKey(el.loginPwd.value.trim());
    Api.call('listRows', { sheet: 'Settings' }).then(showAdmin).catch(function (err) {
      el.loginError.textContent = err.message;
      el.loginError.hidden = false;
      Api.setKey('');
    });
  });

  el.logoutBtn.addEventListener('click', showLogin);

  /* ---------------- 分頁切換 ---------------- */

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = true; });
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).hidden = false;
    });
  });

  function initAdmin() {
    var today = new Date().toISOString().slice(0, 10);
    el.ordFrom.value = today;
    el.ordTo.value = today;
    loadOrders();
    loadSettings();
    loadClosures();
    loadVehicles();
    loadCustomers();
  }

  /* ---------------- 訂單管理 ---------------- */

  function loadOrders() {
    el.ordError.hidden = true;
    Api.call('listOrders', { from: el.ordFrom.value, to: el.ordTo.value }).then(renderOrders).catch(function (err) {
      el.ordError.textContent = err.message;
      el.ordError.hidden = false;
    });
  }

  function renderOrders(rows) {
    var tbody = el.ordTable.querySelector('tbody');
    tbody.innerHTML = '';
    rows.forEach(function (o) {
      var tr = document.createElement('tr');
      var vehicleText = o.vehicleBrand ? (o.vehicleBrand + ' ' + o.vehicleModel) : '待確認';
      var priceText = o.needsPricing ? '待確認' : ('$' + o.price);
      var verifiedTag = o.status !== 'ACTIVE' ? '—' :
        '<span class="tag ' + (Boolean(o.verified) ? 'ok' : 'warn') + ' clickable" data-act="verify" data-order="' + o.orderNo + '" style="cursor:pointer;">' +
        (Boolean(o.verified) ? '已核對' : '未核對') + '</span>';
      var statusTag = o.status === 'ACTIVE' ? '<span class="tag ok">預約中</span>' : '<span class="tag warn">已取消</span>';
      var cancelBtn = o.status === 'ACTIVE' ? '<button class="btn-ghost" data-act="cancel" data-order="' + o.orderNo + '">取消</button>' : '';

      tr.innerHTML =
        '<td>' + o.orderNo + '</td><td>' + o.serviceDay + '</td>' +
        '<td>' + (o.startAt || '').slice(11, 16) + '-' + (o.endAt || '').slice(11, 16) + '</td>' +
        '<td>' + o.customerName + '</td><td>' + o.phone + '</td>' +
        '<td>' + vehicleText + '</td><td>' + priceText + '</td>' +
        '<td>' + (o.paymentMethod === 'transfer' ? '匯款' : '現場') + '</td>' +
        '<td>' + verifiedTag + '</td><td>' + statusTag + '</td><td>' + cancelBtn + '</td>';
      tbody.appendChild(tr);
    });
  }

  el.ordSearch.addEventListener('click', loadOrders);

  el.ordTable.addEventListener('click', function (e) {
    var t = e.target;
    var act = t.dataset.act, orderNo = t.dataset.order;
    if (!act) return;
    if (act === 'verify') {
      Api.call('toggleVerified', { orderNo: orderNo }).then(loadOrders).catch(function (err) { alert(err.message); });
    } else if (act === 'cancel') {
      if (!confirm('確定要取消訂單 ' + orderNo + ' 嗎？該客人的消費次數也會被扣除。')) return;
      Api.call('cancelOrder', { orderNo: orderNo }).then(loadOrders).catch(function (err) { alert(err.message); });
    }
  });

  /* ---------------- 時段設定 ---------------- */

  function loadSettings() {
    Api.call('listRows', { sheet: 'Settings' }).then(function (rows) {
      var map = {};
      rows.forEach(function (r) { map[r.key] = r.value; });
      el.windowHoursSel.value = map.windowHours || '3';
    });
  }

  el.saveWindowHours.addEventListener('click', function () {
    Api.call('saveSettings', { key: 'windowHours', value: el.windowHoursSel.value }).then(function () {
      alert('已儲存');
    }).catch(function (err) { alert(err.message); });
  });

  el.cloAllDay.addEventListener('change', function () {
    el.cloRangeFields.hidden = el.cloAllDay.checked;
  });

  function loadClosures() {
    Api.call('listRows', { sheet: 'Closure' }).then(renderClosures);
  }

  function renderClosures(rows) {
    var tbody = el.cloTable.querySelector('tbody');
    tbody.innerHTML = '';
    rows.sort(function (a, b) { return String(b.serviceDay).localeCompare(String(a.serviceDay)); });
    rows.forEach(function (c) {
      var tr = document.createElement('tr');
      var rangeText = Boolean(c.allDay) ? '整天' : ((c.startAt || '').slice(11, 16) + ' - ' + (c.endAt || '').slice(11, 16));
      tr.innerHTML =
        '<td>' + c.serviceDay + '</td><td>' + rangeText + '</td><td>' + (c.reason || '') + '</td>' +
        '<td><button class="btn-ghost" data-id="' + c.id + '">刪除</button></td>';
      tbody.appendChild(tr);
    });
  }

  el.cloAdd.addEventListener('click', function () {
    el.cloError.hidden = true;
    var day = el.cloDate.value;
    if (!day) { el.cloError.textContent = '請選擇日期'; el.cloError.hidden = false; return; }
    var allDay = el.cloAllDay.checked;
    var row = { serviceDay: day, allDay: allDay, reason: el.cloReason.value.trim() };
    if (!allDay) {
      if (!el.cloStart.value || !el.cloEnd.value) {
        el.cloError.textContent = '請輸入關閉的起訖時間';
        el.cloError.hidden = false;
        return;
      }
      row.startAt = day + ' ' + el.cloStart.value + ':00';
      row.endAt = day + ' ' + el.cloEnd.value + ':00';
    }
    Api.call('saveClosure', { row: row }).then(function () {
      el.cloReason.value = '';
      loadClosures();
    }).catch(function (err) { el.cloError.textContent = err.message; el.cloError.hidden = false; });
  });

  el.cloTable.addEventListener('click', function (e) {
    var id = e.target.dataset.id;
    if (!id) return;
    if (!confirm('確定刪除這筆關閉設定嗎？')) return;
    Api.call('deleteRow', { sheet: 'Closure', id: id }).then(loadClosures).catch(function (err) { alert(err.message); });
  });

  /* ---------------- 車型計價 ---------------- */

  function loadVehicles() {
    Promise.all([
      Api.call('listRows', { sheet: 'VehicleTier' }),
      Api.call('listRows', { sheet: 'VehicleType' })
    ]).then(function (res) {
      state.tiers = res[0].sort(function (a, b) { return Number(a.sort) - Number(b.sort); });
      state.vehicleTypes = res[1];
      renderTiers();
      renderTierSelect();
      renderVehicles();
    });
  }

  function renderTiers() {
    var tbody = el.tierTable.querySelector('tbody');
    tbody.innerHTML = '';
    state.tiers.forEach(function (t) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + t.name + '</td>' +
        '<td><input type="number" data-tier="' + t.id + '" value="' + t.price + '" style="width:100px;"></td>' +
        '<td><button class="btn-ghost" data-save-tier="' + t.id + '">儲存</button></td>';
      tbody.appendChild(tr);
    });
  }

  el.tierTable.addEventListener('click', function (e) {
    var id = e.target.dataset.saveTier;
    if (!id) return;
    var input = el.tierTable.querySelector('input[data-tier="' + id + '"]');
    var tier = state.tiers.filter(function (t) { return t.id === id; })[0];
    Api.call('saveVehicleTier', { row: { id: id, name: tier.name, price: Number(input.value), sort: tier.sort, active: true } })
      .then(loadVehicles).catch(function (err) { alert(err.message); });
  });

  function renderTierSelect() {
    el.newTier.innerHTML = state.tiers.map(function (t) { return '<option value="' + t.id + '">' + t.name + ' $' + t.price + '</option>'; }).join('');
  }

  function renderVehicles() {
    var q = el.vehFilter.value.trim().toLowerCase();
    var tbody = el.vehTable.querySelector('tbody');
    tbody.innerHTML = '';
    var tierName = {};
    state.tiers.forEach(function (t) { tierName[t.id] = t.name; });

    state.vehicleTypes
      .filter(function (v) { return !q || (v.brand + ' ' + v.model).toLowerCase().indexOf(q) >= 0; })
      .forEach(function (v) {
        var tr = document.createElement('tr');
        var tierOptions = state.tiers.map(function (t) {
          return '<option value="' + t.id + '"' + (t.id === v.tierId ? ' selected' : '') + '>' + t.name + '</option>';
        }).join('');
        tr.innerHTML =
          '<td>' + v.brand + '</td><td>' + v.model + '</td>' +
          '<td><select data-tier-of="' + v.id + '">' + tierOptions + '</select></td>' +
          '<td><input type="checkbox" data-active-of="' + v.id + '"' + (Boolean(v.active) ? ' checked' : '') + '></td>' +
          '<td><button class="btn-ghost" data-del-veh="' + v.id + '">刪除</button></td>';
        tbody.appendChild(tr);
      });
  }

  el.vehFilter.addEventListener('input', renderVehicles);

  el.vehTable.addEventListener('change', function (e) {
    var t = e.target;
    var id = t.dataset.tierOf || t.dataset.activeOf;
    if (!id) return;
    var v = state.vehicleTypes.filter(function (x) { return x.id === id; })[0];
    var tierId = t.dataset.tierOf ? t.value : v.tierId;
    var active = t.dataset.activeOf ? t.checked : Boolean(v.active);
    Api.call('saveVehicleType', { row: { id: id, brand: v.brand, model: v.model, tierId: tierId, sort: v.sort, active: active } })
      .then(loadVehicles).catch(function (err) { alert(err.message); });
  });

  el.vehTable.addEventListener('click', function (e) {
    var id = e.target.dataset.delVeh;
    if (!id) return;
    if (!confirm('確定刪除這個車型嗎？')) return;
    Api.call('deleteRow', { sheet: 'VehicleType', id: id }).then(loadVehicles).catch(function (err) { alert(err.message); });
  });

  el.vehAdd.addEventListener('click', function () {
    el.vehError.hidden = true;
    var brand = el.newBrand.value.trim(), model = el.newModel.value.trim();
    if (!brand || !model) { el.vehError.textContent = '請輸入廠牌與型號'; el.vehError.hidden = false; return; }
    Api.call('saveVehicleType', { row: { brand: brand, model: model, tierId: el.newTier.value, sort: state.vehicleTypes.length + 1, active: true } })
      .then(function () {
        el.newBrand.value = ''; el.newModel.value = '';
        loadVehicles();
      }).catch(function (err) { el.vehError.textContent = err.message; el.vehError.hidden = false; });
  });

  /* ---------------- 客戶 CRM ---------------- */

  function loadCustomers() {
    Api.call('getCustomers', { q: el.crmSearch.value.trim() }).then(renderCustomers);
  }

  function renderCustomers(rows) {
    var tbody = el.crmTable.querySelector('tbody');
    tbody.innerHTML = '';
    rows.forEach(function (c) {
      var tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML =
        '<td>' + c.phone + '</td><td>' + c.name + '</td><td>' + c.visitCount + '</td>' +
        '<td>$' + c.totalSpend + '</td><td>' + c.lastOrderAt + '</td>';
      tr.addEventListener('click', function () { loadHistory(c.phone); });
      tbody.appendChild(tr);
    });
  }

  var crmSearchTimer = null;
  el.crmSearch.addEventListener('input', function () {
    clearTimeout(crmSearchTimer);
    crmSearchTimer = setTimeout(loadCustomers, 250);
  });

  function loadHistory(phone) {
    Api.call('getCustomerHistory', { phone: phone }).then(function (data) {
      var rows = data.orders.map(function (o) {
        var vehicleText = o.vehicleBrand ? (o.vehicleBrand + ' ' + o.vehicleModel) : '待確認';
        var priceText = o.needsPricing ? '待確認' : ('$' + o.price);
        return '<tr><td>' + o.orderNo + '</td><td>' + o.serviceDay + '</td><td>' + vehicleText + '</td><td>' + priceText + '</td>' +
          '<td>' + (o.status === 'ACTIVE' ? '預約中' : '已取消') + '</td></tr>';
      }).join('');
      el.crmHistory.innerHTML =
        '<div class="card"><h3>' + (data.customer ? data.customer.name : phone) + ' 的消費紀錄</h3>' +
        '<div class="table-scroll"><table><thead><tr><th>訂單編號</th><th>日期</th><th>車輛</th><th>金額</th><th>狀態</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>';
    });
  }

  /* ---------------- 啟動 ---------------- */

  tryEnter();
})();
