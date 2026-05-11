// processor.js
class OceanProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fs = 48000;
    this.baud = 1800;
    this.sps = this.fs / this.baud;
    this.f0 = 2000; 
    this.f1 = 3600;
    
    this.samples = new Float32Array(this.fs * 1); // 1-second buffer
    this.ptr = 0;
    this.bitBuffer = [];
    this.syncPattern = [1,0,1,0,0,1,1,1, 0,1,0,1,1,0,1,0, 1,1,0,0,0,0,1,1, 0,0,1,1,1,1,0,0]; // A7 5A C3 3C
  }

  // CCITT-FALSE CRC16 as used in your TX script
  crc16(data) {
    let crc = 0xFFFF;
    for (let b of data) {
      crc ^= b << 8;
      for (let i = 0; i < 8; i++) {
        if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        else crc = (crc << 1) & 0xFFFF;
      }
    }
    return crc & 0xFFFF;
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;

    for (let i = 0; i < input.length; i++) {
      this.samples[this.ptr] = input[i];
      
      // Simple Zero-Crossing / Peak based bit extraction (Demod Theory)
      // In a full port, we'd use the Goertzel/Correlation refs here.
      // For now, we measure the "instantaneous" frequency power.
      if (this.ptr % Math.floor(this.sps) === 0) {
        this.demodulateBit();
      }

      this.ptr = (this.ptr + 1) % this.samples.length;
    }

    // Send peak level for the green bar
    let peak = 0;
    for(let i=0; i<input.length; i++) if(Math.abs(input[i]) > peak) peak = Math.abs(input[i]);
    this.port.postMessage({ type: 'PEAK', value: peak });

    return true;
  }

  demodulateBit() {
    // Simplified frequency detection: 
    // We check the energy at 2000Hz vs 3600Hz in the last 'sps' samples.
    // This mimics your Python 'np.argmax' logic.
    let p0 = 0, p1 = 0;
    const start = (this.ptr - Math.floor(this.sps) + this.samples.length) % this.samples.length;
    
    for (let i = 0; i < Math.floor(this.sps); i++) {
        const s = this.samples[(start + i) % this.samples.length];
        p0 += s * Math.sin(2 * Math.PI * this.f0 * (i / this.fs));
        p1 += s * Math.sin(2 * Math.PI * this.f1 * (i / this.fs));
    }

    const bit = (Math.abs(p1) > Math.abs(p0)) ? 1 : 0;
    this.bitBuffer.push(bit);
    if (this.bitBuffer.length > 512) this.bitBuffer.shift();

    this.checkSync();
  }

  checkSync() {
    if (this.bitBuffer.length < 32) return;
    const last32 = this.bitBuffer.slice(-32);
    if (last32.every((v, i) => v === this.syncPattern[i])) {
        // SYNC FOUND - In a full port, the next X bits are parsed as a packet.
        // We trigger a test cell to prove the bridge is working.
        this.port.postMessage({ type: 'LOG', msg: "SYNC DETECTED" });
    }
  }
}

registerProcessor('ocean-processor', OceanProcessor);
