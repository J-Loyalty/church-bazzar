import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if str(path).endswith(".md"):
            return "text/plain; charset=utf-8"
        ctype = super().guess_type(path)
        if isinstance(ctype, str) and ctype.startswith("text/") and "charset" not in ctype:
            return ctype + "; charset=utf-8"
        return ctype


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


with ReusableTCPServer(("", PORT), Handler) as httpd:
    print(f"Serving {sys.path[0] or '.'} at http://localhost:{PORT}")
    httpd.serve_forever()
