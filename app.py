#!/usr/bin/env python3
"""
Web GUI for Audiobookshelf Library Tidy Tool
"""

from flask import Flask, render_template, request, jsonify, session
from pathlib import Path
import json
import threading
import uuid
from tidylibrary import TidyLibrary, BookMove, LibraryStats
from typing import Dict, List
import os

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'tidylibrary-secret-key-change-in-production')

# Store active sessions
active_jobs: Dict[str, Dict] = {}
job_lock = threading.Lock()


def serialize_stats(stats: LibraryStats) -> Dict:
    """Serialize LibraryStats to JSON-compatible dict"""
    return {
        'books': stats.books,
        'authors': len(stats.authors),
        'narrators': len(stats.narrators),
        'series': len(stats.series),
        'standalone_count': stats.standalone_count,
        'total_duration': stats.total_duration,
        'total_size': stats.total_size,
        'formatted_duration': TidyLibrary.format_total_duration(stats.total_duration),
        'formatted_size': f"{stats.total_size / (1024**3):.2f} GB"
    }


def serialize_book_move(book: BookMove, root_path: Path) -> Dict:
    """Serialize BookMove to JSON-compatible dict"""
    return {
        'title': book.title,
        'old_dir': str(book.old_dir.relative_to(root_path) if book.old_dir.is_relative_to(root_path) else book.old_dir),
        'target_dir': str(book.target_dir.relative_to(root_path) if book.target_dir.is_relative_to(root_path) else book.target_dir),
        'file_changes': [
            {
                'old': old.name,
                'new': new.name,
                'changed': old.name != new.name
            }
            for old, new in book.move_plan
        ],
        'folder_changed': book.old_dir.resolve() != book.target_dir.resolve()
    }


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')


@app.route('/manifest.json')
def manifest():
    """Serve PWA manifest"""
    return app.send_static_file('manifest.json')


@app.route('/service-worker.js')
def service_worker():
    """Serve service worker"""
    return app.send_static_file('service-worker.js')


@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files"""
    from flask import send_from_directory
    return send_from_directory('static', filename)


@app.route('/api/scan', methods=['POST'])
def scan_library():
    """Scan library and return planned changes"""
    try:
        data = request.json
        library_path = data.get('path', '')
        config_path = data.get('config_path')
        
        if not library_path:
            return jsonify({'error': 'Library path is required'}), 400
        
        root_path = Path(library_path).resolve()
        
        if not root_path.exists() or not root_path.is_dir():
            return jsonify({'error': 'Invalid library path'}), 400
        
        # Initialize tidy library
        config = Path(config_path) if config_path else None
        tidy = TidyLibrary(config)
        
        # Scan library
        planned_moves, stats = tidy.scan_library(root_path, show_progress=False)
        
        # Create job ID
        job_id = str(uuid.uuid4())
        
        # Store in session
        with job_lock:
            active_jobs[job_id] = {
                'root_path': root_path,
                'planned_moves': planned_moves,
                'stats': stats,
                'tidy': tidy,
                'status': 'ready'
            }
        
        # Serialize response
        response = {
            'job_id': job_id,
            'stats': serialize_stats(stats),
            'changes_needed': len(planned_moves),
            'planned_moves': [
                serialize_book_move(book, root_path) 
                for book in planned_moves[:100]  # Limit to first 100 for display
            ],
            'total_planned': len(planned_moves)
        }
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/apply', methods=['POST'])
def apply_changes():
    """Apply the planned changes"""
    try:
        data = request.json
        job_id = data.get('job_id')
        dry_run = data.get('dry_run', False)
        selected_indices = data.get('selected_books')  # None means all
        
        if not job_id:
            return jsonify({'error': 'Job ID is required'}), 400
        
        with job_lock:
            if job_id not in active_jobs:
                return jsonify({'error': 'Invalid job ID'}), 400
            
            job = active_jobs[job_id]
            if job['status'] == 'running':
                return jsonify({'error': 'Job already running'}), 400
            
            job['status'] = 'running'
        
        # Run in background thread
        def process_job():
            try:
                root_path = job['root_path']
                tidy = job['tidy']
                planned_moves = job['planned_moves']
                
                # Filter by selected indices if provided
                if selected_indices is not None:
                    planned_moves = [planned_moves[i] for i in selected_indices if i < len(planned_moves)]
                
                log_file = root_path / "tidy_library_log.txt"
                collision_tracker = set()
                
                tidy.log_event(log_file, f"--- WEB SESSION START: {len(planned_moves)} books (dry_run={dry_run}) ---")
                
                exec_stats = {"applied": 0, "errors": 0, "collisions": 0}
                
                for book in planned_moves:
                    if tidy.execute_move(book, log_file, collision_tracker, dry_run=dry_run):
                        exec_stats["applied"] += 1
                    else:
                        exec_stats["errors"] += 1
                
                exec_stats["collisions"] = len(collision_tracker)
                
                with job_lock:
                    job['status'] = 'completed'
                    job['results'] = exec_stats
                    job['collision_list'] = sorted(list(collision_tracker))
            
            except Exception as e:
                with job_lock:
                    job['status'] = 'error'
                    job['error'] = str(e)
        
        thread = threading.Thread(target=process_job)
        thread.start()
        
        return jsonify({'status': 'started', 'job_id': job_id})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/status/<job_id>', methods=['GET'])
def get_status(job_id):
    """Get job status"""
    with job_lock:
        if job_id not in active_jobs:
            return jsonify({'error': 'Invalid job ID'}), 404
        
        job = active_jobs[job_id]
        response = {
            'status': job['status']
        }
        
        if job['status'] == 'completed':
            response['results'] = job.get('results', {})
            response['collision_list'] = job.get('collision_list', [])
        elif job['status'] == 'error':
            response['error'] = job.get('error', 'Unknown error')
        
        return jsonify(response)


@app.route('/api/validate-path', methods=['POST'])
def validate_path():
    """Validate library path"""
    try:
        data = request.json
        path = data.get('path', '')
        
        if not path:
            return jsonify({'valid': False, 'error': 'Path is required'})
        
        p = Path(path)
        if not p.exists():
            return jsonify({'valid': False, 'error': 'Path does not exist'})
        
        if not p.is_dir():
            return jsonify({'valid': False, 'error': 'Path is not a directory'})
        
        # Check for metadata.json files
        meta_files = list(p.rglob('metadata.json'))
        
        return jsonify({
            'valid': True,
            'metadata_files': len(meta_files),
            'is_library': len(meta_files) > 0
        })
    
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)})


if __name__ == '__main__':
    # Get port from environment or default to 5000
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    
    print(f"\n{'='*60}")
    print(f"Audiobookshelf Library Tidy Tool - Web Interface")
    print(f"{'='*60}")
    print(f"\nServer running at: http://{host}:{port}")
    print(f"\nPress Ctrl+C to stop\n")
    
    app.run(host=host, port=port, debug=False, threaded=True)
