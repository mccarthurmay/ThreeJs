// ===================================
// REALISTIC MOON SHADER
// Implements realistic illumination mimicking moon phases
// ===================================

import * as THREE from 'three';

/**
 * Creates a realistic moon material that shows proper illumination
 * based on the sun's position, creating realistic moon phases
 */
export function createMoonMaterial() {
    const vertexShader = `
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform vec3 sunPosition;
        uniform vec3 moonColor;
        uniform float brightness;

        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            // Calculate direction from moon surface to sun
            vec3 lightDir = normalize(sunPosition - vPosition);

            // Calculate how much this fragment faces the sun (dot product)
            float sunAlignment = dot(vNormal, lightDir);

            // Only illuminate the side facing the sun (realistic moon phases)
            // Use smoothstep for a subtle transition at the terminator (day/night boundary)
            float illumination = smoothstep(-0.05, 0.05, sunAlignment);

            // Apply brightness and moon color
            vec3 litColor = moonColor * illumination * brightness;

            // Add very subtle ambient light so dark side isn't completely black
            vec3 ambientColor = moonColor * 0.02;

            // Combine lit and ambient
            vec3 finalColor = litColor + ambientColor;

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            sunPosition: { value: new THREE.Vector3(10, 10, 10) },
            moonColor: { value: new THREE.Color(0xe8e8e8) }, // Realistic moon gray
            brightness: { value: 1.5 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.FrontSide
    });

    return material;
}

/**
 * Updates the moon material's sun position uniform
 * Call this every frame to keep the moon illumination accurate
 */
export function updateMoonMaterial(material, sunPosition) {
    if (material.uniforms && material.uniforms.sunPosition) {
        material.uniforms.sunPosition.value.copy(sunPosition);
    }
}

/**
 * Calculate realistic moon orbital period
 * Real moon takes ~27.3 days to orbit Earth
 * Scale this to match the day/night cycle speed in the game
 *
 * @param {number} dayNightSpeed - The speed of day/night cycle (from config.js)
 * @returns {number} Moon orbital speed in radians per frame
 */
export function calculateMoonOrbitSpeed(dayNightSpeed) {
    // Real moon orbital period: 27.3 days
    // Real Earth rotation: 1 day
    // Ratio: Moon orbits 1/27.3 times as fast as Earth rotates
    const moonToEarthRatio = 1 / 27.3;

    // Moon should orbit slower than the day/night cycle
    return dayNightSpeed * moonToEarthRatio;
}
