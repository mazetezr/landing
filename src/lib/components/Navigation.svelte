<script lang="ts">
	import { currentSection, totalSections, isAnimating, sectionNames } from '$lib/stores/scroll';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { playTick } from '$lib/utils/audio';

	let active = 0;
	currentSection.subscribe(v => active = v);

	function goTo(index: number) {
		if ($isAnimating) return;
		currentSection.set(index);
		playTick();
	}
</script>

<nav class="navigation" aria-label="Section navigation">
	<div class="dots">
		{#each Array(totalSections) as _, i}
			<button
				class="dot"
				class:active={i === active}
				on:click={() => goTo(i)}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set(sectionNames[i]); }}
				on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
				aria-label="Go to {sectionNames[i]}"
				aria-current={i === active ? 'step' : undefined}
			>
				<span class="dot-inner"></span>
				{#if i < totalSections - 1}
					<span class="dot-line" class:filled={i < active}></span>
				{/if}
			</button>
		{/each}
	</div>
</nav>

<style>
	.navigation {
		position: fixed;
		right: 30px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.dots {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
	}

	.dot {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px 0;
		position: relative;
	}

	.dot-inner {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-muted);
		transition: all 0.4s ease;
		display: block;
	}

	.dot.active .dot-inner {
		width: 12px;
		height: 12px;
		background: var(--aurora-gradient);
		box-shadow: 0 0 12px rgba(0, 212, 255, 0.5);
	}

	.dot:hover .dot-inner {
		background: var(--aurora-cyan);
		transform: scale(1.3);
	}

	.dot-line {
		width: 2px;
		height: 20px;
		background: var(--text-muted);
		transition: background 0.4s ease;
		margin-top: 6px;
		opacity: 0.3;
	}

	.dot-line.filled {
		background: var(--aurora-gradient);
		opacity: 0.7;
	}

	@media (max-width: 768px) {
		.navigation {
			right: 12px;
		}
	}
</style>
