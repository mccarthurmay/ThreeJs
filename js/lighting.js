// ===================================
// LIGHTING
// ===================================

import * as THREE from 'three';
import { planetGroup } from './scene.js';
import { SUN_DISTANCE, SUN_RADIUS, MOON_DISTANCE, MOON_RADIUS, DAY_NIGHT_SPEED } from './config.js';
import { shadowOptimizer } from './main.js';

// Ambient light
export const ambientLight = new THREE.AmbientLight(0x808080, 3.0);

// Sun light - cooler tone (less warm/more neutral)
export const sunLight = new THREE.DirectionalLight(0xffffee, 3.0);
// Initial position matches the sun's base direction
const initialSunDirection = new THREE.Vector3(10, 10, 10).normalize();
sunLight.position.copy(initialSunDirection).multiplyScalar(100);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 1200; // Increased to accommodate very distant sun (1000 units + margin)
sunLight.shadow.mapSize.width = 8192;
sunLight.shadow.mapSize.height = 8192;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.normalBias = 0.02;
sunLight.shadow.radius = 2;

// Sun mesh - yellow
const sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00, // Yellow sun
    fog: false
});
export const sun = new THREE.Mesh(sunGeometry, sunMaterial);
sun.name = 'Sun'; // Name for debugging
sun.position.set(10, 10, 10).normalize().multiplyScalar(SUN_DISTANCE);
sun.frustumCulled = false; // Don't cull the sun
sun.renderOrder = 999; // Render last to ensure visibility
console.log('Sun created at local position:', sun.position, 'radius:', SUN_RADIUS);

// Sun glow layers - hidden since sun disc is rendered in atmosphere shader
const sunGlowGeometry = new THREE.SphereGeometry(SUN_RADIUS * 1.6, 32, 32);
const sunGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdd99,
    transparent: true,
    opacity: 0.5,
    fog: false,
    visible: false
});
export const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
sunGlow.name = 'SunGlow';
sunGlow.position.copy(sun.position);
sunGlow.frustumCulled = false; // Don't cull the glow
sunGlow.renderOrder = 998;
sunGlow.visible = false; // Hide to prevent showing through atmosphere

const sunGlow2Geometry = new THREE.SphereGeometry(SUN_RADIUS * 2.2, 32, 32);
const sunGlow2Material = new THREE.MeshBasicMaterial({
    color: 0xffbb66,
    transparent: true,
    opacity: 0.25,
    fog: false,
    visible: false
});
export const sunGlow2 = new THREE.Mesh(sunGlow2Geometry, sunGlow2Material);
sunGlow2.name = 'SunGlow2';
sunGlow2.position.copy(sun.position);
sunGlow2.frustumCulled = false; // Don't cull the glow
sunGlow2.renderOrder = 997;
sunGlow2.visible = false; // Hide to prevent showing through atmosphere

// Moon mesh - brighter gray with realistic material
const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 64);
const moonMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccccc, // Brighter gray moon
    roughness: 0.7,
    metalness: 0.1,
    emissive: 0x888888, // Self-illumination to make it more visible
    emissiveIntensity: 0.5,
    fog: false
});
export const moon = new THREE.Mesh(moonGeometry, moonMaterial);
moon.name = 'Moon';
const sunDirection = new THREE.Vector3(10, 10, 10).normalize();
moon.position.copy(sunDirection).multiplyScalar(-MOON_DISTANCE);
moon.frustumCulled = false; // Don't cull the moon
moon.renderOrder = 996;
moon.castShadow = true;
moon.receiveShadow = true;
console.log('Moon created at local position:', moon.position, 'radius:', MOON_RADIUS);

// Moon glow - very subtle and small
const moonGlowGeometry = new THREE.SphereGeometry(MOON_RADIUS * 1.1, 32, 32);
const moonGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xccddff,
    transparent: true,
    opacity: 0.08,
    fog: false
});
export const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial);
moonGlow.name = 'MoonGlow';
moonGlow.position.copy(moon.position);
moonGlow.frustumCulled = false; // Don't cull the moon glow
moonGlow.renderOrder = 995;

// Moon lights
export const moonLight = new THREE.PointLight(0xaabbdd, 1.0, 100);
moonLight.position.copy(moon.position);

export const moonDirectionalLight = new THREE.DirectionalLight(0x8899cc, 0.3);
moonDirectionalLight.position.copy(moon.position);
moonDirectionalLight.castShadow = true;
moonDirectionalLight.shadow.camera.left = -30;
moonDirectionalLight.shadow.camera.right = 30;
moonDirectionalLight.shadow.camera.top = 30;
moonDirectionalLight.shadow.camera.bottom = -30;
moonDirectionalLight.shadow.camera.near = 0.5;
moonDirectionalLight.shadow.camera.far = 150;
moonDirectionalLight.shadow.mapSize.width = 4096;
moonDirectionalLight.shadow.mapSize.height = 4096;
moonDirectionalLight.shadow.bias = -0.0001;
moonDirectionalLight.shadow.normalBias = 0.02;
moonDirectionalLight.shadow.radius = 3;

// Day/night cycle state
export let dayNightAngle = 0;
export let timeControlEnabled = false;
export let manualTimeValue = 50;

export function setTimeControlEnabled(enabled) {
    timeControlEnabled = enabled;
}

export function setManualTimeValue(value) {
    manualTimeValue = value;
}

export function setDayNightAngle(angle) {
    dayNightAngle = angle;
}

// Add all lighting to scene
export function addLightingToScene(scene) {
    scene.add(ambientLight);
    planetGroup.add(sunLight);
    planetGroup.add(sun);
    planetGroup.add(sunGlow);
    planetGroup.add(sunGlow2);
    planetGroup.add(moon);
    planetGroup.add(moonGlow);
    planetGroup.add(moonLight);
    planetGroup.add(moonDirectionalLight);

    // Register shadow-casting lights with shadow optimizer
    if (shadowOptimizer) {
        shadowOptimizer.registerLights([sunLight, moonDirectionalLight]);
    }
}

// Update day/night cycle
export function updateDayNightCycle(deltaTime) {
    // Auto-increment angle if not manually controlled
    if (!timeControlEnabled) {
        dayNightAngle += DAY_NIGHT_SPEED * deltaTime;
    }

    // Update sun position
    const sunRotationAxis = new THREE.Vector3(1, 0, 0);
    const sunBasePosition = new THREE.Vector3(10, 10, 10).normalize().multiplyScalar(SUN_DISTANCE);
    sun.position.copy(sunBasePosition);
    sun.position.applyAxisAngle(sunRotationAxis, dayNightAngle);
    sunGlow.position.copy(sun.position);
    sunGlow2.position.copy(sun.position);
    sunLight.position.copy(sun.position);

    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();

    // Moon stays on dark side of planet (exactly opposite the sun)
    moon.position.copy(sun.position).normalize().multiplyScalar(-MOON_DISTANCE);
    moonGlow.position.copy(moon.position);
    moonLight.position.copy(moon.position);
    moonDirectionalLight.position.copy(moon.position);

    moonDirectionalLight.target.position.set(0, 0, 0);
    moonDirectionalLight.target.updateMatrixWorld();

    return sun.position.y;
}

// Get sun direction for atmosphere shader
export function getSunDirection() {
    const sunWorldPos = new THREE.Vector3();
    sun.getWorldPosition(sunWorldPos);
    return sunWorldPos.clone().sub(new THREE.Vector3(0, 0, 0)).normalize();
}
