use std::f32::consts::TAU;
use toner_dsp::yin::{rms, Yin};

/// Deterministic noise so tests are repeatable.
struct Lcg(u32);
impl Lcg {
    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (self.0 >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0
    }
}

/// A plucked-string-like tone: harmonics with a loud second partial, plus noise.
fn guitar_like(freq: f32, sr: f32, n: usize, noise: f32) -> Vec<f32> {
    let amps = [0.6, 1.0, 0.5, 0.35, 0.2, 0.12, 0.08];
    let mut rng = Lcg(42);
    (0..n)
        .map(|i| {
            let t = i as f32 / sr;
            let tone: f32 = amps.iter().enumerate().map(|(k, a)| a * (TAU * freq * (k + 1) as f32 * t).sin()).sum();
            0.2 * tone + noise * rng.next()
        })
        .collect()
}

fn cents(a: f32, b: f32) -> f32 {
    1200.0 * (a / b).log2()
}

#[test]
fn detects_guitar_strings_within_two_cents() {
    let mut yin = Yin::new();
    for &sr in &[44_100.0f32, 48_000.0] {
        for &f in &[82.41f32, 110.0, 146.83, 196.0, 246.94, 329.63, 659.26, 1046.5] {
            let frame = guitar_like(f, sr, 2048, 0.01);
            let e = yin.detect(&frame, sr, 60.0, 1500.0, 0.15).expect("pitched");
            assert!(cents(e.freq, f).abs() < 2.0, "sr {sr} f {f}: got {} ({:.2} cents)", e.freq, cents(e.freq, f));
            assert!(e.clarity > 0.8, "clarity {}", e.clarity);
        }
    }
}

#[test]
fn detects_sine_voice_range() {
    let mut yin = Yin::new();
    let sr = 48_000.0;
    for &f in &[98.0f32, 220.0, 261.63, 440.0, 523.25, 880.0] {
        let frame: Vec<f32> = (0..2048).map(|i| 0.3 * (TAU * f * i as f32 / sr).sin()).collect();
        let e = yin.detect(&frame, sr, 60.0, 1500.0, 0.15).unwrap();
        assert!(cents(e.freq, f).abs() < 1.0, "f {f}: got {}", e.freq);
    }
}

#[test]
fn hears_small_detuning() {
    let mut yin = Yin::new();
    let sr = 48_000.0;
    let target = 110.0f32;
    for &c in &[-15.0f32, -5.0, 3.0, 10.0] {
        let f = target * 2f32.powf(c / 1200.0);
        let e = yin.detect(&guitar_like(f, sr, 2048, 0.0), sr, 60.0, 1500.0, 0.15).unwrap();
        assert!((cents(e.freq, target) - c).abs() < 1.0, "wanted {c} cents, got {}", cents(e.freq, target));
    }
}

#[test]
fn rejects_noise_and_silence() {
    let mut yin = Yin::new();
    let mut rng = Lcg(7);
    let noise: Vec<f32> = (0..2048).map(|_| 0.3 * rng.next()).collect();
    assert!(yin.detect(&noise, 48_000.0, 60.0, 1500.0, 0.15).map_or(true, |e| e.clarity < 0.6));
    assert_eq!(rms(&[0.0; 512]), 0.0);
}

#[test]
fn ffi_decimated_path_stays_accurate() {
    use toner_dsp::*;
    for &sr in &[44_100.0f32, 48_000.0, 96_000.0] {
        let len = if sr > 50_000.0 { 4096 } else { 2048 };
        for &f in &[82.41f32, 110.0, 196.0, 329.63, 659.26, 1046.5] {
            let frame = guitar_like(f, sr, len, 0.01);
            unsafe {
                let d = toner_detector_new(len as u32);
                std::ptr::copy_nonoverlapping(frame.as_ptr(), toner_detector_input(d), len);
                let got = toner_detector_run(d, len as u32, sr, 60.0, 1500.0, 0.15, 0.001);
                assert!(cents(got, f).abs() < 2.0, "sr {sr} f {f}: got {got} ({:.2} cents)", cents(got, f));
                toner_detector_free(d);
            }
        }
    }
}

#[test]
fn ffi_round_trip() {
    use toner_dsp::*;
    let sr = 48_000.0;
    let frame = guitar_like(146.83, sr, 2048, 0.0);
    unsafe {
        let d = toner_detector_new(4096);
        std::ptr::copy_nonoverlapping(frame.as_ptr(), toner_detector_input(d), frame.len());
        let f = toner_detector_run(d, 2048, sr, 60.0, 1500.0, 0.15, 0.001);
        assert!(cents(f, 146.83).abs() < 2.0);
        assert!(toner_detector_clarity(d) > 0.8);
        assert!(toner_detector_rms(d) > 0.01);
        // Below the gate: no pitch.
        let f = toner_detector_run(d, 2048, sr, 60.0, 1500.0, 0.15, 10.0);
        assert_eq!(f, 0.0);
        toner_detector_free(d);
    }
}
