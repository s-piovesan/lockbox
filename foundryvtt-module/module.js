/**
 * Lockbox Simulator for FoundryVTT
 * This module creates an interactive treasure chest with lockpicking mechanics
 * that connects to a physical Arduino-based lockbox device.
 */

// Configuration
const LOCKBOX_CONFIG = {
  wsServer: {
    host: "localhost", // Can be changed in module settings
    port: 8765,        // Can be changed in module settings
  },
  debug: false,        // Enable for detailed logging
};

// WebSocket connection
let websocket = null;
let websocketConnected = false;

// Joystick and LED state
let joystickState = {
  joystick1: 0,
  joystick2: 0,
  joystick3: 0
};

let ledState = {
  led1: 0,
  led2: 0,
  led3: 0
};

// Lock difficulty settings
const LOCK_DIFFICULTIES = {
  "easy": {
    name: "Easy Lock",
    targetPositions: [400, 600, 500], // Target joystick positions
    tolerance: 100,                   // Allowed deviation from target
    image: "modules/lockbox-simulator/assets/chest-easy.webp"
  },
  "medium": {
    name: "Medium Lock",
    targetPositions: [350, 650, 480],
    tolerance: 75,
    image: "modules/lockbox-simulator/assets/chest-medium.webp"
  },
  "hard": {
    name: "Hard Lock",
    targetPositions: [320, 670, 450],
    tolerance: 50,
    image: "modules/lockbox-simulator/assets/chest-hard.webp"
  },
  "master": {
    name: "Master Lock",
    targetPositions: [300, 680, 420],
    tolerance: 30,
    image: "modules/lockbox-simulator/assets/chest-master.webp"
  }
};

// Current lock settings
let currentLock = null;
let lockState = {
  activeAttempt: false,
  pins: [false, false, false], // Whether each pin is successfully set
  unlocked: false,
  unlockTime: null,
  attemptStartTime: null
};

// Register Hooks
Hooks.once("init", () => {
  console.log("Lockbox Simulator | Initializing module");
  
  // Register module settings
  registerSettings();
});

Hooks.once("ready", () => {
  console.log("Lockbox Simulator | Ready");
  
  // Connect to WebSocket server
  connectToWebSocketServer();
  
  // Register API for macros
  window.LockboxSimulator = {
    createLockboxChest,
    setLockDifficulty,
    startLockpickingChallenge,
    cancelLockpickingChallenge,
    resetLockState,
    getLockState,
  };
});

// Register module settings
function registerSettings() {
  game.settings.register("lockbox-simulator", "wsHost", {
    name: "WebSocket Server Host",
    hint: "The hostname or IP address of the WebSocket server connecting to the Arduino",
    scope: "world",
    config: true,
    type: String,
    default: "localhost",
    onChange: (value) => {
      LOCKBOX_CONFIG.wsServer.host = value;
      reconnectWebSocket();
    }
  });
  
  game.settings.register("lockbox-simulator", "wsPort", {
    name: "WebSocket Server Port",
    hint: "The port of the WebSocket server",
    scope: "world",
    config: true,
    type: Number,
    default: 8765,
    onChange: (value) => {
      LOCKBOX_CONFIG.wsServer.port = value;
      reconnectWebSocket();
    }
  });
  
  game.settings.register("lockbox-simulator", "debugMode", {
    name: "Debug Mode",
    hint: "Enable verbose logging for debugging",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => {
      LOCKBOX_CONFIG.debug = value;
    }
  });
  
  // Load settings
  LOCKBOX_CONFIG.wsServer.host = game.settings.get("lockbox-simulator", "wsHost");
  LOCKBOX_CONFIG.wsServer.port = game.settings.get("lockbox-simulator", "wsPort");
  LOCKBOX_CONFIG.debug = game.settings.get("lockbox-simulator", "debugMode");
}

// WebSocket Connection
function connectToWebSocketServer() {
  try {
    const wsUrl = `ws://${LOCKBOX_CONFIG.wsServer.host}:${LOCKBOX_CONFIG.wsServer.port}`;
    
    // Disconnect existing connection if any
    if (websocket && websocket.readyState !== WebSocket.CLOSED) {
      websocket.close();
    }
    
    // Create new connection
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log(`Lockbox Simulator | Connected to WebSocket server at ${wsUrl}`);
      websocketConnected = true;
      
      // Notify the UI
      ui.notifications.info("Lockbox Simulator: Connected to hardware");
    };
    
    websocket.onclose = () => {
      console.log("Lockbox Simulator | WebSocket connection closed");
      websocketConnected = false;
      
      // Attempt to reconnect after a delay
      setTimeout(connectToWebSocketServer, 5000);
    };
    
    websocket.onerror = (error) => {
      console.error("Lockbox Simulator | WebSocket error:", error);
    };
    
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        processWebSocketMessage(data);
      } catch (error) {
        console.error("Lockbox Simulator | Error processing message:", error);
      }
    };
    
  } catch (error) {
    console.error("Lockbox Simulator | Error connecting to WebSocket:", error);
  }
}

function reconnectWebSocket() {
  if (websocket && websocket.readyState !== WebSocket.CLOSED) {
    websocket.close();
  }
  setTimeout(connectToWebSocketServer, 500);
}

// Process incoming WebSocket messages
function processWebSocketMessage(data) {
  if (!data.type) return;
  
  switch (data.type) {
    case "state":
      // Initial state update
      joystickState = data.joysticks || joystickState;
      ledState = data.leds || ledState;
      debugLog("Received initial state:", { joysticks: joystickState, leds: ledState });
      break;
      
    case "joystick_update":
      // Update joystick positions
      joystickState = data.joysticks || joystickState;
      debugLog("Joystick update:", joystickState);
      
      // Check lock state if there's an active lock attempt
      if (lockState.activeAttempt && !lockState.unlocked) {
        checkLockpickingProgress();
      }
      break;
      
    case "led_update":
      // Update LED state
      ledState = data.leds || ledState;
      debugLog("LED update:", ledState);
      break;
      
    default:
      debugLog("Unknown message type:", data.type);
  }
}

// Send LED control command to the WebSocket server
function sendLEDControl(led1 = null, led2 = null, led3 = null) {
  if (!websocketConnected) {
    console.warn("Lockbox Simulator | Cannot send LED control - not connected");
    return;
  }
  
  // Only update values that are provided
  const newLedState = { ...ledState };
  if (led1 !== null) newLedState.led1 = led1;
  if (led2 !== null) newLedState.led2 = led2;
  if (led3 !== null) newLedState.led3 = led3;
  
  const message = {
    type: "led_control",
    leds: newLedState
  };
  
  websocket.send(JSON.stringify(message));
  debugLog("Sent LED control:", newLedState);
}

// Create a lockbox chest tile/token on the canvas
async function createLockboxChest(difficulty = "medium", x = null, y = null) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only GMs can create lockbox chests");
    return;
  }
  
  // Validate difficulty
  if (!LOCK_DIFFICULTIES[difficulty]) {
    ui.notifications.error("Invalid lock difficulty");
    return;
  }
  
  // Get the center of the current view if coordinates not provided
  const currentView = canvas.scene._viewPosition || { x: 0, y: 0 };
  const gridSize = canvas.scene.grid.size;
  
  // Default position to the center of the view
  const posX = x ?? currentView.x;
  const posY = y ?? currentView.y;
  
  try {
    // Create a new Tile representing the chest
    const tileData = {
      img: LOCK_DIFFICULTIES[difficulty].image || "icons/svg/chest.svg",
      width: gridSize * 2,
      height: gridSize * 2,
      x: posX - gridSize,
      y: posY - gridSize,
      z: 100,
      flags: {
        "lockbox-simulator": {
          isLockbox: true,
          difficulty: difficulty,
          locked: true
        }
      }
    };
    
    // Create the tile
    const createdTile = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
    
    // Set current lock settings
    setLockDifficulty(difficulty);
    
    return createdTile[0];
  } catch (error) {
    console.error("Lockbox Simulator | Error creating chest:", error);
    ui.notifications.error("Failed to create lockbox chest");
  }
}

// Set the difficulty of the lock
function setLockDifficulty(difficulty) {
  if (!LOCK_DIFFICULTIES[difficulty]) {
    console.error(`Lockbox Simulator | Invalid lock difficulty: ${difficulty}`);
    return false;
  }
  
  currentLock = LOCK_DIFFICULTIES[difficulty];
  debugLog("Lock difficulty set to:", difficulty);
  return true;
}

// Start a lockpicking challenge
function startLockpickingChallenge(difficulty = null) {
  // Set difficulty if provided
  if (difficulty && !setLockDifficulty(difficulty)) {
    return false;
  }
  
  // Ensure a lock difficulty is set
  if (!currentLock) {
    ui.notifications.error("No lock difficulty set");
    return false;
  }
  
  // Reset lock state
  resetLockState();
  
  // Mark that we're now in an active attempt
  lockState.activeAttempt = true;
  lockState.attemptStartTime = Date.now();
  
  // Initialize LEDs (all off)
  sendLEDControl(0, 0, 0);
  
  // Notify players
  ChatMessage.create({
    content: `<h3>Lockpicking Challenge Started</h3><p>Difficulty: ${currentLock.name}</p>`,
    whisper: [game.user.id]
  });
  
  debugLog("Lockpicking challenge started:", currentLock);
  return true;
}

// Cancel the current lockpicking challenge
function cancelLockpickingChallenge() {
  if (!lockState.activeAttempt) return;
  
  lockState.activeAttempt = false;
  
  // Turn off all LEDs
  sendLEDControl(0, 0, 0);
  
  // Notify
  ui.notifications.info("Lockpicking challenge cancelled");
  
  return true;
}

// Reset the lock state
function resetLockState() {
  lockState = {
    activeAttempt: false,
    pins: [false, false, false],
    unlocked: false,
    unlockTime: null,
    attemptStartTime: null
  };
  
  // Turn off all LEDs
  sendLEDControl(0, 0, 0);
  
  return lockState;
}

// Check lockpicking progress
function checkLockpickingProgress() {
  if (!lockState.activeAttempt || !currentLock) return;
  
  // For each pin, check if the joystick is in the correct position
  for (let i = 0; i < 3; i++) {
    const joystickKey = `joystick${i+1}`;
    const targetPos = currentLock.targetPositions[i];
    const currentPos = joystickState[joystickKey];
    const tolerance = currentLock.tolerance;
    
    // Check if the joystick is within the tolerance range of the target
    const inPosition = Math.abs(currentPos - targetPos) <= tolerance;
    
    // Update pin state
    lockState.pins[i] = inPosition;
    
    // Update corresponding LED
    const ledKey = `led${i+1}`;
    let ledValue = 0;
    
    if (inPosition) {
      // Pin is set correctly - full brightness
      ledValue = 255;
    } else {
      // Calculate proximity to correct position (higher = closer)
      const distance = Math.abs(currentPos - targetPos);
      if (distance <= tolerance * 3) {
        // Within 3x tolerance - some brightness to indicate "getting warm"
        const proximityClamped = Math.max(0, (tolerance * 3) - distance);
        ledValue = Math.floor((proximityClamped / (tolerance * 3)) * 128);
      }
    }
    
    // Send updated LED value for this pin
    const ledUpdate = {};
    ledUpdate[ledKey] = ledValue;
    sendLEDControl(
      i === 0 ? ledValue : null, 
      i === 1 ? ledValue : null, 
      i === 2 ? ledValue : null
    );
  }
  
  // Check if all pins are set
  const allPinsSet = lockState.pins.every(pin => pin);
  
  if (allPinsSet && !lockState.unlocked) {
    // Lock has been picked!
    lockState.unlocked = true;
    lockState.unlockTime = Date.now();
    
    // Calculate time taken
    const timeTaken = (lockState.unlockTime - lockState.attemptStartTime) / 1000;
    
    // Flash all LEDs
    flashLEDsOnSuccess();
    
    // Notify players of success
    ChatMessage.create({
      content: `<h3>Lock Picked Successfully!</h3><p>Time: ${timeTaken.toFixed(2)} seconds</p>`,
      whisper: [game.user.id]
    });
    
    // Play a success sound
    AudioHelper.play({src: "sounds/lock.wav", volume: 0.8, autoplay: true, loop: false});
    
    debugLog("Lock picked successfully!", { timeTaken });
  }
}

// Flash LEDs in a celebratory pattern when lock is picked
function flashLEDsOnSuccess() {
  let step = 0;
  const totalSteps = 10;
  
  const flashInterval = setInterval(() => {
    step++;
    
    if (step > totalSteps) {
      // End the sequence
      clearInterval(flashInterval);
      // Turn off all LEDs if the challenge is over
      if (!lockState.activeAttempt) {
        sendLEDControl(0, 0, 0);
      }
      return;
    }
    
    // Alternate between all on and all off
    if (step % 2 === 0) {
      sendLEDControl(255, 255, 255);
    } else {
      sendLEDControl(0, 0, 0);
    }
  }, 200);
}

// Get the current state of the lock
function getLockState() {
  return {
    ...lockState,
    currentLock: currentLock ? { ...currentLock } : null,
    joysticks: { ...joystickState },
    leds: { ...ledState }
  };
}

// Debug log if debug mode is enabled
function debugLog(...args) {
  if (LOCKBOX_CONFIG.debug) {
    console.log("Lockbox Simulator |", ...args);
  }
}

// Hook into tile click events to trigger lockpicking
Hooks.on("clickTile", (tile, event) => {
  // Check if this is a lockbox tile
  const isLockbox = tile.flags?.["lockbox-simulator"]?.isLockbox;
  if (!isLockbox) return;
  
  // Get the lock difficulty from the tile flags
  const difficulty = tile.flags["lockbox-simulator"].difficulty || "medium";
  
  // Check if already unlocked
  const isLocked = tile.flags["lockbox-simulator"].locked !== false;
  
  if (!isLocked) {
    ui.notifications.info("This chest is already unlocked");
    return;
  }
  
  // Start the lockpicking challenge
  if (startLockpickingChallenge(difficulty)) {
    // Open the lockpicking UI
    new LockpickingDialog(tile).render(true);
  }
});

// Dialog for lockpicking
class LockpickingDialog extends Dialog {
  constructor(tile) {
    const dialogData = {
      title: "Lockpicking Challenge",
      content: `
        <div class="lockpicking-container">
          <h2>${currentLock.name}</h2>
          <div class="lockpicking-status">
            <p>Use the physical lockbox controls to pick this lock.</p>
            <div class="pins-container">
              <div class="pin" id="pin1"><div class="pin-label">Pin 1</div><div class="pin-status">❌</div></div>
              <div class="pin" id="pin2"><div class="pin-label">Pin 2</div><div class="pin-status">❌</div></div>
              <div class="pin" id="pin3"><div class="pin-label">Pin 3</div><div class="pin-status">❌</div></div>
            </div>
          </div>
        </div>
        <style>
          .lockpicking-container {
            text-align: center;
            padding: 10px;
          }
          .pins-container {
            display: flex;
            justify-content: space-around;
            margin-top: 20px;
          }
          .pin {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .pin-status {
            font-size: 24px;
            margin-top: 10px;
          }
        </style>
      `,
      buttons: {
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => {
            cancelLockpickingChallenge();
          }
        }
      },
      default: "cancel",
      close: () => {
        // Clean up interval when dialog closes
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
        }
        
        // Make sure challenge is cancelled if dialog is closed
        cancelLockpickingChallenge();
      }
    };
    
    super(dialogData);
    
    this.tile = tile;
    this.updateInterval = null;
  }
  
  activateListeners(html) {
    super.activateListeners(html);
    
    // Set up interval to update the UI
    this.updateInterval = setInterval(() => {
      this.updatePinStatus(html);
      
      // If the lock has been unlocked, update the UI
      if (lockState.unlocked) {
        // Update the tile flags to mark as unlocked
        this.tile.update({
          "flags.lockbox-simulator.locked": false
        });
        
        // Update dialog content
        const container = html.find(".lockpicking-container");
        container.html(`
          <h2>Lock Picked Successfully!</h2>
          <p>All pins set correctly. The chest is now unlocked.</p>
          <div style="font-size: 48px; margin: 20px;">🎉</div>
          <p>Time taken: ${((lockState.unlockTime - lockState.attemptStartTime) / 1000).toFixed(2)} seconds</p>
        `);
        
        // Update buttons
        const footer = html.find(".dialog-buttons");
        footer.html(`
          <button class="dialog-button" data-button="close">
            <i class="fas fa-check"></i> Close
          </button>
        `);
        
        html.find('[data-button="close"]').click(() => this.close());
        
        // Clear the interval
        clearInterval(this.updateInterval);
      }
    }, 100);
  }
  
  updatePinStatus(html) {
    // Update the status for each pin
    for (let i = 0; i < 3; i++) {
      const pinSet = lockState.pins[i];
      const pinElement = html.find(`#pin${i+1} .pin-status`);
      
      if (pinSet) {
        pinElement.html("✅");
        pinElement.css("color", "green");
      } else {
        pinElement.html("❌");
        pinElement.css("color", "red");
      }
    }
  }
}

// Register available lock difficulties
Hooks.on("getSceneControlButtons", (controls) => {
  // Add a lockbox section to the tiles controls
  const tileControls = controls.find(c => c.name === "tiles");
  
  if (tileControls) {
    tileControls.tools.push({
      name: "lockbox",
      title: "Create Lockbox Chest",
      icon: "fas fa-key",
      visible: game.user.isGM,
      button: true,
      onClick: () => showLockboxCreationDialog()
    });
  }
});

// Dialog for creating a new lockbox chest
function showLockboxCreationDialog() {
  const difficultyOptions = Object.keys(LOCK_DIFFICULTIES).map(key => {
    return `<option value="${key}">${LOCK_DIFFICULTIES[key].name}</option>`;
  }).join("");
  
  new Dialog({
    title: "Create Lockbox Chest",
    content: `
      <form>
        <div class="form-group">
          <label>Lock Difficulty:</label>
          <select name="difficulty">
            ${difficultyOptions}
          </select>
        </div>
      </form>
    `,
    buttons: {
      create: {
        icon: '<i class="fas fa-check"></i>',
        label: "Create",
        callback: (html) => {
          const difficulty = html.find("[name=difficulty]").val();
          createLockboxChest(difficulty);
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel"
      }
    },
    default: "create"
  }).render(true);
}
