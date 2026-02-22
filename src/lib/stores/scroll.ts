import { writable } from 'svelte/store';

export const scrollProgress = writable(0); // 0 = hero, 1 = contact
export const hasScrolled = writable(false);
