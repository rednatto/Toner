//! Toner DSP core.
//!
//! Built as a plain `cdylib` for `wasm32-unknown-unknown` with a tiny C ABI
//! (no wasm-bindgen), so the module can be instantiated synchronously inside
//! an AudioWorklet. The same Rust code runs natively for tests and for a
//! possible native build later.

pub mod yin;

use yin::{rms, Yin};

/// One pitch detector: an input buffer the host writes into, plus the analyser.
pub struct Detector {
    input: Vec<f32>,
    /// Half-rate copy of the input, analysed when the sample rate is high.
    half: Vec<f32>,
    yin: Yin,
    clarity: f32,
    rms: f32,
}

/// Create a detector whose input buffer holds `capacity` samples.
#[no_mangle]
pub extern "C" fn toner_detector_new(capacity: u32) -> *mut Detector {
    let capacity = capacity as usize;
    Box::into_raw(Box::new(Detector {
        input: vec![0.0; capacity],
        half: Vec::with_capacity(capacity / 2 + 1),
        yin: Yin::new(),
        clarity: 0.0,
        rms: 0.0,
    }))
}

/// Pointer to the input buffer. Re-read it after any call that might grow memory.
///
/// # Safety
/// `d` must come from `toner_detector_new` and not have been freed.
#[no_mangle]
pub unsafe extern "C" fn toner_detector_input(d: *mut Detector) -> *mut f32 {
    (*d).input.as_mut_ptr()
}

/// Analyse the first `len` samples of the input buffer. Returns the
/// fundamental in Hz, or 0 when the frame is silent or unpitched.
///
/// Above 32 kHz the frame is halved in rate first (a two-tap average, enough
/// for fundamentals up to a few kHz), which cuts the cost about fourfold and
/// keeps the call cheap enough for the audio thread.
///
/// # Safety
/// `d` must come from `toner_detector_new` and not have been freed.
#[no_mangle]
pub unsafe extern "C" fn toner_detector_run(
    d: *mut Detector,
    len: u32,
    sample_rate: f32,
    min_hz: f32,
    max_hz: f32,
    threshold: f32,
    gate: f32,
) -> f32 {
    let det = &mut *d;
    let len = (len as usize).min(det.input.len());
    let frame = &det.input[..len];
    det.rms = rms(frame);
    det.clarity = 0.0;
    if det.rms < gate {
        return 0.0;
    }
    let (frame, rate) = if sample_rate > 32_000.0 {
        det.half.clear();
        det.half.extend(frame.chunks_exact(2).map(|p| 0.5 * (p[0] + p[1])));
        (&det.half[..], sample_rate / 2.0)
    } else {
        (frame, sample_rate)
    };
    match det.yin.detect(frame, rate, min_hz, max_hz, threshold) {
        Some(e) => {
            det.clarity = e.clarity;
            e.freq
        }
        None => 0.0,
    }
}

/// Clarity (0..1) of the last analysed frame.
///
/// # Safety
/// `d` must come from `toner_detector_new` and not have been freed.
#[no_mangle]
pub unsafe extern "C" fn toner_detector_clarity(d: *const Detector) -> f32 {
    (*d).clarity
}

/// RMS level of the last analysed frame.
///
/// # Safety
/// `d` must come from `toner_detector_new` and not have been freed.
#[no_mangle]
pub unsafe extern "C" fn toner_detector_rms(d: *const Detector) -> f32 {
    (*d).rms
}

/// Free a detector.
///
/// # Safety
/// `d` must come from `toner_detector_new` and must not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn toner_detector_free(d: *mut Detector) {
    if !d.is_null() {
        drop(Box::from_raw(d));
    }
}
