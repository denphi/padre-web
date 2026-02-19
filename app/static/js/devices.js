/* Device Configuration Page Logic — with interactive SVG schematic */

let selectedPreset = null;
let deckFullscreenModal;
let currentDeckContent = '';
let deckUpdateDebounceTimer = null;
let schematicDebounceTimer = null;
const DEBOUNCE_MS = 500;

// Currently active inline editor state
let _editingParam = null;

document.addEventListener('DOMContentLoaded', () => {
    deckFullscreenModal = new bootstrap.Modal(document.getElementById('deckFullscreenModal'));
    loadPresets();
    setupFormHandlers();
    setupDeckPreviewHandlers();
    setupParamEditor();
});

// ─────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────

async function loadPresets() {
    try {
        const result = await apiCall('/api/devices/presets');
        if (result.success) {
            renderPresets(result.presets);
        }
    } catch (error) {
        console.error('Error loading presets:', error);
        showAlert('Failed to load device presets', 'danger');
    }
}

function renderPresets(presets) {
    const container = document.getElementById('devicePresets');
    container.innerHTML = presets.map(preset => `
        <button type="button" class="list-group-item list-group-item-action text-start py-2 px-3"
                data-preset-id="${preset.id}"
                onclick="selectPreset('${preset.id}', '${preset.label}')">
            <div class="fw-bold small">${preset.label}</div>
            <div class="text-muted" style="font-size:0.72rem">${preset.description}</div>
        </button>
    `).join('');

    const select = document.getElementById('deviceType');
    select.innerHTML = '<option value="">Select a device type…</option>' +
        presets.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
}

async function selectPreset(deviceType, label) {
    try {
        document.getElementById('deviceType').value = deviceType;

        document.querySelectorAll('#devicePresets .list-group-item').forEach(item => {
            item.classList.toggle('active', item.dataset.presetId === deviceType);
        });

        const result = await apiCall(`/api/devices/presets/${deviceType}`);
        if (result.success) {
            selectedPreset = result.preset;
            renderParameterForm(deviceType, result.preset);
            document.getElementById('submitBtn').disabled = false;
            document.getElementById('refreshDeckBtn').disabled = false;
            document.getElementById('svgHint').style.display = '';

            // Fetch schematic + deck preview together
            refreshSchematic();
            if (document.getElementById('autoUpdateDeck').checked) {
                generateDeckPreview();
            }
        }
    } catch (error) {
        console.error('Error selecting preset:', error);
        showAlert('Failed to load preset', 'danger');
    }
}

// ─────────────────────────────────────────────────────────
// Parameter form
// ─────────────────────────────────────────────────────────

function renderParameterForm(deviceType, preset) {
    const container = document.getElementById('parametersContainer');
    const parameters = preset.parameters || {};
    const outputs = preset.outputs || {};
    const sweep = preset.sweep || {};

    let html = '';
    const categories = categorizeParameters(parameters);

    for (const [category, params] of Object.entries(categories)) {
        html += `<div class="parameter-group mb-2">
                    <h6 class="small text-uppercase text-muted mb-1">${category}</h6>`;
        for (const [key, value] of Object.entries(params)) {
            html += renderInputField(`param_${key}`, key, value);
        }
        html += '</div>';
    }

    if (Object.keys(outputs).length > 0) {
        html += `<div class="parameter-group mb-2">
                    <h6 class="small text-uppercase text-muted mb-1">Output Logging</h6>`;
        for (const [key, value] of Object.entries(outputs)) {
            html += renderInputField(`output_${key}`, key, value);
        }
        html += '</div>';
    }

    if (Object.keys(sweep).length > 0) {
        html += `<div class="parameter-group mb-2">
                    <h6 class="small text-uppercase text-muted mb-1">Voltage Sweep</h6>`;
        for (const [key, value] of Object.entries(sweep)) {
            html += renderInputField(`sweep_${key}`, key, value);
        }
        html += '</div>';
    }

    container.innerHTML = html;

    document.querySelectorAll('.param-input').forEach(input => {
        input.addEventListener('change', onParameterChange);
        input.addEventListener('input', onParameterChange);
    });
}

function renderInputField(inputId, key, value) {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const inputType = typeof value === 'number' ? 'number' :
                     typeof value === 'boolean' ? 'checkbox' : 'text';

    if (inputType === 'checkbox') {
        return `
            <div class="form-check mb-1">
                <input class="form-check-input param-input" type="checkbox" id="${inputId}"
                       ${value ? 'checked' : ''}>
                <label class="form-check-label small" for="${inputId}">${label}</label>
            </div>
        `;
    }
    return `
        <div class="mb-1">
            <label for="${inputId}" class="form-label small mb-0">${label}</label>
            <input class="form-control form-control-sm param-input" type="${inputType}"
                   id="${inputId}" value="${value ?? ''}"
                   ${inputType === 'number' ? 'step="any"' : ''}>
        </div>
    `;
}

function onParameterChange() {
    if (document.getElementById('autoUpdateDeck').checked) {
        clearTimeout(deckUpdateDebounceTimer);
        deckUpdateDebounceTimer = setTimeout(generateDeckPreview, DEBOUNCE_MS);
    }
    clearTimeout(schematicDebounceTimer);
    schematicDebounceTimer = setTimeout(refreshSchematic, DEBOUNCE_MS);
}

function categorizeParameters(params) {
    const categories = {
        'Temperature & Physics': {},
        'Doping & Structure': {},
        'Advanced Options': {}
    };

    const tempPhysics = ['temperature', 'srh', 'auger', 'conmob', 'fldmob', 'bgn', 'newton'];
    const dopingStructure = [
        'doping_p', 'doping_n', 'junction_depth', 'channel_length', 'channel_width',
        'oxide_thickness', 'substrate_doping', 'source_drain_doping', 'base_width',
        'gate_doping', 'emitter_doping', 'collector_doping', 'barrier_height',
        'semiconductor_doping', 'p_doping', 'n_doping', 'junction_position',
        'length', 'width', 'device_width', 'device_depth', 'gate_oxide_thickness',
        'channel_doping', 'emitter_width', 'collector_width', 'base_doping',
        'emitter_depth', 'base_thickness', 'channel_depth', 'substrate_depth',
        'gate_length', 'contact_doping', 'gate_workfunction',
    ];

    for (const [key, value] of Object.entries(params)) {
        if (tempPhysics.includes(key)) {
            categories['Temperature & Physics'][key] = value;
        } else if (dopingStructure.includes(key)) {
            categories['Doping & Structure'][key] = value;
        } else {
            categories['Advanced Options'][key] = value;
        }
    }

    return Object.fromEntries(Object.entries(categories).filter(([_, v]) => Object.keys(v).length > 0));
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

function getInputValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number') return input.value ? parseFloat(input.value) : null;
    return input.value || null;
}

// ─────────────────────────────────────────────────────────
// Interactive SVG Schematic
// ─────────────────────────────────────────────────────────

async function refreshSchematic() {
    const deviceType = document.getElementById('deviceType').value;
    if (!deviceType) return;

    const params = collectParameters();
    // Build query string — only pass numeric/string geometry params
    const qs = new URLSearchParams();
    qs.set('interactive', 'true');
    for (const [k, v] of Object.entries(params)) {
        if (v !== null && v !== undefined && typeof v !== 'boolean') {
            qs.set(k, v);
        }
    }

    document.getElementById('schematicPlaceholder').style.display = 'none';
    document.getElementById('schematicSvgWrapper').style.display = 'none';
    document.getElementById('schematicLoading').style.display = 'block';

    try {
        const result = await apiCall(`/api/devices/schematic/${deviceType}?${qs.toString()}`);
        if (result.success) {
            const wrapper = document.getElementById('schematicSvg');
            wrapper.innerHTML = result.svg;
            // Make SVG responsive
            const svgEl = wrapper.querySelector('svg');
            if (svgEl) {
                svgEl.style.maxWidth = '100%';
                svgEl.style.height = 'auto';
            }
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
    const svgContainer = document.getElementById('schematicSvg');
    svgContainer.querySelectorAll('.param-label').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openParamEditor(el, e);
        });
    });
}

function openParamEditor(labelEl, mouseEvent) {
    const paramName = labelEl.dataset.param;
    const currentValue = parseFloat(labelEl.dataset.value) || 0;

    _editingParam = paramName;

    const overlay = document.getElementById('paramEditOverlay');
    const input = document.getElementById('paramEditInput');
    const lbl = document.getElementById('paramEditLabel');

    lbl.textContent = paramName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    input.value = currentValue;

    // Position the overlay near the click
    const wrapperRect = document.getElementById('schematicSvgWrapper').getBoundingClientRect();
    const clickX = mouseEvent.clientX - wrapperRect.left + document.getElementById('schematicSvgWrapper').scrollLeft;
    const clickY = mouseEvent.clientY - wrapperRect.top + document.getElementById('schematicSvgWrapper').scrollTop;
    overlay.style.left = Math.min(clickX, wrapperRect.width - 180) + 'px';
    overlay.style.top = (clickY + 10) + 'px';
    overlay.style.display = 'block';

    setTimeout(() => input.focus(), 50);
}

function setupParamEditor() {
    document.getElementById('paramEditApply').addEventListener('click', applyParamEdit);
    document.getElementById('paramEditCancel').addEventListener('click', closeParamEditor);
    document.getElementById('paramEditInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyParamEdit();
        if (e.key === 'Escape') closeParamEditor();
    });
    // Click outside to close
    document.getElementById('schematicSvgWrapper').addEventListener('click', (e) => {
        if (!e.target.closest('#paramEditOverlay') && !e.target.closest('.param-label')) {
            closeParamEditor();
        }
    });
}

function applyParamEdit() {
    if (!_editingParam) return;
    const newValue = parseFloat(document.getElementById('paramEditInput').value);
    if (isNaN(newValue)) { closeParamEditor(); return; }

    // Push value into the corresponding form field
    const formField = document.getElementById(`param_${_editingParam}`);
    if (formField) {
        formField.value = newValue;
        formField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    closeParamEditor();
    // Trigger immediate schematic + deck refresh
    clearTimeout(schematicDebounceTimer);
    clearTimeout(deckUpdateDebounceTimer);
    refreshSchematic();
    if (document.getElementById('autoUpdateDeck').checked) {
        generateDeckPreview();
    }
}

function closeParamEditor() {
    document.getElementById('paramEditOverlay').style.display = 'none';
    _editingParam = null;
}

// ─────────────────────────────────────────────────────────
// Form submission & deck preview
// ─────────────────────────────────────────────────────────

function setupFormHandlers() {
    document.getElementById('deviceForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('simName').value;
        const deviceType = document.getElementById('deviceType').value;

        if (!name || !deviceType) {
            showAlert('Please fill in all required fields', 'warning');
            return;
        }

        const parameters = collectParameters();

        try {
            const result = await apiCall('/api/simulation/create', 'POST', {
                name,
                device_type: deviceType,
                parameters,
                auto_run: true
            });

            if (result.success) {
                const message = result.auto_started
                    ? `Simulation "${name}" created and started!`
                    : `Simulation "${name}" created successfully!`;
                showAlert(message, 'success');
                setTimeout(() => {
                    window.location.href = `${getBasePath()}/simulation/${result.simulation.id}`;
                }, 1000);
            }
        } catch (error) {
            console.error('Error creating simulation:', error);
            showAlert(`Error: ${error.message}`, 'danger');
        }
    });

    document.getElementById('refreshDeckBtn').addEventListener('click', generateDeckPreview);

    document.getElementById('deviceType').addEventListener('change', (e) => {
        const deviceType = e.target.value;
        if (deviceType) {
            const option = e.target.options[e.target.selectedIndex];
            selectPreset(deviceType, option.text);
        }
    });
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

async function generateDeckPreview() {
    const deviceType = document.getElementById('deviceType').value;
    if (!deviceType) {
        showDeckStatus('Select a device to see the input deck preview');
        return;
    }

    const parameters = collectParameters();
    showDeckLoading();

    try {
        const result = await apiCall('/api/simulation/preview-deck', 'POST', {
            device_type: deviceType,
            parameters
        });

        if (result.success) {
            currentDeckContent = result.deck;
            showDeckContent(result.deck);
        } else {
            showDeckError(result.error || 'Failed to generate deck preview');
        }
    } catch (error) {
        showDeckError(error.message || 'Failed to generate deck preview');
    }
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
    const lineCount = content.split('\n').length;
    document.getElementById('deckLineCount').textContent = `${lineCount} lines`;
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
