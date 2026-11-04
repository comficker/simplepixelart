// Themed color by number collections, each its own indexable page at
// /color-by-number/<slug>. Pictures come from the gallery by tag, limited to
// public templates small enough to play (under 49×49, not animated).

export interface CbnCollection {
  slug: string
  name: string
  tags: string[]
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
    slug: 'thanksgiving',
    name: 'Thanksgiving',
    tags: ['thanksgiving', 'autumn', 'fall'],
    title: 'Thanksgiving Color by Number – Free Fall Pixel Art Online',
    description: 'Free Thanksgiving and fall color by number: a turkey, pumpkin pie, corn, maple leaf and more to fill in, right in your browser. No ads, no sign-up.',
    intro: 'A turkey, pumpkin pie, corn and maple leaves: autumn pictures to fill in by number.',
  },
]

// Below this many pictures a collection page is too thin to index.
export const CBN_MIN_PICTURES = 8
