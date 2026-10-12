// World themes: terrain rules, generator settings and pixel palettes.
// Add a world by adding an entry here; nothing else in the engine needs to
// know about it.

// Gameplay terrain. `cost` multiplies the troops an attack spends to take a
// tile; `defense` multiplies what a defender's garrison is worth there.
export const T = { DEEP: 0, SHALLOW: 1, PLAINS: 2, WILD: 3, HIGHLAND: 4, MOUNTAIN: 5, RIVER: 6, VOLCANO: 7, RUINS: 8 };

export const TERRAIN = [
  { id: 'deep', water: true, cost: Infinity, defense: 1 },
  { id: 'shallow', water: true, cost: Infinity, defense: 1 },
  { id: 'plains', cost: 1, defense: 1 },
  { id: 'wild', cost: 1.35, defense: 1.1 },
  { id: 'highland', cost: 1.7, defense: 1.25 },
  { id: 'mountain', cost: 3.2, defense: 1.6 },
  { id: 'river', cost: 2.2, defense: 1.2 },
  { id: 'volcano', cost: 3.5, defense: 1.5 },
  { id: 'ruins', cost: 1.25, defense: 1.15 },
];

export const isLand = t => !TERRAIN[t].water;

const P = list => list;

export const THEMES = {
  vulkara: {
    name: 'Ashen Cradle',
    names: { deep: 'Magma sea', shallow: 'Lava shallows', plains: 'Ash plains', wild: 'Basalt dunes', highland: 'Cinder highlands', mountain: 'Obsidian peaks', river: 'Lava river', volcano: 'Volcano', ruins: 'Cindari ruins' },
    gen: { land: 0.5, continents: 2, islands: 5, mountains: 0.6, rivers: 7, volcanoes: 5, wild: 0.35, ruins: 0.03, lakes: 2 },
    pal: {
      deep: P(['#2a0603', '#3c0904']), shallow: P(['#7a1606', '#a8300a', '#e8601a']), coast: '#ffb02e',
      plains: P(['#2a1d18', '#38261f', '#46302a']), wild: P(['#4d3223', '#5e3c28', '#6a4129']),
      highland: P(['#3a2a26', '#4a3630', '#5a443c']), mountain: P(['#120c0c', '#2a1e1b', '#4a3a34', '#8a6e60']),
      river: P(['#d8400f', '#ff8a1e']), volcano: P(['#1a0f0d', '#ff5a1a', '#ffd25e']), ruins: P(['#2a1d18', '#6b4d40']),
    },
  },
  cryonis: {
    name: 'Frozen Frontier',
    names: { deep: 'Frozen ocean', shallow: 'Ice shelf', plains: 'Snowfield', wild: 'Crystal fields', highland: 'Glacier', mountain: 'Ice ridge', river: 'Meltwater', volcano: 'Cryo-vent', ruins: 'Glacari spires' },
    gen: { land: 0.52, continents: 2, islands: 7, mountains: 0.5, rivers: 6, volcanoes: 1, wild: 0.22, ruins: 0.02, lakes: 9 },
    pal: {
      deep: P(['#06112a', '#0a1a3c']), shallow: P(['#123a66', '#1d5486', '#3a78a8']), coast: '#d6efff',
      plains: P(['#a9c3dc', '#bcd3e8', '#cfe1f2']), wild: P(['#8a72d0', '#a487e8', '#c4a8ff']),
      highland: P(['#7d9cbe', '#93b2d2', '#e6f2fb']), mountain: P(['#2a3a5a', '#4a6488', '#7c9cc4', '#ffffff']),
      river: P(['#5fc8ff', '#9fe8ff']), volcano: P(['#1a2440', '#7fd3ff', '#e6f6ff']), ruins: P(['#5a7699', '#d8f2ff']),
    },
  },
  mycelion: {
    name: 'Living World',
    names: { deep: 'Spore sea', shallow: 'Fungal marsh', plains: 'Moss plain', wild: 'Fungal forest', highland: 'Mycelium ridge', mountain: 'Giant fungi', river: 'Spore stream', volcano: 'Bloom crater', ruins: 'Hollow growths' },
    gen: { land: 0.58, continents: 3, islands: 6, mountains: 0.4, rivers: 9, volcanoes: 2, wild: 0.55, ruins: 0.02, lakes: 5 },
    pal: {
      deep: P(['#12051a', '#1c0828']), shallow: P(['#3a1250', '#55206e', '#7a3090']), coast: '#c4ff6a',
      plains: P(['#2c4a1e', '#365a24', '#40682a']), wild: P(['#3b1c49', '#4d2759', '#62306e']),
      highland: P(['#5a2a6a', '#6e3a7e', '#86508e']), mountain: P(['#1a0824', '#5a1a6a', '#a03aa8', '#ff6ad2']),
      river: P(['#9adf3a', '#c4ff6a']), volcano: P(['#2a0a35', '#ff6ad2', '#ffd6f4']), ruins: P(['#4d2759', '#c4ff6a']),
    },
  },
  xythera: {
    name: 'World of Ancient Machines',
    names: { deep: 'Void sea', shallow: 'Oil shallows', plains: 'Rust desert', wild: 'Metal plains', highland: 'Bronze mesa', mountain: 'Machine ridge', river: 'Energy channel', volcano: 'Reactor crater', ruins: 'Axiom ruins' },
    gen: { land: 0.55, continents: 2, islands: 6, mountains: 0.5, rivers: 5, volcanoes: 2, wild: 0.35, ruins: 0.08, lakes: 3 },
    pal: {
      deep: P(['#05050d', '#0a0a1c']), shallow: P(['#14143a', '#1e1e52', '#2a2a6a']), coast: '#3ad8ff',
      plains: P(['#6a3c1e', '#7a4824', '#8a5428']), wild: P(['#22222c', '#2c2c38', '#383846']),
      highland: P(['#8a5e2c', '#a8783a', '#c08a44']), mountain: P(['#21150c', '#5a3c1a', '#9b6d32', '#e3b45e']),
      river: P(['#2fc6ff', '#a8f4ff']), volcano: P(['#14141c', '#3ad8ff', '#e0fbff']), ruins: P(['#3a2818', '#e3b45e']),
    },
  },
  noctyra: {
    name: 'Eternal Eclipse',
    names: { deep: 'Crimson void', shallow: 'Blood shallows', plains: 'Dusk plains', wild: 'Violet wastes', highland: 'Shadow uplands', mountain: 'Obsidian spires', river: 'Crimson river', volcano: 'Rift', ruins: 'Umbral megastructure' },
    gen: { land: 0.6, continents: 3, islands: 5, mountains: 0.55, rivers: 8, volcanoes: 3, wild: 0.4, ruins: 0.06, lakes: 3 },
    pal: {
      deep: P(['#070106', '#10020a']), shallow: P(['#2a0412', '#45081c', '#6a0a24']), coast: '#ff3a4a',
      plains: P(['#1d1628', '#241b31', '#2b2039']), wild: P(['#33234a', '#3e2a58', '#4b3268']),
      highland: P(['#2a2238', '#362c48', '#443858']), mountain: P(['#050409', '#171223', '#36284d', '#7a5aa8']),
      river: P(['#b0102a', '#ff3a4a']), volcano: P(['#0a0208', '#ff2a3a', '#ffb0b8']), ruins: P(['#171223', '#b98bff']),
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);
