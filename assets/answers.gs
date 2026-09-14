/**
 * 바자회 준비 — 항목별 답변 수집 (Google Apps Script)
 *
 * 이 파일은 저장소에 보관만 하는 사본입니다. 실제로는 이 내용을 구글 시트의
 * Apps Script 편집기에 붙여넣고 웹 앱으로 배포해야 동작합니다.
 * 설정 순서는 저장소 루트의 SETUP-SHEETS.md 참고.
 *
 * 배포 주소는 공개 사이트 코드에 들어가므로 누구나 알 수 있습니다. 그래서 저장과
 * 조회 모두 아래 PASSWORD 를 확인합니다. 암호는 이 스크립트 안에만 있고 사이트
 * 코드에는 들어가지 않습니다.
 */

// 아래 두 줄만 바꿔서 쓰세요.
var PASSWORD = '여기에-공유-암호를-적으세요';
var SHEET_NAME = '답변';

/**
 * 사이트에서 보내는 요청은 모두 POST 입니다. 본문의 action 으로 갈립니다.
 *  - save : 답변 한 건을 시트에 추가
 *  - list : 지금까지 쌓인 답변 전체를 돌려줌
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

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
