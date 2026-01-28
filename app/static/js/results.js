/* Results Page Logic */

let resultsSimulation = null;
let outputFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    loadResults();
});

async function loadResults() {
    try {
        const result = await apiCall(`/api/simulation/${simId}`);

        if (result.success) {
            resultsSimulation = result.simulation;

            if (resultsSimulation.status !== 'completed') {
                showAlert('This simulation has not completed yet!', 'warning');
                document.getElementById('backToSimBtn').href = `${getBasePath()}/simulation/${simId}`;
                return;
            }

            renderResultsHeader();
            await loadOutputFiles();
        }
    } catch (error) {
        console.error('Error loading results:', error);
        showAlert('Failed to load results', 'danger');
    }
}

function renderResultsHeader() {
    const sim = resultsSimulation;

    document.getElementById('resultsTitle').textContent = sim.name;
    document.getElementById('resultsDescription').textContent =
        `Device: ${sim.device_type.toUpperCase()} • Completed: ${formatDate(sim.completed_at)}`;
    document.getElementById('backToSimBtn').href = `${getBasePath()}/simulation/${simId}`;
}

async function loadOutputFiles() {
    try {
        const result = await apiCall(`/api/results/${simId}/outputs`);

        if (result.success) {
            outputFiles = result.files;
            renderOutputFiles(result.files);
            await loadAndDisplayData(result.files);
        }
    } catch (error) {
        console.error('Error loading output files:', error);
        showAlert('Failed to load output files', 'danger');
    }
}

function renderOutputFiles(files) {
    const container = document.getElementById('outputFilesList');

    if (files.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-3">No output files available</p>';
        return;
    }

    const basePath = getBasePath();
    container.innerHTML = files.map(file => `
        <a href="${basePath}/api/results/${simId}/download/${file.name}"
           class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
            <div>
                <h6 class="mb-1">${file.name}</h6>
                <small class="text-muted">${formatFileSize(file.size)}</small>
            </div>
            <i class="fas fa-download"></i>
        </a>
    `).join('');
}

async function loadAndDisplayData(files) {
    // Categorize files by type
    const ivFiles = [];
    const bandFiles = [];
    const meshFiles = [];
    const otherFiles = [];

    for (const file of files) {
        const name = file.name.toLowerCase();
        if (name === 'iv' || name.includes('iv.')) {
            ivFiles.push(file);
        } else if (name.startsWith('cb') || name.startsWith('vb') || name.startsWith('qf')) {
            bandFiles.push(file);
        } else if (name.includes('mesh')) {
            meshFiles.push(file);
        } else if (!name.endsWith('.deck') && !name.endsWith('.inp')) {
            otherFiles.push(file);
        }
    }

    // Load and display I-V curves
    if (ivFiles.length > 0) {
        await loadIVData(ivFiles);
    }

    // Load and display band diagrams
    if (bandFiles.length > 0) {
        await loadBandData(bandFiles);
    }

    // Load and display mesh
    if (meshFiles.length > 0) {
        await loadMeshData(meshFiles);
    }

    // Update plots tab with any available data
    updatePlotsTab(ivFiles, bandFiles, otherFiles);
}

async function loadIVData(files) {
    const plotsContainer = document.getElementById('plotsVisualization');
    plotsContainer.innerHTML = '';

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data.values && result.data.values.length > 0) {
                const chartDiv = document.createElement('div');
                chartDiv.id = `iv-chart-${file.name}`;
                chartDiv.style.height = '400px';
                chartDiv.style.marginBottom = '20px';
                plotsContainer.appendChild(chartDiv);

                plotIVCurve(chartDiv.id, result.data, file.name);
            }
        } catch (error) {
            console.error(`Error loading IV file ${file.name}:`, error);
        }
    }
}

function plotIVCurve(containerId, data, filename) {
    const values = data.values;
    if (!values || values.length === 0) return;

    const voltages = values.map(row => row[0]);
    const currents = values.map(row => row[1]);

    const trace = {
        x: voltages,
        y: currents,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'I-V Characteristic',
        line: { color: '#007bff', width: 2 },
        marker: { size: 4 }
    };

    const layout = {
        title: `I-V Characteristic - ${filename}`,
        xaxis: {
            title: 'Voltage (V)',
            gridcolor: '#e0e0e0'
        },
        yaxis: {
            title: 'Current (A)',
            gridcolor: '#e0e0e0',
            exponentformat: 'e'
        },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

async function loadBandData(files) {
    const dataContainer = document.getElementById('solutionDataView');
    dataContainer.innerHTML = '';

    // Group files by prefix (eq, fwd, rev, etc.)
    const fileGroups = {};
    for (const file of files) {
        const name = file.name.toLowerCase();
        // Extract prefix like 'eq', 'fwd', 'rev'
        let prefix = 'other';
        if (name.startsWith('cb') || name.startsWith('vb') || name.startsWith('qf')) {
            prefix = name.substring(2) || 'eq';
        }
        if (!fileGroups[prefix]) {
            fileGroups[prefix] = [];
        }
        fileGroups[prefix].push(file);
    }

    // Create a chart for each group
    for (const [prefix, groupFiles] of Object.entries(fileGroups)) {
        const chartDiv = document.createElement('div');
        chartDiv.id = `band-chart-${prefix}`;
        chartDiv.style.height = '400px';
        chartDiv.style.marginBottom = '20px';
        dataContainer.appendChild(chartDiv);

        const traces = [];
        for (const file of groupFiles) {
            try {
                const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
                if (result.success && result.data.values && result.data.values.length > 0) {
                    const values = result.data.values;
                    const positions = values.map(row => row[0]);
                    const energies = values.map(row => row[1]);

                    let traceName = file.name;
                    let color = '#333';
                    const nameLower = file.name.toLowerCase();
                    if (nameLower.startsWith('cb')) {
                        traceName = 'Conduction Band';
                        color = '#dc3545';
                    } else if (nameLower.startsWith('vb')) {
                        traceName = 'Valence Band';
                        color = '#007bff';
                    } else if (nameLower.startsWith('qfn')) {
                        traceName = 'Quasi-Fermi (e)';
                        color = '#28a745';
                    } else if (nameLower.startsWith('qfp')) {
                        traceName = 'Quasi-Fermi (h)';
                        color = '#fd7e14';
                    }

                    traces.push({
                        x: positions,
                        y: energies,
                        type: 'scatter',
                        mode: 'lines',
                        name: traceName,
                        line: { color: color, width: 2 }
                    });
                }
            } catch (error) {
                console.error(`Error loading band file ${file.name}:`, error);
            }
        }

        if (traces.length > 0) {
            const title = prefix === 'eq' ? 'Band Diagram (Equilibrium)' :
                         prefix === 'fwd' ? 'Band Diagram (Forward Bias)' :
                         prefix === 'rev' ? 'Band Diagram (Reverse Bias)' :
                         `Band Diagram (${prefix})`;

            const layout = {
                title: title,
                xaxis: {
                    title: 'Position (μm)',
                    gridcolor: '#e0e0e0'
                },
                yaxis: {
                    title: 'Energy (eV)',
                    gridcolor: '#e0e0e0'
                },
                plot_bgcolor: '#fafafa',
                paper_bgcolor: '#ffffff',
                margin: { t: 50, r: 30, b: 50, l: 70 },
                legend: { x: 1, xanchor: 'right', y: 1 }
            };

            Plotly.newPlot(chartDiv.id, traces, layout, { responsive: true });
        }
    }

    if (dataContainer.innerHTML === '') {
        dataContainer.innerHTML = '<p class="text-muted text-center p-5">No band diagram data available</p>';
    }
}

async function loadMeshData(files) {
    const meshContainer = document.getElementById('meshVisualization');
    meshContainer.innerHTML = '';

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data.values && result.data.values.length > 0) {
                const chartDiv = document.createElement('div');
                chartDiv.id = `mesh-chart-${file.name}`;
                chartDiv.style.height = '500px';
                meshContainer.appendChild(chartDiv);

                plotMesh(chartDiv.id, result.data, file.name);
            }
        } catch (error) {
            console.error(`Error loading mesh file ${file.name}:`, error);
        }
    }

    if (meshContainer.innerHTML === '') {
        meshContainer.innerHTML = '<p class="text-muted text-center p-5">No mesh data available</p>';
    }
}

function plotMesh(containerId, data, filename) {
    const values = data.values;
    if (!values || values.length === 0) return;

    const x = values.map(row => row[0]);
    const y = values.map(row => row[1]);

    const trace = {
        x: x,
        y: y,
        type: 'scatter',
        mode: 'markers',
        name: 'Mesh Points',
        marker: {
            size: 3,
            color: '#007bff'
        }
    };

    const layout = {
        title: `Device Mesh - ${filename}`,
        xaxis: {
            title: 'X (μm)',
            gridcolor: '#e0e0e0',
            scaleanchor: 'y',
            scaleratio: 1
        },
        yaxis: {
            title: 'Y (μm)',
            gridcolor: '#e0e0e0'
        },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function updatePlotsTab(ivFiles, bandFiles, otherFiles) {
    const plotsContainer = document.getElementById('plotsVisualization');

    // If no IV data was plotted yet, show message
    if (plotsContainer.innerHTML === '') {
        if (ivFiles.length === 0 && otherFiles.length === 0) {
            plotsContainer.innerHTML = '<p class="text-muted text-center p-5">No plot data available. Enable I-V logging in device settings.</p>';
        }
    }
}
