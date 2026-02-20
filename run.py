#!/usr/bin/env python3
"""
PADRE Web Application - Main Entry Point

This is the main entry point for the PADRE web application.
Run this file to start the Flask development server.

Usage:
    python run.py [--base-path /prefix]

Options:
    --base-path   URL prefix for running behind a proxy (e.g., /padre)
                  Can also be set via APPLICATION_ROOT environment variable
"""

import argparse
import os
import sys

# Add parent directory to path so nanohubpadre can be found when running
# from padre_web/ without installing the package.
_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from app import create_app

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='PADRE Web Application')
    parser.add_argument('--base-path', type=str, default=None,
                        help='URL prefix for running behind a proxy (e.g., /padre)')
    parser.add_argument('--port', type=int, default=None,
                        help='Port to run the server on (default: 8001)')
    parser.add_argument('--debug', action='store_true', default=None,
                        help='Enable debug mode')
    parser.add_argument('--no-debug', action='store_true',
                        help='Disable debug mode')
    args = parser.parse_args()

    # Get configuration from args or environment
    path = os.environ.get('APPLICATION_ROOT', '')
    if "SESSIONDIR" in os.environ:
        sessiondir = os.environ["SESSIONDIR"]
        fn = os.path.join(sessiondir, "resources")
        with open(fn, "r") as f:
            res = f.read()
        hub_url = sessionid = app_name = token = cookie = cookieport = None
        for line in res.split("\n"):
            if line.startswith("hub_url"):
                hub_url = line.split()[1]
            elif line.startswith("sessionid"):
                sessionid = int(line.split()[1])
            elif line.startswith("application_name"):
                app_name = line.split(" ", 1)[1]
            elif line.startswith("session_token"):
                token = line.split()[1]
            elif line.startswith("filexfer_cookie"):
                cookie = line.split()[1]
            elif line.startswith("filexfer_port"):
                cookieport = line.split()[1]
        path = (
            "/weber/"
            + str(sessionid)
            + "/"
            + cookie
            + "/"
            + str(int(cookieport) % 1000)
            + "/"
        )

    base_path = args.base_path or path
    port = args.port or int(os.environ.get('PORT', 8001))

    # Build nanoHUB support/terminate URLs when running on nanoHUB
    nanohub_terminate_url = None
    nanohub_support_url = None
    if "SESSIONDIR" in os.environ and hub_url and app_name:
        app_name_clean = app_name.strip()
        hub = hub_url.rstrip('/')
        nanohub_terminate_url = f"{hub}/tools/{app_name_clean}/stop?sess={sessionid}"
        nanohub_support_url = f"{hub}/feedback/report_problems?group=app-{app_name_clean}"

    if args.no_debug:
        debug = False
    elif args.debug:
        debug = True
    else:
        debug = os.environ.get('DEBUG', 'True') == 'True'

    app = create_app(base_path=base_path,
                     nanohub_terminate_url=nanohub_terminate_url,
                     nanohub_support_url=nanohub_support_url)

    base_path_display = base_path if base_path else '(none)'
    print(f"""
    ╔══════════════════════════════════════════════════════════════╗
    ║                   PADRE Web Application                      ║
    ║                                                              ║
    ║  Server running at: http://localhost:{port}                    ║
    ║  Base path: {base_path_display.ljust(46)}║
    ║  Debug mode: {str(debug).ljust(44)}║
    ║                                                              ║
    ║  Press CTRL+C to stop the server                            ║
    ╚══════════════════════════════════════════════════════════════╝
    """)

    app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=True)
