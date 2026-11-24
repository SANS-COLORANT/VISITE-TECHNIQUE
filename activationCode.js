// Activation codes are opaque, single-use secrets. Never normalize QR payloads.
export function isActivationCode(value) {
  return typeof value === 'string' && value.length === 48 && /^[0-9a-f]{48}$/.test(value);
}

// A native camera can emit several events before React renders again.
// An invalid QR pauses reading until explicit retry; a valid QR closes the gate.
export function createActivationQrGate() {
  let state = 'reading';
  return {
    read(value) {
      if (state !== 'reading') return { kind: 'ignored' };
      if (!isActivationCode(value)) {
        state = 'invalid';
        return { kind: 'invalid' };
      }
      state = 'closed';
      return { kind: 'valid', code: value };
    },
    retry() { if (state === 'invalid') state = 'reading'; },
    close() { state = 'closed'; },
  };
}
