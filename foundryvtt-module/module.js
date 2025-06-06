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
  debug: false,        // Enable for detailed logging  sceneVersion: "2.4.0", // Version for scene structure - increment when scenes need updates
  moduleVersion: "2.5.0" // Overall module version
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

// Global configuration for target position generation using extreme positions
const TARGET_GENERATION_CONFIG = {
  extremePositions: {
    low: { min: 50, max: 200 },   // Low extreme zone (far from center)
    high: { min: 824, max: 974 }  // High extreme zone (far from center)
  },
  minSpacing: 120                 // Minimum spacing between target positions
};

// Function to generate random target positions using extreme position zones
function generateRandomTargetPositions(tolerance, difficulty = "medium") {
  const config = TARGET_GENERATION_CONFIG;
  const { low, high } = config.extremePositions;
  
  //console.log(`Lockbox Simulator | Generating random targets for ${difficulty} (tolerance: ±${tolerance})`);
  //console.log(`Lockbox Simulator | Using extreme zones - Low: ${low.min}-${low.max}, High: ${high.min}-${high.max}`);
  
  const positions = [];
  const maxAttempts = 20; // Much simpler logic requires fewer attempts
  
  for (let i = 0; i < 3; i++) {
    let position;
    let attempts = 0;
    let isValid = false;
    
    while (!isValid && attempts < maxAttempts) {
      attempts++;
      
      // Randomly choose between low and high extreme zones
      const useLowZone = Math.random() < 0.5;
      const zone = useLowZone ? low : high;
      
      // Generate random position within the chosen zone
      position = Math.floor(Math.random() * (zone.max - zone.min + 1)) + zone.min;
      
      // Check minimum spacing from existing positions
      const hasValidSpacing = positions.length === 0 || 
        !positions.some(existingPos => Math.abs(position - existingPos) < config.minSpacing);
      
      if (hasValidSpacing) {
        isValid = true;
      }
    }
    
    // Simple fallback - alternate between zones with fixed spacing
    if (!isValid) {
      //console.log(`Lockbox Simulator | Using spaced fallback for position ${i + 1}`);
      if (i % 2 === 0) {
        position = low.min + (i * 50);  // Low zone with spacing
      } else {
        position = high.min + ((i - 1) * 50);  // High zone with spacing
      }
    }
    
    positions.push(position);
    //console.log(`Lockbox Simulator | Generated target ${i + 1}: ${position} (±${tolerance})`);
  }
  
  //console.log(`Lockbox Simulator | Final random targets: [${positions.join(', ')}]`);
  return positions;
}

// Helper function to clear cached target positions (used when resetting or regenerating)
function clearTargetPositionCache() {
  const scene = canvas?.scene;
  if (!scene) return;
  
  const difficulties = ["easy", "medium", "hard", "master"];
  const tolerances = [30, 50, 75, 100]; // All possible tolerance values
  
  let clearedCount = 0;
  difficulties.forEach(difficulty => {
    tolerances.forEach(tolerance => {
      const cacheKey = `targetPositions_${difficulty}_${tolerance}`;
      if (scene.getFlag("lockbox-simulator", cacheKey)) {
        scene.unsetFlag("lockbox-simulator", cacheKey);
        clearedCount++;
      }
    });
  });
  
  if (clearedCount > 0) {
    //console.log(`Lockbox Simulator | Cleared ${clearedCount} cached target position(s)`);
  }
}

// Helper function to get or generate cached target positions
function getOrGenerateTargetPositions(tolerance, difficulty) {
  // Get current scene
  const scene = canvas?.scene;
  if (!scene) {
    console.warn("No active scene for target position caching");
    return generateRandomTargetPositions(tolerance, difficulty);
  }
  
  // Check if we have cached positions for this difficulty and tolerance
  const cacheKey = `targetPositions_${difficulty}_${tolerance}`;
  const cachedPositions = scene.getFlag("lockbox-simulator", cacheKey);
  
  if (cachedPositions && Array.isArray(cachedPositions) && cachedPositions.length === 3) {
    //console.log(`Lockbox Simulator | Using CACHED targets for ${difficulty}: [${cachedPositions.join(', ')}]`);
    return cachedPositions;
  }
  
  // Generate new positions and cache them
  const newPositions = generateRandomTargetPositions(tolerance, difficulty);
  
  // Cache the positions in scene flags
  scene.setFlag("lockbox-simulator", cacheKey, newPositions).then(() => {
    //console.log(`Lockbox Simulator | CACHED new targets for ${difficulty}: [${newPositions.join(', ')}]`);
  }).catch(err => {
    console.warn("Failed to cache target positions:", err);
  });
  
  return newPositions;
}

// Lockbox difficulty settings with consistent target caching
const LOCK_DIFFICULTIES = {
  "easy": {
    name: "Easy Lock",
    get targetPositions() { return getOrGenerateTargetPositions(this.tolerance, "easy"); },
    tolerance: 100,                   // Allowed deviation from target
    image: "modules/lockbox-simulator/assets/scene_1152x768.png"
  },
  "medium": {
    name: "Medium Lock",
    get targetPositions() { return getOrGenerateTargetPositions(this.tolerance, "medium"); },
    tolerance: 75,
    image: "modules/lockbox-simulator/assets/scene_1152x768.png",
    tint: "#FFD700" // Or pour moyen
  },
  "hard": {
    name: "Hard Lock",
    get targetPositions() { return getOrGenerateTargetPositions(this.tolerance, "hard"); },
    tolerance: 50,
    image: "modules/lockbox-simulator/assets/scene_1152x768.png",
    tint: "#FF8C00" // Orange foncé pour difficile
  },
  "master": {
    name: "Master Lock",
    get targetPositions() { return getOrGenerateTargetPositions(this.tolerance, "master"); },
    tolerance: 30,
    image: "modules/lockbox-simulator/assets/scene_1152x768.png",
    tint: "#FF0000" // Rouge pour maître
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

// Pin locking system
let pinLockStates = [false, false, false]; // Whether each pin is locked
let pinInTargetStart = [null, null, null]; // When each pin first reached target position
let pinLockTimers = [null, null, null]; // Timer IDs for each pin

// Pre-declare functions that are used in hooks
let updateJoystickVisuals;
let connectToWebSocketServer;
let createLockboxScenes;
let showPinLockText;
let hidePinLockText;
let hideAllPinLockTexts;

// Register module settings
function registerSettings() {
  game.settings.register("lockbox-simulator", "wsHost", {
    name: "WebSocket Server Host",
    hint: "The hostname or IP address of the WebSocket server connecting to the Arduino",
    scope: "world",
    config: true,
    type: String,
    default: "localhost",
    requiresReload: false,
    onChange: (value) => {
      LOCKBOX_CONFIG.wsServer.host = value;
      // Optionally reconnect WebSocket here
    }
  });
  game.settings.register("lockbox-simulator", "wsPort", {
    name: "WebSocket Server Port",
    hint: "The port of the WebSocket server",
    scope: "world",
    config: true,
    type: Number,
    default: 8765,
    requiresReload: false,
    onChange: (value) => {
      LOCKBOX_CONFIG.wsServer.port = value;
      // Optionally reconnect WebSocket here
    }
  });
  game.settings.register("lockbox-simulator", "debugMode", {
    name: "Debug Mode",
    hint: "Enable verbose logging for debugging",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: (value) => {
      LOCKBOX_CONFIG.debug = value;
    }
  });
  // Internal setting for tracking reconnection attempts (hidden from settings UI)
  game.settings.register("lockbox-simulator", "reconnectAttempts", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
}

// Handle incoming WebSocket messages
function processWebSocketMessage(data) {
  debugLog("Received WebSocket message:", data);

  // Handle different message types
  switch (data.type) {
    case "state":
      // Initial state update - contains both joysticks and LEDs
      if (data.joysticks) {
        joystickState = {
          ...joystickState,
          ...data.joysticks
        };
        updateJoystickVisuals();
        // Check lockpicking progress if in a lockbox scene
        checkLockpickingProgress();
      }
      if (data.leds) {
        ledState = {
          ...ledState,
          ...data.leds
        };
      }
      break;
      
    case "joystick_update":
      // Joystick position update
      if (data.joysticks) {
        joystickState = {
          ...joystickState,
          ...data.joysticks
        };
        updateJoystickVisuals();
        // Check lockpicking progress on every joystick update
        checkLockpickingProgress();
      }
      break;
      
    case "led_update":
      // LED state update
      if (data.leds) {
        ledState = {
          ...ledState,
          ...data.leds
        };
      }
      break;
      
    default:
      // Handle legacy format for backwards compatibility
      if (data.joystick) {
        joystickState = {
          ...joystickState,
          ...data.joystick
        };
        updateJoystickVisuals();
        checkLockpickingProgress();
      }
      if (data.led) {
        ledState = {
          ...ledState,
          ...data.led
        };
      }
      if (data.lock) {
        lockState = {
          ...lockState,
          ...data.lock
        };
        checkLockpickingProgress();
      }
      break;
  }
}

function checkLockpickingProgress() {
  // Check if we're in a lockbox scene
  if (!canvas || !canvas.scene) return;
  if (!canvas.scene.flags?.["lockbox-simulator"]?.difficulty) return;

  const scene = canvas.scene;
  const difficulty = scene.flags["lockbox-simulator"].difficulty;
  const diffData = LOCK_DIFFICULTIES[difficulty];
  
  if (!diffData) {
    console.warn(`No difficulty configuration found for: ${difficulty}`);
    return;
  }

  // Ensure we have an active attempt
  if (!lockState.activeAttempt) {
    lockState.activeAttempt = true;
    lockState.attemptStartTime = Date.now();
    //console.log("Lockbox Simulator | Starting new lockpicking attempt");
  }
  // Check each pin for its position and lock status
  for (let i = 0; i < 3; i++) {
    const joystickValue = joystickState[`joystick${i+1}`] || 0;
    const targetValue = diffData.targetPositions[i];
    const tolerance = diffData.tolerance;

    // Enhanced extreme position detection with transition zone
    const extremeCheck = isAtExtremePosition(joystickValue);
    const isCurrentlyAtExtreme = extremeCheck.isExtreme;
    
    // Update last valid extreme position if currently at extreme
    if (isCurrentlyAtExtreme) {
      lastValidExtremePositions[i] = joystickValue;
    }
    
    // SYNCHRONIZATION FIX: Use same position value for both visibility AND locking
    let effectiveJoystickValue;
    if (isCurrentlyAtExtreme) {
      effectiveJoystickValue = joystickValue;
    } else if (lastValidExtremePositions[i] !== 512) {
      effectiveJoystickValue = lastValidExtremePositions[i];
    } else {
      effectiveJoystickValue = joystickValue;
    }
    
    // Use effectiveJoystickValue for consistent locking logic
    const isInTarget = Math.abs(effectiveJoystickValue - targetValue) <= tolerance;
    const isLockable = isCurrentlyAtExtreme && isInTarget;
    
    // DEBUG: Log when old and new logic would disagree
    const oldIsInTarget = Math.abs(joystickValue - targetValue) <= tolerance;
    if (isInTarget !== oldIsInTarget) {
      //console.log(`⚠️ Pin ${i + 1} LOGIC SYNC: Visibility=${isInTarget}, Old locking=${oldIsInTarget}`);
      //console.log(`   Current pos: ${joystickValue}, Effective pos: ${effectiveJoystickValue}, Target: ${targetValue}`);
    }
    
    if (isLockable && !pinLockStates[i]) {
      // Pin is lockable (extreme + in target) AND not yet locked
      if (pinInTargetStart[i] === null) {
        // First time in lockable state, start timer
        pinInTargetStart[i] = Date.now();
        //console.log(`Pin ${i + 1} entered LOCKABLE state (effective pos: ${effectiveJoystickValue}), starting timer`);
      } else {
        // IMPROVED LOCKING: Reduced time from 1000ms to 500ms for better responsiveness
        // Also added tolerance for micro-movements during locking
        const timeInTarget = Date.now() - pinInTargetStart[i];
        if (timeInTarget >= 500) { // Reduced from 1000ms to 500ms
          // Lock the pin
          pinLockStates[i] = true;
            // Show lock notification
          ui.notifications.info(`Goupille ${i + 1} verrouillée !`);


          AudioHelper.play({ 
            src: "modules/lockbox-simulator/assets/pin_unlocked.mp3", 
            volume: 0.5, 
            autoplay: true, 
            loop: false,
            channel: "interface"
          }, false);
    
          // Show "VERROUILLÉ" text below the pin
          showPinLockText(i + 1);
          
          // Light up the corresponding LED when pin locks
          activatePinLED(i + 1);
          
          //console.log(`Pin ${i + 1} locked after ${timeInTarget}ms (effective pos: ${effectiveJoystickValue})`);
        }
      }
    } else if (!isLockable && pinInTargetStart[i] !== null) {
      // No longer lockable, reset timer with tolerance for micro-movements
      const distanceFromTarget = Math.abs(effectiveJoystickValue - targetValue);
      const isSignificantlyOutside = distanceFromTarget > tolerance * 1.5; // 50% tolerance buffer
      
      if (isSignificantlyOutside || !isCurrentlyAtExtreme) {
        // Pin left lockable state significantly, reset timer
        pinInTargetStart[i] = null;
        //console.log(`Pin ${i + 1} left LOCKABLE state (effective pos: ${effectiveJoystickValue}), timer reset`);
      }
      // Otherwise, allow micro-movements without resetting the timer
    }
    
    // Update lockState.pins for compatibility
    if (!lockState.pins) lockState.pins = [];
    lockState.pins[i] = isInTarget;
  }
  // Check if all pins are successfully locked (not just in target position)
  let allPinsLocked = true;
  for (let i = 0; i < 3; i++) {
    if (!pinLockStates[i]) {
      allPinsLocked = false;
      break;
    }
  }

  if (allPinsLocked && !lockState.unlocked) {
    // Chest unlocked
    lockState.unlocked = true;
    lockState.unlockTime = game.time.worldTime;
    lockState.pins = [true, true, true];
    
    // Hide all lock texts when chest is unlocked
    hideAllPinLockTexts();
    
    ui.notifications.info("Coffre déverrouillé !");
      // Optional: Play unlock sound
    AudioHelper.play({ 
      src: "modules/lockbox-simulator/assets/chest_unlocked.mp3", 
      volume: 0.5, 
      autoplay: true, 
      loop: false,
      channel: "interface"
    }, false);
    //console.log("Lock successfully picked!");
    
    // Flash LEDs for success
    if (websocketConnected) {
      flashLEDsOnSuccess();
    }
    
    // Optional: Reset the lockpicking state after a short delay
    setTimeout(() => {
      resetLockState();
    }, 3000);
  }
}

function debugLog(...args) {
  if (LOCKBOX_CONFIG.debug) {
    //console.log("Lockbox Simulator |", ...args);
  }
}


// Send LED control command to the WebSocket server
function sendLEDControl(led1 = null, led2 = null, led3 = null) {
  if (!websocketConnected) {
    console.warn("Lockbox Simulator | Cannot send LED control - not connected");
    return;
  }
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

// Flash LEDs in a celebratory pattern when lock is picked
function flashLEDsOnSuccess() {
  let step = 0;
  const totalSteps = 10;
  const flashInterval = setInterval(() => {
    step++;
    if (step > totalSteps) {
      clearInterval(flashInterval);
      if (!lockState.activeAttempt) {
        sendLEDControl(0, 0, 0);
      }
      return;
    }
    if (step % 2 === 0) {
      sendLEDControl(255, 255, 255);
    } else {
      sendLEDControl(0, 0, 0);
    }
  }, 200);
}

// Activate LED for a specific pin when it locks
function activatePinLED(pinNumber) {
  if (!websocketConnected) {
    console.warn("Lockbox Simulator | Cannot activate pin LED - not connected");
    return;
  }
  
  // Get current LED states to preserve others
  const currentLED1 = ledState.led1 || 0;
  const currentLED2 = ledState.led2 || 0;
  const currentLED3 = ledState.led3 || 0;
  
  // Light up the corresponding LED (255 = full brightness)
  switch (pinNumber) {
    case 1:
      sendLEDControl(255, currentLED2, currentLED3);
      //console.log("Lockbox Simulator | LED 1 activated for pin 1 lock");
      break;
    case 2:
      sendLEDControl(currentLED1, 255, currentLED3);
      //console.log("Lockbox Simulator | LED 2 activated for pin 2 lock");
      break;
    case 3:
      sendLEDControl(currentLED1, currentLED2, 255);
      //console.log("Lockbox Simulator | LED 3 activated for pin 3 lock");
      break;
    default:
      console.warn(`Lockbox Simulator | Invalid pin number for LED activation: ${pinNumber}`);
  }
}

// Track previous joystick values to prevent unnecessary updates
let previousJoystickValues = {};

// Track last valid extreme positions for persistence when joystick returns to center
let lastValidExtremePositions = [512, 512, 512]; // Default to center for each joystick

// Enhanced extreme position detection with transition zone
function isAtExtremePosition(value) {
  const CENTER_POSITION = 512;
  const EXTREME_THRESHOLD = 200;
  const TRANSITION_ZONE = EXTREME_THRESHOLD * 0.75; // 150 - adds 1/4 radius flexibility
  
  const distanceFromCenter = Math.abs(value - CENTER_POSITION);
  
  if (distanceFromCenter >= EXTREME_THRESHOLD) {
    return { isExtreme: true, intensity: 1.0, isFullyExtreme: true };
  } else if (distanceFromCenter >= TRANSITION_ZONE) {
    // Transition zone - gradually increase intensity
    const transitionProgress = (distanceFromCenter - TRANSITION_ZONE) / (EXTREME_THRESHOLD - TRANSITION_ZONE);
    return { isExtreme: true, intensity: 0.5 + (transitionProgress * 0.5), isFullyExtreme: false };
  }
  
  return { isExtreme: false, intensity: 0, isFullyExtreme: false };
}

// Define function implementations 
updateJoystickVisuals = async function() {
  try {
    // Check if canvas and scene exist
    if (!canvas || !canvas.scene) return;
    
    // Check if we're in a lockbox scene
    if (!canvas.scene.flags?.["lockbox-simulator"]?.difficulty) return;
    
    const difficulty = canvas.scene.flags["lockbox-simulator"].difficulty;
    const diffData = LOCK_DIFFICULTIES[difficulty];
      // REDUCED THRESHOLD for smoother movement (was 5, now 2)
    const CHANGE_THRESHOLD = 2;
    let hasSignificantChange = false;
    
    for (let i = 0; i < 3; i++) {
      const joystickValue = joystickState[`joystick${i+1}`] || 0;
      const prevValue = previousJoystickValues[`joystick${i+1}`] || 0;
      
      if (Math.abs(joystickValue - prevValue) >= CHANGE_THRESHOLD) {
        hasSignificantChange = true;
        previousJoystickValues[`joystick${i+1}`] = joystickValue;
      }
    }
    
    // Always update if there's any change for smoother movement
    if (!hasSignificantChange) return;
      // Display detailed joystick and pin status
    //console.log(`Lockbox Simulator | Joystick status in ${diffData.name} scene (extreme positions relative to target):`);
    
    for (let i = 0; i < 3; i++) {
      const joystickValue = joystickState[`joystick${i+1}`] || 0;
      const targetValue = diffData.targetPositions[i];
      const tolerance = diffData.tolerance;
      const isInRange = Math.abs(joystickValue - targetValue) <= tolerance;
      const pinStatus = lockState.pins[i] ? "SET ✓" : "UNSET ✗";
      
      // Calculate extreme position status
      const CENTER_POSITION = 512;
      const EXTREME_THRESHOLD = 200;
      const distanceFromCenter = Math.abs(joystickValue - CENTER_POSITION);
      const distanceFromTarget = joystickValue - targetValue;
      const isAtExtreme = distanceFromCenter >= EXTREME_THRESHOLD;
      
      let positionStatus = "CENTER (hidden)";
      if (isInRange) {
        positionStatus = "TARGET (visible)";
      } else if (isAtExtreme) {
        const direction = distanceFromTarget > 0 ? "HIGH" : "LOW";
        positionStatus = `EXTREME-${direction} (visible, distance: ${Math.abs(distanceFromTarget)})`;
      }
      
      //console.log(`  Pin ${i+1}: Value=${joystickValue}, Target=${targetValue}±${tolerance}, ${pinStatus}, Position=${positionStatus}`);
      
      // Visual feedback - find pin column tiles in simulation encart
      const pinTiles = canvas.scene.tiles.filter(t => 
        t.flags?.["lockbox-simulator"]?.type === "pin_column" && 
        t.flags?.["lockbox-simulator"]?.pinId === (i + 1) &&
        t.flags?.["lockbox-simulator"]?.simulatorArea === true
      );
      
      for (const tile of pinTiles) {
        // Check if this pin is locked - if so, don't allow movement
        if (pinLockStates && pinLockStates[i]) {
          //console.log(`Pin ${i+1} is locked - skipping movement`);
          continue;
        }
        
        // Get encart information from tile flags
        const encartY = tile.flags["lockbox-simulator"].encartY || 525;
        const encartHeight = tile.flags["lockbox-simulator"].encartHeight || 200;
        const encartCenterY = tile.flags["lockbox-simulator"].encartCenterY || (encartY + encartHeight / 2);
        const targetY = tile.flags["lockbox-simulator"].targetY || (encartCenterY - 55); // Center minus half pin height (110/2 = 55)
        const pinHeight = 110;        // EXTREME POSITION ONLY LOGIC WITH POSITION PERSISTENCE
        // Only show pins when joystick is at extreme positions (cardinal directions)
        // Pin position reflects distance from target
        // Position persists when leaving extreme zone
        
        let yPosition;
        let newAlpha;
        let effectiveJoystickValue;
        
        // Enhanced extreme position detection with transition zone
        const extremeCheck = isAtExtremePosition(joystickValue);
        const isCurrentlyAtExtreme = extremeCheck.isExtreme;
        
        if (isCurrentlyAtExtreme) {
          // Currently at extreme position - use current value and update memory
          effectiveJoystickValue = joystickValue;
          lastValidExtremePositions[i] = joystickValue;
        } else if (lastValidExtremePositions[i] !== 512) {
          // Not at extreme but we have a memorized position - use it for persistence
          effectiveJoystickValue = lastValidExtremePositions[i];
        } else {
          // No extreme position and no memory - hide pin
          yPosition = targetY;
          newAlpha = 0.1; // Nearly invisible when never been to extreme
          effectiveJoystickValue = joystickValue; // Use current for compatibility
        }
          if (effectiveJoystickValue !== joystickValue || isCurrentlyAtExtreme || lastValidExtremePositions[i] !== 512) {
          // IMPROVED VISIBILITY LOGIC: Very visible only when lockable (extreme + target)
          const absoluteDistanceFromTarget = Math.abs(effectiveJoystickValue - targetValue);
          const isInTargetZone = absoluteDistanceFromTarget <= tolerance;
          const isLockable = isCurrentlyAtExtreme && isInTargetZone;
          
          if (isLockable) {
            // Pin is LOCKABLE (extreme position + in target) - MAXIMUM VISIBILITY
            yPosition = encartY + 20; // Top of the encart with small margin
            newAlpha = 1.0; // Fully visible when lockable
          } else if (isInTargetZone) {
            // In target but not at extreme - moderate visibility
            yPosition = encartY + 20; // Still at top
            newAlpha = 0.6; // Moderate visibility - shows target found but not lockable
          } else {
            // Not in target - calculate position based on distance
            // SIMPLIFIED: Target is always at the top, distance moves pin down
            const maxEffectiveDistance = 512; // Half of total range (0-1024)
            
            // Calculate downward movement based on distance from target
            const normalizedDistance = Math.min(absoluteDistanceFromTarget / maxEffectiveDistance, 1.0);
            const availableHeight = encartHeight - pinHeight - 40; // Space for movement
            const downwardOffset = normalizedDistance * availableHeight;
            
            // Position: start from top and move down based on distance
            yPosition = encartY + 20 + downwardOffset;
            
            // Ensure pin stays within bounds
            const maxY = encartY + encartHeight - pinHeight - 10;
            yPosition = Math.min(yPosition, maxY);
            
            // IMPROVED OPACITY: Lower visibility when not in target
            if (isCurrentlyAtExtreme) {
              // At extreme but not in target - low visibility
              newAlpha = 0.3; // Low visibility to show pin is active but not correctly positioned
            } else {
              // Using memorized position - very low visibility  
              newAlpha = 0.15; // Very low visibility for memorized positions
            }
          }
          
          // Apply transition zone intensity for smooth visual feedback when at extreme
          if (isCurrentlyAtExtreme && !isLockable) {
            newAlpha *= extremeCheck.intensity; // Apply transition zone multiplier for non-lockable positions
          }
        }
          const updateData = {
          alpha: newAlpha,
          y: yPosition
        };
        
        // IMPROVED: Reduced thresholds for smoother updates (was 0.1 and 1, now 0.05 and 0.5)
        if (Math.abs(tile.alpha - newAlpha) > 0.05 || Math.abs(tile.y - yPosition) > 0.5) {
          await tile.update(updateData);
        }
      }
    }
    
    // Check if all pins are set
    const allPinsSet = lockState.pins.every(pin => pin);
    if (allPinsSet) {
      //console.log(`Lockbox Simulator | 🔓 UNLOCKED! All pins are set correctly!`);
    } else {
      const setPins = lockState.pins.filter(pin => pin).length;
      //console.log(`Lockbox Simulator | 🔒 Locked - ${setPins}/3 pins set`);
    }
      debugLog(`Extreme positions relative to target: ${difficulty} difficulty, pins visible when joystick at cardinal directions`);
      } catch (error) {
    console.error("Lockbox Simulator | Error in updateJoystickVisuals (extreme positions relative to target):", error);
  }
};

// Pin lock text management function assignments
showPinLockText = function(pinId) {
  if (!canvas?.scene) return;
  
  try {
    // Find the pin tile to position the text below it
    const pinTile = canvas.scene.tiles.find(t => 
      t.flags?.["lockbox-simulator"]?.type === "pin_column" &&
      t.flags?.["lockbox-simulator"]?.pinId === pinId &&
      t.flags?.["lockbox-simulator"]?.simulatorArea === true
    );
    
    if (!pinTile) {
      console.warn(`Lockbox Simulator | Could not find pin tile ${pinId} for lock text`);
      return;
    }
    
    // Position text below the pin
    const textX = pinTile.x + (pinTile.width / 2); // Center horizontally
    const textY = pinTile.y + pinTile.height + 5; // Just below the pin
    
    // Create lock text drawing
    const lockTextData = {
      type: "text",
      x: textX,
      y: textY,
      width: 40,
      height: 20,
      text: "VERROUILLÉ",
      fontSize: 12,
      fontFamily: "Arial",
      textColor: "#00FF00", // Green for locked
      fillType: 1, // SOLID fill type
      fillColor: "#000000",
      fillAlpha: 0.8,
      strokeWidth: 1,
      strokeColor: "#00FF00",
      strokeAlpha: 1.0,
      rotation: 0,
      hidden: false,
      locked: false,
      flags: {
        "lockbox-simulator": {
          type: "pin_lock_text",
          pinId: pinId,
          isManagedDrawing: true
        }
      }
    };
    
    // Create the text drawing
    canvas.scene.createEmbeddedDocuments("Drawing", [lockTextData]);
    //console.log(`Lockbox Simulator | Created lock text for pin ${pinId}`);
    
  } catch (error) {
    console.error(`Lockbox Simulator | Error creating lock text for pin ${pinId}:`, error);
  }
};

hidePinLockText = function(pinId) {
  if (!canvas?.scene) return;
  
  try {
    // Find and delete the lock text for this pin
    const lockTexts = canvas.scene.drawings.filter(d => 
      d.flags?.["lockbox-simulator"]?.type === "pin_lock_text" &&
      d.flags?.["lockbox-simulator"]?.pinId === pinId
    );
    
    if (lockTexts.length > 0) {
      const idsToDelete = lockTexts.map(t => t.id);
      canvas.scene.deleteEmbeddedDocuments("Drawing", idsToDelete);
      //console.log(`Lockbox Simulator | Hidden lock text for pin ${pinId}`);
    }
  } catch (error) {
    console.error(`Lockbox Simulator | Error hiding lock text for pin ${pinId}:`, error);
  }
};

hideAllPinLockTexts = function() {
  if (!canvas?.scene) return;
  
  try {
    // Find all lock texts in the scene
    const lockTexts = canvas.scene.drawings.filter(d => 
      d.flags?.["lockbox-simulator"]?.type === "pin_lock_text"
    );
    
    if (lockTexts.length > 0) {
      const idsToDelete = lockTexts.map(t => t.id);
      canvas.scene.deleteEmbeddedDocuments("Drawing", idsToDelete);
      //console.log(`Lockbox Simulator | Hidden all pin lock texts (${lockTexts.length} texts)`);
    }
  } catch (error) {
    console.error(`Lockbox Simulator | Error hiding all lock texts:`, error);
  }
};

// WebSocket Connection
connectToWebSocketServer = function() {
  try {
    const wsUrl = `ws://${LOCKBOX_CONFIG.wsServer.host}:${LOCKBOX_CONFIG.wsServer.port}`;
    
    // Disconnect existing connection if any
    if (websocket && websocket.readyState !== WebSocket.CLOSED) {
      websocket.close();
    }
    
    // Create new connection
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      //console.log(`Lockbox Simulator | Connected to WebSocket server at ${wsUrl}`);
      websocketConnected = true;
      
      // Notify the UI
      ui.notifications.info("Lockbox Simulator: Connected to hardware");
    };
    
    websocket.onclose = (event) => {
      //console.log(`Lockbox Simulator | WebSocket connection closed (Code: ${event.code}, Reason: ${event.reason || "No reason provided"})`);
      websocketConnected = false;
      
      // Show notification to users
      ui.notifications.warn("Lockbox Simulator: Connection to hardware lost. Attempting to reconnect...");
      
      // Attempt to reconnect after a delay with exponential backoff
      let attempts = game.settings.get("lockbox-simulator", "reconnectAttempts") || 0;
      const maxDelay = Math.min(30000, 1000 * Math.pow(1.5, attempts));  // Cap at 30 seconds
      const delay = Math.min(5000 + (Math.random() * 1000), maxDelay);   // Add jitter
      
      //console.log(`Lockbox Simulator | Will attempt to reconnect in ${Math.floor(delay/1000)} seconds (attempt ${attempts + 1})`);
      
      // Update the attempt counter
      game.settings.set("lockbox-simulator", "reconnectAttempts", attempts + 1);
      
      setTimeout(connectToWebSocketServer, delay);
    };
    
    websocket.onerror = (error) => {
      console.error("Lockbox Simulator | WebSocket error:", error);
      ui.notifications.error("Lockbox Simulator: Connection error. Check the Arduino device and WebSocket server.");
    };
    
    websocket.onmessage = (event) => {
      try {
        // Reset reconnect attempts on successful message
        if (game.settings.get("lockbox-simulator", "reconnectAttempts") > 0) {
          game.settings.set("lockbox-simulator", "reconnectAttempts", 0);
        }
        
        // Make sure we have valid JSON data
        if (!event || !event.data) {
          console.error("Lockbox Simulator | Invalid WebSocket message received");
          return;
        }
        
        const data = JSON.parse(event.data);
        
        // Validate that the data is actually an object before processing
        if (data && typeof data === 'object') {
          processWebSocketMessage(data);
        } else {
          console.error("Lockbox Simulator | Invalid data format in WebSocket message");
        }
      } catch (error) {
        console.error("Lockbox Simulator | Error processing message:", error, event?.data);
      }
    };
    
  } catch (error) {
    console.error("Lockbox Simulator | Error connecting to WebSocket:", error);
    ui.notifications.error(`Lockbox Simulator: Failed to connect to WebSocket server (${error.message})`);
    
    // Attempt to reconnect after a short delay
    setTimeout(connectToWebSocketServer, 500);
  }
};

// Create lockbox scenes function
createLockboxScenes = async function() {
  try {
    //console.log("Lockbox Simulator | Creating lockbox scenes...");
    
    // Use the new version checking system instead of simple existence check
    await checkAndUpdateScenes();
    
  } catch (error) {
    console.error("Lockbox Simulator | Error in scene creation:", error);
  }
};

// Helper function to create tiles for a lockbox scene (with new asset layout)
async function createSceneTiles(scene, difficultyKey, difficultyData) {
  //console.log(`Lockbox Simulator | Creating scene with new assets: ${difficultyData.name}`);
  //console.log(`Lockbox Simulator | Scene dimensions: ${scene.width}x${scene.height}`);
  //console.log(`Lockbox Simulator | Difficulty: ${difficultyKey}`);
  
  try {
    const moduleId = "lockbox-simulator";
    const modulePath = `modules/${moduleId}`;
    
    // Use the new background image that contains both chest and simulation area
    const backgroundData = {
      texture: { src: `${modulePath}/assets/scene_1152x768.png` },
      width: scene.width,  // 1152
      height: scene.height, // 768
      x: 0,
      y: 0,
      alpha: 1.0,
      overhead: false,
      rotation: 0,
      hidden: false,
      locked: false,
      flags: {
        "lockbox-simulator": {
          type: "scene_background",
          difficulty: difficultyKey,
          isManagedTile: true
        }
      }
    };
    
    // Add tint if specified in difficulty config
    if (difficultyData.tint) {
      backgroundData.tint = difficultyData.tint;
      //console.log(`Lockbox Simulator | Applied tint to scene: ${difficultyData.tint}`);
    }
    
    try {
      const result = await scene.createEmbeddedDocuments("Tile", [backgroundData]);
      //console.log(`Lockbox Simulator | Successfully created scene background for: ${difficultyData.name}`);
      
      // Create the 3 pin column tiles in the simulation area
      await createPinColumnTiles(scene, difficultyKey, difficultyData);
      
      return result;
    } catch (error) {
      console.warn(`Lockbox Simulator | Failed to create background tile:`, error.message);
      
      // Still try to create pin columns even if background fails
      try {
        await createPinColumnTiles(scene, difficultyKey, difficultyData);
      } catch (pinError) {
        console.error(`Lockbox Simulator | Failed to create pin columns:`, pinError.message);
      }
    }
    
  } catch (error) {
    console.error(`Lockbox Simulator | Error creating scene tiles for ${difficultyData.name}:`, error);
    return null;
  }
}

// Helper function to create pin column tiles for lockpicking visualization
async function createPinColumnTiles(scene, difficultyKey, difficultyData) {
  //console.log(`Lockbox Simulator | Creating pin column tiles in simulation encart for: ${difficultyData.name}`);
  
  try {
    const moduleId = "lockbox-simulator";
    const modulePath = `modules/${moduleId}`;
      // Simulation encart configuration from the new asset
    // Encart: 635x200 positioned at 444,525 in the 1152x768 image
    // Ajustement pour un meilleur centrage des pins
    const encartX = 444;
    const encartY = 525;
    const encartWidth = 635;
    const encartHeight = 200;
    const encartCenterY = encartY + (encartHeight / 2); // 635 (525 + 100)
    
    // Pin configuration using the new pin asset (24x110)
    const pinWidth = 24;
    const pinHeight = 110;
    
    // Calculate positions for 3 pin columns within the simulation encart
    // Center the pins better within the encart with equal spacing
    const totalPinsWidth = pinWidth * 3;
    const spacingBetweenPins = (encartWidth - totalPinsWidth) / 4; // Equal spacing
    const firstPinX = encartX + spacingBetweenPins;
    const targetY = encartCenterY - (pinHeight / 2); // Center vertically in encart
    
    const pinColumnPositions = [
      { x: firstPinX, y: targetY, id: 1 },
      { x: firstPinX + pinWidth + spacingBetweenPins, y: targetY, id: 2 },
      { x: firstPinX + (pinWidth + spacingBetweenPins) * 2, y: targetY, id: 3 }
    ];
    
    const pinTilesToCreate = [];    
    for (const pos of pinColumnPositions) {
      const pinTileData = {
        texture: { src: `${modulePath}/assets/pin_24x110.png` },
        width: pinWidth,
        height: pinHeight,
        x: pos.x,
        y: pos.y,
        alpha: 0.8,
        overhead: false,
        rotation: 0,
        hidden: false,
        locked: false,
        flags: {
          "lockbox-simulator": {
            type: "pin_column",
            pinId: pos.id,
            difficulty: difficultyKey,
            isManagedTile: true,
            simulatorArea: true,
            // Store encart information for movement calculations
            encartX: encartX,
            encartY: encartY,
            encartWidth: encartWidth,
            encartHeight: encartHeight,
            encartCenterY: encartCenterY,
            targetY: targetY,
            baseY: pos.y
          }
        }
      };
      
      // Add different tints based on difficulty and pin position
      const pinTints = {
        easy: ["#00FF00", "#FFFF00", "#00FFFF"],    // Green, Yellow, Cyan
        medium: ["#FFD700", "#FFA500", "#FF6347"],  // Gold, Orange, Tomato
        hard: ["#FF8C00", "#FF4500", "#DC143C"],    // Dark Orange, Red Orange, Crimson
        master: ["#FF0000", "#8B0000", "#4B0000"]   // Red, Dark Red, Very Dark Red
      };
      
      if (pinTints[difficultyKey]) {
        pinTileData.tint = pinTints[difficultyKey][pos.id - 1];
      }
      
      pinTilesToCreate.push(pinTileData);
    }
    
    // Create all pin column tiles at once
    try {
      const result = await scene.createEmbeddedDocuments("Tile", pinTilesToCreate);
      //console.log(`Lockbox Simulator | Successfully created ${result.length} pin column tiles in simulation encart`);
      //console.log(`Lockbox Simulator | Encart position: ${encartX},${encartY} (${encartWidth}x${encartHeight})`);
      //console.log(`Lockbox Simulator | Pin target Y: ${targetY} (center of encart)`);
      return result;
    } catch (error) {
      console.warn(`Lockbox Simulator | Failed to create pin columns with new assets:`, error.message);
      //console.log("Lockbox Simulator | Trying fallback textures for pin columns...");
    }
    
  } catch (error) {
    console.error(`Lockbox Simulator | Error creating pin column tiles:`, error);
    return null;
  }
}

// Scene version management functions
function isSceneUpToDate(scene) {
  try {
    const sceneVersion = scene.flags?.["lockbox-simulator"]?.version;
    const currentVersion = LOCKBOX_CONFIG.sceneVersion;
    
    if (!sceneVersion) {
      //console.log(`Lockbox Simulator | Scene "${scene.name}" has no version flag - needs update`);
      return false;
    }
    
    if (sceneVersion !== currentVersion) {
      //console.log(`Lockbox Simulator | Scene "${scene.name}" version ${sceneVersion} != current ${currentVersion} - needs update`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Lockbox Simulator | Error checking scene version:`, error);
    return false;
  }
}

function hasRequiredTiles(scene) {
  try {
    const tiles = scene.tiles || new Collection();
    
    // Check for scene background tile (new single background)
    const sceneBackgroundTile = tiles.find(t => 
      t.flags?.["lockbox-simulator"]?.type === "scene_background"
    );
    
    // Check for pin column tiles in simulation encart
    const pinTiles = tiles.filter(t => 
      t.flags?.["lockbox-simulator"]?.type === "pin_column" &&
      t.flags?.["lockbox-simulator"]?.simulatorArea === true
    );
    
    const hasSceneBackground = !!sceneBackgroundTile;
    const hasAllPins = pinTiles.length === 3;
    
    if (!hasSceneBackground) {
      //console.log(`Lockbox Simulator | Scene "${scene.name}" missing scene background tile`);
    }
    
    if (!hasAllPins) {
      //console.log(`Lockbox Simulator | Scene "${scene.name}" has ${pinTiles.length}/3 pin tiles in simulation encart`);
    }
    
    return hasSceneBackground && hasAllPins;
  } catch (error) {
    console.error(`Lockbox Simulator | Error checking scene tiles:`, error);
    return false;
  }
}

async function checkAndUpdateScenes() {
  try {
    //console.log("Lockbox Simulator | Checking scene versions and integrity...");
    
    const lockboxScenes = game.scenes.filter(s => s.flags?.["lockbox-simulator"]?.isLockboxScene);
    
    if (lockboxScenes.length === 0) {
      //console.log("Lockbox Simulator | No lockbox scenes found - creating all scenes");
      // Create all scenes from scratch
      for (const [difficultyKey, difficultyData] of Object.entries(LOCK_DIFFICULTIES)) {
        try {
          const sceneData = {
            name: `Lockbox - ${difficultyData.name}`,
            width: 1152,
            height: 768,
            grid: {
              size: 100,
              type: 1
            },
            flags: {
              "lockbox-simulator": {
                difficulty: difficultyKey,
                isLockboxScene: true,
                version: LOCKBOX_CONFIG.sceneVersion,
                lastUpdated: Date.now()
              }
            }
          };
          
          const createdScene = await Scene.create(sceneData);
          //console.log(`Lockbox Simulator | Created scene: ${difficultyData.name}`);
          
          await createSceneTiles(createdScene, difficultyKey, difficultyData);
          
        } catch (error) {
          console.error(`Lockbox Simulator | Error creating scene for ${difficultyKey}:`, error);
        }
      }
      return;
    }
    
    const expectedScenes = Object.keys(LOCK_DIFFICULTIES);
    const existingDifficulties = lockboxScenes.map(s => s.flags["lockbox-simulator"].difficulty);
    
    // Check for missing difficulties
    const missingDifficulties = expectedScenes.filter(diff => !existingDifficulties.includes(diff));
    if (missingDifficulties.length > 0) {
      //console.log(`Lockbox Simulator | Missing scenes for difficulties: ${missingDifficulties.join(', ')}`);
    }
    
    // Check each existing scene
    const scenesToUpdate = [];
    const scenesToRecreate = [];
    
    for (const scene of lockboxScenes) {
      const isVersionCurrent = isSceneUpToDate(scene);
      const hasTiles = hasRequiredTiles(scene);
      
      if (!isVersionCurrent || !hasTiles) {
        if (!isVersionCurrent) {
          scenesToRecreate.push(scene);
        } else if (!hasTiles) {
          scenesToUpdate.push(scene);
        }
      }
    }
    
    // Update scenes that just need tiles
    for (const scene of scenesToUpdate) {
      try {
        const difficulty = scene.flags["lockbox-simulator"].difficulty;
        const difficultyData = LOCK_DIFFICULTIES[difficulty];
        
        await createSceneTiles(scene, difficulty, difficultyData);
        
        // Update version flag
        await scene.update({
          flags: {
            "lockbox-simulator": {
              ...scene.flags["lockbox-simulator"],
              version: LOCKBOX_CONFIG.sceneVersion,
              lastUpdated: Date.now()
            }
          }
        });
        
      } catch (error) {
        console.error(`Lockbox Simulator | Error updating scene ${scene.name}:`, error);
      }
    }
    
    // Recreate scenes that need major updates
    for (const scene of scenesToRecreate) {
      try {
        const difficulty = scene.flags["lockbox-simulator"].difficulty;
        const difficultyData = LOCK_DIFFICULTIES[difficulty];
        
        // Delete old scene
        await scene.delete();
          // Create new scene with new asset dimensions
        const sceneData = {
          name: `Lockbox - ${difficultyData.name}`,
          width: 1152,
          height: 768,
          grid: {
            size: 100,
            type: 1
          },
          flags: {
            "lockbox-simulator": {
              difficulty: difficulty,
              isLockboxScene: true,
              version: LOCKBOX_CONFIG.sceneVersion,
              lastUpdated: Date.now()
            }
          }
        };
        
        const newScene = await Scene.create(sceneData);
        await createSceneTiles(newScene, difficulty, difficultyData);
        
      } catch (error) {
        console.error(`Lockbox Simulator | Error recreating scene:`, error);
      }
    }
    
    // Create missing scenes
    if (missingDifficulties.length > 0) {
      for (const difficulty of missingDifficulties) {
        try {
          const difficultyData = LOCK_DIFFICULTIES[difficulty];
      
          
          const sceneData = {
            name: `Lockbox - ${difficultyData.name}`,
            width: 1920,
            height: 1080,
            grid: {
              size: 100,
              type: 1
            },
            flags: {
              "lockbox-simulator": {
                difficulty: difficulty,
                isLockboxScene: true,
                version: LOCKBOX_CONFIG.sceneVersion,
                lastUpdated: Date.now()
              }
            }
          };
          
          const newScene = await Scene.create(sceneData);
          await createSceneTiles(newScene, difficulty, difficultyData);
          
        } catch (error) {
          console.error(`Lockbox Simulator | Error creating missing scene for ${difficulty}:`, error);
        }
      }
    }
    
  } catch (error) {
    console.error("Lockbox Simulator | Error in checkAndUpdateScenes:", error);
  }
}

// Utility function to rebuild all lockbox scenes (useful for debugging)
async function rebuildLockboxScenes() {
  try {
    
    // Find and delete existing lockbox scenes
    const existingScenes = game.scenes.filter(s => s.flags?.["lockbox-simulator"]);
    if (existingScenes.length > 0) {
      for (const scene of existingScenes) {
        await scene.delete();
      }
    }
    
    // Create new scenes with current version
  
    for (const [difficultyKey, difficultyData] of Object.entries(LOCK_DIFFICULTIES)) {
      try {
        const sceneData = {
          name: `Lockbox - ${difficultyData.name}`,
          width: 1920,
          height: 1080,
          grid: {
            size: 100,
            type: 1
          },
          flags: {
            "lockbox-simulator": {
              difficulty: difficultyKey,
              isLockboxScene: true,
              version: LOCKBOX_CONFIG.sceneVersion,
              lastUpdated: Date.now(),
              forceRebuild: true
            }
          }
        };
        
        const createdScene = await Scene.create(sceneData);
        
        await createSceneTiles(createdScene, difficultyKey, difficultyData);
        
      } catch (error) {
        console.error(`Lockbox Simulator | Error creating fresh scene for ${difficultyKey}:`, error);
      }
    }
    
  } catch (error) {
    console.error("Lockbox Simulator | Error rebuilding scenes:", error);
  }
}

// Complete reset of all lockbox elements when entering/changing scenes
function completeSceneReset() {
  //console.log("Lockbox Simulator | Performing complete scene reset...");
  
  // Clear all timers
  for (let i = 0; i < 3; i++) {
    if (pinLockTimers[i]) {
      clearTimeout(pinLockTimers[i]);
      pinLockTimers[i] = null;
    }
  }
  
  // Reset all lock states
  lockState.pins = [false, false, false];
  pinLockStates = [false, false, false];
  pinInTargetStart = [null, null, null];
  lockState.unlocked = false;
  lockState.unlockTime = null;
  lockState.attemptStartTime = Date.now();
  lockState.activeAttempt = false; // Set to false on scene entry
  
  // Reset joystick states to neutral position
  if (joystickState) {
    joystickState.joystick1 = 0;
    joystickState.joystick2 = 0;
    joystickState.joystick3 = 0;
  }
  
  // Hide all lock texts
  hideAllPinLockTexts();
  
  // Turn off all LEDs
  if (websocketConnected) {
    sendLEDControl(0, 0, 0);
    //console.log("Lockbox Simulator | All LEDs turned off");
  }
    // Reset LED state tracking
  ledState.led1 = 0;
  ledState.led2 = 0;
  ledState.led3 = 0;
    // Reset previous joystick values to prevent pin jumping
  previousJoystickValues = {};
    // Reset last valid extreme positions for position persistence
  lastValidExtremePositions = [512, 512, 512];
  
  // Clear cached target positions to ensure fresh targets on next generation
  clearTargetPositionCache();
  
  //console.log("Lockbox Simulator | Complete scene reset finished");
}

// Reset lock state when starting a new attempt or changing scenes
function resetLockState() {
  // Clear all timers
  for (let i = 0; i < 3; i++) {
    if (pinLockTimers[i]) {
      clearTimeout(pinLockTimers[i]);
      pinLockTimers[i] = null;
    }
  }
  
  // Reset all lock states
  lockState.pins = [false, false, false];
  pinLockStates = [false, false, false];
  pinInTargetStart = [null, null, null];
  lockState.unlocked = false;
  lockState.unlockTime = null;
  lockState.attemptStartTime = Date.now();
  lockState.activeAttempt = true;
  
  // Hide all lock texts
  hideAllPinLockTexts();
  
  // Turn off all LEDs when resetting
  if (websocketConnected) {
    sendLEDControl(0, 0, 0);
  }
  
  //console.log("Lockbox Simulator | Lock state reset for new attempt");
}

// Expose functions globally for debugging and macro access
globalThis.LockboxSimulator = {
  rebuildScenes: rebuildLockboxScenes,
  createScenes: createLockboxScenes,
  checkScenes: checkAndUpdateScenes,
  debugLog: debugLog,
  getJoystickState: () => joystickState,
  getLedState: () => ledState,
  getLockState: () => lockState,
  getPinLockStates: () => pinLockStates,
  getPinInTargetStart: () => pinInTargetStart,
  getSceneVersion: () => LOCKBOX_CONFIG.sceneVersion,
  getModuleVersion: () => LOCKBOX_CONFIG.moduleVersion,  resetLockState: resetLockState,
  completeSceneReset: completeSceneReset,
  hideAllPinLockTexts: hideAllPinLockTexts,
  showPinLockText: showPinLockText,
  hidePinLockText: hidePinLockText,
  checkLockpickingProgress: checkLockpickingProgress,
  checkSceneStatus: function() {
    //console.log("=== Lockbox Scene Status Report ===");
    
    const lockboxScenes = game.scenes.filter(s => s.flags?.["lockbox-simulator"]?.isLockboxScene);
    const expectedDifficulties = Object.keys(LOCK_DIFFICULTIES);
    
    //console.log(`Expected scenes: ${expectedDifficulties.length}`);
    //console.log(`Found scenes: ${lockboxScenes.length}`);
    //console.log(`Current version: ${LOCKBOX_CONFIG.sceneVersion}`);
    
    for (const scene of lockboxScenes) {
      const version = scene.flags["lockbox-simulator"].version || "unknown";
      const difficulty = scene.flags["lockbox-simulator"].difficulty;
      const tiles = scene.tiles?.size || 0;
      const isUpToDate = isSceneUpToDate(scene);
      const hasTiles = hasRequiredTiles(scene);
      
      //console.log(`Scene: ${scene.name}`);
      //console.log(`  Difficulty: ${difficulty}`);
      //console.log(`  Version: ${version} ${isUpToDate ? '✓' : '❌'}`);
      //console.log(`  Tiles: ${tiles} ${hasTiles ? '✓' : '❌'}`);
      //console.log(`  Status: ${isUpToDate && hasTiles ? 'OK' : 'NEEDS UPDATE'}`);
    }
    
    const missingDifficulties = expectedDifficulties.filter(diff => 
      !lockboxScenes.some(s => s.flags["lockbox-simulator"].difficulty === diff)
    );
    
    if (missingDifficulties.length > 0) {
      //console.log(`Missing difficulties: ${missingDifficulties.join(', ')}`);
    }
    
    //console.log("=== End Status Report ===");
  }
};

// Register Hooks
Hooks.once("init", () => {
  //console.log("Lockbox Simulator | Initializing module");
  // Register module settings
  registerSettings();
});

// Handle any module compatibility issues
Hooks.once("ready", () => {
  // Start the WebSocket connection
  connectToWebSocketServer();

  // Create the lockbox scenes if they don't exist
  createLockboxScenes();
});

// Hook for when canvas is ready - complete reset for any scene
Hooks.on('canvasReady', () => {
  //console.log("Lockbox Simulator | Canvas ready - performing complete reset");
  completeSceneReset();
});

// Hook for scene activation - complete reset for lockbox scenes with delay for full loading
Hooks.on("activateScene", (scene, options) => {
  if (scene?.flags?.["lockbox-simulator"]?.isLockboxScene) {
    //console.log("Lockbox Simulator | Activated lockbox scene - performing complete reset");
    // Small delay to ensure scene is fully loaded before reset
    setTimeout(() => {
      completeSceneReset();
    }, 500);
  } else {
    // For non-lockbox scenes, just turn off LEDs and hide texts
    //console.log("Lockbox Simulator | Activated non-lockbox scene - minimal cleanup");
    hideAllPinLockTexts();
    if (websocketConnected) {
      sendLEDControl(0, 0, 0);
    }
  }
});

// End of file. All lockbox simulator functionality is complete.