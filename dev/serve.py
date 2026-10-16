"""LAN dev server for testing on the phone: like `python3 -m http.server`, but tells the browser never to
cache, so a relaunch of the home-screen app always loads the current files.
    python3 dev/serve.py [port=8000]   (run from kart-racer/)"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f'Serving on 0.0.0.0:{port} (no-store)')
ThreadingHTTPServer(('0.0.0.0', port), NoCache).serve_forever()
