# Script pour fixer les problèmes de serveur et démarrer

import os
import sys
import re
import time
import webbrowser
import subprocess
import shutil
from pathlib import Path

def create_backup():
    """Créer une sauvegarde du fichier HTML s'il n'existe pas déjà."""
    html_file = r"e:\crochetage\lockbox\templates\serrure.html"
    backup_file = r"e:\crochetage\lockbox\templates\serrure.html.backup"
    
    if not os.path.exists(backup_file) and os.path.exists(html_file):
        print("📁 Création d'une sauvegarde de serrure.html...")
        shutil.copy(html_file, backup_file)
        return True
    return False

def apply_joystick_fixes():
    # Chemin du fichier HTML
    html_file = r"e:\crochetage\lockbox\templates\serrure.html"
    js_file = r"e:\crochetage\lockbox\templates\fix_joystick.js"
    
    # Lire le fichier js avec les correctifs
    with open(js_file, 'r', encoding='utf-8') as f:
        fix_content = f.read()
    
    # Lire le fichier HTML
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Chercher la fonction updateJoystickDisplay et le bloc qui la contient
    joystick_pattern = r'function updateJoystickDisplay\(joysticks\).*?function updateLED\('
    match = re.search(joystick_pattern, html_content, re.DOTALL)
    
    if match:
        # Construire le contenu de remplacement
        replacement = fix_content + "\n\n        function updateLED("
        
        # Remplacer le bloc
        new_html = html_content.replace(match.group(0), replacement)
        
        # Sauvegarder le fichier modifié
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(new_html)
        
        print("✅ Joystick fixes applied to HTML file")
        return True
    else:
        print("❌ Could not find updateJoystickDisplay function in HTML file")
        return False

def main():
    print("🔧 Applying fixes to Lockbox Server")
    
    # Appliquer les correctifs
    joystick_fixes_applied = apply_joystick_fixes()
    
    if joystick_fixes_applied:
        print("🚀 Starting Lockbox Server")
        
        # Changer le répertoire de travail
        os.chdir(r"e:\crochetage\lockbox\server")
        
        # Démarrer le serveur
        os.system("python ws_server.py")
    else:
        print("❌ Fixes could not be applied, server not started")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
