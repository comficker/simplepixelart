// Names of franchises known for active IP enforcement. Any artwork whose
// title/description/tags matches one of these is treated as protected IP:
// the page is `noindex`-ed and Google ads are suppressed on it.
//
// Matching is case-insensitive and constrained to word boundaries (\b) so
// short tokens like "link" or "thor" don't trigger on unrelated words.
// Multi-word phrases match as literal substrings (regex-escaped).

const IP_TERMS: readonly string[] = [
  // Nintendo
  'mario', 'luigi', 'princess peach', 'bowser', 'yoshi', 'wario', 'waluigi', 'rosalina',
  'donkey kong', 'diddy kong',
  'zelda', 'ganondorf', 'sheik', 'hyrule',
  'kirby', 'samus', 'metroid', 'pikmin',
  'pokemon', 'pokémon', 'pikachu', 'charizard', 'eevee', 'mewtwo',
  'bulbasaur', 'squirtle', 'charmander', 'jigglypuff', 'snorlax', 'gengar',
  'splatoon', 'inkling',
  'animal crossing', 'isabelle animal',
  'super smash',
  // Sega
  'sonic', 'sonic the hedgehog', 'sonic hedgehog',
  'tails sonic', 'knuckles sonic', 'shadow the hedgehog',
  'amy rose', 'doctor eggman', 'robotnik',
  // Disney / Pixar
  'mickey mouse', 'minnie mouse', 'donald duck', 'goofy disney', 'disney pluto',
  'frozen elsa', 'frozen anna', 'olaf disney',
  'lion king', 'simba',
  'aladdin disney', 'jasmine disney',
  'little mermaid', 'ariel disney',
  'beauty and the beast', 'belle disney',
  'cinderella disney', 'snow white disney',
  'pocahontas disney', 'mulan disney', 'moana disney', 'tarzan disney',
  'toy story', 'buzz lightyear', 'woody toy',
  'lightning mcqueen',
  'finding nemo', 'finding dory',
  'wall-e', 'wall e',
  'monsters inc', 'sully monsters',
  'inside out',
  'ratatouille', 'remy ratatouille',
  'pixar coco',
  'incredibles',
  // Marvel
  'spider-man', 'spider man', 'spiderman',
  'iron man', 'ironman',
  'captain america', 'cap america',
  'thor marvel', 'hulk marvel', 'avengers',
  'black widow', 'hawkeye',
  'deadpool', 'wolverine',
  'x-men', 'magneto', 'professor x',
  'venom marvel', 'thanos',
  'doctor strange', 'ant-man',
  'guardians of the galaxy',
  'black panther',
  // DC
  'batman', 'bruce wayne',
  'superman', 'clark kent', 'lex luthor',
  'wonder woman',
  'the flash', 'aquaman',
  'green lantern', 'harley quinn',
  'joker dc',
  // Anime / manga
  'naruto', 'sasuke', 'kakashi',
  'goku', 'vegeta', 'dragon ball', 'dbz',
  'one piece', 'luffy', 'zoro',
  'doraemon',
  'sailor moon',
  'totoro', 'ghibli', 'spirited away', 'no face ghibli',
  'attack on titan', 'eren yeager',
  'demon slayer', 'tanjiro', 'nezuko',
  'jujutsu kaisen', 'gojo',
  'my hero academia', 'deku',
  'death note',
  'hello kitty', 'sanrio', 'kuromi', 'cinnamoroll', 'my melody', 'pompompurin',
  // Vocaloid (Crypton Future Media — Piapro license is non-commercial)
  'hatsune miku', 'miku', 'mikuu', 'vocaloid',
  'kagamine rin', 'kagamine len', 'megurine luka',
  'kasane teto',
  // Star Wars / Lucasfilm
  'star wars', 'darth vader', 'yoda', 'baby yoda', 'grogu', 'mandalorian',
  'luke skywalker', 'leia', 'princess leia', 'han solo',
  'stormtrooper', 'kylo ren', 'r2-d2', 'bb-8',
  // Harry Potter
  'harry potter', 'hogwarts', 'dumbledore', 'voldemort', 'hermione',
  // Games
  'minecraft', 'creeper minecraft',
  'pac-man', 'pacman', 'pac man',
  'tetris',
  'fortnite',
  'among us', 'amongus',
  'roblox',
  'angry birds',
  'fall guys',
  'overwatch tracer', 'overwatch genji', 'overwatch d.va',
  'undertale sans', 'undertale frisk',
  'fnaf', 'five nights at freddy',
  'cuphead',
  'celeste game',
  // Cartoons
  'shrek',
  'spongebob', 'patrick star spongebob', 'squidward',
  'simpsons', 'homer simpson', 'bart simpson',
  'south park',
  'family guy',
  'rick and morty',
  'bluey',
  'paw patrol',
  'peppa pig',
  'adventure time', 'finn the human', 'jake the dog',
  'powerpuff girls',
  // Misc
  'minions',
  'transformers', 'optimus prime',
  'teenage mutant ninja turtles', 'tmnt',
  'my little pony',
  'looney tunes', 'bugs bunny', 'daffy duck',
] as const

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a single regex for all terms. Word-boundary anchors so e.g. "thor"
// matches "Thor avenger" but not "author".
const IP_REGEX = (() => {
  const escaped = IP_TERMS.map(t => escapeRegex(t.toLowerCase()))
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i')
})()

/**
 * Returns true when any of the supplied strings looks like it references
 * a well-known protected franchise. Inputs are concatenated with spaces.
 *
 * Used to: (a) noindex + suppress ads on art detail pages whose name/desc/tags
 * reference such IP, and (b) filter such items out of homepage featured spots.
 */
export function looksLikeProtectedIP(...parts: Array<string | null | undefined>): boolean {
  const joined = parts.filter(Boolean).join(' ').trim()
  if (!joined) return false
  return IP_REGEX.test(joined)
}
