# Fluid Project Tracker

A 100% client-side project management tool that runs entirely in your browser. No server, no database, just pure JavaScript power!

## 🚀 Features

- **Excel-like Grid Interface** - Drag, drop, edit, and organize tasks
- **Smart Calculations** - Automatic date scheduling and dependency management
- **Visual Gantt Chart** - Interactive timeline view
- **Data Persistence** - Multiple ways to save your work
- **Import/Export** - JSON file support for backup and sharing

## 📁 Files

- `index.html` - Main application
- `style.css` - Styling
- `app.js` - Core logic
- `frappe-gantt.css` - Gantt chart styling
- `frappe-gantt.min.js` - Gantt chart library

## 💾 Data Persistence Options

### 1. Automatic LocalStorage (Default)
- Data automatically saves to your browser's local storage
- Persists between sessions on the same computer
- Works offline
- Status indicator shows save status

### 2. Manual Export/Import
- **Export to File** - Download your project as a JSON file
- **Import from File** - Load a previously exported project
- **Download Auto-Export** - Get the latest auto-saved version

### 3. Auto-Export Feature
- Automatically creates export data every 5 minutes
- Triggers on page unload
- Click "Download Auto-Export" to save the latest version
- Perfect for GitHub Pages deployment

## 🎯 How to Use

1. **Open `index.html`** in any modern browser
2. **Start typing** in the first row to add tasks
3. **Use indentation** (Alt+Right/Left) to create hierarchy
4. **Set predecessors** using task IDs (e.g., "1;3")
5. **Click "Recalculate"** to update all dates
6. **Export regularly** to backup your work

## 🔧 GitHub Pages Deployment

1. Upload all files to your GitHub repository
2. Enable GitHub Pages in repository settings
3. Your project will be available at `https://yourusername.github.io/repository-name`
4. Use the export/import features to backup your data

## ⌨️ Keyboard Shortcuts

- **Alt + Right Arrow** - Indent selected tasks
- **Alt + Left Arrow** - Outdent selected tasks
- **Right-click** - Context menu for row operations

## 📊 Data Format

Projects are saved as JSON with this structure:
```json
{
  "version": "1.0",
  "exportDate": "2024-01-15T10:30:00.000Z",
  "projectName": "My Project",
  "tasks": [
    {
      "id": 1,
      "name": "Task Name",
      "duration": 5,
      "start": "15/01/2024",
      "finish": "19/01/2024",
      "predecessors": "2;3",
      "resource": "Team Member",
      "notes": "Task notes"
    }
  ]
}
```

## 🛠️ Technical Details

- **No Dependencies** - Pure HTML, CSS, and JavaScript
- **AG Grid** - Professional data grid component
- **Frappe Gantt** - Beautiful Gantt chart library
- **LocalStorage** - Browser-based data persistence
- **Workday Calculations** - Excludes weekends from scheduling

## 📝 Tips

- Export your project regularly as a backup
- Use the auto-export feature for peace of mind
- Task IDs are automatically generated - use them for predecessors
- The Gantt chart updates automatically when you recalculate
- All data is stored locally - no server required!

---

**Ready to start?** Just open `index.html` in your browser and begin managing your projects!