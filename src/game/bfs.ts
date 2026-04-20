import type { Direction, TilePoint } from "./types";
import type { Grid } from "./grid";
import { idx, inBounds, isWalkable } from "./grid";
import { DIRS, dirToDelta } from "./direction";

export type Distances = Int16Array;

export function bfsDistances(grid: Grid, target: TilePoint): Distances {
  const dist = new Int16Array(grid.width * grid.height);
  dist.fill(-1);

  if (!inBounds(grid, target.x, target.y) || !isWalkable(grid, target.x, target.y)) {
    return dist;
  }

  const qx = new Int16Array(grid.width * grid.height);
  const qy = new Int16Array(grid.width * grid.height);
  let qh = 0;
  let qt = 0;

  dist[idx(grid.width, target.x, target.y)] = 0;
  qx[qt] = target.x;
  qy[qt] = target.y;
  qt++;

  while (qh < qt) {
    const x = qx[qh];
    const y = qy[qh];
    qh++;

    const base = dist[idx(grid.width, x, y)];
    for (const d of DIRS) {
      const { dx, dy } = dirToDelta(d);
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(grid, nx, ny) || !isWalkable(grid, nx, ny)) continue;
      const ni = idx(grid.width, nx, ny);
      if (dist[ni] !== -1) continue;
      dist[ni] = (base + 1) as unknown as number;
      qx[qt] = nx;
      qy[qt] = ny;
      qt++;
    }
  }

  return dist;
}

export function bestDirByDistances(params: {
  grid: Grid;
  from: TilePoint;
  forbiddenDir?: Direction;
  distances: Distances;
}): Direction | null {
  const { grid, from, forbiddenDir, distances } = params;

  let best: { dir: Direction; d: number } | null = null;

  for (const dir of DIRS) {
    if (forbiddenDir && dir === forbiddenDir) continue;

    const { dx, dy } = dirToDelta(dir);
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (!inBounds(grid, nx, ny) || !isWalkable(grid, nx, ny)) continue;

    const nd = distances[idx(grid.width, nx, ny)];
    if (nd < 0) continue;

    if (!best || nd < best.d) {
      best = { dir, d: nd };
    }
    // Tie-break: DIRS Reihenfolge ist bereits Up, Left, Down, Right,
    // daher behalten wir bei Gleichstand die zuerst gefundene Richtung.
  }

  if (!best) return null;
  return best.dir;
}

