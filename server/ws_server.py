#!/usr/bin/env python
"""
WebSocket Server for Lockbox

This module provides a WebSocket server that:
- Connects to the Arduino lockbox controller
- Forwards joystick data to connected web clients
- Receives LED control commands from web clients
"""

import os
import json
import asyncio
import websockets
import threading
import signal
import sys
from colorama import Fore, Style, init
from app_game_control import LockboxController

# Initialize colorama for colored terminal output
init()

# Default WebSocket server settings
DEFAULT_HOST = "localhost"
DEFAULT_PORT = 8765

class LockboxWebSocketServer:
    """WebSocket server for the Lockbox system."""
    
    def __init__(self, host=DEFAULT_HOST, port=DEFAULT_PORT):
        """Initialize the WebSocket server.
        
        Args:
            host: The hostname to bind the server to
            port: The port to bind the server to
        """
        self.host = host
        self.port = port
        self.clients = set()
        self.lockbox = LockboxController()
        self.running = False
        self.server = None
        
    async def register_client(self, websocket):
        """Register a new WebSocket client.
        
        Args:
            websocket: The WebSocket connection to register
        """
        self.clients.add(websocket)
        print(f"{Fore.GREEN}Client connected. Total clients: {len(self.clients)}{Style.RESET_ALL}")
        
        # Send initial state to the new client
        await self.send_state_to_client(websocket)
    
    async def unregister_client(self, websocket):
        """Unregister a WebSocket client.
        
        Args:
            websocket: The WebSocket connection to unregister
        """
        self.clients.remove(websocket)
        print(f"{Fore.YELLOW}Client disconnected. Total clients: {len(self.clients)}{Style.RESET_ALL}")
    
    async def send_to_all_clients(self, message):
        """Send a message to all connected clients.
        
        Args:
            message: The message to send (will be converted to JSON)
        """
        if not self.clients:
            return
            
        # Convert message to JSON string
        json_message = json.dumps(message)
        
        # Create tasks for sending to each client
        send_tasks = []
        for websocket in self.clients.copy():  # Use copy to avoid modification during iteration
            send_tasks.append(asyncio.create_task(self.send_to_client(websocket, json_message)))
            
        # Wait for all send tasks to complete
        if send_tasks:
            await asyncio.gather(*send_tasks, return_exceptions=True)
    
    async def send_to_client(self, websocket, message):
        """Send a message to a specific client, handling errors.
        
        Args:
            websocket: The WebSocket connection to send to
            message: The message to send (JSON string)
        """
        try:
            await websocket.send(message)
        except websockets.exceptions.ConnectionClosed:
            # Client disconnected, clean up
            await self.unregister_client(websocket)
        except Exception as e:
            print(f"{Fore.RED}Error sending to client: {e}{Style.RESET_ALL}")
    
    async def send_state_to_client(self, websocket):
        """Send the current state to a specific client.
        
        Args:
            websocket: The WebSocket connection to send to
        """
        # Create a state update with both joystick and LED values
        state = {
            "type": "state",
            "joysticks": self.lockbox.get_joystick_values(),
            "leds": self.lockbox.get_led_values()
        }
        
        # Send as JSON
        await self.send_to_client(websocket, json.dumps(state))
    
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connection.
        
        Args:
            websocket: The WebSocket connection
            path: The connection path
        """
        # Register new client
        await self.register_client(websocket)
        
        try:
            # Process messages from this client
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.process_client_message(data)
                except json.JSONDecodeError:
                    print(f"{Fore.RED}Invalid JSON received: {message}{Style.RESET_ALL}")
                except Exception as e:
                    print(f"{Fore.RED}Error processing message: {e}{Style.RESET_ALL}")
                    
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            # Unregister client on disconnect
            await self.unregister_client(websocket)
    
    async def process_client_message(self, data):
        """Process a message from a client.
        
        Args:
            data: The parsed JSON message from the client
        """
        # Check message type
        if "type" not in data:
            print(f"{Fore.YELLOW}Received message with no type: {data}{Style.RESET_ALL}")
            return
            
        message_type = data["type"]
        
        # Handle LED control messages
        if message_type == "led_control":
            try:
                leds = data.get("leds", {})
                self.lockbox.set_led_values(
                    led1=leds.get("led1"),
                    led2=leds.get("led2"),
                    led3=leds.get("led3")
                )
                
                # Forward the updated LED state to all clients
                await self.send_to_all_clients({
                    "type": "led_update",
                    "leds": self.lockbox.get_led_values()
                })
                
            except Exception as e:
                print(f"{Fore.RED}Error handling LED control: {e}{Style.RESET_ALL}")
    
    def joystick_update_handler(self, joystick_values):
        """Handle joystick updates from the lockbox controller.
        
        This callback runs in the lockbox controller's thread, so we need
        to safely schedule the WebSocket send in the asyncio event loop.
        
        Args:
            joystick_values: Dict with the current joystick values
        """
        # Create the message to send
        message = {
            "type": "joystick_update",
            "joysticks": joystick_values
        }
        
        # Schedule the send_to_all_clients coroutine in the asyncio event loop
        asyncio.run_coroutine_threadsafe(self.send_to_all_clients(message), self.loop)
    
    async def start_server(self):
        """Start the WebSocket server."""
        # Connect to the lockbox
        if not self.lockbox.connect():
            print(f"{Fore.RED}Failed to connect to lockbox controller{Style.RESET_ALL}")
            return False
        
        # Register for joystick updates
        self.lockbox.register_joystick_callback(self.joystick_update_handler)
        
        # Start the lockbox communication
        if not self.lockbox.start():
            print(f"{Fore.RED}Failed to start lockbox controller{Style.RESET_ALL}")
            return False
        
        # Start the WebSocket server
        self.server = await websockets.serve(self.handle_client, self.host, self.port)
        self.running = True
        self.loop = asyncio.get_event_loop()
        
        print(f"{Fore.GREEN}WebSocket server started at ws://{self.host}:{self.port}{Style.RESET_ALL}")
        return True
    
    async def stop_server(self):
        """Stop the WebSocket server."""
        if self.server:
            self.running = False
            self.server.close()
            await self.server.wait_closed()
            print(f"{Fore.YELLOW}WebSocket server stopped{Style.RESET_ALL}")
        
        # Disconnect from lockbox
        self.lockbox.disconnect()

def handle_shutdown(server_instance, loop):
    """Handle graceful shutdown on SIGINT/SIGTERM."""
    print(f"{Fore.YELLOW}Shutting down...{Style.RESET_ALL}")
    shutdown_task = asyncio.create_task(server_instance.stop_server())
    loop.run_until_complete(shutdown_task)
    loop.stop()

async def main():
    """Main entry point for the WebSocket server."""
    server = LockboxWebSocketServer()
    
    # Setup signal handlers for graceful shutdown
    loop = asyncio.get_event_loop()
    
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: handle_shutdown(server, loop))
    
    # Start the server
    if await server.start_server():
        # Keep the server running
        while server.running:
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())
