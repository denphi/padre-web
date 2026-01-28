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

    PRESETS = {
        'pn_diode': {
            'label': 'PN Diode',
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
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
                'log_bands_bias': True,
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
        'mosfet': {
            'label': 'MOSFET',
            'description': 'Metal-Oxide-Semiconductor Field-Effect Transistor',
            'parameters': {
                'device_type': 'nmos',
                'temperature': 300,
                'channel_length': 0.18,
                'gate_oxide_thickness': 0.005,
                'substrate_doping': 1e17,
                'srh': True,
                'conmob': True,
                'fldmob': True,
            },
            'outputs': {
                'log_iv': True,
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
            'description': 'Metal-Semiconductor Field-Effect Transistor',
            'parameters': {
                'device_type': 'nmesfet',
                'temperature': 300,
                'channel_length': 0.5,
                'channel_doping': 1e17,
                'srh': True,
                'conmob': True,
                'fldmob': True,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
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
            'description': 'Metal-Oxide-Semiconductor Capacitor',
            'parameters': {
                'temperature': 300,
                'substrate_doping': 1e16,
                'oxide_thickness': 0.01,
                'substrate_type': 'p',
                'conmob': True,
                'fldmob': True,
            },
            'outputs': {
                'log_cv': True,
                'log_bands_eq': True,
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
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
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
            'description': 'Metal-Semiconductor Junction Diode',
            'parameters': {
                'temperature': 300,
                'n_doping': 1e16,
                'barrier_height': 0.7,
                'length': 1.0,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
                'log_bands_bias': True,
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
        'solar_cell': {
            'label': 'Solar Cell',
            'description': 'Photovoltaic Device',
            'parameters': {
                'temperature': 300,
                'emitter_doping': 5e19,
                'base_doping': 5e16,
                'base_width': 100.0,
                'srh': True,
                'conmob': True,
            },
            'outputs': {
                'log_iv': True,
                'log_bands_eq': True,
            },
            'sweep': {
                'illumination_enabled': True,
                'v_sweep_enabled': True,
                'v_start': 0.0,
                'v_end': 0.7,
                'v_step': 0.02,
            }
        },
    }
    
    @classmethod
    def get_preset(cls, device_type: str) -> Optional[Dict[str, Any]]:
        """Get preset configuration for a device type."""
        return cls.PRESETS.get(device_type)
    
    @classmethod
    def list_presets(cls) -> List[Dict[str, Any]]:
        """List all available presets."""
        return [
            {
                'id': key,
                'label': value['label'],
                'description': value['description'],
            }
            for key, value in cls.PRESETS.items()
        ]
