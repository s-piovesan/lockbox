"""
Script pour corriger l'erreur dans serrure.html
"""

import re

def fix_serrure_html():
    # Lire le fichier complet
    with open("templates/serrure.html", "r", encoding="utf-8") as f:
        content = f.read()
    
    # Rechercher et supprimer la première définition incorrecte de updateJoystickDisplay
    # La première définition se trouve après processAdminResponse et avant updateArduinoStatus
    pattern = r'(processAdminResponse\(data\) \{.*?\}\s*}\s*)// Update joystick display based on data\s*function updateJoystickDisplay\(joysticks\) \{.*?// Update LED display based on data'
    
    # Utiliser re.DOTALL pour que le point corresponde aussi aux sauts de ligne
    content_fixed = re.sub(pattern, r'\1// Update joystick display (using function defined below)\n\n        // Update LED display based on data', content, flags=re.DOTALL)
    
    # Écrire le contenu corrigé
    with open("templates/serrure.html", "w", encoding="utf-8") as f:
        f.write(content_fixed)
    
    print("Le fichier serrure.html a été corrigé.")

if __name__ == "__main__":
    fix_serrure_html()
