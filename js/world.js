// ===================================
// WORLD (Planet model loading, signs)
// ===================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { planetGroup, characterGroup, camera } from './scene.js';
import { signData, SIGN_PROXIMITY_NORMAL, SIGN_PROXIMITY_BIRDS_EYE } from './config.js';
import { buildCollisionMeshes } from './physics.js';
import { updateLoadingProgress, showLoadingError, showIntroScreen } from './ui.js';

// Sign labels storage
export const signLabels = [];

// Spawn cube reference
export let spawnCube = null;

// Spaceship and explosion references for intro animation
export let spaceshipMesh = null;
export let explosionMesh = null;
export let introCameraMesh = null;
export let spaceshipMixer = null;
export let introAnimationAction = null;

// Load the Blender world model
export function loadWorld() {
    return new Promise((resolve, reject) => {
        const planetLoader = new GLTFLoader();
        planetLoader.load('world-only.glb',
            // onLoad callback
            function(gltf) {
                const planet = gltf.scene;

                planet.traverse((child) => {
                    const name = child.name.toLowerCase();

                    // Debug: Log all cameras found in the GLB
                    if (child.isCamera) {
                        console.log(`🎥 CAMERA FOUND: "${child.name}" (type: ${child.type})`);
                    }

                    // Debug: Log IntroCamera and its children
                    if (name === 'introcamera') {
                        console.log(`>>> INTROCAMERA OBJECT FOUND: "${child.name}"`);
                        console.log('>>> INTROCAMERA CHILDREN:');
                        child.traverse((icChild) => {
                            console.log(`  - "${icChild.name}" (type: ${icChild.type}, isCamera: ${icChild.isCamera})`);
                        });
                    }

                    // Check for spaceship parent object (not just meshes)
                    if (name === 'spaceship' && !spaceshipMesh) {
                        spaceshipMesh = child;
                        spaceshipMesh.visible = true; // Make visible for testing
                        console.log(`>>> SPACESHIP OBJECT FOUND: "${child.name}" at position:`, child.position);

                        // Debug: Log all children of spaceship
                        console.log('>>> SPACESHIP CHILDREN:');
                        child.children.forEach((spChild, index) => {
                            console.log(`  [${index}] "${spChild.name}" (type: ${spChild.type}, isCamera: ${spChild.isCamera})`);
                        });
                    }

                    // Check for explosion parent object (not just meshes)
                    if (name === 'explosion' && !explosionMesh) {
                        explosionMesh = child;
                        explosionMesh.visible = false; // Hidden until explosion phase
                        console.log(`>>> EXPLOSION OBJECT FOUND: "${child.name}" at position:`, child.position);
                    }

                    // Check for intro camera object from Blender
                    // Accept "IntroCamera" or just "Camera"
                    if ((name === 'introcamera' || name === 'camera') && !introCameraMesh && child.isCamera) {
                        introCameraMesh = child;
                        console.log(`>>> INTRO CAMERA FOUND: "${child.name}" at position:`, child.position);
                    }

                    if (child.isMesh) {
                        const isGround = name.includes('ground');
                        const isWater = name.includes('water');

                        // Ground and water don't cast shadows, but everything receives them
                        child.castShadow = !isGround && !isWater;
                        child.receiveShadow = true;

                        // Log all meshes to help debug spawn detection
                        if (name.includes('spawn')) {
                            console.log(`>>> SPAWN MESH FOUND: "${child.name}" (lowercase: "${name}")`);
                        }

                        // Check if this is the spawn cube
                        if (name === 'spawn' || name.includes('spawn')) {
                            spawnCube = child;
                            console.log(`Found spawn cube: "${child.name}" at local position:`, child.position);
                        }

                        // Check if this is a sign
                        if (child.name.toLowerCase().includes('sign')) {
                            const signName = child.name.toLowerCase();
                            const signText = signData[signName];

                            // Only create label if sign has text defined
                            if (signText) {
                                // Create label div
                                const labelDiv = document.createElement('div');
                                labelDiv.className = 'sign-label';
                                labelDiv.textContent = signText;

                                // Create CSS2DObject
                                const label = new CSS2DObject(labelDiv);
                                label.visible = false; // Hidden by default

                                // Get world position of the sign for proximity checking
                                child.updateWorldMatrix(true, false);
                                const signWorldPos = new THREE.Vector3();
                                child.getWorldPosition(signWorldPos);

                                // Position label directly on the sign
                                label.position.set(0, -15, 0);
                                child.add(label);

                                // Store reference for proximity checking
                                signLabels.push({
                                    labelObject: label,
                                    mesh: child,
                                    worldPos: signWorldPos
                                });

                                console.log(`Created label for ${child.name}: "${signText}"`);
                            } else {
                                console.log(`Skipped label for ${child.name}: no text defined`);
                            }
                        }
                    }
                });

                planetGroup.add(planet);
                console.log('Blender world model loaded successfully');

                // Load intro animation from GLB
                if (gltf.animations && gltf.animations.length > 0) {
                    console.log('Found animations in world-only.glb:', gltf.animations.map(a => a.name));

                    spaceshipMixer = new THREE.AnimationMixer(planetGroup);

                    // Find individual actions by name
                    const spaceshipAnim = gltf.animations.find(a => a.name.toLowerCase() === "spaceshipaction");
                    const cameraAnim = gltf.animations.find(a => a.name.toLowerCase() === "cameraaction");
                    const explosionAnim = gltf.animations.find(a => a.name.toLowerCase() === "explosionaction");

                    if (spaceshipAnim) {
                        window.spaceshipAction = spaceshipMixer.clipAction(spaceshipAnim);
                        window.spaceshipAction.setLoop(THREE.LoopOnce);
                        window.spaceshipAction.clampWhenFinished = true;
                        console.log(`✓ Loaded SpaceshipAction (${spaceshipAnim.tracks.length} tracks)`);
                    }

                    if (cameraAnim) {
                        window.cameraAction = spaceshipMixer.clipAction(cameraAnim);
                        window.cameraAction.setLoop(THREE.LoopOnce);
                        window.cameraAction.clampWhenFinished = true;
                        console.log(`✓ Loaded CameraAction (${cameraAnim.tracks.length} tracks)`);
                    }

                    if (explosionAnim) {
                        window.explosionAction = spaceshipMixer.clipAction(explosionAnim);
                        window.explosionAction.setLoop(THREE.LoopOnce);
                        window.explosionAction.clampWhenFinished = true;
                        console.log(`✓ Loaded ExplosionAction (${explosionAnim.tracks.length} tracks)`);
                    }
                }



                // Rotate planet so spawn cube is at character position
                rotateToSpawn();

                // Build collision meshes array for physics AFTER rotation
                // This ensures the spatial grid has the correct post-rotation positions
                buildCollisionMeshes();

                // Hide loading screen and show intro screen
                showIntroScreen();

                resolve();
            },
            // onProgress callback
            function(xhr) {
                updateLoadingProgress(xhr);
            },
            // onError callback
            function(error) {
                showLoadingError(error);
                reject(error);
            }
        );
    });
}

// Rotate planet so spawn cube is at character position
function rotateToSpawn() {
    console.log('Checking for spawn cube...', spawnCube ? 'Found!' : 'Not found');
    if (spawnCube) {
        // Get the spawn cube's position
        let spawnLocalPos = new THREE.Vector3();
        spawnCube.getWorldPosition(spawnLocalPos);

        // Convert world position to planet's local space
        const planetWorldToLocal = new THREE.Matrix4();
        planetWorldToLocal.copy(planetGroup.matrixWorld).invert();
        spawnLocalPos.applyMatrix4(planetWorldToLocal);

        console.log(`Spawn cube position in planet space: (${spawnLocalPos.x.toFixed(2)}, ${spawnLocalPos.y.toFixed(2)}, ${spawnLocalPos.z.toFixed(2)})`);

        // Normalize the position to get direction on the sphere surface
        const spawnDirection = spawnLocalPos.clone().normalize();

        // Calculate rotation needed to point this direction "up"
        const upVector = new THREE.Vector3(0, 1, 0);
        const rotationAxis = new THREE.Vector3().crossVectors(spawnDirection, upVector).normalize();
        const rotationAngle = Math.acos(spawnDirection.dot(upVector));

        console.log(`Rotation angle: ${(rotationAngle * 180 / Math.PI).toFixed(2)} degrees`);

        // Apply the rotation
        const spawnRotation = new THREE.Quaternion();
        spawnRotation.setFromAxisAngle(rotationAxis, rotationAngle);
        planetGroup.quaternion.copy(spawnRotation);

        // Update matrices
        planetGroup.updateMatrixWorld(true);

        // Get spawn position for character height
        spawnCube.geometry.computeBoundingBox();
        const bbox = spawnCube.geometry.boundingBox;
        const cubeHeight = bbox.max.y - bbox.min.y;

        // Character height should be at the planet radius + spawn offset
        // Place character directly on top of spawn cube (on the ground)
        const spawnHeight = spawnLocalPos.length();
        const spawnY = spawnHeight + cubeHeight / 2;
        characterGroup.position.set(0, spawnY, 0);

        // Store spawn state globally for reset
        window.initialSpawnRotation = spawnRotation.clone();
        window.initialSpawnY = spawnY;

        console.log(`Character spawned at height: ${characterGroup.position.y.toFixed(2)}`);
    }
}

// Update sign label visibility based on proximity
export function updateSignLabels(detachedCamera) {
    const proximityRadius = detachedCamera ? SIGN_PROXIMITY_BIRDS_EYE : SIGN_PROXIMITY_NORMAL;

    signLabels.forEach(signInfo => {
        // Get current world position of the sign (accounts for planet rotation)
        const signWorldPos = new THREE.Vector3();
        signInfo.mesh.getWorldPosition(signWorldPos);

        // Calculate distance from camera to sign in world space
        const distance = camera.position.distanceTo(signWorldPos);

        // Show label if within radius, hide otherwise
        if (distance < proximityRadius) {
            signInfo.labelObject.visible = true;

            // Scale font size in bird's eye view
            if (detachedCamera) {
                signInfo.labelObject.element.style.fontSize = '20px';
                signInfo.labelObject.element.style.padding = '10px 14px';
            } else {
                signInfo.labelObject.element.style.fontSize = '14px';
                signInfo.labelObject.element.style.padding = '8px 12px';
            }
        } else {
            signInfo.labelObject.visible = false;
        }
    });
}
