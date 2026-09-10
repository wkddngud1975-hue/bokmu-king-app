/* ==========================================================================
   복무왕 · 이용 현황 수집
   --------------------------------------------------------------------------
   설계 원칙

   1) 기본값은 "외부 전송 꺼짐" 입니다.
      아래 provider 를 채우기 전까지는 어떤 데이터도 밖으로 나가지 않고,
      이 브라우저의 localStorage 에만 숫자로 쌓입니다.

   2) 개인을 식별하는 값은 다루지 않습니다.
      이름·사번·이메일·IP 를 이 파일에서 읽거나 보내지 않습니다.
      쿠키도 쓰지 않습니다(localStorage / sessionStorage 만 사용).

   3) 자유 검색어는 원문을 보내지 않습니다.
      결과가 0건일 때만, 숫자를 모두 지우고 30자로 잘라서 보냅니다.
      "규정집에 무엇이 빠졌는지" 를 알기 위한 최소한의 정보입니다.
      결과가 있는 검색은 글자 수와 건수만 남깁니다.

   4) 수집을 멈추려면 index.html 에서 이 파일의 <script> 한 줄만 지우면 됩니다.
      앱은 그대로 동작합니다(모든 호출부가 존재 여부를 확인합니다).
   ========================================================================== */

var BOKMU_ANALYTICS = {
  // "" 이면 외부 전송 없음. 기관 승인 후 "umami" 또는 "goatcounter" 로 변경.
  provider: "",

  // provider: "umami" 일 때
  umami: {
    host: "",        // 예: "https://cloud.umami.is"
    websiteId: "",   // 예: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  },

  // provider: "goatcounter" 일 때
  goatcounter: {
    host: "",        // 예: "https://bokmu.goatcounter.com"
  },

  local: true,       // 이 브라우저에만 쌓는 집계 (외부 전송 아님)
  debug: false,      // true 면 콘솔에 이벤트를 찍습니다
};

(function () {
  "use strict";

  var CFG = BOKMU_ANALYTICS;
  var LS_KEY = "bokmu.stats.v1";
  var SS_KEY = "bokmu.session";
  var searchTimer = null;
  var sessionMarked = false;

  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  // 숫자(사번·날짜 등)를 지우고 한글/영문만 남긴 뒤 30자로 자릅니다.
  function sanitize(text) {
    return String(text || "")
      .replace(/[0-9]/g, "")
      .replace(/[^가-힣a-zA-Z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30);
  }

  function loadLocal() {
    return safe(function () {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    }, null) || { events: {}, detail: {}, sessions: 0, first: null, last: null };
  }

  function saveLocal(data) {
    safe(function () { localStorage.setItem(LS_KEY, JSON.stringify(data)); });
  }

  function labelOf(props) {
    if (!props) return "";
    return props.kw || props.tab || props.id || props.q || "";
  }

  function recordLocal(name, props) {
    if (CFG.local === false) return;
    var d = loadLocal();
    var now = new Date().toISOString();
    if (!d.first) d.first = now;
    d.last = now;
    d.events[name] = (d.events[name] || 0) + 1;
    var label = labelOf(props);
    if (label) {
      var key = name + " · " + label;
      d.detail[key] = (d.detail[key] || 0) + 1;
    }
    saveLocal(d);
  }

  function sendUmami(name, props) {
    var u = CFG.umami || {};
    if (!u.host || !u.websiteId) return;
    safe(function () {
      fetch(u.host.replace(/\/+$/, "") + "/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          type: "event",
          payload: {
            website: u.websiteId,
            name: name,
            data: props || {},
            hostname: location.hostname,
            url: "/" + name,
            referrer: document.referrer || "",
            language: navigator.language || "",
          },
        }),
      }).catch(function () {});
    });
  }

  function sendGoatcounter(name, props) {
    var g = CFG.goatcounter || {};
    if (!g.host) return;
    var label = labelOf(props);
    var path = "/" + name + (label ? "/" + label : "");
    safe(function () {
      var img = new Image();
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.src = g.host.replace(/\/+$/, "") + "/count"
        + "?p=" + encodeURIComponent(path)
        + "&t=" + encodeURIComponent(name);
    });
  }

  function track(name, props) {
    if (!name) return;
    recordLocal(name, props);
    if (CFG.debug) safe(function () { console.log("[복무왕]", name, props || {}); });
    if (CFG.provider === "umami") sendUmami(name, props);
    else if (CFG.provider === "goatcounter") sendGoatcounter(name, props);
  }

  // 검색은 타이핑마다 부르지 않고, 900ms 멈춘 뒤 한 번만 기록합니다.
  function trackSearch(query, regHits, scHits) {
    clearTimeout(searchTimer);
    var q = String(query || "").trim();
    if (q.length < 2) return;
    searchTimer = setTimeout(function () {
      var hits = (regHits || 0) + (scHits || 0);
      if (hits === 0) {
        // 결과 0건 — 규정집의 빈 곳을 알려주는 신호라 검색어를 남깁니다.
        var clean = sanitize(q);
        if (clean) track("search_zero", { q: clean });
      } else {
        // 결과가 있으면 원문은 남기지 않습니다.
        track("search", { len: q.length, hits: hits });
      }
    }, 900);
  }

  function markSession() {
    if (sessionMarked) return;
    sessionMarked = true;
    var fresh = !safe(function () { return sessionStorage.getItem(SS_KEY); }, null);
    safe(function () { sessionStorage.setItem(SS_KEY, "1"); });
    if (!fresh) return;
    var d = loadLocal();
    d.sessions = (d.sessions || 0) + 1;
    saveLocal(d);
    track("app_open", {});
  }

  // --- 콘솔에서 확인 -------------------------------------------------------
  // 브라우저 개발자도구 콘솔에 bokmuStats() 를 입력하면 표로 보입니다.
  window.bokmuStats = function () {
    var d = loadLocal();
    console.log("== 복무왕 이용 현황 (이 브라우저에 저장된 기록) ==");
    console.table({
      "첫 사용": d.first || "-",
      "마지막 사용": d.last || "-",
      "방문 횟수": d.sessions || 0,
      "외부 전송": CFG.provider || "꺼짐",
    });
    console.log("-- 동작별 횟수 --");
    console.table(d.events);
    var keys = Object.keys(d.detail).sort(function (a, b) { return d.detail[b] - d.detail[a]; });
    var top = {};
    keys.slice(0, 30).forEach(function (k) { top[k] = d.detail[k]; });
    console.log("-- 많이 쓴 항목 상위 30 --");
    console.table(top);
    return d;
  };

  window.bokmuStatsReset = function () {
    safe(function () { localStorage.removeItem(LS_KEY); });
    console.log("복무왕 이용 기록을 지웠습니다.");
  };

  window.bokmuTrack = track;
  window.bokmuTrackSearch = trackSearch;
  window.bokmuMarkSession = markSession;
  window.bokmuSanitize = sanitize;
})();
