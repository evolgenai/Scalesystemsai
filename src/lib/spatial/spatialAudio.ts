/**
 * Lightweight Web Audio synthesizer for spatial HUD cues.
 * No assets required — oscillators only, fails soft when AudioContext blocked.
 */

type CueKind =
  | "unlock"
  | "engine_webgl"
  | "engine_ue5"
  | "fallback"
  | "error"
  | "navigate"
  | "arrive"
  | "deploy";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
  delay = 0
) {
  const audio = getCtx();
  if (!audio) return;
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Bioluminescent spatial audio cues — non-blocking. */
export function playSpatialCue(kind: CueKind): void {
  try {
    switch (kind) {
      case "unlock":
        tone(523.25, 0.12, "sine", 0.08);
        tone(659.25, 0.14, "triangle", 0.06, 0.08);
        tone(783.99, 0.18, "sine", 0.05, 0.16);
        break;
      case "engine_ue5":
        tone(220, 0.1, "sawtooth", 0.04);
        tone(440, 0.16, "sine", 0.07, 0.06);
        break;
      case "engine_webgl":
        tone(392, 0.1, "triangle", 0.05);
        tone(261.63, 0.14, "sine", 0.04, 0.08);
        break;
      case "fallback":
        tone(311.13, 0.12, "square", 0.035);
        tone(233.08, 0.18, "sine", 0.04, 0.1);
        break;
      case "error":
        tone(180, 0.2, "sawtooth", 0.045);
        break;
      case "navigate":
        tone(349.23, 0.08, "sine", 0.05);
        tone(440, 0.1, "triangle", 0.045, 0.07);
        break;
      case "arrive":
        tone(659.25, 0.1, "sine", 0.06);
        tone(880, 0.14, "triangle", 0.04, 0.09);
        break;
      case "deploy":
        tone(196, 0.1, "sawtooth", 0.035);
        tone(392, 0.12, "sine", 0.06, 0.08);
        tone(523.25, 0.16, "triangle", 0.05, 0.18);
        break;
      default:
        break;
    }
  } catch {
    /* audio optional */
  }
}
