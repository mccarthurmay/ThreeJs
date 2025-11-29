// ===================================
// SPATIAL GRID
// Grid-based spatial partitioning for physics optimization
// ===================================

import * as THREE from 'three';

export class SpatialGrid {
    constructor(cellSize = 5) {
        this.cellSize = cellSize;
        this.grid = new Map(); // Map of cell keys to arrays of meshes
        this.meshToCells = new Map(); // Track which cells each mesh is in
        this.parentGroup = null; // Parent group for coordinate space
    }

    // Convert world position to grid cell key
    _getCellKey(x, y, z) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        const cellZ = Math.floor(z / this.cellSize);
        return `${cellX},${cellY},${cellZ}`;
    }

    // Get all cell keys that a bounding box overlaps
    _getCellKeysForBounds(min, max) {
        const keys = [];
        const minCell = {
            x: Math.floor(min.x / this.cellSize),
            y: Math.floor(min.y / this.cellSize),
            z: Math.floor(min.z / this.cellSize)
        };
        const maxCell = {
            x: Math.floor(max.x / this.cellSize),
            y: Math.floor(max.y / this.cellSize),
            z: Math.floor(max.z / this.cellSize)
        };

        for (let x = minCell.x; x <= maxCell.x; x++) {
            for (let y = minCell.y; y <= maxCell.y; y++) {
                for (let z = minCell.z; z <= maxCell.z; z++) {
                    keys.push(`${x},${y},${z}`);
                }
            }
        }
        return keys;
    }

    // Build the spatial grid from meshes
    // parentGroup: if provided, positions are stored in this group's local space
    build(meshes, parentGroup = null) {
        console.log(`Building spatial grid with cell size ${this.cellSize}...`);
        this.parentGroup = parentGroup;

        // Clear existing grid
        this.grid.clear();
        this.meshToCells.clear();

        let meshesAdded = 0;

        // Get parent world-to-local transform if needed
        const parentWorldToLocal = new THREE.Matrix4();
        if (parentGroup) {
            parentGroup.updateMatrixWorld(true);
            parentWorldToLocal.copy(parentGroup.matrixWorld).invert();
        }

        meshes.forEach(mesh => {
            // Update world matrix
            mesh.updateWorldMatrix(true, false);

            // Compute bounding box if needed
            if (!mesh.geometry.boundingBox) {
                mesh.geometry.computeBoundingBox();
            }

            // Get bounding box in world space
            const bbox = mesh.geometry.boundingBox.clone();
            bbox.applyMatrix4(mesh.matrixWorld);

            // Transform to parent local space if parent is specified
            if (parentGroup) {
                // Must transform all 8 corners and recompute min/max
                // because rotation can change which corners are min/max
                const corners = [
                    new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
                    new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
                    new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
                    new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
                    new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
                    new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
                    new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
                    new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z)
                ];

                corners.forEach(corner => corner.applyMatrix4(parentWorldToLocal));

                bbox.min.set(Infinity, Infinity, Infinity);
                bbox.max.set(-Infinity, -Infinity, -Infinity);
                corners.forEach(corner => {
                    bbox.min.min(corner);
                    bbox.max.max(corner);
                });
            }

            // Get all cells this mesh overlaps
            const cellKeys = this._getCellKeysForBounds(bbox.min, bbox.max);

            // Add mesh to each cell
            cellKeys.forEach(key => {
                if (!this.grid.has(key)) {
                    this.grid.set(key, []);
                }
                this.grid.get(key).push(mesh);
            });

            // Track which cells this mesh is in
            this.meshToCells.set(mesh, cellKeys);
            meshesAdded++;
        });

        const coordSpace = parentGroup ? 'parent local space' : 'world space';
        console.log(`Spatial grid built in ${coordSpace}: ${meshesAdded} meshes across ${this.grid.size} cells`);
        console.log(`Average meshes per cell: ${(meshesAdded / this.grid.size).toFixed(1)}`);
    }

    // Get nearby meshes for a point with a search radius
    getNearbyMeshes(position, radius = 5) {
        const nearbyMeshes = new Set();

        // Calculate bounding box for search area
        const min = new THREE.Vector3(
            position.x - radius,
            position.y - radius,
            position.z - radius
        );
        const max = new THREE.Vector3(
            position.x + radius,
            position.y + radius,
            position.z + radius
        );

        // Get all cells in search area
        const cellKeys = this._getCellKeysForBounds(min, max);

        // Collect all unique meshes from these cells
        cellKeys.forEach(key => {
            const meshes = this.grid.get(key);
            if (meshes) {
                meshes.forEach(mesh => nearbyMeshes.add(mesh));
            }
        });

        return Array.from(nearbyMeshes);
    }

    // Get meshes in a specific cell
    getMeshesInCell(x, y, z) {
        const key = this._getCellKey(x, y, z);
        return this.grid.get(key) || [];
    }

    // Get stats for debugging
    getStats() {
        let totalMeshReferences = 0;
        let maxMeshesInCell = 0;
        let minMeshesInCell = Infinity;

        this.grid.forEach(meshes => {
            totalMeshReferences += meshes.length;
            maxMeshesInCell = Math.max(maxMeshesInCell, meshes.length);
            minMeshesInCell = Math.min(minMeshesInCell, meshes.length);
        });

        return {
            totalCells: this.grid.size,
            totalMeshReferences,
            avgMeshesPerCell: (totalMeshReferences / this.grid.size).toFixed(1),
            maxMeshesInCell,
            minMeshesInCell: minMeshesInCell === Infinity ? 0 : minMeshesInCell,
            cellSize: this.cellSize
        };
    }
}
