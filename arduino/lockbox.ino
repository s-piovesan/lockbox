/*
 * Lockbox Controller for RPG
 * 
 * This Arduino sketch:
 * - Reads analog values from 3 joysticks (each with X and Y axes)
 * - Controls 3 LEDs with PWM (to show intensity)
 * - Communicates with a PC via Serial connection
 */

// Pin definitions for joysticks (analog inputs)
// Each joystick has X and Y axis
const int JOYSTICK_1_X_PIN = A0;
const int JOYSTICK_1_Y_PIN = A1;
const int JOYSTICK_2_X_PIN = A2;
const int JOYSTICK_2_Y_PIN = A3;
const int JOYSTICK_3_X_PIN = A4;
const int JOYSTICK_3_Y_PIN = A5;

// Pin definitions for LEDs (PWM outputs)
const int LED_1_PIN = 3;  // Must be PWM pin
const int LED_2_PIN = 5;  // Must be PWM pin
const int LED_3_PIN = 6;  // Must be PWM pin

// Variables to store joystick values
int joystick1X = 0;
int joystick1Y = 0;
int joystick2X = 0;
int joystick2Y = 0;
int joystick3X = 0;
int joystick3Y = 0;

// Variables to store LED intensity values
int led1Intensity = 0;
int led2Intensity = 0;
int led3Intensity = 0;

// Communication protocol constants
const char START_MARKER = '<';
const char END_MARKER = '>';
const char SEPARATOR = ',';

// Buffer for incoming data
const int MAX_MESSAGE_LENGTH = 32;
char receivedChars[MAX_MESSAGE_LENGTH];
boolean newDataReceived = false;

void setup() {
  // Initialize serial communication
  Serial.begin(9600);
  
  // Configure LED pins as outputs
  pinMode(LED_1_PIN, OUTPUT);
  pinMode(LED_2_PIN, OUTPUT);
  pinMode(LED_3_PIN, OUTPUT);
  
  // Flash LEDs to indicate startup
  testLEDs();
  
  Serial.println("Lockbox controller initialized");
}

void loop() {
  // Read joystick values
  readJoysticks();
  
  // Send joystick data to PC
  sendJoystickData();
  
  // Check for incoming LED control commands
  receiveData();
  
  // Process new data if available
  if (newDataReceived) {
    parseLEDCommand();
    newDataReceived = false;
  }
  
  // Update LED outputs
  updateLEDs();
  
  // Small delay to prevent flooding the serial connection
  delay(50);
}

void readJoysticks() {
  // Read analog values from joysticks (0-1023)
  // Each joystick has X and Y axis
  joystick1X = analogRead(JOYSTICK_1_X_PIN);
  joystick1Y = analogRead(JOYSTICK_1_Y_PIN);
  joystick2X = analogRead(JOYSTICK_2_X_PIN);
  joystick2Y = analogRead(JOYSTICK_2_Y_PIN);
  joystick3X = analogRead(JOYSTICK_3_X_PIN);
  joystick3Y = analogRead(JOYSTICK_3_Y_PIN);
}

void sendJoystickData() {
  // Format: <J1X,J1Y,J2X,J2Y,J3X,J3Y>
  Serial.print(START_MARKER);
  Serial.print("J");
  Serial.print(joystick1X);
  Serial.print(SEPARATOR);
  Serial.print(joystick1Y);
  Serial.print(SEPARATOR);
  Serial.print(joystick2X);
  Serial.print(SEPARATOR);
  Serial.print(joystick2Y);
  Serial.print(SEPARATOR);
  Serial.print(joystick3X);
  Serial.print(SEPARATOR);
  Serial.print(joystick3Y);
  Serial.println(END_MARKER);
}

void receiveData() {
  static boolean receivingInProgress = false;
  static int charIndex = 0;
  char receivedChar;
  
  while (Serial.available() > 0 && !newDataReceived) {
    receivedChar = Serial.read();
    
    if (receivingInProgress) {
      if (receivedChar != END_MARKER) {
        receivedChars[charIndex] = receivedChar;
        charIndex++;
        if (charIndex >= MAX_MESSAGE_LENGTH) {
          charIndex = MAX_MESSAGE_LENGTH - 1;
        }
      } else {
        receivedChars[charIndex] = '\0'; // Terminate the string
        receivingInProgress = false;
        charIndex = 0;
        newDataReceived = true;
      }
    } else if (receivedChar == START_MARKER) {
      receivingInProgress = true;
    }
  }
}

void parseLEDCommand() {
  // Expected format: L100,150,200
  // L followed by three intensity values (0-255) separated by commas
  
  if (receivedChars[0] == 'L') {
    // Skip the 'L' character and parse the three values
    char* valueStr = receivedChars + 1; // Skip 'L'
    
    // Parse first LED value
    led1Intensity = atoi(valueStr);
    
    // Find the first separator
    char* separator = strchr(valueStr, SEPARATOR);
    if (separator != NULL) {
      // Parse second LED value
      led2Intensity = atoi(separator + 1);
      
      // Find the second separator
      separator = strchr(separator + 1, SEPARATOR);
      if (separator != NULL) {
        // Parse third LED value
        led3Intensity = atoi(separator + 1);
      }
    }
    
    // Constrain values to valid PWM range (0-255)
    led1Intensity = constrain(led1Intensity, 0, 255);
    led2Intensity = constrain(led2Intensity, 0, 255);
    led3Intensity = constrain(led3Intensity, 0, 255);
  }
}

void updateLEDs() {
  // Write the intensity values to the LEDs using PWM
  analogWrite(LED_1_PIN, led1Intensity);
  analogWrite(LED_2_PIN, led2Intensity);
  analogWrite(LED_3_PIN, led3Intensity);
}

void testLEDs() {
  // Flash each LED in sequence to verify they're working
  for (int i = 0; i < 3; i++) {
    analogWrite(LED_1_PIN, i == 0 ? 255 : 0);
    analogWrite(LED_2_PIN, i == 1 ? 255 : 0);
    analogWrite(LED_3_PIN, i == 2 ? 255 : 0);
    delay(300);
  }
  
  // Turn all LEDs off
  analogWrite(LED_1_PIN, 0);
  analogWrite(LED_2_PIN, 0);
  analogWrite(LED_3_PIN, 0);
}
