export type Direction = "UP" | "LEFT" | "DOWN" | "RIGHT";

export type TilePoint = { x: number; y: number };

export type LevelJson = {
  meta: { tileSize: number; width: number; height: number };
  tiles: {
    legend: Record<string, string>;
    rows: string[];
  };
  spawns: {
    pacman: { x: number; y: number; dir: Direction };
    ghosts?: Record<string, { x: number; y: number; dir: Direction }>;
  };
  tunnels?: { from: TilePoint; to: TilePoint }[];
};

