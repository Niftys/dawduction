<script lang="ts">
	const {
		id,
		value = 0,
		min = undefined,
		max = undefined,
		step = undefined,
		placeholder = undefined,
		title = undefined,
		disabled = false,
		onInput = undefined
	}: {
		id: string;
		value?: number;
		min?: number | undefined;
		max?: number | undefined;
		step?: number | undefined;
		placeholder?: string | undefined;
		title?: string | undefined;
		disabled?: boolean;
		onInput?: ((value: number) => void) | undefined;
	} = $props();

	const getIncrement = () => {
		if (typeof step === 'number' && !isNaN(step) && step !== 0) {
			return step;
		}
		return 1;
	};

	const clampValue = (val: number) => {
		let next = val;
		if (typeof min === 'number') {
			next = Math.max(min, next);
		}
		if (typeof max === 'number') {
			next = Math.min(max, next);
		}
		return next;
	};

	const handleInput = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const numericValue = Number(target?.value ?? value);
		if (!isNaN(numericValue) && typeof onInput === 'function') {
			onInput(numericValue);
		}
	};

	const nudgeValue = (direction: 1 | -1) => {
		if (disabled) return;
		const increment = getIncrement() * direction;
		const nextValue = clampValue(Number((value + increment).toFixed(6)));
		onInput?.(nextValue);
	};
</script>

<div class="numeric-input-wrapper">
	<input
		id={id}
		type="number"
		{min}
		{max}
		{step}
		{placeholder}
		{title}
		{disabled}
		value={value}
		on:input={handleInput}
		class="numeric-input"
	/>
	<div class="numeric-input-arrows">
		<button
			type="button"
			class="numeric-arrow-button arrow-up"
			on:click={() => nudgeValue(1)}
			title="Increase value"
			disabled={disabled}
		>
			<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M5 2L8 6H2L5 2Z" fill="currentColor" />
			</svg>
		</button>
		<button
			type="button"
			class="numeric-arrow-button arrow-down"
			on:click={() => nudgeValue(-1)}
			title="Decrease value"
			disabled={disabled}
		>
			<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M5 8L2 4H8L5 8Z" fill="currentColor" />
			</svg>
		</button>
	</div>
</div>


