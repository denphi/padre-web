#!/usr/bin/env python3
"""
PADRE Web Application - Main Entry Point

This is the main entry point for the PADRE web application.
Run this file to start the Flask development server.

Usage:
    python run.py
"""

import os
import sys
from app import create_app

if __name__ == '__main__':
    app = create_app()
    
    # Get port from environment or use default
    port = int(os.environ.get('PORT', 8001))
    debug = os.environ.get('DEBUG', 'True') == 'True'
    
    print(f"""
    ╔══════════════════════════════════════════════════════════════╗
    ║                   PADRE Web Application                      ║
    ║                                                              ║
    ║  Server running at: http://localhost:{port}                    ║
    ║  Debug mode: {str(debug).ljust(44)}║
    ║                                                              ║
    ║  Press CTRL+C to stop the server                            ║
    ╚══════════════════════════════════════════════════════════════╝
    """)
    
    app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=True)
