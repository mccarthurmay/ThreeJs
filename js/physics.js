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

// Object pools to prevent garbage collection
const matrixPool = new THREE.Matrix4();
const cachedPlanetTransform = new THREE.Matrix4();
let planetTransformDirty = true;

const vectorPool = {
    v1: new THREE.Vector3(),
    v2: new THREE.Vector3(),
    v3: new THREE.Vector3()
};

const downVector = new THREE.Vector3(0, -1, 0);

// Collision meshes cache
export let collisionMeshes = [];

// Spatial grid for optimized collision detection
export let spatialGrid = null;

// Build collision meshes array and spatial grid
export function buildCollisionMeshes() {
    collisionMeshes = [];
    let skippedLarge = 0;
    planetGroup.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            // Exclude non-collidable objects: grass, pebbles, celestial bodies, atmosphere, stars
            const isNonCollidable =
                name.includes('grass') ||
                name.includes('pebble') ||
                name.includes('sun') ||
                name.includes('moon') ||
                name.includes('star') ||
                name.includes('atmosphere') ||
                name.includes('glow');

            if (!isNonCollidable) {
                // Check bounding box size to detect massive objects that would break spatial grid
                child.geometry.computeBoundingBox();
                const bbox = child.geometry.boundingBox;
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);

                // Skip objects larger than 100 units (they'd create millions of spatial grid cells)
                if (maxDim > 100) {
                    console.warn(`Skipping large mesh "${child.name}" (max dimension: ${maxDim.toFixed(1)})`);
                    skippedLarge++;
                } else {
                    // Enable layer 1 for collision detection (layer 0 is default for rendering)
                    child.layers.enable(1);
                    collisionMeshes.push(child);
                }
            }
        }
    });
    console.log(`Built collision meshes array: ${collisionMeshes.length} meshes (skipped ${skippedLarge} large objects)`);

    // Build spatial grid for optimized collision detection
    // Store in planetGroup local space so grid stays valid as planet rotates
    spatialGrid = new SpatialGrid(5); // 5-unit cell size
    spatialGrid.build(collisionMeshes, planetGroup);

    const gridStats = spatialGrid.getStats();
    console.log(`Spatial grid: ${gridStats.totalCells} cells, avg ${gridStats.avgMeshesPerCell} meshes/cell`);
}

// Physics update with swept collision detection
export function updatePhysics(dt, introActive) {
    if (introActive) return;

    // Cache planet transform once per frame (used in both updatePhysics and checkForwardCollision)
    if (planetTransformDirty) {
        cachedPlanetTransform.copy(planetGroup.matrixWorld).invert();
        planetTransformDirty = false;
    }

    // Apply gravity
    physics.velocity.y -= physics.gravity * dt;

    // Calculate movement delta
    const movementDelta = physics.velocity.y * dt;
    const currentY = characterGroup.position.y;
    const newY = currentY + movementDelta;

    // Swept collision detection: raycast along movement path
    vectorPool.v1.set(characterGroup.position.x, currentY, characterGroup.position.z);
    const rayOrigin = vectorPool.v1;

    // Get nearby meshes using spatial grid
    // Transform character position to planet local space for spatial grid query
    // (spatial grid is in planet's coordinate frame, but planet rotates during gameplay)
    const localRayOrigin = vectorPool.v2.copy(rayOrigin);
    if (spatialGrid) {
        localRayOrigin.applyMatrix4(cachedPlanetTransform);
    }

    const searchRadius = 20; // Search within 20 units for reliable collision detection
    const nearbyMeshes = spatialGrid
        ? spatialGrid.getNearbyMeshes(localRayOrigin, searchRadius)
        : collisionMeshes;

    // If moving down, cast ray along movement path
    if (movementDelta < 0) {
        const movementDistance = Math.abs(movementDelta);
        const raycaster = raycasterPool.get();
        raycaster.set(rayOrigin, downVector);
        raycaster.far = movementDistance + 1.0; // Look ahead of movement
        raycaster.layers.set(1); // Only check collision layer (ignores visibility)

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

    // Safety check: only run if falling fast or not grounded (rare case)
    if (!physics.isGrounded || physics.velocity.y < -10) {
        const safetyRaycaster = raycasterPool.get();
        safetyRaycaster.set(rayOrigin, downVector);
        safetyRaycaster.far = 50;
        safetyRaycaster.layers.set(1); // Only check collision layer (ignores visibility)
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

    // Mark planet transform as dirty for next frame
    planetTransformDirty = true;
}

// Check for forward collision (for movement blocking)
export function checkForwardCollision(characterRotation, direction) {
    vectorPool.v1.set(
        characterGroup.position.x,
        characterGroup.position.y,
        characterGroup.position.z
    );
    const forwardRayOrigin = vectorPool.v1;

    vectorPool.v2.set(
        -Math.sin(characterRotation) * direction,
        0,
        -Math.cos(characterRotation) * direction
    );
    const forwardDirection = vectorPool.v2;

    // Get nearby meshes for collision check
    // Transform character position to planet local space for spatial grid query
    const localForwardOrigin = vectorPool.v3.copy(forwardRayOrigin);
    if (spatialGrid) {
        localForwardOrigin.applyMatrix4(cachedPlanetTransform);
    }

    const searchRadius = 10; // Increased from 5 for better forward collision detection
    const nearbyMeshes = spatialGrid
        ? spatialGrid.getNearbyMeshes(localForwardOrigin, searchRadius)
        : collisionMeshes;

    const forwardRaycaster = raycasterPool.get();
    forwardRaycaster.set(forwardRayOrigin, forwardDirection);
    forwardRaycaster.near = 0;
    forwardRaycaster.far = 0.2;
    forwardRaycaster.layers.set(1); // Only check collision layer (ignores visibility)
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
