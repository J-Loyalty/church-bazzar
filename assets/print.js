(function () {
  "use strict";

  document.getElementById("printed").textContent =
    "인쇄일 " + new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  // Left out of the printed bundle by default. Neither is wrong to print -- they
  // are simply not what someone carries around on the day, and together they are
  // nine of the bundle's fifty-one pages.
  var OFF_BY_DEFAULT = {
    "docs/가치_기준.md": "문서를 쓸 때 쓰는 판단 기준입니다. 행사 당일에는 볼 일이 없습니다.",
    "docs/확인_필요_체크리스트.md": "아직 정해지지 않은 126가지입니다. 회의 때마다 바뀌므로 종이에 남기면 금세 옛 내용이 됩니다."
  };

  var SELECT_KEY = "cbz_print_v1";
  var cache = {};          // 경로 → 렌더된 HTML. 한 번만 받아온다
  var failed = {};         // 경로 → true. 못 받아온 문서
  var selected = loadSelection();

  function defaultSelection() {
    var out = {};
    window.SEQUENCE.forEach(function (item) {
      out[item.path] = !OFF_BY_DEFAULT[item.path];
    });
    return out;
  }

  function loadSelection() {
    var base = defaultSelection();
    var saved = CBZ.load(SELECT_KEY, null);
    if (saved) {
      // 저장된 값 중 지금도 있는 문서만 받아들인다 -- 문서를 지웠거나 새로
      // 넣었을 때 옛 선택이 목록을 망가뜨리지 않게.
      Object.keys(base).forEach(function (path) {
        if (typeof saved[path] === "boolean") base[path] = saved[path];
      });
    }
    return base;
  }

  function saveSelection() { CBZ.save(SELECT_KEY, selected); }

  function chosen() {
    return window.SEQUENCE.filter(function (item) { return selected[item.path]; });
  }

  // ---------- 고르는 칸 ----------
  (function renderPicker() {
    var html = "";
    window.NAV.forEach(function (group) {
      html += '<p class="group">' + MD.escapeHtml(group.group) + '</p><div class="items">';
      group.items.forEach(function (item) {
        var why = OFF_BY_DEFAULT[item.path];
        html += '<label><input type="checkbox" data-path="' + MD.escapeHtml(item.path) + '"' +
          (selected[item.path] ? " checked" : "") + "><span>" + MD.escapeHtml(item.label) +
          (why ? '<span class="why">' + MD.escapeHtml(why) + "</span>" : "") + "</span></label>";
      });
      html += "</div>";
    });
    document.getElementById("picker-list").innerHTML = html;
  })();

  document.getElementById("picker-list").addEventListener("change", function (e) {
    var box = e.target.closest("input[type=checkbox]");
    if (!box) return;
    selected[box.dataset.path] = box.checked;
    saveSelection();
    render();
  });

  function setAll(all) {
    selected = defaultSelection();
    if (all) {
      window.SEQUENCE.forEach(function (item) { selected[item.path] = true; });
    }
    saveSelection();
    document.querySelectorAll("#picker-list input[type=checkbox]").forEach(function (box) {
      box.checked = !!selected[box.dataset.path];
    });
    render();
  }
  document.getElementById("btn-all").addEventListener("click", function () { setAll(true); });
  document.getElementById("btn-default").addEventListener("click", function () { setAll(false); });

  // ---------- 차례와 본문 ----------
  // 차례 번호는 고른 문서만 이어서 매긴다 -- 3번 다음이 5번이면 종이에서 빠진
  // 장을 찾게 된다.
  function renderToc(list) {
    var html = "<h2>차례</h2>";
    var n = 0;
    window.NAV.forEach(function (group) {
      var items = group.items.filter(function (item) { return selected[item.path]; });
      if (!items.length) return;
      html += '<p class="group">' + MD.escapeHtml(group.group) + '</p><ol start="' + (n + 1) + '">';
      items.forEach(function (item) {
        n++;
        html += "<li>" + MD.escapeHtml(item.label) + "</li>";
      });
      html += "</ol>";
    });
    document.getElementById("toc").innerHTML = html;
  }

  function render() {
    var list = chosen();
    renderToc(list);
    document.getElementById("docs").innerHTML = list.map(function (item) {
      return '<section class="doc">' + (cache[item.path] || "") + "</section>";
    }).join("");
    setStatus(list);
  }

  function setStatus(list) {
    var missing = list.filter(function (item) { return failed[item.path]; }).length;
    var el = document.getElementById("status");
    if (missing) {
      el.textContent = "문서 " + list.length + "개 중 " + missing + "개를 불러오지 못했습니다.";
      return;
    }
    var left = window.SEQUENCE.length - list.length;
    el.textContent = "문서 " + list.length + "개를 한 묶음으로 준비했습니다" +
      (left ? " (" + left + "개 제외)" : "") + ". 한 문서가 한 장에서 시작하도록 인쇄됩니다.";
  }

  // 고를 때마다 다시 받아오지 않도록 읽는 순서 전체를 한 번에 받아 담아둔다.
  Promise.all(window.SEQUENCE.map(function (item) {
    return fetch(item.path)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var dir = item.path.indexOf("/") >= 0 ? item.path.slice(0, item.path.lastIndexOf("/")) : "";
        cache[item.path] = MD.render(text, dir);
      })
      .catch(function (err) {
        failed[item.path] = true;
        cache[item.path] = '<p class="load-error">' + MD.escapeHtml(item.label) +
          " 문서를 불러오지 못했습니다 (" + MD.escapeHtml(err.message) + ")</p>";
      });
  })).then(render);

  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
})();
