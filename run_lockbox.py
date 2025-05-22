#!/usr/bin/env python
"""
Start Lockbox Server with all fixes applied

This script applies all the necessary fixes to the Lockbox WebSocket server
and starts it with the correct configuration.
"""

import os
import sys
import logging
import subprocess
import time
import shutil
import webbrowser
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("LockboxStartup")

def get_project_root():
    """Get the absolute path to the project root directory."""
    return Path(__file__).parent.absolute()

def inject_js_fix(html_file, js_file):
    """Inject the JavaScript fix into the HTML file."""
    try:
        # Read the HTML file
        with open(html_file, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        # Read the JS fix
        with open(js_file, 'r', encoding='utf-8') as f:
            js_content = f.read()
        
        # Check if the script is already included
        if "fixed_joystick.js" in html_content:
            logger.info("JS fix already injected into HTML file.")
            return True
        
        # Find the position to insert the script (before the closing </body> tag)
        insert_pos = html_content.rfind('</body>')
        if insert_pos == -1:
            logger.error("Could not find </body> tag in HTML file.")
            return False
        
        # Create a script tag with the JS content
        script_tag = f'\n<script>\n// Fixed joystick handlers\n{js_content}\n</script>\n'
        
        # Insert the script
        new_html_content = html_content[:insert_pos] + script_tag + html_content[insert_pos:]
        
        # Create a backup of the original file
        backup_file = html_file + '.backup'
        if not os.path.exists(backup_file):
            shutil.copy2(html_file, backup_file)
            logger.info(f"Created backup of HTML file at {backup_file}")
        
        # Write the modified HTML
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(new_html_content)
        
        logger.info("Successfully injected JS fix into HTML file.")
        return True
    
    except Exception as e:
        logger.error(f"Error injecting JS fix: {e}")
        return False

def start_server():
    """Start the Lockbox WebSocket server."""
    root_dir = get_project_root()
    server_script = os.path.join(root_dir, "server", "ws_server.py")
    
    if not os.path.exists(server_script):
        logger.error(f"Server script not found at {server_script}")
        return False
    
    try:
        logger.info("Starting WebSocket server...")
        process = subprocess.Popen([sys.executable, server_script])
        
        # Wait for the server to start
        time.sleep(2)
        
        # Open the webpage
        url = "http://localhost:8765"
        logger.info(f"Opening browser at {url}")
        webbrowser.open(url)
        
        logger.info("Server started successfully. Press Ctrl+C to stop.")
        
        # Keep the process running
        process.wait()
        
    except KeyboardInterrupt:
        logger.info("Stopping server...")
        process.terminate()
        process.wait()
        logger.info("Server stopped.")
    
    except Exception as e:
        logger.error(f"Error starting server: {e}")
        return False
    
    return True

def main():
    """Main function to start the Lockbox server with all fixes applied."""
    root_dir = get_project_root()
    
    logger.info("Starting Lockbox Server with all fixes applied...")
    
    # Apply JS fix to HTML file
    html_file = os.path.join(root_dir, "templates", "serrure.html")
    js_file = os.path.join(root_dir, "templates", "fixed_joystick.js")
    
    if not os.path.exists(js_file):
        # Use the fix_joystick.js if fixed_joystick.js doesn't exist
        js_file = os.path.join(root_dir, "templates", "fix_joystick.js")
        if not os.path.exists(js_file):
            logger.error("JavaScript fix file not found.")
            return False
    
    if not inject_js_fix(html_file, js_file):
        logger.error("Failed to apply JavaScript fix.")
        return False
    
    # Start the server
    start_server()
    
    return True

if __name__ == "__main__":
    main()
