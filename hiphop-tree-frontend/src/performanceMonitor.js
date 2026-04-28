/**
 * performanceMonitor.js
 *
 * Tracks and logs page load performance metrics
 */

class PerformanceMonitor {
  constructor() {
    this.marks = {};
    this.measurements = {};
  }

  mark(label) {
    this.marks[label] = performance.now();
    console.log(`[PERF] ${label}: ${this.marks[label].toFixed(0)}ms`);
  }

  measure(label, startMark, endMark) {
    if (!this.marks[startMark] || !this.marks[endMark]) {
      console.warn(`[PERF] Missing marks for measurement: ${label}`);
      return null;
    }
    const duration = this.marks[endMark] - this.marks[startMark];
    this.measurements[label] = duration;
    console.log(`[PERF] ${label}: ${duration.toFixed(0)}ms`);
    return duration;
  }

  report() {
    console.group('%c📊 HipHopTree Page Load Performance Report', 'color: #FFD700; font-weight: bold; font-size: 14px');

    // Timeline
    console.log('%cTimeline:', 'color: #22d3ee; font-weight: bold');
    Object.entries(this.measurements).forEach(([label, duration]) => {
      const bar = '█'.repeat(Math.ceil(duration / 100));
      console.log(`  ${label}: ${bar} ${duration.toFixed(0)}ms`);
    });

    // Summary
    const totalTime = Object.values(this.measurements).reduce((a, b) => a + b, 0);
    console.log('%cTotal:', 'color: #4ade80; font-weight: bold', `${totalTime.toFixed(0)}ms`);

    // Bottleneck detection
    const slowestItem = Object.entries(this.measurements).sort(([, a], [, b]) => b - a)[0];
    if (slowestItem) {
      console.log(`%cBottleneck: ${slowestItem[0]} (${slowestItem[1].toFixed(0)}ms)`, 'color: #f97316; font-weight: bold');
    }

    console.groupEnd();
  }
}

export const perfMonitor = new PerformanceMonitor();

// Mark page start
perfMonitor.mark('page-start');
