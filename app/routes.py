"""Flask routes for the PADRE web application."""
from flask import Blueprint, render_template, request, jsonify, current_app, send_file
from datetime import datetime
import uuid
import os
import json
from app.models import Simulation, SimulationStore, DevicePreset, SimulationStatus
from app.simulation_runner import SimulationRunner

# Create blueprints
main_bp = Blueprint('main', __name__)
api_bp = Blueprint('api', __name__, url_prefix='/api')
devices_bp = Blueprint('devices', __name__, url_prefix='/api/devices')
simulation_bp = Blueprint('simulation', __name__, url_prefix='/api/simulation')
results_bp = Blueprint('results', __name__, url_prefix='/api/results')

# Global store
_simulation_store = None
_running_simulations = {}


def get_simulation_store():
    """Get or create the simulation store."""
    global _simulation_store
    if _simulation_store is None:
        sim_dir = os.path.join(current_app.config['SIMULATIONS_FOLDER'], 'metadata')
        _simulation_store = SimulationStore(sim_dir)
    return _simulation_store


# ============= MAIN ROUTES =============

@main_bp.route('/')
def index():
    """Serve the main dashboard page."""
    return render_template('index.html')


@main_bp.route('/devices')
def devices_page():
    """Serve the devices configuration page."""
    return render_template('devices.html')


@main_bp.route('/simulation/<sim_id>')
def simulation_detail(sim_id):
    """Serve the simulation detail page."""
    return render_template('simulation_detail.html', sim_id=sim_id)


@main_bp.route('/results/<sim_id>')
def results_page(sim_id):
    """Serve the results visualization page."""
    return render_template('results.html', sim_id=sim_id)


# ============= DEVICE API ROUTES =============

@devices_bp.route('/presets')
def list_presets():
    """Get list of available device presets."""
    try:
        presets = DevicePreset.list_presets()
        return jsonify({
            'success': True,
            'presets': presets
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@devices_bp.route('/presets/<device_type>')
def get_preset(device_type):
    """Get preset configuration for a device type."""
    try:
        preset = DevicePreset.get_preset(device_type)
        if not preset:
            return jsonify({
                'success': False,
                'error': f'Unknown device type: {device_type}'
            }), 404
        return jsonify({
            'success': True,
            'preset': preset
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============= SIMULATION API ROUTES =============

@simulation_bp.route('/create', methods=['POST'])
def create_simulation():
    """Create a new simulation and automatically start it."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        sim_id = str(uuid.uuid4())[:8]
        name = data.get('name', f'Simulation_{sim_id}')
        device_type = data.get('device_type')
        parameters = data.get('parameters', {})
        auto_run = data.get('auto_run', True)  # Auto-run by default

        if not device_type:
            return jsonify({'success': False, 'error': 'device_type is required'}), 400

        # Create simulation object
        sim = Simulation(
            sim_id=sim_id,
            name=name,
            device_type=device_type,
            parameters=parameters
        )

        # Store it
        store = get_simulation_store()
        store.add(sim)

        # Auto-run the simulation if requested
        if auto_run:
            try:
                # Create output directory
                output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
                os.makedirs(output_dir, exist_ok=True)

                # Update status
                store.update(sim_id, status=SimulationStatus.RUNNING, started_at=datetime.now(), progress=0.0)

                # Create and start runner
                runner = SimulationRunner(
                    simulation_id=sim_id,
                    device_type=device_type,
                    parameters=parameters,
                    output_dir=output_dir,
                    progress_callback=lambda prog, msg: _on_simulation_progress(sim_id, prog, msg)
                )

                _running_simulations[sim_id] = runner
                runner.start()

                # Get updated simulation
                sim = store.get(sim_id)
            except Exception as run_error:
                # If auto-run fails, still return success for creation
                print(f"Auto-run failed: {run_error}")

        return jsonify({
            'success': True,
            'simulation': sim.to_dict(),
            'auto_started': auto_run
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@simulation_bp.route('/run/<sim_id>', methods=['POST'])
def run_simulation(sim_id):
    """Run a simulation."""
    try:
        store = get_simulation_store()
        sim = store.get(sim_id)
        
        if not sim:
            return jsonify({'success': False, 'error': 'Simulation not found'}), 404
        
        if sim.status in (SimulationStatus.RUNNING, SimulationStatus.COMPLETED):
            return jsonify({
                'success': False,
                'error': 'Simulation is already running or completed'
            }), 400
        
        # Create output directory
        output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
        os.makedirs(output_dir, exist_ok=True)
        
        # Update status
        store.update(sim_id, status=SimulationStatus.RUNNING, started_at=datetime.now(), progress=0.0)
        
        # Create and start runner
        runner = SimulationRunner(
            simulation_id=sim_id,
            device_type=sim.device_type,
            parameters=sim.parameters,
            output_dir=output_dir,
            progress_callback=lambda prog, msg: _on_simulation_progress(sim_id, prog, msg)
        )
        
        _running_simulations[sim_id] = runner
        runner.start()
        
        return jsonify({
            'success': True,
            'message': 'Simulation started',
            'simulation': store.get(sim_id).to_dict()
        }), 202
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@simulation_bp.route('/<sim_id>')
def get_simulation(sim_id):
    """Get simulation details."""
    try:
        store = get_simulation_store()
        sim = store.get(sim_id)
        
        if not sim:
            return jsonify({'success': False, 'error': 'Simulation not found'}), 404
        
        return jsonify({
            'success': True,
            'simulation': sim.to_dict()
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@simulation_bp.route('/list')
def list_simulations():
    """Get list of all simulations."""
    try:
        store = get_simulation_store()
        simulations = [sim.to_dict() for sim in store.list_all()]
        
        return jsonify({
            'success': True,
            'simulations': simulations
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@simulation_bp.route('/<sim_id>', methods=['DELETE'])
def delete_simulation(sim_id):
    """Delete a simulation."""
    try:
        store = get_simulation_store()
        
        if store.delete(sim_id):
            # Clean up output directory
            output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
            if os.path.exists(output_dir):
                import shutil
                shutil.rmtree(output_dir)
            
            return jsonify({'success': True}), 200
        else:
            return jsonify({'success': False, 'error': 'Simulation not found'}), 404
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@simulation_bp.route('/<sim_id>/status')
def get_simulation_status(sim_id):
    """Get current simulation status."""
    try:
        store = get_simulation_store()
        sim = store.get(sim_id)
        
        if not sim:
            return jsonify({'success': False, 'error': 'Simulation not found'}), 404
        
        return jsonify({
            'success': True,
            'status': sim.status.value,
            'progress': sim.progress,
            'error': sim.error_message
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@simulation_bp.route('/<sim_id>/deck')
def get_simulation_deck(sim_id):
    """Get the PADRE input deck for a simulation."""
    try:
        store = get_simulation_store()
        sim = store.get(sim_id)

        if not sim:
            return jsonify({'success': False, 'error': 'Simulation not found'}), 404

        if not sim.deck_content:
            return jsonify({'success': False, 'error': 'Deck not generated yet'}), 400

        return jsonify({
            'success': True,
            'deck': sim.deck_content,
            'device_type': sim.device_type,
            'name': sim.name
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@simulation_bp.route('/preview-deck', methods=['POST'])
def preview_deck():
    """Generate a preview of the PADRE input deck without creating a simulation."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        device_type = data.get('device_type')
        parameters = data.get('parameters', {})

        # Debug logging
        import logging
        logging.info(f"Preview deck - device_type: {device_type}")
        logging.info(f"Preview deck - parameters: {parameters}")

        if not device_type:
            return jsonify({'success': False, 'error': 'device_type is required'}), 400

        # Generate deck preview using the simulation runner logic
        from app.simulation_runner import SimulationRunner, PADRE_AVAILABLE

        if not PADRE_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'PADRE library not available for deck generation'
            }), 500

        # Create a temporary runner just to generate the deck
        import tempfile
        temp_dir = tempfile.mkdtemp()
        runner = SimulationRunner(
            simulation_id='preview',
            device_type=device_type,
            parameters=parameters,
            output_dir=temp_dir
        )

        # Generate the deck
        sim = runner._create_device_simulation()
        deck_content = sim.generate_deck()

        return jsonify({
            'success': True,
            'deck': deck_content,
            'device_type': device_type
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============= RESULTS API ROUTES =============

@results_bp.route('/<sim_id>')
def get_results(sim_id):
    """Get simulation results."""
    try:
        store = get_simulation_store()
        sim = store.get(sim_id)
        
        if not sim:
            return jsonify({'success': False, 'error': 'Simulation not found'}), 404
        
        if sim.status != SimulationStatus.COMPLETED:
            return jsonify({'success': False, 'error': 'Simulation not completed'}), 400
        
        return jsonify({
            'success': True,
            'results': sim.results,
            'output_files': sim.output_files
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@results_bp.route('/<sim_id>/outputs')
def list_output_files(sim_id):
    """List output files for a simulation."""
    try:
        output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
        
        if not os.path.exists(output_dir):
            return jsonify({'success': True, 'files': []}), 200
        
        files = []
        for filename in os.listdir(output_dir):
            filepath = os.path.join(output_dir, filename)
            if os.path.isfile(filepath):
                size = os.path.getsize(filepath)
                files.append({
                    'name': filename,
                    'size': size,
                    'path': filepath
                })
        
        return jsonify({'success': True, 'files': files}), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@results_bp.route('/<sim_id>/download/<filename>')
def download_output_file(sim_id, filename):
    """Download an output file."""
    try:
        output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
        filepath = os.path.join(output_dir, filename)

        # Security check: ensure filepath is within output_dir
        if not os.path.abspath(filepath).startswith(os.path.abspath(output_dir)):
            return jsonify({'success': False, 'error': 'Invalid file path'}), 400

        if not os.path.exists(filepath):
            return jsonify({'success': False, 'error': 'File not found'}), 404

        return send_file(filepath, as_attachment=True, download_name=filename)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@results_bp.route('/<sim_id>/file/<filename>')
def get_file_content(sim_id, filename):
    """Get parsed content of an output file for visualization."""
    try:
        output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
        filepath = os.path.join(output_dir, filename)

        # Security check
        if not os.path.abspath(filepath).startswith(os.path.abspath(output_dir)):
            return jsonify({'success': False, 'error': 'Invalid file path'}), 400

        if not os.path.exists(filepath):
            return jsonify({'success': False, 'error': 'File not found'}), 404

        # Parse the file based on its type
        data = _parse_padre_output_file(filepath, filename)

        return jsonify({
            'success': True,
            'filename': filename,
            'data': data
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _parse_padre_output_file(filepath, filename):
    """Parse a PADRE output file using the nanohubpadre library."""
    data = {
        'type': 'unknown',
        'columns': [],
        'values': [],
        'raw': '',
        'variable': ''
    }

    try:
        # Read raw content for display
        with open(filepath, 'r', errors='replace') as f:
            content = f.read()
            data['raw'] = content

        # Try to use nanohubpadre library for parsing
        try:
            from app.simulation_runner import PADRE_AVAILABLE
            if PADRE_AVAILABLE:
                from nanohubpadre import OutputManager, OutputType, OutputEntry
                from nanohubpadre.outputs import PlotData
                import numpy as np

                # Get the output directory and filename
                output_dir = os.path.dirname(filepath)
                name_base = os.path.splitext(filename)[0]

                # Create an OutputManager for this directory
                output_mgr = OutputManager(working_dir=output_dir)

                # Determine output type based on filename patterns
                output_type = _determine_output_type(name_base)
                variable = _determine_variable(name_base)

                # Register this output
                output_mgr.register(name_base, output_type, variable=variable)

                # Load the data
                output_mgr.load_all()

                # Get the parsed data
                parsed_data = output_mgr.get(name_base)

                if parsed_data is not None:
                    if isinstance(parsed_data, PlotData):
                        # Convert PlotData to our format
                        data['type'] = _output_type_to_string(output_type)
                        data['variable'] = parsed_data.variable or variable
                        data['columns'] = [parsed_data.x_label, parsed_data.y_label or parsed_data.variable]
                        # Convert numpy arrays to list of [x, y] pairs
                        data['values'] = [[float(x), float(y)] for x, y in zip(parsed_data.x, parsed_data.y)]
                        return data
                    elif hasattr(parsed_data, 'voltage') and hasattr(parsed_data, 'current'):
                        # IVData object
                        data['type'] = 'iv'
                        data['variable'] = 'iv'
                        data['columns'] = ['Voltage (V)', 'Current (A)']
                        data['values'] = [[float(v), float(i)] for v, i in zip(parsed_data.voltage, parsed_data.current)]
                        return data
        except Exception as lib_error:
            # Fall back to manual parsing
            print(f"Library parsing failed: {lib_error}, falling back to manual parsing")
            pass

        # Fallback: Manual parsing
        lines = content.strip().split('\n')
        name_lower = filename.lower()
        name_base = name_lower.replace('.txt', '').replace('.dat', '').replace('.out', '').replace('.log', '')

        # Use pattern matching for file type
        if name_base == 'iv' or name_base.endswith('_iv') or name_base.startswith('iv_'):
            data['type'] = 'iv'
            data['variable'] = 'iv'
            data = _parse_iv_file(lines, data)
        elif name_base == 'cv' or name_base.endswith('_cv') or name_base.startswith('cv_'):
            data['type'] = 'cv'
            data['variable'] = 'cv'
            data = _parse_iv_file(lines, data)
        elif name_base.startswith('vb') or name_base.startswith('valence'):
            data['type'] = 'band'
            data['variable'] = 'band_val'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base.startswith('cb') or name_base.startswith('conduction'):
            data['type'] = 'band'
            data['variable'] = 'band_con'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base.startswith('qfn') or name_base.startswith('efn'):
            data['type'] = 'qf'
            data['variable'] = 'qfn'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base.startswith('qfp') or name_base.startswith('efp'):
            data['type'] = 'qf'
            data['variable'] = 'qfp'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base == 'mesh' or name_base.endswith('.pg'):
            data['type'] = 'mesh'
            data['variable'] = 'mesh'
            data = _parse_mesh_file(lines, data)
        elif name_base in ['eq', 'fwd', 'rev'] or name_base.endswith('_eq') or name_base.endswith('_fwd'):
            data['type'] = 'solution'
            data['variable'] = 'solution'
            data['values'] = []
        elif 'deck' in name_base or 'input' in name_base:
            data['type'] = 'deck'
            data['variable'] = 'deck'
            data['values'] = []
        else:
            # Try generic 1D plot parsing
            data = _parse_1d_plot_file(lines, data)
            if data['values'] and len(data['values']) > 0:
                data['type'] = '1d'
                data['variable'] = 'unknown'

    except Exception as e:
        data['error'] = str(e)

    return data


def _determine_output_type(name_base):
    """Determine OutputType from filename."""
    from nanohubpadre import OutputType

    name_lower = name_base.lower()

    if name_lower == 'iv' or 'iv' in name_lower:
        return OutputType.IV_DATA
    elif name_lower == 'mesh' or name_lower.endswith('.pg'):
        return OutputType.MESH
    elif name_lower in ['eq', 'fwd', 'rev'] or any(name_lower.endswith(s) for s in ['_eq', '_fwd', '_rev']):
        return OutputType.SOLUTION
    else:
        return OutputType.PLOT_1D


def _determine_variable(name_base):
    """Determine variable name from filename."""
    name_lower = name_base.lower()

    if name_lower.startswith('vb') or 'valence' in name_lower:
        return 'band_val'
    elif name_lower.startswith('cb') or 'conduction' in name_lower:
        return 'band_con'
    elif name_lower.startswith('qfn') or name_lower.startswith('efn'):
        return 'qfn'
    elif name_lower.startswith('qfp') or name_lower.startswith('efp'):
        return 'qfp'
    elif name_lower.startswith('ele') or 'electron' in name_lower:
        return 'electrons'
    elif name_lower.startswith('hole'):
        return 'holes'
    elif name_lower.startswith('pot') or name_lower.startswith('phi'):
        return 'potential'
    elif 'field' in name_lower:
        return 'e_field'
    elif 'dop' in name_lower:
        return 'doping'
    else:
        return ''


def _output_type_to_string(output_type):
    """Convert OutputType enum to string for frontend."""
    from nanohubpadre import OutputType

    mapping = {
        OutputType.IV_DATA: 'iv',
        OutputType.MESH: 'mesh',
        OutputType.SOLUTION: 'solution',
        OutputType.PLOT_1D: '1d',
        OutputType.PLOT_2D: '2d',
    }
    return mapping.get(output_type, 'unknown')


def _parse_iv_file(lines, data):
    """Parse I-V characteristic file."""
    values = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('!'):
            continue
        parts = line.split()
        if len(parts) >= 2:
            try:
                row = [float(p) for p in parts]
                values.append(row)
            except ValueError:
                continue

    if values:
        data['values'] = values
        # Assume columns: voltage, current (and possibly more)
        if len(values[0]) >= 2:
            data['columns'] = ['Voltage (V)', 'Current (A)']
            if len(values[0]) > 2:
                data['columns'].extend([f'Column {i+1}' for i in range(2, len(values[0]))])

    return data


def _parse_1d_plot_file(lines, data):
    """Parse 1D plot data file (band diagrams, etc.).

    PADRE ASCII plot files have the format:
    - Lines starting with # or $ are comments/headers
    - Data lines have space-separated x y values
    """
    values = []
    for line in lines:
        line = line.strip()
        # Skip empty lines and comments (# or $ or !)
        if not line or line.startswith('#') or line.startswith('!') or line.startswith('$'):
            continue
        parts = line.split()
        if len(parts) >= 2:
            try:
                row = [float(p) for p in parts]
                values.append(row)
            except ValueError:
                continue

    if values:
        data['values'] = values
        data['columns'] = ['Position (μm)', 'Value']
        if len(values[0]) > 2:
            data['columns'] = ['Position (μm)'] + [f'Value {i}' for i in range(1, len(values[0]))]

    return data


# Alias for backward compatibility
_parse_1d_data_file = _parse_1d_plot_file


def _parse_mesh_file(lines, data):
    """Parse mesh file."""
    values = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('!'):
            continue
        parts = line.split()
        if len(parts) >= 2:
            try:
                row = [float(p) for p in parts]
                values.append(row)
            except ValueError:
                continue

    if values:
        data['values'] = values
        data['columns'] = ['X (um)', 'Y (um)']

    return data


# ============= HELPER FUNCTIONS =============

def _on_simulation_progress(sim_id: str, progress: float, message: str):
    """Callback for simulation progress updates."""
    try:
        store = get_simulation_store()
        runner = _running_simulations.get(sim_id)
        
        if progress >= 100:
            # Simulation completed
            if runner and runner.error:
                store.update(
                    sim_id,
                    status=SimulationStatus.FAILED,
                    error_message=runner.error,
                    progress=100.0,
                    completed_at=datetime.now(),
                    deck_content=runner.deck_content
                )
            else:
                output_files = runner.output_files if runner else []
                store.update(
                    sim_id,
                    status=SimulationStatus.COMPLETED,
                    progress=100.0,
                    completed_at=datetime.now(),
                    output_files=output_files,
                    deck_content=runner.deck_content if runner else None
                )
            if sim_id in _running_simulations:
                del _running_simulations[sim_id]
        else:
            # Update progress
            store.update(sim_id, progress=progress)
    
    except Exception as e:
        print(f"Error updating simulation progress: {e}")
