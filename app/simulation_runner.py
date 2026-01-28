"""Simulation runner for executing PADRE simulations."""
from __future__ import annotations
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

        # Build sweep tuples if enabled
        vgs_sweep = None
        vds_sweep = None

        if p.get('vg_sweep_enabled', False):
            vgs_sweep = (
                p.get('vg_start', 0.0),
                p.get('vg_end', 1.5),
                p.get('vg_step', 0.1)
            )

        if p.get('vd_sweep_enabled', False):
            vds_sweep = (
                p.get('vd_start', 0.0),
                p.get('vd_end', 1.5),
                p.get('vd_step', 0.1)
            )

        sim = create_mosfet(
            channel_length=p.get('channel_length', 0.18),
            gate_oxide_thickness=p.get('gate_oxide_thickness', 0.005),
            substrate_doping=p.get('substrate_doping', 1e17),
            device_type=device_type,
            temperature=p.get('temperature', 300),
            log_iv=p.get('log_iv', True),
            vgs_sweep=vgs_sweep,
            vds=p.get('vds', 0.1),
            vds_sweep=vds_sweep,
            vgs=p.get('vgs', 0.0),
        )

        return sim
    
    def _create_mesfet_sim(self, temp_dir: str) -> Simulation:
        """Create MESFET simulation."""
        p = self.parameters
        device_type = p.get('device_type', 'n')

        # Build sweep tuple if enabled
        vds_sweep = None
        if p.get('vd_sweep_enabled', False):
            vds_sweep = (
                p.get('vd_start', 0.0),
                p.get('vd_end', 2.0),
                p.get('vd_step', 0.1)
            )

        sim = create_mesfet(
            channel_length=p.get('channel_length', 0.2),
            channel_doping=p.get('channel_doping', 1e17),
            device_type=device_type,
            temperature=p.get('temperature', 300),
            conmob=p.get('conmob', True),
            fldmob=p.get('fldmob', True),
            log_iv=p.get('log_iv', True),
            log_bands_eq=p.get('log_bands_eq', True),
            vgs=p.get('vgs', 0.0),
            vds_sweep=vds_sweep,
        )

        return sim
    
    def _create_pn_diode_sim(self, temp_dir: str) -> Simulation:
        """Create PN diode simulation."""
        p = self.parameters

        # Build sweep tuples if enabled
        forward_sweep = None
        reverse_sweep = None

        if p.get('forward_sweep_enabled', False):
            forward_sweep = (
                p.get('forward_v_start', 0.0),
                p.get('forward_v_end', 0.8),
                p.get('forward_v_step', 0.05)
            )

        if p.get('reverse_sweep_enabled', False):
            reverse_sweep = (
                p.get('reverse_v_start', 0.0),
                p.get('reverse_v_end', -5.0),
                p.get('reverse_v_step', -0.5)
            )

        sim = create_pn_diode(
            length=p.get('length', 1.0),
            width=p.get('width', 1.0),
            junction_position=p.get('junction_position', 0.5),
            p_doping=p.get('p_doping', 1e17),
            n_doping=p.get('n_doping', 1e17),
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
            fldmob=p.get('fldmob', True),
            log_iv=p.get('log_iv', True),
            log_bands_eq=p.get('log_bands_eq', True),
            log_bands_bias=p.get('log_bands_bias', True),
            forward_sweep=forward_sweep,
            reverse_sweep=reverse_sweep,
        )

        return sim
    
    def _create_mos_capacitor_sim(self, temp_dir: str) -> Simulation:
        """Create MOS capacitor simulation."""
        p = self.parameters

        # Build sweep tuple if enabled
        vg_sweep = None
        if p.get('vg_sweep_enabled', False):
            vg_sweep = (
                p.get('vg_start', -2.0),
                p.get('vg_end', 2.0),
                p.get('vg_step', 0.1)
            )

        sim = create_mos_capacitor(
            oxide_thickness=p.get('oxide_thickness', 0.01),
            substrate_doping=p.get('substrate_doping', 1e16),
            substrate_type=p.get('substrate_type', 'p'),
            temperature=p.get('temperature', 300),
            conmob=p.get('conmob', True),
            fldmob=p.get('fldmob', True),
            log_cv=p.get('log_cv', True),
            log_bands_eq=p.get('log_bands_eq', True),
            vg_sweep=vg_sweep,
        )

        return sim
    
    def _create_bjt_sim(self, temp_dir: str) -> Simulation:
        """Create BJT simulation."""
        p = self.parameters
        device_type = p.get('device_type', 'npn')

        # Build sweep tuples if enabled
        vce_sweep = None
        gummel_sweep = None

        if p.get('vce_sweep_enabled', False):
            vce_sweep = (
                p.get('vce_start', 0.0),
                p.get('vce_end', 5.0),
                p.get('vce_step', 0.5)
            )

        if p.get('vbe_sweep_enabled', False):
            gummel_sweep = (
                p.get('vbe_start', 0.0),
                p.get('vbe_end', 0.8),
                p.get('vbe_step', 0.05)
            )

        sim = create_bjt(
            device_type=device_type,
            base_width=p.get('base_width', 0.5),
            base_doping=p.get('base_doping', 1e17),
            emitter_doping=p.get('emitter_doping', 1e20),
            collector_doping=p.get('collector_doping', 1e16),
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
            log_iv=p.get('log_iv', True),
            log_bands_eq=p.get('log_bands_eq', True),
            vbe=p.get('vbe', 0.7),
            vce_sweep=vce_sweep,
            gummel_sweep=gummel_sweep,
        )

        return sim
    
    def _create_schottky_diode_sim(self, temp_dir: str) -> Simulation:
        """Create Schottky diode simulation."""
        p = self.parameters

        # Build sweep tuples if enabled
        forward_sweep = None
        reverse_sweep = None

        if p.get('forward_sweep_enabled', False):
            forward_sweep = (
                p.get('forward_v_start', 0.0),
                p.get('forward_v_end', 0.5),
                p.get('forward_v_step', 0.02)
            )

        if p.get('reverse_sweep_enabled', False):
            reverse_sweep = (
                p.get('reverse_v_start', 0.0),
                p.get('reverse_v_end', -2.0),
                p.get('reverse_v_step', -0.1)
            )

        sim = create_schottky_diode(
            length=p.get('length', 2.0),
            doping=p.get('n_doping', 1e16),
            workfunction=p.get('barrier_height', 4.8),
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
            fldmob=p.get('fldmob', True),
            log_iv=p.get('log_iv', True),
            log_bands_eq=p.get('log_bands_eq', True),
            log_bands_bias=p.get('log_bands_bias', True),
            forward_sweep=forward_sweep,
            reverse_sweep=reverse_sweep,
        )

        return sim
    
    def _create_solar_cell_sim(self, temp_dir: str) -> Simulation:
        """Create solar cell simulation."""
        p = self.parameters

        # Build sweep tuple if enabled
        forward_sweep = None
        if p.get('v_sweep_enabled', False):
            forward_sweep = (
                p.get('v_start', 0.0),
                p.get('v_end', 0.7),
                p.get('v_step', 0.02)
            )

        sim = create_solar_cell(
            emitter_doping=p.get('emitter_doping', 1e19),
            base_doping=p.get('base_doping', 1e16),
            base_thickness=p.get('base_width', 200.0),
            temperature=p.get('temperature', 300),
            srh=p.get('srh', True),
            conmob=p.get('conmob', True),
            log_iv=p.get('log_iv', True),
            log_bands_eq=p.get('log_bands_eq', True),
            forward_sweep=forward_sweep,
        )

        return sim
