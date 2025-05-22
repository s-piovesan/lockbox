#!/usr/bin/env python
"""
Script de démarrage pour le Lockbox Serveur

Ce script corrige les problèmes potentiels dans le code,
puis démarre le serveur WebSocket.
"""

import os
import sys
import re
import subprocess
import logging
import time

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("StartupScript")

# Chemins des fichiers
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.join(BASE_DIR, "server")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
HTML_FILE = os.path.join(TEMPLATES_DIR, "serrure.html")
SERVER_SCRIPT = os.path.join(SERVER_DIR, "ws_server.py")

def fix_arduino_data_format():
    """Corrige la façon dont les données de joystick sont traitées dans app_game_control.py."""
    try:
        app_control_file = os.path.join(SERVER_DIR, "app_game_control.py")
        
        with open(app_control_file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 1. Ajouter X,Y à la structure de données joystick_values
        if '"joystick1X"' not in content:
            logger.info("Ajout des coordonnées X,Y aux valeurs de joystick")
            pattern = r'self\.joystick_values = \{\s*"joystick1": \d+,\s*"joystick2": \d+,\s*"joystick3": \d+\s*\}'
            replacement = '''self.joystick_values = {
            "joystick1": 512,
            "joystick2": 512,
            "joystick3": 512,
            "joystick1X": 512,  # Added X,Y coordinates
            "joystick1Y": 512,
            "joystick2X": 512,
            "joystick2Y": 512,
            "joystick3X": 512,
            "joystick3Y": 512
        }'''
            content = re.sub(pattern, replacement, content)
        
        # 2. Mettre à jour le traitement des données Arduino
        pattern = r'# Handle joystick data.*?self\.joystick_callback\(self\.joystick_values\).*?logger\.debug\(f"Joystick values: \{self\.joystick_values\}"\)'
        if 'joystick1X' not in content or not re.search(pattern, content, re.DOTALL):
            logger.info("Mise à jour du traitement des données de joystick")
            replacement = '''# Handle joystick data (format: J1X,J1Y,J2X,J2Y,J3X,J3Y)
            if content.startswith('J'):
                try:
                    # Parse joystick values
                    values = content[1:].split(',')
                    if len(values) == 6:
                        # Arduino sends X and Y for each joystick
                        j1x = int(values[0])
                        j1y = int(values[1])
                        j2x = int(values[2])
                        j2y = int(values[3])
                        j3x = int(values[4])
                        j3y = int(values[5])
                        
                        # Store values in both formats
                        self.joystick_values["joystick1"] = j1x
                        self.joystick_values["joystick2"] = j2x
                        self.joystick_values["joystick3"] = j3x
                        
                        # Store X,Y pairs
                        self.joystick_values["joystick1X"] = j1x
                        self.joystick_values["joystick1Y"] = j1y
                        self.joystick_values["joystick2X"] = j2x
                        self.joystick_values["joystick2Y"] = j2y
                        self.joystick_values["joystick3X"] = j3x
                        self.joystick_values["joystick3Y"] = j3y
                        
                        # Debug info
                        logger.debug(f"Raw joystick data - J1: ({j1x},{j1y}), J2: ({j2x},{j2y}), J3: ({j3x},{j3y})")
                        
                        # Call the callback with new joystick data
                        if self.joystick_callback:
                            self.joystick_callback(self.joystick_values)
                            
                        logger.debug(f"Joystick values: {self.joystick_values}")'''
                            
            content = re.sub(pattern, replacement, content, flags=re.DOTALL)
            
        # Enregistrer les modifications
        with open(app_control_file, 'w', encoding='utf-8') as f:
            f.write(content)
            
        logger.info("✅ Correctifs Arduino appliqués")
        return True
    
    except Exception as e:
        logger.error(f"Erreur lors de la correction du format des données Arduino: {e}")
        return False

def fix_windows_signal_handlers():
    """Corrige les gestionnaires de signaux pour Windows."""
    try:
        ws_server_file = os.path.join(SERVER_DIR, "ws_server.py")
        
        with open(ws_server_file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Vérifier si le code a déjà été corrigé
        if "Platform-specific signal handling" not in content:
            logger.info("Correction des gestionnaires de signaux pour Windows")
            
            # Chercher le bloc de code à remplacer
            pattern = r'for sig in \(signal\.SIGINT, signal\.SIGTERM\):\s*loop\.add_signal_handler\(\s*sig,\s*lambda: handle_shutdown\(server, loop\)\s*\)'
            
            replacement = '''# Platform-specific signal handling (Windows doesn't support loop.add_signal_handler)
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(
                    sig, 
                    lambda: handle_shutdown(server, loop)
                )
            except NotImplementedError:
                # Signal handlers are not implemented on Windows
                # Use alternative signal handling below
                pass
    except Exception as e:
        logger.warning(f"{Fore.YELLOW}Error setting up signal handlers: {e}. Using fallback method.{Style.RESET_ALL}")'''
            
            content = re.sub(pattern, replacement, content)
            
            # Chercher la boucle d'attente pour ajouter le gestionnaire KeyboardInterrupt
            pattern = r'# Keep the server running\s*while server\.running:\s*await asyncio\.sleep\(1\)'
            
            replacement = '''# Keep the server running
        try:
            while server.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            # This will catch Ctrl+C on Windows
            await server.stop_server()'''
            
            content = re.sub(pattern, replacement, content)
            
            # Supprimer les définitions en double
            if content.count("async def main(") > 1:
                # Trouver la dernière définition
                last_main_pos = content.rfind("async def main(")
                if last_main_pos > 0:
                    # Chercher la fin de la fonction (jusqu'au prochain if __name__)
                    next_if_name = content.find("if __name__ ==", last_main_pos)
                    if next_if_name > 0:
                        # Supprimer la définition en double
                        content = content[:last_main_pos] + content[next_if_name:]
            
            # Enregistrer les modifications
            with open(ws_server_file, 'w', encoding='utf-8') as f:
                f.write(content)
                
            logger.info("✅ Correctifs signaux Windows appliqués")
            return True
        else:
            logger.info("Les correctifs de signaux Windows sont déjà appliqués")
            return True
            
    except Exception as e:
        logger.error(f"Erreur lors de la correction des gestionnaires de signaux: {e}")
        return False

def start_server():
    """Démarre le serveur WebSocket."""
    try:
        logger.info("Démarrage du serveur WebSocket...")
        
        # Changer de répertoire
        os.chdir(SERVER_DIR)
        
        # Démarrer le serveur
        subprocess.Popen([sys.executable, "ws_server.py"])
        
        logger.info("✅ Serveur WebSocket démarré")
        return True
        
    except Exception as e:
        logger.error(f"Erreur lors du démarrage du serveur: {e}")
        return False

def main():
    """Fonction principale."""
    logger.info("=== Script de démarrage Lockbox ===")
    
    # Appliquer les correctifs
    arduino_fix_ok = fix_arduino_data_format()
    signal_fix_ok = fix_windows_signal_handlers()
    
    if arduino_fix_ok and signal_fix_ok:
        # Démarrer le serveur
        server_started = start_server()
        
        if server_started:
            logger.info("\n" + "="*50)
            logger.info("Serveur démarré avec succès!")
            logger.info("Interface web disponible à: http://localhost:8765")
            logger.info("="*50 + "\n")
            
            # Attendre un peu pour que le serveur démarre
            time.sleep(2)
            
            return 0
    
    logger.error("Échec du démarrage du serveur. Vérifiez les erreurs ci-dessus.")
    return 1

if __name__ == "__main__":
    sys.exit(main())
