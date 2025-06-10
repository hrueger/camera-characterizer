use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn linear_float32_to_srgb(ptr: *const f32, len: usize, output_ptr: *mut u8) {
    let input = unsafe { std::slice::from_raw_parts(ptr, len) };
    let output = unsafe { std::slice::from_raw_parts_mut(output_ptr, len) };

    for i in 0..len {
        let v = input[i];
        let srgb = if v <= 0.0031308 {
            12.92 * v
        } else {
            1.055 * v.powf(1.0 / 2.4) - 0.055
        };
        output[i] = (srgb.clamp(0.0, 1.0) * 255.0).round() as u8;
    }
}

#[wasm_bindgen]
pub fn alloc_f32(size: usize) -> *mut f32 {
    let mut vec = Vec::with_capacity(size);
    let ptr = vec.as_mut_ptr();
    std::mem::forget(vec); // prevent Rust from freeing it
    ptr
}

#[wasm_bindgen]
pub fn alloc_u8(size: usize) -> *mut u8 {
    let mut vec = Vec::with_capacity(size);
    let ptr = vec.as_mut_ptr();
    std::mem::forget(vec);
    ptr
}

#[wasm_bindgen]
pub fn get_memory() -> JsValue {
    wasm_bindgen::memory()
}