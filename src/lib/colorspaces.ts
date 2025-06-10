import init, { alloc_f32, alloc_u8, linear_float32_to_srgb, get_memory } from "linear-srgb";

await init();

// Now `result` is your sRGB uint8 array

export function linearFloat2sRGBFloatValue(x: number): number {
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function sRGB2linear(x: number): number {
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

let inited = false;
export async function linearFloat32tosRGB(floatArray: Float32Array): Promise<Uint8Array<ArrayBufferLike>> {
    if (!inited) {
        await init();
        inited = true;
    }
    const len = floatArray.length;

    // Allocate memory in WASM
    const inputPtr = alloc_f32(len);
    const outputPtr = alloc_u8(len);

    const memory = get_memory();

    // Get typed views into WASM memory
    const wasmMem = new DataView(memory.buffer);
    const wasmF32 = new Float32Array(memory.buffer, inputPtr, len);
    const wasmU8 = new Uint8Array(memory.buffer, outputPtr, len);

    // Copy data to WASM
    wasmF32.set(floatArray);

    // Run the function
    linear_float32_to_srgb(inputPtr, len, outputPtr);

    // Copy result back
    const result = new Uint8Array(len);
    result.set(wasmU8);
    return result;
}
