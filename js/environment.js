// ===================================
// ENVIRONMENT (Stars, Atmosphere, Clouds)
// ===================================

import * as THREE from 'three';
import { planetGroup } from './scene.js';
import { NUM_CLOUDS, CLOUD_BASE_DISTANCE, CLOUD_DISTANCE_VARIATION, PLANET_RADIUS } from './config.js';

// Stars - distant galaxy backdrop
const starsGeometry = new THREE.BufferGeometry();
export const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.0, // Larger size since they're farther away
    transparent: true,
    opacity: 1.0,
    depthWrite: false
});
const starsVertices = [];
// Create stars on a distant sphere (like a skybox)
const starDistance = 1500; // Very far away, beyond the sun
for (let i = 0; i < 2000; i++) { // More stars for a denser galaxy
    // Random point on a sphere using spherical coordinates
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = starDistance * Math.sin(phi) * Math.cos(theta);
    const y = starDistance * Math.sin(phi) * Math.sin(theta);
    const z = starDistance * Math.cos(phi);
    starsVertices.push(x, y, z);
}
starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
export const stars = new THREE.Points(starsGeometry, starsMaterial);
stars.frustumCulled = false; // Never cull the stars

// Atmosphere
const atmosphereGeometry = new THREE.SphereGeometry(25, 32, 32);
export const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
        sunDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
        dayColor: { value: new THREE.Color(0x87CEEB) },
        nightColor: { value: new THREE.Color(0x000000) },
        horizonColor: { value: new THREE.Color(0xFF8C00) }
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 sunDirection;
        uniform vec3 dayColor;
        uniform vec3 nightColor;
        uniform vec3 horizonColor;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vec3 normal = normalize(vPosition);
            float sunAlignment = dot(normal, sunDirection);
            float dayStrength = smoothstep(-0.3, 0.3, sunAlignment);

            // More realistic horizon gradient - based on viewing angle
            float horizonFade = abs(normal.y); // 0 at horizon, 1 at zenith/nadir
            horizonFade = pow(horizonFade, 0.6); // Gentle curve for atmospheric depth

            // Only show orange horizon during sunrise/sunset (transition periods)
            // When dayStrength is 0.5, we're at the horizon line (sun rising/setting)
            float transitionStrength = 1.0 - abs(dayStrength - 0.5) * 2.0; // 1.0 at sunset/sunrise, 0.0 at full day/night
            transitionStrength = smoothstep(0.0, 0.5, transitionStrength); // Smooth the transition

            // Horizon glow around sun (only during transitions)
            float horizonGlow = 1.0 - abs(sunAlignment);
            horizonGlow = pow(horizonGlow, 2.0) * transitionStrength * (1.0 - horizonFade * 0.7);

            // Sky gradient from horizon to zenith
            vec3 zenithColor = dayColor;
            vec3 horizonSkyColor = mix(horizonColor, dayColor, 0.3 + (1.0 - transitionStrength) * 0.7); // Less orange during full day
            vec3 skyColor = mix(horizonSkyColor, zenithColor, horizonFade);

            // Blend with night
            skyColor = mix(nightColor, skyColor, dayStrength);

            // Add warm glow near horizon where sun is (only during transitions)
            skyColor = mix(skyColor, horizonColor, horizonGlow * 0.6);

            // Add sun disc directly to the atmosphere
            float sunProximity = max(0.0, sunAlignment);
            float sunDisc = pow(sunProximity, 150.0); // Sharp disc
            vec3 sunColor = vec3(1.0, 0.95, 0.8); // Warm yellow-white sun
            skyColor = mix(skyColor, sunColor, sunDisc * dayStrength);

            // Fully opaque atmosphere
            float alpha = dayStrength * 0.9 + 0.1;

            gl_FragColor = vec4(skyColor, alpha);
        }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
});
export const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);

// Cloud system
export const clouds = [];

// Create a single low poly cloud geometry
function createLowPolyCloud() {
    const cloud = new THREE.Group();

    // Create 3-7 spheres with low poly count for puffy cloud look
    const numPuffs = 3 + Math.floor(Math.random() * 5);

    // Random cloud width factor
    const widthFactor = 0.5 + Math.random() * 1.5; // 0.5 to 2.0x width

    for (let i = 0; i < numPuffs; i++) {
        const puffGeometry = new THREE.SphereGeometry(
            0.3 + Math.random() * 0.5, // Random size between 0.3 and 0.8
            6, // Low poly - 6 segments
            5  // Low poly - 5 segments
        );

        const puffMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            flatShading: true // Emphasize low poly look
        });

        const puff = new THREE.Mesh(puffGeometry, puffMaterial);

        // Position puffs to create cloud shape with variable width
        puff.position.x = (Math.random() - 0.5) * 1.5 * widthFactor; // Wider spread
        puff.position.y = (Math.random() - 0.5) * 0.5; // Keep height variation smaller
        puff.position.z = (Math.random() - 0.5) * 1.5 * widthFactor; // Wider spread

        cloud.add(puff);
    }

    return cloud;
}

// Generate clouds
export function createClouds() {
    for (let i = 0; i < NUM_CLOUDS; i++) {
        const cloud = createLowPolyCloud();

        // Variable distance from planet - creates layered cloud effect
        const baseDistance = CLOUD_BASE_DISTANCE;
        const distanceVariation = Math.random() * CLOUD_DISTANCE_VARIATION;
        const cloudDistance = baseDistance + distanceVariation;

        // Random position on sphere around planet
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        cloud.position.x = cloudDistance * Math.sin(phi) * Math.cos(theta);
        cloud.position.y = cloudDistance * Math.sin(phi) * Math.sin(theta);
        cloud.position.z = cloudDistance * Math.cos(phi);

        // Look at planet center
        cloud.lookAt(0, 0, 0);

        // Random scale for variety (smaller clouds farther away)
        const distanceFactor = (cloudDistance - baseDistance) / CLOUD_DISTANCE_VARIATION;
        const baseScale = 0.5 + Math.random() * 0.8;
        const scale = baseScale * (1 - distanceFactor * 0.3);
        cloud.scale.set(scale, scale, scale);

        // Store animation data
        cloud.userData.cloudDistance = cloudDistance;
        cloud.userData.rotationSpeed = (Math.random() - 0.5) * 0.001;
        cloud.userData.floatOffset = Math.random() * Math.PI * 2;
        cloud.userData.floatSpeed = 0.0005 + Math.random() * 0.0005;
        cloud.userData.orbitSpeed = 0.00005 + Math.random() * 0.00005;
        cloud.userData.orbitAxis = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();

        planetGroup.add(cloud);
        clouds.push(cloud);
    }
}

// Add environment to scene
export function addEnvironmentToScene(scene) {
    planetGroup.add(stars); // Stars rotate with planet to emulate real-world star movement
    scene.add(atmosphere);
    createClouds();
}

// Update clouds animation
export function updateClouds(time, sunDir, performanceManager) {
    if (!performanceManager.shouldUpdateThisFrame()) return;

    clouds.forEach(cloud => {
        // Store the original direction if not already stored
        if (!cloud.userData.baseDirection) {
            cloud.userData.baseDirection = cloud.position.clone().normalize();
        }

        // Gentle floating motion - only adjust the distance, keep the direction
        const floatAmount = Math.sin(time * cloud.userData.floatSpeed + cloud.userData.floatOffset) * 0.3;
        const newDistance = cloud.userData.cloudDistance + floatAmount;

        // Update position while maintaining the base direction
        cloud.position.copy(cloud.userData.baseDirection).multiplyScalar(newDistance);

        // Orbital drift - slowly rotate the base direction
        cloud.userData.baseDirection.applyAxisAngle(cloud.userData.orbitAxis, cloud.userData.orbitSpeed);

        // Slow rotation of the cloud itself
        cloud.rotation.y += cloud.userData.rotationSpeed;

        // Hemisphere-based lighting
        const cloudWorldPos = new THREE.Vector3();
        cloud.getWorldPosition(cloudWorldPos);
        const cloudDir = cloudWorldPos.clone().normalize();

        // Check if cloud is on day side or night side
        const sunAlignment = cloudDir.dot(sunDir);

        let cloudBrightness;
        if (sunAlignment > 0) {
            // Day hemisphere
            const lightingIntensity = Math.pow(sunAlignment, 0.3);
            cloudBrightness = 0.7 + lightingIntensity * 0.3;
        } else {
            // Night hemisphere
            cloudBrightness = 0.05;
        }

        // Update cloud color
        cloud.children.forEach(puff => {
            puff.material.color.setRGB(cloudBrightness, cloudBrightness, cloudBrightness);
        });
    });
}

// Update stars opacity based on day/night
export function updateStarsOpacity(sunY) {
    // Stars are now a distant galaxy backdrop, always visible
    // Keep them at full opacity regardless of day/night
    starsMaterial.opacity = 1.0;
}
