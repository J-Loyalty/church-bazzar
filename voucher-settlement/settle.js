// 정산 계산. **여기 한 곳에만 둔다** -- 입력 화면(app.js)과 결산 보고(report.js)가
// 같은 숫자를 내야 하고, 구글 시트의 계산 시트도 이 식을 옮겨 적은 것이다.
// 화면 그리기는 여기 넣지 않는다.
(function (global) {
  "use strict";

  var DENOMS = [1000, 5000, 10000];

  // ---------- 상태 ----------
  // 교환소는 아침과 저녁에 통과 금고를 한 번씩 센다. 그 차이가 하루치이므로
  // 재환전은 따로 적지 않는다 -- 교환권이 통으로 돌아오고 현금이 금고에서
  // 나가므로 양쪽에서 저절로 상쇄된다.
  // 줄은 품목 단위(조 + 항목 + 단가)이고, 돈은 조 단위다. 4조처럼 한 조가 세 품목을
  // 맡아도 교환권함은 조마다 하나이므로, 조별 값은 그 조의 첫 줄에서만 받는다.
  function emptyState() {
    return {
      items: [],    // [{id, team, name, price}] -- 한 줄이 한 품목
      floats: {},   // 조별 아침 지급 (권종별 장수). 열쇠는 조 이름
      finals: {},   // 조별 마감 제출 (권종별 장수)
      cash: {},     // 조별 현금 매출
      costs: {},    // 조별 재료원가 (그 조가 쓴 재료비 총액)
      costPaid: {}, // 그 재료원가를 교회 재정에서 이미 냈는가
      commonCosts: [],  // 조에 붙지 않는 지출 [{name, amount, paid}]
      presales: {},      // 조별 행사전 구매 매출
      // 조에 붙지 않는 수입. voucher 를 켜면 「교환권을 팔고 받은 돈」이라
      // 대사 양쪽에도 함께 더해진다 (목장쿠폰·선판매쿠폰·전도용 교환권).
      commonIncomes: [
        { name: "목장쿠폰", amount: 0, voucher: true },
        { name: "선판매쿠폰", amount: 0, voucher: true },
        { name: "헌옷 수거 매출", amount: 0, voucher: false },
        { name: "기타", amount: 0, voucher: false }
      ],
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

    if (Array.isArray(p.items)) {
      out.items = p.items.map(function (it) {
        return {
          id: it && it.id || uid(),
          team: String(it && it.team || ""),
          name: String(it && it.name || ""),
          price: num(it && it.price)
        };
      });
      out.floats = p.floats || {};
      out.finals = p.finals || {};
      out.cash = p.cash || {};
      out.costs = p.costs || {};
      out.costPaid = p.costPaid || {};
      out.presales = p.presales || {};
    } else {
      // 예전 백업: 줄이 조 하나였고 모든 값이 조의 id 를 열쇠로 쓰였다.
      // 조 이름을 그대로 열쇠로 옮기면 숫자가 그대로 따라온다.
      var booths = Array.isArray(p.booths) ? p.booths : [];
      var move = function (src) {
        var o = {};
        booths.forEach(function (b) {
          if (src && src[b.id] !== undefined) o[String(b.name)] = src[b.id];
        });
        return o;
      };
      out.items = booths.map(function (b) {
        return { id: b.id || uid(), team: String(b.name || ""), name: "", price: 0 };
      });
      out.floats = move(p.floats);
      out.finals = move(p.finals);
      out.cash = move(p.cash);
      out.costs = move(p.costs);
      out.costPaid = move(p.costPaid);
      out.presales = move(p.presales);
    }
    out.commonCosts = Array.isArray(p.commonCosts)
      ? p.commonCosts.map(function (c) {
          return { name: String(c && c.name || ""), amount: num(c && c.amount), paid: !!(c && c.paid) };
        })
      : [];
    // 예전 백업에는 한 칸짜리였다. 목록으로 옮겨 담으면 금액이 그대로 따라온다.
    if (Array.isArray(p.commonIncomes)) {
      out.commonIncomes = p.commonIncomes.map(function (c) {
        return {
          name: String(c && c.name || ""),
          amount: num(c && c.amount),
          voucher: !!(c && c.voucher)
        };
      });
    } else {
      var moved = [];
      if (num(p.presaleVoucher)) {
        moved.push({ name: "행사 전에 판 교환권", amount: num(p.presaleVoucher), voucher: true });
      }
      if (num(p.presale)) {
        moved.push({ name: "조 구분 없는 행사전 구매", amount: num(p.presale), voucher: false });
      }
      if (moved.length) out.commonIncomes = moved;
    }

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

  function uid() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function money(n) { return num(n).toLocaleString("ko-KR") + "원"; }

  function denomTotal(entry) {
    return DENOMS.reduce(function (sum, d) { return sum + num(entry && entry[d]) * d; }, 0);
  }

  // 줄에 적힌 조 이름에서 조 목록을 뽑는다. 같은 조가 여러 줄이면 한 번만.
  function teams(state) {
    var seen = {}, out = [];
    state.items.forEach(function (it) {
      var t = String(it.team || "").trim();
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    });
    return out;
  }

  function itemsOf(state, team) {
    return state.items.filter(function (it) {
      return String(it.team || "").trim() === team && String(it.name || "").trim();
    });
  }

  // ---------- 계산 ----------
  // 화면 그리기와 떼어 두면 값이 어디서 나온 것인지 한눈에 보이고,
  // 시트로 보낼 때도 같은 함수를 쓸 수 있다.
  function compute(state) {
    var rows = teams(state).map(function (t) {
      var floatVal = denomTotal(state.floats[t]);
      var finalVal = denomTotal(state.finals[t]);
      var cashVal = num(state.cash[t]);
      var costVal = num(state.costs[t]);
      var preVal = num(state.presales[t]);
      return {
        id: t, name: t,
        items: itemsOf(state, t).map(function (it) {
          return { name: String(it.name).trim(), price: num(it.price) };
        }),
        float: floatVal, final: finalVal,
        voucher: finalVal - floatVal,
        cash: cashVal,
        presale: preVal,
        total: finalVal - floatVal + cashVal + preVal,
        cost: costVal,
        costPaid: !!state.costPaid[t]
      };
    });

    var sum = function (k) { return rows.reduce(function (a, r) { return a + r[k]; }, 0); };
    var openTin = denomTotal(state.desk.openTin);
    var closeTin = denomTotal(state.desk.closeTin);
    var floatSum = sum("float");
    // 교환권을 팔고 받은 몫은 교환권도 대금도 아침 계수 전에 이미 오갔으므로
    // 대사 양쪽에 똑같이 더한다. 나머지 공통 수입은 매출에만 더한다.
    var incomes = state.commonIncomes;
    var incVoucher = incomes.reduce(function (a, c) { return a + (c.voucher ? num(c.amount) : 0); }, 0);
    var incOther = incomes.reduce(function (a, c) { return a + (c.voucher ? 0 : num(c.amount)); }, 0);

    var sold = openTin - closeTin - floatSum + incVoucher;
    var cashDelta = num(state.desk.closeCash) - num(state.desk.openCash);
    var received = cashDelta + num(state.desk.transfer) + incVoucher;
    // 행사전 구매는 2024년 결산서처럼 조별로 잡는다.
    var commonSum = state.commonCosts.reduce(function (a, c) { return a + num(c.amount); }, 0);
    var revenue = received + sum("cash") + sum("presale") + incOther;
    var cost = sum("cost") + commonSum;

    // 원가에는 교회 재정이 이미 낸 몫과 누군가 사비로 먼저 낸 몫이 섞여 있다.
    // 수익 계산에는 둘 다 들어가지만, 뒤의 것은 마감 후 돌려드려야 한다.
    var refundRows = [];
    rows.forEach(function (r) {
      if (r.cost > 0 && !r.costPaid) refundRows.push({ name: r.name, amount: r.cost });
    });
    state.commonCosts.forEach(function (c) {
      if (num(c.amount) > 0 && !c.paid) {
        refundRows.push({ name: String(c.name).trim() || "(이름 없는 공통 비용)", amount: num(c.amount) });
      }
    });
    var refund = refundRows.reduce(function (a, r) { return a + r.amount; }, 0);

    return {
      rows: rows,
      floatSum: floatSum, finalSum: sum("final"),
      voucherSum: sum("voucher"), cashSum: sum("cash"), totalSum: sum("total"),
      presaleBooth: sum("presale"),
      commonIncomes: incomes.slice(), incVoucher: incVoucher, incOther: incOther,
      costSum: sum("cost"), commonCosts: state.commonCosts.slice(), commonSum: commonSum,
      openTin: openTin, closeTin: closeTin, sold: sold,
      cashDelta: cashDelta, transfer: num(state.desk.transfer), received: received,
      diff: received - sold,
      unused: sold - sum("voucher"),
      presale: sum("presale"), presaleVoucher: incVoucher,
      revenue: revenue, cost: cost,
      refundRows: refundRows, refund: refund, paidCost: cost - refund,
      final: revenue - cost
    };
  }

  global.SETTLE = {
    DENOMS: DENOMS,
    emptyState: emptyState,
    normalize: normalize,
    num: num,
    uid: uid,
    money: money,
    denomEntry: denomEntry,
    denomTotal: denomTotal,
    teams: teams,
    itemsOf: itemsOf,
    compute: compute
  };
})(window);
