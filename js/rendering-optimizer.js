// ===================================
// RENDERING OPTIMIZER
// Frustum culling and render optimizations
// ===================================

import * as THREE from 'three';

export class RenderingOptimizer {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.frustum = new THREE.Frustum();
        this.cameraViewProjectionMatrix = new THREE.Matrix4();

        // Object pools to prevent garbage collection
        this.tempVector = new THREE.Vector3();
        this.tempSphere = new THREE.Sphere();

        // Tracked meshes for culling
        this.cullableMeshes = [];

        // Stats
        this.stats = {
            totalMeshes: 0,
            visibleMeshes: 0,
            culledMeshes: 0
        };

        // Performance settings
        this.updateEveryNFrames = 1; // Update culling every N frames
        this.frameCounter = 0;
        this.enabled = true;

        // Distance culling settings
        this.maxRenderDistance = 100; // Maximum render distance
        this.useFrustumCulling = true;
        this.useDistanceCulling = true;

        // Shadow margin - expand frustum check for shadow casters
        // On a spherical world, shadows can extend ~5-10 units beyond object
        this.shadowCullingMargin = 10; // Extra margin for shadow casters

        // Configure camera to only render layer 0 (visible objects)
        // Layer 1 is reserved for collision detection (always active)
        this.camera.layers.set(0);
    }

    // Register meshes for culling optimization
    registerMeshes(group) {
        this.cullableMeshes = [];

        group.traverse((child) => {
            if (child.isMesh) {
                const name = child.name.toLowerCase();

                // Don't cull essential objects like ground, water, atmosphere, sky
                // Also don't cull intro animation objects (spaceship, explosion)
                // Also don't cull celestial bodies (sun, moon)
                const isEssential =
                    name.includes('ground') ||
                    name.includes('water') ||
                    name.includes('atmosphere') ||
                    name.includes('sky') ||
                    name.includes('spaceship') ||
                    name.includes('explosion') ||
                    name.includes('sun') ||
                    name.includes('moon');

                if (!isEssential) {
                    // Store original visibility state
                    child.userData.originallyVisible = child.visible;
                    child.userData.cullable = true;
                    child.userData.isShadowCaster = child.castShadow;

                    // Setup layers: layer 0 for rendering, layer 1 for collision
                    // Note: physics.js already enabled layer 1, so just ensure layer 0 is enabled
                    child.layers.enable(0);   // Camera can see it (don't use set() as it clears layer 1)
                    child.layers.enable(1);   // Physics can detect it (redundant but explicit)

                    // Calculate bounding sphere for distance culling
                    if (!child.geometry.boundingSphere) {
                        child.geometry.computeBoundingSphere();
                    }

                    this.cullableMeshes.push(child);
                }
            }
        });

        this.stats.totalMeshes = this.cullableMeshes.length;
        console.log(`RenderingOptimizer: Registered ${this.stats.totalMeshes} cullable meshes`);
    }

    // Update frustum culling
    update() {
        if (!this.enabled) return;

        // Only update every N frames for performance
        this.frameCounter++;
        if (this.frameCounter % this.updateEveryNFrames !== 0) {
            return;
        }

        // Update frustum from camera
        this.camera.updateMatrixWorld();
        this.cameraViewProjectionMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.cameraViewProjectionMatrix);

        // Get camera position for distance culling (reuse temp vector)
        this.camera.getWorldPosition(this.tempVector);
        const cameraPos = this.tempVector;

        // Reset stats
        this.stats.visibleMeshes = 0;
        this.stats.culledMeshes = 0;

        // Use for loop instead of forEach for better performance
        const maxDistSq = this.maxRenderDistance * this.maxRenderDistance;

        for (let i = 0; i < this.cullableMeshes.length; i++) {
            const mesh = this.cullableMeshes[i];
            let isVisible = mesh.userData.originallyVisible;

            if (isVisible) {
                // Distance culling (faster check first, use squared distance)
                if (this.useDistanceCulling) {
                    // Cache world position to avoid recalculation
                    if (!mesh.userData.cachedWorldPos || mesh.matrixWorldNeedsUpdate) {
                        mesh.updateWorldMatrix(true, false);
                        if (!mesh.userData.cachedWorldPos) {
                            mesh.userData.cachedWorldPos = new THREE.Vector3();
                        }
                        mesh.getWorldPosition(mesh.userData.cachedWorldPos);
                    }

                    const distSq = cameraPos.distanceToSquared(mesh.userData.cachedWorldPos);

                    if (distSq > maxDistSq) {
                        isVisible = false;
                    }
                }

                // Frustum culling (only if still visible after distance check)
                if (isVisible && this.useFrustumCulling) {
                    // Update matrix only if needed
                    if (mesh.matrixWorldNeedsUpdate) {
                        mesh.updateWorldMatrix(true, false);
                    }

                    // Reuse temp sphere to avoid allocation
                    this.tempSphere.copy(mesh.geometry.boundingSphere);
                    this.tempSphere.applyMatrix4(mesh.matrixWorld);

                    // Expand sphere for shadow casters
                    if (mesh.userData.isShadowCaster) {
                        this.tempSphere.radius += this.shadowCullingMargin;
                    }

                    // Check if sphere intersects frustum
                    if (!this.frustum.intersectsSphere(this.tempSphere)) {
                        isVisible = false;
                    }
                }
            }

            // Update visibility using layers
            if (isVisible) {
                mesh.layers.enable(0);
                this.stats.visibleMeshes++;
            } else {
                mesh.layers.disable(0);
                this.stats.culledMeshes++;
            }
        }
    }

    // Set quality tier (called by performance manager)
    setQualityTier(tier) {
        switch(tier) {
            case 0: // Ultra
            case 1: // High
                this.updateEveryNFrames = 1;
                this.maxRenderDistance = 150;
                this.useFrustumCulling = true;
                this.useDistanceCulling = false;
                break;
            case 2: // Medium
                this.updateEveryNFrames = 2;
                this.maxRenderDistance = 100;
                this.useFrustumCulling = true;
                this.useDistanceCulling = true;
                break;
            case 3: // Low
                this.updateEveryNFrames = 2;
                this.maxRenderDistance = 80;
                this.useFrustumCulling = true;
                this.useDistanceCulling = true;
                break;
            case 4: // Very Low
                this.updateEveryNFrames = 3;
                this.maxRenderDistance = 60;
                this.useFrustumCulling = true;
                this.useDistanceCulling = true;
                break;
            case 5: // Potato
                this.updateEveryNFrames = 4;
                this.maxRenderDistance = 45;
                this.useFrustumCulling = true;
                this.useDistanceCulling = true;
                break;
        }
    }

    getStats() {
        return {
            ...this.stats,
            cullPercentage: this.stats.totalMeshes > 0
                ? ((this.stats.culledMeshes / this.stats.totalMeshes) * 100).toFixed(1)
                : 0
        };
    }

    toggle() {
        this.enabled = !this.enabled;

        // If disabled, make all meshes visible again
        if (!this.enabled) {
            this.cullableMeshes.forEach(mesh => {
                if (mesh.userData.originallyVisible) {
                    mesh.layers.enable(0);  // Restore to camera layer
                }
            });
        }

        return this.enabled;
    }
}
