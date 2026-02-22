import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const BOUNDS = 18;
const STEP_LENGTH = 1.5;
const HALF_STEP_LENGTH = STEP_LENGTH / 2;
const TUBE_RADIUS = 0.35;
const SPHERE_RADIUS = 0.45;
const TURN_CHANCE = 0.25;
const MAX_PATHS = 8;
const NEW_PIPE_CHANCE = 0.1;
const START_ATTEMPTS = 16;
const RESET_MARGIN = 50;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

const DIRECTIONS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const COLORS = [
  0xff3333, 0x33ff33, 0x3333ff, 0xffff33, 0xff33ff, 0x33ffff, 0xffffff, 0xff9933
];

class PipePath {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  color: number;
  
  constructor(start: THREE.Vector3, dir: THREE.Vector3, color: number) {
    this.position = start.clone();
    this.direction = dir;
    this.color = color;
  }

  step(occupiedNodes: Set<string>, nextPosScratch: THREE.Vector3) {
    const previousDirection = this.direction;
    const perpendicularDirections = getPerpendicularDirections(previousDirection);
    const shouldTurn = Math.random() < TURN_CHANCE;

    if (shouldTurn) {
      if (this.tryPerpendicularMove(perpendicularDirections, occupiedNodes, nextPosScratch)) {
        return { grew: true, didTurn: true };
      }
      if (this.tryMove(previousDirection, occupiedNodes, nextPosScratch)) {
        return { grew: true, didTurn: false };
      }
      return { grew: false, didTurn: false };
    }

    if (this.tryMove(previousDirection, occupiedNodes, nextPosScratch)) {
      return { grew: true, didTurn: false };
    }

    if (this.tryPerpendicularMove(perpendicularDirections, occupiedNodes, nextPosScratch)) {
      return { grew: true, didTurn: true };
    }

    return { grew: false, didTurn: false };
  }

  private tryPerpendicularMove(
    perpendicularDirections: readonly THREE.Vector3[],
    occupiedNodes: Set<string>,
    nextPosScratch: THREE.Vector3
  ) {
    const startIndex = Math.floor(Math.random() * perpendicularDirections.length);
    for (let offset = 0; offset < perpendicularDirections.length; offset++) {
      const direction = perpendicularDirections[(startIndex + offset) % perpendicularDirections.length];
      if (this.tryMove(direction, occupiedNodes, nextPosScratch)) {
        return true;
      }
    }
    return false;
  }

  private tryMove(direction: THREE.Vector3, occupiedNodes: Set<string>, nextPosScratch: THREE.Vector3) {
    nextPosScratch.copy(this.position).addScaledVector(direction, STEP_LENGTH);
    if (isOutOfBounds(nextPosScratch) || occupiedNodes.has(getGridKey(nextPosScratch))) {
      return false;
    }
    this.direction = direction;
    this.position.copy(nextPosScratch);
    return true;
  }
}

export function WindowsPipes() {
  const maxSegments = 10000;
  const cylinderRef = useRef<THREE.InstancedMesh>(null);
  const sphereRef = useRef<THREE.InstancedMesh>(null);

  const state = useRef({
    paths: [] as PipePath[],
    occupiedNodes: new Set<string>(),
    cylinderCount: 0,
    sphereCount: 0,
    timeSinceLastStep: 0,
    stepInterval: 0.03,
  });

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);
  const oldPosScratch = useMemo(() => new THREE.Vector3(), []);
  const nextPosScratch = useMemo(() => new THREE.Vector3(), []);
  const segmentPosScratch = useMemo(() => new THREE.Vector3(), []);

  const addJoint = (position: THREE.Vector3, color: number) => {
    const sphereMesh = sphereRef.current;
    if (!sphereMesh || state.current.sphereCount >= maxSegments) {
      return false;
    }
    writeInstanceTransform(sphereMesh, state.current.sphereCount, position, color, dummy, colorObj, null);
    state.current.sphereCount++;
    sphereMesh.count = state.current.sphereCount;
    return true;
  };

  const addPipeSegment = (startPos: THREE.Vector3, direction: THREE.Vector3, color: number) => {
    const cylinderMesh = cylinderRef.current;
    if (!cylinderMesh || state.current.cylinderCount >= maxSegments) {
      return false;
    }
    segmentPosScratch.copy(startPos).addScaledVector(direction, HALF_STEP_LENGTH);
    dummy.quaternion.setFromUnitVectors(UP_AXIS, direction);
    writeInstanceTransform(
      cylinderMesh,
      state.current.cylinderCount,
      segmentPosScratch,
      color,
      dummy,
      colorObj,
      dummy.quaternion
    );
    state.current.cylinderCount++;
    cylinderMesh.count = state.current.cylinderCount;
    return true;
  };

  useEffect(() => {
    state.current.paths = [];
    state.current.occupiedNodes.clear();
    state.current.cylinderCount = 0;
    state.current.sphereCount = 0;
    if (cylinderRef.current) cylinderRef.current.count = 0;
    if (sphereRef.current) sphereRef.current.count = 0;
  }, []);

  useFrame((_, delta) => {
    const sceneState = state.current;
    sceneState.timeSinceLastStep += delta;
    if (sceneState.timeSinceLastStep <= sceneState.stepInterval) {
      return;
    }
    sceneState.timeSinceLastStep = 0;

    let sphereDirty = false;
    let cylinderDirty = false;

    if (sceneState.paths.length < MAX_PATHS && Math.random() < NEW_PIPE_CHANCE) {
      const start = findFreeStartPosition(sceneState.occupiedNodes);
      if (start) {
        const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        sceneState.paths.push(new PipePath(start, direction, color));
        sceneState.occupiedNodes.add(getGridKey(start));
        sphereDirty = addJoint(start, color) || sphereDirty;
      }
    }

    for (let i = sceneState.paths.length - 1; i >= 0; i--) {
      const path = sceneState.paths[i];
      oldPosScratch.copy(path.position);
      const { grew, didTurn } = path.step(sceneState.occupiedNodes, nextPosScratch);

      if (!grew) {
        sphereDirty = addJoint(oldPosScratch, path.color) || sphereDirty;
        sceneState.paths.splice(i, 1);
        continue;
      }

      sceneState.occupiedNodes.add(getGridKey(path.position));
      if (didTurn) {
        sphereDirty = addJoint(oldPosScratch, path.color) || sphereDirty;
      }
      cylinderDirty = addPipeSegment(oldPosScratch, path.direction, path.color) || cylinderDirty;
    }

    if (sphereDirty && sphereRef.current) {
      markMeshDirty(sphereRef.current);
    }
    if (cylinderDirty && cylinderRef.current) {
      markMeshDirty(cylinderRef.current);
    }

    if (sceneState.cylinderCount >= maxSegments - RESET_MARGIN) {
      sceneState.cylinderCount = 0;
      sceneState.sphereCount = 0;
      sceneState.paths = [];
      sceneState.occupiedNodes.clear();
      if (cylinderRef.current) cylinderRef.current.count = 0;
      if (sphereRef.current) sphereRef.current.count = 0;
    }
  });

  return (
    <group>
      <instancedMesh ref={cylinderRef} args={[undefined, undefined, maxSegments]} count={0}>
        <cylinderGeometry args={[TUBE_RADIUS, TUBE_RADIUS, STEP_LENGTH, 16]} />
        <meshPhysicalMaterial roughness={0.1} metalness={0.9} clearcoat={1} clearcoatRoughness={0.1} />
      </instancedMesh>
      <instancedMesh ref={sphereRef} args={[undefined, undefined, maxSegments]} count={0}>
        <sphereGeometry args={[SPHERE_RADIUS, 16, 16]} />
        <meshPhysicalMaterial roughness={0.1} metalness={0.9} clearcoat={1} clearcoatRoughness={0.1} />
      </instancedMesh>
    </group>
  );
}

function getGridKey(position: THREE.Vector3) {
  const x = Math.round(position.x / STEP_LENGTH);
  const y = Math.round(position.y / STEP_LENGTH);
  const z = Math.round(position.z / STEP_LENGTH);
  return `${x}:${y}:${z}`;
}

function isOutOfBounds(position: THREE.Vector3) {
  return Math.abs(position.x) > BOUNDS || Math.abs(position.y) > BOUNDS || Math.abs(position.z) > BOUNDS;
}

function findFreeStartPosition(occupiedNodes: Set<string>) {
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
    const candidate = new THREE.Vector3(
      Math.floor((Math.random() - 0.5) * ((BOUNDS * 2) / STEP_LENGTH)),
      Math.floor((Math.random() - 0.5) * ((BOUNDS * 2) / STEP_LENGTH)),
      Math.floor((Math.random() - 0.5) * ((BOUNDS * 2) / STEP_LENGTH))
    ).multiplyScalar(STEP_LENGTH);
    if (!occupiedNodes.has(getGridKey(candidate))) {
      return candidate;
    }
  }
  return null;
}

function markMeshDirty(mesh: THREE.InstancedMesh) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
}

function writeInstanceTransform(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3,
  color: number,
  dummy: THREE.Object3D,
  colorObj: THREE.Color,
  quaternion: THREE.Quaternion | null
) {
  dummy.position.copy(position);
  if (quaternion) {
    dummy.quaternion.copy(quaternion);
  } else {
    dummy.quaternion.identity();
  }
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  colorObj.setHex(color);
  mesh.setColorAt(index, colorObj);
}

const PERPENDICULAR_DIRECTIONS = DIRECTIONS.map((currentDirection) =>
  DIRECTIONS.filter((direction) => Math.abs(direction.dot(currentDirection)) < 0.1)
);

function getPerpendicularDirections(direction: THREE.Vector3) {
  const directionIndex = DIRECTIONS.indexOf(direction);
  if (directionIndex >= 0) {
    return PERPENDICULAR_DIRECTIONS[directionIndex];
  }
  return DIRECTIONS.filter((candidateDirection) => Math.abs(candidateDirection.dot(direction)) < 0.1);
}
