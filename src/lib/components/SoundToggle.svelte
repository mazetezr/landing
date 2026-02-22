<script lang="ts">
	import { soundEnabled } from '$lib/stores/sound';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { resumeAudio, playClick } from '$lib/utils/audio';

	let enabled = false;
	soundEnabled.subscribe(v => enabled = v);

	async function toggle() {
		soundEnabled.update(v => !v);
		await resumeAudio();
		if (!enabled) {
			// will be enabled now
			setTimeout(playClick, 50);
		}
	}
</script>

<button
	class="sound-toggle"
	on:click={toggle}
	on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('Sound'); }}
	on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
	aria-label="Toggle sound"
>
	<svg viewBox="0 0 24 24" width="20" height="20">
		<path
			d="M11 5L6 9H2v6h4l5 4V5z"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		{#if enabled}
			<path
				d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else}
			<line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		{/if}
	</svg>
</button>

<style>
	.sound-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		transition: background 0.3s ease, transform 0.3s ease;
		color: var(--text-secondary);
	}

	.sound-toggle:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary);
		transform: scale(1.1);
	}
</style>
