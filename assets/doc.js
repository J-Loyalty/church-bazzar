(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var src = params.get("src") || "바자회_기획안.md";

  renderSidebar(src);
  renderWhere(src);
  loadDoc(src);

  // 사이드바를 펼치지 않아도 지금 읽는 자리를 알 수 있게 상단 바에 적어둔다.
  function renderWhere(currentSrc) {
    var where = "";
    NAV.forEach(function (group) {
      group.items.forEach(function (item) {
        if (item.path === currentSrc) where = group.group + " · " + item.label;
      });
    });
    document.getElementById("where").textContent = where;
  }

  function renderSidebar(currentSrc) {
    var nav = document.getElementById("sidebar");
    var currentLabel = "문서 목록";
    NAV.forEach(function (group) {
      group.items.forEach(function (item) {
        if (item.path === currentSrc) currentLabel = item.label;
      });
    });

    var html = '<button type="button" class="sidebar-toggle" id="sidebar-toggle">' +
      MD.escapeHtml(currentLabel) + ' <span class="chevron">&#9662;</span></button>';
    html += '<div class="sidebar-groups" id="sidebar-groups">';
    NAV.forEach(function (group) {
      html += "<h2>" + MD.escapeHtml(group.group) + "</h2><ul>";
      group.items.forEach(function (item) {
        var isActive = item.path === currentSrc;
        html += '<li><a href="doc.html?src=' + encodeURIComponent(item.path) + '"' +
          (isActive ? ' class="active"' : "") + ">" + MD.escapeHtml(item.label) + "</a></li>";
      });
      html += "</ul>";
    });
    html += "</div>";
    nav.innerHTML = html;

    document.getElementById("sidebar-toggle").addEventListener("click", function () {
      document.getElementById("sidebar-groups").classList.toggle("open");
      this.classList.toggle("open");
    });
  }

  function loadDoc(path) {
    var content = document.getElementById("content");
    fetch(path)
      .then(function (res) {
        if (!res.ok) throw new Error("문서를 찾을 수 없습니다 (" + res.status + ")");
        return res.text();
      })
      .then(function (text) {
        var baseDir = path.indexOf("/") >= 0 ? path.slice(0, path.lastIndexOf("/")) : "";
        var html = MD.render(text, baseDir);
        content.innerHTML = html;
        var h1 = content.querySelector("h1");
        document.title = (h1 ? h1.textContent : path) + " · 바자회 준비 허브";
        dressAsReport(content, path);
        renderPrevNext(path);
      })
      .catch(function (err) {
        content.innerHTML = '<p class="doc-error">문서를 불러오지 못했습니다: ' + MD.escapeHtml(err.message) + "</p>" +
          '<p class="hint">경로: ' + MD.escapeHtml(path) + "</p>";
      });
  }

  // 보고서·공유용 문서의 모양을 갖춘다: 머리(소속·분류·순서), 첫 문장을 요약으로,
  // 절이 셋 이상이면 차례, 맨 아래에 원문 위치. 마크다운 원문은 건드리지 않고
  // 렌더된 결과에만 덧붙이므로, 문서를 고칠 때 이 부분을 같이 고칠 일은 없다.
  function dressAsReport(root, currentSrc) {
    var h1 = root.querySelector("h1");
    var group = "", order = "";
    NAV.forEach(function (g) {
      g.items.forEach(function (item) { if (item.path === currentSrc) group = g.group; });
    });
    SEQUENCE.forEach(function (item, i) {
      if (item.path === currentSrc) order = "읽는 순서 " + (i + 1) + " / " + SEQUENCE.length;
    });

    var head = document.createElement("header");
    head.className = "masthead";
    var meta = [group, order, "행사일 2026년 10월 9일 (금)"].filter(Boolean);
    head.innerHTML = '<p class="org-line">대한예수교장로회 김포남현교회 · 이웃돕기 사랑의 바자회</p>';
    if (h1) head.appendChild(h1);
    root.insertBefore(head, root.firstChild);
    if (h1 && head.nextElementSibling && head.nextElementSibling.tagName === "P") {
      head.nextElementSibling.classList.add("doc-lead");
      head.appendChild(head.nextElementSibling);
    }
    var ul = document.createElement("ul");
    ul.className = "meta-list";
    ul.innerHTML = meta.map(function (m) { return "<li>" + MD.escapeHtml(m) + "</li>"; }).join("");
    head.appendChild(ul);

    var h2s = root.querySelectorAll("h2");
    h2s.forEach(function (h, i) { h.id = "sec-" + (i + 1); });
    if (h2s.length >= 3) {
      var toc = document.createElement("nav");
      toc.className = "doc-toc";
      toc.setAttribute("aria-label", "이 문서의 차례");
      // 제목에 이미 「1.」 번호가 있으면 목록 번호를 또 붙이지 않는다(「1. 1. …」 방지).
      var numbered = Array.prototype.some.call(h2s, function (h) { return /^\d+\.\s/.test(h.textContent); });
      toc.innerHTML = "<h2>이 문서의 차례</h2><ol" + (numbered ? ' class="plain"' : "") + ">" + Array.prototype.map.call(h2s, function (h, i) {
        return '<li><a href="#sec-' + (i + 1) + '">' + MD.escapeHtml(h.textContent) + "</a></li>";
      }).join("") + "</ol>";
      head.after(toc);
    }

    var foot = document.createElement("footer");
    foot.className = "doc-foot";
    foot.textContent = "원문 " + currentSrc + " · 이 문서의 내용이 바뀌면 원문이 기준입니다.";
    root.appendChild(foot);
  }

  function wireTools() {
    var msg = document.getElementById("tool-msg");
    function say(t) { msg.textContent = t; setTimeout(function () { msg.textContent = ""; }, 2500); }
    document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
    document.getElementById("btn-copy").addEventListener("click", function () {
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { say("링크를 복사했습니다"); },
          function () { say("복사하지 못했습니다. 주소창의 주소를 복사해 주세요"); });
      } else {
        say("복사하지 못했습니다. 주소창의 주소를 복사해 주세요");
      }
    });
  }
  wireTools();

  // Footer links that walk the reading order, so a first-time reader can go
  // through every document in sequence without returning to the hub each time.
  function renderPrevNext(currentSrc) {
    var index = -1;
    SEQUENCE.forEach(function (item, i) { if (item.path === currentSrc) index = i; });
    if (index < 0) return;

    var prev = index > 0 ? SEQUENCE[index - 1] : null;
    var next = index < SEQUENCE.length - 1 ? SEQUENCE[index + 1] : null;

    var nav = document.createElement("nav");
    nav.className = "prev-next";
    nav.innerHTML =
      (prev
        ? '<a class="prev" href="doc.html?src=' + encodeURIComponent(prev.path) + '">' +
          '<span class="label">이전</span>' + MD.escapeHtml(prev.label) + "</a>"
        : "<span></span>") +
      '<span class="progress">' + (index + 1) + " / " + SEQUENCE.length + "</span>" +
      (next
        ? '<a class="next" href="doc.html?src=' + encodeURIComponent(next.path) + '">' +
          '<span class="label">다음</span>' + MD.escapeHtml(next.label) + "</a>"
        : "<span></span>");

    document.querySelector(".article-wrap").appendChild(nav);
  }

})();
