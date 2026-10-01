import * as T from "three";

export type StaticInstanceBatch = { mesh: T.InstancedMesh; bounds?: T.Sphere };

/** Keep the original instances, but submit only camera-visible or shadow-casting
 * instances. Three's default culling tests the entire batch as one large sphere.
 * This preserves geometry, colour, LOD and draw-call batching. Static batches only:
 * animated boats have changing transforms and deliberately do not register here.
 */
export function createInstanceCuller(batches: StaticInstanceBatch[]) {
  const sphere = new T.Sphere(), matrix = new T.Matrix4();
  const entries = batches.map(({ mesh, bounds }) => {
    mesh.updateWorldMatrix(true, false);
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const localBounds = bounds ?? mesh.geometry.boundingSphere!;
    const matrices = mesh.instanceMatrix.array.slice(), colors = mesh.instanceColor?.array.slice();
    const spheres: T.Sphere[] = [];
    for (let i = 0; i < mesh.count; i++) {
      matrix.fromArray(matrices, i * 16).premultiply(mesh.matrixWorld);
      spheres.push(localBounds.clone().applyMatrix4(matrix));
    }
    // The outer bound must cover both LODs and shader-driven foliage sway too.
    const outer = new T.Sphere();
    for (const s of spheres) outer.union(s);
    mesh.boundingSphere = outer.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.instanceColor?.setUsage(T.DynamicDrawUsage);
    return { mesh, matrices, colors, spheres, outer, selection: Int32Array.from(spheres, (_, i) => i) };
  });
  const visible = (mesh: T.Object3D) => {
    for (let node: T.Object3D | null = mesh; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  return {
    update(camera: T.Frustum, shadow?: T.Frustum) {
      for (const entry of entries) {
        const { mesh, matrices, colors, spheres, outer, selection } = entry;
        if (!visible(mesh)) continue;
        const shadowView = mesh.castShadow ? shadow : undefined;
        let count = 0, changed = false;
        if (camera.intersectsSphere(outer) || shadowView?.intersectsSphere(outer)) {
          for (let i = 0; i < spheres.length; i++) {
            sphere.copy(spheres[i]);
            if (!camera.intersectsSphere(sphere) && !shadowView?.intersectsSphere(sphere)) continue;
            if (selection[count] !== i) {
              selection[count] = i;
              // Copy only slots that changed, maintaining original order and tint.
              for (let j = 0; j < 16; j++) mesh.instanceMatrix.array[count * 16 + j] = matrices[i * 16 + j];
              if (colors && mesh.instanceColor) for (let j = 0; j < 3; j++) mesh.instanceColor.array[count * 3 + j] = colors[i * 3 + j];
              changed = true;
            }
            count++;
          }
        }
        mesh.count = count;
        if (changed) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
    },
  };
}

/** Static scenery never needs to recompose its local matrix every frame.
 * Animated subtrees remain fully live, including their wing/river transforms.
 */
export function freezeStaticTransforms(root: T.Object3D, animated = new Set<T.Object3D>()) {
  const visit = (object: T.Object3D) => {
    if (animated.has(object)) return;
    object.updateMatrix(); object.matrixAutoUpdate = false;
    for (const child of object.children) visit(child);
  };
  visit(root);
}
