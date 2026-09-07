import * as THREE from "three";
import type { RideView } from "./ride-path";

export const EXHIBIT_TRANSITION_SECONDS = 2.4;

/** Zero velocity and acceleration at both ends of a camera transfer. */
export function cameraEase(t: number) {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u ** 3 * (u * (u * 6 - 15) + 10);
}

/** Keep the seat ON the rail; only a deliberate change of view moves off it. */
export function createRideCameraMotion(camera: THREE.PerspectiveCamera) {
  let initialized = false, previousView: RideView = "seat", elapsed = 0, duration = 0;
  const fromPosition = new THREE.Vector3(), fromRotation = new THREE.Quaternion();
  let fromFov = camera.fov;
  return {
    update(position: THREE.Vector3, rotation: THREE.Quaternion, fov: number, view: RideView, dt: number) {
      if (!initialized) {
        camera.position.copy(position); camera.quaternion.copy(rotation); camera.fov = fov;
        initialized = true; previousView = view;
        return;
      }
      if (view !== previousView) {
        fromPosition.copy(camera.position); fromRotation.copy(camera.quaternion); fromFov = camera.fov;
        duration = view === "overview" || previousView === "overview" ? 4 : EXHIBIT_TRANSITION_SECONDS;
        elapsed = 0; previousView = view;
      }
      if (elapsed < duration) {
        elapsed = Math.min(duration, elapsed + dt);
        const blend = cameraEase(elapsed / duration);
        camera.position.lerpVectors(fromPosition, position, blend);
        camera.quaternion.slerpQuaternions(fromRotation, rotation, blend);
        camera.fov = THREE.MathUtils.lerp(fromFov, fov, blend);
      } else {
        // A world-space position lerp lagged behind the cart, cut across crests,
        // then caught up vertically. Position must follow arc-distance exactly.
        if (view === "seat") camera.position.copy(position);
        else camera.position.lerp(position, 1 - Math.exp(-dt * 3));
        // Smooth pitch/yaw independently of position, with a bounded angular rate.
        const angle = camera.quaternion.angleTo(rotation);
        camera.quaternion.rotateTowards(rotation, Math.min(angle * (1 - Math.exp(-dt * 5)), dt * 0.9));
        camera.fov = THREE.MathUtils.lerp(camera.fov, fov, 1 - Math.exp(-dt * 3));
      }
    },
    isTransitioning: () => elapsed < duration,
  };
}
