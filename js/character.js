// ===================================
// CHARACTER (Penguin model, animations, controls)
// ===================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { characterGroup } from './scene.js';
import { CHARACTER_HEIGHT, SPAWN_HEIGHT, SPRINT_MULTIPLIER } from './config.js';

// Animation state
export const animationState = {
    isWalking: false,
    isJumping: false
};

// Character model and animations
export let characterModel = null;
export let characterLoaded = false;
export let mixer = null;
export let walkAction = null;
export let idleAction = null;
export let jumpAction = null;

// Character rotation
export let characterRotation = Math.PI; // Start rotated 180 degrees

export function setCharacterRotation(rotation) {
    characterRotation = rotation;
    characterGroup.rotation.y = characterRotation;
}

export function getCharacterRotation() {
    return characterRotation;
}

// Load penguin character model
export function loadCharacter() {
    return new Promise((resolve, reject) => {
        const characterLoader = new GLTFLoader();
        characterLoader.load('manchot_the_penguin.glb',
            function(gltf) {
                console.log('Penguin character loaded successfully!');
                characterModel = gltf.scene;

                // Scale the penguin to appropriate size
                characterModel.scale.set(0.075, 0.075, 0.075);

                // Enable shadows
                characterModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                characterGroup.add(characterModel);

                // Setup animation mixer
                if (gltf.animations && gltf.animations.length > 0) {
                    console.log('Found animations:', gltf.animations.map(a => a.name));

                    mixer = new THREE.AnimationMixer(characterModel);

                    // Try to find walk animation
                    const walkAnim = gltf.animations.find(a =>
                        a.name.toLowerCase().includes('walk') ||
                        a.name.toLowerCase().includes('run') ||
                        a.name.toLowerCase().includes('waddle')
                    ) || gltf.animations[0]; // Fallback to first animation

                    // Try to find idle animation
                    const idleAnim = gltf.animations.find(a =>
                        a.name.toLowerCase().includes('idle') ||
                        a.name.toLowerCase().includes('standing')
                    );

                    // Try to find jump animation
                    const jumpAnim = gltf.animations.find(a =>
                        a.name.toLowerCase().includes('jump') ||
                        a.name.toLowerCase().includes('hop')
                    );

                    if (walkAnim) {
                        walkAction = mixer.clipAction(walkAnim);
                        walkAction.setEffectiveTimeScale(1.2); // Speed up animation
                        console.log('Walk animation set:', walkAnim.name);
                    }

                    if (idleAnim) {
                        idleAction = mixer.clipAction(idleAnim);
                        idleAction.play();
                        console.log('Idle animation set:', idleAnim.name);
                    } else if (walkAction) {
                        console.log('No idle animation found, using walk animation only');
                    }

                    if (jumpAnim) {
                        jumpAction = mixer.clipAction(jumpAnim);
                        jumpAction.setLoop(THREE.LoopOnce);
                        jumpAction.clampWhenFinished = true;
                        jumpAction.setEffectiveTimeScale(1.5);
                        console.log('Jump animation set:', jumpAnim.name);
                    }
                } else {
                    console.warn('No animations found in penguin model');
                }

                characterLoaded = true;
                console.log('Penguin character setup complete');
                resolve();
            },
            function(progress) {
                console.log('Loading penguin:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
            },
            function(error) {
                console.error('Error loading penguin model:', error);
                reject(error);
            }
        );

        // Position character at spawn height
        characterGroup.position.set(0, SPAWN_HEIGHT, 0);
    });
}

// Update character animations
export function updateCharacterAnimations(deltaTime, physics, isSprinting = false) {
    if (!mixer || !characterLoaded) return;

    mixer.update(deltaTime);

    // Check if jump animation finished and character is grounded
    if (animationState.isJumping && physics.isGrounded) {
        animationState.isJumping = false;
    }

    // Update walk animation speed based on sprint state
    if (walkAction) {
        const baseTimeScale = 1.2;
        const sprintTimeScale = baseTimeScale * SPRINT_MULTIPLIER;
        walkAction.setEffectiveTimeScale(isSprinting ? sprintTimeScale : baseTimeScale);
    }

    // Handle jump animation (highest priority)
    if (jumpAction && animationState.isJumping) {
        if (!jumpAction.isRunning()) {
            // Jump animation takes priority, fade out others
            if (walkAction && walkAction.isRunning()) walkAction.fadeOut(0.1);
            if (idleAction && idleAction.isRunning()) idleAction.fadeOut(0.1);
        }
    }
    // Handle walk/idle transitions (when not jumping)
    else if (walkAction && idleAction) {
        if (animationState.isWalking) {
            // Switch to walk
            if (idleAction.isRunning() && !walkAction.isRunning()) {
                idleAction.fadeOut(0.2);
                walkAction.reset().fadeIn(0.2).play();
            }
        } else {
            // Switch to idle
            if (walkAction.isRunning() && !idleAction.isRunning()) {
                walkAction.fadeOut(0.2);
                idleAction.reset().fadeIn(0.2).play();
            }
        }
    } else if (walkAction) {
        // Only walk animation available
        if (animationState.isWalking) {
            if (!walkAction.isRunning()) {
                walkAction.play();
            }
        } else {
            if (walkAction.isRunning()) {
                walkAction.stop();
            }
        }
    }
}

// Rotate character
export function rotateCharacter(delta) {
    characterRotation += delta;
    characterGroup.rotation.y = characterRotation;
}
