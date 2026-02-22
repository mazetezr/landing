<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cursorPos } from '$lib/stores/cursor';

	let x = 0, y = 0;
	let visible = false;
	let animFrame: number;
	let isTouchDevice = false;

	onMount(() => {
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		if (isTouchDevice) return;

		const handleMouseMove = (e: MouseEvent) => {
			x = e.clientX;
			y = e.clientY;
			cursorPos.set({ x, y });
			if (!visible) visible = true;
		};

		const handleMouseLeave = () => { visible = false; };
		const handleMouseEnter = () => { visible = true; };

		window.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseleave', handleMouseLeave);
		document.addEventListener('mouseenter', handleMouseEnter);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseleave', handleMouseLeave);
			document.removeEventListener('mouseenter', handleMouseEnter);
		};
	});
</script>

{#if !isTouchDevice && visible}
	<div class="cursor-dot" style="left:{x}px;top:{y}px"></div>
{/if}

<style>
	.cursor-dot {
		position: fixed;
		pointer-events: none;
		z-index: 10001;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #fff;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 6px 2px rgba(255, 255, 255, 0.4);
	}
</style>
