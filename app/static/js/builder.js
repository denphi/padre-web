/**
 * PADRE Advanced Simulation Builder
 * Pipeline-based block editor: blocks live in ordered sections,
 * drag-and-drop reorders within and between sections.
 */

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

// Which section each block type belongs to
const BLOCK_SECTIONS = {
    mesh:      'structure',
    region:    'structure',
    doping:    'physics',
    models:    'physics',
    electrode: 'contacts',
    contact:   'contacts',
    solve:     'simulation',
    log:       'simulation',
};

// Block type definitions
const BLOCK_DEFS = {
    mesh: {
        label: 'Mesh',
        icon: 'fa-th',
        color: '#3d5a73',
        defaults: { nx: 50, ny: 50, xmin: 0.0, xmax: 1.0, ymin: 0.0, ymax: 1.0 },
        fields: [
            { key: 'nx',   label: 'NX',         type: 'number' },
            { key: 'ny',   label: 'NY',         type: 'number' },
            { key: 'xmin', label: 'Xmin (µm)', type: 'number' },
            { key: 'xmax', label: 'Xmax (µm)', type: 'number' },
            { key: 'ymin', label: 'Ymin (µm)', type: 'number' },
            { key: 'ymax', label: 'Ymax (µm)', type: 'number' },
        ],
    },
    region: {
        label: 'Region',
        icon: 'fa-vector-square',
        color: '#4a7a5a',
        defaults: { name: 'silicon', material: 'silicon', x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 },
        fields: [
            { key: 'name',     label: 'Name',       type: 'text' },
            { key: 'material', label: 'Material',   type: 'select', options: ['silicon', 'oxide', 'metal', 'gaas', 'germanium'] },
            { key: 'x1',       label: 'X1 (µm)',    type: 'number' },
            { key: 'y1',       label: 'Y1 (µm)',    type: 'number' },
            { key: 'x2',       label: 'X2 (µm)',    type: 'number' },
            { key: 'y2',       label: 'Y2 (µm)',    type: 'number' },
        ],
    },
    doping: {
        label: 'Doping',
        icon: 'fa-atom',
        color: '#7a5a3d',
        defaults: { region: 'silicon', species: 'boron', doping_type: 'uniform', concentration: 1e17, peak: 1e20, char_length: 0.1 },
        fields: [
            { key: 'region',        label: 'Region',        type: 'text' },
            { key: 'species',       label: 'Species',       type: 'select', options: ['boron', 'phosphorus', 'arsenic'] },
            { key: 'doping_type',   label: 'Profile',       type: 'select', options: ['uniform', 'gaussian'] },
            { key: 'concentration', label: 'Conc. (/cm³)',  type: 'number' },
            { key: 'peak',          label: 'Peak (/cm³)',   type: 'number' },
            { key: 'char_length',   label: 'Char. Length',  type: 'number' },
        ],
    },
    models: {
        label: 'Models',
        icon: 'fa-cogs',
        color: '#5a3d7a',
        defaults: { temperature: 300, srh: true, auger: false, bgn: false, conmob: true, fldmob: true },
        fields: [
            { key: 'temperature', label: 'Temp (K)',    type: 'number' },
            { key: 'srh',         label: 'SRH',         type: 'checkbox' },
            { key: 'auger',       label: 'Auger',       type: 'checkbox' },
            { key: 'bgn',         label: 'BGN',         type: 'checkbox' },
            { key: 'conmob',      label: 'Cond. Mob.',  type: 'checkbox' },
            { key: 'fldmob',      label: 'Field Mob.',  type: 'checkbox' },
        ],
    },
    electrode: {
        label: 'Electrode',
        icon: 'fa-plug',
        color: '#7a3d3d',
        defaults: { name: 'gate', position: 'top', x1: 0.3, x2: 0.7 },
        fields: [
            { key: 'name',     label: 'Name',     type: 'text' },
            { key: 'position', label: 'Position', type: 'select', options: ['top', 'bottom', 'left', 'right'] },
            { key: 'x1',       label: 'X1 (µm)', type: 'number' },
            { key: 'x2',       label: 'X2 (µm)', type: 'number' },
        ],
    },
    contact: {
        label: 'Contact',
        icon: 'fa-link',
        color: '#5a6a7a',
        defaults: { electrode: 'gate', contact_type: 'ohmic', workfunction: 4.1 },
        fields: [
            { key: 'electrode',    label: 'Electrode',    type: 'text' },
            { key: 'contact_type', label: 'Type',         type: 'select', options: ['ohmic', 'schottky'] },
            { key: 'workfunction', label: 'WF (eV)',      type: 'number' },
        ],
    },
    solve: {
        label: 'Solve',
        icon: 'fa-bolt',
        color: '#2e5870',
        defaults: { solve_type: 'equilibrium', previous: false, project: false, bias_electrode: '', bias_value: 0.0 },
        fields: [
            { key: 'solve_type',     label: 'Type',       type: 'select', options: ['equilibrium', 'bias_sweep'] },
            { key: 'previous',       label: 'Use previous', type: 'checkbox' },
            { key: 'project',        label: 'Use project',  type: 'checkbox' },
            { key: 'bias_electrode', label: 'Electrode',    type: 'text' },
            { key: 'bias_value',     label: 'Bias (V)',     type: 'number' },
        ],
    },
    log: {
        label: 'Log',
        icon: 'fa-chart-line',
        color: '#3d6a4a',
        defaults: { quantities: 'potential electrons holes', filename: 'output' },
        fields: [
            { key: 'quantities', label: 'Quantities (space-sep)', type: 'text' },
            { key: 'filename',   label: 'Filename',              type: 'text' },
        ],
    },
};

// ─────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────

const state = {
    // blocks is a flat ordered array; order within each section defines deck order
    blocks: [],
    nextId: 1,
    selectedId: null,
};

let builderDeckContent = '';

// Drag state for reordering
let dragBlock = null;       // block being dragged (from pipeline)
let dragFromNew = null;     // blockType string (from toolbox)
let dragOverEl = null;      // current drop-indicator target

// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initToolbox();
    initSectionDropZones();
    initControls();
    renderPipeline();
});

// ─────────────────────────────────────────────────────────
// Toolbox: drag start from toolbox item
// ─────────────────────────────────────────────────────────

function initToolbox() {
    document.querySelectorAll('.toolbox-item[data-block-type]').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragFromNew = item.dataset.blockType;
            dragBlock = null;
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', item.dataset.blockType);
        });
        item.addEventListener('dragend', () => { dragFromNew = null; });
    });
}

// ─────────────────────────────────────────────────────────
// Section drop zones
// ─────────────────────────────────────────────────────────

function initSectionDropZones() {
    document.querySelectorAll('.builder-block-list').forEach(list => {
        list.addEventListener('dragover', onListDragOver);
        list.addEventListener('dragleave', onListDragLeave);
        list.addEventListener('drop', onListDrop);
    });
}

function onListDragOver(e) {
    e.preventDefault();
    const list = e.currentTarget;
    const section = list.dataset.section;

    // Only accept compatible block types in this section
    const incomingType = dragBlock ? dragBlock.type : dragFromNew;
    if (!incomingType) return;
    if (BLOCK_SECTIONS[incomingType] !== section) {
        e.dataTransfer.dropEffect = 'none';
        return;
    }

    e.dataTransfer.dropEffect = dragBlock ? 'move' : 'copy';
    list.classList.add('drag-over');

    // Show drop indicator between items
    const afterEl = getDragAfterElement(list, e.clientY);
    const indicator = list.querySelector('.drop-indicator') || (() => {
        const d = document.createElement('div');
        d.className = 'drop-indicator';
        return d;
    })();

    if (afterEl) {
        list.insertBefore(indicator, afterEl);
    } else {
        list.appendChild(indicator);
    }
    dragOverEl = { list, afterEl };
}

function onListDragLeave(e) {
    const list = e.currentTarget;
    // Only clear if leaving the list itself (not entering a child)
    if (!list.contains(e.relatedTarget)) {
        list.classList.remove('drag-over');
        removeDropIndicator(list);
    }
}

function onListDrop(e) {
    e.preventDefault();
    const list = e.currentTarget;
    const section = list.dataset.section;
    list.classList.remove('drag-over');

    const incomingType = dragBlock ? dragBlock.type : dragFromNew;
    if (!incomingType || BLOCK_SECTIONS[incomingType] !== section) {
        removeDropIndicator(list);
        return;
    }

    const afterEl = getDragAfterElement(list, e.clientY);
    const afterId = afterEl ? parseInt(afterEl.dataset.blockId) : null;

    if (dragBlock) {
        // Reorder existing block
        reorderBlock(dragBlock.id, section, afterId);
    } else if (dragFromNew) {
        // Create new block
        addBlock(dragFromNew, section, afterId);
    }

    removeDropIndicator(list);
    dragBlock = null;
    dragFromNew = null;
    dragOverEl = null;
}

/** Returns the block element the dragged item should go BEFORE (null = append) */
function getDragAfterElement(list, y) {
    const items = [...list.querySelectorAll('.builder-block[data-block-id]')];
    return items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: -Infinity }).element || null;
}

function removeDropIndicator(list) {
    list.querySelectorAll('.drop-indicator').forEach(d => d.remove());
}

// ─────────────────────────────────────────────────────────
// Block management
// ─────────────────────────────────────────────────────────

function addBlock(blockType, section, beforeId = null) {
    const def = BLOCK_DEFS[blockType];
    if (!def) return;

    const block = {
        id: state.nextId++,
        type: blockType,
        params: JSON.parse(JSON.stringify(def.defaults)),
    };

    // Insert at position relative to section order
    const sectionBlocks = state.blocks.filter(b => BLOCK_SECTIONS[b.type] === section);

    if (beforeId !== null) {
        const targetIdx = state.blocks.findIndex(b => b.id === beforeId);
        state.blocks.splice(targetIdx, 0, block);
    } else {
        // Append after last block of this section
        const sectionIds = sectionBlocks.map(b => b.id);
        if (sectionIds.length > 0) {
            const lastIdx = state.blocks.findLastIndex(b => BLOCK_SECTIONS[b.type] === section);
            state.blocks.splice(lastIdx + 1, 0, block);
        } else {
            // No blocks in section yet — find the right position between sections
            const sectionOrder = ['structure', 'physics', 'contacts', 'simulation'];
            const sIdx = sectionOrder.indexOf(section);
            // Insert before first block of any later section
            let insertAt = state.blocks.length;
            for (let i = sIdx + 1; i < sectionOrder.length; i++) {
                const firstOfLater = state.blocks.findIndex(b => BLOCK_SECTIONS[b.type] === sectionOrder[i]);
                if (firstOfLater !== -1) { insertAt = firstOfLater; break; }
            }
            state.blocks.splice(insertAt, 0, block);
        }
    }

    selectBlock(block.id);
    renderPipeline();
}

function reorderBlock(blockId, targetSection, beforeId) {
    const blockIdx = state.blocks.findIndex(b => b.id === blockId);
    if (blockIdx === -1) return;
    const [block] = state.blocks.splice(blockIdx, 1);

    if (beforeId !== null) {
        const targetIdx = state.blocks.findIndex(b => b.id === beforeId);
        state.blocks.splice(targetIdx, 0, block);
    } else {
        const sectionOrder = ['structure', 'physics', 'contacts', 'simulation'];
        const sIdx = sectionOrder.indexOf(targetSection);
        let insertAt = state.blocks.length;
        for (let i = sIdx + 1; i < sectionOrder.length; i++) {
            const firstOfLater = state.blocks.findIndex(b => BLOCK_SECTIONS[b.type] === sectionOrder[i]);
            if (firstOfLater !== -1) { insertAt = firstOfLater; break; }
        }
        state.blocks.splice(insertAt, 0, block);
    }

    renderPipeline();
}

function deleteSelected() {
    if (state.selectedId === null) return;
    state.blocks = state.blocks.filter(b => b.id !== state.selectedId);
    state.selectedId = null;
    showProperties(null);
    renderPipeline();
}

// ─────────────────────────────────────────────────────────
// Render pipeline
// ─────────────────────────────────────────────────────────

function renderPipeline() {
    const sections = ['structure', 'physics', 'contacts', 'simulation'];
    sections.forEach(section => {
        const list = document.getElementById(`section-${section}`);
        if (!list) return;

        // Clear existing blocks but keep the empty hint element
        list.querySelectorAll('.builder-block').forEach(el => el.remove());
        removeDropIndicator(list);

        const sectionBlocks = state.blocks.filter(b => BLOCK_SECTIONS[b.type] === section);
        const hint = list.querySelector('.builder-empty-hint');
        if (hint) hint.style.display = sectionBlocks.length === 0 ? 'block' : 'none';

        sectionBlocks.forEach(block => {
            const el = createBlockEl(block);
            list.appendChild(el);
        });
    });

    document.getElementById('blockCount').textContent =
        `${state.blocks.length} block${state.blocks.length !== 1 ? 's' : ''}`;
}

function createBlockEl(block) {
    const def = BLOCK_DEFS[block.type];
    const isSelected = block.id === state.selectedId;

    const el = document.createElement('div');
    el.className = 'builder-block' + (isSelected ? ' selected' : '');
    el.dataset.blockId = block.id;
    el.draggable = true;
    el.style.setProperty('--block-color', def.color);

    el.innerHTML = `
        <div class="builder-block-icon" style="background:${def.color};">
            <i class="fas ${def.icon}"></i>
        </div>
        <div class="builder-block-body">
            <div class="builder-block-label">${def.label}</div>
            <div class="builder-block-summary">${blockSummary(block)}</div>
        </div>
        <div class="builder-block-handle" title="Drag to reorder">
            <i class="fas fa-grip-vertical"></i>
        </div>
    `;

    // Select on click
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBlock(block.id);
    });

    // Drag to reorder (from pipeline)
    el.addEventListener('dragstart', (e) => {
        dragBlock = block;
        dragFromNew = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(block.id));
        el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        dragBlock = null;
    });

    return el;
}

function blockSummary(block) {
    const p = block.params;
    switch (block.type) {
        case 'mesh':      return `${p.nx}×${p.ny} — [${p.xmin},${p.xmax}]×[${p.ymin},${p.ymax}] µm`;
        case 'region':    return `${p.name} (${p.material})`;
        case 'doping':    return `${p.species} ${sciStr(p.concentration)} — ${p.doping_type}`;
        case 'models':    return `T=${p.temperature} K`;
        case 'electrode': return `${p.name} @ ${p.position}`;
        case 'contact':   return `${p.electrode} — ${p.contact_type}`;
        case 'solve':     return p.solve_type === 'bias_sweep'
                              ? `bias sweep: ${p.bias_electrode}=${p.bias_value} V`
                              : 'equilibrium';
        case 'log':       return p.filename;
        default:          return '';
    }
}

function sciStr(v) {
    if (!v) return '0';
    const exp = Math.floor(Math.log10(Math.abs(v)));
    return `${(v / 10 ** exp).toFixed(1)}e${exp}`;
}

// ─────────────────────────────────────────────────────────
// Selection & Properties
// ─────────────────────────────────────────────────────────

function selectBlock(id) {
    state.selectedId = id;
    // Update visual selection without full re-render
    document.querySelectorAll('.builder-block').forEach(el => {
        const bid = parseInt(el.dataset.blockId);
        el.classList.toggle('selected', bid === id);
    });
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
    let html = `
        <div class="mb-2 d-flex align-items-center gap-2">
            <span class="builder-block-type-badge" style="background:${def.color};">
                <i class="fas ${def.icon} me-1"></i>${def.label}
            </span>
            <span class="text-muted" style="font-size:0.7rem;">#${block.id}</span>
        </div>`;

    def.fields.forEach(field => {
        const val = block.params[field.key];
        if (field.type === 'checkbox') {
            html += `
                <div class="form-check mb-1">
                    <input class="form-check-input prop-input" type="checkbox"
                           id="prop_${field.key}" data-key="${field.key}" ${val ? 'checked' : ''}>
                    <label class="form-check-label" for="prop_${field.key}"
                           style="font-size:0.8rem;">${field.label}</label>
                </div>`;
        } else if (field.type === 'select') {
            html += `
                <div class="mb-1">
                    <label class="form-label" for="prop_${field.key}">${field.label}</label>
                    <select class="form-select form-select-sm prop-input"
                            id="prop_${field.key}" data-key="${field.key}">
                        ${field.options.map(o => `<option value="${o}"${o === val ? ' selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>`;
        } else {
            const displayVal = (field.type === 'number' && val !== undefined && val !== '')
                ? (Number.isFinite(val) && Math.abs(val) >= 1e4 ? val.toExponential(2) : val)
                : (val ?? '');
            html += `
                <div class="mb-1">
                    <label class="form-label" for="prop_${field.key}">${field.label}</label>
                    <input class="form-control form-control-sm prop-input" type="text"
                           id="prop_${field.key}" data-key="${field.key}"
                           value="${displayVal}" data-field-type="${field.type}">
                </div>`;
        }
    });

    form.innerHTML = html;
}

function applyProperties() {
    const block = state.blocks.find(b => b.id === state.selectedId);
    if (!block) return;

    document.querySelectorAll('.prop-input').forEach(input => {
        const key = input.dataset.key;
        if (!key) return;
        if (input.type === 'checkbox') {
            block.params[key] = input.checked;
        } else {
            const raw = input.value.trim();
            const fieldType = input.dataset.fieldType;
            if (fieldType === 'number') {
                const n = Number(raw);
                block.params[key] = isNaN(n) ? 0 : n;
            } else {
                block.params[key] = raw;
            }
        }
    });

    // Refresh summary in the block card
    const blockEl = document.querySelector(`.builder-block[data-block-id="${block.id}"]`);
    if (blockEl) {
        const summaryEl = blockEl.querySelector('.builder-block-summary');
        if (summaryEl) summaryEl.textContent = blockSummary(block);
    }
}

// ─────────────────────────────────────────────────────────
// Controls
// ─────────────────────────────────────────────────────────

function initControls() {
    document.getElementById('clearCanvasBtn').addEventListener('click', () => {
        if (state.blocks.length === 0 || confirm('Clear all blocks?')) {
            state.blocks = [];
            state.selectedId = null;
            builderDeckContent = '';
            showProperties(null);
            renderPipeline();
            resetDeckPreview();
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

    document.getElementById('applyPropsBtn').addEventListener('click', applyProperties);
    document.getElementById('deleteBlockBtn').addEventListener('click', deleteSelected);
    document.getElementById('copyBuilderDeckBtn').addEventListener('click', () => {
        if (builderDeckContent) copyToClipboard(builderDeckContent);
    });

    // Deselect when clicking pipeline background
    document.getElementById('pipelineContainer').addEventListener('click', (e) => {
        if (e.target.closest('.builder-block')) return;
        selectBlock(null);
    });
}

function resetDeckPreview() {
    document.getElementById('builderDeckStatus').style.display = 'block';
    document.getElementById('builderDeckStatus').innerHTML =
        '<i class="fas fa-info-circle me-1"></i>Add blocks and click "Preview Deck" to generate the PADRE input deck.';
    document.getElementById('builderDeckContent').style.display = 'none';
    document.getElementById('builderDeckContent').textContent = '';
    document.getElementById('builderDeckLines').textContent = '0 lines';
    document.getElementById('runBuilderBtn').disabled = true;
}

// ─────────────────────────────────────────────────────────
// Deck Generation
// ─────────────────────────────────────────────────────────

function buildStatePayload() {
    const meshBlock    = state.blocks.find(b => b.type === 'mesh');
    const modelsBlock  = state.blocks.find(b => b.type === 'models');

    return {
        mesh:       meshBlock   ? meshBlock.params   : { nx: 50, ny: 50, xmin: 0, xmax: 1, ymin: 0, ymax: 1 },
        models:     modelsBlock ? modelsBlock.params : {},
        regions:    state.blocks.filter(b => b.type === 'region').map(b => b.params),
        dopings:    state.blocks.filter(b => b.type === 'doping').map(b => b.params),
        electrodes: state.blocks.filter(b => b.type === 'electrode').map(b => b.params),
        contacts:   state.blocks.filter(b => b.type === 'contact').map(b => b.params),
        solves:     state.blocks.filter(b => b.type === 'solve').map(b => {
            const p = b.params;
            const s = {
                solve_type: p.solve_type,
                previous:   p.previous,
                project:    p.project,
            };
            if (p.bias_electrode && p.bias_value !== undefined) {
                s.biases = { [p.bias_electrode]: p.bias_value };
            }
            return s;
        }),
        logs: state.blocks.filter(b => b.type === 'log').map(b => ({
            quantities: (b.params.quantities || '').split(/\s+/).filter(Boolean),
            filename:   b.params.filename,
        })),
    };
}

async function generateDeck() {
    if (state.blocks.length === 0) {
        showAlert('Add some blocks to the pipeline first', 'warning');
        return;
    }

    const statusEl  = document.getElementById('builderDeckStatus');
    const contentEl = document.getElementById('builderDeckContent');
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating deck…';
    contentEl.style.display = 'none';

    try {
        const result = await apiCall('/api/builder/generate-deck', 'POST', buildStatePayload());
        if (result.success) {
            builderDeckContent = result.deck;
            statusEl.style.display = 'none';
            contentEl.textContent = result.deck;
            contentEl.style.display = 'block';
            document.getElementById('builderDeckLines').textContent =
                result.deck.split('\n').length + ' lines';
            document.getElementById('runBuilderBtn').disabled = false;
        } else {
            statusEl.innerHTML = `<i class="fas fa-exclamation-triangle text-danger me-1"></i>${result.error}`;
        }
    } catch (e) {
        statusEl.innerHTML = `<i class="fas fa-exclamation-triangle text-danger me-1"></i>${e.message}`;
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

    area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.background = '#eef4fa'; });
    area.addEventListener('dragleave', () => { area.style.background = ''; });
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) readDeckFile(file);
    });
    input.addEventListener('change', () => { if (input.files[0]) readDeckFile(input.files[0]); });
}

function readDeckFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('deckUploadText').value = e.target.result;
        document.getElementById('deckUploadFeedback').innerHTML =
            `<span class="text-success"><i class="fas fa-check me-1"></i>Loaded: ${file.name} (${(file.size/1024).toFixed(1)} KB)</span>`;
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

    // Parse deck into blocks and populate the pipeline
    const parsed = parseDeckToBlocks(deckText);

    if (parsed.blocks.length > 0) {
        state.blocks = parsed.blocks;
        state.nextId = parsed.nextId;
        state.selectedId = null;
        renderPipeline();
        showProperties(null);
    }

    // Always populate the deck preview too
    builderDeckContent = deckText;
    document.getElementById('builderDeckStatus').style.display = 'none';
    document.getElementById('builderDeckContent').textContent = deckText;
    document.getElementById('builderDeckContent').style.display = 'block';
    document.getElementById('builderDeckLines').textContent = deckText.split('\n').length + ' lines';
    document.getElementById('runBuilderBtn').disabled = false;

    const titleMatch = deckText.match(/^\s*TITLE\s+(.+)/im);
    if (titleMatch) {
        const current = document.getElementById('simNameBuilder').value;
        if (!current) document.getElementById('simNameBuilder').value = titleMatch[1].trim();
    }

    bootstrap.Modal.getInstance(document.getElementById('uploadDeckModal')).hide();
    const msg = parsed.blocks.length > 0
        ? `Deck loaded — ${parsed.blocks.length} blocks parsed into pipeline.`
        : 'Deck loaded into preview (could not auto-parse blocks). Click "Run" to submit.';
    showAlert(msg, 'success');
}

// ─────────────────────────────────────────────────────────
// PADRE Deck Parser → blocks
// ─────────────────────────────────────────────────────────

/**
 * Parse a subset of PADRE deck syntax into builder blocks.
 * Handles: mesh rect, region, doping (uniform/gaussian),
 *          models, electrode, contact (ohmic/schottky), solve, log/plot1d
 *
 * Returns { blocks: [...], nextId: number }
 */
function parseDeckToBlocks(deckText) {
    const blocks = [];
    let nextId = 1;
    const sectionOrder = ['structure', 'physics', 'contacts', 'simulation'];

    // Helper: parse key=value tokens from a line
    function parseKV(tokens) {
        const kv = {};
        tokens.forEach(tok => {
            const eq = tok.indexOf('=');
            if (eq > 0) {
                const k = tok.slice(0, eq).toLowerCase().trim();
                let v = tok.slice(eq + 1).trim();
                // Try number parse
                const n = Number(v);
                kv[k] = isNaN(n) ? v : n;
            } else {
                // bare keyword treated as boolean flag
                kv[tok.toLowerCase().trim()] = true;
            }
        });
        return kv;
    }

    function makeBlock(type, params) {
        const def = BLOCK_DEFS[type];
        const merged = Object.assign({}, def.defaults, params);
        return { id: nextId++, type, params: merged };
    }

    const lines = deckText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        // Strip inline comments ($ or #)
        const line = raw.replace(/[\$#].*$/, '').trim();
        if (!line) continue;

        // Tokenise respecting quoted strings
        const tokens = line.match(/\S+/g) || [];
        if (tokens.length === 0) continue;

        const keyword = tokens[0].toLowerCase();
        const rest = tokens.slice(1);
        const kv = parseKV(rest);

        // ── mesh rect ──────────────────────────────────────
        if (keyword === 'mesh') {
            const params = {
                nx: kv.nx || 50,
                ny: kv.ny || 50,
                xmin: kv.xmin !== undefined ? kv.xmin : 0,
                xmax: kv.xmax !== undefined ? kv.xmax : 1,
                ymin: kv.ymin !== undefined ? kv.ymin : 0,
                ymax: kv.ymax !== undefined ? kv.ymax : 1,
            };
            blocks.push(makeBlock('mesh', params));
        }

        // ── region ────────────────────────────────────────
        else if (keyword === 'region') {
            const params = {
                name: kv.name || kv.label || `region${blocks.filter(b=>b.type==='region').length+1}`,
                material: kv.material || kv.mat || 'silicon',
                x1: kv.x1 !== undefined ? kv.x1 : 0,
                y1: kv.y1 !== undefined ? kv.y1 : 0,
                x2: kv.x2 !== undefined ? kv.x2 : 1,
                y2: kv.y2 !== undefined ? kv.y2 : 1,
            };
            blocks.push(makeBlock('region', params));
        }

        // ── doping ───────────────────────────────────────
        else if (keyword === 'doping') {
            const profileType = rest.some(t => t.toLowerCase() === 'gaussian') ? 'gaussian' : 'uniform';
            const species = kv.boron !== undefined ? 'boron'
                          : kv.phosphorus !== undefined ? 'phosphorus'
                          : kv.arsenic !== undefined ? 'arsenic'
                          : 'boron';
            const conc = kv.conc || kv.concentration || kv.uniform || kv.peak || kv[species] || 1e17;
            const params = {
                region: kv.region || kv.reg || 'silicon',
                species,
                doping_type: profileType,
                concentration: conc,
                peak: kv.peak || conc,
                char_length: kv.char || kv.char_length || 0.1,
            };
            blocks.push(makeBlock('doping', params));
        }

        // ── models ───────────────────────────────────────
        else if (keyword === 'models') {
            const params = {
                temperature: kv.temperature || kv.temp || 300,
                srh:    kv.srh    !== undefined ? Boolean(kv.srh)    : false,
                auger:  kv.auger  !== undefined ? Boolean(kv.auger)  : false,
                bgn:    kv.bgn    !== undefined ? Boolean(kv.bgn)    : false,
                conmob: kv.conmob !== undefined ? Boolean(kv.conmob) : false,
                fldmob: kv.fldmob !== undefined ? Boolean(kv.fldmob) : false,
            };
            // Merge with existing models block if present
            const existing = blocks.find(b => b.type === 'models');
            if (existing) {
                Object.assign(existing.params, params);
            } else {
                blocks.push(makeBlock('models', params));
            }
        }

        // ── temperature (standalone) ──────────────────────
        else if (keyword === 'temperature' || keyword === 'temp') {
            const t = parseFloat(rest[0]) || 300;
            const existing = blocks.find(b => b.type === 'models');
            if (existing) {
                existing.params.temperature = t;
            } else {
                blocks.push(makeBlock('models', { temperature: t }));
            }
        }

        // ── electrode ────────────────────────────────────
        else if (keyword === 'electrode') {
            const pos = kv.top !== undefined ? 'top'
                       : kv.bottom !== undefined ? 'bottom'
                       : kv.left !== undefined ? 'left'
                       : kv.right !== undefined ? 'right'
                       : kv.position || kv.pos || 'top';
            const params = {
                name:     kv.name || kv.label || `el${blocks.filter(b=>b.type==='electrode').length+1}`,
                position: pos,
                x1:       kv.x1 !== undefined ? kv.x1 : 0,
                x2:       kv.x2 !== undefined ? kv.x2 : 1,
            };
            blocks.push(makeBlock('electrode', params));
        }

        // ── contact (ohmic / schottky) ────────────────────
        else if (keyword === 'contact') {
            const isSchottky = rest.some(t => t.toLowerCase() === 'schottky');
            const params = {
                electrode:    kv.electrode || kv.number !== undefined ? String(kv.number || kv.electrode) : 'gate',
                contact_type: isSchottky ? 'schottky' : 'ohmic',
                workfunction: kv.workfunction || kv.wf || kv.barrier || 4.1,
            };
            blocks.push(makeBlock('contact', params));
        }

        // ── solve ────────────────────────────────────────
        else if (keyword === 'solve') {
            const isEq   = rest.some(t => ['equilibrium','eq'].includes(t.toLowerCase())) ||
                           Object.keys(kv).some(k => ['equilibrium','eq'].includes(k));
            const prev   = kv.previous !== undefined || rest.some(t => t.toLowerCase() === 'previous');
            const proj   = kv.project  !== undefined || rest.some(t => t.toLowerCase() === 'project');

            // Find any bias specs (electrode=value pairs that look like voltages)
            let biasEl = '', biasVal = 0;
            // Look for electrode name=value (non-flag numeric KVs excluding known keys)
            const knownKeys = new Set(['previous','project','equilibrium','initial','eq']);
            for (const [k, v] of Object.entries(kv)) {
                if (!knownKeys.has(k) && typeof v === 'number') {
                    biasEl = k;
                    biasVal = v;
                    break;
                }
            }

            const params = {
                solve_type:      (isEq && !biasEl) ? 'equilibrium' : 'bias_sweep',
                previous:        prev,
                project:         proj,
                bias_electrode:  biasEl,
                bias_value:      biasVal,
            };
            blocks.push(makeBlock('solve', params));
        }

        // ── log / plot1d ──────────────────────────────────
        else if (keyword === 'log' || keyword === 'plot1d') {
            // Collect quantity flags
            const allQuantities = ['potential','electrons','holes','e_field','qfn','qfp',
                                   'doping','band_val','band_cond','net_charge','recomb'];
            const found = allQuantities.filter(q => kv[q] !== undefined || rest.some(t => t.toLowerCase() === q));
            const params = {
                quantities: found.length > 0 ? found.join(' ') : 'potential electrons holes',
                filename:   kv.outfile || kv.ivfile || kv.acfile || kv.file || 'output',
            };
            blocks.push(makeBlock('log', params));
        }
    }

    return { blocks, nextId };
}
