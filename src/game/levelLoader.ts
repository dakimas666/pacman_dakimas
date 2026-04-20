import type { LevelJson, TilePoint } from "./types";
import type { Grid } from "./grid";
import { idx, tileKey } from "./grid";

export type LoadedLevel = {
  grid: Grid;
  spawns: {
    pacman: { tile: TilePoint; dir: LevelJson["spawns"]["pacman"]["dir"] };
  };
  pelletCount: number;
};

export function loadLevelFromJson(level: LevelJson): LoadedLevel {
  const width = level.meta.width;
  const height = level.meta.height;
  const tileSize = level.meta.tileSize;

  if (level.tiles.rows.length !== height) {
    throw new Error(`Level rows mismatch: expected ${height}, got ${level.tiles.rows.length}`);
  }
  for (const r of level.tiles.rows) {
    if (r.length !== width) throw new Error(`Level row width mismatch: expected ${width}, got ${r.length}`);
  }

  const walls = new Array<boolean>(width * height).fill(false);
  const pellets = new Array<boolean>(width * height).fill(false);
  const powers = new Array<boolean>(width * height).fill(false);
  let pelletCount = 0;
  for (let y = 0; y < height; y++) {
    const row = level.tiles.rows[y];
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const tileType = level.tiles.legend[ch];
      if (!tileType) throw new Error(`Unknown tile legend char '${ch}' at ${x},${y}`);
      const i = idx(width, x, y);
      if (tileType === "WALL") {
        walls[i] = true;
      } else if (tileType === "PELLET") {
        pellets[i] = true;
        pelletCount++;
      } else if (tileType === "POWER") {
        powers[i] = true;
        pelletCount++;
      }
    }
  }

  const tunnelMap = new Map<string, TilePoint>();
  for (const t of level.tunnels ?? []) {
    tunnelMap.set(tileKey(t.from), t.to);
  }

  const grid: Grid = { width, height, tileSize, walls, pellets, powers, tunnelMap };

  return {
    grid,
    spawns: {
      pacman: { tile: { x: level.spawns.pacman.x, y: level.spawns.pacman.y }, dir: level.spawns.pacman.dir }
    },
    pelletCount
  };
}

