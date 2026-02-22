import { writable, derived } from 'svelte/store';

export const cursorPos = writable({ x: 0, y: 0 });
export const cursorState = writable<'default' | 'hover' | 'drag' | 'text'>('default');
export const cursorLabel = writable('');
export const cursorVisible = writable(true);

export const cursorTrail = writable<Array<{ x: number; y: number }>>([]);
