<script lang="ts">
	import type { Pattern, PatternNode } from '$lib/types/pattern';
	
	export let pattern: Pattern;
	export let onClick: () => void;
	export let onDelete: ((patternId: string) => void) | null = null;
	
	// Simple canvas preview - render nodes as circles
	// This is a simplified version for preview purposes
	function renderPreview(node: PatternNode, ctx: CanvasRenderingContext2D, scale: number, offsetX: number, offsetY: number) {
		const nodeX = node.x || 0;
		const nodeY = node.y || 0;
		
		// Skip nodes with invalid coordinates
		if (nodeX === undefined || nodeY === undefined || isNaN(nodeX) || isNaN(nodeY)) {
			return;
		}
		
		const x = nodeX * scale + offsetX;
		const y = nodeY * scale + offsetY;
		
		// Calculate radius based on scale (minimum 2px, maximum 8px)
		const baseRadius = 6;
		const radius = Math.max(2, Math.min(8, baseRadius * scale));
		
		// Draw connections to children first (so they appear behind nodes)
		if (node.children && node.children.length > 0) {
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
			ctx.lineWidth = Math.max(0.5, 1 * scale);
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
				renderPreview(child, ctx, scale, offsetX, offsetY);
			}
		}
		
		// Draw node circle
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		ctx.fillStyle = pattern.color || '#7ab8ff';
		ctx.fill();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
		ctx.lineWidth = Math.max(0.5, 1 * scale);
		ctx.stroke();
	}
	
	let canvas: HTMLCanvasElement;
	let canvasContext: CanvasRenderingContext2D | null = null;
	
	$: if (canvas && pattern) {
		canvasContext = canvas.getContext('2d');
		if (canvasContext) {
			// Clear canvas
			canvasContext.clearRect(0, 0, canvas.width, canvas.height);
			
			// Set background
			canvasContext.fillStyle = '#1a1a1a';
			canvasContext.fillRect(0, 0, canvas.width, canvas.height);
			
			// Calculate bounds of pattern tree (including all nodes)
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
			
			// Get the first instrument's pattern tree to render (or legacy patternTree)
			const patternTree = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
				? pattern.instruments[0].patternTree
				: (pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [], x: 0, y: 0 });
			
			calculateBounds(patternTree);
			
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
				
				// Render pattern tree (first instrument)
				renderPreview(patternTree, canvasContext, scale, offsetX, offsetY);
			}
		}
	}
</script>

<div class="pattern-card" on:click={onClick} role="button" tabindex="0" on:keydown={(e) => {
	if (e.key === 'Enter' || e.key === ' ') {
		e.preventDefault();
		onClick();
	}
}}>
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
	<div class="pattern-card-preview">
		<canvas bind:this={canvas} width={200} height={150}></canvas>
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
	
	.pattern-card-delete {
		position: absolute;
		top: 8px;
		right: 8px;
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
		border: none;
		border-radius: 4px;
		width: 24px;
		height: 24px;
		cursor: pointer;
		font-size: 18px;
		line-height: 1;
		opacity: 0;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
	}
	
	.pattern-card:hover .pattern-card-delete {
		opacity: 1;
	}
	
	.pattern-card-delete:hover {
		background: rgba(255, 107, 107, 0.3);
		transform: scale(1.1);
	}
</style>

