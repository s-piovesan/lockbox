// Updated joystick handling functions for lockbox

// Helper function to normalize joystick value to x,y coordinates
function normalizeJoystickValue(value) {
    // For single-value joysticks (when we only have one value per joystick)
    // Convert to x,y coordinates for consistent handling
    return { 
        x: value,
        y: 512 // Center Y position
    };
}

// Update joystick display based on data from the server
function updateJoystickDisplay(joysticks) {
    if (!joysticks) return;
    
    trackJoystickActivity();
    
    // Check if we have X,Y pairs (new format)
    if (joysticks.joystick1X !== undefined && joysticks.joystick1Y !== undefined) {
        // We have X,Y coordinates directly
        console.log("Received X,Y format:", joysticks);
        updateJoystick(0, joysticks.joystick1X, joysticks.joystick1Y);
        updateJoystick(1, joysticks.joystick2X, joysticks.joystick2Y);
        updateJoystick(2, joysticks.joystick3X, joysticks.joystick3Y);
    } 
    // Fallback to single value if X,Y pairs are not available (old format)
    else if (joysticks.joystick1 !== undefined) {
        console.log("Received single value format:", joysticks);
        // Convert single values to X,Y pairs
        const j1 = normalizeJoystickValue(joysticks.joystick1);
        const j2 = normalizeJoystickValue(joysticks.joystick2);
        const j3 = normalizeJoystickValue(joysticks.joystick3);
        
        updateJoystick(0, j1.x, j1.y);
        updateJoystick(1, j2.x, j2.y);
        updateJoystick(2, j3.x, j3.y);
    }
}

// Update a single joystick's visual representation
function updateJoystick(index, x, y) {
    // If this joystick is locked, don't update its visual position
    if (joystickLocked[index]) return;
    
    // Update the X value display
    joystickValuesX[index].textContent = `X: ${x}`;
    
    // Update the Y value display
    joystickValuesY[index].textContent = `Y: ${y}`;
    
    // Calculate position for X and Y (Arduino analog values are 0-1023)
    // Map to a position within the joystick visual (-30px to +30px)
    const centerX = (x - 512) / 512 * 30; // Map to -30 to +30 pixels
    const centerY = (y - 512) / 512 * 30; // Map to -30 to +30 pixels
    
    // Apply the position to the joystick handle
    joystickHandles[index].style.transform = `translate(calc(-50% + ${centerX}px), calc(-50% + ${centerY}px))`;
    
    // Update the indicator bar - use X value for now
    // Map the value from 0-1023 to 0-100%
    const percentage = Math.min(100, Math.max(0, (x / 1023) * 100));
    joystickIndicators[index].style.width = `${percentage}%`;
    
    // Change the color based on value
    // Green for middle range, yellow for off center, red for extremes
    let color = '#4CAF50'; // Default green
    
    const distance = Math.abs(x - 512);
    if (distance > 400) {
        color = '#f44336'; // Red for extreme values
    } else if (distance > 200) {
        color = '#FFC107'; // Yellow for moderate offset
    }
    
    joystickIndicators[index].style.background = `linear-gradient(to right, ${color}, ${color})`;
    
    // Game logic - only process if game is active
    if (gameActive && index < difficulty) {
        // Determine which zone the joystick is in
        const zone = determineZone(x, y);
        currentZones[index] = zone;
        
        // Update zone visualization
        updateZoneVisualization(index, zone);
        
        // Check if this is the target zone
        if (zone === targetZones[index] && !joystickLocked[index]) {
            // Start or continue lock timer
            if (!lockTimers[index]) {
                lockTimers[index] = setTimeout(() => {
                    // Lock this joystick
                    joystickLocked[index] = true;
                    
                    // Update visuals
                    const joystickEl = document.querySelector(`.joystick:nth-child(${index+1}) .joystick-visual`);
                    joystickEl.classList.add('locked');
                    
                    // Mark the locked zone
                    const zoneEl = document.querySelector(`.joystick:nth-child(${index+1}) .zone-segment[data-zone="${zone}"]`);
                    if (zoneEl) {
                        zoneEl.classList.add('locked');
                    }
                    
                    addLogEntry(`Joystick ${index+1} locked in position ${zone}`);
                    
                    // Check if all required joysticks are locked
                    checkGameCompletion();
                    
                    // Clear the timer reference
                    lockTimers[index] = null;
                }, 500); // 500ms hold time for lock
            }
        } else {
            // Cancel lock timer if joystick moved away from target
            if (lockTimers[index]) {
                clearTimeout(lockTimers[index]);
                lockTimers[index] = null;
            }
        }
        
        // Update LEDs based on proximity to target
        updateLEDs();
    }
}

// Enhanced function to determine joystick zone using both X and Y coordinates
function determineZone(x, y) {
    // Arduino values are 0-1023, with center at 512
    // Convert to -1 to 1 range
    const normalizedX = (x - 512) / 512;
    const normalizedY = (y - 512) / 512;
    
    // Calculate distance from center
    const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    
    // If joystick is near center, return empty zone
    if (distance < 0.2) {
        return '';
    }
    
    // Calculate angle in radians and convert to degrees
    const angle = Math.atan2(-normalizedY, normalizedX) * (180 / Math.PI);
    
    // Normalize angle to 0-360
    const normalizedAngle = angle < 0 ? 360 + angle : angle;
    
    // Determine zone based on angle
    if (normalizedAngle >= 337.5 || normalizedAngle < 22.5) return 'E';
    if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) return 'NE';
    if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) return 'N';
    if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) return 'NW';
    if (normalizedAngle >= 157.5 && normalizedAngle < 202.5) return 'W';
    if (normalizedAngle >= 202.5 && normalizedAngle < 247.5) return 'SW';
    if (normalizedAngle >= 247.5 && normalizedAngle < 292.5) return 'S';
    if (normalizedAngle >= 292.5 && normalizedAngle < 337.5) return 'SE';
    
    return ''; // Fallback
}

// Function to send current LED values to the server
function sendLEDValues() {
    sendMessage({
        type: 'led_control',
        leds: {
            led1: parseInt(ledControls[0].value),
            led2: parseInt(ledControls[1].value),
            led3: parseInt(ledControls[2].value)
        }
    });
}

// Fixed WebSocket activity function
function trackWebSocketActivity() {
    if (websocketDot) {
        wsActivityTimeout = showActivity(websocketDot, wsActivityTimeout);
    } else {
        console.error("websocketDot element not found");
    }
}
