// ===================================
// PERFORMANCE MANAGER
// ===================================

import { sunLight, moonDirectionalLight, moonLight, moon, moonGlow } from './lighting.js';
import { clouds } from './environment.js';
import { planetGroup } from './scene.js';
import * as THREE from 'three';

// Performance Manager Class - Auto-adjusts quality based on FPS
export class PerformanceManager {
    constructor(renderingOptimizer = null, shadowOptimizer = null) {
        this.renderingOptimizer = renderingOptimizer;
        this.shadowOptimizer = shadowOptimizer;
        this.fpsHistory = [];
        this.fpsHistorySize = 60;
        this.currentFPS = 60;
        this.averageFPS = 60;
        this.minFPS = 60;

        this.currentTier = 0; // 0=Ultra, 1=High, 2=Medium, 3=Low, 4=VeryLow, 5=Potato
        this.targetTier = 0;
        this.isAuto = true;

        this.stabilizationTimer = 0;
        this.stabilizationDelay = 3.0;

        this.showFPS = false;
        this.showQualityIndicator = true;

        // Quality tier definitions
        this.tiers = [
            { name: 'Ultra', cloudCount: 150, shadowRes: 8192, moonShadowRes: 4096, antialiasing: true, moonEnabled: true, updateEveryNFrames: 1 },
            { name: 'High', cloudCount: 100, shadowRes: 4096, moonShadowRes: 2048, antialiasing: true, moonEnabled: true, updateEveryNFrames: 1 },
            { name: 'Medium', cloudCount: 80, shadowRes: 2048, moonShadowRes: 1024, antialiasing: true, moonEnabled: true, updateEveryNFrames: 2 },
            { name: 'Low', cloudCount: 50, shadowRes: 1024, moonShadowRes: 512, antialiasing: false, moonEnabled: true, updateEveryNFrames: 2 },
            { name: 'Very Low', cloudCount: 30, shadowRes: 512, moonShadowRes: 0, antialiasing: false, moonEnabled: false, updateEveryNFrames: 3 },
            { name: 'Potato', cloudCount: 15, shadowRes: 256, moonShadowRes: 0, antialiasing: false, moonEnabled: false, updateEveryNFrames: 4 }
        ];

        this.frameCounter = 0;
        this.lastFrameTime = performance.now();

        // Load saved preferences from localStorage
        const savedAuto = localStorage.getItem('autoQuality');
        if (savedAuto !== null) {
            this.isAuto = savedAuto === 'true';
        }

        const savedTier = localStorage.getItem('qualityTier');
        if (savedTier !== null && !this.isAuto) {
            this.currentTier = parseInt(savedTier);
            this.targetTier = this.currentTier;
        }
    }

    update(deltaTime) {
        // Calculate FPS
        const currentTime = performance.now();
        const frameDelta = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;

        if (frameDelta > 0) {
            this.currentFPS = 1 / frameDelta;
            this.fpsHistory.push(this.currentFPS);

            if (this.fpsHistory.length > this.fpsHistorySize) {
                this.fpsHistory.shift();
            }

            // Calculate average and min FPS
            this.averageFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            this.minFPS = Math.min(...this.fpsHistory);
        }

        // Auto quality adjustment
        if (this.isAuto) {
            this.autoAdjustQuality(deltaTime);
        }

        this.frameCounter++;
    }

    autoAdjustQuality(deltaTime) {
        // Only adjust after we have enough data
        if (this.fpsHistory.length < 30) return;

        let desiredTier = this.currentTier;

        // Check if we need to downgrade
        if (this.averageFPS < 28) {
            desiredTier = Math.min(5, this.currentTier + 1);
        } else if (this.averageFPS < 35 && this.currentTier < 3) {
            desiredTier = Math.min(5, this.currentTier + 1);
        }
        // Check if we can upgrade
        else if (this.averageFPS > 55 && this.currentTier > 0) {
            desiredTier = Math.max(0, this.currentTier - 1);
        }

        // If desired tier changed, start stabilization timer
        if (desiredTier !== this.targetTier) {
            this.targetTier = desiredTier;
            this.stabilizationTimer = 0;
        } else if (desiredTier !== this.currentTier) {
            // Same target, accumulate time
            this.stabilizationTimer += deltaTime;

            // If stable for long enough, apply change
            const delay = (desiredTier > this.currentTier) ? 2.0 : 5.0;
            if (this.stabilizationTimer >= delay) {
                this.applyTier(desiredTier);
                this.stabilizationTimer = 0;
            }
        }
    }

    applyTier(tierIndex) {
        const oldTier = this.currentTier;
        this.currentTier = tierIndex;
        const tier = this.tiers[tierIndex];

        console.log(`Performance: Switching from ${this.tiers[oldTier].name} to ${tier.name} (FPS: ${this.averageFPS.toFixed(1)})`);

        // Apply tier settings
        this.adjustCloudCount(tier.cloudCount);
        this.adjustShadowResolution(tier.shadowRes, tier.moonShadowRes);
        this.adjustMoonLight(tier.moonEnabled);

        // Apply to rendering optimizer if available
        if (this.renderingOptimizer) {
            this.renderingOptimizer.setQualityTier(tierIndex);
        }

        // Apply to shadow optimizer if available
        if (this.shadowOptimizer) {
            this.shadowOptimizer.setQualityTier(tierIndex);
        }

        // Save to localStorage
        localStorage.setItem('qualityTier', tierIndex);

        // Update UI
        this.updateUI();

        // Show notification
        if (oldTier !== tierIndex) {
            this.showNotification(`Quality: ${tier.name}`);
        }
    }

    adjustCloudCount(targetCount) {
        const currentCount = clouds.length;

        if (targetCount < currentCount) {
            // Remove excess clouds
            const toRemove = currentCount - targetCount;
            for (let i = 0; i < toRemove; i++) {
                const cloud = clouds.pop();
                planetGroup.remove(cloud);
            }
        } else if (targetCount > currentCount) {
            // Add more clouds (simplified cloud creation)
            const toAdd = targetCount - currentCount;
            for (let i = 0; i < toAdd; i++) {
                const cloudGroup = new THREE.Group();

                // Random position on sphere
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                const cloudDistance = 16 + 1.5 + Math.random() * 0.5;

                const x = cloudDistance * Math.sin(phi) * Math.cos(theta);
                const y = cloudDistance * Math.cos(phi);
                const z = cloudDistance * Math.sin(phi) * Math.sin(theta);

                cloudGroup.position.set(x, y, z);

                // Create cloud puffs (3-5)
                const puffCount = 3 + Math.floor(Math.random() * 3);
                for (let j = 0; j < puffCount; j++) {
                    const puffSize = 0.15 + Math.random() * 0.1;
                    const puffGeometry = new THREE.SphereGeometry(puffSize, 6, 6);
                    const puffMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
                    const puff = new THREE.Mesh(puffGeometry, puffMaterial);

                    puff.position.set(
                        (Math.random() - 0.5) * 0.2,
                        (Math.random() - 0.5) * 0.1,
                        (Math.random() - 0.5) * 0.2
                    );

                    cloudGroup.add(puff);
                }

                // Store cloud data
                cloudGroup.userData.floatSpeed = 0.3 + Math.random() * 0.5;
                cloudGroup.userData.floatOffset = Math.random() * Math.PI * 2;
                cloudGroup.userData.cloudDistance = cloudDistance;
                cloudGroup.userData.rotationSpeed = (Math.random() - 0.5) * 0.002;
                cloudGroup.userData.orbitSpeed = (Math.random() - 0.5) * 0.0001;
                cloudGroup.userData.orbitAxis = new THREE.Vector3(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                ).normalize();

                clouds.push(cloudGroup);
                planetGroup.add(cloudGroup);
            }
        }
    }

    adjustShadowResolution(sunRes, moonRes) {
        // Update sun shadow resolution
        sunLight.shadow.mapSize.width = sunRes;
        sunLight.shadow.mapSize.height = sunRes;
        sunLight.shadow.map?.dispose();
        sunLight.shadow.map = null;

        // Preserve original shadow quality settings
        sunLight.shadow.bias = -0.0001;
        sunLight.shadow.normalBias = 0.02;
        sunLight.shadow.radius = 2;

        if (moonRes > 0) {
            moonDirectionalLight.castShadow = true;
            moonDirectionalLight.shadow.mapSize.width = moonRes;
            moonDirectionalLight.shadow.mapSize.height = moonRes;
            moonDirectionalLight.shadow.map?.dispose();
            moonDirectionalLight.shadow.map = null;

            // Preserve moon shadow settings
            moonDirectionalLight.shadow.bias = -0.0001;
            moonDirectionalLight.shadow.normalBias = 0.02;
        } else {
            moonDirectionalLight.castShadow = false;
        }
    }

    adjustMoonLight(enabled) {
        moonLight.visible = enabled;
        moonDirectionalLight.visible = enabled;
        moon.visible = enabled;
        moonGlow.visible = enabled;
    }

    updateUI() {
        const indicator = document.getElementById('quality-indicator');
        if (indicator && this.showQualityIndicator) {
            const tier = this.tiers[this.currentTier];
            indicator.textContent = `Quality: ${this.isAuto ? 'Auto (' + tier.name + ')' : tier.name}`;
        }
    }

    showNotification(message) {
        console.log(`📊 ${message}`);
    }

    shouldUpdateThisFrame() {
        const tier = this.tiers[this.currentTier];
        return this.frameCounter % tier.updateEveryNFrames === 0;
    }

    getQualityInfo() {
        return {
            currentFPS: this.currentFPS.toFixed(1),
            averageFPS: this.averageFPS.toFixed(1),
            minFPS: this.minFPS.toFixed(1),
            tier: this.tiers[this.currentTier].name
        };
    }

    cycleQuality() {
        if (this.isAuto) {
            // Switch to manual mode at current tier
            this.isAuto = false;
            console.log(`Manual quality mode: ${this.tiers[this.currentTier].name}`);
            this.applyTier(this.currentTier);
        } else {
            // Cycle through tiers
            this.currentTier++;
            if (this.currentTier >= this.tiers.length) {
                // Back to auto mode
                this.isAuto = true;
                this.currentTier = 0;
                this.applyTier(0);
                console.log('Auto quality mode enabled - reset to Ultra');
            } else {
                this.applyTier(this.currentTier);
            }
        }

        // Update menu UI
        this.updateMenuUI();

        // Save preferences
        localStorage.setItem('autoQuality', this.isAuto);
        if (!this.isAuto) {
            localStorage.setItem('qualityTier', this.currentTier);
        }

        return this.getQualityModeText();
    }

    getQualityModeText() {
        if (this.isAuto) {
            return { mode: 'Auto', tier: this.tiers[this.currentTier].name };
        } else {
            return { mode: this.tiers[this.currentTier].name, tier: '' };
        }
    }

    updateMenuUI() {
        const modeText = document.getElementById('quality-mode-text');
        const tierText = document.getElementById('quality-tier-text');

        if (modeText && tierText) {
            const quality = this.getQualityModeText();
            modeText.textContent = quality.mode;

            if (quality.tier) {
                tierText.textContent = quality.tier;
                tierText.style.display = 'inline-block';
            } else {
                tierText.style.display = 'none';
            }
        }

        // Also update the quality indicator
        this.updateUI();
    }
}
