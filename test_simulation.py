#!/usr/bin/env python
"""
Joystick Simulation Test Script for Lockbox

This script simulates joystick movements from an Arduino to test the WebSocket server.
It sends both single-value and X,Y pair formats to ensure both work correctly.
"""

import asyncio
import json
import logging
import time
import random
import websockets

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("JoystickSimulation")

# WebSocket server URL
WS_URL = "ws://localhost:8765"

# Generate random joystick movements
def generate_joystick_values():
    # Generate random values between 0-1023 (Arduino analog range)
    return {
        "joystick1": random.randint(0, 1023),
        "joystick2": random.randint(0, 1023),
        "joystick3": random.randint(0, 1023),
    }

# Generate random joystick movements with X,Y pairs
def generate_joystick_xy_values():
    # Generate random values between 0-1023 (Arduino analog range)
    return {
        "joystick1X": random.randint(0, 1023),
        "joystick1Y": random.randint(0, 1023),
        "joystick2X": random.randint(0, 1023),
        "joystick2Y": random.randint(0, 1023),
        "joystick3X": random.randint(0, 1023),
        "joystick3Y": random.randint(0, 1023),
    }

# Test LED control
def generate_led_values():
    # Generate random values between 0-255 (LED brightness)
    return {
        "led1": random.randint(0, 255),
        "led2": random.randint(0, 255),
        "led3": random.randint(0, 255),
    }

async def simulate_joystick():
    """Connect to WebSocket server and simulate joystick movements."""
    try:
        async with websockets.connect(WS_URL) as ws:
            logger.info("Connected to WebSocket server")
            
            # Simulate joystick movements
            for i in range(50):  # Send 50 updates
                # Alternate between single values and X,Y pairs
                if i % 3 == 0:
                    # Send single-value format
                    joystick_values = generate_joystick_values()
                    message = {
                        "type": "joystick_update",
                        "joysticks": joystick_values
                    }
                    logger.info(f"Sending single values: {joystick_values}")
                elif i % 3 == 1:
                    # Send X,Y pair format
                    joystick_values = generate_joystick_xy_values()
                    message = {
                        "type": "joystick_update",
                        "joysticks": joystick_values
                    }
                    logger.info(f"Sending X,Y pairs: {joystick_values}")
                else:
                    # Send LED update
                    led_values = generate_led_values()
                    message = {
                        "type": "led_update",
                        "leds": led_values
                    }
                    logger.info(f"Sending LED values: {led_values}")
                
                await ws.send(json.dumps(message))
                
                # Sleep to simulate real-time updates
                await asyncio.sleep(1)
                
            logger.info("Simulation completed")
            
    except Exception as e:
        logger.error(f"Error in simulation: {e}")

# Main function
async def main():
    """Main function to run the simulation."""
    logger.info("Starting joystick simulation")
    await simulate_joystick()

if __name__ == "__main__":
    asyncio.run(main())
