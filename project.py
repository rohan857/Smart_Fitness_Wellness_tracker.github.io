"""Launch the Fitness & Wellness assignment as a small local web app.

Run this file with Python. It serves the project and shared assets locally,
opens the dashboard in the default browser, and stops cleanly with Ctrl+C.
Only Python's standard library is used.
"""

from __future__ import annotations

import contextlib
import socket
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
SERVER_ROOT = PROJECT_DIR
START_PAGE = "/index.html"


class QuietRequestHandler(SimpleHTTPRequestHandler):
    """Serve the assignment files without noisy request logs."""

    def log_message(self, format: str, *args: object) -> None:
        return


def available_port(preferred: int = 8000) -> int:
    """Use port 8000 when available, otherwise ask Windows for a free port."""

    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as probe:
        try:
            probe.bind(("127.0.0.1", preferred))
        except OSError:
            probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def main() -> None:
    port = available_port()
    handler = partial(QuietRequestHandler, directory=str(SERVER_ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}{START_PAGE}"

    print(f"AR Move activity tracker: {url}")
    print("Press Ctrl+C to stop the app.")
    threading.Timer(0.35, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
