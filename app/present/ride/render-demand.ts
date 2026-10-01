import * as T from "three";

/** A paused/reduced-motion scene keeps its last canvas image. Resume rendering
 * for animation, a camera move or explicit changes such as resizing/teleporting.
 * Compare with the last rendered pose, so tiny movements accumulate, not vanish.
 */
export function createRenderDemand() {
  const position = new T.Vector3(), rotation = new T.Quaternion();
  let dirty = true, lastTime = NaN, fov = NaN;
  return {
    invalidate() { dirty = true; },
    needsFrame(camera: T.PerspectiveCamera, animationTime: number) {
      if (!dirty && animationTime === lastTime && position.distanceToSquared(camera.position) < 1e-10
        && 1 - Math.abs(rotation.dot(camera.quaternion)) < 1e-12 && Math.abs(fov - camera.fov) < 1e-6) return false;
      dirty = false; lastTime = animationTime; fov = camera.fov;
      position.copy(camera.position); rotation.copy(camera.quaternion);
      return true;
    },
  };
}
