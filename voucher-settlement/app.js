(function () {
  "use strict";

  var STORAGE_KEY = "cbz_voucher_v1";
  var DENOMS = [1000, 5000, 10000];

  var state = loadState();

  // One definition of the blank shape, shared by first run, import and reset --
  // three places that drifted apart easily when a field was added.
  function emptyState() {
    return {
      booths: [],
      floats: {},
      finals: {},
      cash: {},
      presale: 0,
      desk: {
        cash: 0,
        transfer: 0,
        issued: { 1000: 0, 5000: 0, 10000: 0 },
        refund: { 1000: 0, 5000: 0, 10000: 0 },
        refundCash: 0
      }
    };
  }

  // A backup taken before cash, refunds and pre-sales existed is still valid;
  // fill in what it lacks rather than refusing it.
  function normalize(parsed) {
    var base = emptyState();
    var out = Object.assign(base, parsed || {});
    out.cash = out.cash || {};
    out.presale = Number(out.presale) || 0;
    out.desk = Object.assign(base.desk, out.desk || {});
    out.desk.issued = Object.assign({ 1000: 0, 5000: 0, 10000: 0 }, out.desk.issued || {});
    out.desk.refund = Object.assign({ 1000: 0, 5000: 0, 10000: 0 }, out.desk.refund || {});
    out.desk.refundCash = Number(out.desk.refundCash) || 0;
    return out;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn("저장된 데이터를 불러오지 못했습니다.", e);
    }
    return emptyState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert("데이터 저장에 실패했습니다: " + e.message);
    }
    renderReport();
  }

  function uid() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function ensureBoothEntry(map, boothId) {
    if (!map[boothId]) {
      map[boothId] = { 1000: 0, 5000: 0, 10000: 0 };
    }
    return map[boothId];
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString("ko-KR") + "원";
  }

  function denomTotal(entry) {
    return DENOMS.reduce(function (sum, d) {
      return sum + (Number(entry && entry[d]) || 0) * d;
    }, 0);
  }

  // ---------- Tabs ----------
  document.getElementById("tabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
  });

  // ---------- Booths ----------
  document.getElementById("booth-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var nameInput = document.getElementById("booth-name");
    var categorySelect = document.getElementById("booth-category");
    var name = nameInput.value.trim();
    if (!name) return;
    state.booths.push({ id: uid(), name: name, category: categorySelect.value });
    nameInput.value = "";
    saveState();
    renderAll();
  });

  function removeBooth(id) {
    if (!confirm("이 부스를 삭제할까요? 관련 입력 데이터도 함께 삭제됩니다.")) return;
    state.booths = state.booths.filter(function (b) { return b.id !== id; });
    delete state.cash[id];
    delete state.floats[id];
    delete state.finals[id];
    saveState();
    renderAll();
  }

  function renderBooths() {
    var tbody = document.getElementById("booth-list");
    tbody.innerHTML = "";
    if (state.booths.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="hint">등록된 부스가 없습니다.</td></tr>';
      return;
    }
    state.booths.forEach(function (b) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(b.name) + "</td>" +
        "<td>" + escapeHtml(b.category) + "</td>" +
        '<td><button class="remove-btn" data-id="' + b.id + '">삭제</button></td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".remove-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { removeBooth(btn.dataset.id); });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- Floats & Finals (shared rendering logic) ----------
  // withCash adds the "현금 매출" column; only the closing table takes one, since
  // a float is vouchers by definition.
  function renderDenomTable(bodyId, dataMap, withCash) {
    var tbody = document.getElementById(bodyId);
    tbody.innerHTML = "";
    if (state.booths.length === 0) {
      tbody.innerHTML = '<tr><td colspan="' + (withCash ? 6 : 5) + '" class="hint">먼저 [부스 관리] 탭에서 부스를 등록하세요.</td></tr>';
      return;
    }
    state.booths.forEach(function (b) {
      var entry = ensureBoothEntry(dataMap, b.id);
      var tr = document.createElement("tr");
      var cells = "<td>" + escapeHtml(b.name) + "</td>";
      DENOMS.forEach(function (d) {
        cells += '<td><input type="number" min="0" step="1" data-booth="' + b.id + '" data-denom="' + d + '" value="' + (entry[d] || 0) + '"></td>';
      });
      cells += '<td class="row-total">' + money(denomTotal(entry)) + "</td>";
      if (withCash) {
        cells += '<td><input type="number" min="0" step="1" data-booth="' + b.id + '" data-cash="1" value="' + (Number(state.cash[b.id]) || 0) + '"></td>';
      }
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
  }

  function wireDenomTable(bodyId, dataMap) {
    var tbody = document.getElementById(bodyId);
    tbody.addEventListener("input", function (e) {
      var input = e.target;
      if (input.tagName !== "INPUT") return;
      var boothId = input.dataset.booth;
      if (input.dataset.cash) {
        state.cash[boothId] = Number(input.value) || 0;
        saveState();
        return;
      }
      var denom = input.dataset.denom;
      var entry = ensureBoothEntry(dataMap, boothId);
      entry[denom] = Number(input.value) || 0;
      var row = input.closest("tr");
      row.querySelector(".row-total").textContent = money(denomTotal(entry));
      saveState();
    });
  }

  function renderFloats() { renderDenomTable("float-body", state.floats); }
  function renderFinals() { renderDenomTable("final-body", state.finals, true); }

  wireDenomTable("float-body", state.floats);
  wireDenomTable("final-body", state.finals);

  document.getElementById("presale").addEventListener("input", function (e) {
    state.presale = Number(e.target.value) || 0;
    saveState();
  });

  // ---------- Voucher desk ----------
  function renderDesk() {
    document.getElementById("desk-cash").value = state.desk.cash || 0;
    document.getElementById("desk-transfer").value = state.desk.transfer || 0;
    DENOMS.forEach(function (d) {
      document.getElementById("desk-issued-" + d).value = state.desk.issued[d] || 0;
      document.getElementById("desk-refund-" + d).value = state.desk.refund[d] || 0;
    });
    document.getElementById("desk-refund-cash").value = state.desk.refundCash || 0;
    document.getElementById("presale").value = state.presale || 0;
  }

  document.getElementById("desk-cash").addEventListener("input", function (e) {
    state.desk.cash = Number(e.target.value) || 0;
    saveState();
  });
  document.getElementById("desk-transfer").addEventListener("input", function (e) {
    state.desk.transfer = Number(e.target.value) || 0;
    saveState();
  });
  DENOMS.forEach(function (d) {
    document.getElementById("desk-issued-" + d).addEventListener("input", function (e) {
      state.desk.issued[d] = Number(e.target.value) || 0;
      saveState();
    });
    document.getElementById("desk-refund-" + d).addEventListener("input", function (e) {
      state.desk.refund[d] = Number(e.target.value) || 0;
      saveState();
    });
  });
  document.getElementById("desk-refund-cash").addEventListener("input", function (e) {
    state.desk.refundCash = Number(e.target.value) || 0;
    saveState();
  });

  // ---------- Report ----------
  function renderReport() {
    var boothBody = document.getElementById("report-booth-body");
    if (!boothBody) return; // called before DOM ready guard
    boothBody.innerHTML = "";

    var boothRevenueSum = 0;
    var boothCashSum = 0;
    var floatSum = 0;

    if (state.booths.length === 0) {
      boothBody.innerHTML = '<tr><td colspan="6" class="hint">등록된 부스가 없습니다.</td></tr>';
    } else {
      state.booths.forEach(function (b) {
        var floatEntry = state.floats[b.id];
        var finalEntry = state.finals[b.id];
        var floatVal = denomTotal(floatEntry);
        var finalVal = denomTotal(finalEntry);
        var revenue = finalVal - floatVal;
        var cashVal = Number(state.cash[b.id]) || 0;
        boothRevenueSum += revenue;
        boothCashSum += cashVal;
        floatSum += floatVal;
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + escapeHtml(b.name) + "</td>" +
          "<td>" + money(floatVal) + "</td>" +
          "<td>" + money(finalVal) + "</td>" +
          "<td>" + money(revenue) + "</td>" +
          "<td>" + money(cashVal) + "</td>" +
          "<td>" + money(revenue + cashVal) + "</td>";
        boothBody.appendChild(tr);
      });
    }

    document.getElementById("report-booth-total").textContent = boothRevenueSum.toLocaleString("ko-KR");
    document.getElementById("report-booth-cash-total").textContent = boothCashSum.toLocaleString("ko-KR");

    var issuedVal = denomTotal(state.desk.issued);
    var refundVal = denomTotal(state.desk.refund);
    var refundCash = Number(state.desk.refundCash) || 0;

    // A refund pulls a voucher back and pushes a banknote out, so it comes off
    // both sides at once. Leave it out of either and the two stop matching.
    var expectedSold = issuedVal - floatSum - refundVal;
    var actualDesk = (Number(state.desk.cash) || 0) + (Number(state.desk.transfer) || 0) - refundCash;
    var deskDiff = actualDesk - expectedSold;

    document.getElementById("report-desk-issued").textContent = money(issuedVal);
    document.getElementById("report-desk-float").textContent = money(floatSum);
    document.getElementById("report-desk-refund").textContent = money(refundVal);
    document.getElementById("report-desk-expected").textContent = money(expectedSold);
    document.getElementById("report-desk-actual").textContent = money(actualDesk);
    document.getElementById("report-desk-diff").textContent = money(deskDiff);

    // Vouchers handed back and cash paid out for them should be the same amount.
    var refundNote = document.getElementById("refund-status");
    if (refundNote) {
      if (refundVal === 0 && refundCash === 0) {
        refundNote.textContent = "재환전 내역이 없습니다.";
        refundNote.className = "hint";
      } else if (refundVal === refundCash) {
        refundNote.textContent = "돌려받은 교환권 " + money(refundVal) + "과 내어준 현금이 일치합니다.";
        refundNote.className = "status ok";
      } else {
        refundNote.textContent = "돌려받은 교환권 " + money(refundVal) + "과 내어준 현금 " + money(refundCash) +
          "이 다릅니다. 둘 중 하나가 잘못 적혔을 수 있습니다.";
        refundNote.className = "status warn";
      }
    }

    var deskStatus = document.getElementById("report-desk-status");
    if (deskDiff === 0) {
      deskStatus.textContent = "일치합니다.";
      deskStatus.className = "status ok";
    } else {
      deskStatus.textContent = "차이가 있습니다. 발행 수량 입력과 현금/계좌이체 집계를 다시 확인하세요.";
      deskStatus.className = "status warn";
    }

    document.getElementById("report-summary-booth").textContent = money(boothRevenueSum);
    document.getElementById("report-summary-desk").textContent = money(actualDesk);
    document.getElementById("report-summary-diff").textContent = money(actualDesk - boothRevenueSum);

    var presale = Number(state.presale) || 0;
    document.getElementById("report-final-desk").textContent = money(actualDesk);
    document.getElementById("report-final-cash").textContent = money(boothCashSum);
    document.getElementById("report-final-presale").textContent = money(presale);
    document.getElementById("report-final-total").textContent = money(actualDesk + boothCashSum + presale);
  }

  // ---------- Data management ----------
  document.getElementById("btn-export").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    downloadBlob(blob, "bazaar-voucher-backup-" + todayStamp() + ".json");
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
        alert("불러오기가 완료되었습니다.");
      } catch (err) {
        alert("파일을 불러오지 못했습니다: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("btn-export-csv").addEventListener("click", function () {
    var rows = [["부스", "초기 지급액", "제출 보유액", "교환권 매출", "현금 매출", "매출 합계"]];
    var cashSum = 0;
    state.booths.forEach(function (b) {
      var floatVal = denomTotal(state.floats[b.id]);
      var finalVal = denomTotal(state.finals[b.id]);
      var cashVal = Number(state.cash[b.id]) || 0;
      cashSum += cashVal;
      rows.push([b.name, floatVal, finalVal, finalVal - floatVal, cashVal, finalVal - floatVal + cashVal]);
    });
    var deskNet = (Number(state.desk.cash) || 0) + (Number(state.desk.transfer) || 0) - (Number(state.desk.refundCash) || 0);
    var presaleVal = Number(state.presale) || 0;
    rows.push([]);
    rows.push(["교환권 부스 순 수령액", deskNet]);
    rows.push(["부스 현금 매출 합계", cashSum]);
    rows.push(["사전 구매 매출", presaleVal]);
    rows.push(["최종 수익금", deskNet + cashSum + presaleVal]);
    var csv = rows.map(function (r) { return r.join(","); }).join("\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "bazaar-voucher-report-" + todayStamp() + ".csv");
  });

  document.getElementById("btn-reset").addEventListener("click", function () {
    if (!confirm("정말 모든 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    if (!confirm("한 번 더 확인합니다. 먼저 백업(JSON 내보내기)을 받으셨나요? 초기화를 진행합니다.")) return;
    state = emptyState();
    saveState();
    renderAll();
  });

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function todayStamp() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function renderAll() {
    renderBooths();
    renderFloats();
    renderFinals();
    renderDesk();
    renderReport();
  }

  renderAll();
})();
