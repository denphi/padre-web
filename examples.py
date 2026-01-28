#!/usr/bin/env python3
"""
PADRE Web Application - Programmatic API Usage Examples

This script demonstrates how to interact with the PADRE Web Application
programmatically using the REST API.
"""

import requests
import json
import time
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "http://localhost:8001"
HEADERS = {"Content-Type": "application/json"}


class PadreWebClient:
    """Client for interacting with PADRE Web Application API."""
    
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.headers = HEADERS
    
    def _request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """Make HTTP request to API."""
        url = f"{self.base_url}{endpoint}"
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=self.headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=self.headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=self.headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response.raise_for_status()
            return response.json()
        
        except requests.exceptions.RequestException as e:
            print(f"Error: {e}")
            return {"success": False, "error": str(e)}
    
    # ============= Device Presets =============
    
    def list_device_presets(self) -> list:
        """Get list of available device templates."""
        result = self._request('GET', '/api/devices/presets')
        return result.get('presets', []) if result.get('success') else []
    
    def get_device_preset(self, device_type: str) -> Optional[Dict]:
        """Get configuration for a specific device type."""
        result = self._request('GET', f'/api/devices/presets/{device_type}')
        return result.get('preset') if result.get('success') else None
    
    # ============= Simulations =============
    
    def create_simulation(self, name: str, device_type: str, 
                         parameters: Dict[str, Any]) -> Optional[Dict]:
        """Create a new simulation."""
        data = {
            'name': name,
            'device_type': device_type,
            'parameters': parameters
        }
        result = self._request('POST', '/api/simulation/create', data)
        return result.get('simulation') if result.get('success') else None
    
    def list_simulations(self) -> list:
        """Get list of all simulations."""
        result = self._request('GET', '/api/simulation/list')
        return result.get('simulations', []) if result.get('success') else []
    
    def get_simulation(self, sim_id: str) -> Optional[Dict]:
        """Get simulation details."""
        result = self._request('GET', f'/api/simulation/{sim_id}')
        return result.get('simulation') if result.get('success') else None
    
    def run_simulation(self, sim_id: str) -> bool:
        """Start a simulation."""
        result = self._request('POST', f'/api/simulation/run/{sim_id}')
        return result.get('success', False)
    
    def get_simulation_status(self, sim_id: str) -> Optional[Dict]:
        """Get current simulation status."""
        result = self._request('GET', f'/api/simulation/{sim_id}/status')
        return result if result.get('success') else None
    
    def get_simulation_deck(self, sim_id: str) -> Optional[str]:
        """Get PADRE input deck for a simulation."""
        result = self._request('GET', f'/api/simulation/{sim_id}/deck')
        return result.get('deck') if result.get('success') else None
    
    def delete_simulation(self, sim_id: str) -> bool:
        """Delete a simulation."""
        result = self._request('DELETE', f'/api/simulation/{sim_id}')
        return result.get('success', False)
    
    # ============= Results =============
    
    def get_results(self, sim_id: str) -> Optional[Dict]:
        """Get simulation results."""
        result = self._request('GET', f'/api/results/{sim_id}')
        return result.get('results') if result.get('success') else None
    
    def list_output_files(self, sim_id: str) -> list:
        """List output files for a simulation."""
        result = self._request('GET', f'/api/results/{sim_id}/outputs')
        return result.get('files', []) if result.get('success') else []
    
    def download_output_file(self, sim_id: str, filename: str, 
                            save_path: str) -> bool:
        """Download an output file."""
        url = f"{self.base_url}/api/results/{sim_id}/download/{filename}"
        try:
            response = requests.get(url)
            response.raise_for_status()
            with open(save_path, 'wb') as f:
                f.write(response.content)
            return True
        except Exception as e:
            print(f"Error downloading file: {e}")
            return False
    
    # ============= Utilities =============
    
    def wait_for_completion(self, sim_id: str, timeout: int = 3600, 
                           poll_interval: int = 5) -> bool:
        """Wait for a simulation to complete."""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_simulation_status(sim_id)
            
            if status:
                current_status = status.get('status')
                progress = status.get('progress', 0)
                print(f"Status: {current_status} - Progress: {progress}%")
                
                if current_status in ('completed', 'failed'):
                    return current_status == 'completed'
            
            time.sleep(poll_interval)
        
        print(f"Timeout waiting for simulation {sim_id}")
        return False


# ============= Example Usage =============

def example_1_list_devices():
    """Example: List available device templates."""
    print("\n" + "="*60)
    print("Example 1: List Available Device Templates")
    print("="*60)
    
    client = PadreWebClient()
    presets = client.list_device_presets()
    
    print(f"\nFound {len(presets)} device templates:\n")
    for preset in presets:
        print(f"  • {preset['label']}: {preset['description']}")
        print(f"    ID: {preset['id']}\n")


def example_2_create_and_run():
    """Example: Create a MOSFET simulation and run it."""
    print("\n" + "="*60)
    print("Example 2: Create and Run a MOSFET Simulation")
    print("="*60)
    
    client = PadreWebClient()
    
    # Get MOSFET preset
    print("\nGetting MOSFET preset...")
    preset = client.get_device_preset('mosfet')
    
    if not preset:
        print("Failed to get MOSFET preset")
        return
    
    print("Preset parameters:")
    for key, value in preset['parameters'].items():
        print(f"  {key}: {value}")
    
    # Create simulation
    print("\nCreating simulation...")
    sim = client.create_simulation(
        name="Example MOSFET Simulation",
        device_type="mosfet",
        parameters=preset['parameters']
    )
    
    if not sim:
        print("Failed to create simulation")
        return
    
    sim_id = sim['id']
    print(f"✓ Created simulation: {sim_id}")
    
    # Get deck
    print("\nGetting PADRE input deck...")
    deck = client.get_simulation_deck(sim_id)
    if deck:
        print("Deck preview (first 500 chars):")
        print(deck[:500] + "...\n")
    
    # Run simulation
    print("Running simulation...")
    if client.run_simulation(sim_id):
        print("✓ Simulation started")
        
        # Wait for completion
        if client.wait_for_completion(sim_id, timeout=300, poll_interval=5):
            print("✓ Simulation completed successfully")
        else:
            print("✗ Simulation failed or timed out")
    else:
        print("✗ Failed to start simulation")


def example_3_list_and_manage():
    """Example: List simulations and manage them."""
    print("\n" + "="*60)
    print("Example 3: List and Manage Simulations")
    print("="*60)
    
    client = PadreWebClient()
    
    # List all simulations
    print("\nFetching simulations...")
    simulations = client.list_simulations()
    
    print(f"\nFound {len(simulations)} simulations:\n")
    for sim in simulations:
        print(f"  ID: {sim['id']}")
        print(f"  Name: {sim['name']}")
        print(f"  Device: {sim['device_type']}")
        print(f"  Status: {sim['status']}")
        print(f"  Progress: {sim['progress']}%")
        print()


def example_4_batch_simulations():
    """Example: Run multiple simulations in batch."""
    print("\n" + "="*60)
    print("Example 4: Batch Simulations")
    print("="*60)
    
    client = PadreWebClient()
    
    # Get device presets
    pn_preset = client.get_device_preset('pn_diode')
    mosfet_preset = client.get_device_preset('mosfet')
    
    devices = [
        ("PN Diode", "pn_diode", pn_preset['parameters']),
        ("MOSFET", "mosfet", mosfet_preset['parameters']),
    ]
    
    simulations = []
    
    # Create all simulations
    print("\nCreating simulations...")
    for name, device_type, params in devices:
        sim = client.create_simulation(
            name=f"Batch - {name}",
            device_type=device_type,
            parameters=params
        )
        if sim:
            simulations.append(sim)
            print(f"  ✓ {name}: {sim['id']}")
    
    # Run all simulations
    print("\nRunning simulations...")
    for sim in simulations:
        client.run_simulation(sim['id'])
        print(f"  ✓ Started {sim['id']}")
    
    # Wait for all to complete
    print("\nWaiting for completion...")
    for sim in simulations:
        print(f"  Waiting for {sim['id']}...")
        if client.wait_for_completion(sim['id']):
            print(f"    ✓ Completed")
        else:
            print(f"    ✗ Failed or timed out")


def example_5_download_results():
    """Example: Download simulation results."""
    print("\n" + "="*60)
    print("Example 5: Download Results")
    print("="*60)
    
    client = PadreWebClient()
    
    # Get first completed simulation
    print("\nFetching simulations...")
    simulations = client.list_simulations()
    
    completed = [s for s in simulations if s['status'] == 'completed']
    
    if not completed:
        print("No completed simulations found")
        return
    
    sim = completed[0]
    sim_id = sim['id']
    
    print(f"\nDownloading results from {sim_id}...")
    
    # List output files
    files = client.list_output_files(sim_id)
    
    print(f"Found {len(files)} output files:\n")
    for file in files:
        print(f"  • {file['name']} ({file['size']} bytes)")
        
        # Download each file
        save_path = f"/tmp/{file['name']}"
        if client.download_output_file(sim_id, file['name'], save_path):
            print(f"    ✓ Downloaded to {save_path}")
        else:
            print(f"    ✗ Failed to download")


# ============= Main =============

if __name__ == '__main__':
    import sys
    
    print("""
    ╔════════════════════════════════════════════════════════════╗
    ║   PADRE Web Application - Programmatic API Examples       ║
    ║                                                            ║
    ║   Make sure the web server is running on port 8001        ║
    ╚════════════════════════════════════════════════════════════╝
    """)
    
    # Check which example to run
    if len(sys.argv) > 1:
        example_num = sys.argv[1]
    else:
        print("\nAvailable examples:")
        print("  1. List device templates")
        print("  2. Create and run MOSFET simulation")
        print("  3. List and manage simulations")
        print("  4. Batch simulations")
        print("  5. Download results")
        print("\nUsage: python examples.py <example_number>")
        print("       python examples.py 1")
        sys.exit(0)
    
    examples = {
        '1': example_1_list_devices,
        '2': example_2_create_and_run,
        '3': example_3_list_and_manage,
        '4': example_4_batch_simulations,
        '5': example_5_download_results,
    }
    
    if example_num in examples:
        try:
            examples[example_num]()
            print("\n✓ Example completed successfully\n")
        except Exception as e:
            print(f"\n✗ Error: {e}\n")
    else:
        print(f"\n✗ Unknown example: {example_num}\n")
