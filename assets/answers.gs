/**
 * 바자회 준비 — 답변 수집 + 정산 저장 (Google Apps Script)
 *
 * 이 파일은 저장소에 보관만 하는 사본입니다. 실제로는 이 내용을 구글 시트의
 * Apps Script 편집기에 붙여넣고 웹 앱으로 배포해야 동작합니다.
 * 설정 순서는 저장소 루트의 SETUP-SHEETS.md 참고.
 *
 * 배포 주소는 공개 사이트 코드에 들어가므로 누구나 알 수 있습니다. 그래서 저장과
 * 조회 모두 아래 PASSWORD 를 확인합니다. 암호는 이 스크립트 안에만 있고 사이트
 * 코드에는 들어가지 않습니다.
 */

// 아래 한 줄만 바꿔서 쓰세요.
var PASSWORD = '여기에-공유-암호를-적으세요';

var SHEET_NAME = '답변';        // 봉사자 답변이 쌓이는 탭
var SETTLE_SHEET = '정산';      // 정산 결과를 사람이 읽을 수 있게 적는 탭
var SETTLE_CALC = '정산_계산';  // 시트 함수로 살아 있는 계산기 탭
var SETTLE_RAW = '정산_원본';   // 다시 불러오기 위한 원본(JSON) 탭

/**
 * 사이트에서 보내는 요청은 모두 POST 입니다. 본문의 action 으로 갈립니다.
 *  - save           : 답변 한 건을 시트에 추가
 *  - list           : 지금까지 쌓인 답변 전체를 돌려줌
 *  - saveSettlement : 정산 도구의 현재 내용을 「정산」 탭에 덮어씀
 *  - loadSettlement : 「정산_원본」 탭에 있는 내용을 돌려줌
 *
 * 브라우저가 사전 요청(preflight)을 보내면 Apps Script 가 받지 못하므로, 사이트
 * 쪽에서는 Content-Type 을 text/plain 으로 보냅니다. 본문은 그래도 JSON 입니다.
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.password !== PASSWORD) {
      return json({ ok: false, error: '암호가 맞지 않습니다.' });
    }

    if (body.action === 'list') {
      return json({ ok: true, rows: readRows() });
    }

    if (body.action === 'save') {
      var name = String(body.name || '').trim();
      var doc = String(body.doc || '').trim();
      var item = String(body.item || '').trim();
      var answer = String(body.answer || '').trim();

      if (!name || !item || !answer) {
        return json({ ok: false, error: '이름, 항목, 내용을 모두 적어주세요.' });
      }

      sheet().appendRow([new Date(), name, doc, item, answer]);
      return json({ ok: true, rows: readRows() });
    }

    if (body.action === 'saveSettlement') {
      return json(saveSettlement(body));
    }

    if (body.action === 'loadSettlement') {
      return json(loadSettlement());
    }

    return json({ ok: false, error: '알 수 없는 요청입니다: ' + body.action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** 주소를 브라우저에서 그냥 열었을 때 빈 화면 대신 보여줄 안내. */
function doGet() {
  return ContentService
    .createTextOutput('바자회 준비 — 항목별 답변 수집용 주소입니다. 입력은 준비 사이트에서 해주세요.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['보낸 시각', '이름', '문서', '항목', '내용']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows() {
  var values = sheet().getDataRange().getValues();
  values.shift(); // 머리글
  return values.map(function (r) {
    return {
      at: r[0] ? Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : '',
      name: r[1],
      doc: r[2],
      item: r[3],
      answer: r[4]
    };
  }).reverse(); // 최근 것이 위로
}

/* ---------------- 정산 ----------------
 *
 * 두 탭에 나눠 적습니다.
 *  - 「정산」     : 사람이 읽는 표. 조별 매출과 대사 결과가 보입니다.
 *  - 「정산_원본」: 다시 불러오기 위한 JSON 한 칸. 사람이 볼 것은 아닙니다.
 *
 * 보낼 때마다 두 탭을 통째로 덮어씁니다. 정산은 한 사람이 한 자리에서 하는
 * 일이라 이력을 쌓기보다 「지금 내용과 시트가 같다」가 중요합니다.
 */
function saveSettlement(body) {
  var st = body.state;
  var s = body.summary;
  if (!st || !s) return { ok: false, error: '보낼 내용이 비어 있습니다.' };

  var at = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  // --- 읽는 표 ---
  var sh = resetSheet(SETTLE_SHEET);
  var rows = [];
  rows.push(['2026 바자회 정산', '', '', '', '', '']);
  rows.push(['올린 시각', at, '', '', '', '']);
  rows.push([]);
  rows.push(['조', '받은 잔돈', '제출 교환권', '교환권 매출', '현금 매출', '매출 합계', '재료비', '재정 지급']);
  (s.rows || []).forEach(function (r) {
    rows.push([r.name, r.float, r.final, r.voucher, r.cash, r.total, r.cost,
      r.cost > 0 ? (r.costPaid ? '재정 지급' : '돌려드릴 것') : '']);
  });
  rows.push(['합계', s.floatSum, s.finalSum, s.voucherSum, s.cashSum, s.totalSum, s.costSum, '']);
  rows.push([]);
  rows.push(['교환소 대사', '', '', '', '', '']);
  rows.push(['아침 통', s.openTin]);
  rows.push(['저녁 통', s.closeTin]);
  rows.push(['조별 지급 합계', s.floatSum]);
  rows.push(['행사 전에 판 교환권', s.presaleVoucher]);
  rows.push(['팔려 나간 교환권', s.sold]);
  rows.push(['저녁 금고 − 아침 금고', s.cashDelta]);
  rows.push(['계좌이체', s.transfer]);
  rows.push(['행사 전에 판 교환권 대금', s.presaleVoucher]);
  rows.push(['받은 돈', s.received]);
  rows.push(['차이 (0이어야 함)', s.diff]);
  rows.push(['미사용 교환권', s.unused]);
  rows.push([]);
  rows.push(['공통 비용', '', '', '', '', '']);
  (s.commonCosts || []).forEach(function (x) {
    rows.push([x.name, x.amount, x.paid ? '재정 지급' : '돌려드릴 것']);
  });
  rows.push(['공통 비용 합계', s.commonSum]);
  rows.push([]);
  rows.push(['최종 수익금', '', '', '', '', '']);
  rows.push(['교환소가 받은 돈', s.received]);
  rows.push(['조별 현금 매출 합계', s.cashSum]);
  rows.push(['행사전 구매 매출', s.presale]);
  rows.push(['매출 합계', s.revenue]);
  rows.push(['조별 재료비 합계', s.costSum]);
  rows.push(['공통 비용 합계', s.commonSum]);
  rows.push(['원가 합계', s.cost]);
  rows.push(['최종 수익금 (매출 − 원가)', s.final]);
  rows.push([]);
  rows.push(['마감 후 돌려드릴 돈', '', '', '', '', '']);
  rows.push(['재정에서 이미 지급한 원가', s.paidCost]);
  rows.push(['돌려드릴 금액', s.refund]);
  (s.refundRows || []).forEach(function (r) { rows.push([r.name, r.amount]); });

  var width = 8;
  var padded = rows.map(function (r) {
    var out = r.slice();
    while (out.length < width) out.push('');
    return out;
  });
  sh.getRange(1, 1, padded.length, width).setValues(padded);
  sh.getRange(1, 1, 1, width).setFontWeight('bold');
  sh.getRange(4, 1, 1, width).setFontWeight('bold');
  sh.getRange(1, 1, padded.length, 1).setNumberFormat('@');
  sh.setFrozenRows(1);

  // --- 다시 불러올 원본 ---
  var raw = resetSheet(SETTLE_RAW);
  raw.getRange(1, 1, 2, 2).setValues([
    ['올린 시각', at],
    ['원본', JSON.stringify(st)]
  ]);

  // --- 시트 함수로 살아 있는 계산기 ---
  buildCalcSheet(st, at);

  return { ok: true, at: at };
}

function loadSettlement() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var raw = ss.getSheetByName(SETTLE_RAW);
  if (!raw) return { ok: true, state: null };
  var at = raw.getRange(1, 2).getValue();
  var text = raw.getRange(2, 2).getValue();
  if (!text) return { ok: true, state: null };
  try {
    return { ok: true, state: JSON.parse(text), at: String(at) };
  } catch (err) {
    return { ok: false, error: '시트에 저장된 내용을 읽지 못했습니다: ' + String(err) };
  }
}

function resetSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) return ss.insertSheet(name);
  sh.clear();
  return sh;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- 정산 계산 시트 ----------------
 *
 * 「정산」 탭은 결과를 찍어 둔 사진이라 숫자를 고쳐도 아무것도 따라 변하지
 * 않습니다. 이 탭은 반대로 살아 있는 계산기입니다. 노란 칸에 값을 넣으면
 * 대사와 수익금이 시트 함수로 다시 계산됩니다.
 *
 * 준비 사이트가 사라져도 이 탭 하나만 있으면 정산을 끝낼 수 있게 하려는 것이
 * 목적입니다. 그래서 사이트의 계산식을 그대로 시트 함수로 옮겨 적었습니다.
 */

var CALC_BOOTHS = 20;   // 조 입력 줄 수 (넉넉히)
var CALC_COMMON = 15;   // 공통 비용 줄 수

// 줄 위치를 한곳에 모아 둔다. 표를 손대면 여기만 고치면 된다.
function calcMap() {
  var m = {};
  m.boothHead = 7;
  m.boothTop = 8;
  m.boothEnd = m.boothTop + CALC_BOOTHS - 1;
  m.boothSum = m.boothEnd + 1;
  m.deskHead = m.boothSum + 3;
  m.openTin = m.deskHead + 1;
  m.closeTin = m.openTin + 1;
  m.openCash = m.closeTin + 2;
  m.closeCash = m.openCash + 1;
  m.transfer = m.closeCash + 1;
  m.preVoucher = m.transfer + 1;
  m.presale = m.preVoucher + 3;
  m.commonHead = m.presale + 2;
  m.commonTop = m.commonHead + 1;
  m.commonEnd = m.commonTop + CALC_COMMON - 1;
  m.commonSum = m.commonEnd + 1;
  m.balTop = m.commonSum + 2;
  m.bOpenTin = m.balTop + 1;
  m.bCloseTin = m.bOpenTin + 1;
  m.bFloat = m.bCloseTin + 1;
  m.bPre = m.bFloat + 1;
  m.bSold = m.bPre + 1;
  m.bCashDelta = m.bSold + 1;
  m.bTransfer = m.bCashDelta + 1;
  m.bPre2 = m.bTransfer + 1;
  m.bReceived = m.bPre2 + 1;
  m.bDiff = m.bReceived + 1;
  m.bVerdict = m.bDiff + 1;
  m.bUnused = m.bVerdict + 2;
  m.bUnusedPct = m.bUnused + 1;
  m.profitTop = m.bUnusedPct + 2;
  m.pDesk = m.profitTop + 1;
  m.pCash = m.pDesk + 1;
  m.pPresale = m.pCash + 1;
  m.pRevenue = m.pPresale + 1;
  m.pCostBooth = m.pRevenue + 1;
  m.pCostCommon = m.pCostBooth + 1;
  m.pCost = m.pCostCommon + 1;
  m.pFinal = m.pCost + 1;
  m.refundTop = m.pFinal + 2;
  m.rAll = m.refundTop + 1;
  m.rPaid = m.rAll + 1;
  m.rRefund = m.rPaid + 1;
  return m;
}

/**
 * 계산 시트를 새로 만든다. st 가 있으면 값까지 채우고, 없으면 빈 양식만 만든다.
 * 함수는 어느 쪽이든 똑같이 들어가므로 빈 양식에 손으로 적어도 결과가 나온다.
 */
function buildCalcSheet(st, at) {
  var m = calcMap();
  var W = 14; // A~N
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SETTLE_CALC);
  if (!sh) sh = ss.insertSheet(SETTLE_CALC);
  sh.clear();
  sh.clearConditionalFormatRules();
  var all = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  all.breakApart();
  all.clearDataValidations();

  function put(row, col, value) { sh.getRange(row, col).setValue(value); }
  function fx(row, col, formula) { sh.getRange(row, col).setFormula(formula); }
  function title(row, text) {
    sh.getRange(row, 1, 1, W).merge().setValue(text)
      .setFontWeight('bold').setFontSize(12).setBackground('#efece7');
  }

  // ----- 머리말 -----
  sh.getRange(1, 1, 1, W).merge().setValue('2026 바자회 정산 — 계산 시트')
    .setFontWeight('bold').setFontSize(15);
  sh.getRange(2, 1, 1, W).merge()
    .setValue('노란 칸에만 숫자를 넣으세요. 나머지 칸은 시트 함수로 저절로 계산됩니다. 준비 사이트가 없어도 이 탭 하나로 정산을 끝낼 수 있습니다.')
    .setWrap(true);
  sh.getRange(3, 1, 1, W).merge()
    .setValue('[주의] 이 탭은 정산 도구에서 「구글 시트로 보내기」를 누를 때마다 통째로 새로 만들어집니다. 여기에 직접 입력해 남기시려면 시트 탭을 오른쪽 클릭해 「복사」한 뒤 그 사본에 적으세요.')
    .setWrap(true).setFontColor('#8a1c1c');
  put(4, 1, '올린 시각'); put(4, 2, at || '');

  // ----- 1. 조별 입력 -----
  title(6, '1. 조별 입력 — 조 이름, 아침에 나눠준 장수, 마감에 걷은 장수, 현금 매출, 재료비');
  sh.getRange(m.boothHead, 1, 1, W).setValues([[
    '조', '아침 1,000원', '아침 5,000원', '아침 10,000원', '아침 지급 합계',
    '마감 1,000원', '마감 5,000원', '마감 10,000원', '마감 제출 합계',
    '교환권 매출', '현금 매출', '매출 합계', '재료비', '재정 지급'
  ]]).setFontWeight('bold').setBackground('#efece7').setWrap(true);

  for (var r = m.boothTop; r <= m.boothEnd; r++) {
    fx(r, 5, '=IF($A' + r + '="","",B' + r + '*1000+C' + r + '*5000+D' + r + '*10000)');
    fx(r, 9, '=IF($A' + r + '="","",F' + r + '*1000+G' + r + '*5000+H' + r + '*10000)');
    fx(r, 10, '=IF($A' + r + '="","",I' + r + '-E' + r + ')');
    fx(r, 12, '=IF($A' + r + '="","",J' + r + '+K' + r + ')');
  }
  put(m.boothSum, 1, '합계');
  [5, 9, 10, 11, 12, 13].forEach(function (c) {
    var L = colLetter(c);
    fx(m.boothSum, c, '=SUM(' + L + m.boothTop + ':' + L + m.boothEnd + ')');
  });
  sh.getRange(m.boothSum, 1, 1, W).setFontWeight('bold').setBackground('#efece7');

  // ----- 2. 교환소 -----
  title(m.deskHead - 1, '2. 교환소 — 아침과 저녁에 센 것');
  sh.getRange(m.deskHead, 1, 1, 5)
    .setValues([['구분', '1,000원', '5,000원', '10,000원', '합계']])
    .setFontWeight('bold').setBackground('#efece7');
  put(m.openTin, 1, '아침 통 (장수)');
  put(m.closeTin, 1, '저녁 통 (장수)');
  [m.openTin, m.closeTin].forEach(function (row) {
    fx(row, 5, '=B' + row + '*1000+C' + row + '*5000+D' + row + '*10000');
  });
  put(m.openCash, 1, '아침 금고 (원)');
  put(m.closeCash, 1, '저녁 금고 (원) — 부스 현금을 받기 전에 센 금액');
  put(m.transfer, 1, '계좌이체 합계 (원) — 당일 교환권 판매분만');
  put(m.preVoucher, 1, '행사 전에 판 교환권 (원) — 전도용 등');

  // ----- 3. 그 밖의 매출·비용 -----
  title(m.presale - 1, '3. 그 밖의 매출과 비용');
  put(m.presale, 1, '행사전 구매 매출 (원)');
  sh.getRange(m.commonHead, 1, 1, 3)
    .setValues([['공통 비용 항목', '금액 (원)', '재정 지급']])
    .setFontWeight('bold').setBackground('#efece7');
  put(m.commonSum, 1, '공통 비용 합계');
  fx(m.commonSum, 2, '=SUM(B' + m.commonTop + ':B' + m.commonEnd + ')');
  sh.getRange(m.commonSum, 1, 1, 3).setFontWeight('bold').setBackground('#efece7');

  // ----- 4. 대사 -----
  title(m.balTop, '4. 대사 — 나간 교환권과 받은 돈이 같아야 합니다');
  [
    [m.bOpenTin, '아침 통', '=E' + m.openTin],
    [m.bCloseTin, '− 저녁 통', '=E' + m.closeTin],
    [m.bFloat, '− 조별 지급 합계', '=E' + m.boothSum],
    [m.bPre, '＋ 행사 전에 판 교환권', '=B' + m.preVoucher],
    [m.bSold, '＝ 손님에게 팔려 나간 교환권',
      '=B' + m.bOpenTin + '-B' + m.bCloseTin + '-B' + m.bFloat + '+B' + m.bPre],
    [m.bCashDelta, '저녁 금고 − 아침 금고', '=B' + m.closeCash + '-B' + m.openCash],
    [m.bTransfer, '＋ 계좌이체', '=B' + m.transfer],
    [m.bPre2, '＋ 행사 전에 판 교환권 대금', '=B' + m.preVoucher],
    [m.bReceived, '＝ 그 값으로 받은 돈',
      '=B' + m.bCashDelta + '+B' + m.bTransfer + '+B' + m.bPre2],
    [m.bDiff, '차이 (0이어야 합니다)', '=B' + m.bReceived + '-B' + m.bSold],
    [m.bUnused, '미사용 교환권 (손님이 쓰지 않고 가져간 몫)',
      '=B' + m.bSold + '-J' + m.boothSum],
    [m.bUnusedPct, '미사용 비율 (2024년 2.5%)',
      '=IF(B' + m.bSold + '=0,"",B' + m.bUnused + '/B' + m.bSold + ')']
  ].forEach(function (row) { put(row[0], 1, row[1]); fx(row[0], 2, row[2]); });

  fx(m.bVerdict, 1, '=IF(B' + m.bDiff + '=0,"맞습니다 — 차이 0원","차이 "&TEXT(B' +
    m.bDiff + ',"#,##0")&"원 — 어딘가 어긋났습니다")');
  sh.getRange(m.bVerdict, 1, 1, 4).merge();
  sh.getRange(m.bVerdict, 1).setFontWeight('bold').setFontSize(12);
  [m.bSold, m.bReceived, m.bDiff].forEach(function (row) {
    sh.getRange(row, 1, 1, 2).setFontWeight('bold');
  });

  // ----- 5. 최종 수익금 -----
  title(m.profitTop, '5. 최종 수익금 — 매출에서 원가를 뺍니다');
  [
    [m.pDesk, '교환소가 받은 돈', '=B' + m.bReceived],
    [m.pCash, '＋ 조별 현금 매출 합계', '=K' + m.boothSum],
    [m.pPresale, '＋ 행사전 구매 매출', '=B' + m.presale],
    [m.pRevenue, '＝ 매출 합계', '=B' + m.pDesk + '+B' + m.pCash + '+B' + m.pPresale],
    [m.pCostBooth, '조별 재료비 합계', '=M' + m.boothSum],
    [m.pCostCommon, '＋ 공통 비용 합계', '=B' + m.commonSum],
    [m.pCost, '＝ 원가 합계', '=B' + m.pCostBooth + '+B' + m.pCostCommon],
    [m.pFinal, '＝ 최종 수익금 (매출 − 원가)', '=B' + m.pRevenue + '-B' + m.pCost]
  ].forEach(function (row) { put(row[0], 1, row[1]); fx(row[0], 2, row[2]); });
  [m.pRevenue, m.pCost, m.pFinal].forEach(function (row) {
    sh.getRange(row, 1, 1, 2).setFontWeight('bold');
  });
  sh.getRange(m.pFinal, 1, 1, 2).setFontSize(12).setBackground('#efece7');

  // ----- 6. 돌려드릴 돈 -----
  title(m.refundTop, '6. 마감 후 돌려드릴 돈 — 재정에서 아직 내지 않은 원가입니다');
  [
    [m.rAll, '원가 합계', '=B' + m.pCost],
    [m.rPaid, '− 재정에서 이미 지급한 몫',
      '=SUMIF(N' + m.boothTop + ':N' + m.boothEnd + ',TRUE,M' + m.boothTop + ':M' + m.boothEnd +
      ')+SUMIF(C' + m.commonTop + ':C' + m.commonEnd + ',TRUE,B' + m.commonTop + ':B' + m.commonEnd + ')'],
    [m.rRefund, '＝ 돌려드릴 금액', '=B' + m.rAll + '-B' + m.rPaid]
  ].forEach(function (row) { put(row[0], 1, row[1]); fx(row[0], 2, row[2]); });
  sh.getRange(m.rRefund, 1, 1, 2).setFontWeight('bold');
  sh.getRange(m.rRefund + 1, 1, 1, W).merge()
    .setValue('※ 이 돈을 교환소 금고에서 꺼내지 마세요. 금고에서 나가면 저녁 금고가 줄어 대사가 틀어집니다.')
    .setFontColor('#8a1c1c');

  decorateCalcSheet(sh, m, W);
  if (st) fillCalcSheet(sh, m, st);
  return sh;
}

function colLetter(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

/** 넣을 칸과 계산된 칸을 눈으로 구분되게 한다. 이 시트는 처음 보는 사람이 쓴다. */
function decorateCalcSheet(sh, m, W) {
  var IN = '#fff6d8';   // 넣는 칸 (노랑)
  var money = '#,##0';

  var inputs = [
    sh.getRange(m.boothTop, 1, CALC_BOOTHS, 4),      // 조 이름 + 아침 장수
    sh.getRange(m.boothTop, 6, CALC_BOOTHS, 3),      // 마감 장수
    sh.getRange(m.boothTop, 11, CALC_BOOTHS, 1),     // 현금 매출
    sh.getRange(m.boothTop, 13, CALC_BOOTHS, 2),     // 재료비 + 재정 지급
    sh.getRange(m.openTin, 2, 2, 3),                 // 통 장수
    sh.getRange(m.openCash, 2, 4, 1),                // 금고/이체/사전판매
    sh.getRange(m.presale, 2, 1, 1),                 // 행사전 구매
    sh.getRange(m.commonTop, 1, CALC_COMMON, 3)      // 공통 비용
  ];
  inputs.forEach(function (rg) { rg.setBackground(IN).setBorder(true, true, true, true, true, true); });

  // 금액 칸 서식
  [
    sh.getRange(m.boothTop, 5, CALC_BOOTHS + 1, 1),
    sh.getRange(m.boothTop, 9, CALC_BOOTHS + 1, 4),
    sh.getRange(m.boothTop, 13, CALC_BOOTHS + 1, 1),
    sh.getRange(m.openTin, 5, 2, 1),
    sh.getRange(m.openCash, 2, 4, 1),
    sh.getRange(m.presale, 2, 1, 1),
    sh.getRange(m.commonTop, 2, CALC_COMMON + 1, 1),
    sh.getRange(m.bOpenTin, 2, m.bUnused - m.bOpenTin + 1, 1),
    sh.getRange(m.pDesk, 2, m.pFinal - m.pDesk + 1, 1),
    sh.getRange(m.rAll, 2, 3, 1)
  ].forEach(function (rg) { rg.setNumberFormat(money); });
  sh.getRange(m.boothTop, 1, CALC_BOOTHS, 1).setNumberFormat('@');
  sh.getRange(m.commonTop, 1, CALC_COMMON, 1).setNumberFormat('@');
  sh.getRange(m.boothTop, 2, CALC_BOOTHS, 3).setNumberFormat('0');
  sh.getRange(m.boothTop, 6, CALC_BOOTHS, 3).setNumberFormat('0');
  sh.getRange(m.openTin, 2, 2, 3).setNumberFormat('0');
  sh.getRange(m.bUnusedPct, 2).setNumberFormat('0.0%');

  // 재정 지급은 체크 상자로
  sh.getRange(m.boothTop, 14, CALC_BOOTHS, 1).insertCheckboxes();
  sh.getRange(m.commonTop, 3, CALC_COMMON, 1).insertCheckboxes();

  // 차이 한 줄에만 색을 건다. 이 시트가 내놓는 가장 중요한 답이다.
  var diff = sh.getRange(m.bDiff, 1, 2, 2);
  var ok = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B$' + m.bDiff + '=0')
    .setBackground('#dff3e4').setRanges([diff]).build();
  var bad = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B$' + m.bDiff + '<>0')
    .setBackground('#fbe3e3').setRanges([diff]).build();
  sh.setConditionalFormatRules([ok, bad]);

  sh.setColumnWidth(1, 300);
  for (var c = 2; c <= W; c++) sh.setColumnWidth(c, 110);
  sh.setFrozenRows(m.boothHead);
}

/** 정산 도구의 현재 내용을 계산 시트의 넣는 칸에 그대로 옮긴다. */
function fillCalcSheet(sh, m, st) {
  var booths = st.booths || [];
  var rows = [];
  for (var i = 0; i < CALC_BOOTHS; i++) {
    var b = booths[i];
    if (!b) { rows.push(['', '', '', '', '', '', '', '', '', false]); continue; }
    var fl = (st.floats || {})[b.id] || {};
    var fi = (st.finals || {})[b.id] || {};
    rows.push([
      b.name,
      num0(fl[1000]), num0(fl[5000]), num0(fl[10000]),
      num0(fi[1000]), num0(fi[5000]), num0(fi[10000]),
      num0((st.cash || {})[b.id]), num0((st.costs || {})[b.id]),
      !!(st.costPaid || {})[b.id]
    ]);
  }
  // A~D
  sh.getRange(m.boothTop, 1, CALC_BOOTHS, 4).setValues(rows.map(function (r) { return r.slice(0, 4); }));
  // F~H
  sh.getRange(m.boothTop, 6, CALC_BOOTHS, 3).setValues(rows.map(function (r) { return r.slice(4, 7); }));
  // K
  sh.getRange(m.boothTop, 11, CALC_BOOTHS, 1).setValues(rows.map(function (r) { return [r[7]]; }));
  // M
  sh.getRange(m.boothTop, 13, CALC_BOOTHS, 1).setValues(rows.map(function (r) { return [r[8]]; }));
  // N (재정 지급)
  sh.getRange(m.boothTop, 14, CALC_BOOTHS, 1)
    .setValues(rows.map(function (r) { return [r[9]]; }));

  var d = st.desk || {};
  var tin = function (src) {
    src = src || {};
    return [num0(src[1000]), num0(src[5000]), num0(src[10000])];
  };
  sh.getRange(m.openTin, 2, 1, 3).setValues([tin(d.openTin)]);
  sh.getRange(m.closeTin, 2, 1, 3).setValues([tin(d.closeTin)]);
  sh.getRange(m.openCash, 2).setValue(num0(d.openCash));
  sh.getRange(m.closeCash, 2).setValue(num0(d.closeCash));
  sh.getRange(m.transfer, 2).setValue(num0(d.transfer));
  sh.getRange(m.preVoucher, 2).setValue(num0(st.presaleVoucher));
  sh.getRange(m.presale, 2).setValue(num0(st.presale));

  var common = st.commonCosts || [];
  var cc = [];
  for (var k = 0; k < CALC_COMMON; k++) {
    var c = common[k];
    cc.push(c ? [String(c.name || ''), num0(c.amount), !!c.paid] : ['', '', false]);
  }
  sh.getRange(m.commonTop, 1, CALC_COMMON, 3).setValues(cc);
}

function num0(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

/** 시트를 열면 메뉴가 생긴다. 사이트 없이 빈 계산 시트만 만들고 싶을 때 쓴다. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('바자회 정산')
    .addItem('빈 계산 시트 만들기', 'makeBlankCalcSheet')
    .addToUi();
}

function makeBlankCalcSheet() {
  var sh = buildCalcSheet(null, '');
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('「' + SETTLE_CALC + '」 탭을 새로 만들었습니다. 노란 칸에 값을 넣으면 결과가 계산됩니다.');
}
