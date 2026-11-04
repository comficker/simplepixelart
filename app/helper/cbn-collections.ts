// Themed color by number collections, each its own indexable page at
// /color-by-number/<slug>. Pictures come from the gallery by tag, limited to
// public templates small enough to play (under 49×49, not animated).

export interface CbnCollection {
  slug: string
  name: string
  /** Gallery tags the pictures come from, merged in order. */
  tags: string[]
  /** Or, for a collection that is not a theme, gallery queries of its own. */
  queries?: Record<string, string | number>[]
  /** Smallest side a picture must have, for the harder collections. */
  minSide?: number
  /** Other collections whose pictures stay out, so two pages never compete. */
  exclude?: string[]
  /** Where the "more" arrow goes; the first tag's gallery by default. */
  moreTo?: string
  /** The page's heading and link text, when "<name> Color by Number" reads wrong. */
  heading?: string
  title: string
  description: string
  intro: string
}

export const CBN_COLLECTIONS: CbnCollection[] = [
  {
    slug: 'christmas',
    name: 'Christmas',
    tags: ['christmas', 'winter'],
    title: 'Christmas Color by Number – Free Pixel Art Online',
    description: 'Free Christmas color by number: a Christmas tree, Santa hat, snowman, gingerbread man and more to fill in, right in your browser. No ads, no sign-up.',
    intro: 'A Christmas tree, a snowman, candy canes and hot cocoa: cozy winter pictures to fill in by number.',
  },
  {
    slug: 'halloween',
    name: 'Halloween',
    tags: ['halloween', 'spooky', 'ghost', 'pumpkin'],
    title: 'Halloween Color by Number – Free Spooky Pixel Art Online',
    description: 'Free Halloween color by number: ghosts, jack-o\'-lanterns, pumpkins and other spooky pixel art to fill in, right in your browser. No sign-up.',
    intro: 'Ghosts, jack-o\'-lanterns and pumpkins: spooky pictures to fill in by number.',
  },
  {
    slug: 'thanksgiving',
    name: 'Thanksgiving',
    tags: ['thanksgiving', 'harvest', 'turkey', 'pie', 'corn'],
    title: 'Thanksgiving Color by Number – Free Pixel Art Online',
    description: 'Free Thanksgiving color by number: a turkey, pumpkin pie, corn on the cob, a pilgrim hat and more to fill in, right in your browser. No sign-up.',
    intro: 'A turkey, pumpkin pie, corn and a pilgrim hat: Thanksgiving dinner pictures to fill in by number.',
  },
  {
    slug: 'fall',
    name: 'Fall',
    tags: ['autumn', 'fall', 'leaf', 'leaves', 'forest', 'mushroom'],
    // The Thanksgiving pictures are autumn too; they stay on their own page.
    exclude: ['thanksgiving'],
    title: 'Fall Color by Number – Free Autumn Pixel Art Online',
    description: 'Free fall color by number: acorns, autumn trees, pumpkin heads and forest critters to fill in, right in your browser. No sign-up.',
    intro: 'Acorns, autumn trees and forest critters: cozy fall pictures to fill in by number.',
  },
  {
    slug: 'for-kids',
    name: 'Kids',
    tags: [],
    // Small grids and few squares: done in a few minutes, easy to follow.
    queries: [{width__lt: 17, height__lt: 17, ordering: '-score'}],
    moreTo: '/arts/size-16x16',
    heading: 'Color by Number for Kids',
    title: 'Color by Number for Kids – Easy Free Pixel Art Online',
    description: 'Easy color by number for kids: small pixel pictures with big squares and few colors, to fill in right in the browser. Free, no sign-up, no download.',
    intro: 'Small pictures with big squares and only a few colors, quick enough to finish before snack time.',
  },
  {
    slug: 'for-adults',
    name: 'Adults',
    tags: [],
    // The biggest playable grids: hundreds of squares and more colors.
    queries: [{ordering: '-width'}],
    minSide: 30,
    moreTo: '/arts/size-32x32',
    heading: 'Color by Number for Adults',
    title: 'Color by Number for Adults – Free Detailed Pixel Art Online',
    description: 'Color by number for adults: detailed pixel art with hundreds of squares and rich palettes, painted with watercolor or pencil brushes. Free, in your browser.',
    intro: 'Bigger, more detailed pictures with hundreds of squares: a calm half hour with a watercolor brush.',
  },
]

// Below this many pictures a collection page is too thin to index.
export const CBN_MIN_PICTURES = 8

// The gallery holds fan art too. A collection page is ours to put in front of
// search engines, so pictures of someone else's characters, people or brands
// stay off it, as do the unnamed ones nobody can find again.
const KEEP_OFF = new RegExp([
  'mario', 'luigi', 'yoshi', 'bowser', 'pokemon', 'pikachu', 'bulbasaur', 'charmander', 'squirtle', 'eevee', 'rowlet', 'fennekin',
  'goku', 'naruto', 'luffy', 'deku', 'izuku', 'totoro', 'chihiro', 'ghibli', 'miku', 'doraemon', 'dorami', 'kazama', 'shin-?chan',
  'minecraft', 'creeper', 'crepper', 'among-?us', 'roblox', 'fortnite', 'zelda', 'kirby', 'sonic', 'pac-?man',
  'mega-?man', 'tetris', 'undertale', 'cuphead', 'hollow-knight', 'terraria', 'stardew', 'angry-birds',
  'hello-kitty', 'garfield', 'snoopy', 'simpson', 'spongebob', 'futurama', 'adventure-time', 'beemo', 'shrek',
  'disney', 'mickey', 'minion', 'nyan', 'kazuma', 'stitch', 'baymax', 'marvel', 'avengers', 'iron-man', 'thor', 'captain-america',
  'spider-?man', 'batman', 'superman', 'falcon', 'natasha', 'star-wars', 'yoda', 'harry-potter',
  'trump', 'obama', 'biden', 'twitch', 'instagram', 'tic-?tok', 'tik-?tok', 'pinterest', 'facebook', 'linkedin',
  'youtube', 'discord', 'twitter', 'coca', 'pepsi', 'starbuck', 'nike',
].join('|'), 'i')

export function cbnPlayable(it: { id_string: string, name?: string }) {
  if (/^(art-|untitled|icon-|tile-|board-|image-|\d|-)/i.test(it.id_string)) return false
  return !KEEP_OFF.test(`${it.id_string} ${it.name || ''}`)
}

export const cbnHeading = (c: CbnCollection) => c.heading || `${c.name} Color by Number`
