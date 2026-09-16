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
        renderPrevNext(path);
      })
      .catch(function (err) {
        content.innerHTML = '<p class="doc-error">문서를 불러오지 못했습니다: ' + MD.escapeHtml(err.message) + "</p>" +
          '<p class="hint">경로: ' + MD.escapeHtml(path) + "</p>";
      });
  }

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
