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


def _build_contour_quantities(params: dict) -> list:
    """Return the list of contour quantity strings that are enabled in params."""
    mapping = [
        ('contour_potential', 'potential'),
        ('contour_doping',    'doping'),
        ('contour_electrons', 'electrons'),
        ('contour_holes',     'holes'),
        ('contour_e_field',   'e_field'),
        ('contour_qfn',       'qfn'),
        ('contour_qfp',       'qfp'),
    ]
    return [qty for key, qty in mapping if params.get(key, False)]


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

            # Set working directory for simulation outputs
            sim.working_dir = self.output_dir

            # Generate deck
            deck_content = sim.generate_deck()
            self.deck_content = deck_content
            self._update_progress(25, "Deck generated")

            # Save deck to file
            deck_file = os.path.join(self.output_dir, "padre_input.deck")
            with open(deck_file, 'w') as f:
                f.write(deck_content)
            self.output_files.append(deck_file)

            self._update_progress(30, "Running PADRE simulation...")

            # Run the PADRE simulation
            result = sim.run(
                output_dir=None,  # Use the output_dir we already set
                auto_output_dir=False,  # Don't create subdirectory
                force_rerun=True,  # Always run fresh, never use cached results
                verbose=False,
                capture_output=True
            )

            self._update_progress(90, "Simulation finished, collecting outputs...")

            # Check if simulation succeeded
            if result.returncode != 0:
                error_output = result.stderr if result.stderr else result.stdout
                raise RuntimeError(f"PADRE simulation failed with code {result.returncode}: {error_output}")

            # Collect all output files
            self._collect_output_files()

            self._update_progress(100, "Simulation completed successfully")

            logger.info(f"Simulation {self.simulation_id} completed successfully")
            
        except Exception as e:
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            self.error = error_msg
            logger.error(f"Simulation {self.simulation_id} failed: {error_msg}")
            self._update_progress(100, f"Error: {str(e)}")
        finally:
            self.is_running = False

    def _collect_output_files(self) -> None:
        """Collect all output files from the simulation directory."""
        if not os.path.exists(self.output_dir):
            return

        for filename in os.listdir(self.output_dir):
            filepath = os.path.join(self.output_dir, filename)
            if os.path.isfile(filepath) and filepath not in self.output_files:
                self.output_files.append(filepath)

    def _create_device_simulation(self) -> Simulation:
        """Create a simulation based on device type."""
        temp_dir = tempfile.mkdtemp()
        
        if self.device_type == 'mosfet':
            return self._create_mosfet_sim(temp_dir)
        elif self.device_type == 'mesfet':
            return self._create_mesfet_sim(temp_dir)
        elif self.device_type == 'pn_diode':
            return self._create_pn_diode_sim(temp_dir)
        elif self.device_type == 'pin_diode':
            return self._create_pin_diode_sim(temp_dir)
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

        # Build sweep tuples if enabled (with validation)
        vgs_sweep = None
        vds_sweep = None

        if p.get('vg_sweep_enabled', False):
            v_start = p.get('vg_start') if p.get('vg_start') is not None else 0.0
            v_end = p.get('vg_end') if p.get('vg_end') is not None else 1.5
            v_step = p.get('vg_step') if p.get('vg_step') is not None else 0.1
            vgs_sweep = (v_start, v_end, v_step)

        if p.get('vd_sweep_enabled', False):
            v_start = p.get('vd_start') if p.get('vd_start') is not None else 0.0
            v_end = p.get('vd_end') if p.get('vd_end') is not None else 1.5
            v_step = p.get('vd_step') if p.get('vd_step') is not None else 0.1
            vds_sweep = (v_start, v_end, v_step)

        # 2D contour map quantities
        contour_quantities = _build_contour_quantities(p)

        channel_length = p.get('channel_length', 0.025)
        gate_oxide_thickness = p.get('gate_oxide_thickness', 0.005)
        # device_width must be larger than channel_length; use 4x channel length or at least 0.1
        device_width = max(channel_length * 4.0, 0.1)
        # device_depth scales with oxide thickness; ensure it's reasonable
        device_depth = max(gate_oxide_thickness * 4.0, 0.05)
        junction_depth = min(gate_oxide_thickness * 3.0, device_depth * 0.4)

        nx = p.get('nx', 45)
        ny = p.get('ny', 45)
        # Enforce mesh node limit
        if nx * ny > 2400:
            scale = (2400 / (nx * ny)) ** 0.5
            nx = max(20, int(nx * scale))
            ny = max(20, int(ny * scale))

        sim = create_mosfet(
            channel_length=channel_length,
            gate_oxide_thickness=gate_oxide_thickness,
            junction_depth=junction_depth,
            device_width=device_width,
            device_depth=device_depth,
            nx=nx,
            ny=ny,
            substrate_doping=p.get('substrate_doping', 1e17),
            device_type=device_type,
            temperature=p.get('temperature', 300),
            log_iv=p.get('log_iv', True),
            iv_file='iv',
            vgs_sweep=vgs_sweep,
            vds=p.get('vds', 0.1),
            vds_sweep=vds_sweep,
            vgs=p.get('vgs', 0.0),
            contour_maps=bool(p.get('contour_maps', False)) and bool(contour_quantities),
            contour_vgs=p.get('contour_vgs_bias', 1.0),
            contour_vds=p.get('contour_vds_bias', 1.0),
            contour_quantities=contour_quantities or None,
        )

        return sim
    
    def _create_mesfet_sim(self, temp_dir: str) -> Simulation:
        """Create MESFET simulation."""
        p = self.parameters
        # Normalize device_type: factory expects 'n' or 'p' only
        raw_type = p.get('device_type', 'n').lower()
        device_type = 'p' if 'p' in raw_type else 'n'

        # Build sweep tuple if enabled (with validation)
        vds_sweep = None
        if p.get('vd_sweep_enabled', False):
            v_start = p.get('vd_start') if p.get('vd_start') is not None else 0.0
            v_end = p.get('vd_end') if p.get('vd_end') is not None else 2.0
            v_step = p.get('vd_step') if p.get('vd_step') is not None else 0.1
            vds_sweep = (v_start, v_end, v_step)

        contour_quantities = _build_contour_quantities(p)

        nx = p.get('nx', 40)
        ny = p.get('ny', 30)
        if nx * ny > 2400:
            scale = (2400 / (nx * ny)) ** 0.5
            nx = max(20, int(nx * scale))
            ny = max(20, int(ny * scale))

        sim = create_mesfet(
            channel_length=p.get('channel_length', 0.2),
            channel_doping=p.get('channel_doping', 1e17),
            nx=nx,
            ny=ny,
            device_type=device_type,
            temperature=p.get('temperature', 300),
            conmob=p.get('conmob', True),
            fldmob=p.get('fldmob', True),
            log_iv=p.get('log_iv', True),
            iv_file='iv',
            log_bands_eq=p.get('log_bands_eq', True),
            vgs=p.get('vgs', 0.0),
            vds_sweep=vds_sweep,
            contour_maps=bool(p.get('contour_maps', False)) and bool(contour_quantities),
            contour_vds_bias=p.get('contour_vds_bias', 2.0),
            contour_quantities=contour_quantities or None,
        )

        return sim
    
    def _create_pn_diode_sim(self, temp_dir: str) -> Simulation:
        """Create PN diode simulation."""
        p = self.parameters

        # Build sweep tuples if enabled (with validation)
        forward_sweep = None
        reverse_sweep = None

        if p.get('forward_sweep_enabled', False):
            v_start = p.get('forward_v_start') if p.get('forward_v_start') is not None else 0.0
            v_end = p.get('forward_v_end') if p.get('forward_v_end') is not None else 0.8
            v_step = p.get('forward_v_step') if p.get('forward_v_step') is not None else 0.05
            forward_sweep = (v_start, v_end, v_step)

        if p.get('reverse_sweep_enabled', False):
            v_start = p.get('reverse_v_start') if p.get('reverse_v_start') is not None else 0.0
            v_end = p.get('reverse_v_end') if p.get('reverse_v_end') is not None else -5.0
            v_step = p.get('reverse_v_step') if p.get('reverse_v_step') is not None else -0.5
            reverse_sweep = (v_start, v_end, v_step)

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

        # Build sweep tuple if enabled (with validation)
        vg_sweep = None
        if p.get('vg_sweep_enabled', False):
            v_start = p.get('vg_start') if p.get('vg_start') is not None else -2.0
            v_end = p.get('vg_end') if p.get('vg_end') is not None else 2.0
            v_step = p.get('vg_step') if p.get('vg_step') is not None else 0.1
            vg_sweep = (v_start, v_end, v_step)

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

        # Build sweep tuples if enabled (with validation)
        vce_sweep = None
        gummel_sweep = None

        if p.get('vce_sweep_enabled', False):
            v_start = p.get('vce_start') if p.get('vce_start') is not None else 0.0
            v_end = p.get('vce_end') if p.get('vce_end') is not None else 5.0
            v_step = p.get('vce_step') if p.get('vce_step') is not None else 0.5
            vce_sweep = (v_start, v_end, v_step)

        if p.get('vbe_sweep_enabled', False):
            v_start = p.get('vbe_start') if p.get('vbe_start') is not None else 0.0
            v_end = p.get('vbe_end') if p.get('vbe_end') is not None else 0.8
            v_step = p.get('vbe_step') if p.get('vbe_step') is not None else 0.05
            gummel_sweep = (v_start, v_end, v_step)

        contour_quantities = _build_contour_quantities(p)

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
            contour_maps=bool(p.get('contour_maps', False)) and bool(contour_quantities),
            contour_vbe=p.get('contour_vbe_bias', 0.7),
            contour_vce=p.get('contour_vce_bias', 2.0),
            contour_quantities=contour_quantities or None,
        )

        return sim
    
    def _create_schottky_diode_sim(self, temp_dir: str) -> Simulation:
        """Create Schottky diode simulation."""
        p = self.parameters

        # Build sweep tuples if enabled (with validation)
        forward_sweep = None
        reverse_sweep = None

        if p.get('forward_sweep_enabled', False):
            v_start = p.get('forward_v_start') if p.get('forward_v_start') is not None else 0.0
            v_end = p.get('forward_v_end') if p.get('forward_v_end') is not None else 0.5
            v_step = p.get('forward_v_step') if p.get('forward_v_step') is not None else 0.02
            forward_sweep = (v_start, v_end, v_step)

        if p.get('reverse_sweep_enabled', False):
            v_start = p.get('reverse_v_start') if p.get('reverse_v_start') is not None else 0.0
            v_end = p.get('reverse_v_end') if p.get('reverse_v_end') is not None else -2.0
            v_step = p.get('reverse_v_step') if p.get('reverse_v_step') is not None else -0.1
            reverse_sweep = (v_start, v_end, v_step)

        # barrier_height is the Schottky barrier height in eV (e.g. 0.7 eV).
        # PADRE workfunction = electron affinity of Si (4.05 eV) + barrier_height.
        barrier_height = p.get('barrier_height', 0.7)
        workfunction = 4.05 + barrier_height

        sim = create_schottky_diode(
            length=p.get('length', 2.0),
            nx=p.get('nx', 50),
            ny=p.get('ny', 20),
            doping=p.get('n_doping', 1e16),
            workfunction=workfunction,
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
    
    def _create_pin_diode_sim(self, temp_dir: str) -> Simulation:
        """Create PiN diode simulation (built on top of create_pn_diode with 3 regions)."""
        p = self.parameters

        forward_sweep = None
        reverse_sweep = None

        if p.get('forward_sweep_enabled', False):
            v_start = p.get('forward_v_start', 0.0)
            v_end   = p.get('forward_v_end', 1.0)
            v_step  = p.get('forward_v_step', 0.05)
            forward_sweep = (v_start, v_end, v_step)

        if p.get('reverse_sweep_enabled', False):
            v_start = p.get('reverse_v_start', 0.0)
            v_end   = p.get('reverse_v_end', -10.0)
            v_step  = p.get('reverse_v_step', -0.5)
            reverse_sweep = (v_start, v_end, v_step)

        # PiN uses create_pn_diode but with very low n_doping (intrinsic) as the junction
        # The intrinsic region is modelled via a very lightly doped n region
        total_length = p.get('length', 2.0)
        i_width = p.get('i_width', 1.0)
        # junction_position places the P|I boundary; use midpoint of intrinsic region
        p_width = p.get('p_width', 0.5)
        junction_pos = p_width / total_length if total_length > 0 else 0.25

        sim = create_pn_diode(
            length=total_length,
            width=p.get('width', 1.0),
            junction_position=junction_pos,
            p_doping=p.get('p_doping', 1e18),
            n_doping=p.get('i_doping', 1e13),   # intrinsic region (lightly doped)
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

        # Build sweep tuple if enabled (with validation)
        forward_sweep = None
        if p.get('v_sweep_enabled', False):
            v_start = p.get('v_start') if p.get('v_start') is not None else 0.0
            v_end = p.get('v_end') if p.get('v_end') is not None else 0.7
            v_step = p.get('v_step') if p.get('v_step') is not None else 0.02
            forward_sweep = (v_start, v_end, v_step)

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
