# Test script pour simuler des mouvements de joystick

import asyncio
import websockets
import json
import random
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

# Paramètres du serveur WebSocket
HOST = "localhost"
PORT = 8765
URI = f"ws://{HOST}:{PORT}"

# Joystick values
joystick_values = {
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

async def simulate_joystick_movement():
    """Simulate joystick movement by changing values randomly."""
    try:
        async with websockets.connect(URI) as websocket:
            logger.info("Connected to WebSocket server")
            
            # Simulate joystick movement
            for _ in range(30):  # Run for 30 iterations
                # Randomly change joystick values
                joystick_values["joystick1"] = random.randint(400, 600)
                joystick_values["joystick2"] = random.randint(400, 600)
                joystick_values["joystick3"] = random.randint(400, 600)
                
                # Update X and Y values
                joystick_values["joystick1X"] = joystick_values["joystick1"]
                joystick_values["joystick1Y"] = random.randint(400, 600)
                joystick_values["joystick2X"] = joystick_values["joystick2"]
                joystick_values["joystick2Y"] = random.randint(400, 600)
                joystick_values["joystick3X"] = joystick_values["joystick3"]
                joystick_values["joystick3Y"] = random.randint(400, 600)
                
                # Create and send message
                message = {
                    "type": "joystick_update",
                    "joysticks": joystick_values
                }
                
                await websocket.send(json.dumps(message))
                logger.info(f"Sent joystick update: {joystick_values['joystick1']}, {joystick_values['joystick2']}, {joystick_values['joystick3']}")
                
                # Wait for server response
                response = await websocket.recv()
                logger.info(f"Received: {response[:30]}...")
                
                # Sleep between updates
                await asyncio.sleep(0.5)
                
            logger.info("Simulation complete")
    
    except Exception as e:
        logger.error(f"Error in simulation: {e}")

# Run the simulation
if __name__ == "__main__":
    logger.info("Starting joystick simulation")
    asyncio.run(simulate_joystick_movement())
