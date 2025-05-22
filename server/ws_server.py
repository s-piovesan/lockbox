#!/usr/bin/env python
"""
WebSocket Server for Lockbox

This module provides a WebSocket server that:
- Connects to the Arduino lockbox controller
- Forwards joystick data to connected web clients
- Receives LED control commands from web clients
- Implements security features and admin commands
"""

import os
import json
import asyncio
import websockets
import threading
import signal
import sys
import logging
import argparse
import uuid
from datetime import datetime
from functools import partial
from colorama import Fore, Style, init
from app_game_control import LockboxController

# Initialize colorama for colored terminal output
init()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("lockbox_server.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("LockboxServer")

# Default WebSocket server settings
DEFAULT_HOST = "0.0.0.0"  # Listen on all interfaces
DEFAULT_PORT = 8765
DEFAULT_AUTH_ENABLED = False
DEFAULT_ADMIN_TOKEN = "lockbox-admin"

class LockboxWebSocketServer:
    """WebSocket server for the Lockbox system."""
    
    def __init__(self, host=DEFAULT_HOST, port=DEFAULT_PORT, auth_enabled=DEFAULT_AUTH_ENABLED, admin_token=DEFAULT_ADMIN_TOKEN):
        """Initialize the WebSocket server.
        
        Args:
            host: The hostname to bind the server to
            port: The port to bind the server to
            auth_enabled: Whether authentication is required for clients
            admin_token: Token for admin commands
        """
        self.host = host
        self.port = port
        self.auth_enabled = auth_enabled
        self.admin_token = admin_token
        self.clients = set()
        self.authenticated_clients = set()
        self.client_info = {}  # Stores metadata about connected clients
        self.lockbox = LockboxController(auto_reconnect=True)
        self.running = False
        self.server = None
        self.loop = None
        self.lock_states = []  # History of lock state changes
        self.session_id = str(uuid.uuid4())[:8]  # Unique session identifier
        self.start_time = datetime.now()
        
    async def register_client(self, websocket, path):
        """Register a new WebSocket client.
        
        Args:
            websocket: The WebSocket connection to register
            path: The connection path
        
        Returns:
            bool: True if authentication successful or not required, False otherwise
        """
        client_id = id(websocket)
        remote_addr = websocket.remote_address if hasattr(websocket, 'remote_address') else "unknown"
        
        self.clients.add(websocket)
        self.client_info[client_id] = {
            "id": client_id,
            "address": remote_addr,
            "connected_at": datetime.now(),
            "authenticated": not self.auth_enabled,  # Auto-authenticate if auth is disabled
            "is_admin": False,
            "messages_received": 0,
            "messages_sent": 0
        }
        
        logger.info(f"{Fore.GREEN}Client connected from {remote_addr}. Total clients: {len(self.clients)}{Style.RESET_ALL}")
        
        # Add to authenticated clients if auth is disabled
        if not self.auth_enabled:
            self.authenticated_clients.add(websocket)
            return True
        
        # If auth is enabled, wait for authentication
        return False
    
    async def unregister_client(self, websocket):
        """Unregister a WebSocket client.
        
        Args:
            websocket: The WebSocket connection to unregister
        """
        client_id = id(websocket)
        
        self.clients.discard(websocket)
        self.authenticated_clients.discard(websocket)
        
        if client_id in self.client_info:
            client_addr = self.client_info[client_id]["address"]
            logger.info(f"{Fore.YELLOW}Client disconnected from {client_addr}. Total clients: {len(self.clients)}{Style.RESET_ALL}")
            del self.client_info[client_id]
        else:
            logger.info(f"{Fore.YELLOW}Unknown client disconnected. Total clients: {len(self.clients)}{Style.RESET_ALL}")
    
    async def authenticate_client(self, websocket, token):
        """Authenticate a client with the provided token.
        
        Args:
            websocket: The WebSocket connection to authenticate
            token: The authentication token
            
        Returns:
            bool: True if authentication successful, False otherwise
        """
        client_id = id(websocket)
        
        # Check if token matches admin token
        is_admin = token == self.admin_token
        
        # For demo, accept any non-empty token
        if token:
            self.authenticated_clients.add(websocket)
            if client_id in self.client_info:
                self.client_info[client_id]["authenticated"] = True
                self.client_info[client_id]["is_admin"] = is_admin
            
            logger.info(f"{Fore.GREEN}Client {client_id} authenticated {'as admin' if is_admin else ''}{Style.RESET_ALL}")
            return True
        else:
            logger.warning(f"{Fore.YELLOW}Client {client_id} failed authentication{Style.RESET_ALL}")
            return False
    
    async def send_to_all_clients(self, message, authenticated_only=True):
        """Send a message to all connected clients.
        
        Args:
            message: The message to send (will be converted to JSON)
            authenticated_only: Only send to authenticated clients
        """
        target_clients = self.authenticated_clients if authenticated_only else self.clients
        
        if not target_clients:
            return
            
        # Convert message to JSON string
        json_message = json.dumps(message)
        
        # Create tasks for sending to each client
        send_tasks = []
        for websocket in target_clients.copy():  # Use copy to avoid modification during iteration
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
        client_id = id(websocket)
        
        try:
            await websocket.send(message)
            if client_id in self.client_info:
                self.client_info[client_id]["messages_sent"] += 1
        except websockets.exceptions.ConnectionClosed:
            # Client disconnected, clean up
            await self.unregister_client(websocket)
        except Exception as e:
            logger.error(f"{Fore.RED}Error sending to client {client_id}: {e}{Style.RESET_ALL}")
    
    async def send_state_to_client(self, websocket):
        """Send the current state to a specific client.
        
        Args:
            websocket: The WebSocket connection to send to
        """
        # Create a state update with both joystick and LED values
        state = {
            "type": "state",
            "joysticks": self.lockbox.get_joystick_values(),
            "leds": self.lockbox.get_led_values(),
            "arduino_connected": self.lockbox.get_connection_status(),
            "server_info": {
                "session_id": self.session_id,
                "uptime": str(datetime.now() - self.start_time).split('.')[0],  # Format as HH:MM:SS
                "clients_connected": len(self.clients)
            }
        }
        
        # Send as JSON
        await self.send_to_client(websocket, json.dumps(state))
    
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connection.
        
        Args:
            websocket: The WebSocket connection
            path: The connection path
        """
        # Register new client - may need authentication
        authenticated = await self.register_client(websocket, path)
        
        # If authenticated or auth not required, send initial state
        if authenticated:
            await self.send_state_to_client(websocket)
        else:
            # Send authentication required message
            await self.send_to_client(websocket, json.dumps({
                "type": "auth_required",
                "message": "Authentication required"
            }))
        
        try:
            # Process messages from this client
            async for message in websocket:
                try:
                    data = json.loads(message)
                    client_id = id(websocket)
                    
                    # Update message counter
                    if client_id in self.client_info:
                        self.client_info[client_id]["messages_received"] += 1
                    
                    # Handle authentication if needed
                    if not authenticated and data.get("type") == "auth":
                        token = data.get("token", "")
                        authenticated = await self.authenticate_client(websocket, token)
                        
                        if authenticated:
                            # Send welcome and initial state
                            await self.send_state_to_client(websocket)
                        else:
                            # Send auth failed message
                            await self.send_to_client(websocket, json.dumps({
                                "type": "auth_failed",
                                "message": "Authentication failed"
                            }))
                            continue  # Skip further processing
                    
                    # Only process other messages if authenticated
                    if authenticated or not self.auth_enabled:
                        await self.process_client_message(data, websocket)
                    
                except json.JSONDecodeError:
                    logger.warning(f"{Fore.YELLOW}Invalid JSON received: {message}{Style.RESET_ALL}")
                except Exception as e:
                    logger.error(f"{Fore.RED}Error processing message: {e}{Style.RESET_ALL}")
                    
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            # Unregister client on disconnect
            await self.unregister_client(websocket)
    
    async def process_client_message(self, data, websocket):
        """Process a message from a client.
        
        Args:
            data: The parsed JSON message from the client
            websocket: The WebSocket connection that sent the message
        """
        # Check message type
        if "type" not in data:
            logger.warning(f"{Fore.YELLOW}Received message with no type: {data}{Style.RESET_ALL}")
            return
            
        message_type = data["type"]
        client_id = id(websocket)
        is_admin = self.client_info.get(client_id, {}).get("is_admin", False)
        
        # Handle different message types
        if message_type == "led_control":
            try:
                leds = data.get("leds", {})
                self.lockbox.set_led_values(
                    led1=leds.get("led1"),
                    led2=leds.get("led2"),
                    led3=leds.get("led3")
                )
                
                # Record lock state change
                self.lock_states.append({
                    "timestamp": datetime.now().isoformat(),
                    "leds": self.lockbox.get_led_values(),
                    "client_id": client_id
                })
                
                # Forward the updated LED state to all clients
                await self.send_to_all_clients({
                    "type": "led_update",
                    "leds": self.lockbox.get_led_values()
                })
                
            except Exception as e:
                logger.error(f"{Fore.RED}Error handling LED control: {e}{Style.RESET_ALL}")
                
        elif message_type == "ping":
            # Simple ping-pong for connection testing
            await self.send_to_client(websocket, json.dumps({
                "type": "pong",
                "timestamp": datetime.now().isoformat()
            }))
            
        elif message_type == "get_state":
            # Send current state to the requesting client
            await self.send_state_to_client(websocket)
            
        elif message_type == "admin_command" and is_admin:
            # Process admin commands
            await self.handle_admin_command(data, websocket)
    
    async def handle_admin_command(self, data, websocket):
        """Handle administrative commands from authorized clients.
        
        Args:
            data: The command data
            websocket: The WebSocket connection
        """
        command = data.get("command")
        
        if command == "diagnostic":
            # Run diagnostic on Arduino connection
            diag_results = self.lockbox.run_diagnostic()
            await self.send_to_client(websocket, json.dumps({
                "type": "admin_response",
                "command": "diagnostic",
                "results": diag_results
            }))
            
        elif command == "server_status":
            # Send detailed server status
            await self.send_to_client(websocket, json.dumps({
                "type": "admin_response",
                "command": "server_status",
                "status": {
                    "session_id": self.session_id,
                    "uptime": str(datetime.now() - self.start_time).split('.')[0],
                    "start_time": self.start_time.isoformat(),
                    "client_count": len(self.clients),
                    "authenticated_clients": len(self.authenticated_clients),
                    "arduino_connected": self.lockbox.get_connection_status(),
                    "lock_state_changes": len(self.lock_states)
                }
            }))
            
        elif command == "client_list":
            # Send list of connected clients
            client_list = []
            for cid, info in self.client_info.items():
                client_list.append({
                    "id": str(cid),
                    "address": info["address"],
                    "connected_at": info["connected_at"].isoformat(),
                    "authenticated": info["authenticated"],
                    "is_admin": info["is_admin"],
                    "messages": {
                        "received": info["messages_received"],
                        "sent": info["messages_sent"]
                    }
                })
                
            await self.send_to_client(websocket, json.dumps({
                "type": "admin_response",
                "command": "client_list",
                "clients": client_list
            }))
            
        elif command == "reset_arduino":
            # Attempt to reset the Arduino connection
            self.lockbox.disconnect()
            success = self.lockbox.connect() and self.lockbox.start()
            
            await self.send_to_client(websocket, json.dumps({
                "type": "admin_response",
                "command": "reset_arduino",
                "success": success
            }))
            
            # If successful, notify all clients of the new state
            if success:
                await self.send_to_all_clients({
                    "type": "arduino_status",
                    "connected": True
                })
    
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
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.send_to_all_clients(message), self.loop)
    
    def connection_status_handler(self, connected):
        """Handle Arduino connection status changes.
        
        Args:
            connected: Boolean indicating connection status
        """
        # Create the message to send
        message = {
            "type": "arduino_status",
            "connected": connected
        }
        
        # Schedule the send_to_all_clients coroutine in the asyncio event loop
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.send_to_all_clients(message), self.loop)
            
        if connected:
            logger.info(f"{Fore.GREEN}Arduino connection established{Style.RESET_ALL}")
        else:
            logger.warning(f"{Fore.YELLOW}Arduino connection lost{Style.RESET_ALL}")
    
    async def start_server(self):
        """Start the WebSocket server.
        
        Returns:
            bool: True if server started successfully, False otherwise
        """
        # Connect to the lockbox
        if not self.lockbox.connect():
            logger.error(f"{Fore.RED}Failed to connect to lockbox controller{Style.RESET_ALL}")
            return False
        
        # Register callbacks
        self.lockbox.register_joystick_callback(self.joystick_update_handler)
        self.lockbox.register_connection_status_callback(self.connection_status_handler)
        
        # Start the lockbox communication
        if not self.lockbox.start():
            logger.error(f"{Fore.RED}Failed to start lockbox controller{Style.RESET_ALL}")
            return False
        
        # Start the WebSocket server
        try:
            self.server = await websockets.serve(
                self.handle_client, 
                self.host, 
                self.port,
                ping_interval=30,  # Send ping every 30 seconds
                ping_timeout=10    # Wait 10 seconds for pong
            )
            self.running = True
            self.loop = asyncio.get_event_loop()
            
            logger.info(f"{Fore.GREEN}WebSocket server started at ws://{self.host}:{self.port}{Style.RESET_ALL}")
            print(f"\n{'='*50}")
            print(f"  Lockbox WebSocket Server Running")
            print(f"  Session ID: {self.session_id}")
            print(f"  Listening on: ws://{self.host}:{self.port}")
            print(f"  Authentication: {'Enabled' if self.auth_enabled else 'Disabled'}")
            print(f"  Press Ctrl+C to stop the server")
            print(f"{'='*50}\n")
            
            return True
        except Exception as e:
            logger.error(f"{Fore.RED}Error starting WebSocket server: {e}{Style.RESET_ALL}")
            return False
    
    async def stop_server(self):
        """Stop the WebSocket server."""
        if self.server:
            self.running = False
            self.server.close()
            await self.server.wait_closed()
            logger.info(f"{Fore.YELLOW}WebSocket server stopped{Style.RESET_ALL}")
        
        # Disconnect from lockbox
        self.lockbox.disconnect()
        
        # Notify all clients about shutdown
        shutdown_message = {
            "type": "server_shutdown",
            "message": "Server is shutting down"
        }
        try:
            await self.send_to_all_clients(shutdown_message, authenticated_only=False)
        except:
            pass


def handle_shutdown(server_instance, loop):
    """Handle graceful shutdown on SIGINT/SIGTERM."""
    print(f"\n{Fore.YELLOW}Shutting down...{Style.RESET_ALL}")
    
    try:
        # Create and run the shutdown task
        shutdown_task = asyncio.create_task(server_instance.stop_server())
        
        # Run the task to completion if the loop is still running
        if loop.is_running():
            # For Windows compatibility
            future = asyncio.run_coroutine_threadsafe(server_instance.stop_server(), loop)
            future.result(10)  # Wait up to 10 seconds for shutdown
        else:
            loop.run_until_complete(shutdown_task)
        
        # Stop the loop if it's still running
        if not loop.is_closed():
            loop.stop()
        
        # Cancel any pending tasks
        pending = asyncio.all_tasks(loop=loop)
        for task in pending:
            task.cancel()
    except Exception as e:
        print(f"{Fore.RED}Error during shutdown: {e}{Style.RESET_ALL}")
    
    print(f"{Fore.GREEN}Server stopped.{Style.RESET_ALL}")


async def main():
    """Main entry point for the WebSocket server."""
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Lockbox WebSocket Server")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Host to bind the server to (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port to bind the server to (default: {DEFAULT_PORT})")
    parser.add_argument("--auth", action="store_true", help="Enable authentication")
    parser.add_argument("--admin-token", default=DEFAULT_ADMIN_TOKEN, help=f"Admin token for privileged commands (default: {DEFAULT_ADMIN_TOKEN})")
    args = parser.parse_args()
    
    # Create server with parsed arguments
    server = LockboxWebSocketServer(
        host=args.host,
        port=args.port,
        auth_enabled=args.auth,
        admin_token=args.admin_token
    )
    
    # Setup signal handlers for graceful shutdown
    loop = asyncio.get_event_loop()
    
    # Platform-specific signal handling (Windows doesn't support loop.add_signal_handler)
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(
                    sig, 
                    lambda: handle_shutdown(server, loop)
                )
            except NotImplementedError:
                # Signal handlers are not implemented on Windows
                # Use alternative signal handling below
                pass
    except Exception as e:
        logger.warning(f"{Fore.YELLOW}Error setting up signal handlers: {e}. Using fallback method.{Style.RESET_ALL}")
    
    # Start the server
    if await server.start_server():
        try:
            # Keep the server running
            while server.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            # This will catch Ctrl+C on Windows
            await server.stop_server()


if __name__ == "__main__":
    asyncio.run(main())
