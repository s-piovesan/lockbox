// Helper functions for joystick handling

// Helper function to normalize joystick value to x,y coordinates
function normalizeJoystickValue(value) {
    // Assuming the joystick value is 0-1023 range
    // Map joystick value to coordinates
    // This is a simplified approach - in real life, you'd map based on joystick behavior
    
    // For simplicity, set y to center (512) and use the received value as x
    return { 
        x: value,        // Use the received value directly for X
        y: 512           // Set Y to center (neutral position)
    };
}

// Update joystick display based on data
function updateJoystickDisplay(joysticks) {
    if (!joysticks) return;
    
    trackJoystickActivity();
    
    // Check if we have X,Y pairs
    if (joysticks.joystick1X !== undefined && joysticks.joystick1Y !== undefined) {
        // We have X,Y coordinates directly
        updateJoystick(0, joysticks.joystick1X, joysticks.joystick1Y);
        updateJoystick(1, joysticks.joystick2X, joysticks.joystick2Y);
        updateJoystick(2, joysticks.joystick3X, joysticks.joystick3Y);
    } 
    // Fallback to single value if X,Y pairs are not available
    else if (joysticks.joystick1 !== undefined) {
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
    
    // Calculate the combined value or use X as primary value
    // Using X value for display
    const value = x;
    
    // Track changes for highlighting
    const oldValue = parseInt(joystickValuesX[index].textContent || "0");
    const valueChanged = Math.abs(oldValue - value) > 5;
    
    // Update the value display with highlight effect if changed significantly
    joystickValuesX[index].textContent = value;
    if (valueChanged) {
        joystickValuesX[index].classList.add('value-change');
        setTimeout(() => {
            joystickValuesX[index].classList.remove('value-change');
        }, 500);
    }
    
    // Update Y value too if available
    joystickValuesY[index].textContent = y;
    
    // Calculate position for X and Y (Arduino analog values are 0-1023)
    // Map to a position within the joystick visual (-30px to +30px)
    const centerX = (x - 512) / 512 * 30; // Map to -30 to +30 pixels
    const centerY = (y - 512) / 512 * 30; // Map to -30 to +30 pixels
    
    // Apply the position to the joystick handle
    joystickHandles[index].style.transform = `translate(calc(-50% + ${centerX}px), calc(-50% + ${centerY}px))`;
    
    // Update the indicator bar - use X value for now
    // Map the value from 0-1023 to 0-100%
    const percentage = Math.min(100, Math.max(0, (value / 1023) * 100));
    joystickIndicators[index].style.width = `${percentage}%`;
    
    // Change the color based on value
    // Green for middle range, yellow for off center, red for extremes
    let color = '#4CAF50'; // Default green
    
    const distance = Math.abs(value - 512);
    if (distance > 400) {
        color = '#f44336'; // Red for extreme values
    } else if (distance > 200) {
        color = '#FFC107'; // Yellow for moderate offset
    }
    
    joystickIndicators[index].style.background = `linear-gradient(to right, ${color}, ${color})`;
    
    // Game logic - only process if game is active
    if (gameActive && index < difficulty) {
        // Determine which zone the joystick is in
        const zone = determineZone(value);
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
