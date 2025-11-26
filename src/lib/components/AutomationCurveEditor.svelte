<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { automationStore } from '$lib/stores/automationStore';
	import type { AutomationPoint, ParameterAutomation } from '$lib/types/effects';
	import { onMount } from 'svelte';
	import '$lib/styles/components/AutomationCurveEditor.css';

	export let window: import('$lib/stores/automationStore').OpenAutomationWindow;

	let project: any;
	$: project = $projectStore;

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let isDragging = false;
	let draggedPointIndex: number | null = null;
	let hoveredPointIndex: number | null = null;

	// Timeline viewport
	let viewStartBeat = 0;
	let viewEndBeat = 32; // Default to 32 beats view
	let viewHeight = 200;
	let viewWidth = 0;

	// Get automation data - reactive to project changes
	// Use project.automation directly to ensure reactivity
	$: automation = (() => {
		if (!project || !project.automation) return null;
		const automationId = window.timelineInstanceId 
			? `${window.targetType}:${window.targetId}:${window.timelineInstanceId}:${window.parameterKey}`
			: `${window.targetType}:${window.targetId}:${window.parameterKey}`;
		return (project.automation as any)[automationId] || null;
	})();

	// Get timeline effect/envelope duration if on timeline
	$: timelineObject = (() => {
		if (!window.timelineInstanceId || !project?.timeline) return null;
		
		if (window.targetType === 'effect') {
			return project.timeline.effects?.find((e: any) => e.id === window.timelineInstanceId);
		} else {
			return project.timeline.envelopes?.find((e: any) => e.id === window.timelineInstanceId);
		}
	})();

	// Set beat range based on timeline object or full timeline
	$: {
		if (timelineObject) {
			viewStartBeat = timelineObject.startBeat || 0;
			viewEndBeat = (timelineObject.startBeat || 0) + (timelineObject.duration || 32);
		} else {
			viewStartBeat = 0;
			viewEndBeat = project?.timeline?.totalLength || 32;
		}
	}

	$: timelineLength = viewEndBeat;

	// Get parameter min/max from effect/envelope
	$: paramMin = (() => {
		if (window.targetType === 'effect') {
			const effect = project?.effects?.find((e: any) => e.id === window.targetId);
			if (effect) {
				// Get min/max based on parameter - default to 0-1
				return automation?.min ?? 0;
			}
		} else {
			const envelope = project?.envelopes?.find((e: any) => e.id === window.targetId);
			if (envelope) {
				return automation?.min ?? 0;
			}
		}
		return automation?.min ?? 0;
	})();

	$: paramMax = (() => {
		if (window.targetType === 'effect') {
			const effect = project?.effects?.find((e: any) => e.id === window.targetId);
			if (effect) {
				return automation?.max ?? 1;
			}
		} else {
			const envelope = project?.envelopes?.find((e: any) => e.id === window.targetId);
			if (envelope) {
				return automation?.max ?? 1;
			}
		}
		return automation?.max ?? 1;
	})();

	$: points = automation?.points || [];

	// Watch for points changes - use stringified version to detect array changes
	$: pointsKey = points ? JSON.stringify(points) : '';

	onMount(() => {
		if (canvas) {
			ctx = canvas.getContext('2d');
			updateCanvasSize();
			draw();
		}
		// Listen for window resize
		const resizeObserver = new ResizeObserver(() => {
			updateCanvasSize();
		});
		if (canvas) {
			resizeObserver.observe(canvas);
		}
		return () => {
			resizeObserver.disconnect();
		};
	});

	function updateCanvasSize() {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const newWidth = rect.width;
		if (newWidth !== viewWidth) {
			viewWidth = newWidth;
			canvas.width = viewWidth;
			canvas.height = viewHeight;
		}
	}

	function beatToX(beat: number): number {
		return ((beat - viewStartBeat) / (viewEndBeat - viewStartBeat)) * viewWidth;
	}

	function valueToY(value: number): number {
		const normalized = (value - paramMin) / (paramMax - paramMin);
		return viewHeight - (normalized * viewHeight);
	}

	function xToBeat(x: number): number {
		return viewStartBeat + (x / viewWidth) * (viewEndBeat - viewStartBeat);
	}

	function yToValue(y: number): number {
		const normalized = 1 - (y / viewHeight);
		return paramMin + normalized * (paramMax - paramMin);
	}

	function draw() {
		if (!ctx || !canvas) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Draw grid
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.lineWidth = 1;

		// Vertical grid lines (beats)
		for (let beat = Math.ceil(viewStartBeat); beat <= viewEndBeat; beat++) {
			const x = beatToX(beat);
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, viewHeight);
			ctx.stroke();
		}

		// Horizontal grid lines (values)
		for (let i = 0; i <= 10; i++) {
			const value = paramMin + (i / 10) * (paramMax - paramMin);
			const y = valueToY(value);
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(viewWidth, y);
			ctx.stroke();
		}

		// Draw curve
		if (points.length > 0) {
			ctx.strokeStyle = '#7ab8ff';
			ctx.lineWidth = 2;
			ctx.beginPath();

			// Sort points by beat
			const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);

			// Draw line segments
			for (let i = 0; i < sortedPoints.length; i++) {
				const point = sortedPoints[i];
				const x = beatToX(point.beat);
				const y = valueToY(point.value);

				if (i === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			}

			ctx.stroke();

			// Draw points
			sortedPoints.forEach((point, index) => {
				const x = beatToX(point.beat);
				const y = valueToY(point.value);
				const isHovered = hoveredPointIndex === index;
				const isDragged = draggedPointIndex === index;

				ctx.fillStyle = isDragged ? '#00ff88' : isHovered ? '#5a9eff' : '#7ab8ff';
				ctx.beginPath();
				ctx.arc(x, y, isHovered || isDragged ? 6 : 4, 0, Math.PI * 2);
				ctx.fill();

				// Draw outline
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1;
				ctx.stroke();
			});
		} else {
			// Draw placeholder text
			ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
			ctx.font = '14px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('Click to add automation points', viewWidth / 2, viewHeight / 2);
		}
	}

	function handleMouseDown(e: MouseEvent) {
		if (!canvas || !ctx) return;
		
		// Right-click is handled by handleContextMenu
		if (e.button === 2) return;

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Check if clicking on existing point
		const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);
		for (let i = 0; i < sortedPoints.length; i++) {
			const point = sortedPoints[i];
			const px = beatToX(point.beat);
			const py = valueToY(point.value);
			const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

			if (distance < 10) {
				// Clicked on point
				draggedPointIndex = i;
				isDragging = true;
				draw();
				return;
			}
		}

		// Add new point
		const beat = Math.max(viewStartBeat, Math.min(viewEndBeat, xToBeat(x)));
		const value = Math.max(paramMin, Math.min(paramMax, yToValue(y)));

		// Create or update automation
		if (!automation) {
			projectStore.setParameterAutomation({
				targetType: window.targetType,
				targetId: window.targetId,
				parameterKey: window.parameterKey,
				timelineInstanceId: window.timelineInstanceId,
				points: [{ beat, value }],
				min: paramMin,
				max: paramMax
			}, window.timelineInstanceId);
		} else {
			projectStore.addAutomationPoint(
				window.targetType,
				window.targetId,
				window.parameterKey,
				{ beat, value },
				window.timelineInstanceId
			);
		}
	}

	function handleContextMenu(e: MouseEvent) {
		if (!canvas || !ctx) return;
		
		e.preventDefault(); // Prevent default context menu
		
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Check if right-clicking on existing point
		const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);
		for (let i = 0; i < sortedPoints.length; i++) {
			const point = sortedPoints[i];
			const px = beatToX(point.beat);
			const py = valueToY(point.value);
			const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

			if (distance < 10) {
				// Right-clicked on point - delete it
				// Find original index in unsorted array
				const originalIndex = points.findIndex((p) => p.beat === point.beat && p.value === point.value);
				if (originalIndex >= 0) {
					projectStore.removeAutomationPoint(
						window.targetType,
						window.targetId,
						window.parameterKey,
						originalIndex,
						window.timelineInstanceId
					);
				}
				return;
			}
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!canvas || !ctx) return;

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		if (isDragging && draggedPointIndex !== null) {
			// Update dragged point
			const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);
			const point = sortedPoints[draggedPointIndex];
			const beat = Math.max(viewStartBeat, Math.min(viewEndBeat, xToBeat(x)));
			const value = Math.max(paramMin, Math.min(paramMax, yToValue(y)));

			// Find original index in unsorted array
			const originalIndex = points.findIndex((p) => p.beat === point.beat && p.value === point.value);

			if (originalIndex >= 0) {
				projectStore.updateAutomationPoint(
					window.targetType,
					window.targetId,
					window.parameterKey,
					originalIndex,
					{ beat, value },
					window.timelineInstanceId
				);
				// Redraw immediately for smooth dragging
				draw();
			}
		} else {
			// Check hover
			const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);
			let newHoveredIndex: number | null = null;

			for (let i = 0; i < sortedPoints.length; i++) {
				const point = sortedPoints[i];
				const px = beatToX(point.beat);
				const py = valueToY(point.value);
				const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

				if (distance < 10) {
					newHoveredIndex = i;
					break;
				}
			}

			if (newHoveredIndex !== hoveredPointIndex) {
				hoveredPointIndex = newHoveredIndex;
				draw();
			}
		}
	}

	function handleMouseUp() {
		if (isDragging) {
			isDragging = false;
			draggedPointIndex = null;
		}
	}

	function handleDeletePoint(index: number) {
		projectStore.removeAutomationPoint(
			window.targetType,
			window.targetId,
			window.parameterKey,
			index,
			window.timelineInstanceId
		);
	}

	function handleClearAutomation() {
		if (automation) {
			projectStore.deleteParameterAutomation(
				window.targetType,
				window.targetId,
				window.parameterKey,
				window.timelineInstanceId
			);
		}
	}

	// Single reactive statement to handle all redraws - prevents infinite loops
	let redrawTrigger = 0;
	// Combine all dependencies into a single reactive key to prevent multiple triggers
	$: redrawKey = `${pointsKey}-${viewStartBeat}-${viewEndBeat}-${automation?.points?.length || 0}-${paramMin}-${paramMax}`;
	$: if (canvas && ctx && redrawKey) {
		// Debounce with requestAnimationFrame to prevent excessive redraws
		cancelAnimationFrame(redrawTrigger);
		redrawTrigger = requestAnimationFrame(() => {
			if (canvas && ctx) {
				updateCanvasSize();
				draw();
			}
		});
	}
</script>

<div class="automation-window">
	<div class="automation-window-header">
		<div class="automation-window-title">
			<span class="automation-icon">📈</span>
			<span>{window.label}</span>
		</div>
		<div class="automation-window-controls">
			<button class="clear-btn" on:click={handleClearAutomation} title="Clear automation">
				Clear
			</button>
			<button class="close-btn" on:click={() => automationStore.closeWindow(window.id)} title="Close">
				×
			</button>
		</div>
	</div>
	<div class="automation-window-content">
		<canvas
			bind:this={canvas}
			class="automation-canvas"
			on:mousedown={handleMouseDown}
			on:mousemove={handleMouseMove}
			on:mouseup={handleMouseUp}
			on:mouseleave={handleMouseUp}
			on:contextmenu={handleContextMenu}
			style="height: {viewHeight}px;"
		></canvas>
		<div class="automation-info">
			<span>Beats: {viewStartBeat.toFixed(1)} - {viewEndBeat.toFixed(1)}</span>
			<span>Value: {paramMin.toFixed(2)} - {paramMax.toFixed(2)}</span>
			<span>Points: {points.length}</span>
		</div>
	</div>
</div>

