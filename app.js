// --- GLOBALS & CONFIG ---
let gantt;
const LOCAL_STORAGE_KEY = 'myProjectData';

// --- AG GRID SETUP ---
const columnDefs = [
    { 
        field: "name", 
        rowDrag: true,
        cellRenderer: 'agGroupCellRenderer',
        valueSetter: params => { // Magic for adding new rows
            params.data.name = params.newValue;
            const rowIndex = params.node.rowIndex;
            const lastRowIndex = gridOptions.api.getLastDisplayedRow();
            if (rowIndex === lastRowIndex) {
                const newId = getNextId();
                gridOptions.api.applyTransaction({ add: [{ id: newId, name: '' }] });
            }
            return true;
        }
    },
    { field: "duration", headerName: "Duration", width: 100, editable: true, valueParser: p => parseInt(p.newValue) || 0 },
    { field: "start", headerName: "Start", width: 120, editable: true },
    { field: "finish", headerName: "Finish", width: 120, editable: false },
    { field: "predecessors", headerName: "Predecessors", width: 120, editable: true },
    { field: "resource", headerName: "Resource", width: 150, editable: true },
    { field: "notes", headerName: "Notes", editable: true, flex: 1 },
];

const gridOptions = {
    columnDefs: columnDefs,
    defaultColDef: { resizable: true },
    rowData: [],
    rowSelection: 'multiple',
    suppressMoveWhenRowDragging: true,
    treeData: true,
    getDataPath: data => {
        // This is complex. We manually build the path based on parent_id
        // which we will manage ourselves.
        const path = [];
        let currentData = data;
        const rowDataMap = gridOptions.api.getRenderedNodes().reduce((map, node) => {
            map[node.data.id] = node.data;
            return map;
        }, {});
        
        while(currentData) {
            path.unshift(currentData.name || `Task ${currentData.id}`);
            currentData = currentData.parent_id ? rowDataMap[currentData.parent_id] : null;
        }
        return path;
    },
    getContextMenuItems: getContextMenuItems,
    onCellValueChanged: saveProject,
    onRowDragEnd: saveProject,
};

// --- CORE FUNCTIONS ---

function getNextId() {
    let maxId = 0;
    gridOptions.api.forEachNode(node => {
        if (node.data && node.data.id > maxId) {
            maxId = node.data.id;
        }
    });
    return maxId + 1;
}

function getContextMenuItems(params) {
    const result = [
        {
            name: 'Insert Row Above',
            action: () => {
                const newId = getNextId();
                const newRow = { id: newId, name: 'New Task' };
                gridOptions.api.applyTransaction({ add: [newRow], addIndex: params.node.rowIndex });
            }
        },
        {
            name: 'Insert Row Below',
            action: () => {
                const newId = getNextId();
                const newRow = { id: newId, name: 'New Task' };
                gridOptions.api.applyTransaction({ add: [newRow], addIndex: params.node.rowIndex + 1 });
            }
        },
        'separator',
        {
            name: 'Delete Selected Row(s)',
            action: () => {
                const selectedRows = gridOptions.api.getSelectedRows();
                gridOptions.api.applyTransaction({ remove: selectedRows });
            }
        },
        'separator',
        'copy',
        'paste',
    ];
    return result;
}

function indentSelection() {
    const selectedNodes = gridOptions.api.getSelectedNodes();
    if (selectedNodes.length === 0) return;

    selectedNodes.forEach(node => {
        // Can't indent the very first row
        if (node.rowIndex === 0) return;
        const nodeAbove = gridOptions.api.getDisplayedRowAtIndex(node.rowIndex - 1);
        if (nodeAbove) {
            node.data.parent_id = nodeAbove.data.id;
        }
    });
    // A transaction is needed to force the grid to re-evaluate the tree structure
    gridOptions.api.applyTransaction({ update: selectedNodes.map(n => n.data) });
    saveProject();
}

function outdentSelection() {
    const selectedNodes = gridOptions.api.getSelectedNodes();
    if (selectedNodes.length === 0) return;

    const allNodesMap = {};
    gridOptions.api.forEachNode(node => allNodesMap[node.data.id] = node);

    selectedNodes.forEach(node => {
        if (node.data.parent_id) {
            const parentNode = allNodesMap[node.data.parent_id];
            if (parentNode) {
                node.data.parent_id = parentNode.data.parent_id || null;
            } else {
                 node.data.parent_id = null;
            }
        }
    });
    gridOptions.api.applyTransaction({ update: selectedNodes.map(n => n.data) });
    saveProject();
}

// --- DATE CALCULATION ENGINE (Ported from Python) ---
function parseDate(dateStr) { // Expects DD/MM/YYYY
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function formatDate(dateObj) { // Returns DD/MM/YYYY
    if (!dateObj) return '';
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
}

function addWorkdays(startDate, days) {
    if (!startDate) return null;
    let date = new Date(startDate.getTime());
    let added = 0;
    while (added < days) {
        date.setDate(date.getDate() + 1);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
            added++;
        }
    }
    return date;
}

function recalculateProject() {
    console.log("Recalculating project...");
    let tasks = [];
    gridOptions.api.forEachNode(node => {
        // Exclude the last empty row for adding new tasks
        if (node.data && node.data.name) {
            tasks.push({...node.data});
        }
    });

    const tasksById = tasks.reduce((acc, task) => {
        acc[task.id] = task;
        return acc;
    }, {});

    // Pass 1: Schedule individual tasks
    tasks.forEach(task => {
        // Identify summary tasks by checking if they are a parent to anyone
        task.is_summary = tasks.some(t => t.parent_id === task.id);
        if (task.is_summary) return;

        let startDate = parseDate(task.start);
        
        // Check predecessors
        if (task.predecessors) {
            let latestPredecessorFinish = null;
            const predIds = String(task.predecessors).split(';').map(p => parseInt(p.trim())).filter(id => !isNaN(id));
            
            predIds.forEach(pId => {
                const predTask = tasksById[pId];
                if (predTask) {
                    const predFinishDate = parseDate(predTask.finish);
                    if (predFinishDate && (!latestPredecessorFinish || predFinishDate > latestPredecessorFinish)) {
                        latestPredecessorFinish = predFinishDate;
                    }
                }
            });

            if (latestPredecessorFinish) {
                startDate = addWorkdays(latestPredecessorFinish, 1);
            }
        }
        
        if (!startDate) {
            startDate = new Date(); // Default to today
        }
        
        const duration = task.duration ? parseInt(task.duration) : 1;
        const finishDate = addWorkdays(startDate, duration > 0 ? duration - 1 : 0);

        task.start = formatDate(startDate);
        task.finish = formatDate(finishDate);
    });

    // Pass 2: Roll-up summary tasks (bottom-up)
    for (let i = tasks.length - 1; i >= 0; i--) {
        const task = tasks[i];
        if (task.is_summary) {
            const children = tasks.filter(t => t.parent_id === task.id);
            if (children.length > 0) {
                let minStart = null;
                let maxFinish = null;
                children.forEach(child => {
                    const childStart = parseDate(child.start);
                    const childFinish = parseDate(child.finish);
                    if (childStart && (!minStart || childStart < minStart)) {
                        minStart = childStart;
                    }
                    if (childFinish && (!maxFinish || childFinish > maxFinish)) {
                        maxFinish = childFinish;
                    }
                });
                task.start = formatDate(minStart);
                task.finish = formatDate(maxFinish);
                task.duration = 0;
            }
        }
    }

    gridOptions.api.setRowData(tasks);
    // Add the final empty row back for data entry
    const newId = getNextId();
    gridOptions.api.applyTransaction({ add: [{ id: newId, name: '' }] });
    updateGantt(tasks);
    saveProject();
    console.log("Recalculation complete.");
}

// --- DATA PERSISTENCE ---

function saveProject() {
    const rowData = [];
    gridOptions.api.forEachNode(node => {
        // Don't save the very last, empty row
        if (node.data && node.data.name) {
            rowData.push(node.data);
        }
    });
    
    // Update status
    updateSaveStatus('Saving...', '#FF9800');
    
    // Save to localStorage
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rowData));
        console.log('Project saved to localStorage');
        updateSaveStatus('Saved', '#4CAF50');
        
        // Also trigger auto-export
        autoExport();
    } catch (e) {
        console.warn('Could not save to localStorage:', e);
        updateSaveStatus('Save Failed', '#f44336');
        // Fallback: show save reminder
        showSaveReminder();
    }
    
    updateGantt(rowData);
}

function updateSaveStatus(text, color = '#666') {
    const statusElement = document.getElementById('save-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.style.color = color;
        
        // Reset to "Ready" after 2 seconds
        if (text !== 'Ready') {
            setTimeout(() => {
                updateSaveStatus('Ready');
            }, 2000);
        }
    }
}

function showSaveReminder() {
    // Create a subtle reminder to export data
    const reminder = document.createElement('div');
    reminder.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #ff6b6b;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-size: 14px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    reminder.innerHTML = '⚠️ Data not auto-saving. Please export your project!';
    document.body.appendChild(reminder);
    
    setTimeout(() => {
        if (reminder.parentNode) {
            reminder.parentNode.removeChild(reminder);
        }
    }, 5000);
}

function loadProject() {
    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    let rowData = [];
    if (savedData) {
        rowData = JSON.parse(savedData);
    }
    
    // Ensure there's at least one empty row to start typing
    if (rowData.length === 0 || rowData[rowData.length-1].name !== '') {
         rowData.push({ id: getNextId(), name: '' });
    }
    
    gridOptions.api.setRowData(rowData);
    updateGantt(rowData);
}

function exportProject() {
    const rowData = [];
    gridOptions.api.forEachNode(node => {
        if (node.data && node.data.name) {
             rowData.push(node.data);
        }
    });
    
    // Add metadata
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        projectName: 'My Project',
        tasks: rowData
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `project-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    
    // Show success message
    showMessage('Project exported successfully!', 'success');
}

function autoExport() {
    // Auto-export every 5 minutes if there are changes
    const rowData = [];
    gridOptions.api.forEachNode(node => {
        if (node.data && node.data.name) {
             rowData.push(node.data);
        }
    });
    
    if (rowData.length > 0) {
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            projectName: 'Auto-saved Project',
            tasks: rowData
        };
        
        // Create a data URL for download
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        // Store in a way that can be easily downloaded
        window.autoExportData = dataBlob;
        console.log('Auto-export ready. Click "Download Auto-Export" to save.');
    }
}

function downloadAutoExport() {
    if (window.autoExportData) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(window.autoExportData);
        a.download = `auto-save-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        showMessage('Auto-export downloaded!', 'success');
    } else {
        showMessage('No auto-export data available. Make some changes first.', 'warning');
    }
}

function showMessage(text, type = 'info') {
    const message = document.createElement('div');
    const colors = {
        success: '#4CAF50',
        warning: '#FF9800',
        error: '#f44336',
        info: '#2196F3'
    };
    
    message.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-size: 14px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        max-width: 300px;
    `;
    message.innerHTML = text;
    document.body.appendChild(message);
    
    setTimeout(() => {
        if (message.parentNode) {
            message.parentNode.removeChild(message);
        }
    }, 3000);
}

function importProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const importedData = JSON.parse(e.target.result);
            let tasks = [];
            
            // Handle both old format (array) and new format (object with tasks)
            if (Array.isArray(importedData)) {
                tasks = importedData;
            } else if (importedData.tasks && Array.isArray(importedData.tasks)) {
                tasks = importedData.tasks;
                showMessage(`Imported project: ${importedData.projectName || 'Unknown'}`, 'success');
            } else {
                throw new Error('Invalid project file format');
            }
            
            if (tasks.length > 0) {
                gridOptions.api.setRowData(tasks);
                // Add the final empty row back for data entry
                const newId = getNextId();
                gridOptions.api.applyTransaction({ add: [{ id: newId, name: '' }] });
                saveProject();
                showMessage(`Imported ${tasks.length} tasks successfully!`, 'success');
            } else {
                showMessage('No tasks found in the imported file.', 'warning');
            }
        } catch (error) {
            showMessage('Error reading project file: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}


// --- GANTT CHART ---

function updateGantt(tasks) {
    const ganttContainer = document.getElementById('gantt');
    ganttContainer.innerHTML = ''; // Clear previous chart
    if (!tasks || tasks.length === 0) return;

    const ganttTasks = tasks
        .filter(t => t.start && t.finish && t.name)
        .map(t => ({
            id: String(t.id),
            name: t.name,
            start: t.start.split('/').reverse().join('-'), // YYYY-MM-DD
            end: t.finish.split('/').reverse().join('-'),   // YYYY-MM-DD
            progress: 0,
            dependencies: t.predecessors ? String(t.predecessors).split(';').map(p => p.trim()) : []
        }));

    if (ganttTasks.length > 0) {
        gantt = new Gantt("#gantt", ganttTasks, {
            bar_height: 20,
            padding: 18,
            view_mode: 'Day',
            date_format: 'YYYY-MM-DD'
        });
    }
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    
    // Check if AG Grid is loaded
    if (typeof agGrid === 'undefined') {
        console.error('AG Grid not loaded!');
        showMessage('Error: AG Grid library failed to load. Please refresh the page.', 'error');
        return;
    }
    
    // Check if Gantt is loaded
    if (typeof Gantt === 'undefined') {
        console.error('Frappe Gantt not loaded!');
        showMessage('Warning: Gantt chart library failed to load. Grid will work but Gantt may not display.', 'warning');
    }
    
    try {
        const gridDiv = document.querySelector('#myGrid');
        if (!gridDiv) {
            console.error('Grid container not found!');
            return;
        }
        
        console.log('Creating AG Grid...');
        new agGrid.Grid(gridDiv, gridOptions);
        console.log('AG Grid created successfully');
        
        loadProject();
        console.log('Project loaded');
        
        // Set up auto-export every 5 minutes
        setInterval(autoExport, 5 * 60 * 1000); // 5 minutes
        
        // Auto-export on page unload
        window.addEventListener('beforeunload', () => {
            autoExport();
        });
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        showMessage('Error initializing application: ' + error.message, 'error');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        indentSelection();
    }
    if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        outdentSelection();
    }
});