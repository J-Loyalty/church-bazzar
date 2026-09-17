(function () {
  "use strict";

  var STORAGE_KEY = "cbz_voucher_v1";
  var PW_KEY = "cbz_settle_pw";
  var DENOMS = [1000, 5000, 10000];

  // 계산은 settle.js 한 곳에만 있다. 여기서는 현재 state 를 넘겨 쓰는 얇은 껍데기만 둔다
  // -- 결산 보고 화면(report.js)도 같은 함수를 쓰므로 두 화면의 숫자가 갈라질 수 없다.
  var DENOMS = SETTLE.DENOMS;
  var num = SETTLE.num;
  var uid = SETTLE.uid;
  var money = SETTLE.money;
  var denomTotal = SETTLE.denomTotal;
  function emptyState() { return SETTLE.emptyState(); }
  function normalize(p) { return SETTLE.normalize(p); }
  function teams() { return SETTLE.teams(state); }
  function itemsOf(t) { return SETTLE.itemsOf(state, t); }
  function compute() { return SETTLE.compute(state); }


  function loadState() { return normalize(CBZ.load(STORAGE_KEY, null)); }

  function saveState() {
    // 정산 중에 조용히 저장되지 않으면 하루치 집계가 그대로 날아간다.
    if (!CBZ.save(STORAGE_KEY, state)) {
      alert("데이터를 저장하지 못했습니다. 브라우저 저장 공간이 가득 찼거나 막혀 있습니다. " +
        "[저장·백업] 탭에서 시트로 보내거나 JSON으로 내보내 두세요.");
    }
    renderReport();
  }

  var state = loadState();
  var esc = CBZ.esc;


  function ensure(map, id) {
    if (!map[id]) map[id] = { 1000: 0, 5000: 0, 10000: 0 };
    return map[id];
  }


  // ---------- 탭 ----------
  document.getElementById("tabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (btn) showTab(btn.dataset.tab);
  });

  document.querySelectorAll("[data-goto]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showTab(btn.dataset.goto);
      window.scrollTo(0, 0);
    });
  });

  function showTab(name) {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
  }

  // ---------- 품목 등록 ----------
  // 한 줄이 한 품목이다. 조 이름은 여러 줄에 되풀이해 적고, 조 단위인 재료원가는
  // 그 조가 처음 나오는 줄에서만 받는다 -- 세 번 적게 하면 세 배로 잡힌다.
  // 마지막 줄을 채우면 다음 줄이 저절로 생긴다 (메뉴판 만들기와 같은 방식).
  function renderItems() {
    var box = document.getElementById("item-body");
    var list = state.items.slice();
    var last = list[list.length - 1];
    if (!list.length || String(last.team || "").trim() || String(last.name || "").trim() ||
        num(last.price)) {
      list.push({ id: "", team: "", name: "", price: 0 });
    }

    var focus = document.activeElement;
    var keep = focus && focus.dataset && focus.dataset.ii !== undefined
      ? { i: focus.dataset.ii, f: focus.dataset.fld, start: focus.selectionStart } : null;

    var seen = {};
    box.innerHTML = list.map(function (it, i) {
      var t = String(it.team || "").trim();
      var first = t && !seen[t];
      if (t) seen[t] = true;
      return itemRow(it, i, first, i < state.items.length);
    }).join("");

    if (keep) {
      var back = box.querySelector('[data-ii="' + keep.i + '"][data-fld="' + keep.f + '"]');
      if (back) {
        back.focus();
        if (back.type === "text" && keep.start != null) back.setSelectionRange(keep.start, keep.start);
      }
    }
  }

  function itemRow(it, i, first, real) {
      var t = String(it.team || "").trim();
      var cells =
        '<td><input type="text" placeholder="예: 4조" aria-label="' + (i + 1) +
          '번째 줄 조" data-ii="' + i + '" data-fld="team" value="' + esc(it.team) + '"></td>' +
        '<td><input type="text" placeholder="예: 닭꼬치" aria-label="' + (i + 1) +
          '번째 줄 항목" data-ii="' + i + '" data-fld="name" value="' + esc(it.name) + '"></td>' +
        '<td><input type="number" min="0" step="100" inputmode="numeric" aria-label="' + (i + 1) +
          '번째 줄 단가" data-ii="' + i + '" data-fld="price" value="' + num(it.price) + '"></td>';

      cells += costCells(t, first);

      cells += '<td class="col-btn">' + (real
        ? '<button class="remove-btn" data-idel="' + i + '">지우기</button>'
        : "") + "</td>";
      return "<tr>" + cells + "</tr>";
  }

  function costCells(t, first) {
    if (first) {
      return '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' +
        esc(t) + ' 재료원가" data-team="' + esc(t) + '" data-cost="1" value="' +
        num(state.costs[t]) + '"></td>' +
        '<td><label class="check-cell"><input type="checkbox" aria-label="' +
        esc(t) + ' 재료원가를 재정에서 지급함" data-team="' + esc(t) + '" data-costpaid="1"' +
        (state.costPaid[t] ? " checked" : "") + '></label></td>';
    }
    return '<td class="span-note">' + (t ? "위 " + esc(t) + " 줄에" : "—") + "</td>" +
      '<td class="span-note">—</td>';
  }

  // 조 이름을 치면 재료원가 칸이 그 줄로 옮겨가야 한다. 표를 통째로 다시 그리면
  // 방금 치던 칸이 지워지므로, **그 두 칸만** 바꿔 끼운다. Tab 이 곧바로
  // 조 > 항목 > 단가 > 재료원가 로 이어지려면 칸이 미리 있어야 한다.
  function syncCostCells() {
    var rows = document.getElementById("item-body").querySelectorAll("tr");
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var it = state.items[i] || { team: "" };
      var t = String(it.team || "").trim();
      var first = !!t && !seen[t];
      if (t) seen[t] = true;

      var cells = rows[i].cells;
      if (cells.length < 5) continue;
      if (cells[3].contains(document.activeElement) ||
          cells[4].contains(document.activeElement)) continue;

      var cur = cells[3].querySelector("[data-cost]");
      if (!!cur === first && (!first || cur.dataset.team === t)) continue;

      // 옛 다섯째 칸을 **먼저** 지운다. 나중에 지우면 방금 넣은 칸이 그 자리라
      // 재정 지급 칸이 사라진다.
      cells[4].remove();
      cells[3].outerHTML = costCells(t, first);
    }
  }

  // 마지막 줄이 채워지면 빈 줄 하나를 **덧붙인다**. 표 전체를 다시 그리지 않으므로
  // 한글을 치는 중에도 입력칸이 살아 있다.
  function growItems() {
    var box = document.getElementById("item-body");
    var rows = box.querySelectorAll("tr");
    if (rows.length !== state.items.length) return;   // 이미 빈 줄이 있다
    // 빈 줄이던 마지막 줄이 방금 진짜 줄이 되었으니 지우기 단추를 붙여 준다.
    var cell = rows[rows.length - 1].querySelector(".col-btn");
    if (cell && !cell.querySelector("button")) {
      cell.innerHTML = '<button class="remove-btn" data-idel="' + (rows.length - 1) + '">지우기</button>';
    }
    box.insertAdjacentHTML("beforeend",
      itemRow({ team: "", name: "", price: 0 }, state.items.length, false, false));
  }

  // 조·항목은 한글이라 한 글자가 여러 번의 input 을 거친다. 그 도중에 표를 다시
  // 그리면 조합이 끊겨 "1ㅈㅗ" 처럼 깨지므로, 치는 동안에는 값만 담아 두고 칸을
  // 떠날 때(change) 한 번 정리한다. 빈 줄 덧붙이기는 기존 줄을 건드리지 않아 안전.
  document.getElementById("item-body").addEventListener("input", function (e) {
    var el = e.target;
    if (el.dataset.team !== undefined) {
      var t = el.dataset.team;
      if (el.dataset.costpaid) state.costPaid[t] = el.checked;
      else state.costs[t] = num(el.value);
      saveState();
      return;
    }
    if (el.dataset.ii === undefined) return;
    var i = Number(el.dataset.ii);
    while (state.items.length <= i) state.items.push({ id: uid(), team: "", name: "", price: 0 });
    var it = state.items[i];
    if (el.dataset.fld === "price") it.price = num(el.value);
    else it[el.dataset.fld] = el.value;
    saveState();
    growItems();
    if (el.dataset.fld === "team") syncCostCells();
  });



  document.getElementById("item-body").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-idel]");
    if (!btn) return;
    var i = Number(btn.dataset.idel);
    var it = state.items[i];
    var label = (String(it.team || "").trim() + " " + String(it.name || "").trim()).trim();
    if (!confirm("「" + (label || "빈 줄") + "」 줄을 지울까요?")) return;
    state.items.splice(i, 1);
    dropOrphans();
    saveState();
    redrawTeams();
  });

  // 표 **안에서** 칸을 옮기는 동안에는 다시 그리지 않는다. Tab 은 다음 칸으로
  // 포커스를 옮기면서 change 를 내는데, 그때 표를 다시 그리면 방금 포커스가 들어간
  // 칸이 지워져 포커스가 엉뚱한 곳으로 튄다. 표를 아주 떠날 때 한 번만 정리한다.
  document.getElementById("item-body").addEventListener("focusout", function (e) {
    var box = document.getElementById("item-body");
    if (box.contains(e.relatedTarget)) return;
    CBZ.afterTyping(function () {
      if (box.contains(document.activeElement)) return;   // 그새 다시 들어왔다
      redrawTeams();
    });
  });

  // 어느 줄에도 없는 조 이름이 남아 있으면 합계에 유령이 낀다.
  function dropOrphans() {
    var live = {};
    teams().forEach(function (t) { live[t] = true; });
    [state.floats, state.finals, state.cash, state.costs, state.costPaid, state.presales]
      .forEach(function (map) {
        Object.keys(map).forEach(function (k) { if (!live[k]) delete map[k]; });
      });
  }

  // 조 목록이 바뀌면 조를 쓰는 표가 모두 따라 바뀌어야 한다.
  function redrawTeams() {
    renderItems();
    renderDenomTable("float-body", state.floats);
    renderDenomTable("final-body", state.finals, true);
    renderFloatSum();
    renderReport();
  }

  // ---------- 조별 권종 표 ----------
  function renderDenomTable(bodyId, map, withCash) {
    var tbody = document.getElementById(bodyId);
    var list = teams();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="' + (withCash ? 7 : 5) +
        '" class="hint">먼저 [1 개장 전]에서 조와 항목을 등록하세요.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (t) {
      var entry = ensure(map, t);
      var names = itemsOf(t).map(function (it) { return it.name; }).join(" · ");
      var cells = '<td>' + esc(t) +
        (names ? '<span class="row-sub">' + esc(names) + '</span>' : "") + "</td>";
      DENOMS.forEach(function (d) {
        cells += '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' +
          esc(t) + " " + d.toLocaleString("ko-KR") + '원 장수" data-booth="' + esc(t) +
          '" data-denom="' + d + '" value="' + (entry[d] || 0) + '"></td>';
      });
      cells += '<td class="row-total">' + money(denomTotal(entry)) + "</td>";
      if (withCash) {
        cells += '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' +
          esc(t) + ' 현금 매출" data-booth="' + esc(t) + '" data-cash="1" value="' +
          num(state.cash[t]) + '"></td>';
        cells += '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' +
          esc(t) + ' 행사전 구매 매출" data-booth="' + esc(t) + '" data-presale="1" value="' +
          num(state.presales[t]) + '"></td>';
      }
      return "<tr>" + cells + "</tr>";
    }).join("");
  }

  function wireDenomTable(bodyId, map) {
    document.getElementById(bodyId).addEventListener("input", function (e) {
      var input = e.target;
      if (input.tagName !== "INPUT") return;
      var id = input.dataset.booth;
      if (input.dataset.cash) {
        state.cash[id] = num(input.value);
      } else if (input.dataset.presale) {
        state.presales[id] = num(input.value);
      } else {
        ensure(map, id)[input.dataset.denom] = num(input.value);
        var row = input.closest("tr");
        row.querySelector(".row-total").textContent = money(denomTotal(map[id]));
      }
      saveState();
      renderFloatSum();
    });
  }

  wireDenomTable("float-body", state.floats);
  wireDenomTable("final-body", state.finals);

  function renderFloatSum() {
    var sum = teams().reduce(function (a, t) { return a + denomTotal(state.floats[t]); }, 0);
    document.getElementById("float-sum").textContent = money(sum);
  }

  // ---------- 교환소 통 ----------
  function renderTin(gridId, entry, totalId) {
    var grid = document.getElementById(gridId);
    grid.innerHTML = DENOMS.map(function (d) {
      return '<label class="denom-cell">' + d.toLocaleString("ko-KR") + "원" +
        '<input type="number" min="0" step="1" inputmode="numeric" data-denom="' + d +
        '" value="' + num(entry[d]) + '"><span class="denom-unit">장</span></label>';
    }).join("");
    document.getElementById(totalId).textContent = money(denomTotal(entry));
  }

  function wireTin(gridId, entry, totalId) {
    document.getElementById(gridId).addEventListener("input", function (e) {
      if (e.target.tagName !== "INPUT") return;
      entry[e.target.dataset.denom] = num(e.target.value);
      document.getElementById(totalId).textContent = money(denomTotal(entry));
      saveState();
    });
  }

  wireTin("open-tin", state.desk.openTin, "open-tin-total");
  wireTin("close-tin", state.desk.closeTin, "close-tin-total");

  // ---------- 단일 숫자 칸 ----------
  [
    ["open-cash", function (v) { state.desk.openCash = v; }, function () { return state.desk.openCash; }],
    ["close-cash", function (v) { state.desk.closeCash = v; }, function () { return state.desk.closeCash; }],
    ["transfer", function (v) { state.desk.transfer = v; }, function () { return state.desk.transfer; }]
  ].forEach(function (f) {
    var el = document.getElementById(f[0]);
    el.addEventListener("input", function () { f[1](num(el.value)); saveState(); });
    el.dataset.get = f[0];
  });

  function renderSingles() {
    document.getElementById("open-cash").value = state.desk.openCash;
    document.getElementById("close-cash").value = state.desk.closeCash;
    document.getElementById("transfer").value = state.desk.transfer;

  }

  // ---------- 공통 비용 ----------
  // 마지막 줄을 채우면 다음 줄이 저절로 생긴다. 몇 건이 될지 미리 알 수 없고,
  // 「줄 추가」를 누르게 하면 그 버튼을 못 찾는 사람이 생긴다.
  function renderCommon() {
    var box = document.getElementById("common-costs");
    var list = state.commonCosts.slice();
    if (!list.length || String(list[list.length - 1].name).trim() || num(list[list.length - 1].amount)) {
      list.push({ name: "", amount: 0, paid: false });
    }
    var focus = document.activeElement;
    var keep = focus && focus.dataset && focus.dataset.ci !== undefined
      ? { i: focus.dataset.ci, f: focus.dataset.cf, start: focus.selectionStart } : null;

    box.innerHTML = '<div class="cost-head"><span>항목</span><span>금액 (원)</span><span>재정 지급</span><span></span></div>' +
      list.map(function (c, i) { return commonRow(c, i, i < state.commonCosts.length); }).join("");

    renderCommonSum();

    if (keep) {
      var back = box.querySelector('[data-ci="' + keep.i + '"][data-cf="' + keep.f + '"]');
      if (back) {
        back.focus();
        if (back.type === "text" && keep.start != null) back.setSelectionRange(keep.start, keep.start);
      }
    }
  }

  function commonRow(c, i, real) {
    return '<div class="cost-row">' +
      '<input type="text" placeholder="예: 교환권 인쇄비" aria-label="공통 비용 항목 ' + (i + 1) +
        '" data-ci="' + i + '" data-cf="name" value="' + esc(c.name) + '">' +
      '<input type="number" min="0" step="1" inputmode="numeric" aria-label="공통 비용 금액 ' + (i + 1) +
        '" data-ci="' + i + '" data-cf="amount" value="' + num(c.amount) + '">' +
      '<label class="check-cell"><input type="checkbox" aria-label="공통 비용 ' + (i + 1) +
        ' 재정에서 지급함" data-ci="' + i + '" data-cf="paid"' + (c.paid ? " checked" : "") +
        '><span class="check-text">재정 지급</span></label>' +
      (real ? '<button class="remove-btn" data-cdel="' + i + '">지우기</button>' : "<span></span>") +
      "</div>";
  }

  document.getElementById("common-costs").addEventListener("input", function (e) {
    var el = e.target;
    if (el.dataset.ci === undefined) return;
    var i = Number(el.dataset.ci);
    while (state.commonCosts.length <= i) state.commonCosts.push({ name: "", amount: 0, paid: false });
    if (el.dataset.cf === "name") state.commonCosts[i].name = el.value;
    else if (el.dataset.cf === "paid") state.commonCosts[i].paid = el.checked;
    else state.commonCosts[i].amount = num(el.value);
    saveState();
    // 치는 중에 다시 그리면 한글 조합이 깨지고, Tab 으로 옮겨간 칸도 지워진다.
    // 합계만 고치고, 줄이 더 필요하면 덧붙이기만 한다 (위 품목 표와 같은 이유).
    growCommon();
  });

  document.getElementById("common-costs").addEventListener("focusout", function (e) {
    var box = document.getElementById("common-costs");
    if (box.contains(e.relatedTarget)) return;
    CBZ.afterTyping(function () {
      if (box.contains(document.activeElement)) return;
      renderCommon();
    });
  });

  function growCommon() {
    var box = document.getElementById("common-costs");
    renderCommonSum();
    var rows = box.querySelectorAll(".cost-row");
    if (rows.length !== state.commonCosts.length) return;
    var last = rows[rows.length - 1].lastElementChild;
    if (last && last.tagName !== "BUTTON") {
      last.outerHTML = '<button class="remove-btn" data-cdel="' + (rows.length - 1) + '">지우기</button>';
    }
    box.insertAdjacentHTML("beforeend", commonRow(
      { name: "", amount: 0, paid: false }, state.commonCosts.length, false));
  }

  function renderCommonSum() {
    document.getElementById("common-sum").textContent =
      money(state.commonCosts.reduce(function (a, c) { return a + num(c.amount); }, 0));
  }

  document.getElementById("common-costs").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-cdel]");
    if (!btn) return;
    state.commonCosts.splice(Number(btn.dataset.cdel), 1);
    saveState();
    renderCommon();
  });

  // ---------- 공통 수입 ----------
  // 조에 붙지 않는 수입. 「교환권 판매」를 켜면 교환권을 팔고 받은 돈이라는 뜻이라
  // 대사 양쪽에도 함께 더해진다 -- 목장쿠폰·선판매쿠폰·전도용 교환권이 그것이다.
  // 켜지 않은 것(헌옷 수거·기타)은 교환권을 거치지 않으므로 매출에만 더한다.
  function incomeRow(c, i, real) {
    return '<div class="cost-row">' +
      '<input type="text" placeholder="예: 목장쿠폰" aria-label="공통 수입 항목 ' + (i + 1) +
        '" data-ni="' + i + '" data-nf="name" value="' + esc(c.name) + '">' +
      '<input type="number" min="0" step="1" inputmode="numeric" aria-label="공통 수입 금액 ' + (i + 1) +
        '" data-ni="' + i + '" data-nf="amount" value="' + num(c.amount) + '">' +
      '<label class="check-cell"><input type="checkbox" aria-label="공통 수입 ' + (i + 1) +
        ' 교환권을 팔고 받은 돈" data-ni="' + i + '" data-nf="voucher"' + (c.voucher ? " checked" : "") +
        '><span class="check-text">교환권 판매</span></label>' +
      (real ? '<button class="remove-btn" data-ndel="' + i + '">지우기</button>' : "<span></span>") +
      "</div>";
  }

  function renderIncomes() {
    var box = document.getElementById("common-incomes");
    var list = state.commonIncomes.slice();
    var last = list[list.length - 1];
    if (!list.length || String(last.name).trim() || num(last.amount)) {
      list.push({ name: "", amount: 0, voucher: false });
    }
    var focus = document.activeElement;
    var keep = focus && focus.dataset && focus.dataset.ni !== undefined
      ? { i: focus.dataset.ni, f: focus.dataset.nf, start: focus.selectionStart } : null;

    box.innerHTML = '<div class="cost-head"><span>항목</span><span>금액 (원)</span><span>교환권 판매</span><span></span></div>' +
      list.map(function (c, i) { return incomeRow(c, i, i < state.commonIncomes.length); }).join("");
    renderIncomeSum();

    if (keep) {
      var back = box.querySelector('[data-ni="' + keep.i + '"][data-nf="' + keep.f + '"]');
      if (back) {
        back.focus();
        if (back.type === "text" && keep.start != null) back.setSelectionRange(keep.start, keep.start);
      }
    }
  }

  function renderIncomeSum() {
    document.getElementById("income-sum").textContent =
      money(state.commonIncomes.reduce(function (a, c) { return a + num(c.amount); }, 0));
  }

  function growIncomes() {
    var box = document.getElementById("common-incomes");
    renderIncomeSum();
    var rows = box.querySelectorAll(".cost-row");
    if (rows.length !== state.commonIncomes.length) return;
    var tail = rows[rows.length - 1].lastElementChild;
    if (tail && tail.tagName !== "BUTTON") {
      tail.outerHTML = '<button class="remove-btn" data-ndel="' + (rows.length - 1) + '">지우기</button>';
    }
    box.insertAdjacentHTML("beforeend", incomeRow(
      { name: "", amount: 0, voucher: false }, state.commonIncomes.length, false));
  }

  document.getElementById("common-incomes").addEventListener("input", function (e) {
    var el = e.target;
    if (el.dataset.ni === undefined) return;
    var i = Number(el.dataset.ni);
    while (state.commonIncomes.length <= i) {
      state.commonIncomes.push({ name: "", amount: 0, voucher: false });
    }
    if (el.dataset.nf === "name") state.commonIncomes[i].name = el.value;
    else if (el.dataset.nf === "voucher") state.commonIncomes[i].voucher = el.checked;
    else state.commonIncomes[i].amount = num(el.value);
    saveState();
    growIncomes();
  });

  document.getElementById("common-incomes").addEventListener("focusout", function (e) {
    var box = document.getElementById("common-incomes");
    if (box.contains(e.relatedTarget)) return;
    CBZ.afterTyping(function () {
      if (box.contains(document.activeElement)) return;
      renderIncomes();
    });
  });

  document.getElementById("common-incomes").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-ndel]");
    if (!btn) return;
    state.commonIncomes.splice(Number(btn.dataset.ndel), 1);
    saveState();
    renderIncomes();
  });

  // ---------- 결과 ----------
  function renderReport() {
    var c = compute();
    var set = function (id, v) { document.getElementById(id).textContent = v; };

    var body = document.getElementById("report-booth-body");
    body.innerHTML = c.rows.length
      ? c.rows.map(function (r) {
          var names = r.items.map(function (x) {
            return x.name + (x.price ? " " + money(x.price) : "");
          }).join(" · ");
          return "<tr><td>" + esc(r.name) +
            (names ? '<span class="row-sub">' + esc(names) + "</span>" : "") +
            "</td><td>" + money(r.float) + "</td><td>" +
            money(r.final) + "</td><td>" + money(r.voucher) + "</td><td>" +
            money(r.cash) + "</td><td>" + money(r.presale) + "</td><td>" +
            money(r.total) + "</td><td>" + money(r.cost) + "</td><td>" +
            (r.cost > 0 ? (r.costPaid ? "재정 지급" : "돌려드릴 것") : "—") + "</td></tr>";
        }).join("")
      : '<tr><td colspan="9" class="hint">등록된 조가 없습니다.</td></tr>';

    set("rb-float", money(c.floatSum));
    set("rb-final", money(c.finalSum));
    set("rb-voucher", money(c.voucherSum));
    set("rb-cash", money(c.cashSum));
    set("rb-presale", money(c.presaleBooth));
    set("rb-total", money(c.totalSum));
    set("rb-cost", money(c.costSum));

    set("r-open-tin", money(c.openTin));
    set("r-close-tin", money(c.closeTin));
    set("r-float", money(c.floatSum));
    set("r-pv1", money(c.incVoucher));
    set("r-pv2", money(c.incVoucher));
    set("r-sold", money(c.sold));
    set("r-cash-delta", money(c.cashDelta));
    set("r-transfer", money(c.transfer));
    set("r-received", money(c.received));
    set("r-diff", money(c.diff));

    set("r-sold2", money(c.sold));
    set("r-voucher2", money(c.voucherSum));
    set("r-unused", money(c.unused));

    set("r-final-desk", money(c.received));
    set("r-final-cash", money(c.cashSum));
    set("r-final-presale-booth", money(c.presaleBooth));
    set("r-final-income", money(c.incOther));
    set("r-revenue", money(c.revenue));
    set("r-cost-booth", money(c.costSum));
    set("r-cost-common", money(c.commonSum));
    set("r-cost", money(c.cost));
    set("r-final-total", money(c.final));
    set("sum-revenue", money(c.revenue));
    set("sum-final", money(c.final));

    set("r-refund-all", money(c.cost));
    set("r-refund-paid", money(c.paidCost));
    set("r-refund", money(c.refund));
    var rl = document.getElementById("refund-list");
    rl.innerHTML = c.refundRows.length
      ? c.refundRows.map(function (r) {
          return "<tr><td>" + esc(r.name) + "</td><td>" + money(r.amount) + "</td></tr>";
        }).join("")
      : '<tr><td colspan="2" class="hint">돌려드릴 것이 없습니다. 원가가 모두 재정에서 지급되었거나 아직 입력 전입니다.</td></tr>';

    renderVerdict(c);
    renderUnusedNote(c);
  }

  // 대사 결과는 이 도구가 내놓는 가장 중요한 한 줄이다. 표 안에 묻어두지 않고
  // 결과 탭 맨 위에 크게 세운다.
  function renderVerdict(c) {
    var box = document.getElementById("verdict");
    var value = document.getElementById("verdict-value");
    var note = document.getElementById("verdict-note");
    var blank = c.openTin === 0 && c.closeTin === 0 && c.received === 0;

    if (blank) {
      box.className = "summary-card";
      value.textContent = "입력 전";
      note.textContent = "[1 개장 전]과 [2 마감]을 채우면 결과가 나옵니다.";
    } else if (c.diff === 0) {
      box.className = "summary-card ok";
      value.textContent = "맞습니다";
      note.textContent = "나간 교환권과 받은 돈이 같습니다 (차이 0원).";
    } else {
      box.className = "summary-card warn";
      // 카드 안에서는 금액만 한 줄로 보여 준다. 「차이 -2,725,000원」은 줄이 넘어간다.
      value.textContent = money(c.diff);
      note.textContent = c.diff > 0
        ? "받은 돈이 그만큼 더 많습니다. 저녁 통을 덜 셌거나 금고·계좌이체 금액이 큰지 확인하세요."
        : "나간 교환권이 그만큼 더 많습니다. 조별 지급 수량이 빠졌거나 저녁 통을 더 세지 않았는지 확인하세요.";
    }
  }

  function renderUnusedNote(c) {
    var el = document.getElementById("unused-note");
    if (c.sold <= 0) { el.textContent = ""; el.className = "hint"; return; }
    var pct = (c.unused / c.sold) * 100;
    if (c.unused < 0) {
      el.className = "status warn";
      el.textContent = "음수입니다. 나간 것보다 많이 돌아왔다는 뜻이라 있을 수 없습니다 — 조별 지급 수량이나 계수를 다시 확인하세요.";
    } else {
      el.className = "hint";
      el.textContent = "팔려 나간 교환권의 " + pct.toFixed(1) + "%입니다. 2024년에는 2.5%였습니다. " +
        "손님이 사놓고 쓰지 않은 몫이므로 오류가 아니며, 수익에는 이미 들어가 있습니다.";
    }
  }

  // ---------- 구글 시트 ----------
  var SHEET_URL = (window.ANSWERS_URL || "").trim();
  var msg = document.getElementById("sheet-msg");

  if (!SHEET_URL) {
    msg.textContent = "시트 연결 주소가 설정되지 않았습니다. 저장소의 SETUP-SHEETS.md를 참고하세요.";
    msg.className = "status warn";
    document.getElementById("btn-sheet-send").disabled = true;
    document.getElementById("btn-sheet-load").disabled = true;
  }

  document.getElementById("sheet-pw").value = CBZ.loadText(PW_KEY);

  // Apps Script는 CORS 사전 요청을 받지 못하므로 JSON이라도 text/plain으로 보낸다.
  function post(payload) {
    return fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (body) {
        try {
          return JSON.parse(body);
        } catch (e) {
          var body2 = body.slice(0, 200).replace(/\s+/g, " ");
          if (/<!doctype html|<html/i.test(body2)) {
            if (/accounts\.google\.com|Sign in|로그인/i.test(body2)) {
              throw new Error("구글 로그인 화면이 돌아왔습니다. Apps Script 배포의 「액세스 권한」을 " +
                "「모든 사용자」로 바꿔 주세요 (배포 → 배포 관리 → 수정).");
            }
            throw new Error("시트가 오류 화면을 돌려줬습니다. 스크립트가 시간 안에 끝나지 못했거나 " +
              "실행 중 오류가 났을 수 있습니다. 잠시 뒤 다시 시도하고, 그래도 같으면 Apps Script 편집기의 " +
              "「실행」 기록에서 오류를 확인해 주세요.");
          }
          throw new Error("시트에서 예상과 다른 응답이 왔습니다. 연결 주소가 맞는지 확인해 주세요. 받은 내용: " + body2);
        }
      });
    }, function () {
      throw new Error("시트에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    });
  }

  function setMsg(text, kind) {
    msg.textContent = text;
    msg.className = "status" + (kind ? " " + kind : "");
  }

  // 처음 깨어날 때 20초 넘게 걸리기도 한다. 아무 말이 없으면 멈춘 것처럼 보인다.
  var slow = null;
  function waiting(text) {
    setMsg(text);
    clearTimeout(slow);
    slow = setTimeout(function () {
      setMsg(text + " 처음에는 20초쯤 걸릴 수 있습니다. 그대로 기다려 주세요.");
    }, 6000);
  }
  function done() { clearTimeout(slow); }

  function sheetButtons(disabled) {
    document.getElementById("btn-sheet-send").disabled = disabled;
    document.getElementById("btn-sheet-load").disabled = disabled;
  }

  document.getElementById("btn-sheet-send").addEventListener("click", function () {
    var pw = document.getElementById("sheet-pw").value;
    if (!pw) { setMsg("공유 암호를 먼저 넣어주세요.", "warn"); return; }
    if (!confirm("시트의 「정산」 탭을 지금 내용으로 덮어씁니다. 계속할까요?")) return;

    sheetButtons(true);
    waiting("보내는 중…");
    post({ action: "saveSettlement", password: pw, state: state, summary: compute() })
      .then(function (r) {
        done(); sheetButtons(false);
        if (!r.ok) { setMsg(r.error || "보내지 못했습니다.", "warn"); return; }
        CBZ.saveText(PW_KEY, pw);
        setMsg("시트에 올렸습니다. " + (r.at || ""), "ok");
      })
      .catch(function (err) { done(); sheetButtons(false); setMsg(err.message, "warn"); });
  });

  document.getElementById("btn-sheet-load").addEventListener("click", function () {
    var pw = document.getElementById("sheet-pw").value;
    if (!pw) { setMsg("공유 암호를 먼저 넣어주세요.", "warn"); return; }
    if (!confirm("시트 내용으로 이 화면을 덮어씁니다. 지금 입력한 것은 사라집니다. 계속할까요?")) return;

    sheetButtons(true);
    waiting("불러오는 중…");
    post({ action: "loadSettlement", password: pw })
      .then(function (r) {
        done(); sheetButtons(false);
        if (!r.ok) { setMsg(r.error || "불러오지 못했습니다.", "warn"); return; }
        if (!r.state) { setMsg("시트에 아직 저장된 정산 내용이 없습니다.", "warn"); return; }
        CBZ.saveText(PW_KEY, pw);
        state = normalize(r.state);
        saveState();
        renderAll();
        setMsg("시트에서 불러왔습니다. " + (r.at || ""), "ok");
      })
      .catch(function (err) { done(); sheetButtons(false); setMsg(err.message, "warn"); });
  });

  // ---------- 파일 백업 ----------
  document.getElementById("btn-export").addEventListener("click", function () {
    download(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
      "바자회-정산-" + stamp() + ".json");
  });

  document.getElementById("import-file").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object") throw new Error("형식이 올바르지 않습니다.");
        state = normalize(parsed);
        saveState();
        renderAll();
        alert("불러왔습니다.");
      } catch (err) {
        alert("파일을 불러오지 못했습니다: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("btn-export-csv").addEventListener("click", function () {
    var c = compute();
    var rows = [["조", "받은 잔돈", "제출 교환권", "교환권 매출", "현금 매출", "행사전 구매", "매출 합계", "재료비", "재정 지급"]];
    c.rows.forEach(function (r) {
      rows.push([r.name, r.float, r.final, r.voucher, r.cash, r.presale, r.total, r.cost,
        r.costPaid ? "예" : "아니오"]);
    });
    rows.push([]);
    rows.push(["아침 통", c.openTin]);
    rows.push(["저녁 통", c.closeTin]);
    rows.push(["조별 지급 합계", c.floatSum]);
    rows.push(["교환권으로 판 공통 수입", c.incVoucher]);
    rows.push(["팔려 나간 교환권", c.sold]);
    rows.push(["받은 돈", c.received]);
    rows.push(["차이", c.diff]);
    rows.push(["미사용 교환권", c.unused]);
    rows.push([]);
    c.commonCosts.forEach(function (x) {
      rows.push(["공통 비용 — " + x.name, x.amount, x.paid ? "재정 지급" : "돌려드릴 것"]);
    });
    rows.push([]);
    rows.push(["교환소가 받은 돈", c.received]);
    rows.push(["조별 현금 매출 합계", c.cashSum]);
    rows.push(["조별 행사전 구매 합계", c.presaleBooth]);
    rows.push([]);
    c.commonIncomes.forEach(function (x) {
      rows.push(["공통 수입 — " + x.name, x.amount, x.voucher ? "교환권 판매" : ""]);
    });
    rows.push(["공통 수입 (교환권 외) 합계", c.incOther]);
    rows.push(["매출 합계", c.revenue]);
    rows.push(["조별 재료비 합계", c.costSum]);
    rows.push(["공통 비용 합계", c.commonSum]);
    rows.push(["원가 합계", c.cost]);
    rows.push(["최종 수익금", c.final]);
    rows.push([]);
    rows.push(["재정에서 이미 지급한 원가", c.paidCost]);
    rows.push(["마감 후 돌려드릴 금액", c.refund]);
    c.refundRows.forEach(function (r) { rows.push(["돌려드릴 곳 — " + r.name, r.amount]); });
    var cell = function (v) {
      var t = String(v == null ? "" : v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    var csv = rows.map(function (r) { return r.map(cell).join(","); }).join("\n");
    download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
      "바자회-정산-" + stamp() + ".csv");
  });

  document.getElementById("btn-reset").addEventListener("click", function () {
    if (!confirm("모든 입력을 지울까요? 되돌릴 수 없습니다.")) return;
    if (!confirm("한 번 더 확인합니다. 백업은 받으셨나요? 초기화합니다.")) return;
    state = emptyState();
    saveState();
    renderAll();
  });

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }

  // ---------- 그리기 ----------
  function renderAll() {
    renderItems();
    renderIncomes();
    renderDenomTable("float-body", state.floats);
    renderDenomTable("final-body", state.finals, true);
    renderFloatSum();
    renderTin("open-tin", state.desk.openTin, "open-tin-total");
    renderTin("close-tin", state.desk.closeTin, "close-tin-total");
    renderSingles();
    renderCommon();
    renderReport();
  }

  renderAll();
})();
