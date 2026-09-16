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
  rows.push(['조', '받은 잔돈', '제출 교환권', '교환권 매출', '현금 매출', '매출 합계']);
  (s.rows || []).forEach(function (r) {
    rows.push([r.name, r.float, r.final, r.voucher, r.cash, r.total]);
  });
  rows.push(['합계', s.floatSum, s.finalSum, s.voucherSum, s.cashSum, s.totalSum]);
  rows.push([]);
  rows.push(['교환소 대사', '', '', '', '', '']);
  rows.push(['아침 통', s.openTin]);
  rows.push(['저녁 통', s.closeTin]);
  rows.push(['조별 지급 합계', s.floatSum]);
  rows.push(['팔려 나간 교환권', s.sold]);
  rows.push(['저녁 금고 − 아침 금고', s.cashDelta]);
  rows.push(['계좌이체', s.transfer]);
  rows.push(['받은 돈', s.received]);
  rows.push(['차이 (0이어야 함)', s.diff]);
  rows.push(['미사용 교환권', s.unused]);
  rows.push([]);
  rows.push(['최종 수익금', '', '', '', '', '']);
  rows.push(['교환소가 받은 돈', s.received]);
  rows.push(['조별 현금 매출 합계', s.cashSum]);
  rows.push(['행사전 구매 매출', s.presale]);
  rows.push(['최종 수익금', s.final]);

  var width = 6;
  var padded = rows.map(function (r) {
    var out = r.slice();
    while (out.length < width) out.push('');
    return out;
  });
  sh.getRange(1, 1, padded.length, width).setValues(padded);
  sh.getRange(1, 1, 1, width).setFontWeight('bold');
  sh.getRange(4, 1, 1, width).setFontWeight('bold');
  sh.setFrozenRows(1);

  // --- 다시 불러올 원본 ---
  var raw = resetSheet(SETTLE_RAW);
  raw.getRange(1, 1, 2, 2).setValues([
    ['올린 시각', at],
    ['원본', JSON.stringify(st)]
  ]);

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
