// Minimal Markdown renderer shared by the document viewer (doc.html) and the
// print sheet (print.html): headings, paragraphs, lists incl. checkboxes,
// tables, blockquotes as callouts, hr, bold/code/strike/links.
//
// Deliberately small. It only has to handle the Markdown this repository's docs
// actually use -- there is no build step here and no room for a real parser.
(function (global) {
  "use strict";

    // ---- Minimal Markdown renderer (headings, paragraphs, lists incl. checkboxes,
    // tables, blockquotes as callouts, hr, bold/code/strike/links) ----

    function renderMarkdown(md, baseDir) {
      var lines = md.replace(/\r\n/g, "\n").split("\n");
      var out = [];
      var i = 0;

      while (i < lines.length) {
        var line = lines[i];

        if (/^\s*$/.test(line)) { i++; continue; }

        // Heading
        var headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
        if (headingMatch) {
          var level = headingMatch[1].length;
          out.push("<h" + level + ">" + inline(headingMatch[2], baseDir) + "</h" + level + ">");
          i++;
          continue;
        }

        // Horizontal rule
        if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
          out.push("<hr>");
          i++;
          continue;
        }

        // Table
        if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
          var headerCells = splitTableRow(line);
          i += 2;
          var bodyRows = [];
          while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
            bodyRows.push(splitTableRow(lines[i]));
            i++;
          }
          var table = "<div class=\"table-scroll\"><table class=\"data-table\"><thead><tr>";
          headerCells.forEach(function (c) { table += "<th>" + inline(c, baseDir) + "</th>"; });
          table += "</tr></thead><tbody>";
          bodyRows.forEach(function (row) {
            table += "<tr>";
            row.forEach(function (c) { table += "<td>" + inline(c, baseDir) + "</td>"; });
            table += "</tr>";
          });
          table += "</tbody></table></div>";
          out.push(table);
          continue;
        }

        // Blockquote (rendered as an info callout)
        if (/^>\s?/.test(line)) {
          var quoteLines = [];
          while (i < lines.length && /^>\s?/.test(lines[i])) {
            quoteLines.push(lines[i].replace(/^>\s?/, ""));
            i++;
          }
          out.push('<div class="banner banner-blue">' + inline(quoteLines.join(" "), baseDir) + "</div>");
          continue;
        }

        // Unordered list (with optional checkboxes)
        if (/^[-*]\s+/.test(line)) {
          var ulItems = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
            ulItems.push(lines[i].replace(/^[-*]\s+/, ""));
            i++;
          }
          out.push(renderList(ulItems, false, baseDir));
          continue;
        }

        // Ordered list — the first item's number becomes the list's start, so a
        // sequence split across sections keeps counting instead of resetting to 1.
        if (/^\d+\.\s+/.test(line)) {
          var olItems = [];
          var olStart = parseInt(/^(\d+)\./.exec(line)[1], 10);
          while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
            olItems.push(lines[i].replace(/^\d+\.\s+/, ""));
            i++;
          }
          out.push(renderList(olItems, true, baseDir, olStart));
          continue;
        }

        // Paragraph: consume consecutive plain lines
        var paraLines = [];
        while (
          i < lines.length &&
          !/^\s*$/.test(lines[i]) &&
          !/^#{1,6}\s+/.test(lines[i]) &&
          !/^[-*]\s+/.test(lines[i]) &&
          !/^\d+\.\s+/.test(lines[i]) &&
          !/^>\s?/.test(lines[i]) &&
          !/^\|.*\|\s*$/.test(lines[i]) &&
          !/^-{3,}$/.test(lines[i].trim())
        ) {
          paraLines.push(lines[i]);
          i++;
        }
        if (paraLines.length) {
          out.push("<p>" + inline(paraLines.join(" "), baseDir) + "</p>");
        } else {
          i++;
        }
      }

      return out.join("\n");
    }

    function renderList(items, ordered, baseDir, start) {
      var tag = ordered ? "ol" : "ul";
      var html = "<" + tag + (ordered && start > 1 ? ' start="' + start + '"' : "") + ">";
      items.forEach(function (item) {
        var checkboxMatch = /^\[( |x|X)\]\s+(.*)$/.exec(item);
        if (checkboxMatch) {
          var checked = checkboxMatch[1].toLowerCase() === "x";
          html += '<li class="checkbox-item"><input type="checkbox" disabled' + (checked ? " checked" : "") + "> " +
            inline(checkboxMatch[2], baseDir) + "</li>";
        } else {
          html += "<li>" + inline(item, baseDir) + "</li>";
        }
      });
      html += "</" + tag + ">";
      return html;
    }

    function splitTableRow(row) {
      var trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
      return trimmed.split("|").map(function (c) { return c.trim(); });
    }

    function inline(text, baseDir) {
      var escaped = escapeHtml(text);
      // inline code
      escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
      // bold
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      // strikethrough
      escaped = escaped.replace(/~~([^~]+)~~/g, "<del>$1</del>");
      // links
      escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (match, label, href) {
        var resolved = resolveHref(baseDir, href);
        return '<a href="' + resolved + '">' + label + "</a>";
      });
      return escaped;
    }

    function resolveHref(baseDir, href) {
      if (/^([a-z][a-z0-9+.-]*:)/i.test(href) || href.charAt(0) === "#") {
        return href; // absolute URL, mailto:, or in-page anchor
      }
      var baseParts = baseDir ? baseDir.split("/") : [];
      var parts = href.split("/");
      parts.forEach(function (p) {
        if (p === "" || p === ".") return;
        if (p === "..") baseParts.pop();
        else baseParts.push(p);
      });
      var resolved = baseParts.join("/");
      if (/\.md(#.*)?$/i.test(resolved)) {
        var hashIndex = resolved.indexOf("#");
        var pathPart = hashIndex >= 0 ? resolved.slice(0, hashIndex) : resolved;
        return "doc.html?src=" + pathPart;
      }
      return resolved;
    }

    // 본체는 assets/shared.js에 있다. MD.escapeHtml은 이미 여러 곳에서 쓰고
    // 있으므로 이름은 그대로 두고 그쪽을 부른다.
    function escapeHtml(s) {
      return global.CBZ.esc(s);
    }

  global.MD = { render: renderMarkdown, escapeHtml: escapeHtml };
})(window);
