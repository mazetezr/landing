<script lang="ts">
	import { theme } from '$lib/stores/theme';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { playClick } from '$lib/utils/audio';

	let isDark = true;

	theme.subscribe(t => isDark = t === 'dark');

	function toggle() {
		theme.toggle();
		playClick();
	}
</script>

<button
	class="theme-toggle"
	on:click={toggle}
	on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('Theme'); }}
	on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
	aria-label="Toggle theme"
>
	<svg viewBox="0 0 24 24" width="20" height="20" class="icon" class:dark={isDark}>
		{#if isDark}
			<!-- Moon -->
			<path
				d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else}
			<!-- Sun -->
			<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2" />
			<line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		{/if}
	</svg>
</button>

<style>
	.theme-toggle {
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

	.theme-toggle:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary);
		transform: scale(1.1);
	}

	.icon {
		transition: transform 0.6s ease, color 0.3s ease;
	}

	.icon.dark {
		transform: rotate(-30deg);
	}
</style>
