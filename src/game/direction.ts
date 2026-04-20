import type { Direction } from "./types";

export const DIRS: readonly Direction[] = ["UP", "LEFT", "DOWN", "RIGHT"] as const;

export function dirToDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case "UP":
      return { dx: 0, dy: -1 };
    case "DOWN":
      return { dx: 0, dy: 1 };
    case "LEFT":
      return { dx: -1, dy: 0 };
    case "RIGHT":
      return { dx: 1, dy: 0 };
  }
}

export function oppositeDir(dir: Direction): Direction {
  switch (dir) {
    case "UP":
      return "DOWN";
    case "DOWN":
      return "UP";
    case "LEFT":
      return "RIGHT";
    case "RIGHT":
      return "LEFT";
  }
}

