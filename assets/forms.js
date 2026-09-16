(function () {
  "use strict";

  var STORAGE_KEY = "cbz_forms_v1";

  // 마감 제출용. 권종 세 줄과, 성격이 다른 두 줄(초기 지급·현금 매출)을 선으로
  // 갈라 적는다. 현금 매출은 올해 일부 현금 결제가 가능해지면서 필요해진 칸이다.
  var ENV_GROUPS = [
    ["1,000원 교환권", "5,000원 교환권", "10,000원 교환권"],
    ["초기지급", "현금 매출"]
  ];

  var SHEET_FOOT = "2026년 이웃돕기 사랑의 바자회 · 2026. 10. 9. (금)";

  var booths = load();

  function load() {
    var parsed = CBZ.load(STORAGE_KEY, null);
    return parsed && parsed.length ? parsed : [blankBooth()];
  }

  function save() { CBZ.save(STORAGE_KEY, booths); }

  function blankBooth() { return { name: "", items: [{ name: "", price: "" }] }; }

  var esc = CBZ.esc;

  function won(v) {
    var n = Number(v);
    if (!v && v !== 0) return "";
    if (!isFinite(n)) return "";
    return n.toLocaleString("ko-KR") + "원";
  }

  // ---------- Input ----------
  function renderInputs() {
    var box = document.getElementById("booths");
    box.innerHTML = booths.map(function (b, bi) {
      var rows = b.items.map(function (it, ii) {
        return '<input type="text" placeholder="품목명" data-b="' + bi + '" data-i="' + ii + '" data-f="name" value="' + esc(it.name) + '">' +
               '<input type="number" min="0" step="100" placeholder="가격" data-b="' + bi + '" data-i="' + ii + '" data-f="price" value="' + esc(it.price) + '">' +
               '<button type="button" class="row-del" data-del-item="' + bi + '" data-i="' + ii + '" title="이 품목 지우기">✕</button>';
      }).join("");
      return '<div class="booth">' +
        '<div class="booth-head"><label>조 이름</label>' +
        '<input type="text" placeholder="예: 1조 국수" data-b="' + bi + '" data-f="boothname" value="' + esc(b.name) + '"></div>' +
        '<div class="items"><span class="col-head">품목명</span><span class="col-head">가격</span><span></span>' + rows + "</div>" +
        '<button type="button" class="row-del booth-del" data-del-booth="' + bi + '">이 조 지우기</button>' +
        "</div>";
    }).join("");
  }

  document.getElementById("booths").addEventListener("input", function (e) {
    var el = e.target;
    if (el.tagName !== "INPUT") return;
    var bi = Number(el.dataset.b);
    if (el.dataset.f === "boothname") {
      booths[bi].name = el.value;
      autoGrowBooths();
    } else {
      var ii = Number(el.dataset.i);
      booths[bi].items[ii][el.dataset.f] = el.value;
      autoGrowItems(bi);
    }
    save();
    renderPreviews();
  });

  // Typing in the last row is the signal that another one is wanted; making the
  // volunteer hunt for an "add" button for every single item would be worse.
  function autoGrowItems(bi) {
    var items = booths[bi].items;
    var last = items[items.length - 1];
    if (last && (last.name || last.price)) {
      items.push({ name: "", price: "" });
      redraw(true);
    }
  }

  function autoGrowBooths() {
    var last = booths[booths.length - 1];
    if (last && last.name) {
      booths.push(blankBooth());
      redraw(true);
    }
  }

  // Re-rendering steals focus, so put the caret back where it was.
  function redraw(keepFocus) {
    var a = document.activeElement;
    var key = keepFocus && a && a.dataset ? [a.dataset.b, a.dataset.i, a.dataset.f].join("|") : null;
    var pos = keepFocus && a && a.selectionStart != null ? a.selectionStart : null;
    renderInputs();
    if (key) {
      var next = Array.prototype.find.call(document.querySelectorAll("#booths input"), function (el) {
        return [el.dataset.b, el.dataset.i, el.dataset.f].join("|") === key;
      });
      if (next) {
        next.focus();
        if (pos != null && next.setSelectionRange) {
          try { next.setSelectionRange(pos, pos); } catch (e) { /* number 칸은 지원 안 함 */ }
        }
      }
    }
  }

  document.getElementById("booths").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.delBooth != null) {
      booths.splice(Number(btn.dataset.delBooth), 1);
      if (!booths.length) booths.push(blankBooth());
    } else if (btn.dataset.delItem != null) {
      var bi = Number(btn.dataset.delItem);
      booths[bi].items.splice(Number(btn.dataset.i), 1);
      if (!booths[bi].items.length) booths[bi].items.push({ name: "", price: "" });
    } else { return; }
    save();
    redraw(false);
    renderPreviews();
  });

  document.getElementById("btn-add-booth").addEventListener("click", function () {
    booths.push(blankBooth());
    save();
    redraw(false);
    renderPreviews();
  });

  // ---------- Previews ----------
  // A booth with no name would print a blank sheet, so it is left out.
  function named() {
    return booths.filter(function (b) { return String(b.name).trim(); });
  }

  function renderPreviews() {
    var list = named();
    var menu = document.getElementById("preview-menu");
    var env = document.getElementById("preview-env");

    if (!list.length) {
      menu.innerHTML = '<p class="hint">조 이름을 적으면 여기에 나타납니다.</p>';
      env.innerHTML = '<p class="hint">조 이름을 적으면 여기에 나타납니다.</p>';
      return;
    }

    warnCrowded(list);

    menu.innerHTML = list.map(function (b) {
      var items = b.items.filter(function (it) { return String(it.name).trim(); });
      var body = items.length
        ? '<div class="menu-list">' + items.map(function (it) {
            var price = won(it.price);
            return '<p class="menu-item">' + esc(it.name) +
              (price ? '<span class="price">' + price + "</span>" : "") + "</p>";
          }).join("") + "</div>"
        : '<p class="empty">품목을 적으면 여기에 나옵니다</p>';
      // The frame is a fixed size, so a long list steps the type down rather than
      // spilling past the border. Past ten it gets too small to read across a
      // stall, which is what the warning below the print buttons is for.
      var step = items.length > 10 ? "2" : (items.length > 6 ? "1" : "");
      var many = step ? ' data-many="' + step + '"' : "";
      return '<div class="sheet sheet-menu"' + many + '><p class="booth-name">' + esc(b.name) + "</p>" + body +
        '<p class="sheet-foot">' + esc(SHEET_FOOT) + "</p></div>";
    }).join("");

    env.innerHTML = list.map(function (b) {
      var groups = ENV_GROUPS.map(function (labels) {
        return '<div class="env-group">' + labels.map(function (label) {
          return '<div class="env-line"><span class="env-label">' + esc(label) +
            '</span><span class="env-blank"></span></div>';
        }).join("") + "</div>";
      }).join("");
      return '<div class="sheet sheet-env"><p class="booth-name">' + esc(b.name) + "</p>" + groups +
        '<p class="sheet-foot">마감 제출용 · ' + esc(SHEET_FOOT) + "</p></div>";
    }).join("");
  }

  // ---------- Crowded menus ----------
  function warnCrowded(list) {
    var crowded = list.filter(function (b) {
      return b.items.filter(function (it) { return String(it.name).trim(); }).length > 10;
    }).map(function (b) { return b.name; });

    var el = document.getElementById("crowd-warning");
    if (!crowded.length) {
      el.textContent = "";
      el.className = "hint";
      return;
    }
    el.textContent = "품목이 많아 글자가 작아지는 조: " + crowded.join(", ") +
      ". 멀리서 읽기 어려울 수 있으니 메뉴판을 두 장으로 나누는 것을 권합니다.";
    el.className = "warn";
  }

  // ---------- Print ----------
  // The two sheets need different paper orientations, so each print run sets its
  // own @page rule and hides the other section.
  var pageStyle = document.createElement("style");
  document.head.appendChild(pageStyle);

  function printAs(mode) {
    if (!named().length) {
      alert("먼저 조 이름을 적어주세요.");
      return;
    }
    document.body.className = "printing-" + mode;
    pageStyle.textContent = mode === "menu"
      ? "@page { size: A4 landscape; margin: 15mm; }"
      : "@page { size: A4 portrait; margin: 15mm; }";
    window.print();
  }

  window.addEventListener("afterprint", function () {
    document.body.className = "";
    pageStyle.textContent = "";
  });

  document.getElementById("btn-print-menu").addEventListener("click", function () { printAs("menu"); });
  document.getElementById("btn-print-env").addEventListener("click", function () { printAs("env"); });

  renderInputs();
  renderPreviews();
})();
