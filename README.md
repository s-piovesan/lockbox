# Lockbox Simulator for Roleplaying Games

This project creates an interactive lockpicking simulation for tabletop roleplaying games, combining physical Arduino-based hardware with virtual gameplay in FoundryVTT.

## Overview

The Lockbox Simulator consists of several integrated components:

1. **Arduino Hardware** - A physical device with 3 joysticks and 3 LEDs that simulates a lockpicking mechanism
2. **Python Server** - Backend that communicates with the Arduino and provides a WebSocket interface
3. **WebSocket Server** - Distributes real-time updates between the hardware and clients
4. **FoundryVTT Module** - Integrates the lockbox into the virtual tabletop environment
5. **HTML Interface** - A browser-based control panel for testing and debugging

## Hardware Requirements

- Arduino Uno (or compatible board)
- 3 analog joysticks (connected to analog pins A0, A1, A2)
- 3 LEDs with appropriate resistors (connected to PWM pins 9, 10, 11)
- USB cable for connecting Arduino to computer

## Software Setup

### Arduino

1. Upload the `arduino/lockbox.ino` sketch to your Arduino board using the Arduino IDE
2. The Arduino code handles joystick input and LED control via serial communication

### Python Server

1. Install Python requirements:
   ```
   cd server
   pip install -r requirements.txt
   ```

2. Run the WebSocket server:
   ```
   python ws_server.py
   ```

3. For testing the Arduino connection directly:
   ```
   python app_game_control.py
   ```

### FoundryVTT Module

1. Create a symlink or copy the `foundryvtt-module` directory to your FoundryVTT modules folder
2. Enable the "Lockbox Simulator" module in your world's module settings
3. Configure the WebSocket server settings in the module configuration if it's not running on the same machine

## Usage

### Hardware Setup

1. Connect the Arduino to your computer via USB
2. Verify the LEDs light up during the startup sequence
3. Make sure joysticks move freely and can be adjusted by players

### In-Game Usage

1. As GM, use the "Create Lockbox Chest" tool in the Tiles Controls to place a lockable chest
2. Select the desired difficulty level
3. Players can click on the chest to begin a lockpicking attempt
4. Use the physical joysticks to adjust the "lock picks" until all pins are set correctly
5. LEDs provide feedback on how close each tumbler is to the correct position

### Development and Testing

The HTML interface (`templates/serrure.html`) provides a testing ground for the system without requiring FoundryVTT.

## Project Structure

- `/arduino` - Arduino sketch for the lockbox hardware
- `/server` - Python backend for hardware communication
- `/foundryvtt-module` - FoundryVTT integration
- `/templates` - HTML test interface

## Customization

- Adjust lock difficulty settings in the FoundryVTT module.js file
- Modify the Arduino pins in the lockbox.ino file if using different hardware configuration
- Add custom chest images in the foundryvtt-module/assets directory
