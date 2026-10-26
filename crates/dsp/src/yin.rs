//! YIN fundamental-frequency estimator (de Cheveigné and Kawahara, 2002).
//!
//! The signal is compared with delayed copies of itself; the delay (lag) at
//! which it best matches is the period. YIN's cumulative-mean normalisation
//! and absolute threshold pick the first good dip rather than the deepest,
//! which avoids most octave-too-low errors on guitar, where the second
//! harmonic is often louder than the fundamental.

/// Result of one analysis frame.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Estimate {
    /// Fundamental frequency in Hz.
    pub freq: f32,
    /// 0..1, how periodic the frame is (1 minus YIN's aperiodicity).
    pub clarity: f32,
}

/// Reusable YIN analyser. Holds scratch buffers so analysis never allocates.
pub struct Yin {
    diff: Vec<f32>,
}

impl Default for Yin {
    fn default() -> Self {
        Self::new()
    }
}

impl Yin {
    pub fn new() -> Self {
        Self { diff: Vec::new() }
    }

    /// Estimate the fundamental of `frame`.
    ///
    /// `min_hz` sets the longest lag searched, so the frame must be at least
    /// twice that period long for a reliable estimate. `threshold` is YIN's
    /// absolute threshold (0.1 to 0.2 works well); frames whose best dip is
    /// above 0.5 are treated as unpitched.
    pub fn detect(
        &mut self,
        frame: &[f32],
        sample_rate: f32,
        min_hz: f32,
        max_hz: f32,
        threshold: f32,
    ) -> Option<Estimate> {
        let n = frame.len();
        let tau_min = ((sample_rate / max_hz).floor() as usize).max(2);
        let mut tau_max = (sample_rate / min_hz).ceil() as usize;
        if tau_max >= n / 2 {
            tau_max = n / 2 - 1;
        }
        if tau_max <= tau_min + 2 {
            return None;
        }
        let w = n - tau_max;

        // Difference function d(tau) = sum (x_j - x_{j+tau})^2.
        self.diff.clear();
        self.diff.resize(tau_max + 1, 0.0);
        for tau in 1..=tau_max {
            let mut sum = 0.0f32;
            let (a, b) = (&frame[..w], &frame[tau..tau + w]);
            for j in 0..w {
                let d = a[j] - b[j];
                sum += d * d;
            }
            self.diff[tau] = sum;
        }

        // Cumulative mean normalised difference, in place.
        self.diff[0] = 1.0;
        let mut running = 0.0f32;
        for tau in 1..=tau_max {
            running += self.diff[tau];
            self.diff[tau] = if running > 0.0 { self.diff[tau] * tau as f32 / running } else { 1.0 };
        }
        let d = &self.diff;

        // First dip below the threshold, followed down to its local minimum.
        let mut best: Option<usize> = None;
        let mut tau = tau_min;
        while tau < tau_max {
            if d[tau] < threshold {
                while tau + 1 < tau_max && d[tau + 1] < d[tau] {
                    tau += 1;
                }
                best = Some(tau);
                break;
            }
            tau += 1;
        }
        // Otherwise the global minimum, if it is clearly periodic.
        let tau = match best {
            Some(t) => t,
            None => {
                let (t, v) = (tau_min..tau_max)
                    .map(|t| (t, d[t]))
                    .fold((tau_min, f32::MAX), |acc, x| if x.1 < acc.1 { x } else { acc });
                if v > 0.5 {
                    return None;
                }
                t
            }
        };

        // Parabolic interpolation for sub-sample precision.
        let refined = if tau > 1 && tau < tau_max {
            let (s0, s1, s2) = (d[tau - 1], d[tau], d[tau + 1]);
            let denom = s0 - 2.0 * s1 + s2;
            if denom.abs() > 1e-12 {
                tau as f32 + 0.5 * (s0 - s2) / denom
            } else {
                tau as f32
            }
        } else {
            tau as f32
        };

        Some(Estimate { freq: sample_rate / refined, clarity: (1.0 - d[tau]).clamp(0.0, 1.0) })
    }
}

/// Root-mean-square level of a frame.
pub fn rms(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    (frame.iter().map(|x| x * x).sum::<f32>() / frame.len() as f32).sqrt()
}
