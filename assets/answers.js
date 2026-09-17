(function () {
  "use strict";

  var PW_KEY = "cbz_answers_pw";
  var NAME_KEY = "cbz_answers_name";

  var url = (window.ANSWERS_URL || "").trim();
  var form = document.getElementById("form");
  var msg = document.getElementById("msg");

  if (!url) {
    document.getElementById("setup-warning").hidden = false;
    form.querySelectorAll("input, select, textarea, button").forEach(function (el) { el.disabled = true; });
    document.getElementById("btn-load").disabled = true;
  }

  // The document dropdown follows the reading order, so the labels match what
  // people see in the sidebar.
  (function fillDocs() {
    var sel = document.getElementById("f-doc");
    sel.innerHTML = '<option value="">— 문서를 고르세요 (모르면 비워두세요) —</option>' +
      window.SEQUENCE.map(function (item) {
        return '<option value="' + item.label + '">' + item.label + "</option>";
      }).join("");
  })();

  // Remembering the name and the shared password keeps repeat submissions short;
  // both stay in this browser only.
  document.getElementById("f-password").value = CBZ.loadText(PW_KEY);
  document.getElementById("f-name").value = CBZ.loadText(NAME_KEY);

  function remember() {
    CBZ.saveText(PW_KEY, document.getElementById("f-password").value);
    CBZ.saveText(NAME_KEY, document.getElementById("f-name").value);
  }

  // Apps Script never receives a CORS preflight, so the body goes as text/plain
  // even though it is JSON.
  function send(payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (body) {
        try {
          return JSON.parse(body);
        } catch (e) {
          // A wrong address, or a deployment that was never updated, answers with
          // an HTML page. The parse error itself means nothing to a volunteer.
          var head = body.slice(0, 200).replace(/\s+/g, " ");
          if (/accounts\.google\.com|Sign in|로그인/i.test(head)) {
            throw new Error("구글 로그인 화면이 돌아왔습니다. Apps Script 배포의 「액세스 권한」을 " +
              "「모든 사용자」로 바꿔 주세요 (배포 → 배포 관리 → 수정).");
          }
          throw new Error("저장하는 곳에서 예상과 다른 응답이 왔습니다. 연결 주소가 맞는지 확인해 주세요. 받은 내용: " + head);
        }
      });
    }, function () {
      throw new Error("저장하는 곳에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    });
  }

  function setMsg(text, kind) {
    msg.textContent = text;
    msg.className = "msg" + (kind ? " " + kind : "");
  }

  // Apps Script can take twenty seconds or more to answer the first request after
  // a while idle. Without a word, "보내는 중…" reads as a frozen page.
  var slowTimer = null;
  function startWaiting(text) {
    setMsg("보내는 중…");
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function () {
      setMsg(text);
    }, 6000);
  }
  function stopWaiting() { clearTimeout(slowTimer); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var payload = {
      action: "save",
      password: document.getElementById("f-password").value,
      name: document.getElementById("f-name").value,
      doc: document.getElementById("f-doc").value,
      item: document.getElementById("f-item").value,
      answer: document.getElementById("f-answer").value
    };
    if (!payload.name || !payload.item || !payload.answer) {
      setMsg("이름, 항목, 내용을 모두 적어주세요.", "err");
      return;
    }

    document.getElementById("btn-save").disabled = true;
    startWaiting("보내는 중… 처음 보낼 때는 20초쯤 걸릴 수 있습니다. 그대로 기다려 주세요.");

    send(payload).then(function (r) {
      stopWaiting();
      document.getElementById("btn-save").disabled = false;
      if (!r.ok) { setMsg(r.error || "저장하지 못했습니다.", "err"); return; }
      remember();
      setMsg("보냈습니다. 고맙습니다.", "ok");
      document.getElementById("f-item").value = "";
      document.getElementById("f-answer").value = "";
      renderAnswers(r.rows);
    }).catch(function (err) {
      stopWaiting();
      document.getElementById("btn-save").disabled = false;
      setMsg("보내지 못했습니다: " + err.message, "err");
    });
  });

  document.getElementById("btn-load").addEventListener("click", function () {
    var pw = document.getElementById("f-password").value;
    if (!pw) { setMsg("공유 암호를 먼저 넣어주세요.", "err"); return; }
    document.getElementById("list-lead").textContent = "불러오는 중… 처음에는 20초쯤 걸릴 수 있습니다.";
    send({ action: "list", password: pw }).then(function (r) {
      if (!r.ok) { document.getElementById("list-lead").textContent = r.error || "불러오지 못했습니다."; return; }
      remember();
      document.getElementById("list-lead").textContent =
        r.rows.length ? "모두 " + r.rows.length + "건입니다. 최근에 보낸 것이 위에 있습니다." : "";
      renderAnswers(r.rows);
    }).catch(function (err) {
      document.getElementById("list-lead").textContent = "불러오지 못했습니다: " + err.message;
    });
  });

  function renderAnswers(rows) {
    var box = document.getElementById("answers");
    if (!rows || !rows.length) {
      box.innerHTML = '<p class="empty">아직 들어온 내용이 없습니다.</p>';
      return;
    }
    box.innerHTML = rows.map(function (r) {
      return '<div class="answer">' +
        '<p class="meta"><strong>' + esc(r.name) + "</strong>" +
        (r.doc ? " · " + esc(r.doc) : "") +
        (r.at ? " · " + esc(r.at) : "") + "</p>" +
        '<p class="item">' + esc(r.item) + "</p>" +
        '<p class="body">' + esc(r.answer).replace(/\n/g, "<br>") + "</p>" +
        "</div>";
    }).join("");
  }
})();
