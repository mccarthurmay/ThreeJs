// ===================================
// PLANET CONFIGURATIONS
// ===================================

export const planets = [
    {
        id: 'art',
        name: 'Art World',
        color: 0xff6b9d,        // Pink
        size: 0.7,               // Even smaller
        orbitRadius: 4.5,        // Even tighter orbit
        orbitSpeed: 0.005,       // Very slow
        status: 'wip',           // work in progress
        route: '/art',
        description: 'Art portfolio and creative works'
    },
    {
        id: 'videography',
        name: 'Videography World',
        color: 0x4a90e2,        // Blue
        size: 0.85,              // Even smaller
        orbitRadius: 7,          // Even tighter orbit
        orbitSpeed: 0.003,       // Very slow
        status: 'wip',
        route: '/videography',
        description: 'Video projects and cinematography'
    },
    {
        id: 'photography',
        name: 'Photography World',
        color: 0x9b59b6,        // Purple
        size: 1.0,               // Even smaller
        orbitRadius: 9.5,        // Even tighter orbit
        orbitSpeed: 0.002,       // Very slow
        status: 'complete',
        route: 'portfolio.html',
        description: '3D photo gallery experience'
    },
    {
        id: 'blog',
        name: 'Blog World',
        color: 0x2ecc71,        // Green
        size: 0.8,               // Even smaller
        orbitRadius: 12,         // Even tighter orbit
        orbitSpeed: 0.0015,      // Very slow
        status: 'wip',
        route: '/blog',
        description: 'Thoughts, writing, and blog posts'
    },
    {
        id: 'portfolio',
        name: 'Portfolio World',
        color: 0xf39c12,        // Orange
        size: 0.95,              // Even smaller
        orbitRadius: 14.5,       // Even tighter orbit
        orbitSpeed: 0.001,       // Very slow
        status: 'complete',
        route: 'portfolio-world.html',    // Links to walking world
        description: 'Professional portfolio and resume'
    }
];

export const sun = {
    size: 1.8,               // Even smaller sun
    color: 0xfdb813,
    emissive: 0xfdb813,
    emissiveIntensity: 2,
    rotationSpeed: 0.001
};

export const stars = {
    count: 2000,             // More stars
    spread: 250,             // Even wider spread
    size: 0.15               // Slightly bigger
};
