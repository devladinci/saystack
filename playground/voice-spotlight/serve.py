#!/usr/bin/env python3
"""Serves the voice spotlight on http://localhost:5179 with caching off. It serves the whole repo,
because the page loads saystack's built packages from packages/*/dist."""

import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5179
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
handler = functools.partial(NoCache, directory=root)
print(f"Voice spotlight: http://localhost:{port}/playground/voice-spotlight/")
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
