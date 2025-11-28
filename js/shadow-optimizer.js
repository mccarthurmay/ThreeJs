// ===================================
// SHADOW OPTIMIZER
// Optimize shadow map updates by skipping frames
// ===================================

export class ShadowOptimizer {
    constructor() {
        this.enabled = true;
        this.frameCounter = 0;
        this.updateEveryNFrames = 2; // Update shadows every N frames
        this.lights = [];

        // Track if shadows need updating
        this.needsUpdate = true;
        this.forceUpdate = false;
    }

    // Register lights for shadow optimization
    registerLights(lightsArray) {
        this.lights = lightsArray.filter(light => light.castShadow);
        console.log(`ShadowOptimizer: Registered ${this.lights.length} shadow-casting lights`);
    }

    // Check if shadows should update this frame
    shouldUpdateShadows() {
        if (!this.enabled || this.forceUpdate) {
            this.forceUpdate = false;
            return true;
        }

        this.frameCounter++;
        const shouldUpdate = this.frameCounter % this.updateEveryNFrames === 0;

        return shouldUpdate;
    }

    // Disable shadow rendering for this frame
    disableShadows() {
        this.lights.forEach(light => {
            light.userData.originalCastShadow = light.castShadow;
            light.castShadow = false;
        });
    }

    // Re-enable shadow rendering
    enableShadows() {
        this.lights.forEach(light => {
            if (light.userData.originalCastShadow !== undefined) {
                light.castShadow = light.userData.originalCastShadow;
            }
        });
    }

    // Force shadow update on next frame
    forceUpdateNextFrame() {
        this.forceUpdate = true;
    }

    // Set quality tier
    setQualityTier(tier) {
        switch(tier) {
            case 0: // Ultra
                this.updateEveryNFrames = 1; // Update every frame
                this.enabled = false; // Don't skip any updates
                break;
            case 1: // High
                this.updateEveryNFrames = 1;
                this.enabled = false;
                break;
            case 2: // Medium
                this.updateEveryNFrames = 2; // Update every 2 frames
                this.enabled = true;
                break;
            case 3: // Low
                this.updateEveryNFrames = 3; // Update every 3 frames
                this.enabled = true;
                break;
            case 4: // Very Low
                this.updateEveryNFrames = 4; // Update every 4 frames
                this.enabled = true;
                break;
            case 5: // Potato
                this.updateEveryNFrames = 6; // Update every 6 frames
                this.enabled = true;
                break;
        }

        console.log(`ShadowOptimizer: Quality tier ${tier}, update every ${this.updateEveryNFrames} frames, enabled: ${this.enabled}`);
    }

    // Get stats
    getStats() {
        return {
            enabled: this.enabled,
            updateEveryNFrames: this.updateEveryNFrames,
            lightsTracked: this.lights.length,
            skipPercentage: this.enabled
                ? ((1 - 1/this.updateEveryNFrames) * 100).toFixed(1)
                : 0
        };
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.enableShadows();
        }
        return this.enabled;
    }
}
