from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional
import json
import datetime
import random
import asyncio
import os
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

app = FastAPI()

# --- Database Config ---
# Local: mongodb://localhost:27017
# Production: Set MONGODB_URL in environment
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGODB_URL)
db = client.rts_game
users_collection = db.users

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount assets
base_dir = os.path.dirname(os.path.abspath(__file__))
assets_dir = os.path.join(base_dir, "assets")
if not os.path.exists(assets_dir):
    os.makedirs(assets_dir, exist_ok=True)
app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# --- Auth Helper ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

class UserRegistration(BaseModel):
    username: str
    password: str

@app.post("/register")
async def register(user: UserRegistration):
    existing = await users_collection.find_one({"username": user.username})
    if existing:
        return {"success": False, "message": "มีชื่อผู้ใช้นี้อยู่แล้ว"}
    
    hashed = hash_password(user.password)
    new_user = {
        "username": user.username,
        "password": hashed,
        "created_at": datetime.datetime.now().isoformat(),
        "game_data": {
            "gold": 1000, "wood": 1000, "food": 1000,
            "has_castle": False, "gatherer_count": 0,
            "blocks_created_today": 0, "last_reset": datetime.date.today().isoformat()
        }
    }
    await users_collection.insert_one(new_user)
    return {"success": True, "message": "ลงทะเบียนสำเร็จ"}

@app.post("/login")
async def login(user: UserRegistration):
    user_data = await users_collection.find_one({"username": user.username})
    if user_data and verify_password(user.password, user_data["password"]):
        return {"success": True, "username": user.username}
    return {"success": False, "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"}

class Tile:
    def __init__(self, type: str = "empty", owner: str = None):
        self.type = type
        self.owner = owner
        self.hp = 500 if type == "castle" else (200 if type in ["tower", "barracks"] else 100)
        self.max_hp = self.hp
        self.last_attack_time = 0

class Unit:
    def __init__(self, id: str, type: str, x: float, y: float, owner: str):
        self.id = id
        self.type = type
        self.x = x
        self.y = y
        self.owner = owner
        self.target_x = x
        self.target_y = y
        self.speed = 20.0
        self.hp = 100
        self.max_hp = 100
        self.attack = 10
        self.range = 30

    def to_dict(self):
        return {
            "id": self.id, "type": self.type, "x": self.x, "y": self.y,
            "owner": self.owner, "hp": self.hp, "max_hp": self.max_hp,
            "attack": self.attack, "range": self.range
        }

class Block:
    def __init__(self, x: int, y: int, owner: str = None):
        self.x = x
        self.y = y
        self.owner = owner
        self.tiles = [[Tile() for _ in range(30)] for _ in range(30)]
        self.generate_terrain()

    def generate_terrain(self):
        if random.random() < 0.3:
            is_horizontal = random.choice([True, False])
            pos = random.randint(5, 25)
            for i in range(30):
                if is_horizontal: self.tiles[pos][i].type = "river"
                else: self.tiles[i][pos].type = "river"

    def spawn_resources(self):
        for _ in range(5):
            tx, ty = random.randint(0, 29), random.randint(0, 29)
            if self.tiles[ty][tx].type == "empty":
                self.tiles[ty][tx].type = random.choice(["resource_gold", "resource_wood", "resource_food"])

    def to_dict(self):
        return {
            "x": self.x, "y": self.y, "owner": self.owner,
            "tiles": [[{"type": t.type, "owner": t.owner, "hp": t.hp, "max_hp": t.max_hp} for t in row] for row in self.tiles]
        }

class World:
    def __init__(self):
        self.blocks: Dict[str, Block] = {}
        self.units: Dict[str, Unit] = {}
        self.temp_player_data: Dict[str, dict] = {} # For guests
        self.reset_world()

    def reset_world(self):
        self.blocks = {}
        self.units = {}
        self.add_block(0, 0, "neutral")
        self.add_block(1, 0, "neutral")

    async def get_player_data(self, player_id: str):
        user_data = await users_collection.find_one({"username": player_id})
        if user_data and "game_data" in user_data:
            today = datetime.date.today().isoformat()
            game_data = user_data["game_data"]
            if game_data.get("last_reset") != today:
                game_data["blocks_created_today"] = 0
                game_data["last_reset"] = today
                await self.save_player_data(player_id, game_data)
            return game_data
        
        if player_id not in self.temp_player_data:
            self.temp_player_data[player_id] = {
                "blocks_created_today": 0, "last_reset": datetime.date.today().isoformat(),
                "gold": 1000, "wood": 1000, "food": 1000, "has_castle": False, "gatherer_count": 0
            }
        return self.temp_player_data[player_id]

    async def save_player_data(self, player_id: str, game_data: dict):
        user_data = await users_collection.find_one({"username": player_id})
        if user_data:
            await users_collection.update_one({"username": player_id}, {"$set": {"game_data": game_data}})
        else:
            self.temp_player_data[player_id] = game_data

    def add_block(self, x: int, y: int, owner: str, is_free: bool = False):
        key = f"{x},{y}"
        if key not in self.blocks:
            # Note: add_block logic for resources still uses sync for simplicity in this prototype
            new_block = Block(x, y, owner if owner != "neutral" else None)
            new_block.spawn_resources()
            self.blocks[key] = new_block
            return True, None
        return False, "พื้นที่นี้ถูกสำรวจไปแล้ว"

    def get_world_data(self):
        return {
            "blocks": [b.to_dict() for b in self.blocks.values()],
            "units": [u.to_dict() for u in self.units.values()]
        }

world = World()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, player_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[player_id] = websocket

    def disconnect(self, player_id: str):
        if player_id in self.active_connections: del self.active_connections[player_id]

    async def broadcast(self, message: str):
        for connection in list(self.active_connections.values()):
            try: await connection.send_text(message)
            except: pass

    async def send_personal(self, player_id: str, message: str):
        if player_id in self.active_connections: await self.active_connections[player_id].send_text(message)

manager = ConnectionManager()

async def game_loop():
    while True:
        await asyncio.sleep(0.5)
        unit_update_needed = False
        changed_tiles = []
        
        # Movement & Simple Combat
        for unit in list(world.units.values()):
            if unit.x != unit.target_x or unit.y != unit.target_y:
                dx, dy = unit.target_x - unit.x, unit.target_y - unit.y
                dist = (dx**2 + dy**2)**0.5
                if dist <= unit.speed: unit.x, unit.y = unit.target_x, unit.target_y
                else:
                    unit.x += (dx / dist) * unit.speed
                    unit.y += (dy / dist) * unit.speed
                unit_update_needed = True

        if unit_update_needed:
            await manager.broadcast(json.dumps({"type": "UNIT_UPDATE", "units": [u.to_dict() for u in world.units.values()]}))

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(game_loop())

@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await manager.connect(player_id, websocket)
    player_data = await world.get_player_data(player_id)
    
    await manager.send_personal(player_id, json.dumps({
        "type": "INIT", "data": world.get_world_data(), "player_data": player_data
    }))

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            p_data = await world.get_player_data(player_id)

            if message["type"] == "BUILD":
                bx, by, tx, ty, b_type = message["bx"], message["by"], message["tx"], message["ty"], message["building_type"]
                costs = {"castle": {"gold": 400, "wood": 400, "food": 200}, "tower": {"gold": 200, "wood": 150, "food": 50}, "barracks": {"gold": 150, "wood": 200, "food": 100}, "archery_range": {"gold": 200, "wood": 250, "food": 100}}
                cost = costs.get(b_type)
                if p_data["gold"] >= cost["gold"] and p_data["wood"] >= cost["wood"] and p_data["food"] >= cost["food"]:
                    key = f"{bx},{by}"
                    if key in world.blocks:
                        block = world.blocks[key]
                        tile = block.tiles[ty][tx]
                        if tile.type == "empty":
                            tile.type, tile.owner = b_type, player_id
                            if b_type == "castle": p_data["has_castle"] = True
                            p_data["gold"] -= cost["gold"]; p_data["wood"] -= cost["wood"]; p_data["food"] -= cost["food"]
                            await world.save_player_data(player_id, p_data)
                            await manager.broadcast(json.dumps({"type": "INIT", "data": world.get_world_data()}))
                            await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))

            elif message["type"] == "PRODUCE_GATHERER":
                bx, by, tx, ty = message["bx"], message["by"], message["tx"], message["ty"]
                cost = {"wood": 50, "food": 50} if p_data["gatherer_count"] > 0 else {"wood": 0, "food": 0}
                if p_data["wood"] >= cost["wood"] and p_data["food"] >= cost["food"]:
                    p_data["wood"] -= cost["wood"]; p_data["food"] -= cost["food"]
                    p_data["gatherer_count"] += 1
                    await world.save_player_data(player_id, p_data)
                    unit_id = f"g_{random.randint(0, 1000000)}"
                    world.units[unit_id] = Unit(unit_id, "gatherer", (bx * 600) + (tx * 20), (by * 600) + (ty * 20) + 20, player_id)
                    await manager.broadcast(json.dumps({"type": "UNIT_UPDATE", "units": [u.to_dict() for u in world.units.values()]}))
                    await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))

            elif message["type"] == "MOVE_UNITS":
                unit_ids, tx, ty = message["unit_ids"], message["x"], message["y"]
                for idx, uid in enumerate(unit_ids):
                    if uid in world.units and world.units[uid].owner == player_id:
                        world.units[uid].target_x, world.units[uid].target_y = tx + (idx % 3) * 20, ty + (idx // 3) * 20

    except WebSocketDisconnect:
        manager.disconnect(player_id)
