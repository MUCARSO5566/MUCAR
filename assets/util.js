/* ============================================================
 *  共用小工具（跳脫 HTML、台北時間、複製、提示訊息…）
 *  ★ 所有「使用者輸入的文字」放進 innerHTML 前，一定要先過 U.esc()
 * ============================================================ */
(function (global) {
  'use strict';

  var TP = 'Asia/Taipei';
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  /** HTML 跳脫：防止客人在姓名/備註/地址裡塞入 <script> 之類的內容攻擊後台 */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 台北現在時間，不受使用者手機/電腦時區影響 */
  function taipeiNow() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TP, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date());
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, M: +o.month, d: +o.day, H: +o.hour, m: +o.minute, s: +o.second };
  }

  function nowStr() {
    var n = taipeiNow();
    return n.y + '-' + pad2(n.M) + '-' + pad2(n.d) + ' ' + pad2(n.H) + ':' + pad2(n.m) + ':' + pad2(n.s);
  }

  /** 'yyyy-MM-dd HH:mm:ss' → 牆上時間毫秒（一律以 UTC 計算，避免時區干擾比較） */
  function wallMs(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(str || ''));
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function msToStr(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' +
      pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
  }

  function hm(ms) {
    var d = new Date(ms);
    return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }

  function addDays(dayStr, n) {
    return msToStr(wallMs(dayStr) + n * 86400000).slice(0, 10);
  }

  /** 目前的「營業日」：凌晨 00:00–03:00 仍算前一天 */
  function serviceToday() {
    var n = taipeiNow();
    var day = n.y + '-' + pad2(n.M) + '-' + pad2(n.d);
    return n.H < 3 ? addDays(day, -1) : day;
  }

  /** '2026-09-26' → '9/26（五）' */
  function dayLabel(dayStr) {
    var d = new Date(wallMs(dayStr));
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + WEEK[d.getUTCDay()] + '）';
  }

  function weekday(dayStr) { return '週' + WEEK[new Date(wallMs(dayStr)).getUTCDay()]; }

  function money(n) {
    var x = Number(n);
    return isNaN(x) ? '' : '$' + x.toLocaleString('en-US');
  }

  function isTrue(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

  function mapUrl(addr) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
  }

  /** 訂單顯示狀態：預約中的單如果時段已結束，就顯示「已完成」 */
  function orderState(o) {
    if (o.status !== 'ACTIVE') return 'CANCELLED';
    return String(o.endAt) <= nowStr() ? 'DONE' : 'ACTIVE';
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  /** 跳出視窗時鎖住背景捲動（手機上避免捲到後面的頁面） */
  function lockScroll(on) {
    document.documentElement.classList.toggle('no-scroll', !!on);
  }

  /* ---------- 加入行事曆：純前端，由客人自己決定要不要加，完全不會寄任何邀請信 ---------- */

  function calLocalStamp(str) {                 // 台北時間 'yyyy-MM-dd HH:mm:ss' → 20260927T210000
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(str || ''));
    return m ? m[1] + m[2] + m[3] + 'T' + m[4] + m[5] + '00' : '';
  }

  function calUtcStamp(str) {                   // 台北時間 → UTC 20260927T130000Z（.ics 用 UTC 最不會被各家日曆誤判時區）
    var d = new Date(wallMs(str) - 8 * 3600000);
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }

  function calText(o) {
    var vehicle = ((o.vehicleBrand || '') + ' ' + (o.vehicleModel || '')).trim();
    return {
      title: '沐車所｜代客牽車洗車',
      location: String(o.pickupAddress || ''),
      details: ['訂單編號：' + o.orderNo, vehicle ? '車種：' + vehicle : '', '牽車地址：' + (o.pickupAddress || ''),
        '專員姓名與聯絡資訊，店家會透過官方 LINE 通知您。', '如需變更或取消，請至網站「查詢 / 取消預約」。']
        .filter(Boolean).join('\n')
    };
  }

  function googleCalUrl(o) {
    var t = calText(o);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(t.title) +
      '&dates=' + calLocalStamp(o.startAt) + '/' + calLocalStamp(o.endAt) +
      '&ctz=Asia%2FTaipei' +
      '&location=' + encodeURIComponent(t.location) +
      '&details=' + encodeURIComponent(t.details);
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  function icsText(o) {
    var t = calText(o);
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MUCAR//Booking//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + o.orderNo + '@mucar-booking',
      'DTSTAMP:' + calUtcStamp(nowStr()),
      'DTSTART:' + calUtcStamp(o.startAt),
      'DTEND:' + calUtcStamp(o.endAt),
      'SUMMARY:' + icsEscape(t.title),
      'LOCATION:' + icsEscape(t.location),
      'DESCRIPTION:' + icsEscape(t.details),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(t.title), 'TRIGGER:-PT60M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
  }

  /** 下載 .ics（iPhone / Mac / Outlook 等；點開會跳出「加入行事曆」） */
  function downloadIcs(o) {
    var blob = new Blob([icsText(o)], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'mucar-' + o.orderNo + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var toastTimer = null;
  function toast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2400);
  }

  global.U = {
    esc: esc, pad2: pad2, taipeiNow: taipeiNow, nowStr: nowStr, wallMs: wallMs, msToStr: msToStr, hm: hm,
    addDays: addDays, serviceToday: serviceToday, dayLabel: dayLabel, weekday: weekday, money: money,
    isTrue: isTrue, mapUrl: mapUrl, orderState: orderState, copyText: copyText, toast: toast, lockScroll: lockScroll,
    googleCalUrl: googleCalUrl, icsText: icsText, downloadIcs: downloadIcs
  };
})(window);
