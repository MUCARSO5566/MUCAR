(function () {
  'use strict';

  var CFG = window.CARWASH_CONFIG;
  var STEP_MIN = Number(CFG.AVAILABILITY_STEP_MIN) || 30;
  var OTHER = '__OTHER__';
  var ASK = '__ASK__';
  var DAYS_AHEAD = 21;

  function $(id) { return document.getElementById(id); }

  var S = {
    step: 1,
    tiers: [], types: [], loaded: false,
    vehicle: null,          // 車種物件，或 { id: 'OTHER' }
    otherTier: '',          // 「找不到我的車」時客人自選的車型級距 id（空 = 由店家判斷）
    day: '', slot: null, avail: null, availSeq: 0,
    payment: '', order: null, mapActive: false, draftVehicle: '',
    addons: [], selectedAddons: [],
    availCache: {},         // day -> { t: 取得時間, p: Promise }；預先載入 / 短時間內重複點日期不用再等
    dup: null               // { phone, p }；預先做好的「重複預約」檢查
  };
  var DRAFT_KEY = 'mucar_booking_draft';
  var BOOT_KEY = 'mucar_boot_cache';
  var BOOT_MAX_AGE = 12 * 3600 * 1000;      // 車型資料很少變，先用手機上的舊資料立刻顯示，背景再更新
  var AVAIL_TTL = 40 * 1000;

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

  function tierById(id) {
    return S.tiers.filter(function (t) { return String(t.id) === String(id); })[0] || null;
  }
  function tierOf(v) { return tierById(v.tierId); }

  function isOther() { return !!S.vehicle && S.vehicle.id === 'OTHER'; }

  function vehicleText() {
    if (!S.vehicle) return '';
    if (isOther()) return '其他：' + $('fOther').value.trim();
    return S.vehicle.brand + ' ' + S.vehicle.model;
  }

  /** 目前的車型級距與價格；tentative = 客人自選、店家還要再確認 */
  function priceInfo() {
    if (!S.vehicle) return { tier: '', price: null, tentative: false };
    if (isOther()) {
      var t = tierById(S.otherTier);
      return t ? { tier: t.name + '（自選）', price: Number(t.price), tentative: true }
               : { tier: '由店家判斷', price: null, tentative: false };
    }
    var tt = tierOf(S.vehicle);
    return { tier: tt ? tt.name : '', price: tt ? Number(tt.price) : null, tentative: false };
  }

  function priceLabel(p) {
    if (p.price == null) return '待店家確認';
    return U.money(p.price) + (p.tentative ? '（暫估，店家確認車款後為準）' : '');
  }

  function addonTotal() {
    return S.selectedAddons.reduce(function (sum, id) {
      var a = S.addons.filter(function (x) { return x.id === id; })[0];
      return sum + (a ? Number(a.price) : 0);
    }, 0);
  }
  function selectedAddonNames() {
    return S.selectedAddons.map(function (id) {
      var a = S.addons.filter(function (x) { return x.id === id; })[0];
      return a ? a.name : '';
    }).filter(Boolean);
  }
  /** 洗車費用＋加購合計的顯示文字 */
  function totalLabel() {
    var p = priceInfo();
    if (p.price == null) return '待店家確認';
    return U.money(p.price + addonTotal()) + (p.tentative ? '（暫估，店家確認車款後為準）' : '');
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

  /**
   * mode: 'pop' = 瀏覽器上一頁/下一頁觸發（不動歷史）、'init' = 第一次載入、'replace' = 用目前這一筆歷史取代（頁面內的「上一步」與錯誤後重選用，
   * 避免歷史越堆越多）；預設會新增一筆歷史，讓手機的「返回鍵」回到上一步而不是直接離開頁面。
   */
  function go(n, mode) {
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
    $('btnNext').disabled = false;
    clearError();
    renderSummary();
    if (n === 3 && !S.day) selectDay(U.serviceToday());
    if (n === 3) updateMap();
    if (n === 4) prepPayment();
    if (n === 5) renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (mode === 'init' || mode === 'replace') history.replaceState({ step: n }, '', location.pathname + location.search);
    else if (mode !== 'pop') history.pushState({ step: n }, '', location.pathname + location.search);

    var h = $('step' + n).querySelector('h2');           // 讓鍵盤/讀屏使用者的焦點跟著換頁
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function renderSummary() {
    var chips = [];
    if (S.step >= 3 && S.vehicle) {
      var p = priceInfo();
      var chipTotal = p.price != null ? p.price + addonTotal() : null;
      chips.push('<span class="chip"><b>' + U.esc(vehicleText()) + '</b> · ' + (chipTotal != null ? U.money(chipTotal) + (p.tentative ? '（暫估）' : '') : '待確認') + '</span>');
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

  /* ---------------- Step 2：車種 → 自動帶入車型 ---------------- */

  function loadVehicles() {
    $('vehLoading').hidden = false;
    $('vehFail').hidden = true;
    $('vehForm').hidden = true;

    var problem = Api.configProblem();
    if (problem) {
      $('configBanner').textContent = problem;
      $('configBanner').hidden = false;
    }

    var cached = readBootCache();
    var shown = false;
    if (cached && applyBoot(cached)) {           // 有舊資料：立刻顯示，不用等 Apps Script
      shown = true;
      $('vehLoading').hidden = true;
      $('vehForm').hidden = false;
    }

    return Api.call('bootBooking', {}).then(function (data) {
      if (!applyBoot(data)) throw new Error('目前沒有可選的車種，請聯絡店家。');
      writeBootCache(data);
      $('vehLoading').hidden = true;
      $('vehFail').hidden = true;
      $('vehForm').hidden = false;
    }).catch(function (err) {
      if (shown) return;                           // 已經用舊資料顯示了，背景更新失敗就先不打擾
      S.loaded = false;
      $('vehLoading').hidden = true;
      $('vehFailMsg').textContent = '無法載入車種資料：' + err.message;
      $('vehFail').hidden = false;
    });
  }

  function readBootCache() {
    try {
      var c = JSON.parse(localStorage.getItem(BOOT_KEY) || 'null');
      return (c && c.data && Date.now() - c.t < BOOT_MAX_AGE) ? c.data : null;
    } catch (e) { return null; }
  }
  function writeBootCache(data) {
    try { localStorage.setItem(BOOT_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) { /* ignore */ }
  }

  /** 套用車型資料；有內容回傳 true。資料沒變就不重畫，避免客人正在選的時候選單被重整 */
  function applyBoot(data) {
    S.addons = data.addons || [];
    renderAddons();
    var tiers = data.tiers || [];
    var types = (data.vehicleTypes || []);
    var sig = JSON.stringify([tiers, types]);
    if (S.bootSig === sig) return true;
    S.tiers = tiers;
    S.types = types.filter(function (v) { return !!tierOf(v); });
    if (!S.types.length) return false;
    S.bootSig = sig;
    S.loaded = true;
    renderVehicles();
    return true;
  }

  /** 加購項目（例如藥水）：不管選哪種車都是同一份清單 */
  function renderAddons() {
    if (!S.addons.length) { $('addonBox').hidden = true; return; }
    $('addonList').innerHTML = S.addons.map(function (a) {
      var checked = S.selectedAddons.indexOf(a.id) >= 0;
      return '<label class="' + (checked ? 'selected' : '') + '"><input type="checkbox" value="' + U.esc(a.id) + '"' + (checked ? ' checked' : '') + '><div><b>' + U.esc(a.name) + '</b><span>+' + U.money(a.price) + '</span></div></label>';
    }).join('');
  }

  function renderVehicles() {
    var kw = ($('fVehicleSearch').value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    var keep = $('fVehicle').value;
    var list = S.types.filter(function (v) {
      var hay = (v.brand + ' ' + v.model).toLowerCase();
      return kw.every(function (k) { return hay.indexOf(k) >= 0; });
    });
    $('vehCount').textContent = kw.length ? (list.length ? '找到 ' + list.length + ' 款' : '沒有符合的車種，可以選最下方「找不到我的車 / 其他」') : '';

    var byBrand = {};
    list.forEach(function (v) { (byBrand[v.brand] = byBrand[v.brand] || []).push(v); });
    var brands = Object.keys(byBrand).sort(function (a, b) { return a.localeCompare(b, 'en'); });

    var html = '<option value="">請選擇車種</option>';
    brands.forEach(function (b) {
      var list = byBrand[b].sort(function (x, y) { return String(x.model).localeCompare(String(y.model), 'en', { numeric: true }); });
      html += '<optgroup label="' + U.esc(b) + '">' + list.map(function (v) {
        return '<option value="' + U.esc(v.id) + '">' + U.esc(v.brand + ' ' + v.model) + '</option>';
      }).join('') + '</optgroup>';
    });
    html += '<option value="' + OTHER + '">找不到我的車 / 其他</option>';
    $('fVehicle').innerHTML = html;

    // 篩選後如果原本選的車種還在，就保留；不在了才清掉
    var still = keep && [].some.call($('fVehicle').options, function (o) { return o.value === keep; });
    if (still) $('fVehicle').value = keep;
    else onVehicleChange();
  }

  /** 車型（級距）欄位：一般情況自動帶入且不能改；只有「找不到我的車」才開放自行選擇 */
  function setTierAuto(tier) {
    var sel = $('fTier');
    sel.disabled = true;
    sel.innerHTML = tier
      ? '<option value="' + U.esc(tier.id) + '">' + U.esc(tier.name) + '</option>'
      : '<option value="">選擇車種後自動帶入</option>';
    $('tierHint').textContent = '車型由系統依車種自動判定，無法自行更改。';
  }

  function setTierCustom() {
    var sel = $('fTier');
    sel.disabled = false;
    sel.innerHTML = '<option value="">請選擇最接近的車型</option>' +
      S.tiers.map(function (t) { return '<option value="' + U.esc(t.id) + '">' + U.esc(t.name) + '　' + U.money(t.price) + '</option>'; }).join('') +
      '<option value="' + ASK + '">不確定，由店家判斷</option>';
    $('tierHint').textContent = '找不到您的車款時，可自行選擇最接近的車型；店家會再確認車款與價格。';
  }

  function onVehicleChange() {
    saveDraft();
    var id = $('fVehicle').value;
    S.otherTier = '';
    mark('fVehicle', false); mark('fTier', false); mark('fOther', false);

    if (!id) {
      S.vehicle = null;
      $('otherField').hidden = true;
      setTierAuto(null);
    } else if (id === OTHER) {
      S.vehicle = { id: 'OTHER' };
      $('otherField').hidden = false;
      setTierCustom();
      $('fOther').focus();
    } else {
      S.vehicle = S.types.filter(function (v) { return v.id === id; })[0] || null;
      $('otherField').hidden = true;
      setTierAuto(S.vehicle ? tierOf(S.vehicle) : null);
    }
    showPreview();
  }

  function onTierChange() {
    if (!isOther()) return;
    var v = $('fTier').value;
    S.otherTier = (v === ASK) ? '' : v;
    mark('fTier', false);
    showPreview();
  }

  function showPreview() {
    var ready = !!S.vehicle && !(isOther() && !$('fTier').value);
    $('addonBox').hidden = !ready || !S.addons.length;
    if (!ready) { $('pricePreview').hidden = true; return; }
    var p = priceInfo();
    var total = p.price != null ? p.price + addonTotal() : null;
    $('ppTier').textContent = p.tier ? '車型：' + p.tier : '';
    $('ppPrice').textContent = total != null ? U.money(total) + (p.tentative ? '（暫估）' : '') : '待店家確認';
    $('pricePreview').hidden = false;
  }

  function validateStep2() {
    mark('fVehicle', false); mark('fTier', false); mark('fOther', false);
    if (!S.loaded) { showError('車種資料尚未載入，請按「重新載入」。'); return false; }
    if (!S.vehicle) { mark('fVehicle', true); showError('請選擇車種'); $('fVehicle').focus(); return false; }
    if (isOther()) {
      if (!$('fOther').value.trim()) { mark('fOther', true); showError('請填寫您的車款'); $('fOther').focus(); return false; }
      if (!$('fTier').value) { mark('fTier', true); showError('請選擇最接近的車型，或選「不確定，由店家判斷」'); $('fTier').focus(); return false; }
    }
    return true;
  }

  /* ---------------- Step 3：地址（含地圖）與時段 ---------------- */

  var mapTimer = null, mapShown = '';

  function updateMap() {
    var addr = $('fAddress').value.trim();
    var frame = $('mapIframe');
    if (addr.length < 5) {
      frame.hidden = true;
      $('mapEmpty').hidden = false;
      $('mapLink').hidden = true;
      $('mapLock').hidden = true;
      mapShown = '';
      return;
    }
    if (addr === mapShown) return;
    mapShown = addr;
    frame.src = 'https://www.google.com/maps?q=' + encodeURIComponent(addr) + '&hl=zh-TW&z=16&output=embed';
    frame.hidden = false;
    $('mapEmpty').hidden = true;
    $('mapLink').href = U.mapUrl(addr);
    $('mapLink').hidden = false;
    $('mapLock').hidden = false;
  }

  function renderDates() {
    var today = U.serviceToday();
    var n = U.taipeiNow();
    var lateNight = today !== (n.y + '-' + U.pad2(n.M) + '-' + U.pad2(n.d));   // 凌晨 0–3 點仍算前一個營業日
    var html = '';
    for (var i = 0; i < DAYS_AHEAD; i++) {
      var d = U.addDays(today, i);
      var sub = i === 0 ? (lateNight ? '營業中' : '今天') : (i === 1 ? '明天' : U.weekday(d));
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
    $('slotArea').innerHTML = '<div class="slot-skel" aria-hidden="true"></div><p class="hint">載入時段中…（第一次約需 2～4 秒）</p>';

    getAvail(day).then(function (data) {
      if (seq !== S.availSeq) return;
      S.avail = data;
      renderSlots();
    }).catch(function (err) {
      if (seq !== S.availSeq) return;
      $('slotArea').innerHTML = '<div class="alert alert-danger">無法載入時段：' + U.esc(err.message) +
        '<br><button type="button" class="btn btn-secondary btn-sm" id="slotRetry">重新載入</button></div>';
    });
  }

  /** 取得某天的空檔；短時間內同一天重複取用，或已經預先載入的，就不用再等 Apps Script */
  function getAvail(day, fresh) {
    var c = S.availCache[day];
    if (!fresh && c && Date.now() - c.t < AVAIL_TTL) return c.p;
    var entry = { t: Date.now() };
    entry.p = Api.call('checkAvailability', { serviceDay: day }).catch(function (err) {
      if (S.availCache[day] === entry) delete S.availCache[day];
      throw err;
    });
    S.availCache[day] = entry;
    return entry.p;
  }

  /** 這個起始時間能不能選：'ok' | 'past'（已過） | 'full'（跟別人的預約/關閉時段重疊） */
  function slotState(t) {
    var a = S.avail;
    // 後端若沒回傳 now（舊版），就用台北時間自己算，不能讓已過去的時段被選到
    var now = a.now ? U.wallMs(a.now) : U.wallMs(U.nowStr());
    if (t <= now) return 'past';
    var end = t + Number(a.windowHours) * 3600000;
    var clash = (a.busy || []).some(function (b) { return t < U.wallMs(b.end) && U.wallMs(b.start) < end; });
    return clash ? 'full' : 'ok';
  }

  function renderSlots() {
    var a = S.avail;
    var start = U.wallMs(a.businessStart), latest = U.wallMs(a.latestStart);

    var groups = { pm: [], eve: [], night: [] };
    var anyOpen = false;

    for (var t = start; t <= latest; t += STEP_MIN * 60000) {
      var st = slotState(t);
      if (st === 'ok') anyOpen = true;
      var h = new Date(t).getUTCHours();
      var g = h < 12 ? 'night' : (h < 18 ? 'pm' : 'eve');
      var cap = st === 'past' ? '已過' : (st === 'full' ? '已滿' : (g === 'night' ? '隔日' : ''));
      groups[g].push(
        '<button type="button" class="slot' + (t === S.slot ? ' selected' : '') + '" data-ms="' + t + '"' +
        (st !== 'ok' ? ' disabled title="' + (st === 'past' ? '時間已過' : '與其他預約時段重疊，無法選擇') + '"' : '') + '>' +
        U.hm(t) + (cap ? '<small>' + cap + '</small>' : '') + '</button>');
    }

    var titles = { pm: '下午', eve: '晚間', night: '凌晨（隔日）' };
    var html = '';
    ['pm', 'eve', 'night'].forEach(function (k) {
      if (!groups[k].length) return;
      html += '<div class="slot-group"><h3>' + titles[k] + '</h3><div class="slot-grid">' + groups[k].join('') + '</div></div>';
    });
    if (!anyOpen) html = '<div class="alert alert-warn" style="margin-top:14px">這一天已額滿或時段已過，請選擇其他日期。</div>' + html;

    html += '<div class="legend"><span><i></i>可預約</span><span><i class="full"></i>已滿 / 已過</span><span><i class="sel"></i>已選擇</span></div>' +
      '<div class="hint">每筆預約會佔用約 ' + a.windowHours + ' 小時，與他人預約重疊的時間無法選擇。請選擇「專員到府牽車」的時間。</div>';
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

  /**
   * 進到下一步之後，在背景再確認一次這個時段沒被別人搶走（客人不用停下來等）。
   * 真正送出時後端還會再擋一次（createOrder 內部的衝突檢查才是最終依據）。
   */
  function recheckSlotInBackground() {
    var day = S.day, slot = S.slot;
    getAvail(day, true).then(function (data) {
      if (S.day !== day || S.slot !== slot || S.order) return;      // 客人已經改選或已送出
      S.avail = data;
      if (slotState(slot) !== 'ok') {
        S.slot = null;
        go(3, 'replace');
        renderSlots();
        showError('這個時段剛剛已被別人預約或已過，請重新選擇其他時段。');
      }
    }).catch(function () { /* 背景檢查失敗就算了，送出時後端會再確認 */ });
  }

  /** 預先檢查「這支電話是不是已經有進行中的預約」，送出時就不用再多等一輪 */
  function prefetchDup() {
    var phone = $('fPhone').value.replace(/\D/g, '');
    if (phone.length < 8) return;
    if (S.dup && S.dup.phone === phone) return;
    var entry = { phone: phone };
    entry.p = Api.call('checkPhoneActive', { phone: phone });
    entry.p.catch(function () { if (S.dup === entry) S.dup = null; });
    S.dup = entry;
  }

  /* ---------------- Step 4：付款 ---------------- */

  function prepPayment() {
    $('bankAccount').textContent = CFG.BANK_ACCOUNT;
    var p = priceInfo();
    $('bankHint').textContent = (p.price != null && !p.tentative)
      ? '洗車費用 ' + U.money(p.price) + '；牽車費用依實際距離評估，由店家確認後另行通知。'
      : '洗車費用與牽車費用由店家確認車款與距離後通知。';
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
    var names = selectedAddonNames();
    var html =
      row('姓名', U.esc($('fName').value.trim())) +
      row('電話', U.esc($('fPhone').value.replace(/\D/g, ''))) +
      row('車種', U.esc(vehicleText())) +
      row('車型', U.esc(p.tier || '—'));
    if (names.length) html += row('加購項目', U.esc(names.join('、')) + '（+' + U.esc(U.money(addonTotal())) + '）');
    html +=
      row('洗車費用', U.esc(totalLabel())) +
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
    return {
      name: $('fName').value.trim(),
      phone: $('fPhone').value.replace(/\D/g, ''),
      birthday: $('fBirthday').value,
      lineId: $('fLine').value.trim(),
      note: $('fNote').value.trim(),
      pickupAddress: $('fAddress').value.trim(),
      vehicleTypeId: isOther() ? 'OTHER' : S.vehicle.id,
      otherVehicle: isOther() ? $('fOther').value.trim() : '',
      otherTierId: isOther() ? S.otherTier : '',
      addonIds: S.selectedAddons,
      serviceDay: S.day,
      startTime: U.hm(S.slot),
      paymentMethod: S.payment
    };
  }

  function setBusy(on) {
    $('btnNext').disabled = on;
    $('btnBack').disabled = on;
    $('btnNext').textContent = on ? '送出中…請稍候' : LABELS[5];
    $('submitHint').hidden = !on;
  }

  function submit() {
    if (!$('fAgree').checked) {
      var box = $('agreeBox');
      box.classList.remove('attn'); void box.offsetWidth; box.classList.add('attn');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showError('請先勾選下方「我已閱讀並同意服務須知」，才能送出預約。');
      $('fAgree').focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    clearError();
    var data = payload();

    prefetchDup();
    var dupP = (S.dup && S.dup.phone === data.phone) ? S.dup.p : Api.call('checkPhoneActive', { phone: data.phone });
    dupP.catch(function () { return Api.call('checkPhoneActive', { phone: data.phone }); }).then(function (res) {
      if (res.hasActive) {
        $('dupText').textContent = '電話 ' + data.phone + ' 目前已有 ' + res.orders.length + ' 筆進行中的預約，確定還要再預約一筆嗎？';
        $('dupModal').hidden = false;
        U.lockScroll(true);
        $('dupConfirm').focus();
        return null;
      }
      return create(data);
    }).catch(function (err) {
      setBusy(false);
      showError(err.message);
    });
  }

  function create(data) {
    return Api.call('createOrder', data).then(function (order) {
      S.order = order;
      showDone(order);
    }).catch(function (err) {
      setBusy(false);
      if (/時段|已被預約|已經過了|可預約範圍/.test(err.message)) {
        go(3, 'replace');
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

    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    history.replaceState({ done: true }, '', location.pathname + location.search);
    Api.fire('processNotify', {});                 // 通知信 / 日曆在背景處理，客人不用等
    bindCalendarButtons(o);
    $('doneOrderNo').textContent = o.orderNo;
    $('lineLink').href = CFG.LINE_OA_URL;

    var hasPrice = o.price !== '' && o.price != null;
    var confirmed = hasPrice && !U.isTrue(o.needsPricing);
    var priceText = confirmed ? U.money(o.price) : (hasPrice ? U.money(o.price) + '（暫估，店家確認車款後為準）' : '待店家確認');

    $('doneTable').innerHTML =
      row('預約時段', U.esc(o.startAt.slice(5, 16)) + ' ～ ' + U.esc(o.endAt.slice(5, 16))) +
      row('車種', U.esc(o.vehicleBrand + ' ' + o.vehicleModel)) +
      (o.addonNames ? row('加購項目', U.esc(o.addonNames) + '（+' + U.esc(U.money(o.addonTotal)) + '）') : '') +
      row('洗車費用', U.esc(priceText)) +
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
        '* 匯款金額：' + (confirmed ? o.price : '[待店家確認後填寫]') + ' 元',
        '* 轉出帳號末五碼：[請填寫您用來轉帳的帳戶末 5 碼]',
        '',
        '已完成線上轉帳，請您核對。謝謝！'
      ].join('\n');
      $('transferNoticeArea').hidden = false;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** 客人自己選要不要加到自己的行事曆（純前端，不寄任何邀請信） */
  function bindCalendarButtons(o) {
    $('calGoogle').href = U.googleCalUrl(o);
    $('calIcs').onclick = function () { U.downloadIcs(o); };
  }

  /* ---------------- 事件綁定 ---------------- */

  $('btnNext').addEventListener('click', function () {
    var n = S.step;
    if (n === 1 && validateStep1()) { go(2); prefetchDup(); }
    else if (n === 2 && validateStep2()) go(3);
    else if (n === 3 && validateStep3()) { go(4); recheckSlotInBackground(); }
    else if (n === 4 && validateStep4()) go(5);
    else if (n === 5) submit();
  });
  $('btnBack').addEventListener('click', function () { if (S.step > 1) go(S.step - 1, 'replace'); });

  $('fVehicle').addEventListener('change', onVehicleChange);
  $('fTier').addEventListener('change', onTierChange);
  $('fOther').addEventListener('input', function () { mark('fOther', false); });
  $('vehRetry').addEventListener('click', loadVehicles);
  $('fVehicleSearch').addEventListener('input', renderVehicles);
  $('fVehicleSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); this.blur(); } });

  $('mapLock').addEventListener('click', function () {
    S.mapActive = !S.mapActive;
    document.querySelector('.map-frame').classList.toggle('active', S.mapActive);
    this.textContent = S.mapActive ? '完成，繼續捲動頁面' : '點一下開始操作地圖';
  });

  /* 瀏覽器 / 手機的「上一頁」：回到上一步，不是直接離開；送出成功後不能倒回去重送 */
  window.addEventListener('popstate', function (e) {
    if (S.order) return;   // 已經送出：留在完成頁，不能倒回去重送；也不再新增歷史，不會卡住返回鍵
    var st = e.state && e.state.step;
    go(st || 1, 'pop');
  });

  /* 草稿：手機切去別的 App 再回來、或頁面被重新整理時，已填的資料還在（只存在這個分頁，關掉就清空） */
  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        name: $('fName').value, phone: $('fPhone').value, birthday: $('fBirthday').value, line: $('fLine').value,
        note: $('fNote').value, address: $('fAddress').value, other: $('fOther').value, vehicle: $('fVehicle').value,
        addons: S.selectedAddons
      }));
    } catch (e) { /* 無痕模式等 */ }
  }
  function restoreDraft() {
    try {
      var d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (!d) return;
      $('fName').value = d.name || ''; $('fPhone').value = d.phone || ''; $('fBirthday').value = d.birthday || '';
      $('fLine').value = d.line || ''; $('fNote').value = d.note || ''; $('fAddress').value = d.address || ''; $('fOther').value = d.other || '';
      S.draftVehicle = d.vehicle || '';
      S.selectedAddons = Array.isArray(d.addons) ? d.addons : [];
    } catch (e) { /* ignore */ }
  }
  ['fName', 'fPhone', 'fBirthday', 'fLine', 'fNote', 'fAddress', 'fOther'].forEach(function (id) {
    $(id).addEventListener('input', saveDraft);
    $(id).addEventListener('change', saveDraft);
  });
  $('fVehicle').addEventListener('change', saveDraft);
  $('addonList').addEventListener('change', function (e) {
    if (e.target.type !== 'checkbox') return;
    var id = e.target.value, idx = S.selectedAddons.indexOf(id);
    if (e.target.checked && idx < 0) S.selectedAddons.push(id);
    else if (!e.target.checked && idx >= 0) S.selectedAddons.splice(idx, 1);
    e.target.closest('label').classList.toggle('selected', e.target.checked);
    showPreview();
    saveDraft();
  });

  $('fAddress').addEventListener('input', function () {
    clearTimeout(mapTimer);
    mapTimer = setTimeout(updateMap, 700);
  });

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
  $('fAgree').addEventListener('change', function () {
    $('agreeBox').classList.remove('attn');
    if (this.checked) clearError();
  });

  $('copyBank').addEventListener('click', function () {
    U.copyText(CFG.BANK_ACCOUNT.replace(/\D/g, '')).then(function () { U.toast('帳號已複製'); }, function () { U.toast('複製失敗，請手動選取', 'error'); });
  });
  $('copyNotice').addEventListener('click', function () {
    U.copyText($('noticeText').textContent).then(function () { U.toast('已複製，請貼到官方 LINE'); }, function () { U.toast('複製失敗，請手動選取文字', 'error'); });
  });

  $('dupCancel').addEventListener('click', function () {
    $('dupModal').hidden = true;
    U.lockScroll(false);
    setBusy(false);
  });
  $('dupConfirm').addEventListener('click', function () {
    $('dupModal').hidden = true;
    U.lockScroll(false);
    create(payload());
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('dupModal').hidden) $('dupCancel').click();
  });

  /* ---------------- 初始化 ---------------- */

  MUCAR_CONTENT.renderFlow($('noticeFlow'));
  MUCAR_CONTENT.renderTips($('noticeTips'));
  restoreDraft();
  renderDates();
  go(1, 'init');
  // 預先載入今天的空檔，接著再悄悄載入明天的（最常被選到），到第 3 步就不用等
  getAvail(U.serviceToday()).then(function () { return getAvail(U.addDays(U.serviceToday(), 1)); })
    .catch(function () { /* 預先載入失敗不要緊，到第 3 步會再載一次 */ });
  loadVehicles().then(function () {
    if (!S.draftVehicle || !S.loaded) return;
    var ok = [].some.call($('fVehicle').options, function (o) { return o.value === S.draftVehicle; });
    if (ok) { $('fVehicle').value = S.draftVehicle; onVehicleChange(); }
  });
})();
