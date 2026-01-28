/* Results Page Logic */

let resultsSimulation = null;

document.addEventListener('DOMContentLoaded', () => {
    loadResults();
});

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
            loadOutputFiles();
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

async function loadOutputFiles() {
    try {
        const result = await apiCall(`/api/results/${simId}/outputs`);
        
        if (result.success) {
            renderOutputFiles(result.files);
        }
    } catch (error) {
        console.error('Error loading output files:', error);
        showAlert('Failed to load output files', 'danger');
    }
}

function renderOutputFiles(files) {
    const container = document.getElementById('outputFilesList');
    
    if (files.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-3">No output files available</p>';
        return;
    }
    
    const basePath = getBasePath();
    container.innerHTML = files.map(file => `
        <a href="${basePath}/api/results/${simId}/download/${file.name}"
           class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
            <div>
                <h6 class="mb-1">${file.name}</h6>
                <small class="text-muted">${formatFileSize(file.size)}</small>
            </div>
            <i class="fas fa-download"></i>
        </a>
    `).join('');
}
