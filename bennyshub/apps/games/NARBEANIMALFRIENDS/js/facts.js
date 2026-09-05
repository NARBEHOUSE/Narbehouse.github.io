/**
 * NARBE Animal Friends - fun facts, one per reveal.
 *
 * Spoken instead of a "you made a friend" claim: real, gentle, kid-simple facts
 * about the animal that just stepped out, so a child learns something true
 * every time rather than being told an animal is personally their friend. Five
 * per animal, picked at random and never the same one twice in a row for that
 * animal, so pressing the same door five times in a row does not repeat itself
 * on the fourth press.
 *
 * Every fact is written for a young child: short, concrete, nothing scary or
 * violent (no hunting, no predators-and-prey framing), and nothing that needs
 * a definition of its own to understand.
 *
 * Missing an id here is not fatal - random() falls back to a generic line built
 * from the animal's own name and sound, the same tier-graceful-fallback spirit
 * as the emoji placeholder and the spoken-instead-of-recorded call.
 */

window.NAF = window.NAF || {};

NAF.Facts = (function () {
    'use strict';

    const FACTS = {
        // --- the barn ---------------------------------------------------------
        cow: [
            'A cow can sleep standing up or lying down.',
            'Cows often nuzzle noses with each other to say hello.',
            "A cow's stomach has four parts to help it digest grass.",
            'A cow does not have top front teeth, just a hard, smooth pad.',
            'A cow can drink a whole bathtub of water in a single day.',
            'A cow has a strong sense of smell and can smell things far away.',
            'A cow chews its cud, bringing food back up to chew again.',
            'A cow can hear sounds that are much lower and higher than we can.'
        ],
        pig: [
            'Pigs are very smart and love rolling in mud to stay cool.',
            "A pig's curly tail wiggles when it is happy.",
            'Pigs have an excellent sense of smell.',
            'A baby pig is called a piglet.',
            'Pigs are surprisingly good swimmers.',
            'A pig can sniff out food buried underground.',
            'Pigs are excellent diggers and use their snout like a shovel.',
            'A group of pigs is called a sounder.'
        ],
        goat: [
            'Goats are wonderful climbers and can balance on tiny ledges.',
            'A baby goat is called a kid.',
            'Goats have rectangle-shaped eyes that help them see all around.',
            'A group of goats is called a herd.',
            'Goats like to taste a little bit of many different plants.',
            'A baby goat can start jumping and playing just a day after it is born.',
            'Many goats have a tuft of hair like a small beard under their chin.',
            'A goat can rotate its ears to listen for sounds from different directions.'
        ],
        sheep: [
            "A sheep's wool keeps growing all year, like hair.",
            'Sheep can remember the faces of other sheep for years.',
            'A group of sheep is called a flock.',
            'A baby sheep is called a lamb.',
            "A sheep's fleece can be sheared off and spun into soft yarn.",
            'A sheep can see almost all the way around without turning its head.',
            'Sheep like to stay close together in their flock as they graze.',
            "A sheep's wool can be many colors, not just white."
        ],
        horse: [
            'Horses can sleep both lying down and standing up.',
            'A horse can run very fast across an open field.',
            'Horses can see almost all the way around themselves without turning their head.',
            'A baby horse is called a foal.',
            'A horse can twitch its skin to shoo away a buzzing fly.',
            'A horse has a single large hoof on each foot, like a built-in shoe.',
            'A horse can move its ears independently to listen in different directions.',
            'A horse can drink a lot of water very quickly.'
        ],
        duck: [
            "A duck's feathers are waterproof, so it stays dry.",
            'Baby ducks can swim just hours after they hatch.',
            'Ducks have a special extra eyelid to protect their eyes underwater.',
            'A duck has webbed feet that work like little paddles.',
            'A group of ducks swimming together is called a raft.',
            'A duck can sleep with one eye open to stay alert.',
            "A duck's bill is very sensitive and helps it feel food underwater.",
            'Male and female ducks often look very different from each other.'
        ],
        rooster: [
            'A rooster is known for crowing at sunrise, but it can crow any time of day.',
            'Roosters have bright, colorful feathers.',
            'A rooster can crow from almost anywhere, even up high.',
            'A rooster is a male chicken.',
            'A rooster has a soft, red comb on top of its head.',
            'A rooster has spurs on the back of its legs.',
            'A rooster can see in color and notices bright colors easily.',
            'A rooster often struts around to show off to other chickens.'
        ],
        dog: [
            "A dog's nose print is special, just like a fingerprint.",
            'Dogs wag their tails when they feel happy or excited.',
            'Some dogs can learn hundreds of different words.',
            'A dog can hear much fainter sounds than we can.',
            'A dog pants to help itself cool down.',
            'A dog can smell far, far better than a person can.',
            'Dogs sweat mostly through their paw pads.',
            'A dog dreams while it sleeps, sometimes twitching its paws.'
        ],
        cat: [
            'A cat uses its whiskers to feel the world around it.',
            'Cats spend a big part of their day napping and stretching.',
            'A cat purrs when it feels calm and cozy.',
            'A cat can jump about five times as high as it is tall.',
            'A cat grooms itself carefully with its rough little tongue.',
            'A cat has a flexible spine that helps it twist and land on its feet.',
            "A cat's rough tongue has tiny hook-like bumps for grooming.",
            'A cat can make many different sounds to communicate.'
        ],
        owl: [
            'An owl can turn its head almost all the way around.',
            'An owl can fly so quietly that it barely makes a sound in the night sky.',
            'Owls have huge eyes to help them see well at night.',
            'An owl cannot move its eyes, so it turns its whole head to look around.',
            'A baby owl is called an owlet.',
            'Some owls can hear extremely well and use their ears to help locate sounds.',
            'An owl has soft, fluffy feathers that help keep it warm.',
            'A group of owls is called a parliament.'
        ],
        turkey: [
            'A turkey can spread its tail feathers into a big fan.',
            'Turkeys can run quite fast when they want to.',
            "A turkey's head can change color when it gets excited.",
            'A turkey has a long, floppy flap of skin above its beak.',
            'A turkey can see in color, just like we do.',
            'A turkey has good eyesight and a wide field of view.',
            'A group of turkeys is called a rafter.',
            'Wild turkeys can fly short distances, even though they are large birds.'
        ],
        bull: [
            'A bull is a strong, full-grown male in the cattle family.',
            'Bulls have thick necks and broad shoulders.',
            'A bull can weigh as much as a small car.',
            'Some bulls have a strong, muscly hump across their shoulders.',
            'Many bulls have horns that keep growing throughout their life.',
            'A bull has very strong shoulder and neck muscles.',
            'A bull can live for many years on a farm.',
            'A bull often lives in a herd with other cattle.'
        ],
        llama: [
            'Llamas hum to each other to say hello.',
            'A llama has a long, fluffy neck and soft wool.',
            'Llamas are very good at carrying things up steep hills.',
            'A llama has soft, padded feet that grip well on rocky ground.',
            'A baby llama is called a cria.',
            'A llama has three stomach chambers to help digest tough plants.',
            "A llama's ears are shaped like a banana and can point in different directions.",
            'A llama can spit as a way to communicate with other llamas.'
        ],
        rabbit: [
            'A rabbit can jump many times its own height.',
            'Rabbits have long ears that help them hear from far away.',
            'A rabbit thumps its foot to let other rabbits know something is happening.',
            "A rabbit's teeth never stop growing, so it nibbles to keep them short.",
            'A group of rabbits living together is called a colony.',
            "A rabbit's long ears also help it stay cool in warm weather.",
            'A rabbit has a strong set of back legs built for quick, powerful hops.',
            'A rabbit is most active during dawn and dusk.'
        ],
        mouse: [
            'A mouse can squeeze through gaps as small as a coin.',
            'Mice use their long whiskers to feel their way in the dark.',
            "A mouse's tail helps it balance when it runs.",
            'A mouse can hear high-pitched sounds that we cannot hear at all.',
            'A mouse is a surprisingly good climber and can scurry up walls.',
            'A mouse can survive in many different places, from fields to houses.',
            'A mouse has poor eyesight but relies on its whiskers and sense of smell.',
            'A mouse builds a small nest out of soft materials it finds.'
        ],
        bee: [
            'A bee visits many flowers to collect sweet nectar.',
            'Bees dance to tell other bees where to find flowers.',
            'A bee visits thousands of flowers to make just a little honey.',
            'A bee has tiny hairs all over its body that pick up pollen.',
            'A beehive can be home to tens of thousands of bees.',
            'A bee has two pairs of wings that beat very fast.',
            'A worker bee stays very busy helping take care of the hive.',
            'A queen bee is the only bee in the hive that lays eggs.'
        ],
        frog: [
            'A frog can breathe a little through its skin.',
            'Frogs use their long, sticky tongue to catch their food fast.',
            'A baby frog is called a tadpole and starts life in the water.',
            'A frog can pull its eyes down into its head when it blinks.',
            "A frog's skin needs to stay moist to stay healthy.",
            'A frog can jump many times the length of its own body.',
            'Frogs come in many bright colors and patterns.',
            'A frog absorbs water through its skin instead of drinking it with its mouth.'
        ],
        butterfly: [
            'A butterfly tastes with its feet.',
            'Butterflies start life as a caterpillar before they grow wings.',
            "A butterfly's wings are covered in tiny, colorful scales.",
            'A butterfly drinks through a long, curly tongue, like a tiny straw.',
            'A butterfly needs its body to be warm before it can fly.',
            'A butterfly has four wings, not just two.',
            'Butterflies use their antennae to smell the air around them.',
            'A butterfly can see many more colors than people can.'
        ],
        hedgehog: [
            'A hedgehog curls into a tiny, spiky ball to stay safe.',
            'Hedgehogs have thousands of sharp spines on their back.',
            'A hedgehog mostly comes out at night to look for food.',
            'A hedgehog can run faster than it looks, especially when it is excited.',
            'A hedgehog can swim and paddle across water if it needs to.',
            'A hedgehog has a great sense of smell and hearing.',
            'A hedgehog sees best in dim light rather than bright sunshine.',
            'A hedgehog often snuffles along the ground while it explores.'
        ],
        squirrel: [
            'A squirrel buries nuts and often remembers where, months later.',
            'Squirrels use their bushy tail like a cozy blanket.',
            'A squirrel can leap from tree to tree with amazing balance.',
            "A squirrel's back feet can turn around, so it can climb down a tree headfirst.",
            'A baby squirrel is called a kit.',
            'A squirrel has sharp claws that help it grip onto tree bark.',
            "A squirrel's eyes are positioned to give it a wide view of its surroundings.",
            'A squirrel can find food again by using its excellent sense of smell.'
        ],

        // --- the aquarium -------------------------------------------------------
        fish: [
            'Most fish breathe underwater using their gills.',
            "A fish's scales protect its skin like tiny shields.",
            'Fish can feel tiny changes in the water all around their body.',
            'A fish sleeps with its eyes open because it has no eyelids.',
            "Some fish can even learn to recognize a person's face.",
            "A fish's fins come in different shapes to help it move in different ways.",
            'Fish can come in many different sizes, from tiny to huge.',
            'A fish has a swim bladder that helps it float at different depths.'
        ],
        tropicalfish: [
            'Tropical fish come in some of the brightest colors in the sea.',
            'A tropical fish lives around warm, sunny coral reefs.',
            'Some tropical fish change color depending on their mood.',
            'Tropical fish often swim together in a large group called a school.',
            "A tropical fish's bright colors help it recognize others of its own kind.",
            'A tropical fish often has patterns that help it blend in or stand out on the reef.',
            'Baby tropical fish can look very different from how they will look as adults.',
            'Tropical fish rely on the reef for shelter and food.'
        ],
        blowfish: [
            'A blowfish can puff up into a round ball to stay safe.',
            'Blowfish gulp water quickly to make themselves much bigger.',
            "A blowfish's round balloon shape makes it look much bigger than usual.",
            'A blowfish is also called a pufferfish.',
            'A blowfish usually swims slowly, gently moving its small fins.',
            'A blowfish has a beak-like mouth used for crunching its food.',
            'A blowfish can live in salty or fresh water, depending on the kind.',
            "A blowfish's skin is covered in tiny spines that show when it puffs up."
        ],
        shark: [
            'A shark can smell things in the water from very far away.',
            'Sharks have been swimming in the ocean for hundreds of millions of years.',
            "A shark's skin feels rough, almost like sandpaper.",
            'Many sharks need to keep swimming so water flows over their gills.',
            'A shark grows new teeth to replace any that fall out.',
            "A shark's skeleton is made of cartilage instead of bone.",
            'There are hundreds of different kinds of sharks, from tiny to huge.',
            'A shark has special senses that let it detect tiny electrical signals in the water.'
        ],
        octopus: [
            'An octopus has eight arms and three hearts.',
            'An octopus can squeeze through gaps barely bigger than its eye.',
            'An octopus can change color to match the rocks around it.',
            'An octopus has blue blood instead of red blood.',
            'An octopus can taste things using the suckers on its arms.',
            'An octopus can solve simple puzzles, like figuring out how to open a jar.',
            'An octopus lives alone most of the time, without a group like some other sea animals.',
            'An octopus has excellent eyesight, even though it cannot see color the way we do.'
        ],
        squid: [
            'A squid can shoot backward through the water very quickly.',
            'Squids have big eyes to help them see in the deep, dark sea.',
            'A squid can squirt dark ink to hide from other animals.',
            'A squid has three hearts, just like its cousin the octopus.',
            "A squid's fins help it steer as it glides through the water.",
            'A squid has a hard beak hidden among its arms.',
            'A squid is closely related to the octopus and the cuttlefish.',
            'A squid can be very small or grow to be enormous, depending on the kind.'
        ],
        crab: [
            'A crab walks sideways using its ten legs.',
            'Crabs grow a new, bigger shell as they get older.',
            'A crab uses its claws to eat and to wave hello.',
            "A crab's eyes sit on top of tiny stalks, so it can look all around.",
            'Some crabs can live on land as well as in the water.',
            'A crab has a hard outer shell called an exoskeleton.',
            'Some crabs have one claw that is bigger than the other.',
            "A crab's shell protects the soft body underneath."
        ],
        lobster: [
            'A lobster can grow a new claw if it loses one.',
            'Lobsters taste with tiny hairs on their legs.',
            "A lobster gets a whole new shell as it grows bigger.",
            'A lobster can live for many years, even decades.',
            'A lobster uses its long antennae to feel and explore the world around it.',
            "A lobster's shell is usually greenish-brown, though some are blue or even orange.",
            'A lobster often has one claw for crushing and one claw for cutting.',
            'A lobster can regrow a leg, not just a claw, if it loses one.'
        ],
        shrimp: [
            'A shrimp can swim backward by flicking its tail.',
            'Shrimp help keep the sea tidy by cleaning up bits of food.',
            'Some shrimp glow with tiny sparkles of light.',
            'A shrimp often has a see-through body that can be hard to spot in the water.',
            "A shrimp's heart is located near its head.",
            'A shrimp has legs on both sides of its body used for both swimming and walking.',
            'Shrimp can be very tiny or fairly large, depending on the kind.',
            'Shrimp often live in large groups near the sea floor or coral.'
        ],
        dolphin: [
            'A dolphin uses clicks and whistles to talk with other dolphins.',
            'Dolphins are very smart and love to play and jump.',
            'A dolphin swims up to breathe air, just like we breathe.',
            'A dolphin can rest half of its brain at a time while the other half stays awake.',
            'A group of dolphins swimming together is called a pod.',
            'A dolphin has a curved fin on its back called a dorsal fin.',
            'A dolphin uses echolocation, sending out clicks that bounce back to help it sense what is around it.',
            'A dolphin calf stays close to its mother during the first part of its life.'
        ],
        // Keyed 'whale' because that is still the animal's id - see zones.js.
        // The animal is an Orca, so these say orca, which is also what
        // riddle() below needs in order to scrub the name back out for Listen
        // and Find.
        //
        // Note what is NOT here: an orca is a member of the dolphin family and
        // is itself a kind of whale, and both of those are genuinely
        // interesting - but a Dolphin and a Big Whale share this tank, and a
        // riddle reading "this animal is the largest of the dolphin family"
        // with a dolphin card on screen points straight at the wrong answer.
        whale: [
            'An orca has a tall fin on its back called a dorsal fin.',
            'An orca is black and white, with a white patch behind each eye.',
            'Orcas live and travel together in a group called a pod.',
            'An orca breathes air through a blowhole on top of its head.',
            'An orca uses clicks and whistles to talk with its pod.',
            'An orca is a powerful hunter that catches its food in the ocean.',
            'An orca has a thick layer of blubber that keeps it warm in cold water.',
            'An orca can swim very fast and leap right out of the water.'
        ],
        bigwhale: [
            "A big whale's heart can be as large as a small car.",
            'Big whales can hold their breath longer than almost any other animal.',
            "A big whale's tail is called a fluke.",
            "A big whale's tongue can weigh as much as an elephant.",
            'A big whale can grow longer than a city bus.',
            'A big whale can make some of the loudest sounds of any animal.',
            "A big whale's flippers help it steer while it swims.",
            'A big whale calf can already swim well soon after it is born.'
        ],
        seal: [
            'A seal claps its flippers together to make a splashy sound underwater.',
            'A seal can hold its breath underwater for many minutes at a time.',
            'A seal uses its whiskers to feel tiny movements in the water, even in the dark.',
            'A seal can twist and turn easily in water, even though it waddles on land.',
            'A baby seal is called a pup.',
            'A seal moves by wriggling its body across the sand on land.',
            'A seal can see well both in air and underwater.',
            "A seal's smooth, sleek body helps it slip easily through the water."
        ],
        penguin: [
            'A penguin cannot fly, but it is a wonderful swimmer.',
            'Penguins huddle close together to stay warm and cozy.',
            'A penguin waddles on land but zooms fast underwater.',
            'A penguin has a thick layer of fat and feathers to keep it warm.',
            'A group of penguins walking on land together is called a waddle.',
            'A penguin has stiff, flipper-like wings made for swimming, not flying.',
            "A penguin's black and white coloring helps it blend in while swimming.",
            'A penguin parent takes turns keeping its egg warm.'
        ],
        turtle: [
            'A turtle carries its shell with it everywhere it goes.',
            'Turtles can live for a very, very long time.',
            'A turtle pulls its head inside its shell to feel safe.',
            "A turtle's shell is part of its skeleton, connected to its backbone.",
            'Some turtles can rest underwater for hours without needing to come up for air.',
            'A turtle has no teeth, just a hard, beak-like mouth.',
            'A sea turtle can swim great distances across the ocean.',
            'Different kinds of turtles live in the ocean, in ponds, or on land.'
        ],
        otter: [
            'An otter holds hands with other otters so they do not drift apart while sleeping.',
            'Otters use rocks as tools to open their favorite snacks.',
            'An otter has thick fur to keep it warm and dry.',
            'An otter has some of the thickest fur of any animal, with millions of tiny hairs.',
            'An otter often floats on its back to rest or relax.',
            'An otter can close its ears and nose while swimming underwater.',
            'Some otters keep a favorite rock tucked in a pouch of skin under their arm.',
            "An otter's fur needs constant grooming to stay fluffy and waterproof."
        ],
        jellyfish: [
            'A jellyfish has no bones, brain, or heart at all.',
            'Jellyfish gently pulse their bodies to float through the water.',
            'A jellyfish can glow softly in the dark ocean.',
            'A jellyfish is made up mostly of water.',
            'Jellyfish were swimming in the ocean even before the dinosaurs.',
            'A jellyfish moves along with slow, rhythmic pulses of its body.',
            "There are thousands of different kinds of jellyfish in the world's oceans.",
            'A jellyfish has tentacles that trail below its rounded body.'
        ],
        starfish: [
            'A starfish can grow back an arm if it loses one.',
            'Starfish move slowly using hundreds of tiny tube feet.',
            'A starfish has no brain, but it still finds its way around.',
            'A starfish pumps seawater through its body instead of blood.',
            'Most starfish have five arms, but some kinds have even more.',
            'A starfish has eyespots at the tip of each arm that sense light.',
            "A starfish's skin is covered in tiny bumps or spines.",
            'A starfish can be found in many colors, like orange, red, purple, and blue.'
        ],
        oyster: [
            'An oyster can make a shiny, round pearl inside its shell.',
            'Oysters spend their whole life in one cozy spot.',
            "An oyster's shell has two halves that open and close.",
            'An oyster can filter and clean a large amount of water every day.',
            'A young oyster floats freely in the water before it settles down in one spot.',
            'An oyster clusters together with other oysters to form large reefs.',
            'An oyster makes a pearl when a tiny bit of sand or grit gets trapped inside its shell.',
            "An oyster's rough shell provides a home for other small sea creatures."
        ],
        seasnail: [
            'A sea snail carries its swirly shell on its back.',
            'Sea snails move very slowly along rocks and sand.',
            'A sea snail leaves a shiny trail behind as it glides along.',
            'A sea snail uses one strong, muscular foot to creep along.',
            "A sea snail's shell grows bigger as its whole body grows.",
            'A sea snail breathes using gills tucked inside its shell.',
            'A sea snail has simple eyes on its head that can sense light.',
            'A sea snail can pull its whole soft body inside its shell for protection.'
        ],

        // --- the safari -----------------------------------------------------
        lion: [
            "A lion's roar can be heard from very far away.",
            'Lions live together in a group called a pride.',
            'A lion loves to nap for most of the day.',
            'A male lion often has a thick, fluffy mane around its face.',
            'A baby lion is called a cub.',
            "A male lion's mane can be many different colors, from blond to black.",
            'A lion can run fast in short bursts, but tires quickly.',
            'A lion spends time resting and grooming with other lions in its pride.'
        ],
        elephant: [
            'An elephant uses its trunk like a long, helpful hand.',
            'Elephants have amazing memories and remember other elephants for years.',
            'An elephant flaps its big ears to help cool down.',
            'An elephant is the largest animal that walks on land.',
            'An elephant can use its trunk to give itself a cool, splashy shower.',
            "An elephant's tusks are really long teeth that keep growing.",
            'An elephant can use its trunk to pick up both tiny and heavy objects.',
            'An elephant talks to other elephants using low rumbling sounds we can barely hear.'
        ],
        giraffe: [
            'A giraffe has the same number of neck bones as we do, just much bigger.',
            'A giraffe has a long, dark tongue that helps it grab leaves from tall trees.',
            'A giraffe can nap standing up, for just a few minutes at a time.',
            "A giraffe's spotted pattern is unique, just like a fingerprint.",
            'A baby giraffe can stand up and walk within its very first hour of life.',
            'A giraffe has a large, strong heart that pumps blood all the way up its long neck.',
            'A giraffe can eat leaves from tall trees that other animals cannot reach.',
            'A baby giraffe is called a calf.'
        ],
        zebra: [
            'Every zebra has its own special pattern of stripes.',
            'Zebras live together in a group to help keep each other safe.',
            'A zebra can run very fast across the grass.',
            'Zebra stripes may help keep biting bugs like flies away.',
            "A zebra's mane stands straight up instead of flopping to one side.",
            "A zebra's stripes are actually black skin with white markings, not the other way around.",
            'Zebras communicate using sounds, facial expressions, and body language.',
            'A baby zebra is called a foal, just like a baby horse.'
        ],
        hippo: [
            'A hippo spends most of the day cooling off in the water.',
            'Hippos can hold their breath underwater for several minutes.',
            "A hippo's skin makes its own natural sunscreen.",
            'A hippo can walk along the bottom of a river or lake.',
            "A hippo's eyes, ears, and nose all sit near the top of its head.",
            'A hippo is one of the largest land animals in the world.',
            'A hippo can close its nostrils and ears tightly while underwater.',
            "A hippo's mouth can open very, very wide."
        ],
        rhino: [
            "A rhino's horn is made of the same stuff as our fingernails.",
            'Rhinos have thick, tough skin, almost like armor.',
            'A rhino can run surprisingly fast for such a big animal.',
            'Some kinds of rhinos have one horn, while others have two.',
            'A rhino does not see very well, but it has an excellent sense of smell.',
            'A rhino mostly eats plants and grass.',
            'A baby rhino is called a calf, just like a baby elephant or hippo.',
            'A rhino likes to wallow in mud to cool off and protect its skin.'
        ],
        monkey: [
            'A monkey uses its tail to help balance while climbing.',
            'Monkeys are playful and love leaping and swinging through the trees.',
            'A monkey talks to other monkeys using different sounds and faces.',
            "A monkey's hands and feet are great for gripping onto branches.",
            'Monkeys often groom each other to stay clean and to show friendship.',
            'There are many different kinds of monkeys living in different parts of the world.',
            'Some monkeys have long tails, while others have very short tails.',
            'A monkey uses its nimble fingers to pick up small things, like fruit or seeds.'
        ],
        gorilla: [
            'A gorilla often cares for its family group, called a troop.',
            'Gorillas can learn to understand many hand signs.',
            'A gorilla beats its chest to say something to other gorillas.',
            'A gorilla mostly eats plants and can spend much of the day eating.',
            'A gorilla can walk on its knuckles, using its strong arms for support.',
            'A gorilla is the largest of all the primates.',
            "A young gorilla often rides on its mother's back as she moves around.",
            'A gorilla builds a fresh nest of leaves and branches to sleep in every night.'
        ],
        tiger: [
            'Every tiger has its own unique pattern of stripes.',
            'Tigers are excellent swimmers and love to cool off in water.',
            "A tiger's roar can be heard from almost two miles away.",
            "A tiger's stripes go all the way down to its skin, not just its fur.",
            'A tiger is the biggest of all the big cats.',
            'A tiger has a striped pattern that is unique among the big cats.',
            'A tiger mostly lives and travels alone, unlike lions which live in groups.',
            'A baby tiger is called a cub, just like a baby lion.'
        ],
        leopard: [
            'A leopard is a fantastic climber and often naps up in trees.',
            'A leopard has spots that help it blend into sunny, dappled forests.',
            'A leopard can leap an incredibly long way in a single jump.',
            'A leopard is strong enough to carry heavy things high up into a tree.',
            'A leopard is mostly active at night and rests during the day.',
            'A leopard has a long tail that helps it balance while climbing.',
            'Every leopard has its own special pattern of spots.',
            'A leopard is a strong swimmer, even though it prefers dry land.'
        ],
        camel: [
            "A camel's hump stores fat, not water, to help it travel far.",
            'Camels have long eyelashes to keep sand out of their eyes.',
            'A camel can go a long time without drinking water.',
            'A camel can close its nostrils to keep out blowing sand.',
            'There are two kinds of camels, one with a single hump and one with two.',
            'A camel has wide, padded feet that keep it from sinking into sand.',
            'A camel can carry heavy loads across long distances.',
            'A baby camel is called a calf.'
        ],
        kangaroo: [
            'A kangaroo carries its baby, called a joey, in a cozy pouch.',
            'Kangaroos use their strong tail to help them balance while hopping.',
            'A kangaroo can hop very fast across the grass.',
            'A kangaroo cannot walk backward.',
            'A group of kangaroos is called a mob.',
            'A kangaroo has powerful back legs built for big, bouncing hops.',
            'A kangaroo can use its tail like an extra leg to help it stand still.',
            "A young kangaroo, called a joey, stays inside its mother's pouch for months as it grows."
        ],
        crocodile: [
            'A crocodile can hold its breath underwater for a long time.',
            'Crocodiles have been around since long before the dinosaurs disappeared.',
            "A crocodile's eyes and nose peek above the water while it floats.",
            'A crocodile has a strong tail that helps it swim and steer through the water.',
            "A crocodile's skin has hard, bumpy scales that protect its body.",
            'A crocodile has one of the strongest bites of any animal.',
            'A crocodile can float very still in the water for a long time.',
            'A crocodile suns itself on the riverbank to warm up, since it is cold-blooded.'
        ],
        flamingo: [
            'A flamingo often stands on just one leg to rest.',
            'A flamingo gets its pink color from the food that it eats.',
            'A flamingo is surprisingly good at balancing gracefully.',
            "A flamingo's curved beak helps it scoop up food from shallow water.",
            'Flamingos often gather together in large, colorful groups.',
            "What looks like a flamingo's backward knee is really its ankle.",
            'A flamingo can fly long distances, often at night.',
            'A baby flamingo is born with gray or white feathers and turns pink as it grows.'
        ],
        peacock: [
            'A peacock spreads its colorful tail feathers into a giant fan.',
            'Peacock feathers shimmer with blues and greens in the sunlight.',
            "A peacock's fancy feathers help it stand out and show off.",
            'Only the male peacock grows the long, colorful tail feathers.',
            "A peacock's tail feathers are covered in round, eye-like spots.",
            "A peacock's tail feathers can be as long as its whole body.",
            'A female peacock is called a peahen.',
            'Peacocks can fly, though they mostly stay close to the ground.'
        ],
        parrot: [
            'A parrot can learn to copy words that it hears.',
            'Parrots have very bright, colorful feathers.',
            'A parrot uses its strong beak to crack open seeds and nuts.',
            'A parrot often uses its strong feet to help hold its food.',
            'Some parrots can live for fifty years or even longer.',
            'A parrot has a curved, strong beak that helps it climb as well as eat.',
            'Parrots have two toes pointing forward and two pointing backward on each foot.',
            'Many parrots live in warm, tropical parts of the world.'
        ],
        snake: [
            'A snake smells the air around it by flicking out its tongue.',
            'A snake grows a brand new skin and slides right out of the old one.',
            'A snake moves along the ground in a smooth, wiggly line.',
            'A snake can feel vibrations in the ground through its belly.',
            "A snake's body is covered in dry, smooth scales.",
            'A snake does not have eyelids, so its eyes are always open, even while it sleeps.',
            "A snake's forked tongue helps it smell in two directions at once.",
            'There are thousands of different kinds of snakes around the world.'
        ],
        lizard: [
            'Some lizards can grow back their tail if they lose it.',
            'A lizard often suns itself on a warm rock to warm up.',
            'A lizard can be very quick, darting across the ground in a flash.',
            'A lizard moves between sun and shade to stay just the right temperature.',
            'Most lizards have scaly skin and four short legs.',
            'Many lizards are excellent climbers, even on smooth surfaces.',
            'A lizard breathes air through its nose, just like we do.',
            'Some lizards can change the color of their skin to match their mood or surroundings.'
        ],
        eagle: [
            'An eagle can spot movement from incredibly far up in the sky.',
            'Eagles build enormous nests high up in the tallest trees.',
            'An eagle can soar high, gliding on the wind without flapping much at all.',
            "An eagle's eyesight is many times sharper than ours.",
            'A baby eagle is called an eaglet.',
            'An eagle has strong, curved talons on its feet.',
            'Eagles often reuse and enlarge the same nest year after year.',
            'An eagle has excellent color vision, much better than ours.'
        ],
        sloth: [
            'A sloth moves very, very slowly through the trees.',
            'Sloths sleep for a large part of the day, cozy and curled up.',
            "A sloth's fur can even grow tiny green algae on it.",
            'A sloth comes down from its tree only once in a while.',
            'A sloth is a surprisingly good swimmer, even though it moves slowly on land.',
            'A sloth has long, curved claws that help it hang from branches.',
            "A sloth's fur grows in the opposite direction from most other mammals, so rain drips off while it hangs upside down.",
            'A sloth only needs to eat a small amount of food each day because it moves so slowly.'
        ]
    };

    /** So the same animal never repeats its last fact on the very next reveal. */
    const lastIndex = {};

    /**
     * One random fact about this animal, never the same index twice running.
     * Falls back to a generic line built from the animal's own name and sound
     * if it has no entry here yet - the tier system's usual grace, so a new
     * animal added to a roster is never silent, just less detailed at first.
     */
    function random(animal) {
        const list = (animal && FACTS[animal.id]) || null;
        if (!list || !list.length) {
            const name = animal ? animal.name.toLowerCase() : 'animal';
            const says = animal ? animal.says.toLowerCase() : '';
            return 'The ' + name + (says ? (' says ' + says + '.') : ' is one of a kind.');
        }
        if (list.length === 1) return list[0];

        let i = Math.floor(Math.random() * list.length);
        let guard = 0;
        while (i === lastIndex[animal.id] && guard++ < 6) {
            i = Math.floor(Math.random() * list.length);
        }
        lastIndex[animal.id] = i;
        return list[i];
    }

    /**
     * Escape a string for safe use inside a RegExp - the animal's own name may
     * contain characters (an apostrophe, say) that would otherwise be read as
     * regex syntax.
     */
    function escapeRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Plurals that do not follow the simple "name + s" pattern the regex
     * swaps below assume. "Mice" IS the word "mouse" - leaving it in a riddle
     * ("Mice use their long whiskers...") is exactly as much of a giveaway as
     * saying "mouse" outright, just spelled differently. Add to this if a
     * future fact uses another animal's own irregular plural.
     */
    const IRREGULAR_PLURALS = { mouse: 'mice' };

    /**
     * A random fact about this animal with its own name scrubbed out of it,
     * for Listen and Find: "which one of these animals does this?" only works
     * as a guessing game if the clue does not already say the answer.
     *
     * This is a heuristic swap, not a hand-written riddle for every fact: every
     * fact here is written as "A cow can...", "Cows are...", "A cow's..." or a
     * bare mid-sentence mention, so replacing the animal's own name (in its
     * singular, possessive and plain-plural forms) with a generic stand-in
     * covers the entries as written without keeping a second, separately
     * authored set of clues in sync with them by hand.
     */
    function riddle(animal) {
        const fact = random(animal);
        if (!animal || !animal.name) return fact;

        const esc = escapeRe(animal.name);
        let text = fact;
        // "A cow's" / "An octopus's" -> "This animal's"
        text = text.replace(new RegExp('\\b(a|an)\\s+' + esc + "'s\\b", 'i'), "this animal's");
        // a mid-sentence possessive that had no article before it
        text = text.replace(new RegExp('\\b' + esc + "'s\\b", 'gi'), "this animal's");
        // "A cow" / "An octopus" -> "This animal"
        text = text.replace(new RegExp('\\b(a|an)\\s+' + esc + '\\b', 'i'), 'this animal');
        // "Cows are..." -> "These animals are..."
        text = text.replace(new RegExp('\\b' + esc + 's\\b', 'gi'), 'these animals');
        // an irregular plural ("mice"), if this animal has one
        const irregular = IRREGULAR_PLURALS[animal.id];
        if (irregular) {
            text = text.replace(new RegExp('\\b' + escapeRe(irregular) + '\\b', 'gi'), 'these animals');
        }
        // anything left - a bare mid-sentence mention
        text = text.replace(new RegExp('\\b' + esc + '\\b', 'gi'), 'this animal');

        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    return {
        random: random,
        riddle: riddle
    };
})();
