<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme';
	import { browser } from '$app/environment';

	onMount(() => {
		if (browser) {
			document.documentElement.setAttribute('data-theme', $theme);
		}
	});
</script>

<slot />
