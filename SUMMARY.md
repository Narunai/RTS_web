# RTS-WEB Project Summary

## Overview
A web-based Real-Time Strategy (RTS) game prototype using a Python backend (FastAPI) and a Vanilla JavaScript frontend (Canvas API). The game features a block-based world expansion system, resource gathering, and real-time combat via WebSockets.

## Architecture

### Backend (`backend/main.py`)
- **Framework:** FastAPI
- **Communication:** WebSockets (`/ws/{player_id}`)
- **Core Entities:**
  - `Tile`: Individual 20x20px grid cells (Empty, River, Resource, Building).
  - `Unit`: Mobile entities (Soldier, Gatherer) with HP, attack, and movement logic.
  - `Block`: 30x30 tile sections used for world generation and expansion.
  - `World`: Global state manager for blocks, units, and player data.
- **Game Logic:**
  - `game_loop`: Periodic task (500ms) handling movement, combat, and resource extraction.
  - `resource_spawner`: Replenishes resources every 5 minutes.
  - Daily exploration limit: Players are restricted in how many blocks they can create per day.

### Frontend (`frontend/`)
- **Technology:** HTML5, CSS3, Vanilla JavaScript.
- **Rendering:** HTML5 Canvas for high-performance 2D graphics.
- **Key Components:**
  - `game.js`: Handles WebSocket communication, camera (pan/zoom), selection logic (box selection), and rendering.
  - Procedural Sprites: Buildings and units are drawn using Canvas primitives instead of static images.
  - UI: Floating action panels for building management and resource displays.

## Current Progress & Features
- [x] WebSocket integration for real-time multiplayer.
- [x] Basic world generation (Rivers, Resources).
- [x] Unit movement and grid-snapping.
- [x] Resource gathering (Gold, Wood, Food).
- [x] Building construction (Castle, Tower, Barracks).
- [x] Unit production from buildings.
- [x] Combat system (Unit vs Unit, Unit vs Building).
- [x] Camera pan and zoom controls.
- [x] Daily exploration quotas and map expansion.

## Project Structure
```
D:\Project\RTS_WEB\
├── aesses\          # Raw assets and character packs (Zip/AI/EPS/PNG)
├── backend\
│   └── main.py      # FastAPI server and game logic
└── frontend\
    ├── game.js      # Main game client logic
    └── index.html   # Game entry point and UI
```

## How to Run
1. **Backend:** Navigate to `backend/` and run `uvicorn main:app --reload`.
2. **Frontend:** Open `frontend/index.html` in a web browser.
