export function lerp(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
	return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
	return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function random(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

export function easeOutElastic(x: number): number {
	const c4 = (2 * Math.PI) / 3;
	return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

export function easeOutCubic(x: number): number {
	return 1 - Math.pow(1 - x, 3);
}

export function easeInOutCubic(x: number): number {
	return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
