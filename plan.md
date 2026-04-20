# Plan: Pac‑Man (Web) mit Phaser 3 + Vite + TypeScript

## Ziel

Eine spielbare Pac‑Man‑Webanwendung mit klassischem Labyrinth-Gameplay: Punkte sammeln, Power-Pillen, 4 Geister mit einfacher, nachvollziehbarer KI, Leben/Score/HUD, Sieg/Niederlage, Menüs und Pause.

## Festgelegte Entscheidungen

- **Tech-Stack**: Phaser 3, Vite, TypeScript
- **Level-Format**: **JSON**
- **Movement-Modell**: **Pixel Movement + Snap-to-Grid** (Richtungswechsel an Kreuzungen, Snap zur Tile-Mitte)
- **Pathfinding**: **BFS** auf Grid-Graph (für Ghost-Entscheidungen an Kreuzungen)
- **UI**: **nur Phaser UI** (UIScene/HUD via Phaser Text/Images)

## Nicht‑Ziele

- 1:1 Arcade‑Emulation (exakte Timings/Original-Bugs)
- Original-Assets oder rechtlich geschützte Sounds
- Multiplayer, Online‑Highscores, Account-System

## Qualitätskriterien (Definition of Done)

- **Stabil spielbar**: Keine Softlocks, kein Durch-Wände-Laufen, reproduzierbare Regeln.
- **Verlässliche States**: Menu/Playing/Pause/LevelComplete/GameOver funktionieren.
- **Konsistentes Feeling**: Richtungsbuffer + Snap führt zu “Pac‑Man‑artigem” Abbiegen.
- **Korrekte Regeln**: Power‑Pille → Frightened‑State, Ghost‑Eaten → Respawn, Score/Lives korrekt.
- **Build & Deploy**: `vite build` erzeugt lauffähige statische Dateien, Assets werden korrekt geladen.

## Level‑Spezifikation (JSON)

### Minimaler JSON‑Vertrag (Vorschlag)

- **Meta**
  - `tileSize`: number (z. B. 16)
  - `width`, `height`: number (Tiles)
- **Tiles**
  - `grid`: 2D-Array oder 1D-Array (`width*height`) mit Tile-Codes
  - Tile‑Codes z. B.: `WALL`, `PATH`, `PELLET`, `POWER`, `TUNNEL`, `GHOST_DOOR`
- **Spawns**
  - `spawns.pacman`: `{ x, y, dir }` (Tile‑Koordinaten)
  - `spawns.ghosts`: `{ blinky, pinky, inky, clyde }` jeweils `{ x, y, dir }`
- **Gameplay‑Zonen**
  - `ghostHouse`: optional Rechteck/Maskenbereich
  - `scatterTargets`: Ziel-Tiles für Scatter (je Ghost)
- **Teleport**
  - `tunnels`: Liste von Verbindungen `[{ from:{x,y}, to:{x,y} }]`

### Abnahmekriterien Level‑Loader

- Lädt Level JSON zuverlässig und erzeugt:
  - **Grid** mit Walkability/Walls
  - Pellet/Power‑Pellet Platzierung
  - Spawn‑Punkte und Tunnel-Verbindungen

## Movement‑Modell: Pixel + Snap (Details)

- **Position**: Entities bewegen sich in Pixeln, Logik nutzt zusätzlich `tileX/tileY`.
- **Snap-Regel**: Sobald eine Entity nahe genug an der Tile‑Mitte ist, wird sie auf die Mitte “gesnappt”, um Drift zu verhindern.
- **Richtungsbuffer**: Spielerinput wird gepuffert; Richtung wird bei nächster Kreuzung angewendet, wenn möglich.
- **Kreuzungen**: Eine Tile ist “intersection”, wenn mehr als 2 Nachbarn oder ein Richtungswechsel möglich ist.
- **Tunneling**: Beim Überschreiten des Tunnels wird die Position an die Ziel‑Tile gesetzt (mit passenden Pixel‑Koordinaten).

## Ghost‑KI: BFS + State Machine (vereinfachtes, stabiles Modell)

### Ghost‑States

- **Scatter**: Ziel ist ein vordefiniertes Corner‑Tile pro Ghost.
- **Chase**: Ziel hängt vom Ghost‑Typ ab (vereinfachte Targeting‑Regeln).
- **Frightened**: Geister sind verwundbar, bewegen sich “ungünstiger” (z. B. BFS zu einem Ziel “weg von Pac‑Man” oder zufällige Wahl an Kreuzungen ohne U‑Turn).
- **Respawn**: Ghost läuft zurück ins Ghost House und kehrt dann zu Scatter/Chase zurück.

### BFS‑Einsatz

- **Nur an Kreuzungen entscheiden**: Ghost wählt nächste Richtung an intersections.
- **BFS‑Ziel**: berechne kürzeste Distanz von Nachbar‑Tiles zum Ziel‑Tile; wähle Richtung mit minimaler Distanz.
- **Tie‑Breaks**: deterministische Reihenfolge (z. B. Up, Left, Down, Right) für reproduzierbares Verhalten.

### Vereinfachte Targeting‑Regeln (Startversion)

- **Blinky**: Ziel = Pac‑Man Tile.
- **Pinky**: Ziel = n Tiles vor Pac‑Man (clamp auf Grid).
- **Inky**: Ziel = Kombination (z. B. Midpoint/Vector zwischen Blinky und “2 ahead of Pac‑Man”) – kann initial vereinfacht werden.
- **Clyde**: Chase wenn Distanz > Schwelle, sonst Scatter.

## UI (nur Phaser)

- **UIScene** parallel zur `GameScene`:
  - Score, Lives, Level‑Text
  - Overlays: Pause, GameOver, LevelComplete
- Keine DOM‑UI nötig (außer dem Phaser Canvas Container).

## Meilensteine (mit Abnahmekriterien)

### M0 — Projektgerüst & Hello Phaser

- **Inhalt**
  - Vite+TS bootstrapped, Phaser Canvas rendert Szene, einfacher Debug‑Text.
- **Done wenn**
  - Dev‑Server startet, Scene läuft stabil, Resize/Scale passt.

### M1 — Level JSON → Grid + Rendering + Pac‑Man Bewegung (Pixel+Snap)

- **Inhalt**
  - `LevelLoader` liest JSON, baut Grid, rendert Wände/Wege.
  - Pac‑Man Movement mit Richtungsbuffer + Snap-to-Grid, Tunnel.
- **Done wenn**
  - Kein Drift, keine Wand-Durchquerung, Abbiegen fühlt sich sauber an.

### M2 — Pellets/Power‑Pellets + Score + Win Condition

- **Inhalt**
  - Pellets werden aus Level abgeleitet, Einsammeln erhöht Score.
  - Alle Pellets weg → LevelComplete.
- **Done wenn**
  - Score ist korrekt, LevelComplete zuverlässig, Reset/Next-Level Flow steht.

### M3 — Ghosts (Basis) + Kollision/Leben

- **Inhalt**
  - 4 Ghost Entities spawnen; einfache Bewegung (ohne BFS) als Übergang.
  - Kollision Pac‑Man↔Ghost: Leben--, Respawn/Reset, GameOver.
- **Done wenn**
  - Kollisionen robust, keine doppelten State‑Transitions, kein Softlock.

### M4 — Ghost‑KI (Scatter/Chase) mit BFS an Kreuzungen

- **Inhalt**
  - BFS‑Distanzfeld / BFS‑Query pro Entscheidung.
  - Scatter/Chase Wechsel (Timer oder Phasenlogik).
  - Targeting‑Regeln (Startversion) pro Ghost.
- **Done wenn**
  - Ghosts verhalten sich nachvollziehbar zielgerichtet und deterministisch.

### M5 — Power‑Pille: Frightened + Ghost Eaten + Respawn

- **Inhalt**
  - Frightened Timer, Visual State (Farbe/Animation), Speed‑Tuning.
  - Ghost eaten: Score‑Multiplikator, Ghost → Respawn State.
- **Done wenn**
  - Keine Konflikte zwischen “Death” und “Eaten”; Timer/States sauber.

### M6 — Menüs, Pause, HUD‑Polish, Audio/Animation

- **Inhalt**
  - MenuScene, Pause Overlay, GameOver/LevelComplete UI.
  - Basis‑Sounds & Animationen.
- **Done wenn**
  - Start→Play→Pause→Resume→GameOver/Win durchgängig stabil.

### M7 — Build/Deploy & Feinschliff

- **Inhalt**
  - `vite build` + Hosting (z. B. static deploy).
  - Performance‑Check, Debug‑Toggles optional.
- **Done wenn**
  - Release‑Build lädt ohne Asset‑Fehler, stabile Framerate, spielbar.

## Risiken & Gegenmaßnahmen

- **Snap/Intersection‑Bugs**: früh Debug‑Overlay für Tile‑Center + Collision Points einplanen.
- **BFS‑Kosten**: BFS nur an Kreuzungen; optional Distanzfelder cachen, wenn nötig.
- **State‑Komplexität**: klare State Machine für Game und Ghosts, zentralisierte Transitions.