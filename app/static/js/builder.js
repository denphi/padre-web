/**
 * PADRE Advanced Simulation Builder
 * SVG-based drag-and-drop canvas for composing custom simulations.
 */

// ─────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────

const state = {
    blocks: [],         // Array of block objects
    nextId: 1,
    selectedId: null,
    zoom: 1.0,
    pan: { x: 0, y: 0 },
};

let dragState = null;   // active drag info
let builderDeckContent = '';

// Block type definitions: default params + rendering info
const BLOCK_DEFS = {
    mesh: {
        label: 'Mesh',
        color: '#4a90d9',
        icon: 'M',
        width: 120,
        height: 56,
        defaults: { nx: 50, ny: 50, xmin: 0.0, xmax: 1.0, ymin: 0.0, ymax: 1.0 },
        fields: [
            { key: 'nx',   label: 'NX',   type: 'number' },
            { key: 'ny',   label: 'NY',   type: 'number' },
            { key: 'xmin', label: 'Xmin (um)', type: 'number' },
            { key: 'xmax', label: 'Xmax (um)', type: 'number' },
            { key: 'ymin', label: 'Ymin (um)', type: 'number' },
            { key: 'ymax', label: 'Ymax (um)', type: 'number' },
        ],
    },
    region: {
        label: 'Region',
        color: '#5cb85c',
        icon: 'R',
        width: 120,
        height: 56,
        defaults: { name: 'silicon', material: 'silicon', x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 },
        fields: [
            { key: 'name',     label: 'Name',        type: 'text' },
            { key: 'material', label: 'Material',     type: 'select', options: ['silicon', 'oxide', 'metal', 'gaas', 'germanium'] },
            { key: 'x1',       label: 'X1 (um)',      type: 'number' },
            { key: 'y1',       label: 'Y1 (um)',      type: 'number' },
            { key: 'x2',       label: 'X2 (um)',      type: 'number' },
            { key: 'y2',       label: 'Y2 (um)',      type: 'number' },
        ],
    },
    doping: {
        label: 'Doping',
        color: '#e67e22',
        icon: 'D',
        width: 120,
        height: 56,
        defaults: { region: 'silicon', species: 'boron', doping_type: 'uniform', concentration: 1e17, peak: 1e20, char_length: 0.1 },
        fields: [
            { key: 'region',        label: 'Region',        type: 'text' },
            { key: 'species',       label: 'Species',       type: 'select', options: ['boron', 'phosphorus', 'arsenic'] },
            { key: 'doping_type',   label: 'Profile',       type: 'select', options: ['uniform', 'gaussian'] },
            { key: 'concentration', label: 'Conc. (/cm³)',   type: 'number' },
            { key: 'peak',          label: 'Peak (/cm³)',    type: 'number' },
            { key: 'char_length',   label: 'Char. Length',  type: 'number' },
        ],
    },
    models: {
        label: 'Models',
        color: '#8e44ad',
        icon: 'Md',
        width: 120,
        height: 56,
        defaults: { temperature: 300, srh: true, auger: false, bgn: false, conmob: true, fldmob: true },
        fields: [
            { key: 'temperature', label: 'Temp (K)',   type: 'number' },
            { key: 'srh',         label: 'SRH',         type: 'checkbox' },
            { key: 'auger',       label: 'Auger',       type: 'checkbox' },
            { key: 'bgn',         label: 'BGN',         type: 'checkbox' },
            { key: 'conmob',      label: 'Cond. Mob.',  type: 'checkbox' },
            { key: 'fldmob',      label: 'Field Mob.',  type: 'checkbox' },
        ],
    },
    electrode: {
        label: 'Electrode',
        color: '#c0392b',
        icon: 'E',
        width: 120,
        height: 56,
        defaults: { name: 'gate', position: 'top', x1: 0.3, x2: 0.7 },
        fields: [
            { key: 'name',     label: 'Name',      type: 'text' },
            { key: 'position', label: 'Position',  type: 'select', options: ['top', 'bottom', 'left', 'right'] },
            { key: 'x1',       label: 'X1 (um)',   type: 'number' },
            { key: 'x2',       label: 'X2 (um)',   type: 'number' },
        ],
    },
    contact: {
        label: 'Contact',
        color: '#95a5a6',
        icon: 'C',
        width: 120,
        height: 56,
        defaults: { electrode: 'gate', workfunction: 4.1 },
        fields: [
            { key: 'electrode',    label: 'Electrode', type: 'text' },
            { key: 'workfunction', label: 'WF (eV)',    type: 'number' },
        ],
    },
    solve: {
        label: 'Solve',
        color: '#2980b9',
        icon: 'S',
        width: 120,
        height: 56,
        defaults: { initial: false, previous: false, project: false, bias_electrode: '', bias_value: 0.0 },
        fields: [
            { key: 'initial',       label: 'Initial solve', type: 'checkbox' },
            { key: 'previous',      label: 'Use previous',  type: 'checkbox' },
            { key: 'project',       label: 'Use project',   type: 'checkbox' },
            { key: 'bias_electrode', label: 'Electrode',    type: 'text' },
            { key: 'bias_value',    label: 'Bias (V)',      type: 'number' },
        ],
    },
    log: {
        label: 'Log',
        color: '#27ae60',
        icon: 'L',
        width: 120,
        height: 56,
        defaults: { quantities: 'potential electrons holes', filename: 'output' },
        fields: [
            { key: 'quantities', label: 'Quantities (space-sep)', type: 'text' },
            { key: 'filename',   label: 'Filename',              type: 'text' },
        ],
    },
};

// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initToolbox();
    initControls();
    renderCanvas();
});

function initCanvas() {
    const svg = document.getElementById('builderCanvas');

    // Drop target
    svg.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    svg.addEventListener('drop', onCanvasDrop);

    // Click on canvas background → deselect
    svg.addEventListener('click', (e) => {
        if (e.target === svg || e.target.id === 'builderCanvas' || e.target.tagName === 'rect' && e.target.getAttribute('fill') === 'url(#grid)') {
            selectBlock(null);
        }
    });

    // Panning (middle-click or space+drag)
    let isPanning = false, panStart = null;
    svg.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            isPanning = true;
            panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
            svg.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            state.pan.x = e.clientX - panStart.x;
            state.pan.y = e.clientY - panStart.y;
            applyTransform();
        }
        if (dragState && dragState.type === 'move') {
            const pt = svgPoint(svg, e.clientX, e.clientY);
            dragState.block.x = snapGrid(pt.x - dragState.offsetX);
            dragState.block.y = snapGrid(pt.y - dragState.offsetY);
            renderCanvas();
        }
    });
    window.addEventListener('mouseup', () => {
        if (isPanning) { isPanning = false; svg.style.cursor = 'default'; }
        dragState = null;
    });

    // Zoom wheel
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        state.zoom = Math.min(3, Math.max(0.3, state.zoom * delta));
        applyTransform();
    }, { passive: false });
}

function applyTransform() {
    document.getElementById('canvasContent').setAttribute(
        'transform', `translate(${state.pan.x},${state.pan.y}) scale(${state.zoom})`
    );
}

function svgPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = document.getElementById('canvasContent').getScreenCTM().inverse();
    return pt.matrixTransform(ctm);
}

function snapGrid(val, gridSize = 20) {
    return Math.round(val / gridSize) * gridSize;
}

function initToolbox() {
    document.querySelectorAll('.toolbox-item').forEach(item => {
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('blockType', item.dataset.blockType);
            e.dataTransfer.effectAllowed = 'copy';
        });
    });
}

function initControls() {
    document.getElementById('clearCanvasBtn').addEventListener('click', () => {
        if (state.blocks.length === 0 || confirm('Clear all blocks?')) {
            state.blocks = [];
            state.selectedId = null;
            renderCanvas();
            showProperties(null);
            updateBlockCount();
        }
    });

    document.getElementById('generateDeckBtn').addEventListener('click', generateDeck);
    document.getElementById('runBuilderBtn').addEventListener('click', showRunConfirm);
    document.getElementById('confirmRunBtn').addEventListener('click', runSimulation);
    document.getElementById('uploadDeckBtn').addEventListener('click', () => {
        new bootstrap.Modal(document.getElementById('uploadDeckModal')).show();
    });
    document.getElementById('confirmUploadDeckBtn').addEventListener('click', loadUploadedDeck);
    initDeckDropArea();

    document.getElementById('zoomInBtn').addEventListener('click', () => {
        state.zoom = Math.min(3, state.zoom * 1.2);
        applyTransform();
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
        state.zoom = Math.max(0.3, state.zoom / 1.2);
        applyTransform();
    });
    document.getElementById('zoomResetBtn').addEventListener('click', () => {
        state.zoom = 1; state.pan = { x: 0, y: 0 };
        applyTransform();
    });

    document.getElementById('applyPropsBtn').addEventListener('click', applyProperties);
    document.getElementById('deleteBlockBtn').addEventListener('click', deleteSelected);
    document.getElementById('copyBuilderDeckBtn').addEventListener('click', () => {
        if (builderDeckContent) copyToClipboard(builderDeckContent);
    });
}

// ─────────────────────────────────────────────────────────
// Canvas Drop
// ─────────────────────────────────────────────────────────

function onCanvasDrop(e) {
    e.preventDefault();
    const blockType = e.dataTransfer.getData('blockType');
    if (!blockType || !BLOCK_DEFS[blockType]) return;

    const svg = document.getElementById('builderCanvas');
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const def = BLOCK_DEFS[blockType];

    const block = {
        id: state.nextId++,
        type: blockType,
        x: snapGrid(pt.x - def.width / 2),
        y: snapGrid(pt.y - def.height / 2),
        params: JSON.parse(JSON.stringify(def.defaults)),
    };

    state.blocks.push(block);
    selectBlock(block.id);
    renderCanvas();
    updateBlockCount();
    showDropHint(false);
}

// ─────────────────────────────────────────────────────────
// Canvas Render
// ─────────────────────────────────────────────────────────

function renderCanvas() {
    const content = document.getElementById('canvasContent');
    // Clear existing blocks (keep grid rect managed by SVG defs)
    content.innerHTML = '';

    state.blocks.forEach(block => {
        const def = BLOCK_DEFS[block.type];
        const isSelected = block.id === state.selectedId;
        const g = createBlockSVG(block, def, isSelected);
        content.appendChild(g);
    });

    showDropHint(state.blocks.length === 0);
    updateBlockCount();
}

function createBlockSVG(block, def, isSelected) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${block.x},${block.y})`);
    g.style.cursor = 'grab';
    g.dataset.blockId = block.id;

    const w = def.width, h = def.height;
    const selColor = '#f39c12';

    // Shadow rect (offset)
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shadow.setAttribute('x', 3); shadow.setAttribute('y', 3);
    shadow.setAttribute('width', w); shadow.setAttribute('height', h);
    shadow.setAttribute('rx', 6);
    shadow.setAttribute('fill', 'rgba(0,0,0,0.15)');
    g.appendChild(shadow);

    // Main rect
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', 0); rect.setAttribute('y', 0);
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('rx', 6);
    rect.setAttribute('fill', def.color);
    rect.setAttribute('stroke', isSelected ? selColor : 'rgba(0,0,0,0.2)');
    rect.setAttribute('stroke-width', isSelected ? 3 : 1);
    g.appendChild(rect);

    // Icon badge
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    badge.setAttribute('x', 6); badge.setAttribute('y', 6);
    badge.setAttribute('width', 22); badge.setAttribute('height', 22);
    badge.setAttribute('rx', 4);
    badge.setAttribute('fill', 'rgba(255,255,255,0.25)');
    g.appendChild(badge);

    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', 17); iconText.setAttribute('y', 22);
    iconText.setAttribute('text-anchor', 'middle');
    iconText.setAttribute('font-family', 'Arial, sans-serif');
    iconText.setAttribute('font-size', 11);
    iconText.setAttribute('font-weight', 'bold');
    iconText.setAttribute('fill', 'white');
    iconText.textContent = def.icon;
    g.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', 35); label.setAttribute('y', 20);
    label.setAttribute('font-family', 'Arial, sans-serif');
    label.setAttribute('font-size', 13);
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('fill', 'white');
    label.textContent = def.label;
    g.appendChild(label);

    // Summary line (first param)
    const summaryText = _blockSummary(block, def);
    const summary = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    summary.setAttribute('x', 35); summary.setAttribute('y', 36);
    summary.setAttribute('font-family', 'Arial, sans-serif');
    summary.setAttribute('font-size', 10);
    summary.setAttribute('fill', 'rgba(255,255,255,0.8)');
    summary.textContent = summaryText;
    g.appendChild(summary);

    // ID badge
    const idText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    idText.setAttribute('x', w - 5); idText.setAttribute('y', h - 5);
    idText.setAttribute('text-anchor', 'end');
    idText.setAttribute('font-family', 'monospace');
    idText.setAttribute('font-size', 9);
    idText.setAttribute('fill', 'rgba(255,255,255,0.5)');
    idText.textContent = `#${block.id}`;
    g.appendChild(idText);

    // Event handlers
    g.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const svg = document.getElementById('builderCanvas');
        const pt = svgPoint(svg, e.clientX, e.clientY);
        dragState = {
            type: 'move',
            block,
            offsetX: pt.x - block.x,
            offsetY: pt.y - block.y,
        };
        selectBlock(block.id);
    });

    g.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBlock(block.id);
    });

    return g;
}

function _blockSummary(block, def) {
    const p = block.params;
    switch (block.type) {
        case 'mesh':    return `${p.nx}×${p.ny}  [${p.xmin},${p.xmax}]×[${p.ymin},${p.ymax}]`;
        case 'region':  return `${p.name} (${p.material})`;
        case 'doping':  return `${p.species} ${_sciStr(p.concentration)}`;
        case 'models':  return `T=${p.temperature}K`;
        case 'electrode': return `${p.name} @ ${p.position}`;
        case 'contact': return `${p.electrode} WF=${p.workfunction}`;
        case 'solve':   return p.initial ? 'initial' : (p.previous ? 'previous' : 'project');
        case 'log':     return p.filename;
        default:        return '';
    }
}

function _sciStr(v) {
    if (!v) return '0';
    const exp = Math.floor(Math.log10(Math.abs(v)));
    return `${(v / 10 ** exp).toFixed(1)}e${exp}`;
}

// ─────────────────────────────────────────────────────────
// Selection & Properties
// ─────────────────────────────────────────────────────────

function selectBlock(id) {
    state.selectedId = id;
    renderCanvas();
    showProperties(id !== null ? state.blocks.find(b => b.id === id) : null);
}

function showProperties(block) {
    const placeholder = document.getElementById('propertiesPlaceholder');
    const form = document.getElementById('propertiesForm');
    const actions = document.getElementById('propertiesActions');

    if (!block) {
        placeholder.style.display = 'block';
        form.style.display = 'none';
        actions.style.display = 'none';
        return;
    }

    placeholder.style.display = 'none';
    form.style.display = 'block';
    actions.style.display = 'flex';

    const def = BLOCK_DEFS[block.type];
    let html = `<div class="mb-2"><span class="badge" style="background:${def.color}">${def.label}</span> <span class="text-muted small">#${block.id}</span></div>`;

    def.fields.forEach(field => {
        const val = block.params[field.key];
        if (field.type === 'checkbox') {
            html += `
                <div class="form-check mb-1">
                    <input class="form-check-input prop-input" type="checkbox" id="prop_${field.key}"
                           data-key="${field.key}" ${val ? 'checked' : ''}>
                    <label class="form-check-label small" for="prop_${field.key}">${field.label}</label>
                </div>`;
        } else if (field.type === 'select') {
            html += `
                <div class="mb-1">
                    <label class="form-label small mb-0">${field.label}</label>
                    <select class="form-select form-select-sm prop-input" id="prop_${field.key}" data-key="${field.key}">
                        ${field.options.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>`;
        } else {
            html += `
                <div class="mb-1">
                    <label class="form-label small mb-0">${field.label}</label>
                    <input class="form-control form-control-sm prop-input" type="${field.type}"
                           id="prop_${field.key}" data-key="${field.key}"
                           value="${val ?? ''}" step="any">
                </div>`;
        }
    });

    form.innerHTML = html;
}

function applyProperties() {
    const block = state.blocks.find(b => b.id === state.selectedId);
    if (!block) return;

    const def = BLOCK_DEFS[block.type];
    document.querySelectorAll('.prop-input').forEach(input => {
        const key = input.dataset.key;
        if (!key) return;
        if (input.type === 'checkbox') {
            block.params[key] = input.checked;
        } else if (input.type === 'number') {
            block.params[key] = input.value !== '' ? parseFloat(input.value) : 0;
        } else {
            block.params[key] = input.value;
        }
    });

    renderCanvas();
}

function deleteSelected() {
    if (state.selectedId === null) return;
    state.blocks = state.blocks.filter(b => b.id !== state.selectedId);
    state.selectedId = null;
    renderCanvas();
    showProperties(null);
    updateBlockCount();
}

// ─────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────

function showDropHint(show) {
    document.getElementById('dropHint').style.display = show ? 'block' : 'none';
}

function updateBlockCount() {
    document.getElementById('blockCount').textContent = `${state.blocks.length} block${state.blocks.length !== 1 ? 's' : ''}`;
}

// ─────────────────────────────────────────────────────────
// Deck Generation
// ─────────────────────────────────────────────────────────

function buildStatePayload() {
    const meshBlock = state.blocks.find(b => b.type === 'mesh');
    const modelsBlock = state.blocks.find(b => b.type === 'models');

    const payload = {
        mesh: meshBlock ? meshBlock.params : { nx: 50, ny: 50, xmin: 0, xmax: 1, ymin: 0, ymax: 1 },
        models: modelsBlock ? modelsBlock.params : {},
        regions: state.blocks.filter(b => b.type === 'region').map(b => b.params),
        dopings: state.blocks.filter(b => b.type === 'doping').map(b => b.params),
        electrodes: state.blocks.filter(b => b.type === 'electrode').map(b => b.params),
        contacts: state.blocks.filter(b => b.type === 'contact').map(b => b.params),
        solves: state.blocks.filter(b => b.type === 'solve').map(b => {
            const p = b.params;
            const s = { initial: p.initial, previous: p.previous, project: p.project };
            if (p.bias_electrode && p.bias_value !== undefined) {
                s.biases = { [p.bias_electrode]: p.bias_value };
            }
            return s;
        }),
        logs: state.blocks.filter(b => b.type === 'log').map(b => ({
            quantities: (b.params.quantities || '').split(/\s+/).filter(Boolean),
            filename: b.params.filename,
        })),
    };
    return payload;
}

async function generateDeck() {
    if (state.blocks.length === 0) {
        showAlert('Add some blocks to the canvas first', 'warning');
        return;
    }

    document.getElementById('builderDeckStatus').style.display = 'block';
    document.getElementById('builderDeckStatus').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating deck…';
    document.getElementById('builderDeckContent').style.display = 'none';

    try {
        const result = await apiCall('/api/builder/generate-deck', 'POST', buildStatePayload());
        if (result.success) {
            builderDeckContent = result.deck;
            document.getElementById('builderDeckStatus').style.display = 'none';
            document.getElementById('builderDeckContent').textContent = result.deck;
            document.getElementById('builderDeckContent').style.display = 'block';
            document.getElementById('builderDeckLines').textContent =
                result.deck.split('\n').length + ' lines';
            document.getElementById('runBuilderBtn').disabled = false;
        } else {
            document.getElementById('builderDeckStatus').innerHTML =
                `<i class="fas fa-exclamation-triangle text-danger"></i> ${result.error}`;
        }
    } catch (e) {
        document.getElementById('builderDeckStatus').innerHTML =
            `<i class="fas fa-exclamation-triangle text-danger"></i> ${e.message}`;
    }
}

// ─────────────────────────────────────────────────────────
// Run Simulation
// ─────────────────────────────────────────────────────────

function showRunConfirm() {
    if (!builderDeckContent) {
        showAlert('Generate the deck preview first', 'warning');
        return;
    }
    document.getElementById('runModalDeck').textContent = builderDeckContent;
    new bootstrap.Modal(document.getElementById('runConfirmModal')).show();
}

async function runSimulation() {
    const name = document.getElementById('simNameBuilder').value || 'Custom Simulation';
    bootstrap.Modal.getInstance(document.getElementById('runConfirmModal')).hide();

    // If we have a deck (either generated or uploaded), send it directly
    const payload = builderDeckContent
        ? { name, deck: builderDeckContent }
        : { name, state: buildStatePayload() };

    try {
        const result = await apiCall('/api/builder/run', 'POST', payload);

        if (result.success) {
            showAlert('Simulation started!', 'success');
            setTimeout(() => {
                window.location.href = `${getBasePath()}/simulation/${result.simulation_id}`;
            }, 800);
        } else {
            showAlert(`Error: ${result.error}`, 'danger');
        }
    } catch (e) {
        showAlert(`Error: ${e.message}`, 'danger');
    }
}

// ─────────────────────────────────────────────────────────
// Upload / paste existing PADRE deck
// ─────────────────────────────────────────────────────────

function initDeckDropArea() {
    const area  = document.getElementById('deckDropArea');
    const input = document.getElementById('deckFileInput');
    if (!area || !input) return;

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.style.background = '#e8f4fd';
    });
    area.addEventListener('dragleave', () => { area.style.background = ''; });
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) readDeckFile(file);
    });
    input.addEventListener('change', () => {
        if (input.files[0]) readDeckFile(input.files[0]);
    });
}

function readDeckFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('deckUploadText').value = e.target.result;
        document.getElementById('deckUploadFeedback').innerHTML =
            `<span class="text-success"><i class="fas fa-check"></i> Loaded: ${file.name} (${(file.size/1024).toFixed(1)} KB)</span>`;
    };
    reader.readAsText(file);
}

function loadUploadedDeck() {
    const deckText = document.getElementById('deckUploadText').value.trim();
    if (!deckText) {
        document.getElementById('deckUploadFeedback').innerHTML =
            '<span class="text-danger">Please paste or load a deck file first.</span>';
        return;
    }

    // Push the deck straight into the preview panel and enable Run
    builderDeckContent = deckText;
    document.getElementById('builderDeckStatus').style.display = 'none';
    document.getElementById('builderDeckContent').textContent = deckText;
    document.getElementById('builderDeckContent').style.display = 'block';
    document.getElementById('builderDeckLines').textContent = deckText.split('\n').length + ' lines';
    document.getElementById('runBuilderBtn').disabled = false;

    // Try to extract a TITLE line for the sim name
    const titleMatch = deckText.match(/^\s*TITLE\s+(.+)/im);
    if (titleMatch) {
        const current = document.getElementById('simNameBuilder').value;
        if (!current) document.getElementById('simNameBuilder').value = titleMatch[1].trim();
    }

    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('uploadDeckModal')).hide();
    showAlert('Deck loaded — click "Run Simulation" to submit.', 'success');
}
