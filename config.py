"""
PADRE Web Application Configuration and Initialization
======================================================

This module provides initialization and configuration utilities for the PADRE Web Application.
"""

import os
import sys
from pathlib import Path


def setup_directories(base_path: str = None) -> dict:
    """
    Create and verify all necessary directories for the application.
    
    Parameters
    ----------
    base_path : str, optional
        Base path for the application. If None, uses current working directory.
    
    Returns
    -------
    dict
        Dictionary containing paths to all necessary directories.
    """
    if base_path is None:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    directories = {
        'root': base_path,
        'app': os.path.join(base_path, 'app'),
        'uploads': os.path.join(base_path, 'app', 'uploads'),
        'simulations': os.path.join(base_path, 'app', 'simulations'),
        'outputs': os.path.join(base_path, 'app', 'outputs'),
        'logs': os.path.join(base_path, 'logs'),
        'templates': os.path.join(base_path, 'app', 'templates'),
        'static': os.path.join(base_path, 'app', 'static'),
    }
    
    # Create all directories
    for dir_path in directories.values():
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    return directories


def check_dependencies() -> bool:
    """
    Check if all required dependencies are installed.
    
    Returns
    -------
    bool
        True if all dependencies are available, False otherwise.
    """
    required = {
        'flask': 'Flask',
        'flask_cors': 'Flask-CORS',
    }
    
    optional = {
        'nanohubpadre': 'nanohub-padre (required for simulation execution)',
    }
    
    missing_required = []
    missing_optional = []
    
    print("Checking dependencies...\n")
    
    for module, name in required.items():
        try:
            __import__(module)
            print(f"✓ {name}")
        except ImportError:
            print(f"✗ {name} - MISSING (required)")
            missing_required.append(name)
    
    print()
    
    for module, name in optional.items():
        try:
            __import__(module)
            print(f"✓ {name}")
        except ImportError:
            print(f"⚠ {name} - MISSING (optional but recommended)")
            missing_optional.append(name)
    
    if missing_required:
        print(f"\n❌ Missing required packages. Install with:")
        print(f"   pip install {' '.join([p.split()[0] for p in missing_required])}")
        return False
    
    if missing_optional:
        print(f"\n⚠️  Optional packages not installed. For full functionality:")
        print(f"   pip install {' '.join([p.split()[0] for p in missing_optional])}")
    
    return True


def create_app_config() -> dict:
    """
    Create default application configuration.
    
    Returns
    -------
    dict
        Application configuration dictionary.
    """
    dirs = setup_directories()
    
    config = {
        'DEBUG': os.environ.get('DEBUG', 'True') == 'True',
        'TESTING': False,
        'SECRET_KEY': os.environ.get('SECRET_KEY', 'padre-dev-key-change-in-production'),
        'MAX_CONTENT_LENGTH': 16 * 1024 * 1024,  # 16MB
        'JSON_SORT_KEYS': False,
        
        # Directories
        'UPLOAD_FOLDER': dirs['uploads'],
        'SIMULATIONS_FOLDER': dirs['simulations'],
        'OUTPUTS_FOLDER': dirs['outputs'],
        'LOGS_FOLDER': dirs['logs'],
        
        # PADRE Configuration
        'PADRE_EXECUTABLE': os.environ.get('PADRE_EXECUTABLE', 'padre'),
        'PADRE_TIMEOUT': int(os.environ.get('PADRE_TIMEOUT', '3600')),
        
        # Server Configuration
        'HOST': os.environ.get('HOST', '0.0.0.0'),
        'PORT': int(os.environ.get('PORT', '8001')),
        'THREADED': True,
        'USE_RELOADER': True,
    }
    
    return config


if __name__ == '__main__':
    print("\n" + "="*60)
    print("PADRE Web Application - Initialization & Verification")
    print("="*60 + "\n")
    
    # Setup directories
    dirs = setup_directories()
    print("✓ Directory structure created/verified\n")
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Create config
    config = create_app_config()
    print("\n✓ Application configuration created\n")
    
    print("="*60)
    print("Setup complete! You can now run the application with:")
    print("  python run.py")
    print("="*60 + "\n")
