// 결산 보고서. 계산은 하지 않고 settle.js 의 compute() 결과를 종이에 옮기기만 한다
// -- 입력 화면과 숫자가 갈라질 자리를 만들지 않기 위함이다.
(function () {
  "use strict";

  var STORAGE_KEY = "cbz_voucher_v1";
  var esc = CBZ.esc;
  var money = SETTLE.money;

  var state = SETTLE.normalize(CBZ.load(STORAGE_KEY, null));
  var c = SETTLE.compute(state);

  // 아무것도 안 들어 있으면 빈 종이를 인쇄하게 두지 않는다.
  var empty = !state.items.length &&
    !c.revenue && !c.cost && !c.openTin && !c.closeTin;
  if (empty) {
    document.getElementById("empty").hidden = false;
    return;
  }
  document.getElementById("doc").hidden = false;

  function set(id, text) { document.getElementById(id).textContent = text; }

  var now = new Date();
  set("made-on", now.getFullYear() + "년 " + (now.getMonth() + 1) + "월 " + now.getDate() + "일");

  // ---------- 1장 ----------
  set("h-revenue", money(c.revenue));
  set("h-cost", money(c.cost));
  set("h-final", money(c.final));

  set("r-received", money(c.received));
  set("r-cash", money(c.cashSum));
  set("r-presale", money(c.presaleBooth));
  set("r-income", money(c.incOther));
  set("r-revenue", money(c.revenue));

  set("r-cost-booth", money(c.costSum));
  set("r-cost-common", money(c.commonSum));
  set("r-cost", money(c.cost));

  set("r-revenue2", money(c.revenue));
  set("r-cost2", money(c.cost));
  set("r-final", money(c.final));

  set("r-sold", money(c.sold));
  set("r-received2", money(c.received));
  set("r-diff", money(c.diff));
  set("r-unused", money(c.unused));

  var verdict = document.getElementById("verdict-line");
  if (c.diff === 0) {
    verdict.textContent = "나간 교환권과 받은 돈이 일치합니다 (차이 0원).";
  } else {
    verdict.textContent = "차이 " + money(c.diff) + "이 남아 있습니다. 확정 전에 원인을 확인해야 합니다.";
    verdict.className = "note warn";
  }

  // ---------- 2장 ----------
  var body = document.getElementById("booth-body");
  body.innerHTML = c.rows.length
    ? c.rows.map(function (r) {
        var names = r.items.map(function (x) { return x.name; }).join(" · ");
        return "<tr><td>" + esc(r.name) + "</td><td>" + esc(names) + "</td><td>" +
          money(r.voucher) + "</td><td>" + money(r.cash) + "</td><td>" +
          money(r.presale) + "</td><td>" + money(r.total) + "</td><td>" +
          money(r.cost) + "</td></tr>";
      }).join("")
    : '<tr><td colspan="7">등록된 조가 없습니다.</td></tr>';

  set("t-voucher", money(c.voucherSum));
  set("t-cash", money(c.cashSum));
  set("t-presale", money(c.presaleBooth));
  set("t-total", money(c.totalSum));
  set("t-cost", money(c.costSum));

  function fill(id, list, cols, emptyText) {
    var el = document.getElementById(id);
    var rows = list.filter(function (x) { return String(x.name).trim() || SETTLE.num(x.amount); });
    el.innerHTML = rows.length
      ? rows.map(function (x) {
          return "<tr><td>" + esc(x.name) + "</td><td>" + money(x.amount) + "</td><td>" +
            cols(x) + "</td></tr>";
        }).join("")
      : '<tr><td colspan="3">' + emptyText + "</td></tr>";
  }

  fill("income-body", c.commonIncomes,
    function (x) { return x.voucher ? "교환권 판매" : "—"; }, "없음");
  fill("cost-body", c.commonCosts,
    function (x) { return x.paid ? "재정 지급" : "돌려드릴 것"; }, "없음");

  // 여러 벌을 한 줄에 놓아 줄 수를 줄인다. 조가 모두 사비 지급이면 열다섯 줄이
  // 넘어가 A4 두 장을 넘기기 때문이다. 많으면 세 벌씩 간다.
  var rb = document.getElementById("refund-body");
  var per = c.refundRows.length > 14 ? 3 : 2;
  var head = "";
  for (var k = 0; k < per; k++) head += "<th>받으실 곳</th><th>금액</th>";
  document.getElementById("refund-head").innerHTML = "<tr>" + head + "</tr>";
  document.getElementById("refund-foot").innerHTML =
    '<tr><th colspan="' + (per * 2 - 1) + '">합계</th><th id="t-refund">0원</th></tr>';

  if (!c.refundRows.length) {
    rb.innerHTML = '<tr><td colspan="' + (per * 2) +
      '">없습니다. 원가가 모두 교회 재정에서 지급되었습니다.</td></tr>';
  } else {
    var cell = function (r) {
      return r ? "<td>" + esc(r.name) + "</td><td>" + money(r.amount) + "</td>" : "<td></td><td></td>";
    };
    var out = "";
    for (var i = 0; i < c.refundRows.length; i += per) {
      out += "<tr>";
      for (var j = 0; j < per; j++) out += cell(c.refundRows[i + j]);
      out += "</tr>";
    }
    rb.innerHTML = out;
  }
  set("t-refund", money(c.refund));

  document.getElementById("btn-print").addEventListener("click", function () {
    window.print();
  });
})();
