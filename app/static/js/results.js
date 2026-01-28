/* Results Page Logic */

let resultsSimulation = null;
let outputFiles = [];
let currentDeckContent = '';

document.addEventListener('DOMContentLoaded', () => {
    loadResults();
    setupCollapsibles();
    setupEventHandlers();
});

function setupCollapsibles() {
    // Toggle chevron icons on collapse
    document.getElementById('outputFilesCollapse').addEventListener('show.bs.collapse', () => {
        document.getElementById('outputFilesChevron').classList.remove('fa-chevron-down');
        document.getElementById('outputFilesChevron').classList.add('fa-chevron-up');
    });
    document.getElementById('outputFilesCollapse').addEventListener('hide.bs.collapse', () => {
        document.getElementById('outputFilesChevron').classList.remove('fa-chevron-up');
        document.getElementById('outputFilesChevron').classList.add('fa-chevron-down');
    });
    document.getElementById('deckCollapse').addEventListener('show.bs.collapse', () => {
        document.getElementById('deckChevron').classList.remove('fa-chevron-down');
        document.getElementById('deckChevron').classList.add('fa-chevron-up');
    });
    document.getElementById('deckCollapse').addEventListener('hide.bs.collapse', () => {
        document.getElementById('deckChevron').classList.remove('fa-chevron-up');
        document.getElementById('deckChevron').classList.add('fa-chevron-down');
    });
}

function setupEventHandlers() {
    document.getElementById('closeSelectedPlot').addEventListener('click', () => {
        document.getElementById('selectedFilePlotCard').style.display = 'none';
    });

    document.getElementById('copyDeckBtn').addEventListener('click', () => {
        if (currentDeckContent) {
            copyToClipboard(currentDeckContent);
        }
    });

    document.getElementById('downloadDeckBtn').addEventListener('click', () => {
        if (currentDeckContent && resultsSimulation) {
            downloadDeck();
        }
    });
}

function downloadDeck() {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' +
        encodeURIComponent(currentDeckContent));
    element.setAttribute('download', `${resultsSimulation.name}.deck`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

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
            loadDeckContent();
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

async function loadDeckContent() {
    try {
        const result = await apiCall(`/api/simulation/${simId}/deck`);
        if (result.success && result.deck) {
            currentDeckContent = result.deck;
            document.getElementById('deckNotAvailable').style.display = 'none';
            document.getElementById('deckContent').style.display = 'block';
            document.getElementById('deckContent').textContent = result.deck;
            document.getElementById('deckActions').style.display = 'flex';
            document.getElementById('deckActions').style.setProperty('display', 'flex', 'important');
        }
    } catch (error) {
        console.error('Error loading deck:', error);
    }
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
        container.innerHTML = '<p class="text-muted text-center p-3 mb-0">No output files available</p>';
        return;
    }

    const basePath = getBasePath();

    // Categorize files
    const ivFiles = [];
    const bandFiles = [];
    const meshFiles = [];
    const deckFiles = [];
    const otherFiles = [];

    for (const file of files) {
        const name = file.name.toLowerCase();
        if (name === 'iv' || name.includes('iv.') || name.startsWith('iv')) {
            ivFiles.push(file);
        } else if (name.startsWith('cb') || name.startsWith('vb') || name.startsWith('qf')) {
            bandFiles.push(file);
        } else if (name.includes('mesh')) {
            meshFiles.push(file);
        } else if (name.endsWith('.deck') || name.endsWith('.inp')) {
            deckFiles.push(file);
        } else {
            otherFiles.push(file);
        }
    }

    let html = '';

    // I-V Files
    if (ivFiles.length > 0) {
        html += '<div class="list-group-item bg-light fw-bold small py-2">I-V Data</div>';
        html += ivFiles.map(file => renderFileItem(file, 'iv', basePath)).join('');
    }

    // Band Files
    if (bandFiles.length > 0) {
        html += '<div class="list-group-item bg-light fw-bold small py-2">Band Diagrams</div>';
        html += bandFiles.map(file => renderFileItem(file, 'band', basePath)).join('');
    }

    // Mesh Files
    if (meshFiles.length > 0) {
        html += '<div class="list-group-item bg-light fw-bold small py-2">Mesh</div>';
        html += meshFiles.map(file => renderFileItem(file, 'mesh', basePath)).join('');
    }

    // Deck Files
    if (deckFiles.length > 0) {
        html += '<div class="list-group-item bg-light fw-bold small py-2">Input Files</div>';
        html += deckFiles.map(file => renderFileItem(file, 'deck', basePath)).join('');
    }

    // Other Files
    if (otherFiles.length > 0) {
        html += '<div class="list-group-item bg-light fw-bold small py-2">Other</div>';
        html += otherFiles.map(file => renderFileItem(file, 'other', basePath)).join('');
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const filename = item.dataset.filename;
            const fileType = item.dataset.filetype;
            onFileClick(filename, fileType);
        });
    });
}

function renderFileItem(file, fileType, basePath) {
    const icon = getFileIcon(fileType);
    return `
        <a href="#" class="list-group-item list-group-item-action file-item d-flex justify-content-between align-items-center py-2"
           data-filename="${file.name}" data-filetype="${fileType}">
            <div class="d-flex align-items-center">
                <i class="${icon} me-2 text-muted"></i>
                <div>
                    <div class="small">${file.name}</div>
                    <small class="text-muted">${formatFileSize(file.size)}</small>
                </div>
            </div>
            <div class="d-flex align-items-center">
                <span class="badge bg-secondary me-2" title="Click to plot">
                    <i class="fas fa-chart-line"></i>
                </span>
                <a href="${basePath}/api/results/${simId}/download/${file.name}"
                   class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation();" title="Download">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        </a>
    `;
}

function getFileIcon(fileType) {
    switch (fileType) {
        case 'iv': return 'fas fa-chart-line';
        case 'band': return 'fas fa-wave-square';
        case 'mesh': return 'fas fa-th';
        case 'deck': return 'fas fa-file-code';
        default: return 'fas fa-file';
    }
}

async function onFileClick(filename, fileType) {
    try {
        const result = await apiCall(`/api/results/${simId}/file/${filename}`);

        if (result.success && result.data) {
            // Show the selected file plot card
            document.getElementById('selectedFilePlotCard').style.display = 'block';
            document.getElementById('selectedFileName').textContent = filename;

            // Plot based on file type
            plotSelectedFile(result.data, filename, fileType);

            // Scroll to the plot
            document.getElementById('selectedFilePlotCard').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error(`Error loading file ${filename}:`, error);
        showAlert(`Failed to load file: ${filename}`, 'danger');
    }
}

function plotSelectedFile(data, filename, fileType) {
    const containerId = 'selectedFilePlot';

    if (!data.values || data.values.length === 0) {
        document.getElementById(containerId).innerHTML =
            '<p class="text-muted text-center py-5">No plottable data in this file</p>';
        return;
    }

    const values = data.values;

    // Determine how to plot based on data type
    if (data.type === 'iv' || fileType === 'iv') {
        plotIVData(containerId, values, filename);
    } else if (data.type === 'band' || fileType === 'band') {
        plotBandData(containerId, values, filename);
    } else if (data.type === 'mesh' || fileType === 'mesh') {
        plotMeshData(containerId, values, filename);
    } else {
        // Generic 2D plot
        plotGenericData(containerId, values, filename, data.columns);
    }
}

function plotIVData(containerId, values, filename) {
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
        xaxis: { title: 'Voltage (V)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'Current (A)', gridcolor: '#e0e0e0', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotBandData(containerId, values, filename) {
    const positions = values.map(row => row[0]);
    const energies = values.map(row => row[1]);

    let traceName = filename;
    let color = '#333';
    const nameLower = filename.toLowerCase();
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

    const trace = {
        x: positions,
        y: energies,
        type: 'scatter',
        mode: 'lines',
        name: traceName,
        line: { color: color, width: 2 }
    };

    const layout = {
        title: `Band Diagram - ${filename}`,
        xaxis: { title: 'Position (μm)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'Energy (eV)', gridcolor: '#e0e0e0' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotMeshData(containerId, values, filename) {
    const x = values.map(row => row[0]);
    const y = values.map(row => row[1]);

    const trace = {
        x: x,
        y: y,
        type: 'scatter',
        mode: 'markers',
        name: 'Mesh Points',
        marker: { size: 3, color: '#007bff' }
    };

    const layout = {
        title: `Device Mesh - ${filename}`,
        xaxis: { title: 'X (μm)', gridcolor: '#e0e0e0', scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (μm)', gridcolor: '#e0e0e0' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotGenericData(containerId, values, filename, columns) {
    const x = values.map(row => row[0]);
    const y = values.map(row => row[1]);

    const trace = {
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Data',
        line: { color: '#007bff', width: 2 },
        marker: { size: 4 }
    };

    const xLabel = columns && columns[0] ? columns[0] : 'X';
    const yLabel = columns && columns[1] ? columns[1] : 'Y';

    const layout = {
        title: filename,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

async function loadAndDisplayData(files) {
    // Categorize files by type
    const ivFiles = [];
    const bandFiles = [];
    const meshFiles = [];

    for (const file of files) {
        const name = file.name.toLowerCase();
        if (name === 'iv' || name.includes('iv.') || name.startsWith('iv')) {
            ivFiles.push(file);
        } else if (name.startsWith('cb') || name.startsWith('vb') || name.startsWith('qf')) {
            bandFiles.push(file);
        } else if (name.includes('mesh')) {
            meshFiles.push(file);
        }
    }

    // Load and display I-V curves in the Plots tab
    if (ivFiles.length > 0) {
        await loadIVData(ivFiles);
    } else {
        document.getElementById('plotsVisualization').innerHTML =
            '<p class="text-muted text-center p-5">No I-V data available. Click on an output file to view its plot.</p>';
    }

    // Load and display band diagrams
    if (bandFiles.length > 0) {
        await loadBandData(bandFiles);
    } else {
        document.getElementById('solutionDataView').innerHTML =
            '<p class="text-muted text-center p-5">No band diagram data available.</p>';
    }

    // Load and display mesh
    if (meshFiles.length > 0) {
        await loadMeshData(meshFiles);
    } else {
        document.getElementById('meshVisualization').innerHTML =
            '<p class="text-muted text-center p-5">No mesh data available.</p>';
    }
}

async function loadIVData(files) {
    const plotsContainer = document.getElementById('plotsVisualization');
    plotsContainer.innerHTML = '';

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data.values && result.data.values.length > 0) {
                const chartDiv = document.createElement('div');
                chartDiv.id = `iv-chart-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                chartDiv.style.height = '400px';
                chartDiv.style.marginBottom = '20px';
                plotsContainer.appendChild(chartDiv);

                plotIVCurve(chartDiv.id, result.data, file.name);
            }
        } catch (error) {
            console.error(`Error loading IV file ${file.name}:`, error);
        }
    }

    if (plotsContainer.innerHTML === '') {
        plotsContainer.innerHTML = '<p class="text-muted text-center p-5">No I-V data could be plotted.</p>';
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
        xaxis: { title: 'Voltage (V)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'Current (A)', gridcolor: '#e0e0e0', exponentformat: 'e' },
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
                xaxis: { title: 'Position (μm)', gridcolor: '#e0e0e0' },
                yaxis: { title: 'Energy (eV)', gridcolor: '#e0e0e0' },
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
                chartDiv.id = `mesh-chart-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
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
        marker: { size: 3, color: '#007bff' }
    };

    const layout = {
        title: `Device Mesh - ${filename}`,
        xaxis: { title: 'X (μm)', gridcolor: '#e0e0e0', scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (μm)', gridcolor: '#e0e0e0' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}
