// processor.js - The "Ocean Lab" Demodulator Engine
class OceanProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fs = 48000;
    this.baud = 1800; // Matches your v9 default
    this.sps = this.fs / this.baud;
    
    // Tones from your Python v9 script
    this.f0 = 2000; 
    this.f1 = 3600;

    // Buffers
    this.samples = new Float32Array(this.fs * 2); // 2-second circular buffer
    this.ptr = 0;
    
    // Pre-calculate Reference Sines/Cosines for correlation (Python: make_refs)
    this.refs = [this.genRef(this.f0), this.genRef(this.f1)];
  }

  genRef(freq) {
    const s = new Float32Array(Math.floor(this.sps));
    const c = new Float32Array(Math.floor(this.sps));
    for (let i = 0; i < s.length; i++) {
      s[i] = Math.sin(2 * Math.PI * freq * (i / this.fs));
      c[i] = Math.cos(2 * Math.PI * freq * (i / this.fs));
    }
    return { s, c };
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;

    // Fill circular buffer
    for (let i = 0; i < input.length; i++) {
      this.samples[this.ptr] = input[i];
      this.ptr = (this.ptr + 1) % this.samples.length;
    }

    // Every 128 samples, attempt to find a bitstream
    // (A full port would implement your candidate/sync search here)
    // For now, we signal back the peak for the UI meter
    let peak = 0;
    for(let i=0; i<input.length; i++) if(Math.abs(input[i]) > peak) peak = Math.abs(input[i]);
    this.port.postMessage({ type: 'PEAK', value: peak });

    return true;
  }
}

registerProcessor('ocean-processor', OceanProcessor);
