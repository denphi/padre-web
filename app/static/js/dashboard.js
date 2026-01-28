/* Dashboard Page Logic */

let allSimulations = [];
let refreshPoller;

document.addEventListener('DOMContentLoaded', () => {
    loadSimulations();
    setupRefresh();
});

function setupRefresh() {
    refreshPoller = new StatusPoller(loadSimulations, 3000);
    refreshPoller.start();
}

async function loadSimulations() {
    try {
        const result = await apiCall('/api/simulation/list');
        
        if (result.success) {
            allSimulations = result.simulations;
            updateStats();
            renderSimulations();
        }
    } catch (error) {
        console.error('Error loading simulations:', error);
        if (document.getElementById('simTableBody')) {
            document.getElementById('simTableBody').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger py-3">
                        <i class="fas fa-exclamation-circle"></i> Failed to load simulations
                    </td>
                </tr>
            `;
        }
    }
}

function updateStats() {
    const total = allSimulations.length;
    const completed = allSimulations.filter(s => s.status === 'completed').length;
    const running = allSimulations.filter(s => s.status === 'running').length;
    const failed = allSimulations.filter(s => s.status === 'failed').length;
    
    document.getElementById('totalSimulations').textContent = total;
    document.getElementById('completedSimulations').textContent = completed;
    document.getElementById('runningSimulations').textContent = running;
    document.getElementById('failedSimulations').textContent = failed;
}

function renderSimulations() {
    const tbody = document.getElementById('simTableBody');
    
    if (allSimulations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-3">
                    <i class="fas fa-inbox"></i> No simulations yet
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = allSimulations.map(sim => `
        <tr style="cursor: pointer;" onclick="window.location.href='/simulation/${sim.id}'">
            <td><strong>${sim.name}</strong></td>
            <td>
                <span class="badge bg-info">${sim.device_type.toUpperCase()}</span>
            </td>
            <td>
                <span class="badge ${getStatusBadgeClass(sim.status)}">
                    <i class="${getStatusBadgeIcon(sim.status)}"></i>
                    ${sim.status.toUpperCase()}
                </span>
            </td>
            <td><small>${formatDate(sim.created_at)}</small></td>
            <td>
                <div class="progress" style="height: 20px;">
                    <div class="progress-bar" role="progressbar" 
                         style="width: ${sim.progress}%"
                         aria-valuenow="${sim.progress}" aria-valuemin="0" aria-valuemax="100">
                        <span style="font-size: 12px;">${Math.round(sim.progress)}%</span>
                    </div>
                </div>
            </td>
            <td>
                <a href="/simulation/${sim.id}" class="btn btn-sm btn-outline-primary" title="View details">
                    <i class="fas fa-arrow-right"></i>
                </a>
            </td>
        </tr>
    `).join('');
}

window.addEventListener('beforeunload', () => {
    if (refreshPoller) refreshPoller.stop();
});
