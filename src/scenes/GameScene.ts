import Phaser from "phaser";
import level1 from "../levels/level1.json";
import type { Direction, TilePoint } from "../game/types";
import { loadLevelFromJson } from "../game/levelLoader";
import { DIRS, dirToDelta, oppositeDir } from "../game/direction";
import { isWalkable, pxToTile, tileCenterPx, tileKey } from "../game/grid";
import { bfsDistances, bestDirByDistances } from "../game/bfs";
import { Sfx } from "../game/sfx";

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private pauseKey?: Phaser.Input.Keyboard.Key;
  private escKey?: Phaser.Input.Keyboard.Key;

  private level = loadLevelFromJson(level1);
  private pacman!: Phaser.GameObjects.Arc;
  private pelletsByKey = new Map<string, Phaser.GameObjects.Arc>();
  private powersByKey = new Map<string, Phaser.GameObjects.Arc>();
  private remaining = 0;
  private score = 0;
  private lives = 3;
  private state: "PLAYING" | "PAUSED" | "LEVEL_COMPLETE" | "PLAYER_DYING" | "GAME_OVER" = "PLAYING";

  private currentDir: Direction;
  private desiredDir: Direction | null = null;
  private speedPxPerSec = 92; // bewusst moderat für sauberes Snap/Turn
  private snapEpsilonPx = 1.25;

  private ghosts: Array<{
    id: string;
    body: Phaser.GameObjects.Arc;
    spawn: { tile: TilePoint; dir: Direction };
    currentDir: Direction;
    state: "NORMAL" | "FRIGHTENED" | "RESPAWN";
    baseColor: number;
    normalSpeed: number;
    frightenedSpeed: number;
    respawnSpeed: number;
  }> = [];

  private ghostMode: "SCATTER" | "CHASE" = "SCATTER";

  private frightenedUntilMs = 0;
  private eatenStreak = 0;
  private sfx = new Sfx();

  constructor() {
    super("GameScene");
    this.currentDir = this.level.spawns.pacman.dir;
  }

  init() {
    // Scene.restart() startet dieselbe Instanz neu – daher müssen wir unseren State explizit resetten.
    this.time.removeAllEvents();

    this.level = loadLevelFromJson(level1);

    this.pelletsByKey = new Map();
    this.powersByKey = new Map();
    this.remaining = 0;

    this.score = 0;
    this.lives = 3;
    this.state = "PLAYING";

    this.pauseKey = undefined;
    this.escKey = undefined;

    this.ghosts = [];
    this.ghostMode = "SCATTER";
    this.frightenedUntilMs = 0;
    this.eatenStreak = 0;

    this.currentDir = this.level.spawns.pacman.dir;
    this.desiredDir = null;
  }

  create() {
    // Pfeiltasten nicht den Browser scrollen lassen.
    this.input.keyboard?.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN
    ]);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.pauseKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.renderGrid();
    this.createPellets();

    const spawn = this.level.spawns.pacman.tile;
    const { x, y } = tileCenterPx(this.level.grid, spawn.x, spawn.y);
    this.pacman = this.add.circle(x, y, this.level.grid.tileSize * 0.45, 0xffd800);

    this.createGhosts();
    this.startGhostModeLoop();

    this.emitUi();
  }

  update(_t: number, dtMs: number) {
    if (this.pauseKey && Phaser.Input.Keyboard.JustDown(this.pauseKey)) this.togglePause();
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) this.togglePause();

    if (this.state === "LEVEL_COMPLETE" || this.state === "GAME_OVER") {
      const enter = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      if (enter && Phaser.Input.Keyboard.JustDown(enter)) {
        this.scene.stop("UIScene");
        this.scene.start("MenuScene");
      }
      return;
    }

    if (this.state === "PAUSED") return;

    if (this.state === "PLAYER_DYING") {
      return;
    }

    const dt = dtMs / 1000;
    const nowMs = this.time.now;

    this.desiredDir = this.readDesiredDir() ?? this.desiredDir;

    const grid = this.level.grid;

    // Bestimme aktuelle Tile und deren Center.
    const tile = pxToTile(grid, this.pacman.x, this.pacman.y);
    const center = tileCenterPx(grid, tile.x, tile.y);

    const dxToCenter = center.x - this.pacman.x;
    const dyToCenter = center.y - this.pacman.y;

    const closeToCenter = Math.abs(dxToCenter) <= this.snapEpsilonPx && Math.abs(dyToCenter) <= this.snapEpsilonPx;

    if (closeToCenter) {
      // Snap verhindert Drift.
      this.pacman.setPosition(center.x, center.y);

      // Tunnel: Teleport ausschließlich, wenn wir auf dem From-Tile stehen.
      const to = grid.tunnelMap.get(tileKey(tile));
      if (to) {
        const dst = tileCenterPx(grid, to.x, to.y);
        this.pacman.setPosition(dst.x, dst.y);
      }

      // Einsammeln passiert deterministisch an Tile-Centern.
      const nowTile = pxToTile(grid, this.pacman.x, this.pacman.y);
      this.tryCollectAt(nowTile.x, nowTile.y);

      // An Tile-Centern wenden wir den Richtungsbuffer an, wenn möglich.
      if (this.desiredDir && this.canMove(this.desiredDir)) {
        this.currentDir = this.desiredDir;
      }

      // Wenn die aktuelle Richtung blockiert ist, stehen bleiben.
      if (!this.canMove(this.currentDir)) {
        this.updateGhosts(dt, nowMs);
        this.checkGhostCollisions();
        return;
      }
    }

    // Bewegung in Pixeln.
    const { dx, dy } = dirToDelta(this.currentDir);
    const moveX = dx * this.speedPxPerSec * dt;
    const moveY = dy * this.speedPxPerSec * dt;

    // Axis-aligned Movement: vorwärts, aber ohne Wanddurchquerung.
    // Wir prüfen den Ziel-Tile anhand der "next position" und blocken, falls Wand.
    const nextX = this.pacman.x + moveX;
    const nextY = this.pacman.y + moveY;
    const nextTile = pxToTile(grid, nextX, nextY);
    if (isWalkable(grid, nextTile.x, nextTile.y)) {
      this.pacman.setPosition(nextX, nextY);
      this.updateGhosts(dt, nowMs);
      this.checkGhostCollisions();
      return;
    }

    // Wenn wir sonst in eine Wand laufen würden, positioniere maximal bis zur Tile-Mitte.
    // Dadurch "klebt" Pac-Man sauber an der Grid-Struktur.
    if (dx !== 0) {
      const clampedX = Phaser.Math.Clamp(nextX, Math.min(this.pacman.x, center.x), Math.max(this.pacman.x, center.x));
      this.pacman.setX(clampedX);
    } else if (dy !== 0) {
      const clampedY = Phaser.Math.Clamp(nextY, Math.min(this.pacman.y, center.y), Math.max(this.pacman.y, center.y));
      this.pacman.setY(clampedY);
    }

    this.updateGhosts(dt, nowMs);
    this.checkGhostCollisions();
  }

  private readDesiredDir(): Direction | null {
    if (this.cursors.left?.isDown) return "LEFT";
    if (this.cursors.right?.isDown) return "RIGHT";
    if (this.cursors.up?.isDown) return "UP";
    if (this.cursors.down?.isDown) return "DOWN";
    return null;
  }

  private canMove(dir: Direction): boolean {
    const grid = this.level.grid;
    const tile = pxToTile(grid, this.pacman.x, this.pacman.y);
    const { dx, dy } = dirToDelta(dir);
    return isWalkable(grid, tile.x + dx, tile.y + dy);
  }

  private renderGrid() {
    const { grid } = this.level;
    const g = this.add.graphics();

    // Hintergrund (Paths)
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 0, grid.width * grid.tileSize, grid.height * grid.tileSize);

    // Wände
    g.fillStyle(0x1f4cff, 1);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isWalkable(grid, x, y)) {
          g.fillRect(x * grid.tileSize, y * grid.tileSize, grid.tileSize, grid.tileSize);
        }
      }
    }

    // Optional: feines Grid (hilft beim Debuggen)
    g.lineStyle(1, 0x0f0f1a, 1);
    for (let x = 0; x <= grid.width; x++) {
      g.beginPath();
      g.moveTo(x * grid.tileSize, 0);
      g.lineTo(x * grid.tileSize, grid.height * grid.tileSize);
      g.strokePath();
    }
    for (let y = 0; y <= grid.height; y++) {
      g.beginPath();
      g.moveTo(0, y * grid.tileSize);
      g.lineTo(grid.width * grid.tileSize, y * grid.tileSize);
      g.strokePath();
    }
  }

  private createPellets() {
    const { grid } = this.level;
    this.remaining = this.level.pelletCount;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const i = y * grid.width + x;
        if (!grid.pellets[i] && !grid.powers[i]) continue;

        const c = tileCenterPx(grid, x, y);
        if (grid.powers[i]) {
          const p = this.add.circle(c.x, c.y, grid.tileSize * 0.28, 0xffffff);
          this.powersByKey.set(tileKey({ x, y }), p);
        } else {
          const p = this.add.circle(c.x, c.y, grid.tileSize * 0.11, 0xf1c27d);
          this.pelletsByKey.set(tileKey({ x, y }), p);
        }
      }
    }

    // Falls der Spawn direkt auf einem Pellet liegt, wird es beim ersten Snap eingesammelt.
  }

  private tryCollectAt(tileX: number, tileY: number) {
    const key = tileKey({ x: tileX, y: tileY });

    const pellet = this.pelletsByKey.get(key);
    if (pellet) {
      pellet.destroy();
      this.pelletsByKey.delete(key);
      this.onPelletCollected(10);
      this.sfx.pellet();
      return;
    }

    const power = this.powersByKey.get(key);
    if (power) {
      power.destroy();
      this.powersByKey.delete(key);
      this.onPelletCollected(50);
      this.sfx.power();
      this.startFrightened();
    }
  }

  private onPelletCollected(points: number) {
    this.score += points;
    this.remaining--;
    this.emitUi();

    if (this.remaining <= 0) {
      this.state = "LEVEL_COMPLETE";
      this.emitUi();
    }
  }

  private createGhosts() {
    const ghostSpawns = level1.spawns.ghosts ?? {};
    const colors: Record<string, number> = {
      blinky: 0xff4d4d,
      pinky: 0xff7bd1,
      inky: 0x44d8ff,
      clyde: 0xffb84d
    };

    const grid = this.level.grid;
    for (const [id, s] of Object.entries(ghostSpawns)) {
      const spawn = { tile: { x: s.x, y: s.y }, dir: s.dir as Direction };
      const c = tileCenterPx(grid, spawn.tile.x, spawn.tile.y);
      const baseColor = colors[id] ?? 0xffffff;
      const body = this.add.circle(c.x, c.y, grid.tileSize * 0.42, baseColor);
      this.ghosts.push({
        id,
        body,
        spawn,
        currentDir: spawn.dir,
        state: "NORMAL",
        baseColor,
        normalSpeed: 82,
        frightenedSpeed: 62,
        respawnSpeed: 120
      });
    }
  }

  private startGhostModeLoop() {
    // Vereinfachte Phasenlogik: SCATTER <-> CHASE im Loop.
    const applyMode = (mode: "SCATTER" | "CHASE") => {
      if (this.state !== "PLAYING") return;
      this.ghostMode = mode;
      this.emitUi();
    };

    const cycle = () => {
      applyMode("SCATTER");
      this.time.delayedCall(7000, () => applyMode("CHASE"));
      this.time.delayedCall(7000 + 20000, () => {
        applyMode("SCATTER");
        cycle();
      });
    };

    cycle();
  }

  private updateGhosts(dt: number, nowMs: number) {
    const grid = this.level.grid;

    const frightenedActive = nowMs < this.frightenedUntilMs;

    for (const g of this.ghosts) {
      // Frightened wird aus dem globalen Timer abgeleitet, damit Ghosts nicht "hängen bleiben"
      // (z.B. wenn sie gerade respawnen oder der Timer verlängert wurde).
      if (!frightenedActive && g.state === "FRIGHTENED") {
        g.state = "NORMAL";
        g.body.setFillStyle(g.baseColor, 1);
      }
      if (frightenedActive && g.state === "NORMAL") {
        g.state = "FRIGHTENED";
        g.body.setFillStyle(0x2b6cff, 1);
      }

      // Für Ghosts darf Snap nicht größer sein als die Schrittweite, sonst "kleben" sie
      // (besonders im Frightened-Modus mit geringerer Geschwindigkeit).
      const speedForSnap =
        g.state === "RESPAWN"
          ? g.respawnSpeed
          : frightenedActive && g.state !== "RESPAWN"
            ? g.frightenedSpeed
            : g.normalSpeed;
      const stepPx = speedForSnap * dt;
      const ghostSnapEpsilonPx = Math.min(this.snapEpsilonPx, Math.max(0.15, stepPx * 0.6));

      const tile = pxToTile(grid, g.body.x, g.body.y);
      const center = tileCenterPx(grid, tile.x, tile.y);
      const closeToCenter =
        Math.abs(center.x - g.body.x) <= ghostSnapEpsilonPx && Math.abs(center.y - g.body.y) <= ghostSnapEpsilonPx;

      if (closeToCenter) {
        g.body.setPosition(center.x, center.y);

        // Tunnel wie bei Pac-Man
        const to = grid.tunnelMap.get(tileKey(tile));
        if (to) {
          const dst = tileCenterPx(grid, to.x, to.y);
          g.body.setPosition(dst.x, dst.y);
        }

        // Nach Teleport/ Snap die Tile-Position erneut bestimmen.
        const nowTile = pxToTile(grid, g.body.x, g.body.y);

        // Richtung nur an Tile-Centern und nur an Kreuzungen ändern.
        if (g.state === "RESPAWN") {
          g.currentDir = this.chooseGhostDirToTarget(nowTile, g.currentDir, g.spawn.tile, true);
        } else if (frightenedActive && g.state !== "RESPAWN") {
          // Frightened: weg von Pac-Man (maximiere Distanz zum Pac-Man).
          g.currentDir = this.chooseGhostDirFrightened(nowTile, g.currentDir);
        } else {
          // Normal: Scatter/Chase via BFS.
          g.currentDir = this.chooseGhostDirBfs(nowTile, g.currentDir, g.id);
        }

        if (!this.canEntityMoveFrom(nowTile, g.currentDir)) {
          // Notfall: irgendeine mögliche Richtung
          const fallback = this.validDirsFrom(nowTile, null);
          if (fallback.length > 0) g.currentDir = fallback[0];
          else continue;
        }

        // Respawn fertig?
        if (g.state === "RESPAWN") {
          if (nowTile.x === g.spawn.tile.x && nowTile.y === g.spawn.tile.y) {
            g.state = frightenedActive ? "FRIGHTENED" : "NORMAL";
            // Spawn-Richtung kann bei engen Spawn-Tiles in eine Wand zeigen (z.B. Inky/Clyde).
            // Daher nur übernehmen, wenn sie wirklich begehbar ist; sonst deterministisch fallbacken.
            if (this.canEntityMoveFrom(nowTile, g.spawn.dir)) {
              g.currentDir = g.spawn.dir;
            } else {
              const fallback = this.validDirsFrom(nowTile, null);
              if (fallback.length > 0) g.currentDir = fallback[0];
            }
            g.body.setFillStyle(g.state === "FRIGHTENED" ? 0x2b6cff : g.baseColor, 1);
            g.body.setAlpha(1);
          }
        }
      }

      const { dx, dy } = dirToDelta(g.currentDir);
      const moveX = dx * speedForSnap * dt;
      const moveY = dy * speedForSnap * dt;

      const nextX = g.body.x + moveX;
      const nextY = g.body.y + moveY;
      const nextTile = pxToTile(grid, nextX, nextY);

      if (isWalkable(grid, nextTile.x, nextTile.y)) {
        g.body.setPosition(nextX, nextY);
        continue;
      }

      // Blockiert: maximal bis zur Mitte clampen
      if (dx !== 0) {
        const clampedX = Phaser.Math.Clamp(nextX, Math.min(g.body.x, center.x), Math.max(g.body.x, center.x));
        g.body.setX(clampedX);
      } else if (dy !== 0) {
        const clampedY = Phaser.Math.Clamp(nextY, Math.min(g.body.y, center.y), Math.max(g.body.y, center.y));
        g.body.setY(clampedY);
      }
    }
  }

  private chooseGhostDirBfs(tile: TilePoint, currentDir: Direction, ghostId: string): Direction {
    const forbidden = oppositeDir(currentDir);
    const optionsNoUTurn = this.validDirsFrom(tile, forbidden);
    const optionsAll = this.validDirsFrom(tile, null);

    // Keine Option -> stehen bleiben
    if (optionsAll.length === 0) return currentDir;

    // Wenn nur der U-Turn möglich ist, muss er erlaubt sein.
    const options = optionsNoUTurn.length > 0 ? optionsNoUTurn : optionsAll;

    // Nicht an Kreuzung: möglichst geradeaus (kein ständiges “Wackeln”).
    const isIntersection = options.length >= 2;
    if (!isIntersection && this.canEntityMoveFrom(tile, currentDir)) return currentDir;

    const target = this.getGhostTargetTile(ghostId);
    return this.chooseGhostDirToTarget(tile, currentDir, target, optionsNoUTurn.length > 0);
  }

  private chooseGhostDirToTarget(tile: TilePoint, currentDir: Direction, target: TilePoint, avoidUTurn: boolean): Direction {
    const forbidden = oppositeDir(currentDir);
    const optionsNoUTurn = this.validDirsFrom(tile, forbidden);
    const optionsAll = this.validDirsFrom(tile, null);
    if (optionsAll.length === 0) return currentDir;
    const options = avoidUTurn && optionsNoUTurn.length > 0 ? optionsNoUTurn : optionsAll;

    const isIntersection = options.length >= 2;
    if (!isIntersection && this.canEntityMoveFrom(tile, currentDir)) return currentDir;

    const distances = bfsDistances(this.level.grid, target);
    const best = bestDirByDistances({
      grid: this.level.grid,
      from: tile,
      forbiddenDir: avoidUTurn && optionsNoUTurn.length > 0 ? forbidden : undefined,
      distances
    });
    return best ?? options[0];
  }

  private chooseGhostDirFrightened(tile: TilePoint, currentDir: Direction): Direction {
    const forbidden = oppositeDir(currentDir);
    const optionsNoUTurn = this.validDirsFrom(tile, forbidden);
    const optionsAll = this.validDirsFrom(tile, null);
    if (optionsAll.length === 0) return currentDir;
    const options = optionsNoUTurn.length > 0 ? optionsNoUTurn : optionsAll;

    const isIntersection = options.length >= 2;
    if (!isIntersection && this.canEntityMoveFrom(tile, currentDir)) return currentDir;

    const pacTile = pxToTile(this.level.grid, this.pacman.x, this.pacman.y);
    const distToPac = bfsDistances(this.level.grid, pacTile);

    // Maximiere Distanz zum Pac-Man, deterministisch via DIRS-Reihenfolge.
    let best: { dir: Direction; d: number } | null = null;
    for (const dir of DIRS) {
      if (optionsNoUTurn.length > 0 && dir === forbidden) continue;
      if (!options.includes(dir)) continue;
      const { dx, dy } = dirToDelta(dir);
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      const d = distToPac[nx + ny * this.level.grid.width];
      if (typeof d !== "number" || d < 0) continue;
      if (!best || d > best.d) best = { dir, d };
      // Tie-break: DIRS Reihenfolge gewinnt automatisch.
    }
    return best?.dir ?? options[0];
  }

  private getGhostTargetTile(ghostId: string): TilePoint {
    const grid = this.level.grid;
    const pacTile = pxToTile(grid, this.pacman.x, this.pacman.y);

    const scatterTargets: Record<string, TilePoint> = {
      blinky: { x: grid.width - 2, y: 1 },
      pinky: { x: 1, y: 1 },
      inky: { x: grid.width - 2, y: grid.height - 2 },
      clyde: { x: 1, y: grid.height - 2 }
    };

    if (this.ghostMode === "SCATTER") {
      return scatterTargets[ghostId] ?? scatterTargets.blinky;
    }

    // CHASE Targeting (Startversion)
    if (ghostId === "blinky") return pacTile;

    if (ghostId === "pinky") {
      const ahead = this.tilesAhead(pacTile, this.currentDir, 4);
      return ahead;
    }

    if (ghostId === "inky") {
      // vereinfachte Inky-Logik (start): 2 Tiles vor Pac-Man
      return this.tilesAhead(pacTile, this.currentDir, 2);
    }

    if (ghostId === "clyde") {
      const clydeTile = this.getGhostTileById("clyde");
      const dist = clydeTile
        ? Phaser.Math.Distance.Between(pacTile.x, pacTile.y, clydeTile.x, clydeTile.y)
        : Number.POSITIVE_INFINITY;
      if (dist > 8) return pacTile;
      return scatterTargets.clyde;
    }

    return pacTile;
  }

  private tilesAhead(origin: TilePoint, dir: Direction, n: number): TilePoint {
    const { dx, dy } = dirToDelta(dir);
    const grid = this.level.grid;
    let x = Phaser.Math.Clamp(origin.x + dx * n, 0, grid.width - 1);
    let y = Phaser.Math.Clamp(origin.y + dy * n, 0, grid.height - 1);

    // Falls Ziel in Wand: zurück Richtung Origin bis walkable (max n Schritte).
    for (let i = 0; i < n; i++) {
      if (isWalkable(grid, x, y)) break;
      x -= dx;
      y -= dy;
    }
    if (!isWalkable(grid, x, y)) return origin;
    return { x, y };
  }

  private getGhostTileById(id: string): TilePoint | null {
    const g = this.ghosts.find((gg) => gg.id === id);
    if (!g) return null;
    return pxToTile(this.level.grid, g.body.x, g.body.y);
  }

  private validDirsFrom(tile: TilePoint, forbidden: Direction | null): Direction[] {
    const dirs: Direction[] = ["UP", "LEFT", "DOWN", "RIGHT"];
    return dirs.filter((d) => d !== forbidden && this.canEntityMoveFrom(tile, d));
  }

  private canEntityMoveFrom(tile: TilePoint, dir: Direction): boolean {
    const grid = this.level.grid;
    const { dx, dy } = dirToDelta(dir);
    return isWalkable(grid, tile.x + dx, tile.y + dy);
  }

  private checkGhostCollisions() {
    if (this.state !== "PLAYING") return;
    const hitRadius = this.level.grid.tileSize * 0.55;
    const frightenedActive = this.time.now < this.frightenedUntilMs;

    for (const g of this.ghosts) {
      if (g.state === "RESPAWN") continue;
      const d = Phaser.Math.Distance.Between(this.pacman.x, this.pacman.y, g.body.x, g.body.y);
      if (d <= hitRadius) {
        if (frightenedActive && g.state === "FRIGHTENED") {
          this.onGhostEaten(g);
        } else {
          this.onPacmanHit();
        }
        return;
      }
    }
  }

  private onGhostEaten(g: (typeof this.ghosts)[number]) {
    // Kein Konflikt mit Death/Hit: wird nur im PLAYING-State gerufen.
    this.eatenStreak += 1;
    const points = 200 * Math.pow(2, this.eatenStreak - 1);
    this.score += points;
    this.emitUi();
    this.sfx.eatGhost(this.eatenStreak);

    g.state = "RESPAWN";
    g.body.setFillStyle(0xffffff, 1);
    g.body.setAlpha(0.35);
  }

  private onPacmanHit() {
    if (this.state !== "PLAYING") return;
    this.state = "PLAYER_DYING";
    this.sfx.hit();

    this.lives -= 1;
    this.emitUi();

    if (this.lives <= 0) {
      this.state = "GAME_OVER";
      this.emitUi();
      return;
    }

    // Kurzer Freeze, dann Respawn von Pac-Man und Ghosts
    this.time.delayedCall(650, () => {
      this.respawnEntities();
      this.state = "PLAYING";
      this.emitUi();
    });
  }

  private respawnEntities() {
    const grid = this.level.grid;

    // Pac-Man
    const p = this.level.spawns.pacman.tile;
    const pc = tileCenterPx(grid, p.x, p.y);
    this.pacman.setPosition(pc.x, pc.y);
    this.currentDir = this.level.spawns.pacman.dir;
    this.desiredDir = null;

    // Ghosts
    for (const g of this.ghosts) {
      const c = tileCenterPx(grid, g.spawn.tile.x, g.spawn.tile.y);
      g.body.setPosition(c.x, c.y);
      g.currentDir = g.spawn.dir;
      g.state = this.time.now < this.frightenedUntilMs ? "FRIGHTENED" : "NORMAL";
      g.body.setFillStyle(g.state === "FRIGHTENED" ? 0x2b6cff : g.baseColor, 1);
      g.body.setAlpha(1);
    }
  }

  private startFrightened() {
    const now = this.time.now;
    this.frightenedUntilMs = Math.max(this.frightenedUntilMs, now) + 7000;
    this.eatenStreak = 0;
    this.emitUi();

    for (const g of this.ghosts) {
      if (g.state === "RESPAWN") continue;
      g.state = "FRIGHTENED";
      g.body.setFillStyle(0x2b6cff, 1);
      g.body.setAlpha(1);

      // Kleines Feedback: kurzer Blink.
      this.tweens.add({
        targets: g.body,
        alpha: { from: 1, to: 0.5 },
        duration: 120,
        yoyo: true,
        repeat: 2
      });
    }
  }

  private togglePause() {
    if (this.state === "PLAYING") {
      this.state = "PAUSED";
      this.emitUi();
      return;
    }
    if (this.state === "PAUSED") {
      this.state = "PLAYING";
      this.emitUi();
    }
  }

  private emitUi() {
    const frightenedActive = this.time.now < this.frightenedUntilMs;
    const base = {
      score: this.score,
      lives: this.lives,
      mode: this.ghostMode,
      frightened: frightenedActive
    };

    if (this.state === "PAUSED") this.events.emit("ui", { type: "PAUSED", ...base });
    else if (this.state === "LEVEL_COMPLETE") this.events.emit("ui", { type: "LEVEL_COMPLETE", ...base });
    else if (this.state === "GAME_OVER") this.events.emit("ui", { type: "GAME_OVER", ...base });
    else this.events.emit("ui", { type: "PLAYING", ...base });
  }
}

