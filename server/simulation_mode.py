#!/usr/bin/env python
"""
Simulation Mode for Lockbox Server

This module provides a simulation mode for the Lockbox server when Arduino hardware is not available.
It simulates joystick movements and LED control without requiring actual hardware.
"""

import random
import time
import threading
import logging
from colorama import Fore, Style, init

# Initialize colorama for colored terminal output
init()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("lockbox_controller_sim.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("LockboxSimulator")

class LockboxSimulator:
    """Simulator for the lockbox hardware."""
    
    def __init__(self, auto_reconnect=True):
        """Initialize the lockbox simulator.
        
        Args:
            auto_reconnect: Kept for compatibility with LockboxController
        """
        self.connected = True
        self.running = False
        self.auto_reconnect = auto_reconnect
        
        # Data from joysticks
        self.joystick_values = {
            "joystick1": 512,
            "joystick2": 512,
            "joystick3": 512,
            "joystick1X": 512,
            "joystick1Y": 512,
            "joystick2X": 512,
            "joystick2Y": 512,
            "joystick3X": 512,
            "joystick3Y": 512
        }
        
        # LED intensity values
        self.led_values = {
            "led1": 0,
            "led2": 0,
            "led3": 0
        }
        
        # Last time we got data from simulation
        self.last_data_time = time.time()
        self.data_timeout = 5  # seconds
        
        # Callbacks for events
        self.joystick_callback = None
        self.connection_status_callback = None
        
        # Thread for simulation
        self.simulation_thread = None
        
    def connect(self):
        """Simulate connecting to the Arduino."""
        logger.info(f"{Fore.GREEN}Simulateur Lockbox connecté{Style.RESET_ALL}")
        self.connected = True
        if self.connection_status_callback:
            self.connection_status_callback(True)
        return True
        
    def disconnect(self):
        """Simulate disconnecting from the Arduino."""
        logger.info(f"{Fore.YELLOW}Simulateur Lockbox déconnecté{Style.RESET_ALL}")
        self.stop()
        self.connected = False
        if self.connection_status_callback:
            self.connection_status_callback(False)
            
    def start(self):
        """Start the simulation thread."""
        if self.running:
            return
            
        logger.info(f"{Fore.GREEN}Démarrage du simulateur Lockbox{Style.RESET_ALL}")
        self.running = True
        
        # Connect first
        if not self.connected:
            self.connect()
            
        # Start the simulation thread
        self.simulation_thread = threading.Thread(target=self._simulation_loop)
        self.simulation_thread.daemon = True
        self.simulation_thread.start()
        
    def stop(self):
        """Stop the simulation thread."""
        if not self.running:
            return
            
        logger.info(f"{Fore.YELLOW}Arrêt du simulateur Lockbox{Style.RESET_ALL}")
        self.running = False
        
        if self.simulation_thread:
            self.simulation_thread.join(timeout=1.0)
            self.simulation_thread = None
            
    def _simulation_loop(self):
        """Main simulation loop that generates random joystick movements."""
        while self.running:
            try:
                # Generate random joystick values
                self._update_joystick_values()
                
                # Update last data time
                self.last_data_time = time.time()
                
                # Notify callback if set
                if self.joystick_callback:
                    self.joystick_callback(self.joystick_values)
                    
                # Sleep to simulate data rate
                time.sleep(0.1)
                
            except Exception as e:
                logger.error(f"{Fore.RED}Erreur dans la boucle de simulation: {e}{Style.RESET_ALL}")
                time.sleep(1.0)
                
    def _update_joystick_values(self):
        """Generate random joystick values."""
        # For simulation, we'll just update with random values
        # However, we'll make the changes gradual for realism
        
        # Update joystick1 values (single value and X,Y)
        self.joystick_values["joystick1"] = self._drift_value(self.joystick_values["joystick1"])
        self.joystick_values["joystick1X"] = self._drift_value(self.joystick_values["joystick1X"])
        self.joystick_values["joystick1Y"] = self._drift_value(self.joystick_values["joystick1Y"])
        
        # Update joystick2 values
        self.joystick_values["joystick2"] = self._drift_value(self.joystick_values["joystick2"])
        self.joystick_values["joystick2X"] = self._drift_value(self.joystick_values["joystick2X"])
        self.joystick_values["joystick2Y"] = self._drift_value(self.joystick_values["joystick2Y"])
        
        # Update joystick3 values
        self.joystick_values["joystick3"] = self._drift_value(self.joystick_values["joystick3"])
        self.joystick_values["joystick3X"] = self._drift_value(self.joystick_values["joystick3X"])
        self.joystick_values["joystick3Y"] = self._drift_value(self.joystick_values["joystick3Y"])
    
    def _drift_value(self, current_value, max_drift=20):
        """Create a drift in the value for more natural movement."""
        # Randomly drift the value by a small amount
        drift = random.randint(-max_drift, max_drift)
        new_value = current_value + drift
        
        # Keep within Arduino analog range (0-1023)
        return max(0, min(1023, new_value))
    
    def set_led_value(self, led_num, value):
        """Set an LED value."""
        if 1 <= led_num <= 3:
            led_key = f"led{led_num}"
            self.led_values[led_key] = max(0, min(255, value))
            logger.info(f"{Fore.CYAN}LED {led_num} définie à {value}{Style.RESET_ALL}")
            return True
        return False

    def get_led_value(self, led_num):
        """Get an LED value."""
        if 1 <= led_num <= 3:
            led_key = f"led{led_num}"
            return self.led_values[led_key]
        return 0
        
    def get_joystick_value(self, joystick_num):
        """Get a joystick value (0-1023)."""
        if 1 <= joystick_num <= 3:
            joystick_key = f"joystick{joystick_num}"
            return self.joystick_values[joystick_key]
        return 512  # Middle position
        
    def get_joystick_position(self, joystick_num):
        """Get a joystick position as X,Y coordinates."""
        if 1 <= joystick_num <= 3:
            return {
                "x": self.joystick_values[f"joystick{joystick_num}X"],
                "y": self.joystick_values[f"joystick{joystick_num}Y"]
            }
        return {"x": 512, "y": 512}  # Middle position
        
    def set_joystick_callback(self, callback):
        """Set a callback for joystick updates."""
        self.joystick_callback = callback
        
    def set_connection_status_callback(self, callback):
        """Set a callback for connection status changes."""
        self.connection_status_callback = callback
        
    def is_connected(self):
        """Check if the simulator is connected."""
        return self.connected
        
    def is_active(self):
        """Check if data is being actively received."""
        # If we've received data in the last X seconds, we're active
        return time.time() - self.last_data_time < self.data_timeout
