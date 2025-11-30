// ===================================
// MAIN - Entry point and animation loop
// ===================================

import * as THREE from 'three';
import { scene, camera, renderer, labelRenderer, characterGroup, planetGroup, setupWindowResize } from './scene.js';
import { addLightingToScene, updateDayNightCycle, getSunDirection, dayNightAngle } from './lighting.js';
import { addEnvironmentToScene, updateClouds, updateStarsOpacity, atmosphereMaterial } from './environment.js';
import { loadCharacter, updateCharacterAnimations } from './character.js';
import { updatePhysics, physics } from './physics.js';
import { PerformanceManager } from './performance.js';
import { PerformanceProfiler } from './profiler.js';
import { RenderingOptimizer } from './rendering-optimizer.js';
import { ShadowOptimizer } from './shadow-optimizer.js';
import { setupSpotifyPlayer, setupTimeControls, setupEscapeMenu, updateCoordinatesDisplay, introActive, introAnimating, completeIntroAnimation } from './ui.js';
import { loadWorld, updateSignLabels, spaceshipMesh, explosionMesh, introCameraMesh, spaceshipMixer, introAnimationAction } from './world.js';
import { setupControls, handleMovement, updateCamera, detachedCamera, isSprinting } from './controls.js';
import { IntroAnimationManager } from './intro-animation.js';
import { FIXED_TIMESTEP, CAMERA_HEIGHT, CAMERA_DISTANCE_IDLE, SPAWN_HEIGHT } from './config.js';

// Initialize systems
export const profiler = new PerformanceProfiler();
const renderingOptimizer = new RenderingOptimizer(camera, scene);
export const shadowOptimizer = new ShadowOptimizer();
const performanceManager = new PerformanceManager(renderingOptimizer, shadowOptimizer);

// Clock for timing
const clock = new THREE.Clock();

// Fixed timestep physics accumulator
let physicsAccumulator = 0;

// Initialize the application
async function init() {
    console.log('Initializing Max\'s World...');

    // Setup initial camera position
    camera.position.set(0, SPAWN_HEIGHT + CAMERA_HEIGHT, -CAMERA_DISTANCE_IDLE);
    camera.lookAt(0, SPAWN_HEIGHT, 0);

    // Setup scene components
    addLightingToScene(scene);
    addEnvironmentToScene(scene);

    // Setup UI
    setupSpotifyPlayer();
    setupTimeControls();
    setupEscapeMenu(performanceManager, profiler);
    setupControls(performanceManager);
    setupWindowResize();

    // Load assets
    try {
        await loadWorld();
        await loadCharacter();
        console.log('All assets loaded successfully!');

        // Register meshes with rendering optimizer
        renderingOptimizer.registerMeshes(planetGroup);

        // Initialize intro animation manager
        if (spaceshipMesh && explosionMesh && spaceshipMixer && window.spaceshipAction && window.cameraAction && window.explosionAction) {
            const introAnimationManager = new IntroAnimationManager(
                camera,
                scene,
                spaceshipMesh,
                explosionMesh,
                introCameraMesh,
                spaceshipMixer,
                {
                    spaceship: window.spaceshipAction,
                    camera: window.cameraAction,
                    explosion: window.explosionAction
                },
                renderingOptimizer
            );
            window.introAnimationManager = introAnimationManager;
            console.log('✓ IntroAnimationManager created successfully');
        } else {
            console.error('Failed to create IntroAnimationManager. Missing:', {
                spaceshipMesh: !!spaceshipMesh,
                explosionMesh: !!explosionMesh,
                spaceshipMixer: !!spaceshipMixer,
                spaceshipAction: !!window.spaceshipAction,
                cameraAction: !!window.cameraAction,
                explosionAction: !!window.explosionAction
            });
        }
    } catch (error) {
        console.error('Error loading assets:', error);
        return;
    }

    // Start animation loop
    animate();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Clamp deltaTime to prevent huge physics jumps during lag
    let deltaTime = clock.getDelta();
    deltaTime = Math.min(deltaTime, 0.1); // Cap at 100ms (10 FPS minimum)
    const time = clock.getElapsedTime();

    // Update performance manager
    performanceManager.update(deltaTime);

    // === INTRO ANIMATION ===
    if (introAnimating && window.introAnimationManager) {
        const animationComplete = window.introAnimationManager.update(deltaTime);
        if (animationComplete) {
            completeIntroAnimation();
        }
    }

    // === CHARACTER ANIMATIONS ===
    let t = profiler.startMeasure('animations');
    updateCharacterAnimations(deltaTime, physics, isSprinting);
    profiler.endMeasure('animations', t);

    // === DAY/NIGHT CYCLE ===
    t = profiler.startMeasure('dayNight');
    const sunY = updateDayNightCycle(deltaTime);
    profiler.endMeasure('dayNight', t);

    // === ATMOSPHERE ===
    t = profiler.startMeasure('atmosphere');
    const sunDir = getSunDirection();
    atmosphereMaterial.uniforms.sunDirection.value.copy(sunDir);
    profiler.endMeasure('atmosphere', t);

    // === STARS ===
    t = profiler.startMeasure('stars');
    updateStarsOpacity(sunY);
    profiler.endMeasure('stars', t);

    // === CLOUDS ===
    t = profiler.startMeasure('clouds');
    updateClouds(time, sunDir, performanceManager);
    profiler.endMeasure('clouds', t);

    // Gameplay (only when intro is complete)
    if (!introActive && !introAnimating) {
        // Handle jump charge-up delay
        if (physics.jumpCharging) {
            physics.jumpChargeTime += deltaTime;
            const jumpChargeDelay = 0.3; // 300ms charge-up delay

            if (physics.jumpChargeTime >= jumpChargeDelay) {
                // Execute the jump after charge-up
                physics.velocity.y = physics.jumpForce;
                physics.isGrounded = false;
                physics.jumpCharging = false;
            }
        }

        // === PHYSICS ===
        t = profiler.startMeasure('physics');
        physicsAccumulator += deltaTime;
        while (physicsAccumulator >= FIXED_TIMESTEP) {
            updatePhysics(FIXED_TIMESTEP, introActive);
            physicsAccumulator -= FIXED_TIMESTEP;
        }
        profiler.endMeasure('physics', t);

        // Update coordinates display
        updateCoordinatesDisplay(characterGroup.position);

        // === MOVEMENT ===
        t = profiler.startMeasure('movement');
        handleMovement(deltaTime);
        profiler.endMeasure('movement', t);

        // === CAMERA ===
        t = profiler.startMeasure('camera');
        updateCamera(time);
        profiler.endMeasure('camera', t);

        // === SIGN LABELS ===
        t = profiler.startMeasure('signLabels');
        updateSignLabels(detachedCamera);
        profiler.endMeasure('signLabels', t);
    }

    // === FRUSTUM CULLING ===
    t = profiler.startMeasure('culling');
    renderingOptimizer.update();
    profiler.endMeasure('culling', t);

    // === RENDERING ===
    t = profiler.startMeasure('rendering');
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    profiler.endMeasure('rendering', t);

    // Update profiler
    profiler.update(deltaTime);
}

// Start the application
init();
