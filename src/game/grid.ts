import type { TilePoint } from "./types";

export type Grid = {
  width: number;
  height: number;
  tileSize: number;
  walls: boolean[]; // length = width*height
  pellets: boolean[]; // length = width*height
  powers: boolean[]; // length = width*height
  tunnelMap: Map<string, TilePoint>;
};

export function idx(width: number, x: number, y: number): number {
  return y * width + x;
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function isWall(grid: Grid, x: number, y: number): boolean {
  if (!inBounds(grid, x, y)) return true;
  return grid.walls[idx(grid.width, x, y)] === true;
}

export function isWalkable(grid: Grid, x: number, y: number): boolean {
  return !isWall(grid, x, y);
}

export function tileKey(p: TilePoint): string {
  return `${p.x},${p.y}`;
}

export function tileCenterPx(grid: Grid, tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: tileX * grid.tileSize + grid.tileSize / 2,
    y: tileY * grid.tileSize + grid.tileSize / 2
  };
}

export function pxToTile(grid: Grid, px: number, py: number): TilePoint {
  return {
    x: Math.floor(px / grid.tileSize),
    y: Math.floor(py / grid.tileSize)
  };
}

