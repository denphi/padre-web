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

function categorizeFile(filename) {
    // Helper function to categorize a file based on its name
    // PADRE uses names like: vband, cband, pot, ele, hole, qfn, qfp, efield, mesh, iv, etc.
    const name = filename.toLowerCase();
    // Remove common extensions for pattern matching
    const nameBase = name.replace(/\.(txt|dat|out|log)$/i, '');

    // I-V data files (iv, idvg, idvd, etc.)
    if (nameBase.includes('iv') || nameBase.includes('current') ||
        nameBase.startsWith('id') || nameBase.startsWith('ig') || nameBase.startsWith('is')) {
        return 'iv';
    }
    // C-V data files
    if (nameBase.includes('cv') || nameBase.includes('capacitance')) {
        return 'cv';
    }
    // Band diagram files (vband, cband, vb, cb, etc.)
    if (nameBase.includes('vband') || nameBase.includes('cband') ||
        nameBase.includes('band.val') || nameBase.includes('band.con') ||
        nameBase === 'vb' || nameBase === 'cb' ||
        nameBase.startsWith('vb') || nameBase.startsWith('cb')) {
        return 'band';
    }
    // Quasi-Fermi level files (qfn, qfp, fermi)
    if (nameBase.includes('qfn') || nameBase.includes('qfp') ||
        nameBase.includes('qf') || nameBase.includes('fermi') ||
        nameBase.includes('efn') || nameBase.includes('efp')) {
        return 'qf';
    }
    // Mesh files
    if (nameBase.includes('mesh') || nameBase.includes('grid')) {
        return 'mesh';
    }
    // Carrier concentration files (ele, hole, electron, hole concentrations)
    if (nameBase === 'ele' || nameBase === 'hole' ||
        nameBase.startsWith('ele') || nameBase.startsWith('hole') ||
        nameBase.includes('electron') || nameBase.includes('carrier') ||
        nameBase.includes('density') || nameBase.includes('concentration')) {
        return 'carrier';
    }
    // Electric field or potential files (pot, efield, phi, psi)
    if (nameBase === 'pot' || nameBase.startsWith('pot') ||
        nameBase.includes('efield') || nameBase.includes('field') ||
        nameBase.includes('potential') || nameBase.includes('phi') || nameBase.includes('psi')) {
        return 'field';
    }
    // Charge/recombination files
    if (nameBase === 'ro' || nameBase.startsWith('ro') ||
        nameBase.includes('recomb') || nameBase.includes('charge')) {
        return 'other';
    }
    // Current density files
    if (nameBase.startsWith('j') || nameBase.includes('jtot') ||
        nameBase.includes('jelectr') || nameBase.includes('jhole')) {
        return 'iv';
    }
    // Doping files
    if (nameBase === 'dop' || nameBase.startsWith('dop') ||
        nameBase.includes('doping') || nameBase.includes('dopant')) {
        return 'field';
    }
    // Input deck files
    if (name.endsWith('.deck') || name.endsWith('.inp') || name.endsWith('.in')) {
        return 'deck';
    }
    return 'other';
}

function renderOutputFiles(files) {
    const container = document.getElementById('outputFilesList');

    if (files.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-3 mb-0">No output files available</p>';
        return;
    }

    const basePath = getBasePath();

    // Categories that support plotting (plottable groups)
    const plottableCategories = ['iv', 'cv', 'band', 'qf', 'mesh', 'carrier', 'field'];

    // Categorize files using the helper function
    const categories = {
        iv: { label: 'I-V Data', files: [], icon: 'fas fa-chart-line' },
        cv: { label: 'C-V Data', files: [], icon: 'fas fa-chart-area' },
        band: { label: 'Band Diagrams', files: [], icon: 'fas fa-wave-square' },
        qf: { label: 'Quasi-Fermi Levels', files: [], icon: 'fas fa-level-up-alt' },
        mesh: { label: 'Mesh', files: [], icon: 'fas fa-th' },
        carrier: { label: 'Carrier Density', files: [], icon: 'fas fa-atom' },
        field: { label: 'Electric Field/Potential', files: [], icon: 'fas fa-bolt' },
        deck: { label: 'Input Files', files: [], icon: 'fas fa-file-code' },
        other: { label: 'Other Files', files: [], icon: 'fas fa-file' }
    };

    for (const file of files) {
        const category = categorizeFile(file.name);
        categories[category].files.push(file);
    }

    // Build accordion HTML
    let html = '<div class="accordion" id="outputFilesAccordion">';
    let isFirst = true;

    for (const [catKey, catData] of Object.entries(categories)) {
        if (catData.files.length > 0) {
            const isPlottable = plottableCategories.includes(catKey);
            const collapseId = `collapse-${catKey}`;
            const headerId = `header-${catKey}`;
            // Only expand the first plottable group
            const isExpanded = isFirst && isPlottable;

            // Add "Plot All" button for plottable categories with multiple files
            const plotAllBtn = isPlottable && catData.files.length > 1
                ? `<span class="badge bg-primary ms-auto me-2 plot-all-btn" data-category="${catKey}" title="Plot all ${catData.label}" style="cursor: pointer;">
                       <i class="fas fa-layer-group"></i> Plot All
                   </span>`
                : '';

            html += `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="${headerId}">
                        <button class="accordion-button ${isExpanded ? '' : 'collapsed'} py-2" type="button"
                                data-bs-toggle="collapse" data-bs-target="#${collapseId}"
                                aria-expanded="${isExpanded}" aria-controls="${collapseId}">
                            <i class="${catData.icon} me-2"></i>
                            <span>${catData.label}</span>
                            <span class="badge bg-secondary ms-2">${catData.files.length}</span>
                            ${plotAllBtn}
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}"
                         aria-labelledby="${headerId}" data-bs-parent="#outputFilesAccordion">
                        <div class="accordion-body p-0">
                            <div class="list-group list-group-flush">
                                ${catData.files.map(file => renderFileItem(file, catKey, basePath, isPlottable)).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            if (isPlottable) {
                isFirst = false;
            }
        }
    }

    html += '</div>';
    container.innerHTML = html;

    // Add click handlers for plottable files (single file plot)
    container.querySelectorAll('.file-item-plottable').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const filename = item.dataset.filename;
            const fileType = item.dataset.filetype;
            onFileClick(filename, fileType);
        });
    });

    // Add click handlers for "Plot All" buttons (overlay all files in category)
    container.querySelectorAll('.plot-all-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent accordion toggle
            const category = btn.dataset.category;
            const files = categories[category].files;
            onCategoryPlotAll(category, files);
        });
    });
}

function renderFileItem(file, fileType, basePath, isPlottable) {
    const icon = getFileIcon(fileType);

    if (isPlottable) {
        // Plottable file: clickable with plot icon and download button
        return `
            <a href="#" class="list-group-item list-group-item-action file-item-plottable d-flex justify-content-between align-items-center py-2"
               data-filename="${file.name}" data-filetype="${fileType}">
                <div class="d-flex align-items-center">
                    <i class="${icon} me-2 text-muted"></i>
                    <div>
                        <div class="small">${file.name}</div>
                        <small class="text-muted">${formatFileSize(file.size)}</small>
                    </div>
                </div>
                <div class="d-flex align-items-center">
                    <span class="badge bg-primary me-2" title="Click to plot">
                        <i class="fas fa-chart-line"></i>
                    </span>
                    <a href="${basePath}/api/results/${simId}/download/${file.name}"
                       class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation();" title="Download">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            </a>
        `;
    } else {
        // Non-plottable file: only download option, not clickable
        return `
            <div class="list-group-item d-flex justify-content-between align-items-center py-2">
                <div class="d-flex align-items-center">
                    <i class="${icon} me-2 text-muted"></i>
                    <div>
                        <div class="small">${file.name}</div>
                        <small class="text-muted">${formatFileSize(file.size)}</small>
                    </div>
                </div>
                <a href="${basePath}/api/results/${simId}/download/${file.name}"
                   class="btn btn-sm btn-outline-secondary" title="Download">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `;
    }
}

function getFileIcon(fileType) {
    switch (fileType) {
        case 'iv': return 'fas fa-chart-line';
        case 'cv': return 'fas fa-chart-area';
        case 'band': return 'fas fa-wave-square';
        case 'qf': return 'fas fa-level-up-alt';
        case 'mesh': return 'fas fa-th';
        case 'carrier': return 'fas fa-atom';
        case 'field': return 'fas fa-bolt';
        case 'deck': return 'fas fa-file-code';
        default: return 'fas fa-file';
    }
}

async function onFileClick(filename, fileType) {
    try {
        // Switch to the Plots tab
        const plotsTab = document.getElementById('plotsTab');
        if (plotsTab) {
            const tab = new bootstrap.Tab(plotsTab);
            tab.show();
        }

        // Load and plot the single file
        const result = await apiCall(`/api/results/${simId}/file/${filename}`);

        if (result.success && result.data) {
            plotSelectedFile(result.data, filename, fileType);
        }
    } catch (error) {
        console.error(`Error loading file ${filename}:`, error);
        showAlert(`Failed to load file: ${filename}`, 'danger');
    }
}

async function onCategoryPlotAll(category, files) {
    try {
        // Switch to the Plots tab
        const plotsTab = document.getElementById('plotsTab');
        if (plotsTab) {
            const tab = new bootstrap.Tab(plotsTab);
            tab.show();
        }

        // Handle different categories
        if (category === 'band' || category === 'qf') {
            await plotAllBandDiagrams(files);
        } else if (category === 'iv' || category === 'cv') {
            await plotAllIVCurves(files, category);
        } else if (category === 'carrier') {
            await plotAllCarriers(files);
        } else if (category === 'field') {
            await plotAllFields(files);
        } else {
            // Generic overlay for other categories
            await plotAllGeneric(files, category);
        }
    } catch (error) {
        console.error(`Error plotting category ${category}:`, error);
        showAlert(`Failed to plot ${category}`, 'danger');
    }
}

async function plotAllBandDiagrams(files) {
    // Also include qf files if plotting band diagrams
    const allBandFiles = outputFiles.filter(file => {
        const cat = categorizeFile(file.name);
        return cat === 'band' || cat === 'qf';
    });

    const traces = [];
    const biasColors = {
        'eq': { cb: '#dc3545', vb: '#007bff', qfn: '#28a745', qfp: '#fd7e14' },
        'fwd': { cb: '#c82333', vb: '#0056b3', qfn: '#1e7e34', qfp: '#e06400' },
        'rev': { cb: '#a71d2a', vb: '#004494', qfn: '#155724', qfp: '#c55a00' }
    };

    for (const file of allBandFiles) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const positions = values.map(row => row[0]);
                const energies = values.map(row => row[1]);

                const biasCondition = extractBiasCondition(file.name);
                const { traceName, colorKey } = getBandTraceInfo(result.data.variable, file.name);
                const colors = biasColors[biasCondition] || biasColors['eq'];
                const color = colors[colorKey] || '#333';

                // Add bias condition to trace name if not equilibrium
                const fullTraceName = biasCondition === 'eq' ? traceName : `${traceName} (${biasCondition})`;

                traces.push({
                    x: positions,
                    y: energies,
                    type: 'scatter',
                    mode: 'lines',
                    name: fullTraceName,
                    line: { color: color, width: 2 }
                });
            }
        } catch (error) {
            console.error(`Error loading band file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const layout = {
            title: 'Band Diagram (All Conditions)',
            xaxis: { title: 'Position (μm)', gridcolor: '#e0e0e0' },
            yaxis: { title: 'Energy (eV)', gridcolor: '#e0e0e0' },
            plot_bgcolor: '#fafafa',
            paper_bgcolor: '#ffffff',
            margin: { t: 50, r: 30, b: 50, l: 70 },
            legend: { x: 1, xanchor: 'right', y: 1 },
            showlegend: true
        };

        const containerId = 'plotsVisualization';
        document.getElementById(containerId).innerHTML = '<div id="mainPlotArea" style="height: 450px;"></div>';
        Plotly.newPlot('mainPlotArea', traces, layout, { responsive: true });
    }
}

async function plotAllIVCurves(files, category) {
    const traces = [];
    const colors = ['#007bff', '#dc3545', '#28a745', '#fd7e14', '#6f42c1', '#17a2b8'];
    let colorIndex = 0;

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const x = values.map(row => row[0]);
                const y = values.map(row => row[1]);

                traces.push({
                    x: x,
                    y: y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: file.name,
                    line: { color: colors[colorIndex % colors.length], width: 2 },
                    marker: { size: 4 }
                });
                colorIndex++;
            }
        } catch (error) {
            console.error(`Error loading IV file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const title = category === 'cv' ? 'C-V Characteristics' : 'I-V Characteristics';
        const yLabel = category === 'cv' ? 'Capacitance (F)' : 'Current (A)';

        const layout = {
            title: title,
            xaxis: { title: 'Voltage (V)', gridcolor: '#e0e0e0' },
            yaxis: { title: yLabel, gridcolor: '#e0e0e0', exponentformat: 'e' },
            plot_bgcolor: '#fafafa',
            paper_bgcolor: '#ffffff',
            margin: { t: 50, r: 30, b: 50, l: 70 },
            legend: { x: 1, xanchor: 'right', y: 1 },
            showlegend: true
        };

        const containerId = 'plotsVisualization';
        document.getElementById(containerId).innerHTML = '<div id="mainPlotArea" style="height: 450px;"></div>';
        Plotly.newPlot('mainPlotArea', traces, layout, { responsive: true });
    }
}

async function plotAllCarriers(files) {
    const traces = [];

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const x = values.map(row => row[0]);
                const y = values.map(row => row[1]);

                let traceName = file.name;
                let color = '#6f42c1';
                const variable = result.data.variable || '';

                if (variable === 'electrons' || file.name.toLowerCase().includes('ele')) {
                    traceName = 'Electrons';
                    color = '#007bff';
                } else if (variable === 'holes' || file.name.toLowerCase().includes('hole')) {
                    traceName = 'Holes';
                    color = '#dc3545';
                }

                traces.push({
                    x: x,
                    y: y,
                    type: 'scatter',
                    mode: 'lines',
                    name: traceName,
                    line: { color: color, width: 2 }
                });
            }
        } catch (error) {
            console.error(`Error loading carrier file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const layout = {
            title: 'Carrier Concentrations',
            xaxis: { title: 'Position (μm)', gridcolor: '#e0e0e0' },
            yaxis: { title: 'Concentration (/cm³)', gridcolor: '#e0e0e0', type: 'log', exponentformat: 'e' },
            plot_bgcolor: '#fafafa',
            paper_bgcolor: '#ffffff',
            margin: { t: 50, r: 30, b: 50, l: 70 },
            legend: { x: 1, xanchor: 'right', y: 1 },
            showlegend: true
        };

        const containerId = 'plotsVisualization';
        document.getElementById(containerId).innerHTML = '<div id="mainPlotArea" style="height: 450px;"></div>';
        Plotly.newPlot('mainPlotArea', traces, layout, { responsive: true });
    }
}

async function plotAllFields(files) {
    const traces = [];
    const colors = ['#fd7e14', '#20c997', '#6f42c1', '#17a2b8'];
    let colorIndex = 0;

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const x = values.map(row => row[0]);
                const y = values.map(row => row[1]);

                let traceName = file.name;
                const variable = result.data.variable || '';

                if (variable === 'potential') {
                    traceName = 'Potential';
                } else if (variable === 'e_field') {
                    traceName = 'Electric Field';
                } else if (variable === 'doping') {
                    traceName = 'Doping';
                }

                traces.push({
                    x: x,
                    y: y,
                    type: 'scatter',
                    mode: 'lines',
                    name: traceName,
                    line: { color: colors[colorIndex % colors.length], width: 2 }
                });
                colorIndex++;
            }
        } catch (error) {
            console.error(`Error loading field file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const layout = {
            title: 'Electric Field / Potential',
            xaxis: { title: 'Position (μm)', gridcolor: '#e0e0e0' },
            yaxis: { title: 'Value', gridcolor: '#e0e0e0', exponentformat: 'e' },
            plot_bgcolor: '#fafafa',
            paper_bgcolor: '#ffffff',
            margin: { t: 50, r: 30, b: 50, l: 70 },
            legend: { x: 1, xanchor: 'right', y: 1 },
            showlegend: true
        };

        const containerId = 'plotsVisualization';
        document.getElementById(containerId).innerHTML = '<div id="mainPlotArea" style="height: 450px;"></div>';
        Plotly.newPlot('mainPlotArea', traces, layout, { responsive: true });
    }
}

async function plotAllGeneric(files, category) {
    const traces = [];
    const colors = ['#007bff', '#dc3545', '#28a745', '#fd7e14', '#6f42c1', '#17a2b8'];
    let colorIndex = 0;

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const x = values.map(row => row[0]);
                const y = values.map(row => row[1]);

                traces.push({
                    x: x,
                    y: y,
                    type: 'scatter',
                    mode: 'lines',
                    name: file.name,
                    line: { color: colors[colorIndex % colors.length], width: 2 }
                });
                colorIndex++;
            }
        } catch (error) {
            console.error(`Error loading file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const layout = {
            title: category.charAt(0).toUpperCase() + category.slice(1),
            xaxis: { title: 'X', gridcolor: '#e0e0e0' },
            yaxis: { title: 'Y', gridcolor: '#e0e0e0', exponentformat: 'e' },
            plot_bgcolor: '#fafafa',
            paper_bgcolor: '#ffffff',
            margin: { t: 50, r: 30, b: 50, l: 70 },
            legend: { x: 1, xanchor: 'right', y: 1 },
            showlegend: true
        };

        const containerId = 'plotsVisualization';
        document.getElementById(containerId).innerHTML = '<div id="mainPlotArea" style="height: 450px;"></div>';
        Plotly.newPlot('mainPlotArea', traces, layout, { responsive: true });
    }
}

function extractBiasCondition(filename) {
    const name = filename.toLowerCase().replace(/\.(txt|dat|out|log)$/i, '');

    if (name.includes('fwd') || name.includes('forward')) return 'fwd';
    if (name.includes('rev') || name.includes('reverse')) return 'rev';
    if (name.includes('eq') || name.endsWith('eq')) return 'eq';

    // Extract suffix after band type prefix
    const match = name.match(/^(cb|vb|qf|qfn|qfp|ec|ev|efn|efp)(.*)$/);
    if (match && match[2]) {
        const suffix = match[2].replace(/^[_\-]/, '');
        return suffix || 'eq';
    }

    return 'eq';
}

function getBandTraceInfo(variable, filename) {
    // Returns traceName and colorKey for band diagrams
    if (variable === 'band_con') {
        return { traceName: 'Ec', colorKey: 'cb' };
    } else if (variable === 'band_val') {
        return { traceName: 'Ev', colorKey: 'vb' };
    } else if (variable === 'qfn') {
        return { traceName: 'Efn', colorKey: 'qfn' };
    } else if (variable === 'qfp') {
        return { traceName: 'Efp', colorKey: 'qfp' };
    }

    // Fallback to filename detection
    const nameLower = filename.toLowerCase();
    if (nameLower.includes('cb') || nameLower.includes('ec') || nameLower.includes('conduction')) {
        return { traceName: 'Ec', colorKey: 'cb' };
    } else if (nameLower.includes('vb') || nameLower.includes('ev') || nameLower.includes('valence')) {
        return { traceName: 'Ev', colorKey: 'vb' };
    } else if (nameLower.includes('qfn') || nameLower.includes('efn')) {
        return { traceName: 'Efn', colorKey: 'qfn' };
    } else if (nameLower.includes('qfp') || nameLower.includes('efp')) {
        return { traceName: 'Efp', colorKey: 'qfp' };
    }

    return { traceName: filename, colorKey: 'cb' };
}

function getBandTraceStyle(variable, filename) {
    const info = getBandTraceInfo(variable, filename);
    const colors = { cb: '#dc3545', vb: '#007bff', qfn: '#28a745', qfp: '#fd7e14' };
    return { traceName: info.traceName, color: colors[info.colorKey] || '#333' };
}

function plotSelectedFile(data, filename, fileType) {
    // Plot in the main visualization area
    const mainContainer = document.getElementById('plotsVisualization');
    mainContainer.innerHTML = '<div id="mainPlotArea" style="height: 450px;"></div>';
    const containerId = 'mainPlotArea';

    if (!data.values || data.values.length === 0) {
        mainContainer.innerHTML =
            '<p class="text-muted text-center py-5">No plottable data in this file</p>';
        return;
    }

    const values = data.values;

    // Determine how to plot based on data type (prefer backend type/variable, fallback to frontend category)
    // Priority: data.variable > data.type > fileType
    let plotType = fileType;
    if (data.type && data.type !== 'unknown') {
        plotType = data.type;
    }

    // Use variable for more specific plotting
    const variable = data.variable || '';
    if (variable === 'band_val' || variable === 'band_con') {
        plotType = 'band';
    } else if (variable === 'qfn' || variable === 'qfp') {
        plotType = 'qf';
    } else if (variable === 'electrons' || variable === 'holes') {
        plotType = 'carrier';
    } else if (variable === 'potential' || variable === 'e_field') {
        plotType = 'field';
    }

    // Use backend column labels if available
    const columns = data.columns || [];

    switch (plotType) {
        case 'iv':
        case 'cv':
            plotIVData(containerId, values, filename, columns);
            break;
        case 'band':
        case 'qf':
            plotBandData(containerId, values, filename, variable, columns);
            break;
        case 'mesh':
            plotMeshData(containerId, values, filename);
            break;
        case 'carrier':
            plotCarrierData(containerId, values, filename, variable, columns);
            break;
        case 'field':
            plotFieldData(containerId, values, filename, variable, columns);
            break;
        default:
            // Generic 2D plot
            plotGenericData(containerId, values, filename, columns);
    }
}

function plotCarrierData(containerId, values, filename, variable = '', columns = []) {
    const x = values.map(row => row[0]);
    const y = values.map(row => row[1]);

    let traceName = 'Carrier Density';
    let color = '#6f42c1';

    // Use variable from backend if available
    if (variable === 'electrons') {
        traceName = 'Electron Concentration';
        color = '#007bff';
    } else if (variable === 'holes') {
        traceName = 'Hole Concentration';
        color = '#dc3545';
    } else {
        // Fallback to filename detection
        const nameLower = filename.toLowerCase();
        if (nameLower.includes('electron') || nameLower.startsWith('ele')) {
            traceName = 'Electron Concentration';
            color = '#007bff';
        } else if (nameLower.includes('hole')) {
            traceName = 'Hole Concentration';
            color = '#dc3545';
        }
    }

    const trace = {
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        name: traceName,
        line: { color: color, width: 2 }
    };

    const xLabel = columns[0] || 'Position (μm)';
    const yLabel = columns[1] || 'Concentration (/cm³)';

    const layout = {
        title: `${traceName} - ${filename}`,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0', type: 'log', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotFieldData(containerId, values, filename, variable = '', columns = []) {
    const x = values.map(row => row[0]);
    const y = values.map(row => row[1]);

    let traceName = 'Electric Field';
    let yLabel = 'Field (V/cm)';
    let color = '#fd7e14';

    // Use variable from backend if available
    if (variable === 'potential') {
        traceName = 'Electrostatic Potential';
        yLabel = 'Potential (V)';
        color = '#20c997';
    } else if (variable === 'e_field') {
        traceName = 'Electric Field';
        yLabel = 'Field (V/cm)';
        color = '#fd7e14';
    } else if (variable === 'doping') {
        traceName = 'Doping Profile';
        yLabel = 'Doping (/cm³)';
        color = '#6f42c1';
    } else {
        // Fallback to filename detection
        const nameLower = filename.toLowerCase();
        if (nameLower.includes('potential') || nameLower.startsWith('pot') || nameLower.includes('phi') || nameLower.includes('psi')) {
            traceName = 'Electrostatic Potential';
            yLabel = 'Potential (V)';
            color = '#20c997';
        } else if (nameLower.includes('dop')) {
            traceName = 'Doping Profile';
            yLabel = 'Doping (/cm³)';
            color = '#6f42c1';
        }
    }

    // Use backend column labels if available
    const xLabel = columns[0] || 'Position (μm)';
    if (columns[1]) {
        yLabel = columns[1];
    }

    const trace = {
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        name: traceName,
        line: { color: color, width: 2 }
    };

    const layout = {
        title: `${traceName} - ${filename}`,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotIVData(containerId, values, filename, columns = []) {
    const voltages = values.map(row => row[0]);
    const currents = values.map(row => row[1]);

    // Use backend column labels if available
    const xLabel = columns[0] || 'Voltage (V)';
    const yLabel = columns[1] || 'Current (A)';

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
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotBandData(containerId, values, filename, variable = '', columns = []) {
    const positions = values.map(row => row[0]);
    const energies = values.map(row => row[1]);

    let traceName = filename;
    let color = '#333';

    // Use variable from backend if available (priority)
    if (variable === 'band_con') {
        traceName = 'Conduction Band (Ec)';
        color = '#dc3545';
    } else if (variable === 'band_val') {
        traceName = 'Valence Band (Ev)';
        color = '#007bff';
    } else if (variable === 'qfn') {
        traceName = 'Electron Quasi-Fermi (Efn)';
        color = '#28a745';
    } else if (variable === 'qfp') {
        traceName = 'Hole Quasi-Fermi (Efp)';
        color = '#fd7e14';
    } else {
        // Fallback to filename detection
        const nameLower = filename.toLowerCase();
        if (nameLower.includes('cb') || nameLower.includes('ec') || nameLower.includes('conduction')) {
            traceName = 'Conduction Band (Ec)';
            color = '#dc3545';
        } else if (nameLower.includes('vb') || nameLower.includes('ev') || nameLower.includes('valence')) {
            traceName = 'Valence Band (Ev)';
            color = '#007bff';
        } else if (nameLower.includes('qfn') || nameLower.includes('efn')) {
            traceName = 'Electron Quasi-Fermi (Efn)';
            color = '#28a745';
        } else if (nameLower.includes('qfp') || nameLower.includes('efp')) {
            traceName = 'Hole Quasi-Fermi (Efp)';
            color = '#fd7e14';
        } else if (nameLower.includes('qf') || nameLower.includes('fermi')) {
            traceName = 'Quasi-Fermi Level';
            color = '#17a2b8';
        }
    }

    // Use backend column labels if available
    const xLabel = columns[0] || 'Position (μm)';
    const yLabel = columns[1] || 'Energy (eV)';

    const trace = {
        x: positions,
        y: energies,
        type: 'scatter',
        mode: 'lines',
        name: traceName,
        line: { color: color, width: 2 }
    };

    const layout = {
        title: `${traceName} - ${filename}`,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0' },
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
    // Categorize files by type using the helper function
    const ivFiles = [];
    const cvFiles = [];
    const bandFiles = [];
    const meshFiles = [];

    for (const file of files) {
        const category = categorizeFile(file.name);
        switch (category) {
            case 'iv':
                ivFiles.push(file);
                break;
            case 'cv':
                cvFiles.push(file);
                break;
            case 'band':
            case 'qf':  // Include quasi-Fermi files with band diagrams
                bandFiles.push(file);
                break;
            case 'mesh':
                meshFiles.push(file);
                break;
        }
    }

    // Load and display I-V or C-V curves in the Plots tab
    const plotFiles = [...ivFiles, ...cvFiles];
    if (plotFiles.length > 0) {
        await loadIVData(plotFiles);
    } else {
        document.getElementById('plotsVisualization').innerHTML =
            '<p class="text-muted text-center p-5">No I-V or C-V data available. Click on an output file to view its plot.</p>';
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

    // Group files by bias condition (eq, fwd, rev, etc.)
    const fileGroups = {};
    for (const file of files) {
        const name = file.name.toLowerCase();
        const nameBase = name.replace(/\.(txt|dat|out|log)$/i, '');

        // Try to extract the bias condition from the filename
        let prefix = 'eq';  // Default to equilibrium
        if (nameBase.includes('_eq') || nameBase.includes('eq_') || nameBase.endsWith('eq')) {
            prefix = 'eq';
        } else if (nameBase.includes('_fwd') || nameBase.includes('fwd_') || nameBase.includes('forward')) {
            prefix = 'fwd';
        } else if (nameBase.includes('_rev') || nameBase.includes('rev_') || nameBase.includes('reverse')) {
            prefix = 'rev';
        } else if (nameBase.includes('_bias') || nameBase.includes('bias_')) {
            prefix = 'bias';
        } else {
            // Extract suffix after band type prefix (cb, vb, qf, etc.)
            const match = nameBase.match(/^(cb|vb|qf|qfn|qfp|ec|ev|efn|efp)(.*)$/);
            if (match && match[2]) {
                prefix = match[2].replace(/^[_\-]/, '') || 'eq';
            }
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
                    // Check for conduction band patterns
                    if (nameLower.includes('cb') || nameLower.includes('ec') || nameLower.includes('conduction')) {
                        traceName = 'Conduction Band';
                        color = '#dc3545';
                    // Check for valence band patterns
                    } else if (nameLower.includes('vb') || nameLower.includes('ev') || nameLower.includes('valence')) {
                        traceName = 'Valence Band';
                        color = '#007bff';
                    // Check for electron quasi-Fermi patterns
                    } else if (nameLower.includes('qfn') || nameLower.includes('efn') || (nameLower.includes('qf') && nameLower.includes('electron'))) {
                        traceName = 'Quasi-Fermi (e)';
                        color = '#28a745';
                    // Check for hole quasi-Fermi patterns
                    } else if (nameLower.includes('qfp') || nameLower.includes('efp') || (nameLower.includes('qf') && nameLower.includes('hole'))) {
                        traceName = 'Quasi-Fermi (h)';
                        color = '#fd7e14';
                    // Generic quasi-Fermi
                    } else if (nameLower.includes('qf') || nameLower.includes('fermi')) {
                        traceName = 'Quasi-Fermi';
                        color = '#17a2b8';
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
