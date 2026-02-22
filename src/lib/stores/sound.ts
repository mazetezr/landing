import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const soundEnabled = writable(true);
export const soundReady = writable(false);
