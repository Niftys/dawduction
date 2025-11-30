<script lang="ts">
	import type { Pattern, PatternNode, Instrument } from '$lib/types/pattern';
	
	const {
		pattern,
		onClick,
		onDelete = null,
		onCopy = null
	}: {
		pattern: Pattern;
		onClick: () => void;
		onDelete?: ((patternId: string) => void) | null;
		onCopy?: ((patternId: string) => void) | null;
	} = $props();
	
	// Helper to mute color for preview
	function muteColor(color: string): string {
		if (color.startsWith('#')) {
			const num = parseInt(color.slice(1), 16);
			const r = (num >> 16) & 0xff;
			const g = (num >> 8) & 0xff;
			const b = num & 0xff;
			const mutedR = Math.floor(r * 0.6 + 100 * 0.4);
			const mutedG = Math.floor(g * 0.6 + 100 * 0.4);
			const mutedB = Math.floor(b * 0.6 + 100 * 0.4);
			return `rgb(${mutedR}, ${mutedG}, ${mutedB})`;
		}
		return color;
	}
	
	// Helper to convert color to rgba
	function colorToRgba(color: string, alpha: number): string {
		if (color.startsWith('#')) {
			const num = parseInt(color.slice(1), 16);
			const r = (num >> 16) & 0xff;
			const g = (num >> 8) & 0xff;
			const b = num & 0xff;
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		} else if (color.startsWith('rgb(')) {
			// Extract rgb values and convert to rgba
			const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
			if (match) {
				return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
			}
		}
		return color;
	}
	
	// Render preview node with proper styling matching the canvas
	function renderPreviewNode(
		node: PatternNode, 
		ctx: CanvasRenderingContext2D, 
		scale: number, 
		offsetX: number, 
		offsetY: number,
		instrumentColor: string,
		depth: number,
		instrumentType?: string
	) {
		const nodeX = node.x || 0;
		const nodeY = node.y || 0;
		
		// Skip nodes with invalid coordinates
		if (nodeX === undefined || nodeY === undefined || isNaN(nodeX) || isNaN(nodeY)) {
			return;
		}
		
		const x = nodeX * scale + offsetX;
		const y = nodeY * scale + offsetY;
		
		// Calculate radius based on depth (matching NodeRenderer)
		// Root (depth 0) = larger, others = smaller
		const baseRadius = depth === 0 ? 50 : 18;
		const radius = baseRadius * scale;
		
		// Draw connections to children first (so they appear behind nodes)
		if (node.children && node.children.length > 0) {
			const mutedColor = muteColor(instrumentColor);
			ctx.strokeStyle = colorToRgba(mutedColor, 0.2); // ~20% opacity
			ctx.lineWidth = Math.max(0.5, 1 * scale);
			ctx.lineCap = 'round';
			
			for (const child of node.children) {
				const childX = (child.x || 0) * scale + offsetX;
				const childY = (child.y || 0) * scale + offsetY;
				
				// Only draw line if child has valid coordinates
				if (child.x !== undefined && child.y !== undefined && !isNaN(child.x) && !isNaN(child.y)) {
					ctx.beginPath();
					ctx.moveTo(x, y);
					ctx.lineTo(childX, childY);
					ctx.stroke();
				}
				
				// Recursively render children
				renderPreviewNode(child, ctx, scale, offsetX, offsetY, instrumentColor, depth + 1, instrumentType);
			}
		}
		
		// Check if this is a leaf node with velocity
		const hasVelocity = node.velocity !== undefined && node.velocity !== null && node.children.length === 0;
		const velocity = hasVelocity ? (node.velocity ?? 1.0) : 1.0;
		const mutedColor = muteColor(instrumentColor);
		
		// Draw node circle
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		
		if (hasVelocity && velocity < 1.0) {
			// Draw empty circle background
			ctx.strokeStyle = colorToRgba(mutedColor, 0.3); // ~30% opacity
			ctx.lineWidth = Math.max(1, 2 * scale);
			ctx.stroke();
			
			// Draw the filled portion from bottom up
			const fillHeight = radius * 2 * velocity;
			const fillTop = y + radius - fillHeight;
			
			ctx.save();
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, Math.PI * 2);
			ctx.clip();
			
			// Draw filled rectangle from bottom
			if (depth === 0) {
				// Root: use gradient
				const fillGradient = ctx.createLinearGradient(x, fillTop, x, y + radius);
				fillGradient.addColorStop(0, mutedColor);
				fillGradient.addColorStop(1, colorToRgba(mutedColor, 0.8));
				ctx.fillStyle = fillGradient;
			} else {
				// Non-root: solid color with opacity
				ctx.fillStyle = colorToRgba(mutedColor, 0.5); // ~50% opacity
			}
			ctx.fillRect(x - radius, fillTop, radius * 2, fillHeight);
			ctx.restore();
		} else {
			// Full fill
			if (depth === 0) {
				// Root: gradient
				const gradient = ctx.createRadialGradient(
					x - radius * 0.2, 
					y - radius * 0.2, 
					0, 
					x, 
					y, 
					radius
				);
				gradient.addColorStop(0, colorToRgba(mutedColor, 1.0));
				gradient.addColorStop(0.7, mutedColor);
				gradient.addColorStop(1, colorToRgba(mutedColor, 0.8));
				ctx.fillStyle = gradient;
			} else {
				// Non-root: solid color with opacity
				ctx.fillStyle = colorToRgba(mutedColor, 0.5); // ~50% opacity
			}
			ctx.fill();
		}
		
		// Draw border
		ctx.strokeStyle = depth === 0 
			? 'rgba(255, 255, 255, 0.3)' 
			: 'rgba(255, 255, 255, 0.2)';
		ctx.lineWidth = depth === 0 
			? Math.max(1, 2 * scale) 
			: Math.max(0.5, 1 * scale);
		ctx.stroke();
		
		// Draw number
		let displayValue: number;
		if (depth === 1 && node.children.length > 0) {
			displayValue = node.children.length; // Show number of subdivisions
		} else {
			displayValue = node.division; // Show division value
		}
		
		const fontSize = depth === 0 ? 18 * scale : 10 * scale;
		ctx.fillStyle = depth === 0 ? '#e8e8e8' : 'rgba(255, 255, 255, 0.8)';
		ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(displayValue.toString(), x, y);
		
		// Draw instrument label for root nodes
		if (depth === 0 && instrumentType) {
			const labelY = y + radius + 20 * scale;
			const labelFontSize = 12 * scale;
			ctx.font = `${labelFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
			ctx.fillStyle = '#b0b0b0';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			// Capitalize first letter
			const label = instrumentType.charAt(0).toUpperCase() + instrumentType.slice(1);
			ctx.fillText(label, x, labelY);
		}
	}
	
	// Get all instruments from pattern (handles both new and legacy formats)
	function getPatternInstruments(pattern: Pattern): Instrument[] {
		if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
			return pattern.instruments;
		} else if (pattern.instrumentType && pattern.patternTree) {
			// Legacy format: convert single instrument
			return [{
				id: pattern.id,
				instrumentType: pattern.instrumentType,
				patternTree: pattern.patternTree,
				settings: pattern.settings || {},
				instrumentSettings: pattern.instrumentSettings,
				color: pattern.color || '#7ab8ff',
				volume: pattern.volume ?? 1.0,
				pan: pattern.pan ?? 0.0,
				mute: pattern.mute,
				solo: pattern.solo
			}];
		}
		return [];
	}
	
	let canvas: HTMLCanvasElement;
	let canvasContext: CanvasRenderingContext2D | null = null;
	
	$effect(() => {
		if (canvas && pattern) {
			canvasContext = canvas.getContext('2d');
			if (canvasContext) {
			// Clear canvas
			canvasContext.clearRect(0, 0, canvas.width, canvas.height);
			
			// Set background
			canvasContext.fillStyle = '#1a1a1a';
			canvasContext.fillRect(0, 0, canvas.width, canvas.height);
			
			// Get all instruments from pattern
			const instruments = getPatternInstruments(pattern);
			
			// Only proceed if we have instruments
			if (instruments.length > 0) {
				// Calculate bounds of all pattern trees (including all nodes from all instruments)
				let minX = Infinity, maxX = -Infinity;
				let minY = Infinity, maxY = -Infinity;
				let hasNodes = false;
				
				function calculateBounds(node: PatternNode) {
					const x = node.x || 0;
					const y = node.y || 0;
					
					// Only consider nodes that have valid coordinates
					if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
						hasNodes = true;
						minX = Math.min(minX, x);
						maxX = Math.max(maxX, x);
						minY = Math.min(minY, y);
						maxY = Math.max(maxY, y);
					}
					
					// Recursively check children
					if (node.children && node.children.length > 0) {
						for (const child of node.children) {
							calculateBounds(child);
						}
					}
				}
				
				// Calculate bounds for all instruments
				for (const instrument of instruments) {
					if (instrument.patternTree) {
						calculateBounds(instrument.patternTree);
					}
				}
				
				// Only render if we have valid nodes
				if (hasNodes && minX !== Infinity && maxX !== -Infinity) {
					// Calculate content dimensions
					const contentWidth = maxX - minX;
					const contentHeight = maxY - minY;
					
					// Add padding (as a percentage of content size, with minimum)
					const paddingPercent = 0.2; // 20% padding
					const minPadding = 30;
					const paddingX = Math.max(minPadding, contentWidth * paddingPercent);
					const paddingY = Math.max(minPadding, contentHeight * paddingPercent);
					
					const totalWidth = contentWidth + paddingX * 2;
					const totalHeight = contentHeight + paddingY * 2;
					
					// Calculate scale to fit in canvas (with some margin)
					const canvasWidth = canvas.width;
					const canvasHeight = canvas.height;
					const margin = 10; // Small margin from edges
					const availableWidth = canvasWidth - margin * 2;
					const availableHeight = canvasHeight - margin * 2;
					
					const scaleX = availableWidth / totalWidth;
					const scaleY = availableHeight / totalHeight;
					const scale = Math.min(scaleX, scaleY); // Use the smaller scale to fit both dimensions
					
					// Calculate offset to center the content
					const scaledWidth = totalWidth * scale;
					const scaledHeight = totalHeight * scale;
					const offsetX = (canvasWidth - scaledWidth) / 2 - (minX - paddingX) * scale;
					const offsetY = (canvasHeight - scaledHeight) / 2 - (minY - paddingY) * scale;
					
					// Render all instruments
					for (const instrument of instruments) {
						if (instrument.patternTree) {
							renderPreviewNode(
								instrument.patternTree, 
								canvasContext, 
								scale, 
								offsetX, 
								offsetY,
								instrument.color || '#7ab8ff',
								0, // Start at depth 0
								instrument.instrumentType
							);
						}
					}
				}
			}
		}
		}
	});
</script>

<div class="pattern-card" on:click={onClick} role="button" tabindex="0" on:keydown={(e) => {
	if (e.key === 'Enter' || e.key === ' ') {
		e.preventDefault();
		onClick();
	}
}}>
	<div class="pattern-card-actions">
		{#if onCopy}
			<button 
				class="pattern-card-copy" 
				on:click|stopPropagation={(e) => {
					e.preventDefault();
					e.stopPropagation();
					if (onCopy) {
						onCopy(pattern.id);
					}
				}}
				title="Copy pattern"
				aria-label="Copy pattern"
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M5.5 4.5H3.5C2.67157 4.5 2 5.17157 2 6V12.5C2 13.3284 2.67157 14 3.5 14H10C10.8284 14 11.5 13.3284 11.5 12.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M5.5 2H12.5C13.3284 2 14 2.67157 14 3.5V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		{/if}
		{#if onDelete}
			<button 
				class="pattern-card-delete" 
				on:click|stopPropagation={(e) => {
					e.preventDefault();
					e.stopPropagation();
					if (onDelete) {
						onDelete(pattern.id);
					}
				}}
				title="Delete pattern"
				aria-label="Delete pattern"
			>
				×
			</button>
		{/if}
	</div>
	<div class="pattern-card-preview">
		<canvas bind:this={canvas} width={400} height={300}></canvas>
	</div>
	<div class="pattern-card-info">
		<h3 class="pattern-card-title">{pattern.name}</h3>
		{#if pattern.instruments && pattern.instruments.length > 0}
			<span class="pattern-card-instrument">
				{pattern.instruments.length} {pattern.instruments.length === 1 ? 'instrument' : 'instruments'}
			</span>
		{:else if pattern.instrumentType}
			<span class="pattern-card-instrument">{pattern.instrumentType}</span>
		{/if}
	</div>
</div>

<style>
	.pattern-card {
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 8px;
		padding: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		gap: 12px;
		position: relative;
	}
	
	.pattern-card:hover {
		background: #333;
		border-color: #4a4a4a;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	
	.pattern-card:focus {
		outline: 2px solid #7ab8ff;
		outline-offset: 2px;
	}
	
	.pattern-card-preview {
		width: 100%;
		height: 150px;
		background: #1a1a1a;
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.pattern-card-preview canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	
	.pattern-card-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	
	.pattern-card-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #ffffff;
	}
	
	.pattern-card-instrument {
		font-size: 12px;
		color: #888;
		text-transform: capitalize;
	}
	
	.pattern-card-actions {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		gap: 4px;
		z-index: 10;
	}
	
	.pattern-card-copy,
	.pattern-card-delete {
		background: rgba(100, 100, 100, 0.2);
		color: #b0b0b0;
		border: none;
		border-radius: 4px;
		width: 24px;
		height: 24px;
		cursor: pointer;
		opacity: 0;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	
	.pattern-card-copy {
		background: rgba(122, 184, 255, 0.2);
		color: #7ab8ff;
	}
	
	.pattern-card-delete {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
		font-size: 18px;
		line-height: 1;
	}
	
	.pattern-card:hover .pattern-card-copy,
	.pattern-card:hover .pattern-card-delete {
		opacity: 1;
	}
	
	.pattern-card-copy:hover {
		background: rgba(122, 184, 255, 0.3);
		transform: scale(1.1);
	}
	
	.pattern-card-delete:hover {
		background: rgba(255, 107, 107, 0.3);
		transform: scale(1.1);
	}
	
	.pattern-card-copy svg {
		width: 14px;
		height: 14px;
	}
</style>

