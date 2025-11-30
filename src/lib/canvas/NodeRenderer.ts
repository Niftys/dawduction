import type { PatternNode } from '$lib/types/pattern';
import { Viewport } from './Viewport';

/**
 * Renders pattern tree nodes on canvas
 */
export class NodeRenderer {
	constructor(
		private ctx: CanvasRenderingContext2D,
		private viewport: Viewport
	) {}

	renderNode(node: PatternNode, trackColor: string, depth: number, isSelected: boolean, isPlaying: (id: string) => boolean = () => false, isUpcoming: (id: string) => boolean = () => false, playedNodeIds: Set<string> = new Set(), instrumentType?: string, isGreyedOut: boolean = false, isPlaybackActive: boolean = false, isLoopStart: boolean = false) {
		if (node.x === undefined || node.y === undefined) return;

		const [sx, sy] = this.viewport.worldToScreen(node.x, node.y);
		// Root (depth 0) = 50px circle, everything else is smaller but visible
		let radius: number;
		let opacity: number;
		if (depth === 0) {
			radius = 50; // Root stays large
			opacity = 1.0; // Fully opaque
		} else {
			radius = 18; // Non-root nodes are smaller but visible
			opacity = 0.5; // Less opaque but still readable
		}
		const scaledRadius = radius * this.viewport.zoom;

		// Skip if off-screen
		if (
			sx + scaledRadius < 0 ||
			sx - scaledRadius > this.ctx.canvas.width ||
			sy + scaledRadius < 0 ||
			sy - scaledRadius > this.ctx.canvas.height
		) {
			return;
		}

		// Draw connection lines to children
		if (node.children.length > 0) {
			this.renderConnections(node, trackColor, isPlaying, isUpcoming, playedNodeIds, isGreyedOut, isPlaybackActive, isLoopStart);
		}

		// Draw node circle
		// Use grey color if track is muted or greyed out (solo state)
		const displayColor = isGreyedOut ? '#666666' : this.muteColor(trackColor);
		
		// Check if this is a leaf node with velocity (should show velocity fill)
		const hasVelocity = node.velocity !== undefined && node.velocity !== null && node.children.length === 0;
		const velocity = hasVelocity ? (node.velocity ?? 1.0) : 1.0;
		
		// Draw the circle outline/background first
		this.ctx.beginPath();
		this.ctx.arc(sx, sy, scaledRadius, 0, Math.PI * 2);
		
		if (hasVelocity && velocity < 1.0) {
			// For nodes with velocity < 1.0, draw empty circle background
			this.ctx.strokeStyle = isGreyedOut 
				? `rgba(102, 102, 102, ${opacity * 0.5})` 
				: this.hexToRgba(displayColor, opacity * 0.3);
			this.ctx.lineWidth = 2 * this.viewport.zoom;
			this.ctx.stroke();
			
			// Draw the filled portion from bottom up (like a cup)
			// Calculate the fill height based on velocity
			const fillHeight = scaledRadius * 2 * velocity;
			const fillTop = sy + scaledRadius - fillHeight;
			
			// Create clipping path for the filled portion
			this.ctx.save();
			this.ctx.beginPath();
			this.ctx.arc(sx, sy, scaledRadius, 0, Math.PI * 2);
			this.ctx.clip();
			
			// Draw filled rectangle from bottom
			if (depth === 0) {
				// Root: use gradient for fill
				const fillGradient = this.ctx.createLinearGradient(sx, fillTop, sx, sy + scaledRadius);
				if (isGreyedOut) {
					fillGradient.addColorStop(0, '#666666');
					fillGradient.addColorStop(1, '#888888');
				} else {
					fillGradient.addColorStop(0, this.lightenColor(displayColor, 0.1));
					fillGradient.addColorStop(1, displayColor);
				}
				this.ctx.fillStyle = fillGradient;
			} else {
				// Non-root: solid color
				const rgba = isGreyedOut 
					? `rgba(102, 102, 102, ${opacity})` 
					: this.hexToRgba(displayColor, opacity);
				this.ctx.fillStyle = rgba;
			}
			this.ctx.fillRect(sx - scaledRadius, fillTop, scaledRadius * 2, fillHeight);
			this.ctx.restore();
		} else {
			// Full fill (velocity = 1.0 or non-leaf node)
			if (depth === 0) {
				// Root: full gradient
				const gradient = this.ctx.createRadialGradient(
					sx - scaledRadius * 0.2, 
					sy - scaledRadius * 0.2, 
					0, 
					sx, 
					sy, 
					scaledRadius
				);
				if (isGreyedOut) {
					// Grey gradient for muted/soloed tracks
					gradient.addColorStop(0, '#888888');
					gradient.addColorStop(0.7, '#666666');
					gradient.addColorStop(1, '#444444');
				} else {
					gradient.addColorStop(0, this.lightenColor(displayColor, 0.15));
					gradient.addColorStop(0.7, displayColor);
					gradient.addColorStop(1, this.darkenColor(displayColor, 0.2));
				}
				this.ctx.fillStyle = gradient;
			} else {
				// Non-root: less opaque solid color
				const rgba = isGreyedOut 
					? `rgba(102, 102, 102, ${opacity})` 
					: this.hexToRgba(displayColor, opacity);
				this.ctx.fillStyle = rgba;
			}
			this.ctx.fill();
		}

		// Draw border - root has visible border, others are subtle
		// Priority: playing > upcoming > selected > default
		// Don't show glow if node has been played (unless it's playing again)
		const hasBeenPlayed = playedNodeIds.has(node.id) && !isPlaying(node.id);
		
		if (isPlaying(node.id)) {
			// Playing highlight - bright pulsing glow
			this.ctx.shadowColor = '#00ff88';
			this.ctx.shadowBlur = 15 * this.viewport.zoom;
			this.ctx.strokeStyle = '#00ff88';
			this.ctx.lineWidth = 3 * this.viewport.zoom;
		} else if (isUpcoming(node.id) && !hasBeenPlayed) {
			// Upcoming highlight - dim glow
			this.ctx.shadowColor = '#00ff88';
			this.ctx.shadowBlur = 8 * this.viewport.zoom;
			this.ctx.strokeStyle = '#00ff88';
			this.ctx.lineWidth = 2 * this.viewport.zoom;
			// Make it dimmer by reducing opacity
			this.ctx.globalAlpha = 0.4;
		} else if (isSelected) {
			// Subtle selection glow
			this.ctx.shadowColor = '#7ab8ff';
			this.ctx.shadowBlur = 8 * this.viewport.zoom;
			this.ctx.strokeStyle = '#7ab8ff';
			this.ctx.lineWidth = 2.5 * this.viewport.zoom;
		} else {
			this.ctx.shadowBlur = 0;
			if (depth === 0) {
				this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
				this.ctx.lineWidth = 2 * this.viewport.zoom;
			} else {
				this.ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.3})`;
				this.ctx.lineWidth = 1 * this.viewport.zoom;
			}
		}
		this.ctx.stroke();
		this.ctx.shadowBlur = 0;
		this.ctx.globalAlpha = 1.0; // Reset alpha

		// Draw text in center of node
		if (depth === 0) {
			// Root node: show instrument name in center
			if (instrumentType) {
				const fontSize = 14;
				this.ctx.fillStyle = '#e8e8e8';
				this.ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
				this.ctx.textAlign = 'center';
				this.ctx.textBaseline = 'middle';
				// Capitalize first letter
				const label = instrumentType.charAt(0).toUpperCase() + instrumentType.slice(1);
				this.ctx.fillText(label, sx, sy);
			}
		} else {
			// Non-root nodes: show division or number of children
			// For parent nodes (with children): show division if it differs from default (number of children), otherwise show number of children
			// For leaf nodes (no children): show division
			let displayValue: number;
			if (node.children.length > 0) {
				// Parent node: show division if it's been changed from default, otherwise show number of children
				const defaultDivision = node.children.length;
				if (node.division !== undefined && node.division !== defaultDivision) {
					displayValue = node.division; // Show division if it's been customized
				} else {
					displayValue = defaultDivision; // Show number of children as default
				}
			} else {
				displayValue = node.division || 1; // Leaf node: show division value
			}
			
			const fontSize = 10;
			const textOpacity = opacity;
			this.ctx.fillStyle = `rgba(255, 255, 255, ${textOpacity})`;
			this.ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
			this.ctx.textAlign = 'center';
			this.ctx.textBaseline = 'middle';
			this.ctx.fillText(displayValue.toString(), sx, sy);
		}
	}

	private renderConnections(node: PatternNode, color: string, isPlaying: (id: string) => boolean, isUpcoming: (id: string) => boolean = () => false, playedNodeIds: Set<string> = new Set(), isGreyedOut: boolean = false, isPlaybackActive: boolean = false, isLoopStart: boolean = false) {
		if (node.x === undefined || node.y === undefined) return;

		// Use grey color if greyed out, otherwise use muted color
		const baseColor = isGreyedOut ? '#666666' : this.muteColor(color);
		// Less opaque for non-root connections
		const opacity = 0.2; // Reduced opacity
		const defaultStrokeStyle = isGreyedOut 
			? `rgba(102, 102, 102, ${opacity})`
			: baseColor + Math.floor(opacity * 255).toString(16).padStart(2, '0');
		
		// Helper function to check if a node branch contains any playing leaf nodes
		// We only highlight connections if the branch has directly playing nodes (leaves)
		const hasPlayingLeaf = (n: PatternNode): boolean => {
			// If this is a leaf node and it's playing, return true
			if (n.children.length === 0) {
				return isPlaying(n.id);
			}
			// For non-leaf nodes, check if any descendant is a playing leaf
			for (const child of n.children) {
				if (hasPlayingLeaf(child)) return true;
			}
			return false;
		};
		
		// Helper function to check if a node branch contains any played leaf nodes
		const hasPlayedLeaf = (n: PatternNode): boolean => {
			// If this is a leaf node, check if it's been played
			if (n.children.length === 0) {
				return playedNodeIds.has(n.id);
			}
			// For non-leaf nodes, check if any descendant leaf has been played
			for (const child of n.children) {
				if (hasPlayedLeaf(child)) return true;
			}
			return false;
		};
		
		// Helper function to check if a node branch should show dim glow
		// A branch shows dim glow if:
		// 1. It's the start of a loop (no nodes played yet) - all lines glow
		// 2. OR it has unplayed leaves AND no played leaves AND no playing leaves
		const shouldShowDimGlow = (n: PatternNode): boolean => {
			// Don't show dim glow if this branch has playing leaves (they get bright glow instead)
			if (hasPlayingLeaf(n)) {
				return false;
			}
			
			// At loop start, all lines should glow (except those with playing leaves, handled above)
			if (isLoopStart) {
				return true;
			}
			
			// If any leaf in this branch has been played, don't show dim glow
			if (hasPlayedLeaf(n)) {
				return false;
			}
			
			// Check if this branch has any unplayed leaves
			// If this is a leaf node
			if (n.children.length === 0) {
				// It's unplayed if it's marked as upcoming AND not played
				return isUpcoming(n.id) && !playedNodeIds.has(n.id);
			}
			// For non-leaf nodes, check if any descendant is an unplayed leaf
			for (const child of n.children) {
				if (shouldShowDimGlow(child)) return true;
			}
			return false;
		};
		
		this.ctx.lineCap = 'round';

		for (const child of node.children) {
			if (child.x === undefined || child.y === undefined) continue;

			// Check if this specific child branch contains any playing leaf nodes
			const isChildBranchPlaying = hasPlayingLeaf(child);
			const isChildBranchShouldGlow = shouldShowDimGlow(child);
			
			// Reset state before each connection
			this.ctx.globalAlpha = 1.0;
			this.ctx.shadowBlur = 0;
			this.ctx.shadowColor = 'transparent';
			
			if (isChildBranchPlaying) {
				// Highlight playing connections - bright glow
				this.ctx.strokeStyle = '#00ff88';
				this.ctx.lineWidth = 2 * this.viewport.zoom;
				this.ctx.shadowColor = '#00ff88';
				this.ctx.shadowBlur = 8 * this.viewport.zoom;
			} else if (isChildBranchShouldGlow) {
				// Highlight unplayed connections - dim glow (continuous until played)
				this.ctx.strokeStyle = '#00ff88';
				this.ctx.lineWidth = 2 * this.viewport.zoom; // Slightly thicker for visibility
				this.ctx.shadowColor = '#00ff88';
				this.ctx.shadowBlur = 6 * this.viewport.zoom; // Increased blur for more visibility
				this.ctx.globalAlpha = 0.5; // Slightly brighter for visibility
			} else {
				this.ctx.strokeStyle = defaultStrokeStyle;
				this.ctx.lineWidth = 1 * this.viewport.zoom;
			}

			const [x1, y1] = this.viewport.worldToScreen(node.x, node.y);
			const [x2, y2] = this.viewport.worldToScreen(child.x, child.y);

			this.ctx.beginPath();
			this.ctx.moveTo(x1, y1);
			this.ctx.lineTo(x2, y2);
			this.ctx.stroke();
		}
		
		// Reset shadow and alpha after all connections
		this.ctx.shadowBlur = 0;
		this.ctx.shadowColor = 'transparent';
		this.ctx.globalAlpha = 1.0;
	}

	private muteColor(color: string): string {
		// Mute colors for professional look
		if (color.startsWith('#')) {
			const num = parseInt(color.slice(1), 16);
			const r = (num >> 16) & 0xff;
			const g = (num >> 8) & 0xff;
			const b = num & 0xff;
			// Reduce saturation and brightness
			const mutedR = Math.floor(r * 0.6 + 100 * 0.4);
			const mutedG = Math.floor(g * 0.6 + 100 * 0.4);
			const mutedB = Math.floor(b * 0.6 + 100 * 0.4);
			return `rgb(${mutedR}, ${mutedG}, ${mutedB})`;
		}
		return color;
	}

	private lightenColor(color: string, amount: number): string {
		if (color.startsWith('#')) {
			const num = parseInt(color.slice(1), 16);
			const r = Math.min(255, ((num >> 16) & 0xff) + amount * 100);
			const g = Math.min(255, ((num >> 8) & 0xff) + amount * 100);
			const b = Math.min(255, (num & 0xff) + amount * 100);
			return `rgb(${r}, ${g}, ${b})`;
		}
		return color;
	}

	private darkenColor(color: string, amount: number): string {
		if (color.startsWith('#')) {
			const num = parseInt(color.slice(1), 16);
			const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
			const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
			const b = Math.max(0, (num & 0xff) * (1 - amount));
			return `rgb(${r}, ${g}, ${b})`;
		}
		return color;
	}

	private hexToRgba(hex: string, alpha: number): string {
		if (hex.startsWith('#')) {
			const num = parseInt(hex.slice(1), 16);
			const r = (num >> 16) & 0xff;
			const g = (num >> 8) & 0xff;
			const b = num & 0xff;
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}
		return hex;
	}

	renderTree(rootNode: PatternNode, trackColor: string, isSelected: (id: string) => boolean, isPlaying: (id: string) => boolean = () => false, isUpcoming: (id: string) => boolean = () => false, playedNodeIds: Set<string> = new Set(), instrumentType?: string, isGreyedOut: boolean = false, isPlaybackActive: boolean = false, isLoopStart: boolean = false) {
		const renderRecursive = (node: PatternNode, depth: number) => {
			this.renderNode(node, trackColor, depth, isSelected(node.id), isPlaying, isUpcoming, playedNodeIds, depth === 0 ? instrumentType : undefined, isGreyedOut, isPlaybackActive, isLoopStart);

			for (const child of node.children) {
				renderRecursive(child, depth + 1);
			}
		};

		renderRecursive(rootNode, 0);
	}
}

