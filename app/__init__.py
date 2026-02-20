"""Flask application factory for PADRE Web UI."""
from flask import Flask, redirect
from flask_cors import CORS
import logging
from logging.handlers import RotatingFileHandler
import os
import sys
import uuid

# Single token generated once per process — busts browser cache on every restart
_STATIC_VERSION = uuid.uuid4().hex[:8]

# Ensure the repo root (containing nanohubpadre package) is on the path
# so the library is importable regardless of working directory.
# __file__ is  <repo>/padre_web/app/__init__.py
#   dirname once  → <repo>/padre_web/app/
#   dirname twice → <repo>/padre_web/
#   dirname three → <repo>/              ← this is where nanohubpadre/ lives
_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if os.path.isdir(os.path.join(_repo_root, 'nanohubpadre')) and _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)


def create_app(config=None, base_path=None, nanohub_terminate_url=None, nanohub_support_url=None):
    """Create and configure the Flask application.

    Args:
        config: Optional configuration dictionary
        base_path: Optional URL prefix for running behind a proxy (e.g., '/padre')
        nanohub_terminate_url: Optional nanoHUB URL to terminate the session
        nanohub_support_url: Optional nanoHUB URL to submit a support request
    """
    app = Flask(__name__)

    # Configuration — all runtime data goes under RESULTSDIR (nanoHUB) or cwd (local)
    resultsdir = os.environ.get("RESULTSDIR") or os.getcwd()
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
    app.config['UPLOAD_FOLDER'] = os.path.join(resultsdir, 'uploads')
    app.config['SIMULATIONS_FOLDER'] = os.path.join(resultsdir, 'simulations')
    app.config['OUTPUTS_FOLDER'] = os.path.join(resultsdir, 'outputs')

    # Handle base path for proxy deployment
    base_path = base_path or os.environ.get('APPLICATION_ROOT', '')
    if base_path:
        # Ensure base_path starts with / and doesn't end with /
        base_path = '/' + base_path.strip('/')
        app.config['APPLICATION_ROOT'] = base_path
    else:
        app.config['APPLICATION_ROOT'] = ''
    
    # Create necessary folders
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['SIMULATIONS_FOLDER'], exist_ok=True)
    os.makedirs(app.config['OUTPUTS_FOLDER'], exist_ok=True)
    
    if config:
        app.config.update(config)
    
    # Enable CORS
    CORS(app)
    
    # Setup logging
    setup_logging(app)
    
    # Register blueprints
    # Note: When behind a proxy, the proxy strips the base path, so the app
    # always sees requests at "/". The base_path is only used for generating
    # correct URLs in templates and JavaScript for links/redirects.
    from app.routes import main_bp, api_bp, devices_bp, simulation_bp, results_bp, builder_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(simulation_bp)
    app.register_blueprint(results_bp)
    app.register_blueprint(builder_bp)

    # Store the version token on the app for use in url_for overrides
    app.config['STATIC_VERSION'] = _STATIC_VERSION

    # Store nanoHUB URLs in app config
    app.config['NANOHUB_TERMINATE_URL'] = nanohub_terminate_url
    app.config['NANOHUB_SUPPORT_URL'] = nanohub_support_url

    # Make base_path and static_version available in templates
    @app.context_processor
    def inject_globals():
        return {
            'base_path': app.config['APPLICATION_ROOT'],
            'static_version': _STATIC_VERSION,
            'nanohub_terminate_url': app.config['NANOHUB_TERMINATE_URL'],
            'nanohub_support_url': app.config['NANOHUB_SUPPORT_URL'],
        }

    # Override url_for('static', ...) to append the version token
    original_url_for = app.jinja_env.globals['url_for']

    def versioned_url_for(endpoint, **values):
        url = original_url_for(endpoint, **values)
        if endpoint == 'static':
            url = f"{url}?v={_STATIC_VERSION}"
        return url

    app.jinja_env.globals['url_for'] = versioned_url_for

    return app


def setup_logging(app):
    """Configure logging for the application."""
    if not app.debug and not app.testing:
        logs_dir = os.path.join(os.environ.get("RESULTSDIR") or os.getcwd(), 'logs')
        os.makedirs(logs_dir, exist_ok=True)
        file_handler = RotatingFileHandler(os.path.join(logs_dir, 'padre_web.log'),
                                          maxBytes=10240000,
                                          backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s '
            '[in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('PADRE Web Application startup')
