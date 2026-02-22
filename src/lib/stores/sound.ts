import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const soundEnabled = writable(false);
export const soundReady = writable(false);
