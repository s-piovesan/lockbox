import asyncio
import threading
import time
import json
import serial
from flask import Flask, render_template, request, jsonify
import websockets

# === Arduino Setup ===
arduino_port = 'COM3'
baudrate = 9600
try:
    arduino = serial.Serial(arduino_port, baudrate, timeout=1)
    print(f"[OK] Arduino connecté sur {arduino_port}")
except Exception as e:
    arduino = None
    print("[ERREUR] Arduino non connecté :", e)

# === Game Logic ===
TOLERANCE = 120
HOLD_TIME_MS = 500
difficulty = 3
victory = False

class JoystickState:
    def __init__(self):
        self.position = (0, 0)
        self.target = (0, 0)
        self.locked = False
        self.hold_start = None
        self.intensity = 0

joysticks = [JoystickState() for _ in range(3)]
DIRECTIONS = [
    (0, 0), (512, 0), (1023, 0), (0, 512),
    (1023, 512), (0, 1023), (512, 1023), (1023, 1023)
]

def generate_targets():
    global victory
    victory = False
    chosen = DIRECTIONS[:]
    random.shuffle(chosen)
    for i in range(difficulty):
        joysticks[i].target = chosen[i]
        joysticks[i].locked = False
        joysticks[i].hold_start = None

def compute_intensity(dist):
    if dist <= TOLERANCE:
        return 255
    elif dist <= TOLERANCE * 4:
        return int(255 * (1 - (dist - TOLERANCE) / (TOLERANCE * 3)))
    else:
        return 0

def send_to_arduino(message):
    if arduino and arduino.is_open:
        try:
            arduino.write((message + "\n").encode())
        except Exception as e:
            print("[ERREUR ENVOI ARDUINO]", e)

# === Flask Server ===
app = Flask(__name__)

@app.route("/status")
def status():
    return jsonify({
        "joysticks": [j.locked for j in joysticks],
        "positions": [j.position for j in joysticks],
        "targets": [j.target for j in joysticks],
        "victory": victory,
        "intensities": [j.intensity for j in joysticks]
    })

@app.route("/reset")
def reset():
    generate_targets()
    send_to_arduino("LED:0,0,0")
    return jsonify({"status": "reset"})

@app.route("/serrure")
def serrure():
    global difficulty
    d = request.args.get("d", default=3, type=int)
    if 1 <= d <= 3:
        difficulty = d
    generate_targets()
    return render_template("serrure.html")

@app.route("/confirm", methods=["POST"])
def confirm():
    print("✅ Victoire confirmée côté client")
    return jsonify({"ack": True})

# === WebSocket Server ===
connected_clients = set()

async def ws_handler(websocket, path):
    print("🟢 Client WS connecté")
    connected_clients.add(websocket)
    try:
        async for msg in websocket:
            data = json.loads(msg)
            event = data.get("event")
            payload = data.get("payload", {})

            if event == "reset":
                generate_targets()
                send_to_arduino("RESET")
            elif event == "proximity":
                i = payload.get("index", 0)
                v = payload.get("value", 0)
                send_to_arduino(f"PROX:{i},{v}")
            elif event == "unlock":
                i = payload.get("index", 0)
                send_to_arduino(f"UNLOCK:{i}")
            elif event == "victory":
                send_to_arduino("VICTORY")

    except websockets.exceptions.ConnectionClosed:
        print("🔴 Déconnexion WebSocket")
    finally:
        connected_clients.remove(websocket)

def run_ws():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    start = websockets.serve(ws_handler, "localhost", 8765)
    loop.run_until_complete(start)
    loop.run_forever()

# === Lancement Serveurs ===
if __name__ == "__main__":
    print("🚀 Lancement du serveur unifié Flask + WebSocket")
    threading.Thread(target=run_ws, daemon=True).start()
    app.run(debug=False, use_reloader=False)
