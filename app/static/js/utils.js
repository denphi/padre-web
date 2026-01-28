/* Utility Functions */

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getStatusBadgeClass(status) {
    const classes = {
        'pending': 'bg-secondary',
        'running': 'bg-warning text-dark',
        'completed': 'bg-success',
        'failed': 'bg-danger',
        'cancelled': 'bg-dark'
    };
    return classes[status] || 'bg-secondary';
}

function getStatusBadgeIcon(status) {
    const icons = {
        'pending': 'fas fa-hourglass-half',
        'running': 'fas fa-spinner fa-spin',
        'completed': 'fas fa-check-circle',
        'failed': 'fas fa-exclamation-circle',
        'cancelled': 'fas fa-times-circle'
    };
    return icons[status] || 'fas fa-question-circle';
}

function showAlert(message, type = 'info', container = null) {
    const alertClass = `alert alert-${type} alert-dismissible fade show`;
    const alertHTML = `
        <div class="${alertClass}" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const target = container || document.body;
    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = alertHTML;
    target.prepend(alertDiv.firstElementChild);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const alert = target.querySelector('.alert');
        if (alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }
    }, 5000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showAlert('Failed to copy to clipboard', 'danger');
    });
}

function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function renderParameters(parameters) {
    if (!parameters || Object.keys(parameters).length === 0) {
        return '<p class="text-muted">No parameters</p>';
    }
    
    let html = '<div class="row">';
    for (const [key, value] of Object.entries(parameters)) {
        const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let displayValue = value;
        
        if (value === null || value === undefined) {
            displayValue = '-';
        } else if (typeof value === 'boolean') {
            displayValue = value ? '✓ Yes' : '✗ No';
        } else if (typeof value === 'number') {
            displayValue = value.toExponential && value < 0.001 ? value.toExponential(2) : value;
        }
        
        html += `
            <div class="col-md-6 mb-2">
                <small class="text-muted">${displayKey}</small>
                <div>${displayValue}</div>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

// API Functions

async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(endpoint, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `HTTP Error: ${response.status}`);
        }
        
        return result;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Status Polling

class StatusPoller {
    constructor(callback, interval = 1000) {
        this.callback = callback;
        this.interval = interval;
        this.timeoutId = null;
        this.isRunning = false;
    }
    
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.poll();
    }
    
    stop() {
        this.isRunning = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }
    
    poll() {
        if (!this.isRunning) return;
        
        this.callback().finally(() => {
            if (this.isRunning) {
                this.timeoutId = setTimeout(() => this.poll(), this.interval);
            }
        });
    }
}
