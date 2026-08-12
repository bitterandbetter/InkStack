export interface PetRegistryEntry {
  id: string;
  manifest: string;
}

export interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
  kind?: string;
}

export interface InkstackPet extends PetManifest {
  manifestPath: string;
  spritesheetUrl: string;
}

export const BUILT_IN_PETS: InkstackPet[] = [
  {
    id: 'zzh',
    displayName: 'zzh',
    description: 'A clever, curious, slightly smug chibi pixel Codex companion based on the uploaded portrait.',
    spritesheetPath: 'spritesheet.webp',
    manifestPath: '/pets/zzh/pet.json',
    spritesheetUrl: '/pets/zzh/spritesheet.webp'
  },
  {
    id: 'kaname-rana',
    displayName: 'Kaname Rana',
    description: 'A playful pixel companion with a lively stage presence and a fondness for Matcha Great Parfait.',
    spritesheetPath: 'spritesheet.webp',
    manifestPath: '/pets/maozedong/pet.json',
    spritesheetUrl: '/pets/maozedong/spritesheet.webp',
    kind: 'companion'
  }
];

export async function loadPets(): Promise<InkstackPet[]> {
  return BUILT_IN_PETS;
}
