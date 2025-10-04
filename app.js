// --- GLOBALS & CONFIG ---
let gridApi;
let gantt;
const LOCAL_STORAGE_KEY = 'fluidProjectData_v2'; // New key for new data structure

// --- ARCHITECTURAL REFACTOR: Emulate Tree Data with Row Grouping ---
// This is the core change. We no longer use the (Enterprise-only) `treeData`.
// Instead, we manually manage a parent-child relationship using `parent_id`
// and tell the free Community version of AG Grid to group rows based on this.
const columnDefs = [
    // This is now a regular column, not part of a tree structure
    { 
        field: "name", 
        headerName: 'Task Name',
        editable: true,
        flex: 2, // Give it more space
        // Add the "new row" magic here
        valueSetter: params => {
            params.data.name = params.newValue;
            const allNodes = getAllNodes();
            // If we are editing the last row and it's not empty, add a new one
            if (params.node.rowIndex === allNodes.length - 1 && params.newValue?.trim()) {
                addNewRow(allNodes.length);
            }
            return true;
        }
    },
    { field: "duration", headerName: "Dur", width: 60, editable: true, valueParser: p => parseInt(p.newValue, 10) || 0 },
    { field: "start", headerName: "Start", width: 100, editable: true },
    { field: "finish", headerName: "Finish", width: 100, editable: false },
    { field: "predecessors", headerName: "Pred", width: 80, editable: true },
    { field: "resource", headerName: "Resource", width: 120, editable: true },
];

const gridOptions = {
    columnDefs: columnDefs,
    defaultColDef: { resizable: true },
    rowDragManaged: true, // Let the grid handle row dragging visually
    rowSelection: 'multiple',
    suppressMoveWhenRowDragging: true,
    
    // --- The NEW Hierarchy Engine ---
    groupDefaultExpanded: -1, // Expand all groups by default
    autoGroupColumnDef: {
        headerName: 'Task Hierarchy',
        minWidth: 250,
        flex: 1,
        cellRendererParams: {
            suppressCount: true, // Don't show "(5)" count next to summary tasks
            checkbox: true, // Enable selection checkboxes
        },
        rowDrag: true, // Allow dragging from the group column
    },
    // This function tells the grid how to build the hierarchy path for each task
    getDataPath: data => {
        const path = [];
        let current = data;
        const tasksById = buildTaskMap(getAllNodes().map(n => n.data));
        while (current && current.parent_id != null) {
            const parent = tasksById[current.parent_id];
            if (parent) {
                path.unshift(parent.name);
                current = parent;
            } else {
                current = null; // Break if parent not found
            }
        }
        return path;
    },
    
    onCellValueChanged: () => saveAndRefresh(),
    onRowDragEnd: onRowDragEnd,
    onCellKeyDown: onCellKeyDown,
};

// --- UTILITY FUNCTIONS ---
const getAllNodes = () => {
    const rowData = [];
    if (gridApi) gridApi.forEachNode(node => rowData.push(node));
    return rowData;
};

const buildTaskMap = (tasks) => tasks.reduce((acc, task) => {
    acc[task.id] = task;
    return acc;
}, {});

const getNextId = () => {
    const nodes = getAllNodes();
    if (nodes.length === 0) return 1;
    return Math.max(...nodes.map(n => n.data.id)) + 1;
}

const showMessage = (text, type = 'info') => {
    console.log(`[${type.toUpperCase()}] ${text}`);
    const statusEl = document.getElementById('save-status');
    if (!statusEl) return;
    const colors = { success: '#198754', warning: '#ffc107', error: '#dc3545', info: '#0d6efd' };
    statusEl.textContent = text;
    statusEl.style.color = colors[type] || '#6c757d';
    if (type !== 'info') setTimeout(() => { statusEl.textContent = 'Ready'; statusEl.style.color = '#6c757d'; }, 3000);
}

// --- CORE HIERARCHY & CRUD LOGIC ---

function onRowDragEnd(event) {
    const movingNode = event.node;
    const overNode = event.overNode;
    
    if (!overNode || movingNode.id === overNode.id) return; // Dropped in same spot or empty space

    const allTasks = getAllNodes().map(n => n.data);
    const movingTask = movingNode.data;

    // Logic: Find the node *above* the drop target to determine the new parent
    // and insertion index.
    const dropIndex = overNode.rowIndex;
    const nodeAbove = gridApi.getDisplayedRowAtIndex(dropIndex - 1);

    // Case 1: Dropped at the very top
    if (!nodeAbove) {
        movingTask.parent_id = null;
    } 
    // Case 2: Dropped somewhere in the middle
    else {
        // If the node above is open, we become its child. Otherwise, we become its sibling.
        const nodeAboveIsParent = nodeAbove.isGroup() && nodeAbove.expanded;
        movingTask.parent_id = nodeAboveIsParent ? nodeAbove.data.id : nodeAbove.data.parent_id;
    }

    // Reorder the tasks array
    const movingTaskIndex = allTasks.findIndex(t => t.id === movingTask.id);
    allTasks.splice(movingTaskIndex, 1);
    
    // Find new index
    let newIndex = allTasks.findIndex(t => t.id === overNode.data.id);
    if(event.vDirection === 'bottom') newIndex++;
    
    allTasks.splice(newIndex, 0, movingTask);
    
    gridApi.setGridOption('rowData', allTasks);
    saveAndRefresh();
    showMessage('Tasks reordered', 'success');
}


function onCellKeyDown(params) {
    if (params.event.key === 'Enter') {
        params.event.preventDefault();
        insertRowBelow();
    }
}

function addNewRow(index, parentId = null) {
    const newId = getNextId();
    const newRow = { id: newId, name: '', duration: 1, parent_id: parentId };
    gridApi.applyTransaction({ add: [newRow], addIndex: index });
    return { newId, index };
}

function insertRowAbove() {
    const selectedNodes = gridApi.getSelectedNodes();
    if (selectedNodes.length === 0) {
        addNewRow(getAllNodes().length);
        showMessage('Added new row at the end', 'info');
        return;
    }
    const node = selectedNodes[0];
    const { index } = addNewRow(node.rowIndex, node.data.parent_id);
    setTimeout(() => {
        gridApi.setFocusedCell(index, 'name');
        gridApi.startEditingCell({ rowIndex: index, colKey: 'name' });
    }, 50);
}

function insertRowBelow() {
    const selectedNodes = gridApi.getSelectedNodes();
    if (selectedNodes.length === 0) {
        insertRowAbove();
        return;
    }
    const node = selectedNodes[0];
    const { index } = addNewRow(node.rowIndex + 1, node.data.parent_id);
     setTimeout(() => {
        gridApi.setFocusedCell(index, 'name');
        gridApi.startEditingCell({ rowIndex: index, colKey: 'name' });
    }, 50);
}

function deleteSelectedRows() {
    const selectedRows = gridApi.getSelectedRows();
    if(selectedRows.length === 0) {
        showMessage('No rows selected to delete', 'warning');
        return;
    }
    gridApi.applyTransaction({ remove: selectedRows });
    saveAndRefresh();
    showMessage(`${selectedRows.length} row(s) deleted`, 'success');
}


function indentSelection() {
    const selectedNodes = gridApi.getSelectedNodes();
    if (selectedNodes.length === 0) return showMessage('Select a row to indent', 'warning');

    selectedNodes.forEach(node => {
        if (node.rowIndex === 0) return;
        const nodeAbove = gridApi.getDisplayedRowAtIndex(node.rowIndex - 1);
        if (nodeAbove) {
            node.data.parent_id = nodeAbove.data.id;
        }
    });

    // An update transaction forces the grid to re-evaluate the data path for grouping
    gridApi.applyTransaction({ update: selectedNodes.map(n => n.data) });
    saveAndRefresh();
}

function outdentSelection() {
    const selectedNodes = gridApi.getSelectedNodes();
    if (selectedNodes.length === 0) return showMessage('Select a row to outdent', 'warning');

    const allTasks = getAllNodes().map(n => n.data);
    const tasksById = buildTaskMap(allTasks);

    selectedNodes.forEach(node => {
        if (node.data.parent_id != null) {
            const parent = tasksById[node.data.parent_id];
            node.data.parent_id = parent ? parent.parent_id : null;
        }
    });
    
    gridApi.applyTransaction({ update: selectedNodes.map(n => n.data) });
    saveAndRefresh();
}

function expandAll() { gridApi.expandAll(); }
function collapseAll() { gridApi.collapseAll(); }

// --- DATE CALCULATION ENGINE (Robust Version) ---

// ... (parseDate, formatDate, addWorkdays functions are the same as your version, they are solid)
function parseDate(dateStr) { if (!dateStr || typeof dateStr !== 'string') return null; const parts = dateStr.split('/'); if (parts.length !== 3) return null; return new Date(parts[2], parts[1] - 1, parts[0]); }
function formatDate(dateObj) { if (!dateObj) return ''; const day = String(dateObj.getDate()).padStart(2, '0'); const month = String(dateObj.getMonth() + 1).padStart(2, '0'); const year = dateObj.getFullYear(); return `${day}/${month}/${year}`; }
function addWorkdays(startDate, days) { if (!startDate) return null; let date = new Date(startDate.getTime()); let added = 0; while (added < days) { date.setDate(date.getDate() + 1); const dayOfWeek = date.getDay(); if (dayOfWeek !== 0 && dayOfWeek !== 6) added++; } return date; }

function recalculateProject() {
    showMessage('Recalculating...', 'info');
    let tasks = getAllNodes().map(n => ({...n.data})).filter(t => t.name?.trim());
    const tasksById = buildTaskMap(tasks);

    // Identify summary tasks
    tasks.forEach(task => task.is_summary = tasks.some(t => t.parent_id === task.id));

    // Pass 1: Schedule individual tasks based on dependencies
    tasks.forEach(task => {
        if (task.is_summary) return;

        let startDate = parseDate(task.start);
        if (task.predecessors) {
            let latestPredecessorFinish = null;
            const predIds = String(task.predecessors).split(';').map(p => parseInt(p.trim())).filter(id => !isNaN(id));
            
            predIds.forEach(pId => {
                const predTask = tasksById[pId];
                if (predTask && predTask.finish) {
                    const predFinishDate = parseDate(predTask.finish);
                    if (predFinishDate && (!latestPredecessorFinish || predFinishDate > latestPredecessorFinish)) {
                        latestPredecessorFinish = predFinishDate;
                    }
                }
            });
            if (latestPredecessorFinish) startDate = addWorkdays(latestPredecessorFinish, 1);
        }
        
        if (!startDate) startDate = new Date();
        
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
                let minStart = null, maxFinish = null;
                children.forEach(child => {
                    const childStart = parseDate(child.start), childFinish = parseDate(child.finish);
                    if (childStart && (!minStart || childStart < minStart)) minStart = childStart;
                    if (childFinish && (!maxFinish || childFinish > maxFinish)) maxFinish = childFinish;
                });
                task.start = formatDate(minStart);
                task.finish = formatDate(maxFinish);
                task.duration = 0; // Summary tasks have calculated duration
            }
        }
    }
    
    // Refresh grid with calculated data
    gridApi.setGridOption('rowData', tasks);
    addNewRow(tasks.length); // Add empty row at the end
    saveAndRefresh();
    showMessage('Project recalculated!', 'success');
}


// --- DATA PERSISTENCE ---

function saveAndRefresh() {
    const rowData = getAllNodes()
        .map(node => node.data)
        .filter(task => task.name?.trim() || task.id != null); // Keep empty row if it has an id
    
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rowData));
        updateGantt(rowData);
    } catch (e) {
        showMessage('Save Failed! Is storage full?', 'error');
    }
}

function loadProject() {
    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    let rowData = [];
    if (savedData) {
        try { rowData = JSON.parse(savedData); } catch (e) { rowData = []; }
    }
    
    if (rowData.length === 0) {
        rowData = [
            { id: 1, name: 'Phase 1: Planning', duration: 0, parent_id: null },
            { id: 2, name: 'Define scope', duration: 5, start: '01/01/2025', parent_id: 1 },
            { id: 3, name: 'Create project plan', duration: 3, predecessors: '2', parent_id: 1 },
        ];
    }

    // Always ensure there's an empty row at the end for typing
    const lastRow = rowData[rowData.length - 1];
    if (!lastRow || lastRow.name?.trim()) {
        const newId = rowData.length > 0 ? Math.max(...rowData.map(t => t.id)) + 1 : 1;
        rowData.push({ id: newId, name: '', duration: 1, parent_id: null });
    }
    
    gridApi.setGridOption('rowData', rowData);
    updateGantt(rowData);
    showMessage('Project loaded', 'info');
}

function exportProject() {
    const rowData = getAllNodes().map(n => n.data).filter(t => t.name?.trim());
    const blob = new Blob([JSON.stringify(rowData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `project-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showMessage('Project exported!', 'success');
}

function importProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                gridApi.setGridOption('rowData', importedData);
                addNewRow(importedData.length);
                saveAndRefresh();
                showMessage('Project imported successfully!', 'success');
            } else { throw new Error('Invalid format'); }
        } catch (error) { showMessage('Import failed: ' + error.message, 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}


// --- GANTT CHART (Hardened Version) ---

function updateGantt(tasks) {
    const ganttContainer = document.getElementById('gantt');
    ganttContainer.innerHTML = ''; // Always clear previous chart
    if (!tasks || typeof Gantt === 'undefined') return;

    const ganttTasks = tasks
        .filter(t => t.name?.trim() && t.start && t.finish)
        .map(t => {
            // Frappe Gantt needs YYYY-MM-DD format
            const start = t.start.split('/').reverse().join('-');
            const end = t.finish.split('/').reverse().join('-');
            return {
                id: String(t.id),
                name: t.name,
                start: start,
                end: end,
                progress: 0,
                dependencies: t.predecessors ? String(t.predecessors).split(';').map(p => p.trim()) : []
            };
        });

    if (ganttTasks.length > 0) {
        try {
            gantt = new Gantt("#gantt", ganttTasks, {
                bar_height: 20,
                padding: 18,
                view_mode: 'Day',
                date_format: 'YYYY-MM-DD',
                on_click: (task) => {
                    const node = gridApi.getRowNode(task.id);
                    if(node) {
                        gridApi.ensureNodeVisible(node, 'middle');
                        node.setSelected(true, true);
                    }
                }
            });
        } catch (e) {
            console.error("Gantt Error:", e);
            ganttContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">Error rendering Gantt chart. Check data and dates.</div>`;
        }
    } else {
        ganttContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: #6c757d;">Add tasks with names and dates to see the Gantt chart.</div>`;
    }
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const gridDiv = document.querySelector('#grid-wrapper');
    // MODERN API: Use createGrid instead of new Grid(...)
    gridApi = agGrid.createGrid(gridDiv, gridOptions);
    loadProject();
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); indentSelection(); }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); outdentSelection(); }
});