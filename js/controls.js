// ===================================
// CONTROLS (Input handling, camera, movement)
// ===================================

import * as THREE from 'three';
import { camera, characterGroup, planetGroup } from './scene.js';
import { keys, hideIntroScreen, introActive } from './ui.js';
import { physics, checkForwardCollision } from './physics.js';
import { animationState, rotateCharacter, jumpAction, setCharacterRotation, getCharacterRotation } from './character.js';
import {
    CAMERA_HEIGHT,
    CAMERA_DISTANCE_IDLE,
    CAMERA_DISTANCE_WALKING,
    CAMERA_SWAY_INTENSITY,
    CAMERA_SWAY_SPEED,
    SWAY_SIDE_AMOUNT,
    SWAY_BOB_AMOUNT,
    SWAY_ROCK_AMOUNT,
    MAX_MOVE_SPEED,
    MOVE_ACCELERATION,
    MOVE_DECELERATION,
    TURN_SPEED,
    SPAWN_HEIGHT,
    BIRD_EYE_DISTANCE_DEFAULT,
    BIRD_EYE_TILT,
    BIRD_EYE_MIN_ZOOM,
    BIRD_EYE_MAX_ZOOM
} from './config.js';

// Camera state
export let currentCameraDistance = CAMERA_DISTANCE_IDLE;
export let cameraShakeOffset = new THREE.Vector3(0, 0, 0);

// Movement state
export let currentMoveSpeed = 0.0;

// Bird's eye view state
export let detachedCamera = false;
export let birdEyeDistance = BIRD_EYE_DISTANCE_DEFAULT;
export let birdEyeTilt = BIRD_EYE_TILT;
export let birdEyeRotation = new THREE.Quaternion();
export let isDragging = false;

// Saved state for returning from bird's eye view
let savedPlanetRotation = new THREE.Quaternion();
let savedCharacterRotation = 0;
let savedCharacterPosition = new THREE.Vector3();

// Setup all input handlers
export function setupControls(performanceManager) {
    // Mouse controls for bird's eye camera
    document.addEventListener('mousedown', (e) => {
        const escapeMenu = document.getElementById('escape-menu');
        const isMenuOpen = escapeMenu.classList.contains('visible');
        const clickedOnMenu = escapeMenu.contains(e.target);

        if (e.button === 0 && detachedCamera && !introActive && !(isMenuOpen && clickedOnMenu)) {
            e.preventDefault();
            isDragging = true;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 0 && detachedCamera) {
            isDragging = false;
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging && detachedCamera && !introActive) {
            const rotateSpeed = 0.005;

            // Create rotation quaternions
            const deltaYaw = new THREE.Quaternion();
            deltaYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.movementX * rotateSpeed);

            const deltaPitch = new THREE.Quaternion();
            deltaPitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), e.movementY * rotateSpeed);

            // Apply rotations to bird's eye rotation
            birdEyeRotation.multiplyQuaternions(deltaYaw, birdEyeRotation);
            birdEyeRotation.multiplyQuaternions(deltaPitch, birdEyeRotation);
        }
    });

    // Scroll wheel for zoom
    document.addEventListener('wheel', (e) => {
        if (!introActive) {
            e.preventDefault();
            if (detachedCamera) {
                // Bird's eye view - zoom distance
                const zoomSpeed = 0.02;
                birdEyeDistance += e.deltaY * zoomSpeed;
                birdEyeDistance = Math.max(BIRD_EYE_MIN_ZOOM, Math.min(BIRD_EYE_MAX_ZOOM, birdEyeDistance));
            } else {
                // Normal player view - adjust FOV
                const fovSpeed = 0.05;
                camera.fov += e.deltaY * fovSpeed;
                camera.fov = Math.max(40, Math.min(100, camera.fov));
                camera.updateProjectionMatrix();
            }
        }
    }, { passive: false });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        if (e.key === 'Enter' && introActive) {
            hideIntroScreen();
            return;
        }

        // Toggle escape menu
        if (e.key === 'Escape' && !introActive) {
            const menu = document.getElementById('escape-menu');
            const overlay = document.getElementById('menu-overlay');

            if (menu.classList.contains('visible')) {
                menu.classList.remove('visible');
                overlay.classList.remove('visible');
            } else {
                menu.classList.add('visible');
                overlay.classList.add('visible');
                performanceManager.updateMenuUI();
            }
            return;
        }

        // Toggle bird's eye view with 'F' key
        if (key === 'f' && !introActive) {
            toggleBirdEyeView();
        }

        // Reset to spawn with 'X' key
        if (key === 'x' && !introActive) {
            resetToSpawn();
        }

        if (key in keys && !introActive) {
            keys[key] = true;
        }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            keys.shift = true;
        }

        if (e.code === 'Space' && !introActive && physics.isGrounded && !physics.jumpCharging) {
            // Start jump charge-up
            physics.jumpCharging = true;
            physics.jumpChargeTime = 0;
            animationState.isJumping = true;

            // Play jump animation if available
            if (jumpAction) {
                jumpAction.reset();
                jumpAction.play();
            }
        }

        // Quality controls
        if (key === 'q') {
            performanceManager.isAuto = !performanceManager.isAuto;
            console.log(`Auto quality: ${performanceManager.isAuto ? 'ON' : 'OFF'}`);
            performanceManager.updateUI();
            localStorage.setItem('autoQuality', performanceManager.isAuto);
        }
    });

    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) keys[key] = false;
        if (e.code === 'Space') keys.space = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            keys.shift = false;
        }
    });
}

// Toggle bird's eye view
function toggleBirdEyeView() {
    if (!detachedCamera) {
        // Enter bird's eye view
        detachedCamera = true;

        // Save current state
        savedPlanetRotation.copy(planetGroup.quaternion);
        savedCharacterRotation = getCharacterRotation();
        savedCharacterPosition.copy(characterGroup.position);

        // Start bird's eye rotation from current planet rotation
        birdEyeRotation.copy(planetGroup.quaternion);

        // Hide character
        characterGroup.visible = false;

        document.getElementById('camera-mode-text').textContent = 'Bird\'s Eye View - Left Click & Drag to Rotate, F: Return to Player';
        console.log('Bird\'s eye view activated - state saved');
    } else {
        // Return to player view
        detachedCamera = false;
        isDragging = false;

        // Restore saved state
        planetGroup.quaternion.copy(savedPlanetRotation);
        setCharacterRotation(savedCharacterRotation);
        characterGroup.position.copy(savedCharacterPosition);

        // Show character again
        characterGroup.visible = true;

        document.getElementById('camera-mode-text').textContent = 'Walk around the planet!';
        console.log('Returned to player-locked camera - state restored');
    }
}

// Reset to spawn
function resetToSpawn() {
    const resetY = window.initialSpawnY || SPAWN_HEIGHT;
    characterGroup.position.set(0, resetY, 0);
    setCharacterRotation(Math.PI);
    physics.velocity.set(0, 0, 0);
    physics.isGrounded = false;

    // Reset planet rotation
    if (window.initialSpawnRotation) {
        planetGroup.quaternion.copy(window.initialSpawnRotation);
    } else {
        planetGroup.quaternion.set(0, 0, 0, 1);
    }

    console.log('Character reset to spawn position');
}

// Handle movement input
export function handleMovement(deltaTime) {
    if (introActive) return;

    const isTurning = keys.a || keys.d;

    if (keys.a) {
        rotateCharacter(TURN_SPEED * deltaTime);
    }
    if (keys.d) {
        rotateCharacter(-TURN_SPEED * deltaTime);
    }

    if (keys.w || keys.s || isTurning) {
        animationState.isWalking = true;
    } else {
        animationState.isWalking = false;
    }

    if (keys.w || keys.s) {
        currentMoveSpeed = Math.min(currentMoveSpeed + MOVE_ACCELERATION * deltaTime, MAX_MOVE_SPEED);
    } else {
        currentMoveSpeed = Math.max(currentMoveSpeed - MOVE_DECELERATION * deltaTime, 0);
    }

    if (currentMoveSpeed > 0 && (keys.w || keys.s) && !detachedCamera) {
        const direction = keys.w ? -1 : 1;

        const forwardWorld = new THREE.Vector3(
            Math.sin(getCharacterRotation()),
            0,
            Math.cos(getCharacterRotation())
        );

        const rotationAxis = new THREE.Vector3().crossVectors(
            new THREE.Vector3(0, 1, 0),
            forwardWorld
        ).normalize();

        const rotation = new THREE.Quaternion();
        rotation.setFromAxisAngle(rotationAxis, direction * currentMoveSpeed * deltaTime);

        // Check for collision
        const collision = checkForwardCollision(getCharacterRotation(), direction);

        if (!collision) {
            planetGroup.quaternion.multiplyQuaternions(rotation, planetGroup.quaternion);
        }
    }
}

// Update camera position
export function updateCamera(time) {
    if (detachedCamera) {
        // Bird's eye view
        planetGroup.quaternion.copy(birdEyeRotation);

        const cameraHeight = birdEyeDistance * Math.cos(birdEyeTilt);
        const cameraHorizontalOffset = birdEyeDistance * Math.sin(birdEyeTilt);

        camera.position.set(0, cameraHeight, cameraHorizontalOffset);
        camera.lookAt(0, 0, 0);
    } else {
        // Normal player-locked camera
        const targetCameraDistance = (keys.w || keys.s) ? CAMERA_DISTANCE_WALKING : CAMERA_DISTANCE_IDLE;
        const lerpFactor = 0.025;
        currentCameraDistance = currentCameraDistance + (targetCameraDistance - currentCameraDistance) * lerpFactor;

        // Update camera sway
        if (animationState.isWalking && currentMoveSpeed > 0) {
            const swayIntensity = (currentMoveSpeed / MAX_MOVE_SPEED) * CAMERA_SWAY_INTENSITY;
            const waddlePhase = time * CAMERA_SWAY_SPEED;

            cameraShakeOffset.x = Math.sin(waddlePhase) * swayIntensity * SWAY_SIDE_AMOUNT;
            cameraShakeOffset.y = (1 - Math.cos(waddlePhase * 2)) * swayIntensity * SWAY_BOB_AMOUNT;
            cameraShakeOffset.z = Math.sin(waddlePhase * 0.5) * swayIntensity * SWAY_ROCK_AMOUNT;
        } else {
            cameraShakeOffset.multiplyScalar(0.85);
        }

        // Update camera position
        const cameraOffsetLocal = new THREE.Vector3(0, CAMERA_HEIGHT, -currentCameraDistance);
        const cameraOffsetWorld = cameraOffsetLocal.clone();
        cameraOffsetWorld.applyAxisAngle(new THREE.Vector3(0, 1, 0), getCharacterRotation());

        camera.position.copy(characterGroup.position).add(cameraOffsetWorld).add(cameraShakeOffset);

        const lookAtOffset = new THREE.Vector3(0, 0.075, 1);
        lookAtOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), getCharacterRotation());
        const lookAtPoint = characterGroup.position.clone().add(lookAtOffset);
        camera.lookAt(lookAtPoint);
    }
}
