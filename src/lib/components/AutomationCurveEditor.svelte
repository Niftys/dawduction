<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { automationStore } from '$lib/stores/automationStore';
	import type { AutomationPoint, ParameterAutomation } from '$lib/types/effects';
	import { onMount } from 'svelte';
	import '$lib/styles/components/AutomationCurveEditor.css';

	const { automationWindow }: { automationWindow: import('$lib/stores/automationStore').OpenAutomationWindow } = $props();

	const project = $derived($projectStore);

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let isDragging = false;
	let draggedPointIndex: number | null = null;
	let hoveredPointIndex: number | null = null;

	// Timeline viewport
	let viewStartBeat = $state(0);
	let viewEndBeat = $state(32); // Default to 32 beats view
	let viewHeight = 200;
	let viewWidth = 0;

	// Get automation data - reactive to project changes
	// Use project.automation directly to ensure reactivity
	const automation = $derived((() => {
		if (!project || !project.automation) return null;
		const automationId = automationWindow.timelineInstanceId 
			? `${automationWindow.targetType}:${automationWindow.targetId}:${automationWindow.timelineInstanceId}:${automationWindow.parameterKey}`
			: `${automationWindow.targetType}:${automationWindow.targetId}:${automationWindow.parameterKey}`;
		return (project.automation as any)[automationId] || null;
	})());

	// Get timeline effect/envelope duration if on timeline
	const timelineObject = $derived((() => {
		if (!automationWindow.timelineInstanceId || !project?.timeline) return null;
		
		if (automationWindow.targetType === 'effect') {
			return project.timeline.effects?.find((e: any) => e.id === automationWindow.timelineInstanceId);
		} else {
			return project.timeline.envelopes?.find((e: any) => e.id === automationWindow.timelineInstanceId);
		}
	})());

	// Set beat range based on timeline object or full timeline
	$effect(() => {
		if (timelineObject) {
			viewStartBeat = timelineObject.startBeat || 0;
			viewEndBeat = (timelineObject.startBeat || 0) + (timelineObject.duration || 32);
		} else {
			viewStartBeat = 0;
			viewEndBeat = project?.timeline?.totalLength || 32;
		}
	});

	const timelineLength = $derived(viewEndBeat);

	// Get parameter min/max from effect/envelope
	const paramMin = $derived((() => {
		if (automationWindow.targetType === 'effect') {
			const effect = project?.effects?.find((e: any) => e.id === automationWindow.targetId);
			if (effect) {
				// Get min/max based on parameter - default to 0-1
				return automation?.min ?? 0;
			}
		} else {
			const envelope = project?.envelopes?.find((e: any) => e.id === automationWindow.targetId);
			if (envelope) {
				return automation?.min ?? 0;
			}
		}
		return automation?.min ?? 0;
	})());

	const paramMax = $derived((() => {
		if (automationWindow.targetType === 'effect') {
			const effect = project?.effects?.find((e: any) => e.id === automationWindow.targetId);
			if (effect) {
				return automation?.max ?? 1;
			}
		} else {
			const envelope = project?.envelopes?.find((e: any) => e.id === automationWindow.targetId);
			if (envelope) {
				return automation?.max ?? 1;
			}
		}
		return automation?.max ?? 1;
	})());

	const points = $derived(automation?.points || []);

	// Watch for points changes - use stringified version to detect array changes
	const pointsKey = $derived(points ? JSON.stringify(points) : '');

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
		
		// Handle mouse up on window to end batching if mouse leaves canvas while dragging
		const handleWindowMouseUp = () => {
			if (isDragging) {
				handleMouseUp();
			}
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('mouseup', handleWindowMouseUp);
		}
		
		return () => {
			resizeObserver.disconnect();
			if (typeof window !== 'undefined') {
				window.removeEventListener('mouseup', handleWindowMouseUp);
			}
			// Clean up: end any active batch when component unmounts
			if (isDragging) {
				projectStore.endBatch();
			}
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
				// Clicked on point - start batching for drag operation
				draggedPointIndex = i;
				isDragging = true;
				projectStore.startBatch();
				draw();
				return;
			}
		}

		// Add new point (single action, no batching needed)
		const beat = Math.max(viewStartBeat, Math.min(viewEndBeat, xToBeat(x)));
		const value = Math.max(paramMin, Math.min(paramMax, yToValue(y)));

		// Create or update automation
		if (!automation) {
			projectStore.setParameterAutomation({
				targetType: automationWindow.targetType,
				targetId: automationWindow.targetId,
				parameterKey: automationWindow.parameterKey,
				timelineInstanceId: automationWindow.timelineInstanceId,
				points: [{ beat, value }],
				min: paramMin,
				max: paramMax
			}, automationWindow.timelineInstanceId);
		} else {
			projectStore.addAutomationPoint(
				automationWindow.targetType,
				automationWindow.targetId,
				automationWindow.parameterKey,
				{ beat, value },
				automationWindow.timelineInstanceId
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
						automationWindow.targetType,
						automationWindow.targetId,
						automationWindow.parameterKey,
						originalIndex,
						automationWindow.timelineInstanceId
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
			// Update dragged point (during batch, so this won't create history entries)
			const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);
			const point = sortedPoints[draggedPointIndex];
			const beat = Math.max(viewStartBeat, Math.min(viewEndBeat, xToBeat(x)));
			const value = Math.max(paramMin, Math.min(paramMax, yToValue(y)));

			// Find original index in unsorted array
			const originalIndex = points.findIndex((p) => p.beat === point.beat && p.value === point.value);

			if (originalIndex >= 0) {
				projectStore.updateAutomationPoint(
					automationWindow.targetType,
					automationWindow.targetId,
					automationWindow.parameterKey,
					originalIndex,
					{ beat, value },
					automationWindow.timelineInstanceId
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
			// End batching - this will save the final state to history
			projectStore.endBatch();
		}
	}

	function handleDeletePoint(index: number) {
		projectStore.removeAutomationPoint(
			automationWindow.targetType,
			automationWindow.targetId,
			automationWindow.parameterKey,
			index,
			automationWindow.timelineInstanceId
		);
	}

	function handleClearAutomation() {
		if (automation) {
			projectStore.deleteParameterAutomation(
				automationWindow.targetType,
				automationWindow.targetId,
				automationWindow.parameterKey,
				automationWindow.timelineInstanceId
			);
		}
	}

	// Single reactive statement to handle all redraws - prevents infinite loops
	let redrawTrigger = 0;
	// Combine all dependencies into a single reactive key to prevent multiple triggers
	const redrawKey = $derived(`${pointsKey}-${viewStartBeat}-${viewEndBeat}-${automation?.points?.length || 0}-${paramMin}-${paramMax}`);
	$effect(() => {
		if (canvas && ctx && redrawKey) {
			// Debounce with requestAnimationFrame to prevent excessive redraws
			cancelAnimationFrame(redrawTrigger);
			redrawTrigger = requestAnimationFrame(() => {
				if (canvas && ctx) {
					updateCanvasSize();
					draw();
				}
			});
		}
	});
</script>

<div class="automation-window">
	<div class="automation-window-header">
		<div class="automation-window-title">
			<span class="automation-icon">📈</span>
			<span>{automationWindow.label}</span>
		</div>
		<div class="automation-window-controls">
			<button class="clear-btn" on:click={handleClearAutomation} title="Clear automation">
				Clear
			</button>
			<button class="close-btn" on:click={() => automationStore.closeWindow(automationWindow.id)} title="Close">
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

