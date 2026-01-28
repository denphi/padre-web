"""Flask application factory for PADRE Web UI."""
from flask import Flask
from flask_cors import CORS
import logging
from logging.handlers import RotatingFileHandler
import os


def create_app(config=None):
    """Create and configure the Flask application."""
    app = Flask(__name__)
    
    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
    app.config['SIMULATIONS_FOLDER'] = os.path.join(os.path.dirname(__file__), 'simulations')
    app.config['OUTPUTS_FOLDER'] = os.path.join(os.path.dirname(__file__), 'outputs')
    
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
    from app.routes import main_bp, api_bp, devices_bp, simulation_bp, results_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(simulation_bp)
    app.register_blueprint(results_bp)
    
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
