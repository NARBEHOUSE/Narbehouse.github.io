/** Adapted from Froggy Family Goes to Cape Samila. See CREDITS.md. */
(function () {
    'use strict';
    const objects = {};
    ['cover-car', 'rear-car', 'swimming-frog', 'octopus', 'snack-frog', 'little-frog',
        'rabbit', 'shovel', 'wave', 'sandcastle', 'sun', 'wind-reach', 'wind-wave',
        'frog-afloat', 'octopus-wave', 'snack-bite', 'rabbit-wipe', 'rabbit-calm',
        'frog-idea', 'frog-dig-down', 'frog-dig-lift', 'frog-cheer', 'rabbit-cheer',
        'wave-break', 'castle-surf', 'wind-green-ready', 'wind-green-cheer',
        'rabbit-pat-ready', 'rabbit-pat-down', 'crab-ready', 'crab-airborne', 'gull-up', 'gull-down'].forEach(name => {
        const image = 'sprites/' + name + '.webp';
        objects[name] = { image: image, cviImage: image };
    });
    ['town', 'beach', 'underwater', 'picnic', 'friends', 'digging-stage',
        'shoreline-rise', 'shoreline-break', 'castle-stage', 'sunset'].forEach(name => {
        const image = 'backgrounds/' + name + '-panorama.webp';
        objects[name + '-panorama'] = { image, cviImage: image };
    });
    const beach = ['#c5e8f6', '#fff0cd', '#fff1cf'];
    ['coast', 'town', 'underwater', 'sunset'].forEach(name => {
        const image = 'backgrounds/' + name + '-extension.webp';
        objects[name + '-extension'] = { image, cviImage: image };
    });
    const sea = ['#b9e9fa', '#44bfd6', '#97dfdf'];
    const layer = (object, x, bottom, height, extra) => Object.assign({ object, x, bottom, height, active: true }, extra);
    // A pose changes hands/face/props while feet and body anchors stay fixed.
    const pose = (at, object) => ({ at, object });
    const scene = (background, layers, focus, colors) => {
        // The original 16:9 action area sits in the middle of a wider painting.
        // Keep positions authored in that familiar area; convert once here.
        const bounds = { town: [0.15, 0.85, 0.86], beach: [0.05, 0.95, 0.86],
            underwater: [0.15, 0.85, 0.86], picnic: [0.10, 0.90, 0.97],
            'castle-stage': [0.20, 0.80, 0.86] }[background] || [0.15, 0.85, 0.90];
        const span = bounds[1] - bounds[0];
        const x = n => (11 / 54 + n * 32 / 54 - bounds[0]) / span;
        layers = layers.map(l => Object.assign({}, l, { x: x(l.x),
            travel: (l.travel || 0) * 32 / 54 / span }));
        return { background: background ? 'backgrounds/' + background + '.webp' : undefined,
            illustration: { layers, focus: [x(focus[0]), focus[1], x(focus[2]), focus[3]], colors: colors || beach,
                panorama: background + '-panorama', panoramaBounds: bounds,
                extension: (['town', 'underwater', 'sunset'].includes(background) ? background : 'coast') + '-extension' } };
    };
    const cover = () => ({ illustration: { cover: true, colors: ['#ddf2f2', '#fff6db', '#f5dbb7'],
        focus: [0.18, 0.05, 0.90, 0.94],
        layers: [layer('cover-car', 0.43, 0.88, 0.78, { grounded: true, travel: 0.12 })] } });
    const friends = (rabbitActs) => scene('friends', [
        layer('little-frog', 0.35, 0.77, 0.47, { grounded: true, active: !rabbitActs,
            poses: rabbitActs ? [] : [pose(0.32, 'frog-idea')] }),
        layer(rabbitActs ? 'rabbit' : 'rabbit-wipe', 0.70, 0.77, 0.43, { grounded: true, active: rabbitActs,
            poses: rabbitActs ? [pose(0.33, 'rabbit-wipe'), pose(0.65, 'rabbit'), pose(0.82, 'rabbit-wipe')]
                : [pose(0.48, 'rabbit-calm')] })
    ], [0.20, 0.22, 0.85, 0.83]);
    const shoreline = () => {
        const page = scene('shoreline-rise', [layer('wave', 0.24, 0.70, 0.29, {
            contrastOnly: true, travel: 0.17, poses: [pose(0.52, 'wave-break')]
        })], [0.07, 0.30, 1.10, 0.86]);
        // Only water and wet sand change. This boundary excludes the children,
        // castle, crab, dunes and sky from the animated painting.
        page.illustration.shoreline = { object: 'shoreline-break-panorama', mask: [
            [-0.10, 0.275], [0.47, 0.275], [0.60, 0.29], [0.65, 0.32],
            [0.60, 0.40], [0.65, 0.47], [0.58, 0.56], [0.59, 0.63],
            [0.52, 0.72], [0.45, 0.80], [0.40, 0.84], [0.28, 0.90],
            [0.05, 1.05], [-0.10, 1.05]
        ] };
        return page;
    };
    NSS.registerStory({
        folder: 'froggy-family-goes-to-cape-cod',
        title: 'Froggy Family Goes To Cape Cod',
        availableOn: '2026-10-21', // First available on the hub; hidden, used only for Newest sorting.
        description: 'Pack your beach bag and join the Froggy family at Cape Cod. What will Little Frog discover by the sea?',
        readingTag: 'Simple plot',
        storyType: 'adapted',
        tags: ['Animals', 'Friendship'],
        cviOutline: 'alpha',
        // Opaque wheel/foot contact positions in each transparent source image.
        contactShadows: {
            'cover-car': [[0.28, 0.943, 0.10], [0.54, 0.968, 0.11], [0.78, 0.949, 0.09]],
            'rear-car': [[0.23, 0.923, 0.10], [0.61, 0.977, 0.11], [0.86, 0.974, 0.08]],
            'little-frog': [[0.37, 0.955, 0.10], [0.68, 0.959, 0.10]],
            'rabbit': [[0.40, 0.960, 0.10], [0.60, 0.960, 0.10]],
            'rabbit-wipe': [[0.40, 0.960, 0.10], [0.60, 0.960, 0.10]],
            'rabbit-calm': [[0.40, 0.960, 0.10], [0.60, 0.960, 0.10]],
            'frog-dig-down': [[0.23, 0.946, 0.12], [0.62, 0.946, 0.12]],
            'rabbit-pat-ready': [[0.64, 0.98, 0.20]],
            'snack-frog': [[0.40, 0.920, 0.11], [0.66, 0.940, 0.12]],
            'sandcastle': [[0.50, 0.975, 0.35]]
        },
        objects,
        credits: {
            text: 'Adapted from Froggy Family Goes to Cape Samila. © 2025 The Asia Foundation – Let’s Read. Illustrations: Vipavi Chakajsongsak. Editor: Rapeephan Pattanavech. Contributors: John Viano and Peeriya Pongsarigun. English translation: Wendy Xiao. Title, text and artwork adapted; switch animations added.',
            links: [
                { label: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
                { label: 'Let’s Read source', url: 'https://www.letsreadasia.org/' }
            ]
        },
        pages: [
            Object.assign({ text: 'Froggy Family Goes To Cape Cod', action: 'drive' }, cover()),
            Object.assign({ text: 'The Froggy family is going to Cape Cod. Daddy Frog drives to the beach.', action: 'drive' },
                scene('town', [layer('rear-car', 0.32, 0.76, 0.37, { grounded: true, travel: 0.15, drop: 0.025 })], [0.10, 0.29, 0.67, 0.84], ['#d0eced', '#e8e5c5', '#f5dda6'])),
            Object.assign({ text: 'Little Frog sees the sea. Feel the salty breeze!', action: 'breeze' },
                scene('town', [layer('rear-car', 0.47, 0.785, 0.42, { grounded: true,
                    poses: [pose(0.18, 'wind-green-ready'), pose(0.44, 'wind-green-cheer'),
                        pose(0.64, 'wind-green-ready'), pose(0.79, 'wind-green-cheer')] })],
                    [0.10, 0.29, 0.67, 0.84], ['#d0eced', '#e8e5c5', '#f5dda6'])),
            Object.assign({ text: 'Little Frog jumps into the water. Splash! Mama watches nearby.', action: 'swim' },
                scene('beach', [layer('swimming-frog', 0.73, 0.59, 0.34, { drop: 0.11,
                    poses: [pose(0.45, 'frog-afloat')] })], [0.24, 0.23, 0.88, 0.78], sea)),
            Object.assign({ text: 'Little Frog meets new sea friends. Hello, octopus!', action: 'seahello' },
                scene('underwater', [layer('octopus', 0.70, 0.73, 0.43, {
                    poses: [pose(0.32, 'octopus-wave'), pose(0.62, 'octopus'), pose(0.80, 'octopus-wave')] })],
                    [0.15, 0.25, 0.88, 0.82], ['#9dddeb', '#189ec6', '#b4e4df'])),
            Object.assign({ text: 'Time for a snack. Little Frog enjoys sweet watermelon. Yum!', action: 'snack' },
                scene('picnic', [layer('snack-frog', 0.72, 0.79, 0.45, { grounded: true, foot: 0.944,
                    poses: [pose(0.32, 'snack-bite'), pose(0.72, 'snack-frog')] })], [0.06, 0.17, 0.90, 0.85])),
            Object.assign({ text: 'Little Rabbit is sad. A big wave knocked down the sandcastle.', action: 'tears' }, friends(true)),
            Object.assign({ text: 'Little Frog wants to help. He has an idea!', action: 'idea' }, friends(false)),
            Object.assign({ text: 'The friends dig together. They build a wall around the sandcastle.', action: 'dig' },
                scene('digging-stage', [layer('frog-dig-down', 0.64, 0.80, 0.37, { grounded: true, foot: 0.95,
                    poses: [pose(0.32, 'frog-dig-lift'), pose(0.64, 'frog-dig-down'), pose(0.82, 'frog-dig-lift')] }),
                    layer('rabbit-pat-ready', 0.89, 0.74, 0.32, { grounded: true, foot: 0.98, active: false,
                        poses: [pose(0.28, 'rabbit-pat-down'), pose(0.50, 'rabbit-pat-ready'),
                            pose(0.72, 'rabbit-pat-down'), pose(0.92, 'rabbit-pat-ready')] })],
                    [0.39, 0.32, 0.99, 0.90])),
            Object.assign({ text: 'Here comes a big wave. Will the sandcastle stay up?', action: 'tide' },
                shoreline()),
            Object.assign({ text: 'The water went around the castle. The castle stays up!', action: 'protect' },
                scene('castle-stage', [layer('sandcastle', 0.53, 0.64, 0.46, { grounded: true, active: false }),
                    layer('crab-ready', 0.14, 0.58, 0.24, { motion: 'hop', foot: 0.94,
                        poses: [pose(0.08, 'crab-airborne'), pose(0.42, 'crab-ready'),
                            pose(0.58, 'crab-airborne'), pose(0.92, 'crab-ready')] })], [0.06, 0.08, 0.92, 0.94])),
            Object.assign({ text: 'Hooray! The friends made a strong sandcastle together.', action: 'hooray' },
                scene('castle-stage', [
                    layer('sandcastle', 0.53, 0.64, 0.46, { grounded: true, active: false }),
                    layer('crab-ready', 0.14, 0.58, 0.24, { active: false, foot: 0.94 }),
                    layer('rabbit-calm', 0.38, 0.85, 0.30, { grounded: true, active: false,
                        poses: [pose(0.38, 'rabbit-cheer'), pose(0.65, 'rabbit-calm'), pose(0.82, 'rabbit-cheer')] }),
                    layer('little-frog', 0.68, 0.85, 0.34, { grounded: true,
                        poses: [pose(0.32, 'frog-cheer'), pose(0.65, 'little-frog'), pose(0.82, 'frog-cheer')] })],
                    [0.06, 0.08, 0.92, 0.94])),
            Object.assign({ text: 'The family watches the sunset. What a lovely day at Cape Cod!', action: 'sunset' },
                scene('sunset', [layer('sun', 0.56, 0.32, 0.16, { drop: 0.20, active: false, cviActive: true, motion: 'sunset' }),
                    layer('gull-up', 0.23, 0.32, 0.13, { motion: 'fly', travel: 0.51,
                        poses: [pose(0.14, 'gull-down'), pose(0.28, 'gull-up'), pose(0.42, 'gull-down'),
                            pose(0.56, 'gull-up'), pose(0.70, 'gull-down'), pose(0.84, 'gull-up')] }),
                    layer('gull-up', 0.13, 0.34, 0.10, { motion: 'fly', travel: 0.51, active: false,
                        poses: [pose(0.20, 'gull-down'), pose(0.34, 'gull-up'), pose(0.48, 'gull-down'),
                            pose(0.62, 'gull-up'), pose(0.76, 'gull-down'), pose(0.90, 'gull-up')] })],
                    [0.08, 0.10, 0.92, 0.90], ['#f3a8b4', '#e6beae', '#f2cf9c'])),
            Object.assign({ text: 'The End', action: 'drive' }, cover())
        ]
    });
})();
