/**
 * NARBE Loops - the music itself: layers, patterns and speeds.
 *
 * Edit freely. Drum patterns are 16 steps (one bar): x = hit, . = rest.
 * Bass and melody use numbers in the A minor pentatonic scale
 * (0 = A, 1 = C, 2 = D, 3 = E, 4 = G, 5 = A an octave up, and so on),
 * and -1 is a rest. Every note in this scale fits with every other,
 * so nothing a player makes can sound wrong.
 *
 */

window.NL = window.NL || {};

NL.Music = (function () {
    'use strict';

    const SCALE = [0, 3, 5, 7, 10];
    const R = -1;
    const degToMidi = (base, d) => base + 12 * Math.floor(d / 5) + SCALE[d % 5];
    const drum = s => Array.from(s).map(c => (c === 'x' ? 0 : R));

    const LAYERS = [
        {
            id: 'kick', name: 'Kick', color: '#ff3b3b', type: 'drum',
            presets: ['x...x...x...x...', 'x......x..x.....', 'x..x..x...x.....', 'x.x...x.x.x...x.'].map(drum)
        },
        {
            id: 'snare', name: 'Snare', color: '#ffd400', type: 'drum',
            presets: ['....x.......x...', '....x..x....x...', '....x.......x..x', '....x...x...x.x.'].map(drum)
        },
        {
            id: 'hat', name: 'Hi-hat', color: '#00e5ff', type: 'drum',
            presets: ['x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx', '..x...x...x...x.', 'x.xxx.xxx.xxx.xx'].map(drum)
        },
        {
            id: 'bass', name: 'Bass', color: '#3dff6e', type: 'tone', base: 45,
            presets: [
                [0, R, R, 0, R, R, 0, R, 0, R, R, 0, R, R, 3, R],
                [0, R, 2, R, 3, R, 2, R, 0, R, 4, R, 3, R, 2, R],
                [0, R, 5, R, 0, R, 5, R, 3, R, 8, R, 4, R, 9, R],
                [0, R, R, R, R, R, R, R, 3, R, R, R, 2, R, R, R]
            ],
            // The note a recorded press plays on each step.
            contour: [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 2, 2, 4, 4]
        },
        {
            id: 'melody', name: 'Melody', color: '#ff4fd8', type: 'tone', base: 69,
            presets: [
                [0, R, 2, R, 3, R, 2, R, 4, R, 3, R, 2, R, R, R],
                [5, R, 4, R, 3, R, 4, R, 2, R, R, R, 0, R, R, R],
                [0, 2, 4, 5, 0, 2, 4, 5, 1, 3, 5, 6, 1, 3, 5, 6],
                [R, R, 4, 4, 5, R, 4, R, R, R, 3, 3, 2, R, 0, R]
            ],
            contour: [0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2, 0]
        }
    ];

    const SPEEDS = [
        { bpm: 70, name: 'Slow' },
        { bpm: 85, name: 'Easy' },
        { bpm: 100, name: 'Medium' },
        { bpm: 115, name: 'Fast' },
        { bpm: 130, name: 'Very fast' }
    ];

    const SOUNDS = {
        kick: ['Classic kick', 'Deep kick', 'Punchy kick', 'Soft kick'],
        snare: ['Snare', 'Clap', 'Rim', 'Brush'],
        hat: ['Closed hat', 'Open hat', 'Shaker', 'Metal hat'],
        bass: ['Classic bass', 'Smooth bass', 'Pluck bass', 'Buzz bass'],
        melody: ['Classic lead', 'Bell', 'Pluck', 'Soft tone']
    };

    const ADD_OPTIONS = [
        { id: 'kick', instrument: 'kick', name: 'Kick', sound: 0, icon: 'kick' },
        { id: 'snare', instrument: 'snare', name: 'Snare', sound: 0, icon: 'snare' },
        { id: 'hat', instrument: 'hat', name: 'Hi-hat', sound: 0, icon: 'hat' },
        { id: 'clap', instrument: 'snare', name: 'Clap', sound: 1, icon: 'clap', color: '#ffb74d' },
        { id: 'shaker', instrument: 'hat', name: 'Shaker', sound: 2, icon: 'shaker', color: '#68e0ce' },
        { id: 'rim', instrument: 'snare', name: 'Rim', sound: 2, icon: 'snare', color: '#ffd400' },
        { id: 'open-hat', instrument: 'hat', name: 'Open hat', sound: 1, icon: 'hat' },
        { id: 'bell', instrument: 'melody', name: 'Bell', sound: 1, icon: 'bell', color: '#c49aff' },
        { id: 'pluck', instrument: 'melody', name: 'Pluck', sound: 2, icon: 'pluck', color: '#ff91c8' },
        { id: 'bass', instrument: 'bass', name: 'Bass', sound: 0, icon: 'bass' },
        { id: 'melody', instrument: 'melody', name: 'Melody', sound: 0, icon: 'melody' }
    ];
    function choice(id) { return ADD_OPTIONS.find(option => option.id === id); }
    function line(kind, id, name) {
        const option = choice(kind), base = LAYERS.find(L => L.id === option.instrument);
        return Object.assign({}, base, { id, instrument: base.id, kind, name: name || option.name,
            color: option.color || base.color, icon: option.icon });
    }
    return {
        ADD_OPTIONS, choice, line,
        sounds: function (layer) { return SOUNDS[layer.instrument || layer.id]; },
        SCALE: SCALE, LAYERS: LAYERS, SPEEDS: SPEEDS,
        degToMidi: degToMidi,
        layer: id => LAYERS.find(l => l.id === id)
    };
})();
