/**
 * ROBOTFOOTBALL — original procedural stadium sound assets.
 * Run: node tools/generate-audio.mjs
 * Everything is synthesized offline into ordinary PCM WAV files.
 * No recordings, external libraries, melodies, samples, or network access.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/audio');
const RATE = 22050;
const TAU = Math.PI * 2;
let seed = 0x14F00DBA;
function random() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
function noise() { return random() * 2 - 1; }
function envelope(t, duration, attack = .012, release = .15) {
  return Math.min(1, Math.max(0, t / attack)) * Math.min(1, Math.max(0, (duration - t) / release));
}
function make(duration, stereo = false) {
  return Array.from({ length: stereo ? 2 : 1 }, () => new Float32Array(Math.ceil(duration * RATE)));
}
function add(sound, start, duration, sample, gain = 1, pan = 0) {
  const begin = Math.floor(start * RATE);
  const end = Math.min(sound[0].length, Math.ceil((start + duration) * RATE));
  const left = sound.length === 1 ? 1 : Math.sqrt((1 - pan) / 2);
  const right = Math.sqrt((1 + pan) / 2);
  for (let i = begin; i < end; i++) {
    if (i < 0) continue;
    const v = sample((i - begin) / RATE, i - begin) * gain;
    sound[0][i] += v * left;
    if (sound.length > 1) sound[1][i] += v * right;
  }
}
function room(sound, gain = .12) {
  // Sparse early reflections with a soft tail. Done offline only.
  for (const channel of sound) {
    for (const [seconds, amount] of [[.071, gain], [.113, gain * .65], [.173, gain * .40], [.247, gain * .22]]) {
      const delay = Math.floor(seconds * RATE);
      for (let i = channel.length - 1; i >= delay; i--) channel[i] += channel[i - delay] * amount;
    }
  }
}
function loopSeam(sound, length = .18) {
  // Overlap the tail into the beginning, then remove the overlapped tail.
  const n = Math.floor(length * RATE);
  return sound.map(channel => {
    const result = channel.slice(0, channel.length - n);
    for (let i = 0; i < n; i++) {
      const a = .5 - .5 * Math.cos(Math.PI * i / n);
      result[i] = channel[channel.length - n + i] * (1 - a) + channel[i] * a;
    }
    return result;
  });
}
async function save(name, sound, peak = .78) {
  let max = 0;
  for (const channel of sound) for (const v of channel) max = Math.max(max, Math.abs(v));
  const gain = max ? peak / max : 1;
  const frames = sound[0].length;
  const channels = sound.length;
  const dataLength = frames * channels * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataLength, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22); buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * channels * 2, 28); buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataLength, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sound[c][i] * gain)) * 32767), 44 + (i * channels + c) * 2);
  }
  await writeFile(path.join(out, name + '.wav'), buffer);
}
function lowPass(cutoff) {
  const amount = 1 - Math.exp(-TAU * cutoff / RATE);
  let last = 0;
  return v => { last += (v - last) * amount; return last; };
}
function formant(frequency, bandwidth) {
  const radius = Math.exp(-Math.PI * bandwidth / RATE);
  const coefficient = 2 * radius * Math.cos(TAU * frequency / RATE);
  let one = 0, two = 0;
  return value => {
    const result = (1 - radius) * value + coefficient * one - radius * radius * two;
    two = one; one = result;
    return result;
  };
}
function crowd(duration, intensity = 1) {
  const result = make(duration, true);
  // A large, distant group: overlapping vowel-like noise resonators.
  for (let voice = 0; voice < 36; voice++) {
    const pan = noise() * .96;
    const base = 280 + random() * 360;
    const first = formant(base, 110 + random() * 150);
    const second = formant(base * (2.1 + random() * .7), 220);
    const breath = lowPass(2700);
    const phase = random() * TAU;
    const rate = .18 + random() * .52;
    add(result, 0, duration, t => {
      const x = breath(noise());
      const rise = .38 + .62 * Math.pow(.5 + .5 * Math.sin(t * TAU * rate + phase), 2);
      return (first(x) * .7 + second(x) * .3) * rise;
    }, .20 * intensity, pan);
  }
  // A low wash beneath the voices gives a stadium its sense of scale.
  for (let c = 0; c < 2; c++) {
    const wash = lowPass(180);
    for (let i = 0; i < result[c].length; i++) result[c][i] += wash(noise()) * .095 * intensity;
  }
  // Small, scattered applause transients across the stands.
  for (let start = .06; start < duration; start += .06 + random() * .14) {
    const hit = lowPass(2800 + random() * 1700);
    add(result, start, .14, t => hit(noise()) * Math.exp(-t * 50) * envelope(t, .14, .001, .04), (.11 + random() * .18) * intensity, noise());
  }
  room(result, .22);
  return result;
}
function leather(duration, depth, crack, drag = .15) {
  const sound = make(duration);
  const low = lowPass(1500);
  const high = lowPass(6000);
  add(sound, 0, duration, t => {
    const bass = Math.sin(TAU * (depth * t - depth * .23 * t * t)) * Math.exp(-t * 17);
    const thwack = high(noise()) * Math.exp(-t * crack);
    const cloth = low(noise()) * Math.exp(-t * 9) * drag;
    return (bass * .48 + thwack * .70 + cloth) * envelope(t, duration, .001, .08);
  });
  room(sound, .08);
  return sound;
}
function horn(t, frequency) {
  const phase = TAU * frequency * t + .018 * Math.sin(TAU * 5 * t);
  return Math.sin(phase) + .40 * Math.sin(phase * 2) + .23 * Math.sin(phase * 3) +
    .08 * Math.sin(phase * 4) + .035 * Math.sin(phase * 6);
}
function fanfare(notes, duration) {
  const result = make(duration, true);
  for (const [start, frequency, length] of notes) {
    add(result, start, length, t => horn(t, frequency) * envelope(t, length, .025, .16), .28, -.28);
    add(result, start + .009, length, t => horn(t, frequency * 1.002) * envelope(t, length, .035, .18), .23, .28);
    add(result, start, length, t => horn(t, frequency / 2) * envelope(t, length, .02, .16), .10);
  }
  room(result, .19);
  return result;
}

await mkdir(out, { recursive: true });
await save('crowd-bed', loopSeam(crowd(10.18)), .62);
const detail = crowd(6.18, .5);
// The detail layer breathes separately from the ambient murmur.
for (const channel of detail) for (let i = 0; i < channel.length; i++) {
  channel[i] *= .38 + .62 * Math.pow(.5 + .5 * Math.sin(TAU * i / channel.length - .5), 2);
}
await save('crowd-detail', loopSeam(detail), .58);
const swell = crowd(3.4, 1.6);
for (const channel of swell) for (let i = 0; i < channel.length; i++) {
  const t = i / RATE;
  channel[i] *= envelope(t, 3.4, .30, 1.9);
}
await save('crowd-swell', swell, .82);
await save('snap', leather(.26, 140, 70, .10), .72);
await save('catch', leather(.34, 126, 48, .18), .84);
const tackle = leather(.78, 70, 29, .36);
add(tackle, .08, .32, t => Math.sin(TAU * 46 * t) * Math.exp(-t * 15), .38);
const turf = lowPass(1750);
add(tackle, .11, .50, t => turf(noise()) * envelope(t, .50, .025, .37), .30);
await save('tackle', tackle, .87);
const kick = leather(.58, 89, 48, .10);
add(kick, 0, .45, t => Math.sin(TAU * (195 * t - 63 * t * t)) * Math.exp(-t * 15) * envelope(t, .45, .003, .06), .38);
await save('kick', kick, .88);
const pass = make(.38);
const passFilter = lowPass(3600);
add(pass, 0, .38, t => passFilter(noise()) * Math.sin(Math.PI * t / .38) ** 2, .45);
add(pass, .04, .22, t => Math.sin(TAU * (380 * t + 600 * t * t)) * envelope(t, .22, .02, .14), .035);
await save('throw', pass, .58);
// It sounds after every play, so it is a short, soft tweet: lower than a real
// referee's whistle, with a gentle roll instead of a shrill trill.
const whistle = make(.72);
let whistlePhase = 0;
const whistleBreath = lowPass(1800);
add(whistle, 0, .72, t => {
  // One noise draw per sample over the old length keeps every later sound byte-identical.
  const breath = whistleBreath(noise());
  if (t >= .34) return 0;
  const frequency = 2080 + 60 * Math.sin(TAU * 8 * t) + 140 * Math.min(1, t / .05);
  whistlePhase += TAU * frequency / RATE;
  const flutter = .93 + .07 * Math.sin(TAU * 34 * t);
  return (Math.sin(whistlePhase) * .7 + Math.sin(whistlePhase * 2) * .04 + breath * .05) * flutter * envelope(t, .34, .035, .14);
});
room(whistle, .07);
await save('whistle', whistle, .5);
await save('touchdown', fanfare([[0, 293.66, .20], [.23, 369.99, .20], [.46, 440, .22], [.72, 587.33, .85], [.74, 440, .82]], 1.9), .78);
await save('win', fanfare([[0, 293.66, .23], [.26, 440, .23], [.52, 587.33, .31], [.88, 554.37, .20], [1.12, 587.33, 1.1], [1.12, 369.99, 1.1]], 2.6), .80);
await save('lose', fanfare([[0, 293.66, .32], [.38, 261.63, .34], [.78, 220, .70]], 1.8), .53);
for (let n = 1; n <= 4; n++) {
  const cue = make(.20);
  const frequency = 430 + n * 145;
  add(cue, 0, .20, t => (Math.sin(TAU * frequency * t) + .16 * Math.sin(TAU * frequency * 2 * t)) * envelope(t, .20, .01, .13));
  await save('pause' + n, cue, .64);
}
for (const [name, frequency, duration] of [['hover', 610, .065], ['select', 850, .12]]) {
  const cue = make(duration);
  add(cue, 0, duration, t => (Math.sin(TAU * frequency * t) + .10 * Math.sin(TAU * frequency * 2 * t)) * envelope(t, duration, .003, duration * .85));
  await save(name, cue, name === 'hover' ? .36 : .50);
}

// Robot league effects. Appended after the originals so their seeded noise is unchanged.
const clang = make(.62);
for (const [frequency, decay, gain] of [[523, 9, .42], [1187, 13, .30], [1911, 17, .22], [2842, 22, .14]]) {
  add(clang, 0, .62, t => Math.sin(TAU * frequency * t + Math.sin(TAU * 7 * t) * .4) * Math.exp(-t * decay) * envelope(t, .62, .001, .2), gain);
}
const impact = lowPass(900);
add(clang, 0, .12, t => impact(noise()) * Math.exp(-t * 40), .55);
room(clang, .1);
await save('clang', clang, .8);
const zap = make(.46);
let zapPhase = 0;
add(zap, 0, .46, t => {
  zapPhase += TAU * (220 + 1400 * t + 120 * Math.sin(TAU * 31 * t)) / RATE;
  return (Math.sign(Math.sin(zapPhase)) * .35 + Math.sin(zapPhase * 2) * .4) * envelope(t, .46, .005, .2);
}, .5);
add(zap, .02, .3, t => noise() * Math.exp(-t * 18), .16);
await save('break', zap, .7);
const powerup = make(1.15, true);
for (const [start, frequency] of [[0, 392], [.1, 523.25], [.2, 659.25], [.3, 783.99], [.42, 1046.5]]) {
  add(powerup, start, .7, t => (Math.sin(TAU * frequency * t) + .3 * Math.sign(Math.sin(TAU * frequency * t)) * .4) * envelope(t, .7, .01, .5), .22, (frequency - 700) / 900);
}
room(powerup, .16);
await save('powerup', powerup, .72);
const powerdown = make(.8);
let downPhase = 0;
add(powerdown, 0, .8, t => { downPhase += TAU * (520 * Math.exp(-t * 2.4)) / RATE; return (Math.sin(downPhase) + .25 * Math.sign(Math.sin(downPhase))) * envelope(t, .8, .01, .3); }, .5);
await save('powerdown', powerdown, .6);

// Charge meter and kick guide cues. Appended last, so every earlier sound stays identical.
const chargeHum = make(.55);
let humPhase = 0;
add(chargeHum, 0, .55, t => { humPhase += TAU * (180 + 260 * t / .55) / RATE; return (Math.sin(humPhase) * .7 + Math.sin(humPhase * 2) * .18) * envelope(t, .55, .03, .2); }, .38);
await save('charge', chargeHum, .5);
const ready = make(.62);
for (const [start, frequency] of [[0, 880], [.12, 1318.5]]) {
  add(ready, start, .45, t => (Math.sin(TAU * frequency * t) + .2 * Math.sin(TAU * frequency * 2 * t)) * Math.exp(-t * 5) * envelope(t, .45, .004, .2), .42);
}
await save('ready', ready, .62);
const target = make(.32);
add(target, 0, .32, t => (Math.sin(TAU * 1046.5 * t) + .12 * Math.sin(TAU * 2093 * t)) * Math.exp(-t * 11) * envelope(t, .32, .003, .15), .5);
await save('target', target, .5);

// Overthrow warning: two short low pulses as the charge line runs past the receiver.
const over = make(.3);
for (const start of [0, .14]) add(over, start, .1, t => (Math.sin(TAU * 220 * t) * .7 + Math.sign(Math.sin(TAU * 110 * t)) * .15) * envelope(t, .1, .004, .05), .5);
await save('over', over, .5);
