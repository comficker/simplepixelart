// The Android app on Google Play. `spot` is where the link sits on the web,
// passed as the install referrer so Play Console can tell them apart.
export const PLAY_ID = 'com.simple.pixel.art'

export function playUrl(spot: string): string {
  const referrer = encodeURIComponent(`utm_source=web&utm_medium=${spot}`)
  return `https://play.google.com/store/apps/details?id=${PLAY_ID}&referrer=${referrer}`
}
