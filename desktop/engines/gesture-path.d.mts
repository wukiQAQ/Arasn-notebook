export type Point = { x: number; y: number };
export const directions: readonly ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
export type Direction = typeof directions[number];
export class GesturePath {
  constructor(point: Point, options: { minDistance: number; tolerance: number; timeoutMs: number }, now: number);
  move(point: Point, now: number): void;
  finish(point: Point, now: number): Direction[];
}
type GestureInput = { button: string; modifiers: string[]; path: Direction[]; minDistance: number; timeoutMs: number; tolerance: number };
type Candidate<T> = { binding: T; path: GesturePath };
export function gestureCandidates<T extends { input: GestureInput }>(bindings: T[], button: string, modifiers: string[], point: Point, now: number): Candidate<T>[];
export function finishGesture<T extends { input: GestureInput }>(candidates: Candidate<T>[], point: Point, now: number): T | undefined;
