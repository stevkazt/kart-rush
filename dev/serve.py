"""LAN dev server for testing on the phone: like `python3 -m http.server`, but tells the browser never to
cache, so a relaunch of the home-screen app always loads the current files. Also takes the game's race
telemetry (POST /telemetry, sent at the end of each race) and appends it to dev/telemetry/races.jsonl.
    python3 dev/serve.py [port=8000]   (run from kart-racer/)"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'telemetry')


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        if self.path != '/telemetry':
            self.send_error(404)
            return
        body = self.rfile.read(min(int(self.headers.get('Content-Length', 0)), 2_000_000))
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(os.path.join(LOG_DIR, 'races.jsonl'), 'ab') as f:
            f.write(body.replace(b'\n', b' ') + b'\n')
        self.send_response(204)
        self.end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f'Serving on 0.0.0.0:{port} (no-store, telemetry -> dev/telemetry/races.jsonl)')
ThreadingHTTPServer(('0.0.0.0', port), NoCache).serve_forever()
