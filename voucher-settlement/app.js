(function () {
  "use strict";

  var STORAGE_KEY = "cbz_voucher_v1";
  var PW_KEY = "cbz_settle_pw";
  var DENOMS = [1000, 5000, 10000];

  // ---------- 상태 ----------
  // 교환소는 아침과 저녁에 통과 금고를 한 번씩 센다. 그 차이가 하루치이므로
  // 재환전은 따로 적지 않는다 -- 교환권이 통으로 돌아오고 현금이 금고에서
  // 나가므로 양쪽에서 저절로 상쇄된다.
  function emptyState() {
    return {
      booths: [],
      floats: {},   // 조별 아침 지급 (권종별 장수)
      finals: {},   // 조별 마감 제출 (권종별 장수)
      cash: {},     // 조별 현금 매출
      presale: 0,
      desk: {
        openTin: { 1000: 0, 5000: 0, 10000: 0 },
        closeTin: { 1000: 0, 5000: 0, 10000: 0 },
        openCash: 0,
        closeCash: 0,
        transfer: 0
      }
    };
  }

  // 예전 백업도 그대로 열려야 한다. 옛 구조는 「발행 수량」과 「현금 판매액」을
  // 이미 차감된 값으로 담고 있었으므로, 아침을 0으로 두고 그 값을 저녁 쪽에
  // 옮기면 계산 결과가 같아진다.
  function normalize(parsed) {
    var out = emptyState();
    var p = parsed || {};
    out.booths = Array.isArray(p.booths) ? p.booths : [];
    out.floats = p.floats || {};
    out.finals = p.finals || {};
    out.cash = p.cash || {};
    out.presale = num(p.presale);

    var d = p.desk || {};
    if (d.openTin || d.closeTin) {
      out.desk.openTin = denomEntry(d.openTin);
      out.desk.closeTin = denomEntry(d.closeTin);
      out.desk.openCash = num(d.openCash);
      out.desk.closeCash = num(d.closeCash);
    } else {
      // 옛 구조 (issued / cash / refund)
      out.desk.openTin = denomEntry(d.issued);
      out.desk.closeTin = denomEntry(null);
      out.desk.openCash = 0;
      out.desk.closeCash = num(d.cash) - num(d.refundCash);
    }
    out.desk.transfer = num(d.transfer);
    return out;
  }

  function num(v) { return Number(v) || 0; }

  function denomEntry(src) {
    var out = { 1000: 0, 5000: 0, 10000: 0 };
    DENOMS.forEach(function (d) { out[d] = num(src && src[d]); });
    return out;
  }

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

  function uid() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function money(n) { return num(n).toLocaleString("ko-KR") + "원"; }

  function denomTotal(entry) {
    return DENOMS.reduce(function (sum, d) { return sum + num(entry && entry[d]) * d; }, 0);
  }

  function ensure(map, id) {
    if (!map[id]) map[id] = { 1000: 0, 5000: 0, 10000: 0 };
    return map[id];
  }

  // ---------- 계산 ----------
  // 화면 그리기와 떼어 두면 값이 어디서 나온 것인지 한눈에 보이고,
  // 시트로 보낼 때도 같은 함수를 쓸 수 있다.
  function compute() {
    var rows = state.booths.map(function (b) {
      var floatVal = denomTotal(state.floats[b.id]);
      var finalVal = denomTotal(state.finals[b.id]);
      var cashVal = num(state.cash[b.id]);
      return {
        id: b.id, name: b.name,
        float: floatVal, final: finalVal,
        voucher: finalVal - floatVal,
        cash: cashVal,
        total: finalVal - floatVal + cashVal
      };
    });

    var sum = function (k) { return rows.reduce(function (a, r) { return a + r[k]; }, 0); };
    var openTin = denomTotal(state.desk.openTin);
    var closeTin = denomTotal(state.desk.closeTin);
    var floatSum = sum("float");
    var sold = openTin - closeTin - floatSum;
    var cashDelta = num(state.desk.closeCash) - num(state.desk.openCash);
    var received = cashDelta + num(state.desk.transfer);
    var presale = num(state.presale);

    return {
      rows: rows,
      floatSum: floatSum, finalSum: sum("final"),
      voucherSum: sum("voucher"), cashSum: sum("cash"), totalSum: sum("total"),
      openTin: openTin, closeTin: closeTin, sold: sold,
      cashDelta: cashDelta, transfer: num(state.desk.transfer), received: received,
      diff: received - sold,
      unused: sold - sum("voucher"),
      presale: presale,
      final: received + sum("cash") + presale
    };
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

  // ---------- 조 ----------
  document.getElementById("booth-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = document.getElementById("booth-name");
    var name = input.value.trim();
    if (!name) return;
    state.booths.push({ id: uid(), name: name });
    input.value = "";
    saveState();
    renderAll();
    input.focus();
  });

  function removeBooth(id) {
    var b = state.booths.filter(function (x) { return x.id === id; })[0];
    if (!confirm("「" + (b ? b.name : "") + "」을 지울까요? 그 조에 적은 숫자도 함께 지워집니다.")) return;
    state.booths = state.booths.filter(function (x) { return x.id !== id; });
    delete state.cash[id];
    delete state.floats[id];
    delete state.finals[id];
    saveState();
    renderAll();
  }

  function renderBooths() {
    var tbody = document.getElementById("booth-list");
    if (!state.booths.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="hint">아직 등록된 조가 없습니다. 위에 조 이름을 적고 「조 추가」를 누르세요.</td></tr>';
      return;
    }
    tbody.innerHTML = state.booths.map(function (b) {
      return "<tr><td>" + esc(b.name) + '</td><td class="col-btn">' +
        '<button class="remove-btn" data-id="' + b.id + '">지우기</button></td></tr>';
    }).join("");
    tbody.querySelectorAll(".remove-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { removeBooth(btn.dataset.id); });
    });
  }

  // ---------- 조별 권종 표 ----------
  function renderDenomTable(bodyId, map, withCash) {
    var tbody = document.getElementById(bodyId);
    if (!state.booths.length) {
      tbody.innerHTML = '<tr><td colspan="' + (withCash ? 6 : 5) +
        '" class="hint">먼저 [1 개장 전]에서 조를 등록하세요.</td></tr>';
      return;
    }
    tbody.innerHTML = state.booths.map(function (b) {
      var entry = ensure(map, b.id);
      var cells = "<td>" + esc(b.name) + "</td>";
      DENOMS.forEach(function (d) {
        cells += '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' +
          esc(b.name) + " " + d.toLocaleString("ko-KR") + '원 장수" data-booth="' + b.id +
          '" data-denom="' + d + '" value="' + (entry[d] || 0) + '"></td>';
      });
      cells += '<td class="row-total">' + money(denomTotal(entry)) + "</td>";
      if (withCash) {
        cells += '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' +
          esc(b.name) + ' 현금 매출" data-booth="' + b.id + '" data-cash="1" value="' +
          num(state.cash[b.id]) + '"></td>';
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
    var sum = state.booths.reduce(function (a, b) { return a + denomTotal(state.floats[b.id]); }, 0);
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
    ["transfer", function (v) { state.desk.transfer = v; }, function () { return state.desk.transfer; }],
    ["presale", function (v) { state.presale = v; }, function () { return state.presale; }]
  ].forEach(function (f) {
    var el = document.getElementById(f[0]);
    el.addEventListener("input", function () { f[1](num(el.value)); saveState(); });
    el.dataset.get = f[0];
  });

  function renderSingles() {
    document.getElementById("open-cash").value = state.desk.openCash;
    document.getElementById("close-cash").value = state.desk.closeCash;
    document.getElementById("transfer").value = state.desk.transfer;
    document.getElementById("presale").value = state.presale;
  }

  // ---------- 결과 ----------
  function renderReport() {
    var c = compute();
    var set = function (id, v) { document.getElementById(id).textContent = v; };

    var body = document.getElementById("report-booth-body");
    body.innerHTML = c.rows.length
      ? c.rows.map(function (r) {
          return "<tr><td>" + esc(r.name) + "</td><td>" + money(r.float) + "</td><td>" +
            money(r.final) + "</td><td>" + money(r.voucher) + "</td><td>" +
            money(r.cash) + "</td><td>" + money(r.total) + "</td></tr>";
        }).join("")
      : '<tr><td colspan="6" class="hint">등록된 조가 없습니다.</td></tr>';

    set("rb-float", money(c.floatSum));
    set("rb-final", money(c.finalSum));
    set("rb-voucher", money(c.voucherSum));
    set("rb-cash", money(c.cashSum));
    set("rb-total", money(c.totalSum));

    set("r-open-tin", money(c.openTin));
    set("r-close-tin", money(c.closeTin));
    set("r-float", money(c.floatSum));
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
    set("r-final-presale", money(c.presale));
    set("r-final-total", money(c.final));

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
      box.className = "verdict";
      value.textContent = "아직 입력 전입니다";
      note.textContent = "[1 개장 전]과 [2 마감]을 채우면 여기에 결과가 나옵니다.";
    } else if (c.diff === 0) {
      box.className = "verdict ok";
      value.textContent = "맞습니다 — 차이 0원";
      note.textContent = "나간 교환권과 받은 돈이 같습니다.";
    } else {
      box.className = "verdict warn";
      value.textContent = "차이 " + money(c.diff);
      note.textContent = c.diff > 0
        ? "받은 돈이 더 많습니다. 저녁 통을 덜 셌거나 금고·계좌이체 금액이 큰지 확인하세요."
        : "나간 교환권이 더 많습니다. 조별 지급 수량이 빠졌거나 저녁 통을 더 세지 않았는지 확인하세요.";
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
          throw new Error("시트에서 예상과 다른 응답이 왔습니다. 연결 주소가 맞는지 확인해 주세요.");
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
    var rows = [["조", "받은 잔돈", "제출 교환권", "교환권 매출", "현금 매출", "매출 합계"]];
    c.rows.forEach(function (r) { rows.push([r.name, r.float, r.final, r.voucher, r.cash, r.total]); });
    rows.push([]);
    rows.push(["아침 통", c.openTin]);
    rows.push(["저녁 통", c.closeTin]);
    rows.push(["조별 지급 합계", c.floatSum]);
    rows.push(["팔려 나간 교환권", c.sold]);
    rows.push(["받은 돈", c.received]);
    rows.push(["차이", c.diff]);
    rows.push(["미사용 교환권", c.unused]);
    rows.push([]);
    rows.push(["교환소가 받은 돈", c.received]);
    rows.push(["조별 현금 매출 합계", c.cashSum]);
    rows.push(["행사전 구매 매출", c.presale]);
    rows.push(["최종 수익금", c.final]);
    var csv = rows.map(function (r) { return r.join(","); }).join("\n");
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
    renderBooths();
    renderDenomTable("float-body", state.floats);
    renderDenomTable("final-body", state.finals, true);
    renderFloatSum();
    renderTin("open-tin", state.desk.openTin, "open-tin-total");
    renderTin("close-tin", state.desk.closeTin, "close-tin-total");
    renderSingles();
    renderReport();
  }

  renderAll();
})();
