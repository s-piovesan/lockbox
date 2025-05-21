#!/usr/bin/env python
"""
Lockbox Game Controller

This module handles communication with the Arduino lockbox hardware.
It reads joystick positions and controls LED intensity.
"""

import os
import time
import json
import serial
import serial.tools.list_ports
import threading
from colorama import Fore, Style, init

# Initialize colorama for colored terminal output
init()

class LockboxController:
    """Controller for the lockbox hardware."""
    
    def __init__(self, baud_rate=9600, port=None):
        """Initialize the lockbox controller.
        
        Args:
            baud_rate: Serial communication baud rate
            port: COM port for Arduino (auto-detected if None)
        """
        self.baud_rate = baud_rate
        self.port = port
        self.serial_connection = None
        self.connected = False
        self.running = False
        
        # Data from joysticks
        self.joystick_values = {
            "joystick1": 0,
            "joystick2": 0,
            "joystick3": 0
        }
        
        # LED intensity values
        self.led_values = {
            "led1": 0,
            "led2": 0,
            "led3": 0
        }
        
        # Callbacks for events
        self.joystick_callback = None
        
    def find_arduino_port(self):
        """Automatically detect the Arduino COM port."""
        print(f"{Fore.YELLOW}Searching for Arduino device...{Style.RESET_ALL}")
        ports = list(serial.tools.list_ports.comports())
        
        for port in ports:
            # Look for typical Arduino identifiers in the description
            if 'arduino' in port.description.lower() or 'uno' in port.description.lower():
                print(f"{Fore.GREEN}Found Arduino on port {port.device}{Style.RESET_ALL}")
                return port.device
        
        # If not found by description, try the first available port
        if ports:
            print(f"{Fore.YELLOW}Arduino not specifically detected. Using first available port: {ports[0].device}{Style.RESET_ALL}")
            return ports[0].device
            
        print(f"{Fore.RED}No serial ports found. Is the Arduino connected?{Style.RESET_ALL}")
        return None
    
    def connect(self):
        """Connect to the Arduino device."""
        if self.port is None:
            self.port = self.find_arduino_port()
            
        if self.port is None:
            print(f"{Fore.RED}Failed to find Arduino port{Style.RESET_ALL}")
            return False
            
        try:
            self.serial_connection = serial.Serial(self.port, self.baud_rate, timeout=1)
            time.sleep(2)  # Wait for Arduino to reset after connection
            self.connected = True
            print(f"{Fore.GREEN}Connected to Arduino on {self.port}{Style.RESET_ALL}")
            return True
        except serial.SerialException as e:
            print(f"{Fore.RED}Failed to connect to Arduino: {e}{Style.RESET_ALL}")
            return False
    
    def disconnect(self):
        """Disconnect from the Arduino device."""
        if self.serial_connection and self.connected:
            self.stop()
            self.serial_connection.close()
            self.connected = False
            print(f"{Fore.YELLOW}Disconnected from Arduino{Style.RESET_ALL}")
    
    def start(self):
        """Start the communication thread with Arduino."""
        if not self.connected:
            if not self.connect():
                return False
        
        self.running = True
        self.comm_thread = threading.Thread(target=self._communication_loop)
        self.comm_thread.daemon = True
        self.comm_thread.start()
        print(f"{Fore.GREEN}Communication with Arduino started{Style.RESET_ALL}")
        return True
    
    def stop(self):
        """Stop the communication thread."""
        self.running = False
        if hasattr(self, 'comm_thread') and self.comm_thread.is_alive():
            self.comm_thread.join(timeout=1.0)
        print(f"{Fore.YELLOW}Communication with Arduino stopped{Style.RESET_ALL}")
    
    def _communication_loop(self):
        """Main loop for Arduino communication (runs in separate thread)."""
        while self.running and self.connected:
            try:
                # Read data from Arduino
                if self.serial_connection.in_waiting > 0:
                    line = self.serial_connection.readline().decode('utf-8').strip()
                    self._process_arduino_message(line)
                
                # Small delay to prevent CPU overload
                time.sleep(0.01)
                
            except serial.SerialException as e:
                print(f"{Fore.RED}Serial communication error: {e}{Style.RESET_ALL}")
                self.connected = False
                break
            except Exception as e:
                print(f"{Fore.RED}Unexpected error in communication loop: {e}{Style.RESET_ALL}")
    
    def _process_arduino_message(self, message):
        """Process incoming messages from Arduino."""
        if not message:
            return
            
        # Check for start and end markers
        if message.startswith('<') and message.endswith('>'):
            # Extract content between markers
            content = message[1:-1]
            
            # Handle joystick data (format: J1023,512,0)
            if content.startswith('J'):
                try:
                    # Parse joystick values
                    values = content[1:].split(',')
                    if len(values) == 3:
                        self.joystick_values["joystick1"] = int(values[0])
                        self.joystick_values["joystick2"] = int(values[1])
                        self.joystick_values["joystick3"] = int(values[2])
                        
                        # Call the callback with new joystick data
                        if self.joystick_callback:
                            self.joystick_callback(self.joystick_values)
                except Exception as e:
                    print(f"{Fore.RED}Error parsing joystick data: {e}{Style.RESET_ALL}")
    
    def set_led_values(self, led1=None, led2=None, led3=None):
        """Set LED intensity values (0-255) and send to Arduino.
        
        Args:
            led1: Intensity for LED 1 (0-255)
            led2: Intensity for LED 2 (0-255)
            led3: Intensity for LED 3 (0-255)
        """
        # Update only the values that are provided
        if led1 is not None:
            self.led_values["led1"] = max(0, min(255, led1))
        if led2 is not None:
            self.led_values["led2"] = max(0, min(255, led2))
        if led3 is not None:
            self.led_values["led3"] = max(0, min(255, led3))
        
        # Send to Arduino if connected
        if self.connected and self.serial_connection:
            try:
                command = f"<L{self.led_values['led1']},{self.led_values['led2']},{self.led_values['led3']}>"
                self.serial_connection.write(command.encode('utf-8'))
            except Exception as e:
                print(f"{Fore.RED}Error sending LED command: {e}{Style.RESET_ALL}")
    
    def register_joystick_callback(self, callback):
        """Register a callback for joystick updates.
        
        Args:
            callback: Function to call when joystick values change.
                     Function should accept a dict of joystick values.
        """
        self.joystick_callback = callback
    
    def get_joystick_values(self):
        """Get the current joystick values.
        
        Returns:
            Dict containing joystick values
        """
        return self.joystick_values.copy()
    
    def get_led_values(self):
        """Get the current LED values.
        
        Returns:
            Dict containing LED values
        """
        return self.led_values.copy()


# For testing the module directly
if __name__ == "__main__":
    try:
        controller = LockboxController()
        
        def joystick_handler(values):
            print(f"Joystick values: {values}")
        
        controller.register_joystick_callback(joystick_handler)
        
        if controller.start():
            print("Testing LEDs...")
            # Test LED sequence
            for i in range(0, 256, 51):
                controller.set_led_values(i, i, i)
                time.sleep(0.5)
            
            # Keep running to receive joystick values
            print("Move joysticks to see values...")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
                
        controller.disconnect()
        
    except Exception as e:
        print(f"Error: {e}")
