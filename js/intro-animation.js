import * as THREE from 'three';
import { CAMERA_HEIGHT, CAMERA_DISTANCE_IDLE, SPAWN_HEIGHT } from './config.js';
import { characterGroup, planetGroup } from './scene.js';
import { atmosphereMaterial, starsMaterial, atmosphere } from './environment.js';
import { getSunDirection, sun, sunGlow, sunGlow2, moon, moonGlow, ambientLight, sunLight } from './lighting.js';
import { signLabels } from './world.js';

export class IntroAnimationManager {
    constructor(camera, scene, spaceshipMesh, explosionMesh, introCameraMesh, mixer, actions, renderingOptimizer) {
        this.gameplayCamera = camera;
        this.scene = scene;
        this.spaceshipMesh = spaceshipMesh;
        this.explosionMesh = explosionMesh;
        this.introCameraMesh = introCameraMesh;
        this.mixer = mixer;
        this.renderingOptimizer = renderingOptimizer;

        // Actions: { spaceship, camera, explosion }
        this.actions = actions;

        this.isPlaying = false;
        this.fps = 30; // adjust if Blender uses different FPS

        // Store original atmosphere opacity for restoration
        this.originalAtmosphereOpacity = null;

        console.log('IntroAnimationManager created with actions:', Object.keys(actions));
    }

    start() {
        if (!this.actions.spaceship || !this.actions.camera || !this.actions.explosion) {
            console.warn('Missing one of the required actions. Skipping intro.');
            return;
        }

        this.isPlaying = true;

        // Frame ranges
        this.ranges = {
            spaceship: { start: 0, end: 100 },
            camera: { start: 0, end: 115 },
            explosion: { start: 100, end: 129 }
        };

        // Initialize each action
        for (const [name, action] of Object.entries(this.actions)) {
            const range = this.ranges[name];
            const clipDuration = action.getClip().duration;
            const clipFrames = Math.round(clipDuration * this.fps);

            console.log(`[Init] ${name} action: clip duration = ${clipDuration.toFixed(3)}s (${clipFrames} frames), range = ${range.start}-${range.end}`);

            action.time = 0;
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.reset();

            // Start spaceship and camera immediately, but delay explosion until frame 80
            if (name === 'explosion') {
                action.paused = true;
                console.log(`  Explosion will start at spaceship frame ${this.ranges.explosion.start}`);
            } else {
                action.play();
                console.log(`  Starting at time 0s (clip has ${clipFrames} frames)`);
            }
        }

        this.explosionStarted = false;

        // Disable rendering optimizer during intro to prevent lag spikes
        // This ensures all objects are rendered at once (no frustum culling)
        if (this.renderingOptimizer && this.renderingOptimizer.enabled) {
            this.renderingOptimizer.enabled = false;
            // Make all meshes visible
            this.renderingOptimizer.cullableMeshes.forEach(mesh => {
                if (mesh.userData.originallyVisible) {
                    mesh.layers.enable(0);
                }
            });
            this.optimizerWasEnabled = true;
            console.log('Rendering optimizer disabled for intro (all objects rendered at once)');
        } else {
            this.optimizerWasEnabled = false;
        }

        // Make atmosphere distance-based during intro
        // It will only be visible when very close to the planet surface
        if (atmosphere) {
            this.originalAtmosphereVisible = atmosphere.visible;
            atmosphere.visible = true;

            // Store original atmosphere scale
            this.originalAtmosphereScale = atmosphere.scale.clone();

            // Shrink atmosphere significantly so it's only visible when very close to surface
            // Original radius is ~25, shrink to ~15 so it only shows when near planet
            atmosphere.scale.set(0.6, 0.6, 0.6);

            console.log('Atmosphere scaled down for intro (only visible near planet surface)');
        }

        // Make planet and all its objects visible
        if (planetGroup) {
            planetGroup.visible = true;
            // Force all planet children visible
            planetGroup.traverse(child => {
                if (child !== this.spaceshipMesh && child !== this.explosionMesh) {
                    // Make everything visible except spaceship/explosion (we manage those separately)
                    const name = child.name?.toLowerCase() || '';
                    if (!name.includes('spaceship') && !name.includes('explosion')) {
                        child.visible = true;
                    }
                }
            });
            console.log('Planet world fully visible for intro');
        }

        // Ensure sun, moon, and stars are visible
        if (sun) {
            sun.visible = true;
            const sunWorldPos = new THREE.Vector3();
            sun.getWorldPosition(sunWorldPos);
            console.log('Sun world position:', sunWorldPos, 'Distance from origin:', sunWorldPos.length());
        }
        if (sunGlow) sunGlow.visible = true;
        if (sunGlow2) sunGlow2.visible = true;
        if (moon) {
            moon.visible = true;
            const moonWorldPos = new THREE.Vector3();
            moon.getWorldPosition(moonWorldPos);
            console.log('Moon world position:', moonWorldPos, 'Distance from origin:', moonWorldPos.length());
        }
        if (moonGlow) moonGlow.visible = true;

        // Force stars to be fully visible during intro (override day/night opacity)
        if (starsMaterial) {
            this.originalStarsOpacity = starsMaterial.opacity;
            starsMaterial.opacity = 1.0;
        }

        // Hide all sign labels during intro cutscene
        if (signLabels && signLabels.length > 0) {
            signLabels.forEach(signInfo => {
                if (signInfo.labelObject) {
                    signInfo.labelObject.visible = false;
                }
            });
            console.log(`Hid ${signLabels.length} sign labels for intro`);
        }

        // Hide character, show spaceship (keep spaceship in planetGroup so animation works)
        if (characterGroup) characterGroup.visible = false;
        if (this.spaceshipMesh) {
            this.spaceshipMesh.visible = true;
            // Ensure spaceship is always on camera layer to prevent culling
            this.spaceshipMesh.traverse(child => {
                if (child.isMesh || child.isObject3D) {
                    child.layers.enable(0);
                    child.frustumCulled = false; // Disable frustum culling for intro
                }
            });

            console.log('Spaceship visible, position in planetGroup:', this.spaceshipMesh.position);

            // Add directional light to spaceship from sun direction
            const sunDir = getSunDirection();
            this.spaceshipLight = new THREE.DirectionalLight(0xffffff, 2.0);
            this.spaceshipLight.position.copy(sunDir).multiplyScalar(10);
            this.scene.add(this.spaceshipLight);
        }

        // Add enhanced lighting for intro so planet is visible
        // Increase ambient light and sun light during intro
        if (ambientLight) {
            this.originalAmbientIntensity = ambientLight.intensity;
            ambientLight.intensity = 8.0; // Significantly boost ambient light during intro
            console.log('Ambient light boosted to 8.0 for intro visibility');
        }

        if (sunLight) {
            this.originalSunIntensity = sunLight.intensity;
            sunLight.intensity = 5.0; // Boost sun light during intro
            console.log('Sun light boosted to 5.0 for intro visibility');
        }
        // Explosion is initially hidden, will show when spaceship reaches frame 80
        if (this.explosionMesh) {
            this.explosionMesh.visible = false;
            // Also disable frustum culling for explosion
            this.explosionMesh.traverse(child => {
                if (child.isMesh || child.isObject3D) {
                    child.layers.enable(0);
                    child.frustumCulled = false;
                }
            });

            console.log('Explosion ready in planetGroup at position:', this.explosionMesh.position);
        }


        console.log('Intro animation started with frame ranges:', this.ranges);
    }

    update(deltaTime) {
        if (!this.isPlaying) return false;

        this.mixer.update(deltaTime);

        // DEBUG: Frame counter and detailed logging
        const currentFrames = {
            spaceship: Math.round(this.actions.spaceship.time * this.fps),
            camera: Math.round(this.actions.camera.time * this.fps),
            explosion: Math.round(this.actions.explosion.time * this.fps)
        };

        // Log every 10 frames for spaceship (or when visibility changes)
        if (currentFrames.spaceship % 10 === 0 || currentFrames.spaceship > 55) {
            console.log(`[Frame Debug] Spaceship: ${currentFrames.spaceship}, Camera: ${currentFrames.camera}, Explosion: ${currentFrames.explosion}`);
            console.log(`  Spaceship visible: ${this.spaceshipMesh?.visible}, Explosion visible: ${this.explosionMesh?.visible}`);
            console.log(`  Spaceship position:`, this.spaceshipMesh?.position);
            console.log(`  Spaceship scale:`, this.spaceshipMesh?.scale);

            // Check if children are visible AND their material properties
            if (this.spaceshipMesh) {
                let visibleChildren = 0;
                let totalChildren = 0;
                this.spaceshipMesh.traverse(c => {
                    if (c.isMesh) {
                        totalChildren++;
                        if (c.visible) visibleChildren++;

                        // Log material opacity for children
                        if (c.material && currentFrames.spaceship > 55) {
                            console.log(`    Child "${c.name}": visible=${c.visible}, opacity=${c.material.opacity}, transparent=${c.material.transparent}`);
                        }
                    }
                });
                console.log(`  Spaceship children: ${visibleChildren}/${totalChildren} visible`);
            }

            console.log(`  Spaceship action time: ${this.actions.spaceship.time.toFixed(3)}s / ${this.actions.spaceship.getClip().duration.toFixed(3)}s`);
            console.log(`  Explosion action time: ${this.actions.explosion.time.toFixed(3)}s / ${this.actions.explosion.getClip().duration.toFixed(3)}s`);
        }

        // Manage visibility and explosion timing based on timeline
        const explosionStartFrame = this.ranges.explosion.start;

        if (currentFrames.spaceship >= explosionStartFrame) {
            // Start explosion if not already started
            if (!this.explosionStarted) {
                const explosionClipDuration = this.actions.explosion.getClip().duration;
                const explosionClipFrames = Math.round(explosionClipDuration * this.fps);

                console.log(`[Frame ${currentFrames.spaceship}] Starting explosion!`);
                console.log(`  Explosion clip has ${explosionClipFrames} frames (${explosionClipDuration.toFixed(3)}s)`);
                console.log(`  Expected: frames ${this.ranges.explosion.start}-${this.ranges.explosion.end} (${this.ranges.explosion.end - this.ranges.explosion.start} frames)`);

                // If explosion clip is the full timeline (129 frames), start at frame 80
                // If explosion clip is just the explosion part (49 frames), start at frame 0
                if (explosionClipFrames > 100) {
                    // Full timeline - start at frame 80
                    this.actions.explosion.time = this.ranges.explosion.start / this.fps;
                    console.log(`  Starting explosion at time ${this.actions.explosion.time.toFixed(3)}s (frame ${this.ranges.explosion.start})`);
                } else {
                    // Just the explosion part - start at frame 0
                    this.actions.explosion.time = 0;
                    console.log(`  Starting explosion at time 0s (beginning of clip)`);
                }

                this.actions.explosion.paused = false;
                this.actions.explosion.play();
                this.explosionStarted = true;
            }

            // Hide spaceship, show explosion
            if (this.spaceshipMesh) this.spaceshipMesh.visible = false;
            if (this.explosionMesh) {
                this.explosionMesh.visible = true;
                this.explosionMesh.traverse(c => { if (c.isMesh) c.visible = true; });
            }
        } else {
            // Show spaceship, hide explosion
            // AGGRESSIVELY force spaceship visibility every frame
            if (this.spaceshipMesh) {
                this.spaceshipMesh.visible = true;

                // Force all children visible and on camera layer
                this.spaceshipMesh.traverse(c => {
                    c.visible = true; // Force ALL objects visible, not just meshes
                    c.frustumCulled = false; // Disable frustum culling
                    if (c.isMesh) {
                        c.layers.enable(0); // Ensure it's on the camera layer
                        c.material.visible = true; // Force material visible
                        c.material.opacity = 1.0; // Ensure not transparent
                        c.material.transparent = false; // Ensure not transparent mode
                        c.material.needsUpdate = true; // Force material update
                    }
                });

                // Ensure scale is not zero (animation might be scaling it down)
                if (this.spaceshipMesh.scale.x === 0 || this.spaceshipMesh.scale.y === 0 || this.spaceshipMesh.scale.z === 0) {
                    console.warn(`[Frame ${currentFrames.spaceship}] Spaceship scale is ZERO! Resetting to 1,1,1`);
                    this.spaceshipMesh.scale.set(1, 1, 1);
                }
            }
            if (this.explosionMesh) this.explosionMesh.visible = false;
        }

        // Update spaceship lighting from sun
        if (this.spaceshipLight && this.spaceshipMesh) {
            const sunDir = getSunDirection();
            this.spaceshipLight.position.copy(sunDir).multiplyScalar(10);
            this.spaceshipLight.target = this.spaceshipMesh;
        }

        // Sync camera
        if (this.introCameraMesh) this.syncCameraFromBlender();

        // Check if camera action has finished (it's the longest at 115 frames)
        // Explosion may finish earlier since it only runs for 49 frames
        const cameraFinished = this.actions.camera.time >= this.actions.camera.getClip().duration;
        const explosionFinished = this.explosionStarted &&
            this.actions.explosion.time >= this.actions.explosion.getClip().duration;

        if (cameraFinished && (explosionFinished || !this.explosionStarted)) {
            console.log('[Animation Complete] Camera action finished');
            this.complete();
            return true;
        }

        return false;
    }

    syncCameraFromBlender() {
        this.gameplayCamera.position.copy(this.introCameraMesh.getWorldPosition(new THREE.Vector3()));
        this.gameplayCamera.quaternion.copy(this.introCameraMesh.getWorldQuaternion(new THREE.Quaternion()));
    }

    complete() {
        this.isPlaying = false;
        console.log('Intro animation complete');

        // Hide spaceship and explosion (they're still in planetGroup)
        if (this.spaceshipMesh) {
            this.spaceshipMesh.visible = false;
            console.log('Spaceship hidden');
        }
        if (this.explosionMesh) {
            this.explosionMesh.visible = false;
            console.log('Explosion hidden');
        }

        if (characterGroup) characterGroup.visible = true;

        // Restore atmosphere visibility and scale
        if (atmosphere) {
            if (this.originalAtmosphereVisible !== undefined) {
                atmosphere.visible = this.originalAtmosphereVisible;
            }
            if (this.originalAtmosphereScale) {
                atmosphere.scale.copy(this.originalAtmosphereScale);
            }
            console.log('Atmosphere restored');
        }

        // Restore stars opacity (will be controlled by day/night cycle again)
        if (this.originalStarsOpacity !== undefined && starsMaterial) {
            starsMaterial.opacity = this.originalStarsOpacity;
        }

        // Sign labels will be shown/hidden by updateSignLabels() based on proximity
        // (No need to manually restore them here, they'll update on next frame)

        // Remove spaceship light
        if (this.spaceshipLight) {
            this.scene.remove(this.spaceshipLight);
            this.spaceshipLight = null;
        }

        // Restore light intensities
        if (this.originalAmbientIntensity !== undefined && ambientLight) {
            ambientLight.intensity = this.originalAmbientIntensity;
            console.log('Ambient light restored');
        }

        if (this.originalSunIntensity !== undefined && sunLight) {
            sunLight.intensity = this.originalSunIntensity;
            console.log('Sun light restored');
        }

        // Re-enable rendering optimizer if it was enabled before intro
        if (this.optimizerWasEnabled && this.renderingOptimizer) {
            this.renderingOptimizer.enabled = true;
            console.log('Rendering optimizer re-enabled');
        }

        this.gameplayCamera.position.set(0, SPAWN_HEIGHT + CAMERA_HEIGHT, -CAMERA_DISTANCE_IDLE);
        this.gameplayCamera.lookAt(0, SPAWN_HEIGHT, 0);
    }

    skip() {
        console.log('Intro animation skipped');
        for (const action of Object.values(this.actions)) action.stop();
        this.complete();
    }
}
