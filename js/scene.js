// ===================================
// SCENE SETUP
// ===================================

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

// Scene setup
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
// Disable fog - it was making distant objects (sun, planet from far away) invisible
// scene.fog = new THREE.Fog(0x0a0a1a, 20, 50);

// Camera
// Far plane set to 2000 to accommodate distant sun (1000 units + glow layers + margin)
export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 2000);

// WebGL Renderer
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit to 2x for performance
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// CSS2D Renderer for sign labels
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

// Planet group
export const planetGroup = new THREE.Group();
scene.add(planetGroup);

// Character group
export const characterGroup = new THREE.Group();
scene.add(characterGroup);

// Handle window resize
export function setupWindowResize() {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
    });
}
