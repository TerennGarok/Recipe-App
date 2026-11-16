# RecipeBox

A personal, on-device recipe box for iPhone and Android. Claude reads, cleans up and formats recipes from anywhere, and the ingredients you need go straight onto your AnyList shopping lists.

## What it does

| | |
|---|---|
| **Scan paper recipes** | Photograph a recipe card or cookbook page (multiple pages or the back of a card are fine), and crop or rotate each photo before Claude reads it. Claude reads handwriting, applies handwritten changes (a crossed-out amount with a new one written in) to the recipe itself and lists them in the notes, fixes typos and standardizes formatting. The original photos can stay attached. |
| **Batch import** | **Add → Many recipes at once**: queue a stack of photos (each becomes its own recipe; mark the back of a card as "Same recipe as above") and/or a list of links, then let Claude process them two at a time. Failed items can be retried, and the queue is saved if you leave the app (tap **Resume** to continue). |
| **Import from websites** | Paste a link, or in Safari/Chrome tap **Share → RecipeBox**. The app pulls the recipe out of the page (skipping the ads and the life story) along with the main photo and any video. |
| **Paste text** | Recipes from emails, texts or notes get cleaned up into the same format. |
| **Find recipes online** | Ask for "weeknight chicken thighs" and Claude searches the web, favoring well-reviewed recipes from reputable sources. Preview a result, then save the ones you like. |
| **AnyList** | Tap any ingredient and pick which AnyList list it goes to (your last-used list is on top, and it tells you if the item is already on the list). Or tap **Shop**, select everything you're missing, and add them all at once. |
| **Photos & videos** | Add photos or videos of the dish from the camera, your library or a web link (image, video file, or YouTube/Vimeo/TikTok page). Long-press one to crop/rotate it, make it the cover, or remove it. |
| **Family sharing** | Share one recipe or your whole collection as a `.recipebox.json` file over Messages, AirDrop or email. Family members open it in RecipeBox to import it. If someone re-shares an updated recipe, it replaces the older copy, unless you've edited yours more recently. |
| **Meal plan** | A week view (Monday–Sunday) of breakfast, lunch, dinner and snacks. Add a recipe from its page (**Add to meal plan**), or tap **Add** on a day and start typing: matching recipes are suggested, or save what you typed ("Leftovers", "Pizza night"). Press and hold an entry to move it or remove it. |
| **Meal ideas** | Not sure what to make? Pick ingredients and tags (search for them, or tap from the list); every pick narrows the recipes to ones that have all of them. |
| **Step timers** | Steps that mention a time ("bake 25–30 minutes", "simmer 1 hr 15 min") get a timer button. Run as many as you like; they show in a tray on every screen, keep running if you leave the app, show in your notifications while RecipeBox is in the background, and alarm when done. On Android, allow **precise alarms** in Settings so they go off exactly on time. |
| **Claude spending** | Settings shows your estimated remaining Anthropic credit and the average cost per recipe cleanup. Anthropic doesn't let apps read the balance, so you enter it once (and again when you top up) and the app subtracts the cost of each request. |
| **Everything else** | Search by title, ingredient or tag. Favorites. Tap steps to check them off while cooking; press and hold an ingredient or step to edit or delete it. Edit anything, with an optional "Tidy up with Claude" pass. Works in dark mode. |

Recipes, photos and videos are stored **only on the device**: there's no server and no account. Your Anthropic API key and AnyList login are kept in the iOS Keychain / Android Keystore.

## Setup in the app

1. **Claude:** create an API key at [console.anthropic.com](https://console.anthropic.com/settings/keys) and paste it into **Settings → Claude**. You pay Anthropic per use. A typical recipe import costs a few cents; an online search costs a bit more because Claude reads several pages. Family members can use their own keys.
2. **AnyList:** sign in under **Settings → AnyList** with your AnyList email and password.

> **About AnyList:** AnyList has no official API. RecipeBox uses the same private interface as AnyList's web app (as documented by the open-source [`anylist`](https://github.com/codetheweb/anylist) project). It could stop working if AnyList changes it, and using it may not be sanctioned by AnyList's terms. Items are added to the list without a category, so AnyList may file them under "Other".

## Getting it onto your phones

This is an [Expo](https://expo.dev) (React Native) app. It uses a share extension and native modules, so it runs as its own app rather than inside Expo Go. Builds run in the cloud with EAS, so no Xcode or Android Studio is needed:

```bash
npm install
npx eas-cli@latest login            # free Expo account
npx eas-cli@latest build --profile preview --platform android   # installable APK
npx eas-cli@latest build --profile preview --platform ios       # ad-hoc build for registered iPhones
```

- **Android:** download the APK link from the build page on each phone and install it.
- **iPhone:** installing on your own and family iPhones requires an [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/yr). Then either register each family iPhone for ad-hoc builds (`eas device:create`), or upload with `eas submit` and invite family through TestFlight (simpler for several people).
- The app's bundle ID is `com.terenngarok.recipebox` (`ios.bundleIdentifier` and `android.package` in `app.json`). Don't change it after family members have installed the app: phones would treat it as a new, empty app. EAS creates the App Group the iOS share extension needs.

For day-to-day development: `npx eas-cli build --profile development`, install that build once, then `npm start` and changes load live.

## Development

The app icon is generated from SVG by `scripts/make-icons.mjs` (needs Playwright); change the colors at the top and run `node scripts/make-icons.mjs`.


```bash
npm test          # unit tests (AnyList protocol, page parsing, ingredient parsing, share files, Claude requests)
npm run typecheck
npm run lint
```

```
src/app/                 screens (Expo Router)
  index.tsx              recipe list + search
  add.tsx                camera / photos / link / text / manual
  discover.tsx           Claude web search
  recipe/[id].tsx        recipe page, ingredient → AnyList, media
  edit/[id].tsx          editor ("new" for manual entry)
  settings.tsx           API key, AnyList, import/export
src/lib/
  claude.ts              all Claude calls (structured outputs, web search/fetch tools)
  recipes.ts             import pipeline, media attach/remove
  db.ts                  SQLite storage
  media.ts               on-device photo/video files
  share.ts, sharefile.ts family share file format
  webpage.ts             recipe page parsing (schema.org JSON-LD, og:image, …)
  anylist/               AnyList client + minimal protobuf codec
```

Claude calls use `claude-opus-5-5` with server-side refusal fallbacks enabled. To change the model (e.g. to a cheaper one), edit `MODEL` in `src/lib/claude.ts`.
