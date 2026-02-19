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

    // Rotate chevron on collapse toggle
    document.querySelectorAll('[data-bs-toggle="collapse"]').forEach(trigger => {
        const targetId = trigger.getAttribute('data-bs-target');
        const target = document.querySelector(targetId);
        if (!target) return;
        target.addEventListener('show.bs.collapse', () => {
            trigger.querySelector('.sim-collapse-icon')?.classList.add('rotated');
        });
        target.addEventListener('hide.bs.collapse', () => {
            trigger.querySelector('.sim-collapse-icon')?.classList.remove('rotated');
        });
    });
});

async function loadSimulationDetails() {
    try {
        const result = await apiCall(`/api/simulation/${simId}`);

        if (result.success) {
            currentSimulation = result.simulation;
            renderSimulationDetails();

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

    // Status badge
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = sim.status.toUpperCase();
    statusBadge.className = `badge ${getStatusBadgeClass(sim.status)}`;

    // Progress bar + message
    updateProgressBar(sim.progress, sim.status);
    updateProgressMessage(sim);
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
        document.getElementById('deckNotGenerated').style.display = '';
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
    const errorInfo = document.getElementById('errorInfo');
    if (sim.error_message) {
        errorInfo.style.removeProperty('display');
        document.getElementById('errorMessage').textContent = sim.error_message;
        addLogEntry('Error: ' + sim.error_message.split('\n')[0], 'error');
    } else {
        errorInfo.style.setProperty('display', 'none', 'important');
    }

    updateButtonStates();
}

function updateProgressBar(progress, status) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;

    progressBar.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'progress-bar-animated', 'progress-bar-striped');
    if (status === 'completed') {
        progressBar.classList.add('bg-success');
    } else if (status === 'failed') {
        progressBar.classList.add('bg-danger');
    } else if (status === 'running') {
        progressBar.classList.add('progress-bar-animated', 'progress-bar-striped');
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
        } else {
            message = 'Running simulation...';
        }
        iconClass = 'fas fa-spinner fa-spin text-warning';
    } else if (sim.status === 'completed') {
        message = 'Simulation completed successfully!';
        iconClass = 'fas fa-check-circle text-success';
    } else if (sim.status === 'failed') {
        message = 'Simulation failed.';
        iconClass = 'fas fa-exclamation-circle text-danger';
    }

    messageEl.textContent = message;
    containerEl.querySelector('i').className = iconClass;

    if (sim.progress !== lastProgress && sim.status === 'running') {
        addLogEntry(message, 'info');
        lastProgress = sim.progress;
    }
}

function updateProgressTimeline(sim) {
    const steps = document.querySelectorAll('.sim-step');

    steps.forEach(step => {
        const stepName = step.dataset.step;
        const icon = step.querySelector('.sim-step-dot i');

        step.classList.remove('completed', 'active', 'error');
        icon.className = 'fas fa-circle';

        if (sim.status === 'failed') {
            step.classList.add('error');
            icon.className = 'fas fa-times-circle';
        } else if (sim.status === 'completed') {
            step.classList.add('completed');
            icon.className = 'fas fa-check-circle';
        } else if (sim.status === 'running') {
            const stepProgress = getStepProgress(stepName);
            if (sim.progress >= stepProgress) {
                step.classList.add('completed');
                icon.className = 'fas fa-check-circle';
            } else if (sim.progress >= stepProgress - 15) {
                step.classList.add('active');
                icon.className = 'fas fa-spinner fa-spin';
            }
        }
    });

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
    const stepProgressMap = { init: 5, device: 15, deck: 25, simulation: 100 };
    return stepProgressMap[stepName] || 0;
}

function formatTime(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString();
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

    while (log.children.length > 50) {
        log.removeChild(log.firstChild);
    }
}

function updateButtonStates() {
    const sim = currentSimulation;
    const runBtn = document.getElementById('runSimBtn');
    const rerunBtn = document.getElementById('rerunSimBtn');
    const stopBtn = document.getElementById('stopSimBtn');
    const viewResultsBtn = document.getElementById('viewResultsBtn');
    const downloadDeckBtn = document.getElementById('downloadDeckBtn');
    const deleteBtn = document.getElementById('deleteSimBtn');

    // Run: only for pending
    runBtn.disabled = sim.status !== 'pending';
    runBtn.style.display = sim.status === 'pending' ? '' : 'none';

    // Rerun: for completed or failed
    const canRerun = sim.status === 'completed' || sim.status === 'failed';
    rerunBtn.style.display = canRerun ? '' : 'none';
    rerunBtn.disabled = false;

    // Stop: only while running
    stopBtn.style.display = sim.status === 'running' ? '' : 'none';
    stopBtn.disabled = sim.status !== 'running';

    // View results
    viewResultsBtn.disabled = sim.status !== 'completed';
    viewResultsBtn.href = `${getBasePath()}/results/${simId}`;

    // Download deck
    downloadDeckBtn.disabled = !sim.deck_content;

    // Delete: disabled while running
    deleteBtn.disabled = sim.status === 'running';
}

function setupEventHandlers() {
    document.getElementById('runSimBtn').addEventListener('click', runSimulation);
    document.getElementById('rerunSimBtn').addEventListener('click', rerunSimulation);
    document.getElementById('stopSimBtn').addEventListener('click', stopSimulation);
    document.getElementById('copyDeckBtn').addEventListener('click', () => {
        if (currentSimulation.deck_content) copyToClipboard(currentSimulation.deck_content);
    });
    document.getElementById('downloadDeckBtn').addEventListener('click', downloadDeck);
    document.getElementById('deleteSimBtn').addEventListener('click', deleteSimulation);

    document.getElementById('expandDeckBtn').addEventListener('click', () => {
        if (currentSimulation.deck_content) {
            document.getElementById('deckFullscreenContent').textContent = currentSimulation.deck_content;
            deckFullscreenModal.show();
        }
    });

    document.getElementById('copyFullscreenDeckBtn').addEventListener('click', () => {
        if (currentSimulation.deck_content) copyToClipboard(currentSimulation.deck_content);
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

async function rerunSimulation() {
    const btn = document.getElementById('rerunSimBtn');
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Rerunning...';

    try {
        addLogEntry('Requesting rerun...', 'info');
        const result = await apiCall(`/api/simulation/rerun/${simId}`, 'POST');
        if (result.success) {
            currentSimulation = result.simulation;
            lastProgress = 0;
            renderSimulationDetails();
            showAlert('Simulation restarted!', 'success');
            addLogEntry('Simulation restarted', 'success');
            startStatusPolling();
        } else {
            btn.disabled = false;
            btn.innerHTML = origHTML;
            showAlert(`Error: ${result.error || 'Could not rerun simulation'}`, 'danger');
        }
    } catch (error) {
        console.error('Error rerunning simulation:', error);
        btn.disabled = false;
        btn.innerHTML = origHTML;
        showAlert(`Error: ${error.message}`, 'danger');
        addLogEntry(`Failed to rerun: ${error.message}`, 'error');
    }
}

function stopSimulation() {
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
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Deleting...';

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

                if (previousStatus === 'running' && currentSimulation.status === 'completed') {
                    addLogEntry('Simulation completed successfully!', 'success');
                } else if (previousStatus === 'running' && currentSimulation.status === 'failed') {
                    addLogEntry('Simulation failed!', 'error');
                }

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
