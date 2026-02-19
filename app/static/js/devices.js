/* Device Configuration Page — interactive SVG, tabbed UI, sci-notation support */

let selectedPreset = null;           // full preset object from API
let paramDescriptions = {};          // { paramName: 'tooltip text' }
let currentDeckContent = '';
let deckUpdateDebounceTimer = null;
let schematicDebounceTimer = null;
const DEBOUNCE_MS = 500;
let _editingParam = null;
let deckFullscreenModal;

// ─────────────────────────────────────────────────────────
// Bootstrap init
// ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    deckFullscreenModal = new bootstrap.Modal(document.getElementById('deckFullscreenModal'));
    loadPresets();
    setupDeckPreviewHandlers();
    setupParamEditor();
    setupFormSubmit();

    document.getElementById('backToGridBtn').addEventListener('click', showGrid);
    document.getElementById('autoNameBtn').addEventListener('click', autoGenerateName);
    document.getElementById('refreshDeckBtn').addEventListener('click', generateDeckPreview);
});

// ─────────────────────────────────────────────────────────
// Device grid (initial view)
// ─────────────────────────────────────────────────────────

async function loadPresets() {
    try {
        const result = await apiCall('/api/devices/presets');
        if (result.success) renderDeviceGrid(result.presets);
    } catch (err) {
        document.getElementById('deviceCards').innerHTML =
            `<div class="alert alert-danger">Failed to load devices: ${err.message}</div>`;
    }
}

function renderDeviceGrid(presets) {
    const container = document.getElementById('deviceCards');
    container.innerHTML = `<div class="row g-3">` +
        presets.map(p => `
            <div class="col-6 col-sm-4 col-md-3 col-lg-2">
                <div class="card h-100 device-card shadow-sm"
                     style="cursor:pointer; transition:transform .15s, box-shadow .15s;"
                     onclick="selectPreset('${p.id}', '${p.label}')"
                     onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 16px rgba(0,0,0,.15)'"
                     onmouseleave="this.style.transform='';this.style.boxShadow=''">
                    <div class="card-body text-center py-4">
                        <i class="fas ${p.icon || 'fa-microchip'} fa-2x mb-2 text-primary"></i>
                        <div class="fw-bold small">${p.label}</div>
                        <div class="text-muted mt-1" style="font-size:0.72rem;">${p.description}</div>
                    </div>
                </div>
            </div>
        `).join('') + `</div>`;
}

function showGrid() {
    document.getElementById('deviceGrid').style.display = '';
    document.getElementById('deviceWorkspace').style.display = 'none';
    selectedPreset = null;
}

// ─────────────────────────────────────────────────────────
// Preset selection → enter workspace
// ─────────────────────────────────────────────────────────

async function selectPreset(deviceType, label) {
    try {
        const result = await apiCall(`/api/devices/presets/${deviceType}`);
        if (!result.success) { showAlert('Failed to load preset', 'danger'); return; }

        selectedPreset = result.preset;
        paramDescriptions = result.preset.param_descriptions || {};

        // Show workspace, hide grid
        document.getElementById('deviceGrid').style.display = 'none';
        document.getElementById('deviceWorkspace').style.display = '';
        document.getElementById('workspaceDeviceLabel').textContent = label;
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('refreshDeckBtn').disabled = false;
        document.getElementById('svgHint').style.display = '';

        // Populate tabs
        renderTabParameters(deviceType, result.preset);

        // Auto-generate simulation name
        autoGenerateName();

        // Fetch schematic + deck preview
        refreshSchematic();
        if (document.getElementById('autoUpdateDeck').checked) generateDeckPreview();

    } catch (err) {
        showAlert(`Error: ${err.message}`, 'danger');
    }
}

// ─────────────────────────────────────────────────────────
// Tab-based parameter rendering
// ─────────────────────────────────────────────────────────

// Which keys go to which tab
const TAB_PHYSICS   = ['temperature','srh','auger','bgn','conmob','fldmob','newton','device_type','substrate_type'];
const TAB_STRUCTURE = [
    'p_doping','n_doping','junction_position','length','width',
    'channel_length','channel_width','gate_oxide_thickness','oxide_thickness',
    'substrate_doping','source_drain_doping','channel_doping','contact_doping',
    'base_width','base_doping','emitter_doping','collector_doping',
    'emitter_width','collector_width','emitter_depth','base_thickness',
    'barrier_height','gate_workfunction','gate_doping','gate_length',
    'junction_depth','channel_depth','substrate_depth','device_depth','device_width',
];
const TAB_MESH      = ['nx','ny'];
const TAB_SWEEP     = [
    'forward_sweep_enabled','forward_v_start','forward_v_end','forward_v_step',
    'reverse_sweep_enabled','reverse_v_start','reverse_v_end','reverse_v_step',
    'vg_sweep_enabled','vg_start','vg_end','vg_step',
    'vd_sweep_enabled','vd_start','vd_end','vd_step',
    'vbe_sweep_enabled','vbe_start','vbe_end','vbe_step',
    'vce_sweep_enabled','vce_start','vce_end','vce_step',
];

function renderTabParameters(deviceType, preset) {
    const params  = preset.parameters  || {};
    const outputs = preset.outputs     || {};
    const sweep   = preset.sweep       || {};

    // Classify each param key into a tab bucket
    const buckets = { physics: {}, structure: {}, mesh: {}, sweep: {}, other: {} };

    for (const [k, v] of Object.entries(params)) {
        if (TAB_MESH.includes(k))          buckets.mesh[k] = v;
        else if (TAB_PHYSICS.includes(k))   buckets.physics[k] = v;
        else if (TAB_STRUCTURE.includes(k)) buckets.structure[k] = v;
        else                                buckets.other[k] = v;
    }
    for (const [k, v] of Object.entries(sweep)) buckets.sweep[k] = v;

    document.getElementById('paramsPhysics').innerHTML   = renderParamGroup('param', {...buckets.physics, ...buckets.other});
    document.getElementById('paramsDoping').innerHTML    = renderParamGroup('param', buckets.structure);
    document.getElementById('paramsOutputs').innerHTML   = renderParamGroup('output', outputs);
    document.getElementById('paramsSweep').innerHTML     = renderParamGroup('sweep', buckets.sweep);

    // Mesh tab
    document.getElementById('meshInputs').innerHTML = renderParamGroup('param', buckets.mesh);
    updateMeshCount();

    // Attach change listeners
    document.querySelectorAll('.param-input').forEach(input => {
        input.addEventListener('change', onParameterChange);
        input.addEventListener('input',  onParameterChange);
    });
    // Mesh count updater
    document.querySelectorAll('[id="param_nx"],[id="param_ny"]').forEach(el => {
        el.addEventListener('input', updateMeshCount);
    });
}

function updateMeshCount() {
    const nxEl = document.getElementById('param_nx');
    const nyEl = document.getElementById('param_ny');
    if (!nxEl || !nyEl) return;
    const nx = parseInt(nxEl.value) || 0;
    const ny = parseInt(nyEl.value) || 0;
    const total = nx * ny;
    const countEl = document.getElementById('meshNodeCount');
    countEl.innerHTML = `Total nodes: <strong>${total.toLocaleString()}</strong>` +
        (total > 2500 ? ' <span class="text-danger"><i class="fas fa-exclamation-triangle"></i> Exceeds safe limit!</span>' :
                        ' <span class="text-success"><i class="fas fa-check"></i> OK</span>');
}

function renderParamGroup(prefix, params) {
    if (!params || Object.keys(params).length === 0)
        return '<p class="text-muted small py-2 px-1"><i class="fas fa-check-circle text-success"></i> No parameters in this category.</p>';
    return Object.entries(params).map(([key, value]) => renderInputField(`${prefix}_${key}`, key, value)).join('');
}

function renderInputField(inputId, key, value) {
    const label  = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const desc   = paramDescriptions[key] || '';
    const tooltip = desc ? ` title="${desc.replace(/"/g,"'")}"` : '';
    const descHtml = desc
        ? `<div class="text-muted" style="font-size:0.68rem; line-height:1.3; margin-top:1px;">${desc}</div>`
        : '';

    if (typeof value === 'boolean') {
        return `
        <div class="form-check mb-2">
            <input class="form-check-input param-input" type="checkbox" id="${inputId}" ${value ? 'checked' : ''}>
            <label class="form-check-label small" for="${inputId}"${tooltip}>
                ${label}
                ${desc ? `<i class="fas fa-info-circle text-muted ms-1" style="font-size:0.7rem;" title="${desc.replace(/"/g,"'")}"></i>` : ''}
            </label>
            ${descHtml}
        </div>`;
    }

    // Detect if the value looks like a scientific-notation doping number
    const isSci = typeof value === 'number' && (Math.abs(value) >= 1e4 || (Math.abs(value) < 1e-2 && value !== 0));
    const displayVal = isSci ? value.toExponential() : (value ?? '');

    return `
    <div class="mb-2">
        <label for="${inputId}" class="form-label small mb-0"${tooltip}>
            ${label}
            ${desc ? `<i class="fas fa-info-circle text-muted ms-1" style="font-size:0.7rem;" title="${desc.replace(/"/g,"'")}"></i>` : ''}
        </label>
        ${descHtml}
        <input class="form-control form-control-sm param-input${isSci ? ' sci-input' : ''}"
               type="text" id="${inputId}" value="${displayVal}"
               placeholder="${isSci ? 'e.g. 1e17' : ''}">
    </div>`;
}

// ─────────────────────────────────────────────────────────
// Parameter value reading — supports scientific notation strings
// ─────────────────────────────────────────────────────────

function parseSciValue(str) {
    if (typeof str !== 'string') return str;
    const trimmed = str.trim();
    const num = Number(trimmed);    // handles '1e17', '1.5e-3', '300', etc.
    return isNaN(num) ? trimmed : num;
}

function getInputValue(input) {
    if (input.type === 'checkbox') return input.checked;
    const raw = input.value.trim();
    if (raw === '') return null;
    return parseSciValue(raw);
}

function collectParameters() {
    const parameters = {};
    document.querySelectorAll('[id^="param_"]').forEach(input => {
        parameters[input.id.replace('param_', '')] = getInputValue(input);
    });
    document.querySelectorAll('[id^="output_"]').forEach(input => {
        parameters[input.id.replace('output_', '')] = getInputValue(input);
    });
    document.querySelectorAll('[id^="sweep_"]').forEach(input => {
        parameters[input.id.replace('sweep_', '')] = getInputValue(input);
    });
    return parameters;
}

// ─────────────────────────────────────────────────────────
// Auto-generate simulation name
// ─────────────────────────────────────────────────────────

function autoGenerateName() {
    if (!selectedPreset) return;
    const label = document.getElementById('workspaceDeviceLabel').textContent || 'Device';
    const ts = new Date();
    const stamp = `${ts.getMonth()+1}/${ts.getDate()} ${ts.getHours()}:${String(ts.getMinutes()).padStart(2,'0')}`;
    // Try to grab one key param value for the name
    let keyParam = '';
    const nxEl = document.getElementById('param_nx');
    const clEl  = document.getElementById('param_channel_length');
    if (clEl)  keyParam = ` L=${clEl.value}µm`;
    document.getElementById('simName').value = `${label}${keyParam} – ${stamp}`;
}

// ─────────────────────────────────────────────────────────
// Debounced change handler
// ─────────────────────────────────────────────────────────

function onParameterChange() {
    if (document.getElementById('autoUpdateDeck').checked) {
        clearTimeout(deckUpdateDebounceTimer);
        deckUpdateDebounceTimer = setTimeout(generateDeckPreview, DEBOUNCE_MS);
    }
    clearTimeout(schematicDebounceTimer);
    schematicDebounceTimer = setTimeout(refreshSchematic, DEBOUNCE_MS);
}

// ─────────────────────────────────────────────────────────
// Interactive SVG schematic
// ─────────────────────────────────────────────────────────

async function refreshSchematic() {
    const deviceType = document.getElementById('workspaceDeviceLabel').dataset.deviceType;
    if (!deviceType) return;

    const params = collectParameters();
    const qs = new URLSearchParams({ interactive: 'true' });
    for (const [k, v] of Object.entries(params)) {
        if (v !== null && v !== undefined && typeof v !== 'boolean') qs.set(k, v);
    }

    document.getElementById('schematicPlaceholder').style.display = 'none';
    document.getElementById('schematicSvgWrapper').style.display  = 'none';
    document.getElementById('schematicLoading').style.display     = 'block';

    try {
        const result = await apiCall(`/api/devices/schematic/${deviceType}?${qs.toString()}`);
        if (result.success) {
            document.getElementById('schematicSvg').innerHTML = result.svg;
            const svgEl = document.getElementById('schematicSvg').querySelector('svg');
            if (svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto'; }
            attachParamLabelHandlers();
            document.getElementById('schematicSvgWrapper').style.display = 'block';
        } else {
            document.getElementById('schematicPlaceholder').style.display = 'block';
        }
    } catch (e) {
        console.warn('Schematic fetch failed:', e);
        document.getElementById('schematicPlaceholder').style.display = 'block';
    } finally {
        document.getElementById('schematicLoading').style.display = 'none';
    }
}

function attachParamLabelHandlers() {
    document.getElementById('schematicSvg').querySelectorAll('.param-label').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => { e.stopPropagation(); openParamEditor(el, e); });
    });
}

function openParamEditor(labelEl, mouseEvent) {
    const paramName   = labelEl.dataset.param;
    const currentVal  = labelEl.dataset.value;

    _editingParam = paramName;

    const overlay = document.getElementById('paramEditOverlay');
    const input   = document.getElementById('paramEditInput');
    const lbl     = document.getElementById('paramEditLabel');
    const descEl  = document.getElementById('paramEditDesc');

    lbl.textContent    = paramName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    descEl.textContent = paramDescriptions[paramName] || '';
    input.value        = currentVal;

    const wrapperRect = document.getElementById('schematicSvgWrapper').getBoundingClientRect();
    const clickX = mouseEvent.clientX - wrapperRect.left + document.getElementById('schematicSvgWrapper').scrollLeft;
    const clickY = mouseEvent.clientY - wrapperRect.top  + document.getElementById('schematicSvgWrapper').scrollTop;
    overlay.style.left    = Math.min(clickX, wrapperRect.width - 200) + 'px';
    overlay.style.top     = (clickY + 10) + 'px';
    overlay.style.display = 'block';

    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function setupParamEditor() {
    document.getElementById('paramEditApply').addEventListener('click', applyParamEdit);
    document.getElementById('paramEditCancel').addEventListener('click', closeParamEditor);
    document.getElementById('paramEditInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  applyParamEdit();
        if (e.key === 'Escape') closeParamEditor();
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#paramEditOverlay') && !e.target.closest('.param-label')) closeParamEditor();
    });
}

function applyParamEdit() {
    if (!_editingParam) return;
    const raw = document.getElementById('paramEditInput').value.trim();
    if (!raw) { closeParamEditor(); return; }

    const formField = document.getElementById(`param_${_editingParam}`);
    if (formField) {
        formField.value = raw;
        formField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    closeParamEditor();
    clearTimeout(schematicDebounceTimer);
    clearTimeout(deckUpdateDebounceTimer);
    refreshSchematic();
    if (document.getElementById('autoUpdateDeck').checked) generateDeckPreview();
}

function closeParamEditor() {
    document.getElementById('paramEditOverlay').style.display = 'none';
    _editingParam = null;
}

// ─────────────────────────────────────────────────────────
// Form submission
// ─────────────────────────────────────────────────────────

function setupFormSubmit() {
    document.getElementById('submitBtn').addEventListener('click', async () => {
        const name       = document.getElementById('simName').value.trim();
        const deviceType = document.getElementById('workspaceDeviceLabel').dataset.deviceType;

        if (!name || !deviceType) {
            showAlert('Please fill in the simulation name', 'warning'); return;
        }

        const parameters = collectParameters();

        try {
            const result = await apiCall('/api/simulation/create', 'POST', {
                name, device_type: deviceType, parameters, auto_run: true
            });
            if (result.success) {
                showAlert(`Simulation "${name}" created and started!`, 'success');
                setTimeout(() => {
                    window.location.href = `${getBasePath()}/simulation/${result.simulation.id}`;
                }, 900);
            }
        } catch (err) {
            showAlert(`Error: ${err.message}`, 'danger');
        }
    });
}

// selectPreset also needs to store deviceType for refreshSchematic
const _origSelectPreset = selectPreset;
// Patch the label element to carry the deviceType
async function selectPreset(deviceType, label) {
    try {
        const result = await apiCall(`/api/devices/presets/${deviceType}`);
        if (!result.success) { showAlert('Failed to load preset', 'danger'); return; }

        selectedPreset   = result.preset;
        paramDescriptions = result.preset.param_descriptions || {};

        document.getElementById('deviceGrid').style.display = 'none';
        document.getElementById('deviceWorkspace').style.display = '';
        const wLabel = document.getElementById('workspaceDeviceLabel');
        wLabel.textContent = label;
        wLabel.dataset.deviceType = deviceType;    // store for refreshSchematic

        document.getElementById('submitBtn').disabled = false;
        document.getElementById('refreshDeckBtn').disabled = false;
        document.getElementById('svgHint').style.display = '';

        renderTabParameters(deviceType, result.preset);
        autoGenerateName();
        refreshSchematic();
        if (document.getElementById('autoUpdateDeck').checked) generateDeckPreview();

    } catch (err) {
        showAlert(`Error: ${err.message}`, 'danger');
    }
}

// ─────────────────────────────────────────────────────────
// Deck preview
// ─────────────────────────────────────────────────────────

async function generateDeckPreview() {
    const deviceType = document.getElementById('workspaceDeviceLabel').dataset.deviceType;
    if (!deviceType) { showDeckStatus('Select a device to see the input deck preview'); return; }

    const parameters = collectParameters();
    showDeckLoading();

    try {
        const result = await apiCall('/api/simulation/preview-deck', 'POST', { device_type: deviceType, parameters });
        if (result.success) { currentDeckContent = result.deck; showDeckContent(result.deck); }
        else showDeckError(result.error || 'Failed to generate deck preview');
    } catch (err) {
        showDeckError(err.message || 'Failed to generate deck preview');
    }
}

function setupDeckPreviewHandlers() {
    document.getElementById('copyDeckBtn').addEventListener('click', () => {
        if (currentDeckContent) copyToClipboard(currentDeckContent);
    });
    document.getElementById('downloadPreviewDeckBtn').addEventListener('click', downloadDeck);
    document.getElementById('copyFullscreenDeckBtn').addEventListener('click', () => {
        if (currentDeckContent) copyToClipboard(currentDeckContent);
    });
    document.getElementById('downloadFullscreenDeckBtn').addEventListener('click', downloadDeck);
}

function showDeckStatus(message) {
    document.getElementById('deckPreviewStatus').innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    document.getElementById('deckPreviewStatus').style.display = 'block';
    document.getElementById('deckPreviewLoading').style.display = 'none';
    document.getElementById('deckPreviewError').style.display = 'none';
    document.getElementById('deckPreviewContent').style.display = 'none';
    document.getElementById('copyDeckBtn').disabled = true;
    document.getElementById('downloadPreviewDeckBtn').disabled = true;
    document.getElementById('deckLineCount').textContent = '0 lines';
    document.getElementById('deckLastUpdated').textContent = 'Not generated';
}

function showDeckLoading() {
    document.getElementById('deckPreviewStatus').style.display = 'none';
    document.getElementById('deckPreviewLoading').style.display = 'block';
    document.getElementById('deckPreviewError').style.display = 'none';
    document.getElementById('deckPreviewContent').style.display = 'none';
}

function showDeckError(message) {
    document.getElementById('deckPreviewStatus').style.display = 'none';
    document.getElementById('deckPreviewLoading').style.display = 'none';
    document.getElementById('deckPreviewError').style.display = 'block';
    document.getElementById('deckErrorMessage').textContent = message;
    document.getElementById('deckPreviewContent').style.display = 'none';
    document.getElementById('copyDeckBtn').disabled = true;
    document.getElementById('downloadPreviewDeckBtn').disabled = true;
}

function showDeckContent(content) {
    document.getElementById('deckPreviewStatus').style.display = 'none';
    document.getElementById('deckPreviewLoading').style.display = 'none';
    document.getElementById('deckPreviewError').style.display = 'none';
    document.getElementById('deckPreviewContent').style.display = 'block';
    document.getElementById('deckPreviewContent').textContent = content;
    document.getElementById('copyDeckBtn').disabled = false;
    document.getElementById('downloadPreviewDeckBtn').disabled = false;
    document.getElementById('deckLineCount').textContent = `${content.split('\n').length} lines`;
    document.getElementById('deckLastUpdated').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
}

function downloadDeck() {
    if (!currentDeckContent) return;
    const name = document.getElementById('simName').value || 'preview';
    const el = document.createElement('a');
    el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(currentDeckContent));
    el.setAttribute('download', `${name}.deck`);
    el.style.display = 'none';
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
}
