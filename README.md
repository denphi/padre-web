# PADRE Web Application

A complete and interactive web application for configuring, running, and analyzing PADRE semiconductor device simulations.

## Features

✨ **Features:**
- 🎨 **Interactive Dashboard**: Overview of all simulations with real-time status updates
- ⚙️ **Device Configuration**: Easy-to-use interface for configuring semiconductor devices
- 📊 **7 Device Types**: Pre-configured templates for:
  - PN Diode
  - MOSFET (NMOS/PMOS)
  - MESFET
  - MOS Capacitor
  - BJT
  - Schottky Diode
  - Solar Cell
- ▶️ **Simulation Runner**: Run simulations with progress tracking
- 📈 **Results Visualization**: View and download simulation outputs
- 💾 **Session Persistence**: All simulations are saved and can be resumed
- 🔄 **Real-time Updates**: Live progress updates while simulations run
- 📥 **PADRE Deck Generation**: Automatically generates PADRE input decks

## Installation

### Prerequisites
- Python 3.7+
- pip

### Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the application:
```bash
python run.py
```

3. Open your browser and navigate to:
```
http://localhost:8001
```

## Usage

### 1. Dashboard
The main dashboard shows:
- Total number of simulations
- Count of completed, running, and failed simulations
- List of recent simulations with status and progress

### 2. Device Configuration
To create a new simulation:
1. Click "New Simulation" button
2. Select a device type from the templates
3. Configure device parameters
4. Click "Create Simulation"

### 3. Simulation Detail
View and manage individual simulations:
- Monitor progress in real-time
- View input deck before running
- Run or stop simulations
- Download input decks
- View results

### 4. Results
After a simulation completes:
- Download output files
- View generated results
- Analyze device behavior

## Project Structure

```
padre_web/
├── app/
│   ├── __init__.py           # Flask app factory
│   ├── models.py             # Data models and storage
│   ├── routes.py             # API routes
│   ├── simulation_runner.py   # Simulation execution
│   ├── templates/            # HTML templates
│   │   ├── base.html
│   │   ├── index.html        # Dashboard
│   │   ├── devices.html      # Device configuration
│   │   ├── simulation_detail.html
│   │   └── results.html
│   └── static/
│       ├── css/
│       │   └── style.css     # Custom styling
│       └── js/
│           ├── utils.js      # Utility functions
│           ├── dashboard.js
│           ├── devices.js
│           ├── simulation_detail.js
│           └── results.js
├── run.py                    # Application entry point
├── requirements.txt          # Python dependencies
└── README.md
```

## API Reference

### Simulations

**Create Simulation**
```
POST /api/simulation/create
Content-Type: application/json

{
  "name": "My MOSFET",
  "device_type": "mosfet",
  "parameters": {
    "channel_length": 0.05,
    "temperature": 300
  }
}
```

**List Simulations**
```
GET /api/simulation/list
```

**Get Simulation**
```
GET /api/simulation/<sim_id>
```

**Run Simulation**
```
POST /api/simulation/run/<sim_id>
```

**Delete Simulation**
```
DELETE /api/simulation/<sim_id>
```

### Devices

**List Device Presets**
```
GET /api/devices/presets
```

**Get Preset Configuration**
```
GET /api/devices/presets/<device_type>
```

### Results

**Get Results**
```
GET /api/results/<sim_id>
```

**List Output Files**
```
GET /api/results/<sim_id>/outputs
```

**Download Output File**
```
GET /api/results/<sim_id>/download/<filename>
```

## Environment Variables

- `PORT`: Server port (default: 8001)
- `DEBUG`: Enable debug mode (default: True)
- `SECRET_KEY`: Flask secret key (default: dev-secret-key-change-in-production)

## Configuration

Modify the default settings in `app/__init__.py`:
- `MAX_CONTENT_LENGTH`: Maximum upload file size (default: 16MB)
- `UPLOAD_FOLDER`: Directory for uploaded files
- `SIMULATIONS_FOLDER`: Directory for simulation data
- `OUTPUTS_FOLDER`: Directory for simulation outputs

## Development

### Adding New Device Types

1. Add preset in `app/models.py`:
```python
'my_device': {
    'label': 'My Device',
    'description': 'Device description',
    'parameters': {...}
}
```

2. Add simulation creator in `app/simulation_runner.py`:
```python
def _create_my_device_sim(self, temp_dir: str) -> Simulation:
    # Implementation
```

### Customizing the UI

- Modify templates in `app/templates/`
- Update styles in `app/static/css/style.css`
- Add functionality in `app/static/js/`

## Troubleshooting

### PADRE Library Not Found
Ensure nanohub-padre is installed:
```bash
pip install nanohub-padre
```

### Port Already in Use
Change the port:
```bash
PORT=8002 python run.py
```

### Permission Denied
Check file permissions in the `app/` directory:
```bash
chmod -R 755 app/
```

## License

This web application is designed to work with the nanohub-padre library.

## Support

For issues or questions:
- Check the PADRE documentation
- Review simulation logs in `logs/padre_web.log`
- Verify nanohub-padre installation

## Future Features

- 📊 Advanced results visualization with plots
- 💾 Simulation template saving
- 🔗 Batch simulation support
- 🔐 User authentication
- 📤 Cloud simulation support
- 📱 Mobile-responsive improvements
- 🎯 Parameter optimization
