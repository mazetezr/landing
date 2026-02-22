import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createThemeStore() {
	const stored = browser ? localStorage.getItem('theme') : null;
	const prefersDark = browser ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
	const initial = stored || (prefersDark ? 'dark' : 'dark'); // dark by default as per spec

	const { subscribe, set, update } = writable<'dark' | 'light'>(initial as 'dark' | 'light');

	return {
		subscribe,
		toggle: () => {
			update(current => {
				const next = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					localStorage.setItem('theme', next);
					document.documentElement.setAttribute('data-theme', next);
				}
				return next;
			});
		},
		set: (value: 'dark' | 'light') => {
			set(value);
			if (browser) {
				localStorage.setItem('theme', value);
				document.documentElement.setAttribute('data-theme', value);
			}
		}
	};
}

export const theme = createThemeStore();
