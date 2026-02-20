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

function categorizeFile(fileOrName) {
    // Accepts either a plain filename string or a file object {name, known_type, ...}.
    // When the simulation registry provides known_type, use it directly — no guessing.
    if (fileOrName && typeof fileOrName === 'object' && fileOrName.known_type) {
        return fileOrName.known_type;
    }
    const filename = (typeof fileOrName === 'object') ? fileOrName.name : fileOrName;
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
    // 2D contour files (Plot3D scatter): pot_eq, el_bias, hh_eq, ef_eq, dop_eq, qfn_eq, qfp_eq
    // Pattern: known_quantity + underscore + bias_suffix
    if (/^(pot|el|hh|ef|qfn|qfp|dop|nc|pc)_(eq|bias|fwd|rev)$/.test(nameBase)) {
        return 'contour';
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
    const plottableCategories = ['iv', 'cv', 'band', 'qf', 'mesh', 'carrier', 'field', 'contour'];

    // Categorize files using the helper function
    const categories = {
        iv: { label: 'I-V Data', files: [], icon: 'fas fa-chart-line' },
        cv: { label: 'C-V Data', files: [], icon: 'fas fa-chart-area' },
        band: { label: 'Band Diagrams', files: [], icon: 'fas fa-wave-square' },
        qf: { label: 'Quasi-Fermi Levels', files: [], icon: 'fas fa-level-up-alt' },
        mesh: { label: 'Mesh', files: [], icon: 'fas fa-th' },
        carrier: { label: 'Carrier Density', files: [], icon: 'fas fa-atom' },
        field: { label: 'Electric Field/Potential', files: [], icon: 'fas fa-bolt' },
        contour: { label: '2D Contour Maps', files: [], icon: 'fas fa-map' },
        deck: { label: 'Input Files', files: [], icon: 'fas fa-file-code' },
        other: { label: 'Other Files', files: [], icon: 'fas fa-file' }
    };

    for (const file of files) {
        const category = categorizeFile(file);
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

            // "Plot All" item inside accordion (first item) for plottable categories with multiple files
            const plotAllItem = isPlottable && catData.files.length > 1
                ? `<a href="#" class="list-group-item list-group-item-action plot-all-item d-flex align-items-center py-2"
                      data-category="${catKey}">
                       <i class="fas fa-layer-group me-2 text-primary"></i>
                       <span class="text-primary fw-semibold">Plot All ${catData.label}</span>
                   </a>`
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
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}"
                         aria-labelledby="${headerId}" data-bs-parent="#outputFilesAccordion">
                        <div class="accordion-body p-0">
                            <div class="list-group list-group-flush">
                                ${plotAllItem}
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

    // Add click handlers for "Plot All" items (overlay all files in category)
    container.querySelectorAll('.plot-all-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const category = item.dataset.category;
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
        case 'contour': return 'fas fa-map';
        case 'deck': return 'fas fa-file-code';
        default: return 'fas fa-file';
    }
}

async function onFileClick(filename, fileType) {
    try {
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
        // Handle different categories
        if (category === 'band' || category === 'qf') {
            await plotAllBandDiagrams(files);
        } else if (category === 'iv' || category === 'cv') {
            await plotAllIVCurves(files, category);
        } else if (category === 'carrier') {
            await plotAllCarriers(files);
        } else if (category === 'field') {
            await plotAllFields(files);
        } else if (category === 'contour') {
            // Show the first contour file (can't overlay 2D maps)
            await onFileClick(files[0].name, 'contour');
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
        const cat = categorizeFile(file);
        return cat === 'band' || cat === 'qf';
    });

    const traces = [];

    // Band type determines line style: Ec = solid, Ev = dash, Efn = dot, Efp = dashdot
    // Color indicates bias condition (consistent with other plots)
    const bandStyles = {
        'cb': 'solid',
        'vb': 'dash',
        'qfn': 'dot',
        'qfp': 'dashdot'
    };

    for (const file of allBandFiles) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const positions = values.map(row => row[0]);
                const energies = values.map(row => row[1]);

                const biasCondition = extractBiasCondition(file.name);
                const biasLabel = getBiasLabel(biasCondition);
                const color = getBiasColor(biasCondition);
                const { traceName, colorKey } = getBandTraceInfo(result.data.variable, file.name);
                const dash = bandStyles[colorKey] || 'solid';

                // Add bias condition to trace name if not equilibrium
                const fullTraceName = biasCondition === 'eq' ? traceName : `${traceName} (${biasLabel})`;

                traces.push({
                    x: positions,
                    y: energies,
                    type: 'scatter',
                    mode: 'lines',
                    name: fullTraceName,
                    line: { color: color, width: 2, dash: dash }
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

// Unified color scheme based on bias condition - consistent across all plot types
const BIAS_COLORS = {
    'eq': '#007bff',      // Blue for equilibrium
    'fwd': '#28a745',     // Green for forward bias
    'rev': '#dc3545',     // Red for reverse bias
    'default': '#6f42c1'  // Purple for unknown
};

function getBiasColor(biasCondition) {
    return BIAS_COLORS[biasCondition] || BIAS_COLORS['default'];
}

function getBiasLabel(biasCondition) {
    switch (biasCondition) {
        case 'eq': return 'Equilibrium';
        case 'fwd': return 'Forward Bias';
        case 'rev': return 'Reverse Bias';
        default: return biasCondition;
    }
}

async function plotAllIVCurves(files, category) {
    const traces = [];
    const traceColors = ['#007bff', '#dc3545', '#28a745', '#fd7e14', '#6f42c1', '#17a2b8'];
    let colorIdx = 0;

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const columns = result.data.columns || [];
                const x = values.map(row => row[0]);
                const numCurrentCols = values[0] ? values[0].length - 1 : 1;
                const legendBase = getDescriptiveName(file.name, category);

                for (let i = 0; i < numCurrentCols; i++) {
                    const y = values.map(row => row[i + 1]);
                    const colLabel = columns[i + 1] || `I_elec${i + 1} (A)`;
                    const name = numCurrentCols === 1 ? legendBase : `${legendBase} — ${colLabel}`;
                    traces.push({
                        x, y,
                        type: 'scatter',
                        mode: 'lines+markers',
                        name,
                        line: { color: traceColors[colorIdx % traceColors.length], width: 2 },
                        marker: { size: 4 }
                    });
                    colorIdx++;
                }
            }
        } catch (error) {
            console.error(`Error loading IV file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const title = category === 'cv' ? 'C-V Characteristics' : 'I-V Characteristics';
        const xLabel = traces.length > 0 ? 'Voltage (V)' : 'Voltage (V)';
        const yLabel = category === 'cv' ? 'Capacitance (F)' : 'Current (A)';

        const layout = {
            title: title,
            xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
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

    // Carrier-specific colors vary by bias condition
    // Electrons: solid line, Holes: dashed line
    // Color indicates bias condition
    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const x = values.map(row => row[0]);
                const y = values.map(row => row[1]);

                const biasCondition = extractBiasCondition(file.name);
                const biasLabel = getBiasLabel(biasCondition);
                const color = getBiasColor(biasCondition);

                let carrierType = 'Carrier';
                let dash = 'solid';
                const variable = result.data.variable || '';

                if (variable === 'electrons' || file.name.toLowerCase().includes('ele')) {
                    carrierType = 'Electrons';
                    dash = 'solid';
                } else if (variable === 'holes' || file.name.toLowerCase().includes('hole')) {
                    carrierType = 'Holes';
                    dash = 'dash';
                }

                const traceName = `${carrierType} (${biasLabel})`;

                traces.push({
                    x: x,
                    y: y,
                    type: 'scatter',
                    mode: 'lines',
                    name: traceName,
                    line: { color: color, width: 2, dash: dash }
                });
            }
        } catch (error) {
            console.error(`Error loading carrier file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const layout = {
            title: 'Carrier Concentrations (All)',
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

    // Field-specific: Potential = solid, Electric Field = dash, Doping = dot
    // Color indicates bias condition
    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const x = values.map(row => row[0]);
                const y = values.map(row => row[1]);

                const biasCondition = extractBiasCondition(file.name);
                const biasLabel = getBiasLabel(biasCondition);
                const color = getBiasColor(biasCondition);

                let fieldType = 'Field';
                let dash = 'solid';
                const variable = result.data.variable || '';
                const nameLower = file.name.toLowerCase();

                if (variable === 'potential' || nameLower.includes('pot') || nameLower.includes('phi')) {
                    fieldType = 'Potential';
                    dash = 'solid';
                } else if (variable === 'e_field' || nameLower.includes('efield')) {
                    fieldType = 'Electric Field';
                    dash = 'dash';
                } else if (variable === 'doping' || nameLower.includes('dop')) {
                    fieldType = 'Doping';
                    dash = 'dot';
                }

                // Doping is static, no bias label needed
                const traceName = fieldType === 'Doping' ? fieldType : `${fieldType} (${biasLabel})`;

                traces.push({
                    x: x,
                    y: y,
                    type: 'scatter',
                    mode: 'lines',
                    name: traceName,
                    line: { color: color, width: 2, dash: dash }
                });
            }
        } catch (error) {
            console.error(`Error loading field file ${file.name}:`, error);
        }
    }

    if (traces.length > 0) {
        const layout = {
            title: 'Electric Field / Potential (All)',
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

    for (const file of files) {
        try {
            const result = await apiCall(`/api/results/${simId}/file/${file.name}`);
            if (result.success && result.data && result.data.values && result.data.values.length > 0) {
                const values = result.data.values;
                const x = values.map(row => row[0]);
                const y = values.map(row => row[1]);

                // Use bias-based colors for consistency
                const biasCondition = extractBiasCondition(file.name);
                const color = getBiasColor(biasCondition);
                const biasLabel = getBiasLabel(biasCondition);

                traces.push({
                    x: x,
                    y: y,
                    type: 'scatter',
                    mode: 'lines',
                    name: `${file.name} (${biasLabel})`,
                    line: { color: color, width: 2 }
                });
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

function getDescriptiveName(filename, category) {
    // Generate a descriptive name for legends based on filename and category
    const nameLower = filename.toLowerCase().replace(/\.(txt|dat|out|log)$/i, '');
    const biasCondition = extractBiasCondition(filename);
    const biasLabel = biasCondition === 'eq' ? 'Equilibrium' :
                      biasCondition === 'fwd' ? 'Forward Bias' :
                      biasCondition === 'rev' ? 'Reverse Bias' : biasCondition;

    switch (category) {
        case 'iv':
            if (nameLower.includes('idvg')) return 'Id-Vg Transfer';
            if (nameLower.includes('idvd')) return 'Id-Vd Output';
            if (nameLower.includes('gummel')) return 'Gummel Plot';
            if (nameLower.includes('ic_vce')) return 'Ic-Vce Output';
            return `I-V (${biasLabel})`;
        case 'cv':
            return `C-V (${biasLabel})`;
        case 'carrier':
            if (nameLower.includes('ele')) return `Electrons (${biasLabel})`;
            if (nameLower.includes('hole')) return `Holes (${biasLabel})`;
            return `Carrier (${biasLabel})`;
        case 'field':
            if (nameLower.includes('pot') || nameLower.includes('phi') || nameLower.includes('psi')) {
                return `Potential (${biasLabel})`;
            }
            if (nameLower.includes('efield') || nameLower.includes('field')) {
                return `Electric Field (${biasLabel})`;
            }
            if (nameLower.includes('dop')) return 'Doping Profile';
            return `Field (${biasLabel})`;
        default:
            return filename;
    }
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

    // Contour files use x/y/z arrays instead of values
    if (data.type === 'contour') {
        plotContourData(containerId, data, filename);
        return;
    }

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

    const biasCondition = extractBiasCondition(filename);
    const biasLabel = biasCondition === 'eq' ? 'Equilibrium' :
                      biasCondition === 'fwd' ? 'Forward Bias' :
                      biasCondition === 'rev' ? 'Reverse Bias' : biasCondition;

    let carrierType = 'Carrier';
    let color = '#6f42c1';

    // Use variable from backend if available
    if (variable === 'electrons') {
        carrierType = 'Electrons';
        color = '#007bff';
    } else if (variable === 'holes') {
        carrierType = 'Holes';
        color = '#dc3545';
    } else {
        // Fallback to filename detection
        const nameLower = filename.toLowerCase();
        if (nameLower.includes('electron') || nameLower.startsWith('ele')) {
            carrierType = 'Electrons';
            color = '#007bff';
        } else if (nameLower.includes('hole')) {
            carrierType = 'Holes';
            color = '#dc3545';
        }
    }

    const traceName = `${carrierType} (${biasLabel})`;

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
        title: `Carrier Concentration: ${traceName}`,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0', type: 'log', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 },
        showlegend: true
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotFieldData(containerId, values, filename, variable = '', columns = []) {
    const x = values.map(row => row[0]);
    const y = values.map(row => row[1]);

    const biasCondition = extractBiasCondition(filename);
    const biasLabel = biasCondition === 'eq' ? 'Equilibrium' :
                      biasCondition === 'fwd' ? 'Forward Bias' :
                      biasCondition === 'rev' ? 'Reverse Bias' : biasCondition;

    let fieldType = 'Electric Field';
    let yLabel = 'Field (V/cm)';
    let color = '#fd7e14';

    // Use variable from backend if available
    if (variable === 'potential') {
        fieldType = 'Potential';
        yLabel = 'Potential (V)';
        color = '#20c997';
    } else if (variable === 'e_field') {
        fieldType = 'Electric Field';
        yLabel = 'Field (V/cm)';
        color = '#fd7e14';
    } else if (variable === 'doping') {
        fieldType = 'Doping Profile';
        yLabel = 'Doping (/cm³)';
        color = '#6f42c1';
    } else {
        // Fallback to filename detection
        const nameLower = filename.toLowerCase();
        if (nameLower.includes('potential') || nameLower.startsWith('pot') || nameLower.includes('phi') || nameLower.includes('psi')) {
            fieldType = 'Potential';
            yLabel = 'Potential (V)';
            color = '#20c997';
        } else if (nameLower.includes('dop')) {
            fieldType = 'Doping Profile';
            yLabel = 'Doping (/cm³)';
            color = '#6f42c1';
        }
    }

    // Use backend column labels if available
    const xLabel = columns[0] || 'Position (μm)';
    if (columns[1]) {
        yLabel = columns[1];
    }

    // Build trace name with bias condition (except for doping which is static)
    const traceName = fieldType === 'Doping Profile' ? fieldType : `${fieldType} (${biasLabel})`;

    const trace = {
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        name: traceName,
        line: { color: color, width: 2 }
    };

    const layout = {
        title: traceName,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 },
        showlegend: true
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotIVData(containerId, values, filename, columns = []) {
    const voltages = values.map(row => row[0]);

    const xLabel = columns[0] || 'Voltage (V)';
    const legendName = getDescriptiveName(filename, 'iv');
    const traceColors = ['#007bff', '#dc3545', '#28a745', '#fd7e14'];

    // Build one trace per electrode current column
    const numCurrentCols = values[0] ? values[0].length - 1 : 1;
    const traces = [];
    for (let i = 0; i < numCurrentCols; i++) {
        const currents = values.map(row => row[i + 1]);
        const yLabel = columns[i + 1] || (numCurrentCols === 1 ? 'Current (A)' : `I_elec${i + 1} (A)`);
        traces.push({
            x: voltages,
            y: currents,
            type: 'scatter',
            mode: 'lines+markers',
            name: numCurrentCols === 1 ? legendName : `${legendName} — ${yLabel}`,
            line: { color: traceColors[i % traceColors.length], width: 2 },
            marker: { size: 4 }
        });
    }

    const layout = {
        title: `I-V Characteristic: ${legendName}`,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: columns[1] || 'Current (A)', gridcolor: '#e0e0e0', exponentformat: 'e' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 },
        showlegend: true
    };

    Plotly.newPlot(containerId, traces, layout, { responsive: true });
}

function plotBandData(containerId, values, filename, variable = '', columns = []) {
    const positions = values.map(row => row[0]);
    const energies = values.map(row => row[1]);

    // Get band type and bias condition for legend
    const { bandType, biasCondition, color } = getBandInfo(variable, filename);

    // Build descriptive legend name
    let traceName = bandType;
    if (biasCondition && biasCondition !== 'eq') {
        traceName = `${bandType} (${biasCondition})`;
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
        title: `Band Diagram: ${traceName}`,
        xaxis: { title: xLabel, gridcolor: '#e0e0e0' },
        yaxis: { title: yLabel, gridcolor: '#e0e0e0' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 },
        showlegend: true
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function getBandInfo(variable, filename) {
    const nameLower = filename.toLowerCase();
    const biasCondition = extractBiasCondition(filename);

    // Default values
    let bandType = filename;
    let color = '#333';

    // Use variable from backend if available (priority)
    if (variable === 'band_con') {
        bandType = 'Conduction Band (Ec)';
        color = '#dc3545';
    } else if (variable === 'band_val') {
        bandType = 'Valence Band (Ev)';
        color = '#007bff';
    } else if (variable === 'qfn') {
        bandType = 'Electron Quasi-Fermi (Efn)';
        color = '#28a745';
    } else if (variable === 'qfp') {
        bandType = 'Hole Quasi-Fermi (Efp)';
        color = '#fd7e14';
    } else {
        // Fallback to filename detection
        if (nameLower.includes('cb') || nameLower.includes('ec') || nameLower.includes('conduction')) {
            bandType = 'Conduction Band (Ec)';
            color = '#dc3545';
        } else if (nameLower.includes('vb') || nameLower.includes('ev') || nameLower.includes('valence')) {
            bandType = 'Valence Band (Ev)';
            color = '#007bff';
        } else if (nameLower.includes('qfn') || nameLower.includes('efn')) {
            bandType = 'Electron Quasi-Fermi (Efn)';
            color = '#28a745';
        } else if (nameLower.includes('qfp') || nameLower.includes('efp')) {
            bandType = 'Hole Quasi-Fermi (Efp)';
            color = '#fd7e14';
        } else if (nameLower.includes('qf') || nameLower.includes('fermi')) {
            bandType = 'Quasi-Fermi Level';
            color = '#17a2b8';
        }
    }

    return { bandType, biasCondition, color };
}

function plotContourData(containerId, data, filename) {
    if (!data.x || data.x.length === 0) {
        document.getElementById('plotsVisualization').innerHTML =
            '<p class="text-muted text-center py-5">No 2D data available in this file</p>';
        return;
    }

    const biasCondition = extractBiasCondition(filename);
    const biasLabel = getBiasLabel(biasCondition);
    const label = data.label || data.colorbar_label || data.variable || filename;

    // Choose colorscale by quantity type
    const colorscaleMap = {
        potential: 'RdBu',
        electrons: 'YlOrRd',
        holes: 'YlOrBr',
        e_field: 'Hot',
        qfn: 'Greens',
        qfp: 'Oranges',
        doping: 'Viridis',
    };
    const colorscale = colorscaleMap[data.variable] || 'Viridis';

    // Use log scale for carrier concentrations and doping (span many decades)
    const logVars = ['electrons', 'holes', 'doping'];
    let zData = data.z;
    let colorbarTitle = label;
    if (logVars.includes(data.variable)) {
        zData = data.z.map(v => v > 0 ? Math.log10(v) : 0);
        colorbarTitle = `log₁₀(${label})`;
    }

    const trace = {
        x: data.x,
        y: data.y,
        z: zData,
        type: 'heatmap',
        colorscale: colorscale,
        colorbar: { title: colorbarTitle, titleside: 'right' },
        hovertemplate: 'x: %{x:.3f} µm<br>y: %{y:.3f} µm<br>value: %{z:.4g}<extra></extra>'
    };

    const layout = {
        title: `${label} — ${biasLabel} (${filename})`,
        xaxis: { title: 'X (µm)', gridcolor: '#e0e0e0', scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (µm)', gridcolor: '#e0e0e0', autorange: 'reversed' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 60, r: 80, b: 60, l: 70 }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}

function plotMeshData(containerId, values, filename) {
    const x = values.map(row => row[0]);
    const y = values.map(row => row[1]);

    const uniqueX = [...new Set(x.map(v => +v.toFixed(4)))].sort((a, b) => a - b);
    const uniqueY = [...new Set(y.map(v => +v.toFixed(4)))].sort((a, b) => a - b);

    const traces = [];

    // Vertical grid lines (constant X, sweep Y)
    const vLineX = [], vLineY = [];
    for (const xi of uniqueX) {
        const ys = y.filter((_, i) => +x[i].toFixed(4) === xi).sort((a, b) => a - b);
        for (const yi of ys) { vLineX.push(xi); vLineY.push(yi); }
        vLineX.push(null); vLineY.push(null);
    }
    traces.push({ x: vLineX, y: vLineY, type: 'scatter', mode: 'lines',
        name: 'Grid', line: { color: '#6c9fd4', width: 0.8 }, hoverinfo: 'skip' });

    // Horizontal grid lines (constant Y, sweep X)
    const hLineX = [], hLineY = [];
    for (const yi of uniqueY) {
        const xs = x.filter((_, i) => +y[i].toFixed(4) === yi).sort((a, b) => a - b);
        for (const xi of xs) { hLineX.push(xi); hLineY.push(yi); }
        hLineX.push(null); hLineY.push(null);
    }
    traces.push({ x: hLineX, y: hLineY, type: 'scatter', mode: 'lines',
        name: 'Grid', showlegend: false, line: { color: '#6c9fd4', width: 0.8 }, hoverinfo: 'skip' });

    // Node dots
    traces.push({ x, y, type: 'scatter', mode: 'markers',
        name: `${values.length} nodes`,
        marker: { size: 2, color: '#1a5fa8', opacity: 0.7 },
        hovertemplate: 'x: %{x:.3f} µm<br>y: %{y:.3f} µm<extra></extra>' });

    const layout = {
        title: `Device Mesh — ${values.length} nodes (${uniqueX.length}×${uniqueY.length})`,
        xaxis: { title: 'X (µm)', gridcolor: '#e0e0e0', scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (µm)', gridcolor: '#e0e0e0', autorange: 'reversed' },
        plot_bgcolor: '#fafafa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 70 },
        showlegend: false
    };

    Plotly.newPlot(containerId, traces, layout, { responsive: true });
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

    for (const file of files) {
        const category = categorizeFile(file);
        switch (category) {
            case 'iv':
                ivFiles.push(file);
                break;
            case 'cv':
                cvFiles.push(file);
                break;
        }
    }

    // Load and display I-V or C-V curves in the Plots area
    const plotFiles = [...ivFiles, ...cvFiles];
    if (plotFiles.length > 0) {
        await loadIVData(plotFiles);
    } else {
        document.getElementById('plotsVisualization').innerHTML =
            '<p class="text-muted text-center p-5">No I-V or C-V data available. Click on an output file to view its plot.</p>';
    }
}

async function loadIVData(files) {
    if (files.length === 0) return;

    // Use the same path as clicking: plotAllIVCurves overlays all IV files correctly
    await plotAllIVCurves(files, 'iv');
}


