#!/usr/bin/env python3
"""
Project Output Generator
Creates a single markdown file with all project files for architect review.
"""

import os
import sys
from pathlib import Path

def get_directory_tree(root_path, prefix="", max_depth=3, current_depth=0):
    """Generate a directory tree structure."""
    if current_depth >= max_depth:
        return ""
    
    tree = ""
    items = sorted(Path(root_path).iterdir(), key=lambda x: (x.is_file(), x.name))
    
    for i, item in enumerate(items):
        is_last = i == len(items) - 1
        current_prefix = "└── " if is_last else "├── "
        tree += f"{prefix}{current_prefix}{item.name}\n"
        
        if item.is_dir() and current_depth < max_depth - 1:
            extension = "    " if is_last else "│   "
            tree += get_directory_tree(item, prefix + extension, max_depth, current_depth + 1)
    
    return tree

def read_file_content(file_path):
    """Read file content with error handling."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"

def generate_project_markdown(project_dir="."):
    """Generate comprehensive project markdown."""
    
    # Project files to include
    project_files = [
        "index.html",
        "style.css", 
        "app.js",
        "frappe-gantt.css",
        "frappe-gantt.min.js",
        "README.md"
    ]
    
    # Start building markdown
    markdown = []
    
    # Header
    markdown.append("# Fluid Project Tracker - Complete Codebase")
    markdown.append("")
    markdown.append("**Project Overview:** 100% client-side project management tool that runs entirely in the browser.")
    markdown.append("")
    markdown.append("**Key Features:**")
    markdown.append("- Excel-like grid interface with drag & drop")
    markdown.append("- Interactive Gantt chart (left panel)")
    markdown.append("- Task hierarchy with indent/outdent")
    markdown.append("- Automatic date calculations")
    markdown.append("- LocalStorage persistence")
    markdown.append("- Import/Export functionality")
    markdown.append("")
    
    # Directory structure
    markdown.append("## Project Structure")
    markdown.append("")
    markdown.append("```")
    markdown.append(get_directory_tree(project_dir))
    markdown.append("```")
    markdown.append("")
    
    # File contents
    for file_name in project_files:
        file_path = Path(project_dir) / file_name
        
        if file_path.exists():
            markdown.append(f"## {file_name}")
            markdown.append("")
            markdown.append(f"**Location:** `{file_path}`")
            markdown.append("")
            
            # Add file content with syntax highlighting
            content = read_file_content(file_path)
            
            # Determine language for syntax highlighting
            if file_name.endswith('.html'):
                lang = 'html'
            elif file_name.endswith('.css'):
                lang = 'css'
            elif file_name.endswith('.js'):
                lang = 'javascript'
            elif file_name.endswith('.md'):
                lang = 'markdown'
            else:
                lang = 'text'
            
            markdown.append(f"```{lang}")
            markdown.append(content)
            markdown.append("```")
            markdown.append("")
        else:
            markdown.append(f"## {file_name}")
            markdown.append("")
            markdown.append(f"**Location:** `{file_path}`")
            markdown.append("")
            markdown.append("*File not found*")
            markdown.append("")
    
    # Technical details
    markdown.append("## Technical Implementation")
    markdown.append("")
    markdown.append("### Dependencies")
    markdown.append("- **AG Grid Community** (v31.0.0) - Data grid component")
    markdown.append("- **Frappe Gantt** - Gantt chart library")
    markdown.append("- **Pure HTML/CSS/JavaScript** - No build tools required")
    markdown.append("")
    
    markdown.append("### Architecture")
    markdown.append("- **Frontend Only** - Runs entirely in browser")
    markdown.append("- **LocalStorage** - Data persistence")
    markdown.append("- **Tree Data Structure** - Hierarchical task management")
    markdown.append("- **Date Calculation Engine** - Workday-based scheduling")
    markdown.append("")
    
    markdown.append("### Key Functions")
    markdown.append("- `recalculateProject()` - Automatic date scheduling")
    markdown.append("- `indentSelection()` / `outdentSelection()` - Task hierarchy")
    markdown.append("- `updateGantt()` - Gantt chart rendering")
    markdown.append("- `saveProject()` / `loadProject()` - Data persistence")
    markdown.append("- `exportProject()` / `importProject()` - File I/O")
    markdown.append("")
    
    markdown.append("### Deployment")
    markdown.append("- **GitHub Pages** - Static hosting")
    markdown.append("- **No Server Required** - Pure client-side")
    markdown.append("- **Cross-Platform** - Works on any modern browser")
    markdown.append("")
    
    return "\n".join(markdown)

def main():
    """Main function."""
    project_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    output_file = "project_complete.md"
    
    print(f"Generating project documentation from: {project_dir}")
    print(f"Output file: {output_file}")
    
    # Generate markdown
    markdown_content = generate_project_markdown(project_dir)
    
    # Write to file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        print(f"✅ Successfully generated {output_file}")
        print(f"📄 File size: {len(markdown_content)} characters")
    except Exception as e:
        print(f"❌ Error writing file: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()