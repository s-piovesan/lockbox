# Script pour analyser et corriger le fichier HTML

import re
import sys

def analyze_html_file(file_path):
    """Analyser le fichier HTML pour identifier les problèmes liés aux joysticks."""
    try:
        # Lire le fichier HTML
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Rechercher les fonctions clés
        joystick_display_match = re.search(r'function\s+updateJoystickDisplay\s*\(\s*joysticks\s*\)\s*\{', content)
        joystick_update_match = re.search(r'function\s+updateJoystick\s*\(\s*index\s*,\s*([^)]+)\)\s*\{', content)
        
        print("=== HTML Analysis Results ===")
        
        if joystick_display_match:
            print(f"✅ Found updateJoystickDisplay function at position {joystick_display_match.start()}")
            
            # Extract and print 5 lines after the match
            function_start = content[joystick_display_match.start():joystick_display_match.start() + 500]
            print("\nFunction start:")
            print(function_start[:function_start.find('\n', 300)]+"...")
        else:
            print("❌ updateJoystickDisplay function not found")
        
        if joystick_update_match:
            print(f"\n✅ Found updateJoystick function at position {joystick_update_match.start()}")
            params = joystick_update_match.group(1)
            print(f"   Parameters: {params}")
            
            # Extract and print 5 lines after the match
            function_start = content[joystick_update_match.start():joystick_update_match.start() + 500]
            print("\nFunction start:")
            print(function_start[:function_start.find('\n', 300)]+"...")
        else:
            print("❌ updateJoystick function not found")
        
        # Vérifier le HTML des joysticks
        joystick_elements = re.findall(r'<div\s+class="joystick.*?</div>\s*</div>', content, re.DOTALL)
        print(f"\nFound {len(joystick_elements)} joystick elements in HTML")
        
        if joystick_elements:
            print("\nExample joystick HTML structure:")
            print(joystick_elements[0][:300]+"...")
        
        # Rechercher les références aux valeurs de joystick
        joystick_values_refs = re.findall(r'joystickValues\w*\[\s*(\d+)\s*\]', content)
        print(f"\nFound {len(joystick_values_refs)} references to joystick values arrays")
        
        # Identifier les variables joystick
        joystick_vars = re.findall(r'const\s+(joystick\w+)\s*=\s*\[', content)
        print("\nJoystick-related variables:")
        for var in joystick_vars:
            print(f"- {var}")
        
        return True
    
    except Exception as e:
        print(f"Error analyzing HTML file: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = r"e:\crochetage\lockbox\templates\serrure.html"
    
    analyze_html_file(file_path)
