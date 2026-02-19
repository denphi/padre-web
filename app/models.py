"""Data models and utilities for the PADRE Web UI."""
import json
import os
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, Any, List, Optional


class SimulationStatus(Enum):
    """Enumeration of simulation statuses."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Simulation:
    """Represents a PADRE simulation session."""
    
    def __init__(self, sim_id: str, name: str, device_type: str,
                 parameters: Dict[str, Any], created_at: Optional[datetime] = None):
        self.id = sim_id
        self.name = name
        self.device_type = device_type
        self.parameters = parameters
        self.status = SimulationStatus.PENDING
        self.created_at = created_at or datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.error_message: Optional[str] = None
        self.output_files: List[str] = []
        self.progress: float = 0.0
        self.deck_content: Optional[str] = None
        self.results: Dict[str, Any] = {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'name': self.name,
            'device_type': self.device_type,
            'parameters': self.parameters,
            'status': self.status.value,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message,
            'progress': self.progress,
            'output_files': self.output_files,
            'deck_content': self.deck_content,
        }


class SimulationStore:
    """In-memory storage for simulations with persistence."""
    
    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.simulations: Dict[str, Simulation] = {}
        self._load_simulations()
    
    def add(self, simulation: Simulation) -> None:
        """Add a simulation to the store."""
        self.simulations[simulation.id] = simulation
        self._save_simulation(simulation)
    
    def get(self, sim_id: str) -> Optional[Simulation]:
        """Get a simulation by ID."""
        return self.simulations.get(sim_id)
    
    def update(self, sim_id: str, **kwargs) -> None:
        """Update a simulation's attributes."""
        if sim_id in self.simulations:
            sim = self.simulations[sim_id]
            for key, value in kwargs.items():
                if hasattr(sim, key):
                    setattr(sim, key, value)
            self._save_simulation(sim)
    
    def list_all(self) -> List[Simulation]:
        """Get all simulations sorted by creation date."""
        return sorted(self.simulations.values(),
                     key=lambda s: s.created_at,
                     reverse=True)
    
    def delete(self, sim_id: str) -> bool:
        """Delete a simulation."""
        if sim_id in self.simulations:
            del self.simulations[sim_id]
            json_file = self.storage_dir / f"{sim_id}.json"
            if json_file.exists():
                json_file.unlink()
            return True
        return False
    
    def _save_simulation(self, simulation: Simulation) -> None:
        """Save a simulation to disk."""
        json_file = self.storage_dir / f"{simulation.id}.json"
        data = {
            'id': simulation.id,
            'name': simulation.name,
            'device_type': simulation.device_type,
            'parameters': simulation.parameters,
            'status': simulation.status.value,
            'created_at': simulation.created_at.isoformat(),
            'started_at': simulation.started_at.isoformat() if simulation.started_at else None,
            'completed_at': simulation.completed_at.isoformat() if simulation.completed_at else None,
            'error_message': simulation.error_message,
            'progress': simulation.progress,
            'output_files': simulation.output_files,
            'deck_content': simulation.deck_content,
        }
        with open(json_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def _load_simulations(self) -> None:
        """Load simulations from disk."""
        for json_file in self.storage_dir.glob("*.json"):
            try:
                with open(json_file, 'r') as f:
                    data = json.load(f)
                    sim = Simulation(
                        sim_id=data['id'],
                        name=data['name'],
                        device_type=data['device_type'],
                        parameters=data['parameters'],
                        created_at=datetime.fromisoformat(data['created_at'])
                    )
                    sim.status = SimulationStatus(data['status'])
                    sim.started_at = datetime.fromisoformat(data['started_at']) if data.get('started_at') else None
                    sim.completed_at = datetime.fromisoformat(data['completed_at']) if data.get('completed_at') else None
                    sim.error_message = data.get('error_message')
                    sim.progress = data.get('progress', 0.0)
                    sim.output_files = data.get('output_files', [])
                    sim.deck_content = data.get('deck_content')
                    self.simulations[sim.id] = sim
            except Exception as e:
                print(f"Error loading simulation from {json_file}: {e}")


class DevicePreset:
    """Preset configurations for common devices."""

    # 2D contour quantity choices (subset supported by all device factories)
    CONTOUR_QUANTITIES = ['potential', 'doping', 'electrons', 'holes', 'e_field', 'qfn', 'qfp']

    PRESETS = {
        'pn_diode': {
            'label': 'PN Diode',
            'icon': 'fa-bolt',
            'description': 'Simple P-N junction diode',
            'parameters': {
                'temperature': 300,
                'p_doping': 1e17,
                'n_doping': 1e17,
                'length': 1.0,
                'width': 1.0,
                'junction_position': 0.5,
                'srh': True,
                'conmob': True,
                'fldmob': True,
                'nx': 10,
                'ny': 50,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
                'log_bands_bias': True,
                # 2D contour maps (not supported by pn_diode factory — greyed out in UI)
                'contour_maps': False,
                'contour_potential': True,
                'contour_electrons': True,
                'contour_holes': True,
                'contour_e_field': False,
                'contour_doping': True,
                'contour_qfn': False,
                'contour_qfp': False,
                'contour_v_bias': 0.5,
            },
            'sweep': {
                'forward_sweep_enabled': True,
                'forward_v_start': 0.0,
                'forward_v_end': 0.8,
                'forward_v_step': 0.05,
                'reverse_sweep_enabled': False,
                'reverse_v_start': 0.0,
                'reverse_v_end': -5.0,
                'reverse_v_step': -0.5,
            }
        },
        'pin_diode': {
            'label': 'PiN Diode',
            'icon': 'fa-bolt',
            'description': 'P-intrinsic-N junction diode with lightly-doped intrinsic region',
            'parameters': {
                'temperature': 300,
                'p_doping': 1e18,
                'i_doping': 1e13,
                'n_doping': 1e18,
                'length': 2.0,
                'width': 1.0,
                'p_width': 0.5,
                'i_width': 1.0,
                'n_width': 0.5,
                'srh': True,
                'conmob': True,
                'fldmob': True,
                'nx': 10,
                'ny': 60,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
                'log_bands_bias': True,
                'contour_maps': False,
                'contour_potential': True,
                'contour_electrons': True,
                'contour_holes': True,
                'contour_e_field': False,
                'contour_doping': True,
                'contour_qfn': False,
                'contour_qfp': False,
                'contour_v_bias': 0.5,
            },
            'sweep': {
                'forward_sweep_enabled': True,
                'forward_v_start': 0.0,
                'forward_v_end': 1.0,
                'forward_v_step': 0.05,
                'reverse_sweep_enabled': False,
                'reverse_v_start': 0.0,
                'reverse_v_end': -10.0,
                'reverse_v_step': -0.5,
            }
        },
        'mosfet': {
            'label': 'MOSFET',
            'icon': 'fa-microchip',
            'description': 'Metal-Oxide-Semiconductor Field-Effect Transistor',
            'parameters': {
                'device_type': 'nmos',
                'temperature': 300,
                'channel_length': 0.025,
                'gate_oxide_thickness': 0.012,
                'substrate_doping': 5e16,
                'srh': True,
                'conmob': True,
                'fldmob': True,
                'nx': 45,
                'ny': 45,
            },
            'outputs': {
                'log_iv': True,
                # 2D contour maps — supported by create_mosfet(contour_maps=True)
                'contour_maps': False,
                'contour_potential': True,
                'contour_electrons': True,
                'contour_holes': True,
                'contour_e_field': False,
                'contour_doping': True,
                'contour_qfn': False,
                'contour_qfp': False,
                'contour_vgs_bias': 1.0,
                'contour_vds_bias': 1.0,
            },
            'sweep': {
                'vg_sweep_enabled': True,
                'vg_start': 0.0,
                'vg_end': 1.5,
                'vg_step': 0.1,
                'vd_sweep_enabled': True,
                'vd_start': 0.0,
                'vd_end': 1.5,
                'vd_step': 0.1,
            }
        },
        'mesfet': {
            'label': 'MESFET',
            'icon': 'fa-broadcast-tower',
            'description': 'Metal-Semiconductor Field-Effect Transistor',
            'parameters': {
                'device_type': 'n',
                'temperature': 300,
                'channel_length': 0.2,
                'channel_doping': 1e17,
                'srh': True,
                'conmob': True,
                'fldmob': True,
                'nx': 40,
                'ny': 30,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
                # 2D contour maps — supported by create_mesfet(contour_maps=True)
                'contour_maps': False,
                'contour_potential': True,
                'contour_electrons': True,
                'contour_holes': False,
                'contour_e_field': True,
                'contour_doping': True,
                'contour_qfn': False,
                'contour_qfp': False,
                'contour_vds_bias': 2.0,
            },
            'sweep': {
                'vg_sweep_enabled': True,
                'vg_start': 0.0,
                'vg_end': -1.0,
                'vg_step': -0.1,
                'vd_sweep_enabled': True,
                'vd_start': 0.0,
                'vd_end': 2.0,
                'vd_step': 0.1,
            }
        },
        'mos_capacitor': {
            'label': 'MOS Capacitor',
            'icon': 'fa-layer-group',
            'description': 'Metal-Oxide-Semiconductor Capacitor',
            'parameters': {
                'temperature': 300,
                'substrate_doping': 1e16,
                'oxide_thickness': 0.01,
                'substrate_type': 'p',
                'conmob': True,
                'fldmob': True,
                'nx': 10,
                'ny': 50,
            },
            'outputs': {
                'log_cv': True,
                'log_bands_eq': True,
                # MOS cap factory does not expose contour_maps — disabled
                'contour_maps': False,
                'contour_potential': True,
                'contour_electrons': True,
                'contour_holes': True,
                'contour_e_field': False,
                'contour_doping': False,
                'contour_qfn': False,
                'contour_qfp': False,
                'contour_vgs_bias': 1.0,
            },
            'sweep': {
                'vg_sweep_enabled': True,
                'vg_start': -2.0,
                'vg_end': 2.0,
                'vg_step': 0.1,
            }
        },
        'bjt': {
            'label': 'BJT',
            'icon': 'fa-project-diagram',
            'description': 'Bipolar Junction Transistor',
            'parameters': {
                'device_type': 'npn',
                'temperature': 300,
                'base_width': 0.5,
                'base_doping': 1e18,
                'emitter_doping': 5e19,
                'collector_doping': 1e16,
                'srh': True,
                'conmob': True,
                'nx': 10,
                'ny': 155,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
                # 2D contour maps — supported by create_bjt(contour_maps=True)
                'contour_maps': False,
                'contour_potential': True,
                'contour_electrons': True,
                'contour_holes': True,
                'contour_e_field': False,
                'contour_doping': True,
                'contour_qfn': False,
                'contour_qfp': False,
                'contour_vbe_bias': 0.7,
                'contour_vce_bias': 2.0,
            },
            'sweep': {
                'vbe_sweep_enabled': True,
                'vbe_start': 0.0,
                'vbe_end': 0.8,
                'vbe_step': 0.05,
                'vce_sweep_enabled': False,
                'vce_start': 0.0,
                'vce_end': 5.0,
                'vce_step': 0.5,
            }
        },
        'schottky_diode': {
            'label': 'Schottky Diode',
            'icon': 'fa-circle-notch',
            'description': 'Metal-Semiconductor Junction Diode',
            'parameters': {
                'temperature': 300,
                'n_doping': 1e16,
                'barrier_height': 0.7,
                'length': 1.0,
                'nx': 50,
                'ny': 20,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
                'log_bands_bias': True,
                # Schottky factory does not expose contour_maps — disabled
                'contour_maps': False,
                'contour_potential': True,
                'contour_electrons': True,
                'contour_holes': False,
                'contour_e_field': True,
                'contour_doping': False,
                'contour_qfn': False,
                'contour_qfp': False,
                'contour_v_bias': 0.3,
            },
            'sweep': {
                'forward_sweep_enabled': True,
                'forward_v_start': 0.0,
                'forward_v_end': 0.5,
                'forward_v_step': 0.02,
                'reverse_sweep_enabled': False,
                'reverse_v_start': 0.0,
                'reverse_v_end': -2.0,
                'reverse_v_step': -0.1,
            }
        },
    }

    # Human-readable descriptions for each parameter (used as tooltips in UI)
    PARAM_DESCRIPTIONS = {
        'temperature':         'Lattice temperature in Kelvin (default 300 K = 27 °C)',
        'srh':                 'Enable Shockley-Read-Hall recombination model',
        'auger':               'Enable Auger recombination (important at high doping)',
        'bgn':                 'Enable Band-Gap Narrowing at heavy doping',
        'conmob':              'Enable concentration-dependent carrier mobility model',
        'fldmob':              'Enable field-dependent (velocity saturation) mobility model',
        'newton':              'Use Newton solver instead of Gummel iteration',
        'p_doping':            'P-type (acceptor) doping concentration [cm⁻³]',
        'n_doping':            'N-type (donor) doping concentration [cm⁻³]',
        'junction_position':   'Fractional position of PN junction along the device length (0–1)',
        'length':              'Device length in the x-direction [µm]',
        'width':               'Device depth/width in the y-direction [µm]',
        'channel_length':      'MOSFET gate/channel length [µm]',
        'channel_width':       'Device width perpendicular to current flow [µm]',
        'gate_oxide_thickness':'Thickness of the gate dielectric (SiO₂) [µm]',
        'oxide_thickness':     'Thickness of the gate oxide / insulator [µm]',
        'substrate_doping':    'Background doping of the substrate [cm⁻³]',
        'channel_doping':      'Active channel doping [cm⁻³]',
        'substrate_type':      'Substrate polarity: "p" for p-type, "n" for n-type',
        'device_type':         'Sub-type of the device (e.g. nmos/pmos, npn/pnp)',
        'base_width':          'Width of the BJT base region [µm]',
        'base_doping':         'Base region doping concentration [cm⁻³]',
        'emitter_doping':      'Emitter region doping concentration [cm⁻³]',
        'collector_doping':    'Collector region doping concentration [cm⁻³]',
        'emitter_width':       'Width of the emitter region [µm]',
        'collector_width':     'Width of the collector region [µm]',
        'emitter_depth':       'Depth (y) of the emitter contact region [µm]',
        'base_thickness':      'Thickness of the base layer in the y-direction [µm]',
        'barrier_height':      'Schottky barrier height at the metal-semiconductor interface [eV]',
        'n_doping':            'Donor (n-type) doping concentration in the semiconductor [cm⁻³]',
        'gate_workfunction':   'Metal gate work function [eV] — controls flat-band voltage',
        'gate_length':         'Physical length of the gate metal [µm]',
        'gate_doping':         'Doping of a polysilicon gate (if used) [cm⁻³]',
        'junction_depth':      'Depth of the source/drain junction below the oxide [µm]',
        'contact_doping':      'Highly-doped contact regions at source and drain [cm⁻³]',
        'source_drain_doping': 'Doping level for source and drain implant regions [cm⁻³]',
        'channel_depth':       'Depth of the conductive channel below the gate [µm]',
        'substrate_depth':     'Total device depth in the y-direction [µm]',
        'device_depth':        'Total device depth in the y-direction [µm]',
        'device_width':        'Device extent in the x-direction [µm]',
        # Mesh refinement
        'nx':                  'Number of mesh nodes in x-direction (keep nx×ny < 2500)',
        'ny':                  'Number of mesh nodes in y-direction (keep nx×ny < 2500)',
        # PiN Diode specific
        'i_doping':            'Intrinsic region background doping [cm⁻³] (ideally near ni ≈ 1e10)',
        'p_width':             'Width of the P region [µm]',
        'i_width':             'Width of the intrinsic (I) region [µm]',
        'n_width':             'Width of the N region [µm]',
        # 2D contour map outputs
        'contour_maps':        'Enable 2D spatial map outputs (potential, carriers, field) at a bias point',
        'contour_potential':   'Include 2D electrostatic potential map',
        'contour_electrons':   'Include 2D electron concentration map',
        'contour_holes':       'Include 2D hole concentration map',
        'contour_e_field':     'Include 2D electric field magnitude map',
        'contour_doping':      'Include 2D net doping map',
        'contour_qfn':         'Include 2D electron quasi-Fermi level map',
        'contour_qfp':         'Include 2D hole quasi-Fermi level map',
        'contour_v_bias':      'Anode/forward bias voltage at which 2D maps are captured [V]',
        'contour_vgs_bias':    'Gate voltage at which 2D maps are captured [V]',
        'contour_vds_bias':    'Drain voltage at which 2D maps are captured [V]',
        'contour_vbe_bias':    'Base-emitter voltage at which 2D maps are captured [V]',
        'contour_vce_bias':    'Collector-emitter voltage at which 2D maps are captured [V]',
        # Output/sweep
        'log_iv':              'Save current-voltage (I-V) data to log file',
        'log_bands_eq':        'Save band diagram at equilibrium',
        'log_bands_bias':      'Save band diagram under applied bias',
        'log_cv':              'Save capacitance-voltage (C-V) data to log file',
        'forward_sweep_enabled': 'Enable forward-bias voltage sweep',
        'forward_v_start':     'Start voltage for forward sweep [V]',
        'forward_v_end':       'End voltage for forward sweep [V]',
        'forward_v_step':      'Step size for forward voltage sweep [V]',
        'reverse_sweep_enabled': 'Enable reverse-bias voltage sweep',
        'reverse_v_start':     'Start voltage for reverse sweep [V]',
        'reverse_v_end':       'End voltage for reverse sweep [V]',
        'reverse_v_step':      'Step size for reverse voltage sweep [V]',
        'vg_sweep_enabled':    'Enable gate voltage sweep',
        'vg_start':            'Gate voltage sweep start [V]',
        'vg_end':              'Gate voltage sweep end [V]',
        'vg_step':             'Gate voltage step size [V]',
        'vd_sweep_enabled':    'Enable drain voltage sweep',
        'vd_start':            'Drain voltage sweep start [V]',
        'vd_end':              'Drain voltage sweep end [V]',
        'vd_step':             'Drain voltage step size [V]',
        'vbe_sweep_enabled':   'Enable base-emitter voltage sweep',
        'vbe_start':           'VBE sweep start voltage [V]',
        'vbe_end':             'VBE sweep end voltage [V]',
        'vbe_step':            'VBE sweep step size [V]',
        'vce_sweep_enabled':   'Enable collector-emitter voltage sweep',
        'vce_start':           'VCE sweep start voltage [V]',
        'vce_end':             'VCE sweep end voltage [V]',
        'vce_step':            'VCE sweep step size [V]',
    }

    @classmethod
    def get_preset(cls, device_type: str) -> Optional[Dict[str, Any]]:
        """Get preset configuration for a device type."""
        preset = cls.PRESETS.get(device_type)
        if preset is None:
            return None
        # Attach per-parameter descriptions
        result = dict(preset)
        result['param_descriptions'] = cls.PARAM_DESCRIPTIONS
        return result

    @classmethod
    def list_presets(cls) -> List[Dict[str, Any]]:
        """List all available presets."""
        return [
            {
                'id': key,
                'label': value['label'],
                'icon': value.get('icon', 'fa-microchip'),
                'description': value['description'],
            }
            for key, value in cls.PRESETS.items()
        ]
