export function normalizeFloat32RGB(rgb: Float32Array, blackLevel: number, whiteLevel: number): Float32Array {
    const normalized = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) {
        // Normalize to [0, 1] range
        normalized[i] = mapRange(rgb[i], blackLevel, whiteLevel, 0, 1);
        // Clamp to [0, 1]
        normalized[i] = Math.max(0, Math.min(1, normalized[i]));
    }
    return normalized;
}

export function float32ArrayToUint8Array(floatArray: Float32Array): Uint8Array {
    const uint8Array = new Uint8Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
        uint8Array[i] = Math.round(floatArray[i] * 255);
    }
    return uint8Array;
}

export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function median(arr: number[]) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
