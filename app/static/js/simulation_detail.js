/* Simulation Detail Page Logic */

let currentSimulation = null;
let statusPoller;
let progressLog = [];
let lastProgress = 0;
let deckFullscreenModal;

document.addEventListener('DOMContentLoaded', () => {
    deckFullscreenModal = new bootstrap.Modal(document.getElementById('deckFullscreenModal'));
    loadSimulationDetails();
    setupEventHandlers();
});

async function loadSimulationDetails() {
    try {
        const result = await apiCall(`/api/simulation/${simId}`);

        if (result.success) {
            currentSimulation = result.simulation;
            renderSimulationDetails();

            // Start polling if running
            if (currentSimulation.status === 'running') {
                startStatusPolling();
            }
        }
    } catch (error) {
        console.error('Error loading simulation:', error);
        showAlert('Failed to load simulation details', 'danger');
    }
}

function renderSimulationDetails() {
    const sim = currentSimulation;

    // Header
    document.getElementById('simTitle').textContent = sim.name;
    document.getElementById('simDescription').textContent =
        `Device: ${sim.device_type.toUpperCase()} • Created: ${formatDate(sim.created_at)}`;

    // Status badges
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = sim.status.toUpperCase();
    statusBadge.className = `badge ${getStatusBadgeClass(sim.status)}`;

    const progressStatusBadge = document.getElementById('progressStatusBadge');
    progressStatusBadge.textContent = sim.status.toUpperCase();
    progressStatusBadge.className = `badge ${getStatusBadgeClass(sim.status)}`;

    // Progress bar
    updateProgressBar(sim.progress, sim.status);

    // Progress message
    updateProgressMessage(sim);

    // Update timeline
    updateProgressTimeline(sim);

    // Parameters
    document.getElementById('parametersDisplay').innerHTML = renderParameters(sim.parameters);

    // Deck
    if (sim.deck_content) {
        document.getElementById('deckNotGenerated').style.display = 'none';
        document.getElementById('deckDisplay').style.display = 'block';
        document.getElementById('deckDisplay').textContent = sim.deck_content;
        document.getElementById('copyDeckBtn').disabled = false;
        document.getElementById('expandDeckBtn').disabled = false;
    } else {
        document.getElementById('deckNotGenerated').style.display = 'block';
        document.getElementById('deckDisplay').style.display = 'none';
        document.getElementById('copyDeckBtn').disabled = true;
        document.getElementById('expandDeckBtn').disabled = true;
    }

    // Information
    document.getElementById('infoDeviceType').textContent = sim.device_type.toUpperCase();
    document.getElementById('infoCreated').textContent = formatDate(sim.created_at);
    document.getElementById('infoStarted').textContent = formatDate(sim.started_at);
    document.getElementById('infoCompleted').textContent = formatDate(sim.completed_at);

    // Error
    if (sim.error_message) {
        document.getElementById('errorInfo').style.display = 'block';
        document.getElementById('errorMessage').textContent = sim.error_message;
        addLogEntry('Error: ' + sim.error_message.split('\n')[0], 'error');
    } else {
        document.getElementById('errorInfo').style.display = 'none';
    }

    // Update buttons state
    updateButtonStates();
}

function updateProgressBar(progress, status) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;

    // Update bar color based on status
    progressBar.classList.remove('bg-success', 'bg-danger', 'bg-warning');
    if (status === 'completed') {
        progressBar.classList.add('bg-success');
        progressBar.classList.remove('progress-bar-animated');
    } else if (status === 'failed') {
        progressBar.classList.add('bg-danger');
        progressBar.classList.remove('progress-bar-animated');
    } else if (status === 'running') {
        progressBar.classList.add('progress-bar-animated');
    }
}

function updateProgressMessage(sim) {
    const messageEl = document.getElementById('progressMessage');
    const containerEl = document.getElementById('currentStatusMessage');

    let message = 'Waiting to start...';
    let iconClass = 'fas fa-info-circle text-primary';

    if (sim.status === 'running') {
        if (sim.progress < 10) {
            message = 'Initializing simulation...';
        } else if (sim.progress < 20) {
            message = 'Configuring device...';
        } else if (sim.progress < 30) {
            message = 'Generating input deck...';
        } else if (sim.progress < 100) {
            message = 'Running simulation...';
        }
        iconClass = 'fas fa-spinner fa-spin text-warning';
    } else if (sim.status === 'completed') {
        message = 'Simulation completed successfully!';
        iconClass = 'fas fa-check-circle text-success';
    } else if (sim.status === 'failed') {
        message = 'Simulation failed. Check error details below.';
        iconClass = 'fas fa-exclamation-circle text-danger';
    }

    messageEl.textContent = message;
    containerEl.querySelector('i').className = iconClass;

    // Add to log if progress changed
    if (sim.progress !== lastProgress && sim.status === 'running') {
        addLogEntry(message, 'info');
        lastProgress = sim.progress;
    }
}

function updateProgressTimeline(sim) {
    const steps = document.querySelectorAll('.timeline-step');

    steps.forEach(step => {
        const stepName = step.dataset.step;
        const icon = step.querySelector('.timeline-icon i');

        step.classList.remove('completed', 'active', 'error');
        icon.className = 'fas fa-circle';

        if (sim.status === 'failed') {
            step.classList.add('error');
            icon.className = 'fas fa-times-circle';
        } else if (sim.status === 'completed') {
            step.classList.add('completed');
            icon.className = 'fas fa-check-circle';
        } else if (sim.status === 'running') {
            let stepProgress = getStepProgress(stepName);
            if (sim.progress >= stepProgress) {
                step.classList.add('completed');
                icon.className = 'fas fa-check-circle';
            } else if (sim.progress >= stepProgress - 15) {
                step.classList.add('active');
                icon.className = 'fas fa-spinner fa-spin';
            }
        }
    });

    // Update timestamps
    if (sim.started_at) {
        document.getElementById('stepTimeInit').textContent = formatTime(sim.started_at);
    }
    if (sim.progress >= 15) {
        document.getElementById('stepTimeDevice').textContent = 'Done';
    }
    if (sim.progress >= 25) {
        document.getElementById('stepTimeDeck').textContent = 'Done';
    }
    if (sim.completed_at) {
        document.getElementById('stepTimeSimulation').textContent = formatTime(sim.completed_at);
    }
}

function getStepProgress(stepName) {
    const stepProgressMap = {
        'init': 5,
        'device': 15,
        'deck': 25,
        'simulation': 100
    };
    return stepProgressMap[stepName] || 0;
}

function formatTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleTimeString();
}

function addLogEntry(message, type = 'info') {
    const log = document.getElementById('progressLog');
    const time = new Date().toLocaleTimeString();

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `;

    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;

    // Keep log entries limited
    while (log.children.length > 50) {
        log.removeChild(log.firstChild);
    }
}

function updateButtonStates() {
    const sim = currentSimulation;
    const runBtn = document.getElementById('runSimBtn');
    const stopBtn = document.getElementById('stopSimBtn');
    const viewResultsBtn = document.getElementById('viewResultsBtn');
    const downloadDeckBtn = document.getElementById('downloadDeckBtn');
    const deleteBtn = document.getElementById('deleteSimBtn');

    // Run button
    runBtn.disabled = sim.status !== 'pending';

    // Stop button
    stopBtn.style.display = sim.status === 'running' ? 'block' : 'none';
    stopBtn.disabled = sim.status !== 'running';

    // View results button
    viewResultsBtn.disabled = sim.status !== 'completed';
    viewResultsBtn.href = `${getBasePath()}/results/${simId}`;

    // Download deck button
    downloadDeckBtn.disabled = !sim.deck_content;

    // Delete button
    deleteBtn.disabled = sim.status === 'running';
}

function setupEventHandlers() {
    document.getElementById('runSimBtn').addEventListener('click', runSimulation);
    document.getElementById('stopSimBtn').addEventListener('click', stopSimulation);
    document.getElementById('copyDeckBtn').addEventListener('click', () => {
        if (currentSimulation.deck_content) {
            copyToClipboard(currentSimulation.deck_content);
        }
    });
    document.getElementById('downloadDeckBtn').addEventListener('click', downloadDeck);
    document.getElementById('deleteSimBtn').addEventListener('click', deleteSimulation);
    document.getElementById('clearLogBtn').addEventListener('click', clearLog);

    // Expand deck button
    document.getElementById('expandDeckBtn').addEventListener('click', () => {
        if (currentSimulation.deck_content) {
            document.getElementById('deckFullscreenContent').textContent = currentSimulation.deck_content;
            deckFullscreenModal.show();
        }
    });

    // Fullscreen modal copy button
    document.getElementById('copyFullscreenDeckBtn').addEventListener('click', () => {
        if (currentSimulation.deck_content) {
            copyToClipboard(currentSimulation.deck_content);
        }
    });
}

function clearLog() {
    const log = document.getElementById('progressLog');
    log.innerHTML = `
        <div class="log-entry log-info">
            <span class="log-time">${new Date().toLocaleTimeString()}</span>
            <span class="log-message">Log cleared</span>
        </div>
    `;
}

async function runSimulation() {
    try {
        addLogEntry('Starting simulation...', 'info');

        const result = await apiCall(`/api/simulation/run/${simId}`, 'POST');

        if (result.success) {
            currentSimulation = result.simulation;
            renderSimulationDetails();
            showAlert('Simulation started!', 'success');
            addLogEntry('Simulation started successfully', 'success');
            startStatusPolling();
        }
    } catch (error) {
        console.error('Error running simulation:', error);
        showAlert(`Error: ${error.message}`, 'danger');
        addLogEntry(`Failed to start: ${error.message}`, 'error');
    }
}

function stopSimulation() {
    // TODO: Implement simulation stopping
    showAlert('Stop simulation feature coming soon!', 'info');
}

function downloadDeck() {
    if (!currentSimulation.deck_content) return;

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' +
        encodeURIComponent(currentSimulation.deck_content));
    element.setAttribute('download', `${currentSimulation.name}.deck`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

async function deleteSimulation() {
    if (!confirm('Are you sure you want to delete this simulation?')) return;

    const btn = document.getElementById('deleteSimBtn');
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Deleting…';

    try {
        const result = await apiCall(`/api/simulation/${simId}`, 'DELETE');

        if (result.success) {
            showAlert('Simulation deleted!', 'success');
            setTimeout(() => window.location.href = getBasePath() + '/', 1000);
        } else {
            btn.disabled = false;
            btn.innerHTML = origHTML;
            showAlert(`Error: ${result.error || 'Could not delete simulation'}`, 'danger');
        }
    } catch (error) {
        console.error('Error deleting simulation:', error);
        btn.disabled = false;
        btn.innerHTML = origHTML;
        showAlert(`Error: ${error.message}`, 'danger');
    }
}

function startStatusPolling() {
    if (statusPoller) statusPoller.stop();

    statusPoller = new StatusPoller(async () => {
        try {
            const result = await apiCall(`/api/simulation/${simId}`);
            if (result.success) {
                const previousStatus = currentSimulation.status;
                currentSimulation = result.simulation;
                renderSimulationDetails();

                // Add completion log entry
                if (previousStatus === 'running' && currentSimulation.status === 'completed') {
                    addLogEntry('Simulation completed successfully!', 'success');
                } else if (previousStatus === 'running' && currentSimulation.status === 'failed') {
                    addLogEntry('Simulation failed!', 'error');
                }

                // Stop polling if not running
                if (currentSimulation.status !== 'running') {
                    statusPoller.stop();
                }
            }
        } catch (error) {
            console.error('Error polling status:', error);
        }
    }, 1000);

    statusPoller.start();
}

window.addEventListener('beforeunload', () => {
    if (statusPoller) statusPoller.stop();
});
