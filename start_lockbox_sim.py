#!/usr/bin/env python
"""
Script pour démarrer le serveur Lockbox en mode simulation

Ce script démarre le serveur WebSocket en mode simulation (sans Arduino)
"""

import os
import sys
import logging
import argparse
import signal
from colorama import Fore, Style, init

# Assurez-vous que les modules du serveur peuvent être importés
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "server"))

# Importez après avoir ajusté le chemin
from ws_server import LockboxWebSocketServer
from simulation_mode import LockboxSimulator

# Initialiser colorama pour la sortie colorée dans le terminal
init()

# Configurer la journalisation
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("lockbox_server_sim.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("LockboxServerSim")

def main():
    """Point d'entrée principal du programme."""
    parser = argparse.ArgumentParser(description="Serveur Lockbox en mode simulation")
    parser.add_argument("--host", default="localhost", help="Adresse hôte du serveur WebSocket")
    parser.add_argument("--port", type=int, default=8765, help="Port du serveur WebSocket")
    parser.add_argument("--auth", action="store_true", help="Activer l'authentification")
    parser.add_argument("--admin-token", default="lockbox-admin", help="Jeton d'administration")
    
    args = parser.parse_args()
    
    # Créer un serveur avec un simulateur à la place du contrôleur Arduino réel
    server = LockboxWebSocketServer(
        host=args.host,
        port=args.port,
        auth_enabled=args.auth,
        admin_token=args.admin_token
    )
    
    # Remplacer le contrôleur par un simulateur
    server.lockbox = LockboxSimulator()
    
    # Configurer la gestion du signal pour arrêter proprement le serveur
    def signal_handler(sig, frame):
        logger.info(f"{Fore.YELLOW}Signal d'arrêt reçu, arrêt du serveur...{Style.RESET_ALL}")
        server.stop()
        sys.exit(0)
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Démarrer le serveur
        server.start()
    except KeyboardInterrupt:
        logger.info(f"{Fore.YELLOW}Interruption clavier, arrêt du serveur...{Style.RESET_ALL}")
        server.stop()
    except Exception as e:
        logger.error(f"{Fore.RED}Erreur lors du démarrage du serveur: {e}{Style.RESET_ALL}")
        server.stop()
        sys.exit(1)

if __name__ == "__main__":
    main()
