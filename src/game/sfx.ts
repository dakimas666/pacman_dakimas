export class Sfx {
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctx = (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return null;
    if (!this.ctx) this.ctx = new Ctx();
    return this.ctx;
  }

  beep(freqHz: number, durationMs: number, volume = 0.03, type: OscillatorType = "square") {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freqHz;
    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + durationMs / 1000);
  }

  pellet() {
    this.beep(880, 28, 0.02, "square");
  }

  power() {
    this.beep(220, 90, 0.03, "sawtooth");
  }

  eatGhost(mult: number) {
    const base = 520 + mult * 90;
    this.beep(base, 80, 0.03, "triangle");
  }

  hit() {
    this.beep(120, 140, 0.04, "sawtooth");
  }
}

