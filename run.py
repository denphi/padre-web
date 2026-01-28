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
    base_path = args.base_path or os.environ.get('APPLICATION_ROOT', '')
    port = args.port or int(os.environ.get('PORT', 8001))

    if args.no_debug:
        debug = False
    elif args.debug:
        debug = True
    else:
        debug = os.environ.get('DEBUG', 'True') == 'True'

    app = create_app(base_path=base_path)

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
