"""Flask routes for the PADRE web application."""
from flask import Blueprint, render_template, request, jsonify, current_app, send_file
from datetime import datetime
import uuid
import os
import json
from app.models import Simulation, SimulationStore, DevicePreset, SimulationStatus
from app.simulation_runner import SimulationRunner

try:
    from nanohubpadre.parser import IVFileParser
    _IV_PARSER_AVAILABLE = True
except ImportError:
    _IV_PARSER_AVAILABLE = False

try:
    from nanohubpadre.plot3d import parse_plot3d_file
    _PLOT3D_AVAILABLE = True
except ImportError:
    _PLOT3D_AVAILABLE = False

# Create blueprints
main_bp = Blueprint('main', __name__)
api_bp = Blueprint('api', __name__, url_prefix='/api')
devices_bp = Blueprint('devices', __name__, url_prefix='/api/devices')
simulation_bp = Blueprint('simulation', __name__, url_prefix='/api/simulation')
results_bp = Blueprint('results', __name__, url_prefix='/api/results')
builder_bp = Blueprint('builder', __name__, url_prefix='/api/builder')

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


@main_bp.route('/builder')
def builder_page():
    """Serve the advanced simulation builder page."""
    return render_template('builder.html')


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


@devices_bp.route('/schematic/<device_type>')
def get_device_schematic(device_type):
    """Get SVG schematic for a device with current parameter values."""
    try:
        from nanohubpadre.devices.schematics import device_schematic

        # Collect numeric/string params from query string
        params = {}
        for k, v in request.args.items():
            if k == 'interactive':
                continue
            try:
                params[k] = float(v)
            except (ValueError, TypeError):
                params[k] = v

        interactive = request.args.get('interactive', 'true').lower() in ('true', '1', 'yes')
        schematic = device_schematic(device_type, interactive=interactive, **params)
        return jsonify({'success': True, 'svg': str(schematic)}), 200

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


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


@simulation_bp.route('/rerun/<sim_id>', methods=['POST'])
def rerun_simulation(sim_id):
    """Reset a completed/failed simulation and run it again."""
    try:
        store = get_simulation_store()
        sim = store.get(sim_id)

        if not sim:
            return jsonify({'success': False, 'error': 'Simulation not found'}), 404

        if sim.status == SimulationStatus.RUNNING:
            return jsonify({'success': False, 'error': 'Simulation is already running'}), 400

        # Reset state fully so the simulation runs fresh
        store.update(
            sim_id,
            status=SimulationStatus.PENDING,
            progress=0.0,
            started_at=None,
            completed_at=None,
            error_message=None,
            deck_content=None,
            output_files=[],
        )

        # Create output directory (clear old outputs)
        output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
        if os.path.exists(output_dir):
            import shutil
            shutil.rmtree(output_dir)
        os.makedirs(output_dir, exist_ok=True)

        # Update status to running
        store.update(sim_id, status=SimulationStatus.RUNNING, started_at=datetime.now(), progress=0.0)

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
            'message': 'Simulation restarted',
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

        try:
            return send_file(filepath, as_attachment=True, download_name=filename)
        except TypeError:
            # Flask < 2.0 uses attachment_filename instead of download_name
            return send_file(filepath, as_attachment=True, attachment_filename=filename)

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

        # Add debug info
        data['debug'] = {
            'filepath': filepath,
            'file_exists': os.path.exists(filepath),
            'file_size': os.path.getsize(filepath) if os.path.exists(filepath) else 0,
            'values_count': len(data.get('values', [])),
            'raw_length': len(data.get('raw', ''))
        }

        return jsonify({
            'success': True,
            'filename': filename,
            'data': data
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _parse_padre_output_file(filepath, filename):
    """Parse a PADRE output file.

    Uses manual parsing that matches the format expected by nanohubpadre library.
    PADRE ASCII files have:
    - Comment lines starting with # or $ or !
    - Data lines with space-separated numeric values
    """
    import logging
    logger = logging.getLogger(__name__)

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

        # Log first few lines for debugging
        first_lines = content[:500] if len(content) > 500 else content
        logger.info(f"Parsing file {filename}, first content: {repr(first_lines[:200])}")

        # Always use manual parsing (works regardless of library availability)
        # This matches the format used by nanohubpadre library
        lines = content.strip().split('\n')
        name_lower = filename.lower()
        name_base = name_lower.replace('.txt', '').replace('.dat', '').replace('.out', '').replace('.log', '')

        # Use pattern matching for file type
        # PADRE uses naming conventions like: vbeq, cbeq, cbfwd, vbfwd, qfnfwd, qfpfwd, mesh, iv
        if name_base == 'iv' or name_base.endswith('_iv') or name_base.startswith('iv_') or 'iv' in name_base:
            data['type'] = 'iv'
            data['variable'] = 'iv'
            data = _parse_iv_file(lines, data)
        elif name_base == 'cv' or name_base.endswith('_cv') or name_base.startswith('cv_') or 'cv' in name_base:
            data['type'] = 'cv'
            data['variable'] = 'cv'
            data = _parse_iv_file(lines, data)
        elif name_base.startswith('vb') or name_base.startswith('vband') or name_base.startswith('ev') or name_base.startswith('valence'):
            # Valence band: vbeq, vbfwd, vband, ev, valence
            data['type'] = 'band'
            data['variable'] = 'band_val'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base.startswith('cb') or name_base.startswith('cband') or name_base.startswith('ec') or name_base.startswith('conduction'):
            # Conduction band: cbeq, cbfwd, cband, ec, conduction
            data['type'] = 'band'
            data['variable'] = 'band_con'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base.startswith('qfn') or name_base.startswith('efn'):
            # Electron quasi-Fermi level
            data['type'] = 'qf'
            data['variable'] = 'qfn'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base.startswith('qfp') or name_base.startswith('efp'):
            # Hole quasi-Fermi level
            data['type'] = 'qf'
            data['variable'] = 'qfp'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Energy (eV)']
        elif name_base.startswith('ele') or 'electron' in name_base:
            # Electron concentration
            data['type'] = 'carrier'
            data['variable'] = 'electrons'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Concentration (/cm³)']
        elif name_base.startswith('hole'):
            # Hole concentration
            data['type'] = 'carrier'
            data['variable'] = 'holes'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Concentration (/cm³)']
        elif name_base.startswith('pot') or name_base.startswith('phi') or name_base.startswith('psi'):
            # Electrostatic potential
            data['type'] = 'field'
            data['variable'] = 'potential'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Potential (V)']
        elif name_base.startswith('dop') or 'doping' in name_base:
            # Doping profile
            data['type'] = 'field'
            data['variable'] = 'doping'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Concentration (/cm³)']
        elif 'field' in name_base or name_base.startswith('efield'):
            # Electric field
            data['type'] = 'field'
            data['variable'] = 'e_field'
            data = _parse_1d_plot_file(lines, data)
            data['columns'] = ['Position (μm)', 'Field (V/cm)']
        elif name_base == 'mesh' or name_base.endswith('.pg') or 'mesh' in name_base:
            data['type'] = 'mesh'
            data['variable'] = 'mesh'
            data = _parse_mesh_file(lines, data)
        elif _is_plot3d_file(name_base, content):
            # 2D contour (Plot3D scatter format): pot_eq, el_bias, hh_eq, ef_eq, dop_eq, etc.
            data = _parse_contour_file(filepath, name_base, data)
        elif name_base in ['eq', 'fwd', 'rev'] or name_base.endswith('_eq') or name_base.endswith('_fwd'):
            data['type'] = 'solution'
            data['variable'] = 'solution'
            data['values'] = []
        elif 'deck' in name_base or 'input' in name_base:
            data['type'] = 'deck'
            data['variable'] = 'deck'
            data['values'] = []
        else:
            # Try generic 1D plot parsing for any other file
            data = _parse_1d_plot_file(lines, data)
            if data['values'] and len(data['values']) > 0:
                data['type'] = '1d'
                data['variable'] = _determine_variable(name_base) or 'unknown'

    except Exception as e:
        data['error'] = str(e)

    return data


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


def _parse_iv_file(lines, data):
    """Parse PADRE I-V log file using the library parser."""
    content = '\n'.join(lines)

    if _IV_PARSER_AVAILABLE:
        try:
            parser = IVFileParser()
            iv_data = parser.parse(content)
            if iv_data.bias_points:
                # Build rows: [V_electrode1, I_electrode1, V_electrode2, I_electrode2, ...]
                # Use electrode 1 voltage as x-axis, all electrode currents as series
                num_elec = iv_data.num_electrodes or 1
                rows = []
                columns = []
                for e in range(1, num_elec + 1):
                    voltages = iv_data.get_voltages(e)
                    currents = iv_data.get_currents(e, 'total')
                    if e == 1:
                        # First electrode: use its voltage as x-axis
                        for i, (v, c) in enumerate(zip(voltages, currents)):
                            rows.append([float(v), float(c)])
                        columns = ['Voltage (V)', f'I_elec{e} (A)']
                    else:
                        # Additional electrodes: append current column
                        currents_list = list(currents)
                        for i in range(min(len(rows), len(currents_list))):
                            rows[i].append(float(currents_list[i]))
                        columns.append(f'I_elec{e} (A)')
                data['values'] = rows
                data['columns'] = columns
                data['num_electrodes'] = num_elec
                return data
        except Exception:
            pass  # Fall through to simple parser

    # Fallback: simple two-column parser (for non-PADRE IV files)
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


# Plot3D quantity naming convention: quantity_bias, e.g. pot_eq, el_bias, hh_eq
_PLOT3D_QUANTITY_PREFIXES = ('pot', 'el', 'hh', 'ef', 'qfn', 'qfp', 'dop', 'nc', 'pc')
_PLOT3D_BIAS_SUFFIXES = ('_eq', '_bias', '_fwd', '_rev')

def _is_plot3d_file(name_base, content):
    """Detect if a file is a PADRE Plot3D scatter file."""
    # Name-based detection: quantity_bias pattern
    for prefix in _PLOT3D_QUANTITY_PREFIXES:
        for suffix in _PLOT3D_BIAS_SUFFIXES:
            if name_base == prefix + suffix:
                return True
    # Content-based detection: Plot3D scatter files start with 'begin scatter'
    if content.lstrip().startswith('begin scatter'):
        return True
    return False


def _parse_contour_file(filepath, name_base, data):
    """Parse a PADRE Plot3D scatter file into a 2D contour dataset."""
    # Determine quantity variable from filename
    quantity_map = {
        'pot': ('potential', 'Potential (V)'),
        'el':  ('electrons', 'Electrons (/cm³)'),
        'hh':  ('holes',     'Holes (/cm³)'),
        'ef':  ('e_field',   'Electric Field (V/cm)'),
        'qfn': ('qfn',       'Electron Quasi-Fermi (eV)'),
        'qfp': ('qfp',       'Hole Quasi-Fermi (eV)'),
        'dop': ('doping',    'Doping (/cm³)'),
    }
    variable = 'contour'
    colorbar_label = 'Value'
    for prefix, (var, label) in quantity_map.items():
        if name_base.startswith(prefix):
            variable = var
            colorbar_label = label
            break

    data['type'] = 'contour'
    data['variable'] = variable
    data['colorbar_label'] = colorbar_label

    if not _PLOT3D_AVAILABLE:
        data['error'] = 'plot3d parser not available'
        return data

    try:
        plot3d = parse_plot3d_file(filepath)
        if plot3d.num_nodes == 0:
            data['error'] = 'No data parsed from Plot3D file'
            return data

        # Convert cm → µm for display
        x_um = (plot3d.x * 1e4).tolist()
        y_um = (plot3d.y * 1e4).tolist()
        vals = plot3d.values.tolist()

        data['x'] = x_um
        data['y'] = y_um
        data['z'] = vals
        data['label'] = plot3d.label or colorbar_label
        data['num_nodes'] = plot3d.num_nodes
        data['columns'] = ['X (µm)', 'Y (µm)', colorbar_label]
        # values kept empty — front-end uses x/y/z directly for contour
        data['values'] = []
    except Exception as e:
        data['error'] = str(e)

    return data


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


# ============= BUILDER API ROUTES =============

@builder_bp.route('/generate-deck', methods=['POST'])
def builder_generate_deck():
    """Generate a PADRE deck from a builder canvas state."""
    try:
        from app.simulation_runner import PADRE_AVAILABLE
        if not PADRE_AVAILABLE:
            return jsonify({'success': False, 'error': 'nanohubpadre not available'}), 500

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        deck = _build_deck_from_state(data)
        return jsonify({'success': True, 'deck': deck}), 200

    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@builder_bp.route('/run', methods=['POST'])
def builder_run():
    """Run a simulation built from the canvas state."""
    try:
        from app.simulation_runner import PADRE_AVAILABLE, SimulationRunner
        if not PADRE_AVAILABLE:
            return jsonify({'success': False, 'error': 'nanohubpadre not available'}), 500

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        name  = data.get('name', 'Custom Simulation')
        deck  = data.get('deck')   # pre-built deck string (upload case)
        state = data.get('state')  # canvas state JSON (builder case)

        sim_id = str(uuid.uuid4())[:8]
        store  = get_simulation_store()

        sim = Simulation(
            sim_id=sim_id,
            name=name,
            device_type='custom',
            parameters={'builder_state': state or {}}
        )
        store.add(sim)

        output_dir = os.path.join(current_app.config['OUTPUTS_FOLDER'], sim_id)
        os.makedirs(output_dir, exist_ok=True)
        store.update(sim_id, status=SimulationStatus.RUNNING, started_at=datetime.now(), progress=0.0)

        runner = _BuilderSimulationRunner(
            simulation_id=sim_id,
            state=state or {},
            output_dir=output_dir,
            progress_callback=lambda prog, msg: _on_simulation_progress(sim_id, prog, msg),
            prebuilt_deck=deck,      # pass the raw deck text if provided
        )
        _running_simulations[sim_id] = runner
        runner.start()

        return jsonify({'success': True, 'simulation_id': sim_id}), 201

    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


def _build_deck_from_state(state):
    """Convert a builder canvas JSON state to a PADRE deck string."""
    from nanohubpadre.simulation import Simulation as PadreSimulation
    from nanohubpadre.mesh import Mesh
    from nanohubpadre.region import Region
    from nanohubpadre.doping import Doping
    from nanohubpadre.electrode import Electrode
    from nanohubpadre.contact import Contact
    from nanohubpadre.models import Models
    from nanohubpadre.solver import Solve
    from nanohubpadre.log import Log

    sim = PadreSimulation(title="Custom Simulation")

    # ── Mesh ──────────────────────────────────────────────
    mesh_data = state.get('mesh', {})
    nx = int(mesh_data.get('nx', 50))
    ny = int(mesh_data.get('ny', 50))
    xmin = float(mesh_data.get('xmin', 0.0))
    xmax = float(mesh_data.get('xmax', 1.0))
    ymin = float(mesh_data.get('ymin', 0.0))
    ymax = float(mesh_data.get('ymax', 1.0))

    mesh = Mesh(nx=nx, ny=ny, outfile='mesh.pg')
    mesh.add_x_mesh(1, xmin)
    mesh.add_x_mesh(nx, xmax)
    mesh.add_y_mesh(1, ymin)
    mesh.add_y_mesh(ny, ymax)
    sim.mesh = mesh

    # ── Models ────────────────────────────────────────────
    models_data = state.get('models', {})
    temperature = float(models_data.get('temperature', 300)) if models_data else 300.0
    srh = bool(models_data.get('srh', True)) if models_data else True
    auger = bool(models_data.get('auger', False)) if models_data else False
    conmob = bool(models_data.get('conmob', True)) if models_data else True
    fldmob = bool(models_data.get('fldmob', True)) if models_data else True
    sim.models = Models.drift_diffusion(temperature=temperature, srh=srh,
                                        auger=auger, conmob=conmob, fldmob=fldmob)

    # ── Regions ───────────────────────────────────────────
    region_num = 1
    for region_data in state.get('regions', []):
        material = region_data.get('material', 'silicon')
        mat_kwargs = {}
        if material in ('silicon', 'gaas', 'germanium', 'oxide'):
            mat_kwargs[material] = True
        reg = Region(
            number=region_num,
            x_min=float(region_data.get('x1', xmin)),
            x_max=float(region_data.get('x2', xmax)),
            y_min=float(region_data.get('y1', ymin)),
            y_max=float(region_data.get('y2', ymax)),
            **mat_kwargs
        )
        sim.add_region(reg)
        region_num += 1

    # ── Dopings ───────────────────────────────────────────
    for doping_data in state.get('dopings', []):
        species = doping_data.get('species', 'boron')
        conc = float(doping_data.get('concentration', 1e17))
        profile = doping_data.get('doping_type', 'uniform')
        is_p = species in ('boron',)

        if profile == 'gaussian':
            peak_conc = float(doping_data.get('peak', conc * 10))
            junction = float(doping_data.get('char_length', 0.1))
            dop = (Doping.gaussian_p if is_p else Doping.gaussian_n)(
                concentration=conc, junction=junction, peak=peak_conc)
        else:
            dop = (Doping.uniform_p if is_p else Doping.uniform_n)(concentration=conc)
        sim.add_doping(dop)

    # ── Electrodes ────────────────────────────────────────
    elec_num = 1
    for elec_data in state.get('electrodes', []):
        position = elec_data.get('position', 'top')
        x1 = float(elec_data.get('x1', xmin))
        x2 = float(elec_data.get('x2', xmax))
        # Map x coordinates to ix grid indices
        ix_low = max(1, round((x1 - xmin) / (xmax - xmin) * (nx - 1)) + 1)
        ix_high = min(nx, round((x2 - xmin) / (xmax - xmin) * (nx - 1)) + 1)
        if position in ('top', 'bottom'):
            iy = 1 if position == 'top' else ny
            elec = Electrode(number=elec_num, ix_low=ix_low, ix_high=ix_high,
                             iy_low=iy, iy_high=iy)
        else:
            ix = 1 if position == 'left' else nx
            elec = Electrode(number=elec_num, ix_low=ix, ix_high=ix,
                             iy_low=1, iy_high=ny)
        sim.add_electrode(elec)
        elec_num += 1

    # ── Contacts ──────────────────────────────────────────
    contacts = state.get('contacts', [])
    if contacts:
        for contact_data in contacts:
            contact_type = contact_data.get('contact_type', 'ohmic')
            if contact_type == 'schottky':
                try:
                    elec_ref = int(contact_data.get('electrode', 1))
                except (ValueError, TypeError):
                    elec_ref = 1
                wf = float(contact_data.get('workfunction', 4.1))
                sim.add_contact(Contact.schottky(number=elec_ref, workfunction=wf))
            else:
                # ohmic: apply to specific electrode or all
                elec_ref = contact_data.get('electrode')
                if elec_ref is not None:
                    try:
                        elec_ref = int(elec_ref)
                    except (ValueError, TypeError):
                        elec_ref = None
                if elec_ref is not None:
                    sim.add_contact(Contact.ohmic(number=elec_ref))
                else:
                    sim.add_contact(Contact.ohmic(all_contacts=True))
    else:
        sim.add_contact(Contact.ohmic(all_contacts=True))

    # ── Solves ────────────────────────────────────────────
    n_solves = 0
    for i, solve_data in enumerate(state.get('solves', [])):
        solve_type = solve_data.get('solve_type', '')
        if solve_data.get('initial') or solve_type == 'equilibrium':
            sim.add_solve(Solve.equilibrium(outfile=solve_data.get('outfile', 'sol_eq')))
            n_solves += 1
        elif solve_type == 'bias_sweep':
            elec_num_int = int(solve_data.get('electrode', 1))
            start = float(solve_data.get('start', 0.0))
            stop = float(solve_data.get('stop', 1.0))
            step = float(solve_data.get('step', 0.1))
            sim.add_solve(Solve.bias_sweep(
                electrode=elec_num_int,
                start=start, stop=stop, step=step,
                outfile=solve_data.get('outfile', f'sol_{i}'),
                project=(n_solves >= 2)))
            n_solves += 1
        elif solve_data.get('biases'):
            biases = solve_data['biases']
            for elec_key, bias_val in biases.items():
                try:
                    elec_num_int = int(elec_key)
                except (ValueError, TypeError):
                    elec_num_int = 1
                bval = float(bias_val)
                step = bval / 5 if bval != 0 else 0.1
                sim.add_solve(Solve.bias_sweep(
                    electrode=elec_num_int,
                    start=0.0, stop=bval, step=step,
                    outfile=f'sol_{i}', project=(n_solves >= 2)))
                n_solves += 1
        else:
            sim.add_solve(Solve.equilibrium(outfile=f'sol_{i}'))
            n_solves += 1

    # ── Logs ──────────────────────────────────────────────
    # Log block generates I-V data or 1D physical quantity plots
    for log_data in state.get('logs', []):
        quantities = log_data.get('quantities', ['potential'])
        if isinstance(quantities, str):
            quantities = quantities.split()
        filename = log_data.get('filename', 'output')

        # IV log (default)
        if 'iv' in quantities or not quantities:
            sim.add_log(Log(ivfile=filename + '.log'))
        else:
            # Physical quantity plotting via Plot1D
            from nanohubpadre.plotting import Plot1D
            quantity_flags = {}
            for q in quantities:
                q = q.lower()
                if q in ('potential', 'electrons', 'holes', 'doping', 'e_field',
                          'qfn', 'qfp', 'band_val', 'band_con', 'recomb'):
                    quantity_flags[q] = True
            if quantity_flags:
                sim.add_log(Plot1D(outfile=filename, ascii=True, **quantity_flags))

    # Add IV log if solves include bias sweeps and no log is configured
    if not state.get('logs'):
        sim.add_log(Log(ivfile='iv.log'))

    return sim.generate_deck()


class _BuilderSimulationRunner:
    """Thin runner for builder-created simulations."""

    def __init__(self, simulation_id, state, output_dir, progress_callback=None, prebuilt_deck=None):
        self.simulation_id = simulation_id
        self.state = state
        self.output_dir = output_dir
        self.progress_callback = progress_callback
        self.prebuilt_deck = prebuilt_deck   # raw deck string from upload, or None
        self.thread = None
        self.is_running = False
        self.error = None
        self.output_files = []
        self.deck_content = ""

    def start(self):
        import threading
        self.is_running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _update_progress(self, progress, message=""):
        if self.progress_callback:
            self.progress_callback(progress, message)

    def _run(self):
        import traceback
        try:
            self._update_progress(5, "Initializing builder simulation...")
            if self.prebuilt_deck:
                deck = self.prebuilt_deck
                self._update_progress(25, "Using uploaded deck")
            else:
                deck = _build_deck_from_state(self.state)
                self._update_progress(25, "Deck generated")
            self.deck_content = deck

            deck_file = os.path.join(self.output_dir, "padre_input.deck")
            with open(deck_file, 'w') as f:
                f.write(deck)
            self.output_files.append(deck_file)

            self._update_progress(30, "Running PADRE simulation...")

            from nanohubpadre import Simulation as PadreSimulation
            import tempfile
            # Write deck to temp dir and run
            tmp = tempfile.mkdtemp()
            tmp_deck = os.path.join(tmp, "input.deck")
            with open(tmp_deck, 'w') as f:
                f.write(deck)

            import subprocess
            result = subprocess.run(
                ['padre', tmp_deck],
                cwd=self.output_dir,
                capture_output=True,
                text=True
            )
            self._update_progress(90, "Collecting outputs...")
            if result.returncode != 0:
                raise RuntimeError(f"PADRE failed (code {result.returncode}): {result.stderr or result.stdout}")

            for fn in os.listdir(self.output_dir):
                fp = os.path.join(self.output_dir, fn)
                if os.path.isfile(fp) and fp not in self.output_files:
                    self.output_files.append(fp)

            self._update_progress(100, "Completed")
        except Exception as e:
            self.error = f"{e}\n{traceback.format_exc()}"
            self._update_progress(100, f"Error: {e}")
        finally:
            self.is_running = False


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
