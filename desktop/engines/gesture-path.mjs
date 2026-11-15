export const directions = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];

export class GesturePath {
  constructor(point, { minDistance, tolerance, timeoutMs }, now) {
    this.anchor = point;
    this.step = Math.max(8, minDistance / 2);
    this.minDistance = minDistance;
    this.tolerance = tolerance;
    this.deadline = now + timeoutMs;
    this.runs = [];
    this.distance = 0;
    this.invalid = false;
  }

  move(point, now) {
    if (this.invalid || now > this.deadline) { this.invalid = true; return; }
    const dx = point.x - this.anchor.x, dy = point.y - this.anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance < this.step) return;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const sector = Math.round(angle / 45);
    if (Math.abs(angle - sector * 45) > this.tolerance) return;
    const direction = directions[(sector + 8) % 8];
    const run = this.runs.at(-1);
    if (run?.direction === direction) run.distance += distance;
    else this.runs.push({ direction, distance });
    if (this.runs.length > 8) this.invalid = true;
    this.distance += distance;
    this.anchor = point;
  }

  finish(point, now) {
    this.move(point, now);
    if (this.invalid || this.distance < this.minDistance) return [];
    // Sampling across a corner can create a short diagonal between two long runs.
    const path = this.runs.filter((run, index, runs) => {
      if (!index || index === runs.length - 1 || run.distance >= this.minDistance) return true;
      const heading = directions.indexOf(run.direction);
      const before = directions.indexOf(runs[index - 1].direction);
      const after = directions.indexOf(runs[index + 1].direction);
      return !((before === (heading + 7) % 8 && after === (heading + 1) % 8) ||
        (after === (heading + 7) % 8 && before === (heading + 1) % 8));
    }).map(run => run.direction);
    return path.length <= 4 ? path : [];
  }
}

export function gestureCandidates(bindings, button, modifiers, point, now) {
  return bindings.filter(({ input }) => input.button === button && input.modifiers.join("+") === modifiers.join("+"))
    .map(binding => ({ binding, path: new GesturePath(point, binding.input, now) }));
}

export function finishGesture(candidates, point, now) {
  let match;
  for (const { binding, path } of candidates) {
    const result = path.finish(point, now);
    if (result.length && result.join(",") === binding.input.path.join(",") &&
        (!match || binding.input.path.length > match.input.path.length)) match = binding;
  }
  return match;
}
