"""Launch the Fitness & Wellness assignment as a small local web app.

Run this file with Python. It serves the project and shared assets locally,
opens the dashboard in the default browser, and stops cleanly with Ctrl+C.
Only Python's standard library is used.
"""

from __future__ import annotations

import argparse
import socket
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
SERVER_ROOT = PROJECT_DIR
START_PAGE = "/dashboard.html"


class QuietRequestHandler(SimpleHTTPRequestHandler):
    """Serve the assignment files without noisy request logs."""

    def log_message(self, format: str, *args: object) -> None:
        return


class LocalHTTPServer(ThreadingHTTPServer):
    """Keep Windows from silently sharing a port with another running server."""

    allow_reuse_address = False

    def server_bind(self) -> None:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run AR Move locally.")
    parser.add_argument("--port", type=int, default=8000, help="Local port (default: 8000). Keep the same port to keep the same browser records.")
    parser.add_argument("--no-browser", action="store_true", help="Start the server without opening a browser.")
    options = parser.parse_args()
    if not 1 <= options.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    port = options.port
    handler = partial(QuietRequestHandler, directory=str(SERVER_ROOT))
    try:
        server = LocalHTTPServer(("127.0.0.1", port), handler)
    except OSError as error:
        parser.exit(1, f"Could not open port {port}: {error}\nClose the other server, or choose --port 8001. A different port uses different browser storage.\n")
    url = f"http://127.0.0.1:{port}{START_PAGE}"

    print(f"AR Move activity tracker: {url}")
    print("Press Ctrl+C to stop the app.")
    if not options.no_browser:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
