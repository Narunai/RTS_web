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

app = FastAPI()

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

# Ensure assets directory exists to avoid crash
if not os.path.exists(assets_dir):
    print(f"Warning: Assets directory not found at {assets_dir}. Creating empty dir.")
    os.makedirs(assets_dir, exist_ok=True)

app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# --- Auth ---
users_db = {}
active_sessions = {}

class UserRegistration(BaseModel):
    username: str
    password: str

@app.post("/register")
async def register(user: UserRegistration):
    if user.username in users_db:
        return {"success": False, "message": "Username already exists"}
    users_db[user.username] = user.password
    return {"success": True, "message": "User registered successfully"}

@app.post("/login")
async def login(user: UserRegistration):
    if user.username in users_db and users_db[user.username] == user.password:
        active_sessions[user.username] = True
        return {"success": True, "username": user.username}
    return {"success": False, "message": "Invalid username or password"}

@app.post("/logout")
async def logout(username: str):
    if username in active_sessions:
        del active_sessions[username]
    return {"success": True}


class Tile:
    def __init__(self, type: str = "empty", owner: str = None):
        self.type = type # empty, resource_gold, resource_wood, resource_food, castle, tower, barracks, river
        self.owner = owner
        self.hp = 500 if type == "castle" else (200 if type in ["tower", "barracks"] else 100)
        self.max_hp = self.hp
        self.last_attack_time = 0 # Timestamp of last shot

class Unit:
    def __init__(self, id: str, type: str, x: float, y: float, owner: str):
        self.id = id
        self.type = type # soldier, gatherer
        self.x = x # World pixels (grid-snapped)
        self.y = y
        self.owner = owner
        self.target_x = x
        self.target_y = y
        self.speed = 20.0 # Move 1 tile (20px) per update
        self.hp = 100
        self.max_hp = 100
        self.attack = 10
        self.range = 30 # Attack range in pixels

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "x": self.x,
            "y": self.y,
            "owner": self.owner,
            "hp": self.hp,
            "max_hp": self.max_hp,
            "attack": self.attack,
            "range": self.range
        }

class Block:
    def __init__(self, x: int, y: int, owner: str = None):
        self.x = x
        self.y = y
        self.size = 30
        self.owner = owner
        self.tiles = [[Tile() for _ in range(30)] for _ in range(30)]
        self.generate_terrain()

    def generate_terrain(self):
        if random.random() < 0.3:
            is_horizontal = random.choice([True, False])
            pos = random.randint(5, 25)
            for i in range(30):
                if is_horizontal:
                    self.tiles[pos][i].type = "river"
                else:
                    self.tiles[i][pos].type = "river"

    def spawn_resources(self):
        for _ in range(5):
            tx, ty = random.randint(0, 29), random.randint(0, 29)
            if self.tiles[ty][tx].type == "empty":
                self.tiles[ty][tx].type = random.choice(["resource_gold", "resource_wood", "resource_food"])

    def to_dict(self):
        return {
            "x": self.x,
            "y": self.y,
            "owner": self.owner,
            "tiles": [[{"type": t.type, "owner": t.owner, "hp": t.hp, "max_hp": t.max_hp} for t in row] for row in self.tiles]
        }

class World:
    def __init__(self):
        self.blocks: Dict[str, Block] = {}
        self.units: Dict[str, Unit] = {}
        self.players: Dict[str, dict] = {}
        self.reset_world()

    def reset_world(self):
        self.blocks = {}
        self.units = {}
        # Reset all player data
        for player_id in self.players:
            self.players[player_id] = {
                "blocks_created_today": 0, 
                "last_reset": datetime.date.today().isoformat(),
                "gold": 1000, "wood": 1000, "food": 1000,
                "has_castle": False,
                "gatherer_count": 0
            }
        self.add_block(0, 0, "neutral")
        self.add_block(1, 0, "neutral")

    def is_block_occupied(self, bx: int, by: int):
        # A block is occupied if it has units or buildings
        for unit in self.units.values():
            if int(unit.x // (30 * 20)) == bx and int(unit.y // (30 * 20)) == by:
                return True
        key = f"{bx},{by}"
        if key in self.blocks:
            block = self.blocks[key]
            for row in block.tiles:
                for tile in row:
                    if tile.type not in ["empty", "river", "resource_gold", "resource_wood", "resource_food"]:
                        return True
        return False

    def add_block(self, x: int, y: int, owner: str, is_free: bool = False):
        key = f"{x},{y}"
        if key not in self.blocks:
            player_data = self.get_player_data(owner)
            if owner != "neutral" and not is_free:
                # Explore Cost: G:200, W:200, F:100
                cost = {"gold": 200, "wood": 200, "food": 100}
                if player_data["gold"] < cost["gold"] or player_data["wood"] < cost["wood"] or player_data["food"] < cost["food"]:
                    print(f"Explore failed for {owner}: Not enough resources")
                    return False, f"ทรัพยากรไม่พอสำหรับการสำรวจ (ต้องการ G:{cost['gold']}, W:{cost['wood']}, F:{cost['food']})"
                
                if player_data["blocks_created_today"] >= 3:
                    print(f"Explore failed for {owner}: Daily limit reached (3)")
                    return False, "สิทธิ์สร้างบล็อกต่อวันหมดแล้ว (จำกัด 3 บล็อก/วัน)"
                
                player_data["gold"] -= cost["gold"]
                player_data["wood"] -= cost["wood"]
                player_data["food"] -= cost["food"]
                player_data["blocks_created_today"] += 1
                print(f"Explore success for {owner}: Created block {x},{y}")
            
            new_block = Block(x, y, owner if owner != "neutral" else None)
            new_block.spawn_resources()
            self.blocks[key] = new_block
            return True, None
        return False, "พื้นที่นี้ถูกสำรวจไปแล้ว"

    def get_player_data(self, player_id: str):
        today = datetime.date.today().isoformat()
        if player_id not in self.players:
            self.players[player_id] = {
                "blocks_created_today": 0, 
                "last_reset": today,
                "gold": 1000, "wood": 1000, "food": 1000,
                "has_castle": False,
                "gatherer_count": 0
            }
        
        if self.players[player_id]["last_reset"] != today:
            self.players[player_id]["blocks_created_today"] = 0
            self.players[player_id]["last_reset"] = today
            
        return self.players[player_id]

    def get_world_data(self):
        return {
            "blocks": [b.to_dict() for b in self.blocks.values()],
            "units": [u.to_dict() for u in self.units.values()]
        }

world = World()

# --- WebSocket Management ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, player_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[player_id] = websocket

    def disconnect(self, player_id: str):
        if player_id in self.active_connections:
            del self.active_connections[player_id]

    async def broadcast(self, message: str):
        for connection in list(self.active_connections.values()):
            try:
                await connection.send_text(message)
            except:
                pass

    async def send_personal(self, player_id: str, message: str):
        if player_id in self.active_connections:
            await self.active_connections[player_id].send_text(message)

manager = ConnectionManager()

# Periodic tasks
async def resource_spawner():
    while True:
        await asyncio.sleep(300)
        for block in world.blocks.values():
            block.spawn_resources()
        await manager.broadcast(json.dumps({"type": "INIT", "data": world.get_world_data()}))

async def game_loop():
    while True:
        await asyncio.sleep(0.5) # Process movement and combat every 500ms
        unit_update_needed = False
        tile_update_needed = False
        
        # Unit Movement
        for unit in list(world.units.values()):
            if unit.x != unit.target_x or unit.y != unit.target_y:
                dx = unit.target_x - unit.x
                dy = unit.target_y - unit.y
                dist = (dx**2 + dy**2)**0.5
                
                if dist <= unit.speed:
                    next_x, next_y = unit.target_x, unit.target_y
                else:
                    ratio = unit.speed / dist
                    next_x = unit.x + dx * ratio
                    next_y = unit.y + dy * ratio
                
                # Exploration boundary check & River collision
                b_x = int(next_x // (30 * 20))
                b_y = int(next_y // (30 * 20))
                t_x = int((next_x % (30 * 20)) // 20)
                t_y = int((next_y % (30 * 20)) // 20)
                key = f"{b_x},{b_y}"
                
                can_move = True
                if key not in world.blocks:
                    # Cannot move to unexplored block
                    can_move = False
                    unit.target_x, unit.target_y = unit.x, unit.y
                elif world.blocks[key].tiles[t_y][t_x].type == "river":
                    can_move = False
                    unit.target_x, unit.target_y = unit.x, unit.y
                
                if can_move:
                    unit.x, unit.y = next_x, next_y
                    unit_update_needed = True

        # Combat & Gathering Logic
        changed_tiles = []
        
        # 1. Building Attack Logic (Towers/Castles)
        import time
        current_time = datetime.datetime.now().timestamp()
        for key, block in world.blocks.items():
            bx, by = map(int, key.split(","))
            for ty in range(30):
                for tx in range(30):
                    tile = block.tiles[ty][tx]
                    if tile.owner and tile.type in ["tower", "castle"]:
                        fire_rate = 1.0 if tile.type == "tower" else 2.0
                        if current_time - tile.last_attack_time >= fire_rate:
                            tile_x = (bx * 30 * 20) + (tx * 20) + 10
                            tile_y = (by * 30 * 20) + (ty * 20) + 10
                            defense_range = 250 if tile.type == "tower" else 150
                            defense_attack = 20 if tile.type == "tower" else 10
                            
                            target = None
                            for unit in world.units.values():
                                if unit.owner != tile.owner:
                                    dist = ((tile_x - unit.x)**2 + (tile_y - unit.y)**2)**0.5
                                    if dist <= defense_range:
                                        target = unit
                                        break
                            
                            if target:
                                target.hp -= defense_attack
                                tile.last_attack_time = current_time
                                unit_update_needed = True
                                # Visual Attack Event
                                await manager.broadcast(json.dumps({
                                    "type": "ATTACK_EVENT",
                                    "attacker": {"x": tile_x, "y": tile_y, "type": tile.type},
                                    "target": {"x": target.x, "y": target.y, "id": target.id}
                                }))
                                if target.hp <= 0:
                                    if target.type == "gatherer":
                                        world.players[target.owner]["gatherer_count"] -= 1
                                    if target.id in world.units:
                                        del world.units[target.id]

        # 2. Unit Logic (Existing: Attack and Gathering)
        for unit in list(world.units.values()):
            # Attack enemy units
            for other in list(world.units.values()):
                if other.owner != unit.owner:
                    dist = ((unit.x - other.x)**2 + (unit.y - other.y)**2)**0.5
                    if dist <= unit.range:
                        other.hp -= unit.attack
                        unit_update_needed = True
                        if other.hp <= 0:
                            if other.type == "gatherer":
                                world.players[other.owner]["gatherer_count"] -= 1
                            if other.id in world.units:
                                del world.units[other.id]

            # Current position tile check (Gathering or attacking buildings)
            tx_pix = unit.x
            ty_pix = unit.y
            b_x = int(tx_pix // (30 * 20))
            b_y = int(ty_pix // (30 * 20))
            t_x = int((tx_pix % (30 * 20)) // 20)
            t_y = int((ty_pix % (30 * 20)) // 20)
            key = f"{b_x},{b_y}"
            
            if key in world.blocks:
                tile = world.blocks[key].tiles[t_y][t_x]
                
                # Gathering Logic
                if tile.type in ["resource_gold", "resource_wood", "resource_food"]:
                    gather_rate = 5 # Resources per tick
                    tile.hp -= gather_rate
                    changed_tiles.append({"bx": b_x, "by": b_y, "tx": t_x, "ty": t_y, "tile": {"type": tile.type, "owner": tile.owner, "hp": tile.hp, "max_hp": tile.max_hp}})
                    
                    p_data = world.players[unit.owner]
                    if tile.type == "resource_gold": p_data["gold"] += gather_rate
                    elif tile.type == "resource_wood": p_data["wood"] += gather_rate
                    elif tile.type == "resource_food": p_data["food"] += gather_rate
                    
                    # Notify player of resource update
                    if unit.owner in manager.active_connections:
                        await manager.send_personal(unit.owner, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))
                    
                    if tile.hp <= 0:
                        tile.type = "empty"
                        tile.owner = None
                        changed_tiles[-1]["tile"] = {"type": "empty", "owner": None, "hp": 0, "max_hp": 100}

                # Attack enemy buildings check (simplified to adjacent tiles)
                for dy_off in [-20, 0, 20]:
                    for dx_off in [-20, 0, 20]:
                        ctx_pix = unit.x + dx_off
                        cty_pix = unit.y + dy_off
                        cb_x = int(ctx_pix // (30 * 20))
                        cb_y = int(cty_pix // (30 * 20))
                        ct_x = int((ctx_pix % (30 * 20)) // 20)
                        ct_y = int((cty_pix % (30 * 20)) // 20)
                        ckey = f"{cb_x},{cb_y}"
                        if ckey in world.blocks:
                            ctile = world.blocks[ckey].tiles[ct_y][ct_x]
                            if ctile.owner and ctile.owner != unit.owner and ctile.type in ["castle", "tower", "barracks"]:
                                ctile.hp -= unit.attack
                                changed_tiles.append({"bx": cb_x, "by": cb_y, "tx": ct_x, "ty": ct_y, "tile": {"type": ctile.type, "owner": ctile.owner, "hp": ctile.hp, "max_hp": ctile.max_hp}})
                                if ctile.hp <= 0:
                                    old_type, old_owner = ctile.type, ctile.owner
                                    ctile.type, ctile.owner = "empty", None
                                    changed_tiles[-1]["tile"] = {"type": "empty", "owner": None, "hp": 0, "max_hp": 100}
                                    if old_type == "castle":
                                        world.players[old_owner] = {
                                            "blocks_created_today": 0, "last_reset": datetime.date.today().isoformat(),
                                            "gold": 1000, "wood": 1000, "food": 1000, "has_castle": False, "gatherer_count": 0
                                        }
                                        for uid in list(world.units.keys()):
                                            if world.units[uid].owner == old_owner: del world.units[uid]
                                        await manager.send_personal(old_owner, json.dumps({"type": "DEFEAT"}))

        if unit_update_needed:
            await manager.broadcast(json.dumps({"type": "UNIT_UPDATE", "units": [u.to_dict() for u in world.units.values()]}))
        if changed_tiles:
            await manager.broadcast(json.dumps({"type": "TILE_UPDATE", "tiles": changed_tiles}))


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(resource_spawner())
    asyncio.create_task(game_loop())

@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await manager.connect(player_id, websocket)
    player_data = world.get_player_data(player_id)
    
    # Check if a free block is needed for new player
    has_assets = any(u.owner == player_id for u in world.units.values())
    if not has_assets:
        for block in world.blocks.values():
            for row in block.tiles:
                if any(t.owner == player_id for t in row):
                    has_assets = True
                    break
            if has_assets: break
            
    needs_starting_block = False
    if not has_assets:
        # Check if all blocks are occupied by OTHER players
        all_occupied = True
        for key in world.blocks.keys():
            bx, by = map(int, key.split(","))
            if not world.is_block_occupied(bx, by):
                all_occupied = False
                break
        
        if all_occupied:
            needs_starting_block = True

    await manager.send_personal(player_id, json.dumps({
        "type": "INIT",
        "data": world.get_world_data(),
        "player_data": player_data,
        "needs_starting_block": needs_starting_block
    }))

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "CLEAR_MAP":
                if player_id == "Narunai":
                    world.reset_world()
                    await manager.broadcast(json.dumps({"type": "INIT", "data": world.get_world_data()}))
                else:
                    await manager.send_personal(player_id, json.dumps({"type": "ERROR", "message": "ไม่ได้รับอนุญาตให้ล้างแผนที่"}))

            elif message["type"] == "SELL_BUILDING":
                bx, by, tx, ty = message["bx"], message["by"], message["tx"], message["ty"]
                key = f"{bx},{by}"
                if key in world.blocks:
                    block = world.blocks[key]
                    tile = block.tiles[ty][tx]
                    if tile.owner == player_id and tile.type in ["castle", "tower", "barracks", "archery_range"]:
                        costs = {"castle": {"gold": 400, "wood": 400, "food": 200}, "tower": {"gold": 200, "wood": 150, "food": 50}, "barracks": {"gold": 150, "wood": 200, "food": 100}, "archery_range": {"gold": 200, "wood": 250, "food": 100}}
                        cost = costs.get(tile.type, {})
                        p_data = world.get_player_data(player_id)
                        p_data["gold"] += cost.get("gold", 0)
                        p_data["wood"] += cost.get("wood", 0)
                        p_data["food"] += cost.get("food", 0)
                        if tile.type == "castle": p_data["has_castle"] = False
                        
                        tile.type = "empty"
                        tile.owner = None
                        tile.hp = 0
                        await manager.broadcast(json.dumps({"type": "INIT", "data": world.get_world_data()}))
                        await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))

            elif message["type"] == "EXPLORE":
                x, y = message["x"], message["y"]
                success, error = world.add_block(x, y, player_id)
                if success:
                    await manager.broadcast(json.dumps({"type": "INIT", "data": world.get_world_data()}))
                    await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": world.get_player_data(player_id)}))
                else:
                    await manager.send_personal(player_id, json.dumps({"type": "ERROR", "message": error}))
            
            elif message["type"] == "BUILD":
                bx, by, tx, ty, b_type = message["bx"], message["by"], message["tx"], message["ty"], message["building_type"]
                costs = {
                    "castle": {"gold": 400, "wood": 400, "food": 200}, 
                    "tower": {"gold": 200, "wood": 150, "food": 50}, 
                    "barracks": {"gold": 150, "wood": 200, "food": 100},
                    "archery_range": {"gold": 200, "wood": 250, "food": 100}
                }
                cost = costs.get(b_type)
                p_data = world.get_player_data(player_id)
                if p_data["gold"] >= cost["gold"] and p_data["wood"] >= cost["wood"] and p_data["food"] >= cost["food"]:
                    key = f"{bx},{by}"
                    if key in world.blocks:
                        block = world.blocks[key]
                        tile = block.tiles[ty][tx]
                        if tile.type == "empty":
                            if b_type == "castle" and p_data["has_castle"]:
                                await manager.send_personal(player_id, json.dumps({"type": "ERROR", "message": "คุณมีปราสาทอยู่แล้ว"}))
                                continue
                            tile.type = b_type
                            tile.owner = player_id
                            tile.hp = 500 if b_type == "castle" else 200
                            tile.max_hp = tile.hp
                            if b_type == "castle": p_data["has_castle"] = True
                            p_data["gold"] -= cost["gold"]
                            p_data["wood"] -= cost["wood"]
                            p_data["food"] -= cost["food"]
                            await manager.broadcast(json.dumps({"type": "INIT", "data": world.get_world_data()}))
                            await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))
                else:
                    await manager.send_personal(player_id, json.dumps({"type": "ERROR", "message": "ทรัพยากรไม่พอ"}))

            elif message["type"] == "PRODUCE_UNIT":
                bx, by, tx, ty = message["bx"], message["by"], message["tx"], message["ty"]
                p_data = world.get_player_data(player_id)
                cost = {"food": 100, "gold": 50}
                if p_data["food"] >= cost["food"] and p_data["gold"] >= cost["gold"]:
                    p_data["food"] -= cost["food"]
                    p_data["gold"] -= cost["gold"]
                    unit_id = f"u_{random.randint(0, 1000000)}"
                    spawn_x = (bx * 30 * 20) + (tx * 20) + random.choice([-20, 0, 20])
                    spawn_y = (by * 30 * 20) + (ty * 20) + 20
                    new_unit = Unit(unit_id, "soldier", spawn_x, spawn_y, player_id)
                    world.units[unit_id] = new_unit
                    await manager.broadcast(json.dumps({"type": "UNIT_UPDATE", "units": [u.to_dict() for u in world.units.values()]}))
                    await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))

            elif message["type"] == "PRODUCE_ARCHER":
                bx, by, tx, ty = message["bx"], message["by"], message["tx"], message["ty"]
                p_data = world.get_player_data(player_id)
                cost = {"food": 80, "gold": 120}
                if p_data["food"] >= cost["food"] and p_data["gold"] >= cost["gold"]:
                    p_data["food"] -= cost["food"]
                    p_data["gold"] -= cost["gold"]
                    unit_id = f"a_{random.randint(0, 1000000)}"
                    spawn_x = (bx * 30 * 20) + (tx * 20) + random.choice([-20, 0, 20])
                    spawn_y = (by * 30 * 20) + (ty * 20) + 20
                    new_unit = Unit(unit_id, "archer", spawn_x, spawn_y, player_id)
                    new_unit.hp = 70
                    new_unit.max_hp = 70
                    new_unit.range = 150 # Long range for archer
                    new_unit.attack = 8
                    world.units[unit_id] = new_unit
                    await manager.broadcast(json.dumps({"type": "UNIT_UPDATE", "units": [u.to_dict() for u in world.units.values()]}))
                    await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))

            elif message["type"] == "PRODUCE_GATHERER":
                bx, by, tx, ty = message["bx"], message["by"], message["tx"], message["ty"]
                p_data = world.get_player_data(player_id)
                cost = {"wood": 50, "food": 50} if p_data["gatherer_count"] > 0 else {"wood": 0, "food": 0}
                if p_data["wood"] >= cost["wood"] and p_data["food"] >= cost["food"]:
                    p_data["wood"] -= cost["wood"]
                    p_data["food"] -= cost["food"]
                    p_data["gatherer_count"] += 1
                    unit_id = f"g_{random.randint(0, 1000000)}"
                    spawn_x = (bx * 30 * 20) + (tx * 20)
                    spawn_y = (by * 30 * 20) + (ty * 20) + 20
                    world.units[unit_id] = Unit(unit_id, "gatherer", spawn_x, spawn_y, player_id)
                    await manager.broadcast(json.dumps({"type": "UNIT_UPDATE", "units": [u.to_dict() for u in world.units.values()]}))
                    await manager.send_personal(player_id, json.dumps({"type": "RES_UPDATE", "player_data": p_data}))

            elif message["type"] == "MOVE_UNITS":
                unit_ids = message["unit_ids"]
                tx, ty = message["x"], message["y"]
                # Snap target to grid
                target_x = (tx // 20) * 20
                target_y = (ty // 20) * 20
                for idx, uid in enumerate(unit_ids):
                    if uid in world.units and world.units[uid].owner == player_id:
                        # Offset units to avoid overlapping on same spot
                        world.units[uid].target_x = target_x + (idx % 3) * 20
                        world.units[uid].target_y = target_y + (idx // 3) * 20
                    
    except WebSocketDisconnect:
        manager.disconnect(player_id)

