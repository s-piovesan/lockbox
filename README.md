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
- 3 analog joysticks (each with X and Y axes):
  - Joystick 1: A0 (X) and A1 (Y)
  - Joystick 2: A2 (X) and A3 (Y)
  - Joystick 3: A4 (X) and A5 (Y)
- 3 LEDs with appropriate resistors (connected to PWM pins D3, D5, D6)
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

### Windows Quick Start

For Windows users, we've created a PowerShell script that automates the setup process:

1. Run `start_lockbox.ps1` in PowerShell
2. Select option 5: "Start Server with All Fixes Applied"
3. The script will:
   - Apply all JavaScript fixes to the HTML interface
   - Start the WebSocket server
   - Open the interface in your default browser

### Testing Without Arduino

To test the server without a physical Arduino connected:

```
python test_simulation.py
```

This script simulates joystick movements and LED controls, allowing you to test the interface functionality.

## Troubleshooting

### Arduino Connection Issues

- Make sure the Arduino is properly connected via USB
- Check that the correct COM port is detected (the server will attempt to auto-detect)
- Ensure the Arduino sketch is properly uploaded
- Try resetting the Arduino while the server is running

### WebSocket Connection Issues

- Check that the server is running on port 8765
- Make sure your browser supports WebSockets
- Try accessing the interface at http://localhost:8765
- Look for any connection errors in the browser console

### Joystick Display Issues

If joysticks are not displaying correctly:

1. Restart the server using option 5 in the PowerShell script
2. Check the browser console for any JavaScript errors
3. Verify that joystick values are being received by the server (check the server logs)

## Recent Fixes

1. Fixed signal handling issues on Windows with proper try/except blocks
2. Improved joystick data format handling to support both single values and X,Y coordinates
3. Enhanced error handling and logging for better diagnostics
4. Fixed WebSocket activity indicators in the UI
5. Added helper scripts for testing and deployment
