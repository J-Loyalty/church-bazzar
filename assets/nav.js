// The reading order, shared by the document viewer (doc.html) and the print
// sheet (print.html). Order here is the order someone seeing this for the first
// time should read in.
//
// Adding or moving a document means editing this list AND the "읽는 순서" section
// of 바자회_기획안.md AND the step tabs in index.html.
(function (global) {
  "use strict";

  // It drives the sidebar, the step numbers, and the prev/next links.
  var NAV = [
    { group: "한눈에 보기", items: [
      { path: "docs/한장_요약.md", label: "한 장 요약" }
    ]},
    { group: "1단계 · 왜 하는가", items: [
      { path: "docs/목적_목표.md", label: "목적과 목표" },
      { path: "바자회_기획안.md", label: "바자회 기획안" }
    ]},
    { group: "2단계 · 당일 운영", items: [
      { path: "docs/부스_배치.md", label: "부스 배치" },
      { path: "docs/타임라인.md", label: "타임라인" },
      { path: "docs/운영_역할.md", label: "운영 역할" },
      { path: "docs/교환권_운영.md", label: "교환권 운영" },
      { path: "docs/행사전_구매.md", label: "행사전 구매" }
    ]},
    { group: "3단계 · 마무리", items: [
      { path: "docs/정산_절차.md", label: "정산 절차" }
    ]},
    { group: "참고", items: [
      { path: "docs/우천_대책.md", label: "우천 대책" },
      { path: "docs/과거_실적.md", label: "과거 실적" },
      { path: "docs/가치_기준.md", label: "가치 기준" },
      { path: "docs/확인_필요_체크리스트.md", label: "확인 필요 체크리스트" }
    ]}
  ];

  global.NAV = NAV;
  global.SEQUENCE = NAV.reduce(function (acc, group) { return acc.concat(group.items); }, []);
})(window);
