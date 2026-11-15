# RecipeBox

A personal, on-device recipe box for iPhone and Android. Claude reads, cleans up and formats recipes from anywhere, and the ingredients you need go straight onto your AnyList shopping lists.

## What it does

| | |
|---|---|
| **Scan paper recipes** | Photograph a recipe card or cookbook page (multiple pages or the back of a card are fine). Claude reads handwriting, fixes typos, standardizes formatting and keeps notes like "Mom: use less sugar". The original photos can stay attached. |
| **Import from websites** | Paste a link, or in Safari/Chrome tap **Share → RecipeBox**. The app pulls the recipe out of the page (skipping the ads and the life story) along with the main photo and any video. |
| **Paste text** | Recipes from emails, texts or notes get cleaned up into the same format. |
| **Find recipes online** | Ask for "weeknight chicken thighs" and Claude searches the web, favoring well-reviewed recipes from reputable sources. Preview a result, then save the ones you like. |
| **AnyList** | Tap any ingredient and pick which AnyList list it goes to (your last-used list is on top, and it tells you if the item is already on the list). Or tap **Shop**, select everything you're missing, and add them all at once. |
| **Photos & videos** | Add photos or videos of the dish from the camera, your library or a web link (image, video file, or YouTube/Vimeo/TikTok page). Long-press one to make it the cover or remove it. |
| **Family sharing** | Share one recipe or your whole collection as a `.recipebox.json` file over Messages, AirDrop or email. Family members open it in RecipeBox to import it. If someone re-shares an updated recipe, it replaces the older copy, unless you've edited yours more recently. |
| **Everything else** | Search by title, ingredient or tag. Favorites. Tap steps to check them off while cooking. Edit anything, with an optional "Tidy up with Claude" pass. Works in dark mode. |

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
