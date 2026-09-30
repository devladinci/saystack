#!/usr/bin/env python3
"""Serves the voice lab on http://localhost:5178 with caching off, so a reload always picks up edits."""

import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".m4a": "audio/mp4", ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
handler = functools.partial(NoCache, directory=os.path.dirname(os.path.abspath(__file__)))
print(f"Voice lab: http://localhost:{port}")
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
