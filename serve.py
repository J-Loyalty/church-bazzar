import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# 서빙할 폴더는 "명령을 실행한 위치"가 아니라 이 파일이 있는 폴더(저장소 뿌리)로 고정한다.
# 실행 위치를 따르면 탐색기에서 더블클릭하거나 다른 폴더에서 실행했을 때
# 엉뚱한 폴더(예: C:\Windows\System32)가 서빙되어 모든 페이지가 404가 된다.
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if str(path).endswith(".md"):
            return "text/plain; charset=utf-8"
        ctype = super().guess_type(path)
        if isinstance(ctype, str) and ctype.startswith("text/") and "charset" not in ctype:
            return ctype + "; charset=utf-8"
        return ctype


# ThreadingHTTPServer, not a plain TCPServer: a single-threaded server handles one
# connection at a time, so a browser's idle keep-alive socket blocks every later
# request. doc.html then fails its fetch() of the .md file with "Failed to fetch".
handler = functools.partial(Handler, directory=ROOT)
with http.server.ThreadingHTTPServer(("", PORT), handler) as httpd:
    print(f"Serving {ROOT} at http://localhost:{PORT}")
    httpd.serve_forever()
