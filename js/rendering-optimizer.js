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
                const isEssential =
                    name.includes('ground') ||
                    name.includes('water') ||
                    name.includes('atmosphere') ||
                    name.includes('sky');

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

        // Get camera position for distance culling
        const cameraPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPos);

        // Reset stats
        this.stats.visibleMeshes = 0;
        this.stats.culledMeshes = 0;

        // Check each mesh
        this.cullableMeshes.forEach(mesh => {
            let isVisible = mesh.userData.originallyVisible;

            if (isVisible) {
                // Update world matrix to ensure accurate positions
                mesh.updateWorldMatrix(true, false);

                // Distance culling
                if (this.useDistanceCulling) {
                    const meshPos = new THREE.Vector3();
                    mesh.getWorldPosition(meshPos);
                    const distance = cameraPos.distanceTo(meshPos);

                    if (distance > this.maxRenderDistance) {
                        isVisible = false;
                    }
                }

                // Frustum culling
                if (isVisible && this.useFrustumCulling) {
                    // Get bounding sphere in world space
                    const sphere = mesh.geometry.boundingSphere.clone();
                    sphere.applyMatrix4(mesh.matrixWorld);

                    // Expand sphere for shadow casters to account for shadow projection
                    if (mesh.userData.isShadowCaster) {
                        sphere.radius += this.shadowCullingMargin;
                    }

                    // Check if sphere intersects frustum
                    if (!this.frustum.intersectsSphere(sphere)) {
                        isVisible = false;
                    }
                }
            }

            // Update visibility using layers instead of visible property
            // This allows physics raycasting to work on culled objects
            if (isVisible) {
                mesh.layers.enable(0);   // Camera can render it
            } else {
                mesh.layers.disable(0);  // Camera won't render it (culled)
            }
            // Layer 1 always stays enabled for collision detection

            // Update stats
            if (isVisible) {
                this.stats.visibleMeshes++;
            } else {
                this.stats.culledMeshes++;
            }
        });
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
