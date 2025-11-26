/**
 * Viewport transformation utilities for canvas pan/zoom
 */
export class Viewport {
	constructor(
		public x: number = 0,
		public y: number = 0,
		public zoom: number = 1.0
	) {}

	/**
	 * Transform world coordinates to screen coordinates
	 */
	worldToScreen(wx: number, wy: number): [number, number] {
		return [
			(wx - this.x) * this.zoom,
			(wy - this.y) * this.zoom
		];
	}

	/**
	 * Transform screen coordinates to world coordinates
	 */
	screenToWorld(sx: number, sy: number): [number, number] {
		return [
			sx / this.zoom + this.x,
			sy / this.zoom + this.y
		];
	}

	/**
	 * Apply viewport transform to canvas context
	 */
	applyTransform(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.translate(-this.x * this.zoom, -this.y * this.zoom);
		ctx.scale(this.zoom, this.zoom);
	}

	/**
	 * Restore canvas context
	 */
	restoreTransform(ctx: CanvasRenderingContext2D) {
		ctx.restore();
	}
}

