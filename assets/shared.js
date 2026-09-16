// 여러 화면이 함께 쓰는 잔 도구. 같은 함수가 화면마다 조금씩 다르게 베껴져
// 있으면 한쪽만 고치고 지나가기 쉬워서 한곳으로 모았다.
//
// **다른 모든 스크립트보다 먼저 읽어야 한다** — assets/markdown.js가 이 파일의
// esc를 쓴다.
(function (global) {
  "use strict";

  // null과 undefined는 "null"/"undefined"라는 글자가 아니라 빈 칸으로 만든다.
  // String(null)을 그대로 쓰면 화면에 그 네 글자가 찍힌다.
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // localStorage는 사생활 보호 모드나 브라우저 설정으로 막혀 있을 수 있고, 저장된
  // 값이 깨져 있을 수도 있다. 어느 쪽이든 화면은 그대로 동작해야 하므로 읽기는
  // 기본값을 돌려주고, 쓰기는 됐는지 여부만 알린다 — 저장 실패를 사용자에게
  // 알릴지는 화면마다 다르다. 정산 도구처럼 잃으면 곤란한 값은 알려야 한다.
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 막혀 있거나 깨진 값 — 기본값으로 시작한다 */ }
    return fallback;
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 이름이나 암호처럼 JSON을 거칠 필요가 없는 값 하나를 넣고 빼는 자리.
  function loadText(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback || "";
    } catch (e) {
      return fallback || "";
    }
  }

  function saveText(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 한글 한 글자는 여러 번의 input 이벤트를 거쳐 만들어진다 (ㅈ -> 조). 그 도중에
  // 입력칸이 든 화면을 다시 그리면 조합이 끊겨 "1ㅈㅗ" 처럼 깨진 채로 남는다.
  // 그래서 다시 그리기를 조합이 끝날 때까지 미룬다. 조합 중이 아니면 그대로 실행.
  var composing = false;
  var pending = null;

  document.addEventListener("compositionstart", function () { composing = true; });
  document.addEventListener("compositionend", function () {
    composing = false;
    // 브라우저마다 compositionend 와 마지막 input 의 순서가 달라, 한 박자 뒤에
    // 실행해야 마지막 글자가 상태에 들어간 뒤에 그려진다.
    setTimeout(function () {
      if (composing || !pending) return;
      var fn = pending;
      pending = null;
      fn();
    }, 0);
  });

  function afterTyping(fn) {
    if (composing) { pending = fn; return; }
    fn();
  }

  global.CBZ = {
    esc: esc,
    afterTyping: afterTyping,
    load: load,
    save: save,
    loadText: loadText,
    saveText: saveText
  };
})(window);
