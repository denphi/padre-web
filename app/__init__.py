"""Flask application factory for PADRE Web UI."""
from flask import Flask, redirect
from flask_cors import CORS
import logging
from logging.handlers import RotatingFileHandler
import os


def create_app(config=None, base_path=None):
    """Create and configure the Flask application.

    Args:
        config: Optional configuration dictionary
        base_path: Optional URL prefix for running behind a proxy (e.g., '/padre')
    """
    app = Flask(__name__)

    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
    app.config['SIMULATIONS_FOLDER'] = os.path.join(os.path.dirname(__file__), 'simulations')
    app.config['OUTPUTS_FOLDER'] = os.path.join(os.path.dirname(__file__), 'outputs')

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
    
    # Register blueprints with base path prefix
    from app.routes import main_bp, api_bp, devices_bp, simulation_bp, results_bp
    url_prefix = app.config['APPLICATION_ROOT'] or None
    app.register_blueprint(main_bp, url_prefix=url_prefix)
    app.register_blueprint(api_bp, url_prefix=f"{app.config['APPLICATION_ROOT']}/api" if app.config['APPLICATION_ROOT'] else None)
    app.register_blueprint(devices_bp, url_prefix=f"{app.config['APPLICATION_ROOT']}/api/devices" if app.config['APPLICATION_ROOT'] else None)
    app.register_blueprint(simulation_bp, url_prefix=f"{app.config['APPLICATION_ROOT']}/api/simulation" if app.config['APPLICATION_ROOT'] else None)
    app.register_blueprint(results_bp, url_prefix=f"{app.config['APPLICATION_ROOT']}/api/results" if app.config['APPLICATION_ROOT'] else None)

    # Make base_path available in templates
    @app.context_processor
    def inject_base_path():
        return {'base_path': app.config['APPLICATION_ROOT']}

    # Add redirect from root "/" to base path if base_path is set
    if app.config['APPLICATION_ROOT']:
        @app.route('/')
        def root_redirect():
            return redirect(app.config['APPLICATION_ROOT'] + '/')

    return app


def setup_logging(app):
    """Configure logging for the application."""
    if not app.debug and not app.testing:
        if not os.path.exists('logs'):
            os.mkdir('logs')
        file_handler = RotatingFileHandler('logs/padre_web.log',
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
