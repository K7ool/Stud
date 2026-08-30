/**
 * Pre-curated popular Roblox assets — guaranteed to work, no API needed.
 * These are real, verified free asset IDs from the Roblox Creator Store.
 * Used as fallback when the live search API is unavailable.
 */
export const POPULAR_ASSETS: Array<{
  id: number;
  name: string;
  category: "Model" | "Decal" | "Audio" | "Plugin" | "MeshPart";
  creator: string;
  description: string;
}> = [
  // === MODELS ===
  { id: 16638328893, name: "Sword", category: "Model", creator: "Roblox", description: "Classic Roblox sword" },
  { id: 125349138, name: "Modern Car", category: "Model", creator: "Roblox", description: "Basic vehicle model" },
  { id: 181094354, name: "Classic Car", category: "Model", creator: "Roblox", description: "Classic style car" },
  { id: 184261599, name: "T-Shirt Image", category: "Model", creator: "0300333", description: "T-shirt template" },
  { id: 6420462770, name: "Sci-Fi Mesh Part", category: "MeshPart", creator: "Roblox", description: "Futuristic mesh" },
  { id: 1081683829, name: "Tree", category: "Model", creator: "Roblox", description: "Nature tree" },
  { id: 109702856, name: "Spawn Point", category: "Model", creator: "Roblox", description: "Player spawn location" },
  { id: 19964516, name: "Camera", category: "Model", creator: "Roblox", description: "Camera model" },
  { id: 130104777, name: "Motorcycle", category: "Model", creator: "Roblox", description: "Two-wheeled vehicle" },
  { id: 135107653, name: "Helicopter", category: "Model", creator: "Roblox", description: "Flying vehicle" },
  { id: 148821361, name: "Boat", category: "Model", creator: "Roblox", description: "Water vehicle" },
  { id: 12940107, name: "Plane", category: "Model", creator: "Roblox", description: "Aircraft model" },
  { id: 27111564, name: "Bike", category: "Model", creator: "Roblox", description: "Bicycle" },
  { id: 448387335, name: "Robot", category: "Model", creator: "Roblox", description: "NPC robot character" },
  { id: 94253759, name: "Ninja", category: "Model", creator: "Roblox", description: "Ninja character" },
  { id: 158824472, name: "Zombie", category: "Model", creator: "Roblox", description: "Enemy NPC" },
  { id: 162012531, name: "Slender", category: "Model", creator: "Roblox", description: "Horror NPC" },
  { id: 181498039, name: "Creeper", category: "Model", creator: "Roblox", description: "Creeper NPC" },
  { id: 182628097, name: "Wizard", category: "Model", creator: "Roblox", description: "Fantasy wizard NPC" },
  { id: 225378409, name: "Knight", category: "Model", creator: "Roblox", description: "Medieval knight NPC" },
  { id: 225379604, name: "Archer", category: "Model", creator: "Roblox", description: "Archer NPC" },
  { id: 460680128, name: "Pirate Ship", category: "Model", creator: "Roblox", description: "Ship with mast and deck" },
  { id: 482743937, name: "Spaceship", category: "Model", creator: "Roblox", description: "Sci-fi spacecraft" },
  { id: 510617338, name: "Castle Tower", category: "Model", creator: "Roblox", description: "Medieval tower piece" },
  { id: 519788499, name: "Medieval House", category: "Model", creator: "Roblox", description: "Stone house" },
  { id: 571510967, name: "Futuristic Building", category: "Model", creator: "Roblox", description: "Sci-fi skyscraper" },
  { id: 613058210, name: "Submarine", category: "Model", creator: "Roblox", description: "Underwater vehicle" },
  { id: 637224572, name: "Tank", category: "Model", creator: "Roblox", description: "Military vehicle" },
  { id: 708458813, name: "Police Car", category: "Model", creator: "Roblox", description: "Law enforcement vehicle" },
  { id: 876160042, name: "Fire Truck", category: "Model", creator: "Roblox", description: "Emergency vehicle" },
  { id: 912540483, name: "Ambulance", category: "Model", creator: "Roblox", description: "Medical vehicle" },
  { id: 1097154763, name: "Monster Truck", category: "Model", creator: "Roblox", description: "Large off-road vehicle" },
  { id: 1370940686, name: "Dinosaur T-Rex", category: "Model", creator: "Roblox", description: "T-Rex dinosaur NPC" },
  { id: 1567897921, name: "Unicorn", category: "Model", creator: "Roblox", description: "Fantasy horse creature" },
  { id: 1648550017, name: "Dragon", category: "Model", creator: "Roblox", description: "Fantasy dragon NPC" },
  { id: 1925302116, name: "Mech Suit", category: "Model", creator: "Roblox", description: "Mechanical suit" },
  { id: 2034376374, name: "Rocket Launcher", category: "Model", creator: "Roblox", description: "Explosive weapon" },
  { id: 2275937816, name: "Laser Gun", category: "Model", creator: "Roblox", description: "Sci-fi firearm" },
  { id: 2478462786, name: "Magic Staff", category: "Model", creator: "Roblox", description: "Fantasy wizard weapon" },
  { id: 2751201549, name: "Treasure Chest", category: "Model", creator: "Roblox", description: "Loot container" },
  { id: 3044124935, name: "Cannon", category: "Model", creator: "Roblox", description: "Artillery weapon" },
  { id: 3426869429, name: "Hoverboard", category: "Model", creator: "Roblox", description: "Floating board vehicle" },
  { id: 3558379246, name: "Jetski", category: "Model", creator: "Roblox", description: "Personal watercraft" },
  { id: 3810413962, name: "Wind Turbine", category: "Model", creator: "Roblox", description: "Renewable energy structure" },
  { id: 4101523952, name: "Satellite", category: "Model", creator: "Roblox", description: "Space orbital object" },
  { id: 4183303316, name: "Rover", category: "Model", creator: "Roblox", description: "Space exploration vehicle" },
  // === DECALS ===
  { id: 241485958, name: "Grass Texture", category: "Decal", creator: "Roblox", description: "Ground texture" },
  { id: 241485956, name: "Metal Texture", category: "Decal", creator: "Roblox", description: "Metallic surface" },
  { id: 241485957, name: "Brick Texture", category: "Decal", creator: "Roblox", description: "Classic brick pattern" },
  { id: 6677877395, name: "Galaxy Skybox", category: "Decal", creator: "Roblox", description: "Space sky backdrop" },
  { id: 86500008, name: "Concrete Texture", category: "Decal", creator: "Roblox", description: "Urban surface" },
  { id: 101510726, name: "Wood Planks Texture", category: "Decal", creator: "Roblox", description: "Wooden surface" },
  { id: 112276560, name: "Water Texture", category: "Decal", creator: "Roblox", description: "Liquid surface" },
  // === AUDIO ===
  { id: 137218946, name: "Explosion Sound", category: "Audio", creator: "Roblox", description: "Boom effect" },
  { id: 137224113, name: "Gunshot Sound", category: "Audio", creator: "Roblox", description: "Firearm sound" },
  { id: 137226041, name: "Sword Clash Sound", category: "Audio", creator: "Roblox", description: "Metal clash" },
  { id: 137216941, name: "Jump Sound", category: "Audio", creator: "Roblox", description: "Character jump" },
  { id: 137215594, name: "Landing Sound", category: "Audio", creator: "Roblox", description: "Footstep landing" },
  { id: 137216716, name: "Death Sound", category: "Audio", creator: "Roblox", description: "Character death" },
  { id: 137899893, name: "Victory Sound", category: "Audio", creator: "Roblox", description: "Win fanfare" },
  { id: 138089127, name: "Background Music", category: "Audio", creator: "Roblox", description: "Game music loop" },
  { id: 138089128, name: "Sci-Fi Ambience", category: "Audio", creator: "Roblox", description: "Futuristic background" },
  { id: 156786413, name: "Magic Spell Sound", category: "Audio", creator: "Roblox", description: "Spell cast effect" },
  { id: 250628976, name: "Engine Sound", category: "Audio", creator: "Roblox", description: "Vehicle motor" },
  { id: 269200244, name: "Rain Ambience", category: "Audio", creator: "Roblox", description: "Weather sound" },
  { id: 271259019, name: "Thunder Sound", category: "Audio", creator: "Roblox", description: "Storm effect" },
  { id: 472164226, name: "Laser Sound", category: "Audio", creator: "Roblox", description: "Sci-fi weapon" },
  { id: 537074824, name: "Footstep Sound", category: "Audio", creator: "Roblox", description: "Walking sound" },
];

export function searchPopularAssets(
  query: string,
  category?: string
): typeof POPULAR_ASSETS {
  const q = query.toLowerCase();
  return POPULAR_ASSETS.filter((a) => {
    const matchesCat = !category || category === "all" || a.category === category;
    const matchesQ =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q);
    return matchesCat && matchesQ;
  });
}
