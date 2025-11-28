// ===================================
// PHYSICS (Collision detection, gravity, movement)
// ===================================

import * as THREE from 'three';
import { characterGroup, planetGroup } from './scene.js';
import { GRAVITY, CHARACTER_RADIUS, CHARACTER_HEIGHT, FIXED_TIMESTEP } from './config.js';
import { SpatialGrid } from './spatial-grid.js';

// Physics state
export const physics = {
    velocity: new THREE.Vector3(0, 0, 0),
    gravity: GRAVITY,
    isGrounded: false,
    jumpForce: 5.0,
    characterRadius: CHARACTER_RADIUS,
    jumpCharging: false,
    jumpChargeTime: 0
};

// Raycaster pool for reuse
const raycasterPool = {
    raycasters: [new THREE.Raycaster(), new THREE.Raycaster(), new THREE.Raycaster()],
    index: 0,
    get() {
        const rc = this.raycasters[this.index];
        this.index = (this.index + 1) % this.raycasters.length;
        return rc;
    }
};

const downVector = new THREE.Vector3(0, -1, 0);

// Collision meshes cache
export let collisionMeshes = [];

// Spatial grid for optimized collision detection
export let spatialGrid = null;

// Build collision meshes array and spatial grid
export function buildCollisionMeshes() {
    collisionMeshes = [];
    planetGroup.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            if (!name.includes('grass') && !name.includes('pebble')) {
                collisionMeshes.push(child);
            }
        }
    });
    console.log(`Built collision meshes array: ${collisionMeshes.length} meshes`);

    // Build spatial grid for optimized collision detection
    spatialGrid = new SpatialGrid(5); // 5-unit cell size
    spatialGrid.build(collisionMeshes);

    const gridStats = spatialGrid.getStats();
    console.log(`Spatial grid: ${gridStats.totalCells} cells, avg ${gridStats.avgMeshesPerCell} meshes/cell`);
}

// Physics update with swept collision detection
export function updatePhysics(dt, introActive) {
    if (introActive) return;

    // Apply gravity
    physics.velocity.y -= physics.gravity * dt;

    // Calculate movement delta
    const movementDelta = physics.velocity.y * dt;
    const currentY = characterGroup.position.y;
    const newY = currentY + movementDelta;

    // Swept collision detection: raycast along movement path
    const rayOrigin = new THREE.Vector3(
        characterGroup.position.x,
        currentY,
        characterGroup.position.z
    );

    // Get nearby meshes using spatial grid
    const searchRadius = 10; // Search within 10 units
    const nearbyMeshes = spatialGrid
        ? spatialGrid.getNearbyMeshes(rayOrigin, searchRadius)
        : collisionMeshes;

    // If moving down, cast ray along movement path
    if (movementDelta < 0) {
        const movementDistance = Math.abs(movementDelta);
        const raycaster = raycasterPool.get();
        raycaster.set(rayOrigin, downVector);
        raycaster.far = movementDistance + 1.0; // Look ahead of movement

        const intersects = raycaster.intersectObjects(nearbyMeshes, false);

        if (intersects.length > 0) {
            const groundY = intersects[0].point.y;
            const groundOffset = 0.03;
            const targetY = groundY + groundOffset;
            const distanceToGround = currentY - groundY;

            // Dynamic tolerance based on velocity (prevents tunneling)
            // Reduced tolerance for smoother landings
            const velocityFactor = Math.abs(physics.velocity.y);
            const groundTolerance = 0.05 + (velocityFactor * 0.02);

            if (distanceToGround <= groundTolerance && physics.velocity.y <= 0) {
                // Snap to ground
                characterGroup.position.y = targetY;
                physics.velocity.y = 0;
                physics.isGrounded = true;
            } else if (newY <= groundY + groundOffset) {
                // About to clip through - snap to ground instead
                characterGroup.position.y = targetY;
                physics.velocity.y = 0;
                physics.isGrounded = true;
            } else {
                // Free fall
                characterGroup.position.y = newY;
                physics.isGrounded = false;
            }
        } else {
            // No ground detected
            characterGroup.position.y = newY;
            physics.isGrounded = false;
        }
    } else {
        // Moving up (jumping) - no collision check needed
        characterGroup.position.y = newY;
        physics.isGrounded = false;
    }

    // Safety check: if somehow below ground, teleport above
    const safetyRaycaster = raycasterPool.get();
    safetyRaycaster.set(rayOrigin, downVector);
    safetyRaycaster.far = 50;
    const safetyCheck = safetyRaycaster.intersectObjects(nearbyMeshes, false);
    if (safetyCheck.length > 0) {
        const groundY = safetyCheck[0].point.y;
        if (characterGroup.position.y < groundY) {
            console.warn('Character clipped through ground - correcting position');
            characterGroup.position.y = groundY + 0.5;
            physics.velocity.y = 0;
            physics.isGrounded = true;
        }
    }
}

// Check for forward collision (for movement blocking)
export function checkForwardCollision(characterRotation, direction) {
    const forwardRayOrigin = new THREE.Vector3(0, characterGroup.position.y, 0);
    const forwardDirection = new THREE.Vector3(
        -Math.sin(characterRotation) * direction,
        0,
        -Math.cos(characterRotation) * direction
    );

    // Get nearby meshes for collision check
    const searchRadius = 5;
    const nearbyMeshes = spatialGrid
        ? spatialGrid.getNearbyMeshes(forwardRayOrigin, searchRadius)
        : collisionMeshes;

    const forwardRaycaster = raycasterPool.get();
    forwardRaycaster.set(forwardRayOrigin, forwardDirection);
    forwardRaycaster.near = 0;
    forwardRaycaster.far = 0.2;
    const forwardIntersects = forwardRaycaster.intersectObjects(nearbyMeshes, false);

    if (forwardIntersects.length > 0) {
        const obstacleHeight = forwardIntersects[0].point.y;
        const obstacleDistance = forwardIntersects[0].distance;
        const stepHeight = obstacleHeight - (characterGroup.position.y - CHARACTER_HEIGHT);

        if (stepHeight > 0.05 || obstacleDistance < 0.15) {
            return true; // Collision detected
        }
    }

    return false; // No collision
}
