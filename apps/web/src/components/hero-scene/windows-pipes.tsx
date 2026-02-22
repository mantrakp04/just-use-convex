import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const BOUNDS = 18;
const STEP_LENGTH = 1.5;
const TUBE_RADIUS = 0.35;
const SPHERE_RADIUS = 0.45;

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
    this.direction = dir.clone();
    this.color = color;
  }

  step() {
    let didTurn = false;
    // 25% chance to change direction
    if (Math.random() < 0.25) {
      // Pick a direction that is perpendicular to current
      const possibleDirs = DIRECTIONS.filter(d => Math.abs(d.dot(this.direction)) < 0.1);
      const newDir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
      this.direction = newDir;
      didTurn = true;
    }

    const nextPos = this.position.clone().add(this.direction.clone().multiplyScalar(STEP_LENGTH));
    
    if (
      Math.abs(nextPos.x) > BOUNDS ||
      Math.abs(nextPos.y) > BOUNDS ||
      Math.abs(nextPos.z) > BOUNDS
    ) {
      return { grew: false, didTurn };
    }

    this.position = nextPos;
    return { grew: true, didTurn };
  }
}

export function WindowsPipes() {
  const maxSegments = 10000;
  const cylinderRef = useRef<THREE.InstancedMesh>(null);
  const sphereRef = useRef<THREE.InstancedMesh>(null);

  const state = useRef({
    paths: [] as PipePath[],
    cylinderCount: 0,
    sphereCount: 0,
    timeSinceLastStep: 0,
    stepInterval: 0.03, // fast generation
  });

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  // initialize
  useEffect(() => {
    state.current.cylinderCount = 0;
    state.current.sphereCount = 0;
    if (cylinderRef.current) cylinderRef.current.count = 0;
    if (sphereRef.current) sphereRef.current.count = 0;
  }, []);

  useFrame((_, delta) => {
    state.current.timeSinceLastStep += delta;

    if (state.current.timeSinceLastStep > state.current.stepInterval) {
      state.current.timeSinceLastStep = 0;

      // Maybe start a new pipe
      if (state.current.paths.length < 8 && Math.random() < 0.1) {
        const start = new THREE.Vector3(
          Math.floor((Math.random() - 0.5) * (BOUNDS * 2 / STEP_LENGTH)),
          Math.floor((Math.random() - 0.5) * (BOUNDS * 2 / STEP_LENGTH)),
          Math.floor((Math.random() - 0.5) * (BOUNDS * 2 / STEP_LENGTH))
        ).multiplyScalar(STEP_LENGTH);
        
        const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        
        state.current.paths.push(new PipePath(start, dir, color));
        
        // Add start joint
        if (sphereRef.current && state.current.sphereCount < maxSegments) {
          dummy.position.copy(start);
          dummy.updateMatrix();
          sphereRef.current.setMatrixAt(state.current.sphereCount, dummy.matrix);
          colorObj.setHex(color);
          sphereRef.current.setColorAt(state.current.sphereCount, colorObj);
          state.current.sphereCount++;
          sphereRef.current.count = state.current.sphereCount;
          sphereRef.current.instanceMatrix.needsUpdate = true;
          if (sphereRef.current.instanceColor) sphereRef.current.instanceColor.needsUpdate = true;
        }
      }

      for (let i = state.current.paths.length - 1; i >= 0; i--) {
        const path = state.current.paths[i];
        
        const oldPos = path.position.clone();
        
        const { grew, didTurn } = path.step();
        
        if (grew) {
          if (didTurn) {
             // Add joint at the turn
             if (sphereRef.current && state.current.sphereCount < maxSegments) {
                dummy.position.copy(oldPos);
                dummy.updateMatrix();
                sphereRef.current.setMatrixAt(state.current.sphereCount, dummy.matrix);
                colorObj.setHex(path.color);
                sphereRef.current.setColorAt(state.current.sphereCount, colorObj);
                state.current.sphereCount++;
                sphereRef.current.count = state.current.sphereCount;
                sphereRef.current.instanceMatrix.needsUpdate = true;
                if (sphereRef.current.instanceColor) sphereRef.current.instanceColor.needsUpdate = true;
             }
          }

          // Add cylinder segment
          if (cylinderRef.current && state.current.cylinderCount < maxSegments) {
             const currentDir = path.direction;
             const segPos = oldPos.clone().add(currentDir.clone().multiplyScalar(STEP_LENGTH / 2));
             dummy.position.copy(segPos);
             dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), currentDir);
             dummy.updateMatrix();
             
             cylinderRef.current.setMatrixAt(state.current.cylinderCount, dummy.matrix);
             colorObj.setHex(path.color);
             cylinderRef.current.setColorAt(state.current.cylinderCount, colorObj);
             state.current.cylinderCount++;
             cylinderRef.current.count = state.current.cylinderCount;
             cylinderRef.current.instanceMatrix.needsUpdate = true;
             if (cylinderRef.current.instanceColor) cylinderRef.current.instanceColor.needsUpdate = true;
          }

        } else {
          // Hit boundary, remove pipe
          // Add end joint for a clean cap
          if (sphereRef.current && state.current.sphereCount < maxSegments) {
             dummy.position.copy(oldPos);
             dummy.updateMatrix();
             sphereRef.current.setMatrixAt(state.current.sphereCount, dummy.matrix);
             colorObj.setHex(path.color);
             sphereRef.current.setColorAt(state.current.sphereCount, colorObj);
             state.current.sphereCount++;
             sphereRef.current.count = state.current.sphereCount;
             sphereRef.current.instanceMatrix.needsUpdate = true;
             if (sphereRef.current.instanceColor) sphereRef.current.instanceColor.needsUpdate = true;
          }
          state.current.paths.splice(i, 1);
        }
      }

      // Reset when full
      if (state.current.cylinderCount >= maxSegments - 50) {
        state.current.cylinderCount = 0;
        state.current.sphereCount = 0;
        state.current.paths = [];
        if (cylinderRef.current) cylinderRef.current.count = 0;
        if (sphereRef.current) sphereRef.current.count = 0;
      }
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
