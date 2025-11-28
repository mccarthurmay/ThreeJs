// ===================================
// PERFORMANCE PROFILER
// Debug tool to identify performance bottlenecks
// ===================================

export class PerformanceProfiler {
    constructor() {
        this.enabled = false;
        this.measurements = {};
        this.history = {};
        this.historySize = 120; // 2 seconds at 60fps
        this.displayElement = null;

        // Load saved preference from localStorage
        const savedEnabled = localStorage.getItem('profilerEnabled');
        if (savedEnabled !== null) {
            this.enabled = savedEnabled === 'true';
        }

        this.categories = [
            'physics',
            'animations',
            'dayNight',
            'atmosphere',
            'stars',
            'clouds',
            'movement',
            'camera',
            'signLabels',
            'culling',
            'rendering',
            'total'
        ];

        // Initialize measurement storage
        this.categories.forEach(cat => {
            this.measurements[cat] = 0;
            this.history[cat] = [];
        });

        this.createDisplayElement();

        // Show/hide based on saved preference
        if (this.enabled) {
            this.displayElement.style.display = 'block';
        }
    }

    createDisplayElement() {
        // Create profiler overlay
        this.displayElement = document.createElement('div');
        this.displayElement.id = 'profiler-overlay';
        this.displayElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: #0f0;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 10px;
            border-radius: 4px;
            z-index: 10000;
            display: none;
            min-width: 300px;
            pointer-events: none;
            line-height: 1.4;
        `;
        document.body.appendChild(this.displayElement);
    }

    toggle() {
        this.enabled = !this.enabled;
        this.displayElement.style.display = this.enabled ? 'block' : 'none';

        // Save preference
        localStorage.setItem('profilerEnabled', this.enabled);

        if (this.enabled) {
            this.reset();
        }

        return this.enabled;
    }

    reset() {
        this.categories.forEach(cat => {
            this.measurements[cat] = 0;
            this.history[cat] = [];
        });
    }

    // Start timing a category
    startMeasure(category) {
        if (!this.enabled) return null;
        return performance.now();
    }

    // End timing a category
    endMeasure(category, startTime) {
        if (!this.enabled || startTime === null) return;

        const duration = performance.now() - startTime;
        this.measurements[category] = duration;
    }

    // Update at end of frame
    update(frameTime) {
        if (!this.enabled) return;

        // Store total frame time
        this.measurements.total = frameTime * 1000; // Convert to ms

        // Update history
        this.categories.forEach(cat => {
            this.history[cat].push(this.measurements[cat]);
            if (this.history[cat].length > this.historySize) {
                this.history[cat].shift();
            }
        });

        // Update display
        this.updateDisplay();
    }

    updateDisplay() {
        const stats = this.getStats();
        const fps = (1000 / stats.total.avg).toFixed(1);

        let html = `<div style="margin-bottom: 8px; color: #fff; font-weight: bold;">PERFORMANCE PROFILER</div>`;
        html += `<div style="margin-bottom: 8px;">FPS: ${fps} | Frame: ${stats.total.avg.toFixed(2)}ms</div>`;
        html += `<div style="border-top: 1px solid #444; margin: 5px 0;"></div>`;

        // Sort categories by average time (descending)
        const sorted = this.categories
            .filter(c => c !== 'total')
            .map(cat => ({ name: cat, ...stats[cat] }))
            .sort((a, b) => b.avg - a.avg);

        sorted.forEach(stat => {
            const percentage = ((stat.avg / stats.total.avg) * 100).toFixed(1);
            const color = this.getColorForPercentage(parseFloat(percentage));
            const barWidth = Math.min(parseFloat(percentage) * 2, 100);

            html += `<div style="margin: 3px 0;">`;
            html += `<div style="display: flex; justify-content: space-between;">`;
            html += `<span>${stat.name}</span>`;
            html += `<span style="color: ${color}">${stat.avg.toFixed(2)}ms (${percentage}%)</span>`;
            html += `</div>`;
            html += `<div style="background: #333; height: 4px; margin-top: 2px;">`;
            html += `<div style="background: ${color}; height: 100%; width: ${barWidth}%;"></div>`;
            html += `</div>`;
            html += `</div>`;
        });

        this.displayElement.innerHTML = html;
    }

    getColorForPercentage(percentage) {
        if (percentage > 40) return '#ff4444'; // Red
        if (percentage > 20) return '#ffaa00'; // Orange
        if (percentage > 10) return '#ffff44'; // Yellow
        return '#44ff44'; // Green
    }

    getStats() {
        const stats = {};

        this.categories.forEach(cat => {
            const history = this.history[cat];
            const avg = history.length > 0
                ? history.reduce((a, b) => a + b, 0) / history.length
                : 0;
            const max = history.length > 0
                ? Math.max(...history)
                : 0;
            const min = history.length > 0
                ? Math.min(...history)
                : 0;

            stats[cat] = { avg, max, min, current: this.measurements[cat] };
        });

        return stats;
    }

    // Get a summary for external use
    getSummary() {
        const stats = this.getStats();
        return {
            fps: (1000 / stats.total.avg).toFixed(1),
            frameTime: stats.total.avg.toFixed(2),
            breakdown: this.categories
                .filter(c => c !== 'total')
                .map(cat => ({
                    name: cat,
                    time: stats[cat].avg.toFixed(2),
                    percentage: ((stats[cat].avg / stats.total.avg) * 100).toFixed(1)
                }))
                .sort((a, b) => parseFloat(b.time) - parseFloat(a.time))
        };
    }
}
