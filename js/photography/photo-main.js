import * as THREE from 'three';
import { initScene, scene, camera, renderer, state, photoMeshes } from './photo-scene.js';
import { PhotoControls } from './photo-controls.js';
import { loadPhotoDatabase } from './photo-data.js';
import { clusterAndPositionPhotos } from './photo-clustering.js';
import { createAllPhotoMeshes } from './photo-meshes.js';
import { initPhotoInteractions, initLightboxHandlers } from './photo-interactions.js';
import { PhotoLoader } from './photo-loader.js';
import { calculateBoundaryFromPhotos, updateBoundary } from './photo-boundary.js';

let controls;
let photoLoader;
let allPhotoMeshes = [];
let boundaryLine = null;
const clock = new THREE.Clock();

async function init() {
    try {
        initScene();

        const photos = await loadPhotoDatabase();

        if (photos.length === 0) {
            console.error('No photos found. Run classify_cloudinary.py first!');
            return;
        }

        const positionedPhotos = clusterAndPositionPhotos(photos);

        allPhotoMeshes = createAllPhotoMeshes(positionedPhotos);
        allPhotoMeshes.forEach(mesh => scene.add(mesh));
        photoMeshes.push(...allPhotoMeshes);

        // Calculate boundaries based on actual photo positions and dimensions
        const bounds = calculateBoundaryFromPhotos(allPhotoMeshes, 2, 2);
        state.bounds = bounds;

        // Set initial position to middle of bounds
        const middleY = (bounds.minY + bounds.maxY) / 2;
        state.panY = middleY;
        camera.position.set(0, middleY, 50);
        camera.lookAt(0, middleY, 0);

        // Create visual boundary
        boundaryLine = updateBoundary(boundaryLine, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);

        const canvas = renderer.domElement;
        controls = new PhotoControls(canvas, camera, state);

        initPhotoInteractions(canvas, allPhotoMeshes, controls);
        initLightboxHandlers();

        photoLoader = new PhotoLoader(camera, state);

        // Update UI
        document.getElementById('photo-counter').textContent = `${photos.length} photos`;

        // Start animation
        animate();

        console.log('Canvas view initialized with', photos.length, 'photos');
    } catch (error) {
        console.error('Error initializing canvas:', error);
    }
}

let frameCounter = 0;

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    frameCounter++;

    // Update controls
    if (controls) {
        controls.update();
    }

    // Update lazy loader to load/unload photos based on visibility
    if (photoLoader && frameCounter % 5 === 0) {  // Check every 5 frames for performance
        photoLoader.update(allPhotoMeshes);
    }

    // Render
    renderer.render(scene, camera);
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
