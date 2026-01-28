"""Simulation runner for executing PADRE simulations."""
import os
import tempfile
import threading
import traceback
from datetime import datetime
from typing import Optional, Callable
import logging

try:
    import nanohubpadre
    from nanohubpadre import (
        Simulation, create_mosfet, create_mesfet, create_pn_diode,
        create_mos_capacitor, create_bjt, create_schottky_diode,
        create_solar_cell, Solve, Log, Models, System, Method
    )
    PADRE_AVAILABLE = True
except ImportError:
    PADRE_AVAILABLE = False

logger = logging.getLogger(__name__)


class SimulationRunner:
    """Handles the execution of PADRE simulations in a separate thread."""
    
    def __init__(self, simulation_id: str, device_type: str, parameters: dict,
                 output_dir: str, progress_callback: Optional[Callable] = None):
        self.simulation_id = simulation_id
        self.device_type = device_type
        self.parameters = parameters
        self.output_dir = output_dir
        self.progress_callback = progress_callback
        self.thread: Optional[threading.Thread] = None
        self.is_running = False
        self.error: Optional[str] = None
        self.output_files = []
        self.deck_content = ""
    
    def start(self) -> None:
        """Start the simulation in a separate thread."""
        self.is_running = True
        self.thread = threading.Thread(target=self._run)
        self.thread.daemon = True
        self.thread.start()
    
    def wait(self) -> bool:
        """Wait for the simulation to complete. Returns True if successful."""
        if self.thread:
            self.thread.join()
        return self.error is None
    
    def _update_progress(self, progress: float, message: str = "") -> None:
        """Update progress."""
        if self.progress_callback:
            self.progress_callback(progress, message)
    
    def _run(self) -> None:
        """Execute the simulation."""
        try:
            self._update_progress(5, "Initializing simulation...")
            
            if not PADRE_AVAILABLE:
                raise ImportError("nanohubpadre library not installed")
            
            # Create simulation based on device type
            sim = self._create_device_simulation()
            self._update_progress(15, "Device configured")
            
            # Generate deck
            deck_content = sim.generate_deck()
            self.deck_content = deck_content
            self._update_progress(25, "Deck generated")
            
            # Save deck to file
            deck_file = os.path.join(self.output_dir, "padre_input.deck")
            with open(deck_file, 'w') as f:
                f.write(deck_content)
            self.output_files.append(deck_file)
            
            # Create a temporary working directory for simulation
            working_dir = os.path.join(self.output_dir, "sim_work")
            os.makedirs(working_dir, exist_ok=True)
            
            # For now, we'll save the deck but won't execute PADRE
            # since it requires PADRE executable to be installed
            self._update_progress(100, "Simulation completed (deck generated)")
            
            logger.info(f"Simulation {self.simulation_id} completed successfully")
            
        except Exception as e:
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            self.error = error_msg
            logger.error(f"Simulation {self.simulation_id} failed: {error_msg}")
            self._update_progress(100, f"Error: {str(e)}")
        finally:
            self.is_running = False
    
    def _create_device_simulation(self) -> Simulation:
        """Create a simulation based on device type."""
        temp_dir = tempfile.mkdtemp()
        
        if self.device_type == 'mosfet':
            return self._create_mosfet_sim(temp_dir)
        elif self.device_type == 'mesfet':
            return self._create_mesfet_sim(temp_dir)
        elif self.device_type == 'pn_diode':
            return self._create_pn_diode_sim(temp_dir)
        elif self.device_type == 'mos_capacitor':
            return self._create_mos_capacitor_sim(temp_dir)
        elif self.device_type == 'bjt':
            return self._create_bjt_sim(temp_dir)
        elif self.device_type == 'schottky_diode':
            return self._create_schottky_diode_sim(temp_dir)
        elif self.device_type == 'solar_cell':
            return self._create_solar_cell_sim(temp_dir)
        else:
            raise ValueError(f"Unknown device type: {self.device_type}")
    
    def _create_mosfet_sim(self, temp_dir: str) -> Simulation:
        """Create MOSFET simulation."""
        p = self.parameters
        device_type = p.get('device_type', 'nmos')
        
        sim = create_mosfet(
            channel_length=p.get('channel_length', 0.05),
            device_type=device_type,
            temperature=p.get('temperature', 300)
        )
        
        # Add physics models
        sim.models = Models(
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
            fldmob=p.get('fldmob', True),
            bgn=p.get('bgn', False),
        )
        
        # Add system configuration
        sim.system = System(
            carriers=p.get('carriers', 2),
            newton=p.get('newton', True),
        )
        
        return sim
    
    def _create_mesfet_sim(self, temp_dir: str) -> Simulation:
        """Create MESFET simulation."""
        p = self.parameters
        device_type = p.get('device_type', 'nmesfet')
        
        sim = create_mesfet(
            channel_length=p.get('channel_length', 0.5),
            device_type=device_type,
            temperature=p.get('temperature', 300)
        )
        
        sim.models = Models(
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
            fldmob=p.get('fldmob', True),
        )
        
        return sim
    
    def _create_pn_diode_sim(self, temp_dir: str) -> Simulation:
        """Create PN diode simulation."""
        p = self.parameters
        
        sim = create_pn_diode(
            temperature=p.get('temperature', 300)
        )
        
        sim.models = Models(
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
        )
        
        return sim
    
    def _create_mos_capacitor_sim(self, temp_dir: str) -> Simulation:
        """Create MOS capacitor simulation."""
        p = self.parameters
        
        sim = create_mos_capacitor(
            temperature=p.get('temperature', 300)
        )
        
        sim.models = Models(
            temperature=p.get('temperature', 300),
        )
        
        return sim
    
    def _create_bjt_sim(self, temp_dir: str) -> Simulation:
        """Create BJT simulation."""
        p = self.parameters
        device_type = p.get('device_type', 'npn')
        
        sim = create_bjt(
            device_type=device_type,
            temperature=p.get('temperature', 300)
        )
        
        sim.models = Models(
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
        )
        
        return sim
    
    def _create_schottky_diode_sim(self, temp_dir: str) -> Simulation:
        """Create Schottky diode simulation."""
        p = self.parameters
        
        sim = create_schottky_diode(
            temperature=p.get('temperature', 300)
        )
        
        sim.models = Models(
            temperature=p.get('temperature', 300),
        )
        
        return sim
    
    def _create_solar_cell_sim(self, temp_dir: str) -> Simulation:
        """Create solar cell simulation."""
        p = self.parameters
        
        sim = create_solar_cell(
            temperature=p.get('temperature', 300)
        )
        
        sim.models = Models(
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
        )
        
        return sim
