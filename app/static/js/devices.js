/* Device Configuration Page Logic */

let selectedPreset = null;
let deckFullscreenModal;
let currentDeckContent = '';
let deckUpdateDebounceTimer = null;
const DECK_UPDATE_DEBOUNCE_MS = 500;

document.addEventListener('DOMContentLoaded', () => {
    deckFullscreenModal = new bootstrap.Modal(document.getElementById('deckFullscreenModal'));
    loadPresets();
    setupFormHandlers();
    setupDeckPreviewHandlers();
});

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
        <button type="button" class="list-group-item list-group-item-action text-start"
                data-preset-id="${preset.id}"
                onclick="selectPreset('${preset.id}', '${preset.label}')">
            <div class="fw-bold">${preset.label}</div>
            <small class="text-muted">${preset.description}</small>
        </button>
    `).join('');

    // Populate device type select
    const select = document.getElementById('deviceType');
    select.innerHTML = '<option value="">Select a device type...</option>' +
        presets.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
}

async function selectPreset(deviceType, label) {
    try {
        document.getElementById('deviceType').value = deviceType;

        // Update active state in preset list
        document.querySelectorAll('#devicePresets .list-group-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.presetId === deviceType) {
                item.classList.add('active');
            }
        });

        const result = await apiCall(`/api/devices/presets/${deviceType}`);

        if (result.success) {
            selectedPreset = result.preset;
            renderParameterForm(deviceType, result.preset);
            document.getElementById('submitBtn').disabled = false;
            document.getElementById('refreshDeckBtn').disabled = false;

            // Auto-generate deck preview
            if (document.getElementById('autoUpdateDeck').checked) {
                generateDeckPreview();
            }
        }
    } catch (error) {
        console.error('Error selecting preset:', error);
        showAlert('Failed to load preset', 'danger');
    }
}

function renderParameterForm(deviceType, preset) {
    const container = document.getElementById('parametersContainer');
    const parameters = preset.parameters || {};
    const outputs = preset.outputs || {};
    const sweep = preset.sweep || {};

    let html = '';

    // Render device parameters
    const categories = categorizeParameters(parameters);

    for (const [category, params] of Object.entries(categories)) {
        html += `<div class="parameter-group">
                    <h6>${category}</h6>`;

        for (const [key, value] of Object.entries(params)) {
            html += renderInputField(`param_${key}`, key, value);
        }
        html += '</div>';
    }

    // Render output options
    if (Object.keys(outputs).length > 0) {
        html += `<div class="parameter-group">
                    <h6>Output Logging</h6>`;
        for (const [key, value] of Object.entries(outputs)) {
            html += renderInputField(`output_${key}`, key, value);
        }
        html += '</div>';
    }

    // Render sweep options
    if (Object.keys(sweep).length > 0) {
        html += `<div class="parameter-group">
                    <h6>Voltage Sweep</h6>`;
        for (const [key, value] of Object.entries(sweep)) {
            html += renderInputField(`sweep_${key}`, key, value);
        }
        html += '</div>';
    }

    container.innerHTML = html;

    // Add change listeners for auto-update
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
            <div class="form-check mb-2">
                <input class="form-check-input param-input" type="checkbox" id="${inputId}"
                       ${value ? 'checked' : ''}>
                <label class="form-check-label" for="${inputId}">${label}</label>
            </div>
        `;
    } else {
        return `
            <div class="mb-2">
                <label for="${inputId}" class="form-label small">${label}</label>
                <input class="form-control form-control-sm param-input" type="${inputType}"
                       id="${inputId}" value="${value || ''}"
                       ${inputType === 'number' ? 'step="any"' : ''}>
            </div>
        `;
    }
}

function onParameterChange() {
    if (document.getElementById('autoUpdateDeck').checked) {
        // Debounce the deck update
        if (deckUpdateDebounceTimer) {
            clearTimeout(deckUpdateDebounceTimer);
        }
        deckUpdateDebounceTimer = setTimeout(() => {
            generateDeckPreview();
        }, DECK_UPDATE_DEBOUNCE_MS);
    }
}

function categorizeParameters(params) {
    const categories = {
        'Temperature & Physics': {},
        'Doping & Structure': {},
        'Advanced Options': {}
    };

    const tempPhysics = ['temperature', 'srh', 'auger', 'conmob', 'fldmob', 'bgn', 'newton'];
    const dopingStructure = ['doping_p', 'doping_n', 'junction_depth', 'channel_length',
                            'channel_width', 'oxide_thickness', 'substrate_doping',
                            'source_drain_doping', 'base_width', 'gate_doping',
                            'emitter_doping', 'collector_doping', 'barrier_height',
                            'semiconductor_doping'];

    for (const [key, value] of Object.entries(params)) {
        if (tempPhysics.includes(key)) {
            categories['Temperature & Physics'][key] = value;
        } else if (dopingStructure.includes(key)) {
            categories['Doping & Structure'][key] = value;
        } else {
            categories['Advanced Options'][key] = value;
        }
    }

    // Remove empty categories
    return Object.fromEntries(Object.entries(categories).filter(([_, v]) => Object.keys(v).length > 0));
}

function collectParameters() {
    const parameters = {};

    // Collect device parameters
    document.querySelectorAll('[id^="param_"]').forEach(input => {
        const key = input.id.replace('param_', '');
        parameters[key] = getInputValue(input);
    });

    // Collect output options
    document.querySelectorAll('[id^="output_"]').forEach(input => {
        const key = input.id.replace('output_', '');
        parameters[key] = getInputValue(input);
    });

    // Collect sweep options
    document.querySelectorAll('[id^="sweep_"]').forEach(input => {
        const key = input.id.replace('sweep_', '');
        parameters[key] = getInputValue(input);
    });

    return parameters;
}

function getInputValue(input) {
    if (input.type === 'checkbox') {
        return input.checked;
    } else if (input.type === 'number') {
        return input.value ? parseFloat(input.value) : null;
    } else {
        return input.value || null;
    }
}

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
                parameters
            });

            if (result.success) {
                showAlert(`Simulation "${name}" created successfully!`, 'success');
                setTimeout(() => {
                    window.location.href = `${getBasePath()}/simulation/${result.simulation.id}`;
                }, 1500);
            }
        } catch (error) {
            console.error('Error creating simulation:', error);
            showAlert(`Error: ${error.message}`, 'danger');
        }
    });

    document.getElementById('refreshDeckBtn').addEventListener('click', generateDeckPreview);

    // Device type select change handler
    document.getElementById('deviceType').addEventListener('change', (e) => {
        const deviceType = e.target.value;
        if (deviceType) {
            // Find the label from presets
            const option = e.target.options[e.target.selectedIndex];
            selectPreset(deviceType, option.text);
        }
    });
}

function setupDeckPreviewHandlers() {
    // Copy deck button
    document.getElementById('copyDeckBtn').addEventListener('click', () => {
        if (currentDeckContent) {
            copyToClipboard(currentDeckContent);
        }
    });

    // Download preview deck button
    document.getElementById('downloadPreviewDeckBtn').addEventListener('click', () => {
        downloadDeck();
    });

    // Fullscreen modal buttons
    document.getElementById('copyFullscreenDeckBtn').addEventListener('click', () => {
        if (currentDeckContent) {
            copyToClipboard(currentDeckContent);
        }
    });

    document.getElementById('downloadFullscreenDeckBtn').addEventListener('click', () => {
        downloadDeck();
    });
}

async function generateDeckPreview() {
    const deviceType = document.getElementById('deviceType').value;

    if (!deviceType) {
        showDeckStatus('Select a device to see the input deck preview');
        return;
    }

    const parameters = collectParameters();

    // Debug: log collected parameters
    console.log('Collected parameters:', parameters);

    // Show loading state
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
        console.error('Error generating deck preview:', error);
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

    // Update footer info
    const lineCount = content.split('\n').length;
    document.getElementById('deckLineCount').textContent = `${lineCount} lines`;
    document.getElementById('deckLastUpdated').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
}

function downloadDeck() {
    if (!currentDeckContent) return;

    const name = document.getElementById('simName').value || 'preview';
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' +
        encodeURIComponent(currentDeckContent));
    element.setAttribute('download', `${name}.deck`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
