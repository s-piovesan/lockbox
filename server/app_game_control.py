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
import logging
from colorama import Fore, Style, init

# Initialize colorama for colored terminal output
init()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed from INFO to DEBUG for more detailed logs
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("lockbox_controller.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("LockboxController")

class LockboxController:
    """Controller for the lockbox hardware."""
    
    def __init__(self, baud_rate=9600, port=None, auto_reconnect=True):
        """Initialize the lockbox controller.
        
        Args:
            baud_rate: Serial communication baud rate
            port: COM port for Arduino (auto-detected if None)
            auto_reconnect: Automatically try to reconnect if connection is lost
        """
        self.baud_rate = baud_rate
        self.port = port
        self.serial_connection = None
        self.connected = False
        self.running = False
        self.auto_reconnect = auto_reconnect
        self.reconnect_delay = 5  # seconds
          # Data from joysticks
        self.joystick_values = {
            "joystick1": 512,
            "joystick2": 512,
            "joystick3": 512,
            "joystick1X": 512,  # Added X and Y coordinates for direct use
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
        
        # Last time we got data from Arduino
        self.last_data_time = 0
        self.data_timeout = 5  # seconds
        
        # Callbacks for events
        self.joystick_callback = None
        self.connection_status_callback = None
        
    def find_arduino_port(self):
        """Automatically detect the Arduino COM port."""
        logger.info(f"{Fore.YELLOW}Searching for Arduino device...{Style.RESET_ALL}")
        ports = list(serial.tools.list_ports.comports())
        
        for port in ports:
            # Look for typical Arduino identifiers in the description
            if 'arduino' in port.description.lower() or 'uno' in port.description.lower():
                logger.info(f"{Fore.GREEN}Found Arduino on port {port.device}{Style.RESET_ALL}")
                return port.device
        
        # If not found by description, try the first available port
        if ports:
            logger.warning(f"{Fore.YELLOW}Arduino not specifically detected. Using first available port: {ports[0].device}{Style.RESET_ALL}")
            return ports[0].device
            
        logger.error(f"{Fore.RED}No serial ports found. Is the Arduino connected?{Style.RESET_ALL}")
        return None
    
    def connect(self):
        """Connect to the Arduino device.
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        if self.port is None:
            self.port = self.find_arduino_port()
            
        if self.port is None:
            logger.error(f"{Fore.RED}Failed to find Arduino port{Style.RESET_ALL}")
            self._notify_connection_status(False)
            return False
            
        try:
            self.serial_connection = serial.Serial(self.port, self.baud_rate, timeout=1)
            time.sleep(2)  # Wait for Arduino to reset after connection
            self.connected = True
            self.last_data_time = time.time()
            logger.info(f"{Fore.GREEN}Connected to Arduino on {self.port}{Style.RESET_ALL}")
            self._notify_connection_status(True)
            return True
        except serial.SerialException as e:
            logger.error(f"{Fore.RED}Failed to connect to Arduino: {e}{Style.RESET_ALL}")
            self._notify_connection_status(False)
            return False
    
    def disconnect(self):
        """Disconnect from the Arduino device."""
        if self.serial_connection and self.connected:
            self.stop()
            self.serial_connection.close()
            self.connected = False
            logger.info(f"{Fore.YELLOW}Disconnected from Arduino{Style.RESET_ALL}")
            self._notify_connection_status(False)
    
    def start(self):
        """Start the communication thread with Arduino.
        
        Returns:
            bool: True if started successfully, False otherwise
        """
        if not self.connected:
            if not self.connect():
                return False
        
        self.running = True
        self.comm_thread = threading.Thread(target=self._communication_loop)
        self.comm_thread.daemon = True
        self.comm_thread.start()
        logger.info(f"{Fore.GREEN}Communication with Arduino started{Style.RESET_ALL}")
        return True
    
    def stop(self):
        """Stop the communication thread."""
        self.running = False
        if hasattr(self, 'comm_thread') and self.comm_thread.is_alive():
            self.comm_thread.join(timeout=1.0)
        logger.info(f"{Fore.YELLOW}Communication with Arduino stopped{Style.RESET_ALL}")
    
    def _communication_loop(self):
        """Main loop for Arduino communication (runs in separate thread)."""
        reconnect_attempts = 0
        max_reconnect_attempts = 5
        
        while self.running:
            try:
                # Check for data timeout
                if time.time() - self.last_data_time > self.data_timeout and self.connected:
                    logger.warning(f"{Fore.YELLOW}No data received from Arduino for {self.data_timeout} seconds{Style.RESET_ALL}")
                    self.connected = False
                    self._notify_connection_status(False)
                    if self.auto_reconnect:
                        self._attempt_reconnect()
                        continue
                  # Read data from Arduino if connected
                if self.connected and self.serial_connection.in_waiting > 0:
                    try:
                        line = self.serial_connection.readline().decode('utf-8').strip()
                        if line:  # Only process non-empty lines
                            logger.debug(f"Raw data from Arduino: {line}")
                            self._process_arduino_message(line)
                            self.last_data_time = time.time()
                            reconnect_attempts = 0  # Reset reconnect counter on successful data
                    except UnicodeDecodeError:
                        logger.warning(f"{Fore.YELLOW}Failed to decode Arduino data, skipping{Style.RESET_ALL}")
                    except Exception as e:
                        logger.error(f"{Fore.RED}Error processing Arduino data: {e}{Style.RESET_ALL}")
                
                # Small delay to prevent CPU overload
                time.sleep(0.01)
                
            except serial.SerialException as e:
                logger.error(f"{Fore.RED}Serial communication error: {e}{Style.RESET_ALL}")
                self.connected = False
                self._notify_connection_status(False)
                
                if self.auto_reconnect and reconnect_attempts < max_reconnect_attempts:
                    reconnect_attempts += 1
                    self._attempt_reconnect()
                else:
                    break
                    
            except Exception as e:
                logger.error(f"{Fore.RED}Unexpected error in communication loop: {e}{Style.RESET_ALL}")
    
    def _attempt_reconnect(self):
        """Attempt to reconnect to the Arduino."""
        logger.info(f"{Fore.YELLOW}Attempting to reconnect to Arduino...{Style.RESET_ALL}")
        
        # Close the current connection if it exists
        if self.serial_connection:
            try:
                self.serial_connection.close()
            except:
                pass
            
        time.sleep(self.reconnect_delay)
        
        # Try to connect again
        try:
            self.connect()
        except Exception as e:
            logger.error(f"{Fore.RED}Reconnection attempt failed: {e}{Style.RESET_ALL}")
    
    def _process_arduino_message(self, message):
        """Process incoming messages from Arduino.
        
        Args:
            message: String message from Arduino
        """
        if not message:
            return
            
        # Check for start and end markers
        if message.startswith('<') and message.endswith('>'):
            # Extract content between markers
            content = message[1:-1]            # Handle joystick data (format: J1X,J1Y,J2X,J2Y,J3X,J3Y)
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
                        
                        # Calculate average or use X value as primary
                        # For this implementation, we're using X values
                        self.joystick_values["joystick1"] = j1x
                        self.joystick_values["joystick2"] = j2x
                        self.joystick_values["joystick3"] = j3x
                        
                        # Store X,Y pairs if needed
                        self.joystick_values["joystick1X"] = j1x
                        self.joystick_values["joystick1Y"] = j1y
                        self.joystick_values["joystick2X"] = j2x
                        self.joystick_values["joystick2Y"] = j2y
                        self.joystick_values["joystick3X"] = j3x
                        self.joystick_values["joystick3Y"] = j3y
                        
                        # Additional debug info
                        logger.debug(f"Raw joystick data - J1: ({j1x},{j1y}), J2: ({j2x},{j2y}), J3: ({j3x},{j3y})")
                        
                        # Call the callback with new joystick data
                        if self.joystick_callback:
                            self.joystick_callback(self.joystick_values)
                            
                        logger.debug(f"Joystick values: {self.joystick_values}")
                    else:
                        logger.warning(f"{Fore.YELLOW}Unexpected joystick data format: {content}, found {len(values)} values{Style.RESET_ALL}")
                except Exception as e:
                    logger.error(f"{Fore.RED}Error parsing joystick data: {e}{Style.RESET_ALL}")
    
    def set_led_values(self, led1=None, led2=None, led3=None):
        """Set LED intensity values (0-255) and send to Arduino.
        
        Args:
            led1: Intensity for LED 1 (0-255)
            led2: Intensity for LED 2 (0-255)
            led3: Intensity for LED 3 (0-255)
            
        Returns:
            bool: True if command sent successfully, False otherwise
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
                logger.debug(f"Sent LED command: {command}")
                return True
            except Exception as e:
                logger.error(f"{Fore.RED}Error sending LED command: {e}{Style.RESET_ALL}")
                return False
        return False
    
    def register_joystick_callback(self, callback):
        """Register a callback for joystick updates.
        
        Args:
            callback: Function to call when joystick values change.
                     Function should accept a dict of joystick values.
        """
        self.joystick_callback = callback
    
    def register_connection_status_callback(self, callback):
        """Register a callback for connection status changes.
        
        Args:
            callback: Function to call when connection status changes.
                     Function should accept a boolean (True=connected, False=disconnected)
        """
        self.connection_status_callback = callback
    
    def _notify_connection_status(self, status):
        """Notify connection status callback if registered.
        
        Args:
            status: Boolean connection status (True=connected, False=disconnected)
        """
        if self.connection_status_callback:
            self.connection_status_callback(status)
    
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
    
    def get_connection_status(self):
        """Get the current connection status.
        
        Returns:
            Boolean indicating if connected to Arduino
        """
        return self.connected
    
    def run_diagnostic(self):
        """Run a diagnostic test on the Arduino connection.
        
        Returns:
            dict: Diagnostic results
        """
        results = {
            "connected": self.connected,
            "port": self.port,
            "baud_rate": self.baud_rate,
            "joysticks": self.get_joystick_values(),
            "leds": self.get_led_values(),
            "last_data_time": self.last_data_time,
            "data_age": time.time() - self.last_data_time if self.last_data_time > 0 else None
        }
        
        # Test LED control if connected
        if self.connected:
            # Save current LED values
            saved_leds = self.get_led_values()
            
            # Test setting LEDs to 50% brightness
            led_test_success = self.set_led_values(128, 128, 128)
            results["led_test"] = led_test_success
            
            # Restore original values
            self.set_led_values(
                saved_leds["led1"], 
                saved_leds["led2"], 
                saved_leds["led3"]
            )
        else:
            results["led_test"] = False
            
        return results


# For testing the module directly
if __name__ == "__main__":
    try:
        print(f"{Fore.CYAN}===== Lockbox Controller Test =====\n{Style.RESET_ALL}")
        
        controller = LockboxController(auto_reconnect=True)
        
        def joystick_handler(values):
            print(f"Joystick values: J1={values['joystick1']}, J2={values['joystick2']}, J3={values['joystick3']}")
        
        def connection_handler(status):
            if status:
                print(f"{Fore.GREEN}Arduino connected{Style.RESET_ALL}")
            else:
                print(f"{Fore.RED}Arduino disconnected{Style.RESET_ALL}")
        
        controller.register_joystick_callback(joystick_handler)
        controller.register_connection_status_callback(connection_handler)
        
        if controller.start():
            print("\nTesting LEDs sequence...")
            # Test LED sequence
            for i in range(0, 256, 51):
                controller.set_led_values(i, i, i)
                time.sleep(0.5)
            
            # Reset LEDs to off
            controller.set_led_values(0, 0, 0)
            
            # Diagnostic info
            print("\nRunning diagnostic...")
            diag = controller.run_diagnostic()
            print(f"Connection status: {diag['connected']}")
            print(f"Port: {diag['port']}")
            print(f"Joysticks: {diag['joysticks']}")
            
            # Keep running to receive joystick values
            print("\nMove joysticks to see values. Press Ctrl+C to exit...")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print(f"\n{Fore.YELLOW}Test terminated by user{Style.RESET_ALL}")
        else:
            print(f"{Fore.RED}Failed to connect to Arduino controller{Style.RESET_ALL}")
                
        controller.disconnect()
        
    except Exception as e:
        print(f"{Fore.RED}Error: {e}{Style.RESET_ALL}")
        import traceback
        traceback.print_exc()
        
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
