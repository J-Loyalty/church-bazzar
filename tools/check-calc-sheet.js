// 계산 시트의 함수들이 실제로 맞는 값을 내는지, Sheets 를 흉내 내어 확인한다.
const fs = require('fs');

// ---------- 아주 작은 Sheets 흉내 ----------
const grid = new Map();            // "A8" -> {v} | {f}
const key = (r, c) => colL(c) + r;
function colL(n) { let s = ''; while (n > 0) { const x = (n - 1) % 26; s = String.fromCharCode(65 + x) + s; n = (n - x - 1) / 26; } return s; }

// 시트는 = + - @ 로 시작하는 값을 수식으로 읽는다. 라벨이 그렇게 시작하면 #ERROR! 가 난다.
function guard(v, at) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) {
    throw new Error('시트가 수식으로 읽을 라벨 @' + at + ': ' + JSON.stringify(v));
  }
  return v;
}

function Range(r, c, nr, nc) {
  const api = {
    setValue(v) { grid.set(key(r, c), { v: guard(v, key(r, c)) }); return api; },
    setFormula(f) { grid.set(key(r, c), { f }); return api; },
    setValues(vals) {
      for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals[i].length; j++) {
        if (i >= nr || j >= nc) throw new Error(`setValues 범위 초과 @${key(r, c)} ${nr}x${nc} <- ${vals.length}x${vals[i].length}`);
        grid.set(key(r + i, c + j), { v: guard(vals[i][j], key(r + i, c + j)) });
      }
      if (vals.length !== nr) throw new Error(`행 수 불일치 @${key(r, c)}: 범위 ${nr}, 값 ${vals.length}`);
      return api;
    },
    merge: () => api, setFontWeight: () => api, setFontSize: () => api,
    setBackground: () => api, setWrap: () => api, setFontColor: () => api,
    setBorder: () => api, setNumberFormat: () => api, insertCheckboxes: () => api,
    breakApart: () => api, clearDataValidations: () => api, setHorizontalAlignment: () => api
  };
  return api;
}

const sheet = {
  clear: () => sheet, clearConditionalFormatRules: () => sheet,
  getMaxRows: () => 200, getMaxColumns: () => 26,
  getRange: (r, c, nr = 1, nc = 1) => Range(r, c, nr, nc),
  setColumnWidth: () => sheet, setFrozenRows: () => sheet,
  setConditionalFormatRules: () => sheet
};
const rule = { whenFormulaSatisfied: () => rule, setBackground: () => rule, setRanges: () => rule, build: () => ({}) };
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet, setActiveSheet: () => {} }),
  newConditionalFormatRule: () => rule,
  getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }), alert: () => {} })
};
global.Utilities = { formatDate: () => '2026-10-09 17:00' };
global.Session = { getScriptTimeZone: () => 'Asia/Seoul' };
global.ContentService = { createTextOutput: () => ({ setMimeType: () => {} }), MimeType: {} };

// ---------- 스크립트 읽어 실행 ----------
const src = fs.readFileSync('assets/answers.gs', 'utf8');
(0, eval)(src + '\n;globalThis.__build = buildCalcSheet; globalThis.__map = calcMap;');

// ---------- 식 계산기 ----------
const cache = new Map();
function V(ref) {
  if (cache.has(ref)) return cache.get(ref);
  const cell = grid.get(ref);
  let out;
  if (!cell) out = '';
  else if ('v' in cell) out = cell.v === undefined ? '' : cell.v;
  else out = evalFormula(cell.f);
  cache.set(ref, out);
  return out;
}
function n(x) { return typeof x === 'number' ? x : (x === '' || x === false ? 0 : (x === true ? 1 : Number(x) || 0)); }
function expand(range) {
  const [a, b] = range.split(':');
  const m1 = /^([A-Z]+)(\d+)$/.exec(a), m2 = /^([A-Z]+)(\d+)$/.exec(b);
  const c1 = m1[1].charCodeAt(0) - 64, c2 = m2[1].charCodeAt(0) - 64;
  const out = [];
  for (let r = +m1[2]; r <= +m2[2]; r++) for (let c = c1; c <= c2; c++) out.push(colL(c) + r);
  return out;
}
const SUM = rg => expand(rg).reduce((a, k) => a + n(V(k)), 0);
const SUMIF = (test, want, vals) => {
  const t = expand(test), v = expand(vals);
  return t.reduce((a, k, i) => a + (V(k) === want ? n(V(v[i])) : 0), 0);
};
const TEXT = x => n(x).toLocaleString('en-US');
const IF = (c, a, b) => (c ? a : b);
const TRUE = true, FALSE = false;

function evalFormula(f) {
  let s = f.replace(/^=/, '');
  const lits = [];
  s = s.replace(/"(?:[^"]|"")*"/g, m => { lits.push(m); return `${lits.length - 1}`; });
  const refs = [];
  s = s.replace(/\$?[A-Z]{1,2}\$?\d+:\$?[A-Z]{1,2}\$?\d+/g, m => {
    refs.push(`'${m.replace(/\$/g, '')}'`); return `${refs.length - 1}`;
  });
  s = s.replace(/\$?([A-Z]{1,2})\$?(\d+)/g, (m, c, r) => {
    refs.push(`V('${c}${r}')`); return `${refs.length - 1}`;
  });
  s = s.replace(/<>/g, '!==').replace(/(?<![=!<>])=(?!=)/g, '===').replace(/&/g, '+');
  s = s.replace(/(\d+)/g, (m, i) => refs[+i]);
  s = s.replace(/(\d+)/g, (m, i) => lits[+i]);
  try { return eval(s); } catch (e) { throw new Error(`식 계산 실패: ${f}\n  -> ${s}\n  ${e.message}`); }
}

// ---------- 시나리오: 웹 도구와 같은 값 ----------
const st = {
  booths: [{ id: 'a', name: '1조 국수' }, { id: 'b', name: '2조 김밥' }],
  floats: { a: { 1000: 50, 5000: 0, 10000: 0 }, b: { 1000: 30, 5000: 0, 10000: 0 } },
  finals: { a: { 1000: 200, 5000: 0, 10000: 0 }, b: { 1000: 150, 5000: 0, 10000: 0 } },
  cash: { a: 30000, b: 20000 }, presales: { a: 200000, b: 100000 },
  costs: { a: 100000, b: 60000 }, costPaid: { a: true },
  commonCosts: [{ name: '교환권 인쇄비', amount: 350000, paid: true }, { name: '천막 대여료', amount: 50000, paid: false }],
  presale: 0, presaleVoucher: 100000,
  desk: { openTin: { 1000: 500, 5000: 0, 10000: 0 }, closeTin: { 1000: 100, 5000: 0, 10000: 0 }, openCash: 50000, closeCash: 250000, transfer: 120000 }
};

global.__build(st, '2026-10-09 17:00');
const m = global.__map();

const got = {
  '조1 교환권 매출': V('J8'), '조2 교환권 매출': V('J9'),
  '조1 매출 합계': V('M8'), '조2 매출 합계': V('M9'), '지급 합계': V('E' + m.boothSum),
  '현금 합계': V('K' + m.boothSum), '교환권매출 합계': V('J' + m.boothSum),
  '행사전 구매 합계': V('L' + m.boothSum), '재료비 합계': V('N' + m.boothSum),
  '팔려 나간 교환권': V('B' + m.bSold), '받은 돈': V('B' + m.bReceived),
  '차이': V('B' + m.bDiff), '판정': V('A' + m.bVerdict),
  '미사용': V('B' + m.bUnused), '미사용 비율': V('B' + m.bUnusedPct),
  '매출 합계': V('B' + m.pRevenue), '원가 합계': V('B' + m.pCost),
  '최종 수익금': V('B' + m.pFinal),
  '이미 지급': V('B' + m.rPaid), '돌려드릴 금액': V('B' + m.rRefund)
};
const want = {
  '조1 교환권 매출': 150000, '조2 교환권 매출': 120000,
  '조1 매출 합계': 380000, '조2 매출 합계': 240000, '지급 합계': 80000,
  '현금 합계': 50000, '교환권매출 합계': 270000,
  '행사전 구매 합계': 300000, '재료비 합계': 160000,
  '팔려 나간 교환권': 420000, '받은 돈': 420000, '차이': 0,
  '판정': '맞습니다 — 차이 0원',
  '미사용': 150000, '미사용 비율': 150000 / 420000,
  '매출 합계': 770000, '원가 합계': 560000, '최종 수익금': 210000,
  '이미 지급': 450000, '돌려드릴 금액': 110000
};
let bad = 0;
for (const k of Object.keys(want)) {
  const ok = typeof want[k] === 'number' ? Math.abs(n(got[k]) - want[k]) < 1e-9 : got[k] === want[k];
  if (!ok) { bad++; console.log('X', k, '기대', want[k], '실제', got[k]); }
}
console.log(bad ? `\n${bad}개 불일치` : '모든 값이 웹 도구와 일치합니다 (' + Object.keys(want).length + '개)');

// 빈 양식도 깨지지 않는지
cache.clear(); grid.clear();
global.__build(null, '');
console.log('빈 양식: 차이', V('B' + m.bDiff), '/ 판정', V('A' + m.bVerdict), '/ 수익', V('B' + m.pFinal), '/ 돌려드릴', V('B' + m.rRefund));

// 빈 양식에 손으로 값만 넣어도 되는지 (사이트 없이 쓰는 경우)
cache.clear();
grid.set('A8', { v: '1조 국수' }); grid.set('B8', { v: 50 }); grid.set('F8', { v: 200 });
grid.set('K8', { v: 30000 }); grid.set('L8', { v: 200000 });
grid.set('N8', { v: 100000 }); grid.set('O8', { v: true });
grid.set('A9', { v: '2조 김밥' }); grid.set('B9', { v: 30 }); grid.set('F9', { v: 150 });
grid.set('K9', { v: 20000 }); grid.set('L9', { v: 100000 }); grid.set('N9', { v: 60000 });
grid.set('B' + m.openTin, { v: 500 }); grid.set('B' + m.closeTin, { v: 100 });
grid.set('B' + m.openCash, { v: 50000 }); grid.set('B' + m.closeCash, { v: 250000 });
grid.set('B' + m.transfer, { v: 120000 }); grid.set('B' + m.preVoucher, { v: 100000 });
grid.set('A' + m.commonTop, { v: '교환권 인쇄비' }); grid.set('B' + m.commonTop, { v: 350000 }); grid.set('C' + m.commonTop, { v: true });
grid.set('A' + (m.commonTop + 1), { v: '천막 대여료' }); grid.set('B' + (m.commonTop + 1), { v: 50000 });
console.log('손으로 입력: 차이', V('B' + m.bDiff), '/ 수익', V('B' + m.pFinal), '/ 돌려드릴', V('B' + m.rRefund));
