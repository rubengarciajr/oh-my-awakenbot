# Awaken Bot brand guide

Last reviewed: November 16, 2026.

This guide records the identity implemented in this project and the design choices agreed for Awaken Bot. It covers the desktop app, its launch experience, and its brand assets. It is a product guide for this fork, rather than a complete Awaken Church identity manual.

## Brand at a glance

| Element | Direction |
| --- | --- |
| Product name | **Awaken Bot**, always with a space |
| Display name | **AWAKEN BOT** on the launch screen and compact app chrome |
| In-app organization identity | **Awaken Church**, using the supplied church wordmark |
| Product description | Your bots. One calm workspace. |
| Visual character | Calm, minimal, tactile, atmospheric |
| Core palette | Off-black surfaces and warm off-white text |
| Signature element | A nearly perfect circular orb with flowing pearl, ice-blue, and charcoal currents |
| Default appearance | Dark theme, AWAKEN palette, soft bubbles |
| Regular desktop distribution | macOS and Windows; Linux is a personal, one-off build |

## Naming and copy

Use **Awaken Bot** in prose, installers, application menus, window titles, and update messages. Use **AWAKEN BOT** when the designed display treatment calls for uppercase. Keep the space in both forms.

Inside the workspace, show **Awaken Church** through the official wordmark. The artwork contains its own lowercase lettering; preserve it exactly. Hermes remains the name of the underlying agent and may appear as a bot name or in connection diagnostics.

Internal names such as `apps/omher`, the `omh` palette identifier, and compatible protocol or storage names are implementation details. They do not define the public product name.

Use short, direct, reassuring interface copy. Describe the actual state and give a useful next action when something fails. Examples of the intended tone:

- “Loading…” while an account is opening.
- “Create a bot” for the bot creation action.
- “Check for updates” for the update action.

Avoid claims that the app is instant, always connected, or fully optimized unless the behavior has been measured and supports that claim.

## Logos and marks

### The orb

The orb is the recognizable Awaken Bot mark. Keep its outside edge circular and stable. Movement comes from liquid-like currents, light, and texture inside the sphere. The feeling is flowing lava expressed through cool pearl and ice tones.

Preserve the soft highlights, dark depth, fine dot texture in the animated artwork, and restrained pulsing glow. Keep ice-blue light concentrated around the orb rather than spreading saturated color throughout the interface.

Use the static [orb master](brand/awaken-ice-orb.svg) for still applications and the generated animated variants for app motion. The static SVG is square, with a `256 × 256` viewBox and intrinsic `1024 × 1024` dimensions.

### Awaken Church wordmark

Use the supplied [church wordmark](brand/awaken-church.webp). It is **1039 × 119 px**, an aspect ratio of **1039:119**, approximately **8.73:1**. That ratio applies to the entire supplied image, including the church symbol and lettering.

Scale uniformly. Set one dimension and let the other follow the original ratio. Do not typeset a substitute, resize the symbol separately, crop the lockup, or squeeze the image to fit a header.

The current dark header converts the artwork to white with `brightness(0) invert(1)` at `0.94` opacity. Light mode uses black artwork with `brightness(0)`.

The current sidebar lockup uses:

| Part | Size or spacing |
| --- | --- |
| Animated orb | `20 × 20 px` |
| Gap between orb and church artwork | `9 px` |
| Church artwork | Up to `18 px` high, automatic width; about `157.2 px` wide at full size |
| Alignment | Vertically centered |

When the optional helper notice occupies the header, the wordmark scales down uniformly to keep both controls inside the sidebar. The orb stays `20 × 20 px`.

The orb and the church symbol are separate elements of this lockup. Keep both when reproducing the existing sidebar identity.

### Application icon

Use [app-icon.png](brand/app-icon.png), the **1024 × 1024 px** application icon master. It contains a bright ice orb centered on an off-black rounded-square tile, with transparent outer padding.

Keep the tile black/off-black and preserve the orb's light and shading. The orb must stay visible at small Dock and taskbar sizes. Do not flatten the whole icon to black, add text inside the tile, or stretch the square artwork. Preserve the existing padding and corner shape when producing platform icon files.

## Color system

### Default dark interface

Use semantic CSS tokens from [tokens.css](apps/omher/src/theme/tokens.css). The surface hierarchy creates separation without making the workspace feel like a flat, pure-black field.

| Role | Token | Hex |
| --- | --- | --- |
| Outer page | `--page` | `#0C0C0E` |
| Main workspace | `--bg` | `#111214` |
| Sidebar | `--side` | `#17181B` |
| Raised surface | `--raise` | `#202125` |
| Selected row and search surface | `--raise2` | `#2A2B30` |
| Popover | `--pop` | `#25262B` |
| Standard border | `--line` | `#323338` |
| Subtle divider | `--line-soft` | `#25262A` |
| Strong border | `--line-strong` | `#4B4D54` |
| Primary text | `--ink` | `#F3F1EC` |
| Body text | `--body` | `#D8D6D0` |
| Secondary text | `--muted` | `#A7A8AF` |
| Quiet labels | `--quiet` | `#909198` |
| Bot bubble | `--bub-bot` | `#232428` |
| User bubble, default soft style | `--bub-me` | `#2D2E32` |
| Text on the pale default accent | `--on-accent` | `#0C0C0E` |

The warm default accent runs through `#D8D6D0`, `#F3F1EC`, and `#FBFAF7`. Primary text and default links use warm off-white rather than pure white.

Pale buttons and command chips need dark foregrounds. In particular, labels such as `/plan` must use the appropriate on-accent color so they remain readable.

### Orb palette

These colors belong to the orb artwork and its lighting. Preserve the supplied gradients instead of replacing the sphere with a flat fill.

| Color | Hex | Use |
| --- | --- | --- |
| Pearl | `#FAFAFA` | Main highlight |
| Ice | `#CDEEFF` | Signature cool light |
| Pale ice | `#E5F5FC` | Soft upper transitions |
| Mist blue | `#B1D8EB` | Midtone depth |
| Slate | `#536B7B` | Shadow transitions |
| Deep blue charcoal | `#1B2630` | Interior dark currents |
| Off-black | `#0C0C0E` | Deepest shadows |

Pure white can appear in small specular highlights within the artwork. It is not the default interface text color.

### Status, sources, and optional themes

Success uses `--ok: #7FD6A4`; errors and destructive states use `--danger: #F08A8A` in the default dark theme. Pair state colors with text or an icon so meaning does not depend on color alone.

Service marks and source indicators retain their recognizable colors. They are functional identifiers rather than additions to the Awaken brand palette.

Graphite, Ocean, Forest, Sunset, and Rose remain optional user accent palettes. They affect controls, links, live indicators, and user bubbles; they do not recolor the orb or church wordmark. Selection surfaces remain neutral. Light and System themes are available, while a fresh installation defaults to Dark.

## Typography

Use the app's native-first sans-serif stack. On macOS it prioritizes the system font and SF Pro Text; Inter and `system-ui` are fallbacks, followed by the existing language-specific fonts. Inter is not bundled as a dedicated brand font. Preserve the CJK fallbacks when reusing the stack.

Code uses the existing `"SF Mono", ui-monospace, Menlo, monospace` stack. The church wordmark is supplied artwork, not a font selection.

| Application | Current treatment |
| --- | --- |
| Base UI | `13 px`, line height `1.5` |
| Default messages | `13 px`, line height `1.55` |
| Optional message sizes | `14 px`; `15 px` with line height `1.6` |
| Sidebar section labels | `10.5 px`, weight `500`, uppercase, `0.06em` tracking |
| Launch name | Weight `400`, `clamp(12px, 1.4vw, 18px)`, `0.23em` tracking |
| Loading label | `12 px`, weight `400`, `0.08em` tracking |
| Compact chrome name | `10 px`, weight `500`, `0.16em` tracking |

Keep the launch name small and below the orb. The orb carries the visual focus.

## Backgrounds and layout

The working interface uses layered off-black surfaces, fine borders, and restrained shadows. Reserve the more atmospheric gradients for launch and loading states.

The current launch screen chooses **Charcoal** or **Quiet studio** with equal probability each time the daily intro is shown. It keeps the chosen background for that showing.

- **Charcoal:** neutral charcoal depth with a soft light field behind the orb. The live backdrop uses `#101113`, `#2B2E32`, and `#1A1C20`.
- **Quiet studio:** a subdued slate atmosphere. The live backdrop uses `#353A43` over a gradient from `#292E36` to `#101317`.

The reference scenes are landscape artwork, but the app renders the background, orb, and text separately. Fill the available window without stretching the sphere or letterboxing the entire scene into a fixed 16:9 frame. In the current launch layout, the circular sphere occupies roughly 30% of the window width when width is the limiting dimension; the larger image bounds also include its halo.

Use the current shape tokens: `6 px` for standard controls, `4 px` for small controls, and `10 px` for chat bubbles. The default sidebar is `248 px` wide and the thread content limit is `920 px`. These are implementation references, not a universal spacing grid.

Keep window chrome visually integrated with the app. Preserve platform window controls, dragging, native macOS corner behavior, and window-manager compatibility.

## Motion and loading

Motion should feel continuous and fluid. Keep the circular silhouette stable while currents change inside it. Favor a soft pulse and fine dot texture over flashing, bouncing, or an exaggerated changing outer shape.

| Context | Current motion and presentation |
| --- | --- |
| Daily desktop intro | Five-second animated scene; shown on the first desktop launch of each local day while startup proceeds |
| Repeat launch on the same day | Intro skipped |
| Sidebar orb | `20 px`; interior morphing loop of `20 s`, plus a slow `24 s` CSS rotation |
| Initial account loading | Centered orb, up to `300 × 300 px`; same `20 s` interior loop with `14 s` CSS rotation |
| Loading dots | Three dots appear in sequence over a repeating `1.6 s` cycle |
| Reduced motion | Still orb artwork and visible static dots |
| Hidden application | Visual animation pauses; connections and background events remain ready |

During initial account loading, blur the entire workspace behind the orb by `10 px` and dim it with `rgba(17, 18, 20, 0.7)`. Keep the orb and the small loading label sharp. Position the label `22 px` below the orb. The orb scales down on smaller windows using `min(300px, 60vw, 55vh)`.

The loading treatment must communicate real progress without trapping the user: navigation and window controls remain usable. Keep an already loaded chat readable during reconnection, and show actionable connection errors when loading cannot complete.

## Asset inventory and maintenance

Paths below are relative to the repository root.

| Asset | Purpose |
| --- | --- |
| [brand/awaken-ice-orb.svg](brand/awaken-ice-orb.svg) | Static orb master |
| [brand/awaken-church.webp](brand/awaken-church.webp) | Supplied church symbol and wordmark |
| [brand/app-icon.png](brand/app-icon.png) | Application icon master |
| [brand/logo.png](brand/logo.png) | Original supplied square brand image |
| [brand/animation/background-studies/charcoal.svg](brand/animation/background-studies/charcoal.svg) | Charcoal animated scene master |
| [brand/animation/background-studies/quiet-studio.svg](brand/animation/background-studies/quiet-studio.svg) | Quiet studio animated scene master |
| [brand/animation/awaken-bot-splash-5s.mp4](brand/animation/awaken-bot-splash-5s.mp4) | Five-second video export |
| [brand/animation/awaken-bot-splash-poster.png](brand/animation/awaken-bot-splash-poster.png) | Poster export |
| [apps/omher/public/brand/](apps/omher/public/brand/) | Generated live and reduced-motion orb assets |
| [apps/omher/src-tauri/icons/](apps/omher/src-tauri/icons/) | Platform application icon exports |

Update the masters before regenerating app copies. From `apps/omher`, run:

```sh
node scripts/brand-assets.mjs
node scripts/brand-assets.mjs --check
```

For platform icons, use `brand/app-icon.png` and the icon export procedure in the [desktop README](apps/omher/README.md#branding-and-launch). The approved app assets are generated by [brand-assets.mjs](apps/omher/scripts/brand-assets.mjs); avoid editing only the generated copies.

## Brand review checklist

- The product name is Awaken Bot, with a space.
- The workspace uses the supplied Awaken Church wordmark at its original ratio.
- The orb remains circular, with visible interior flow where motion is enabled.
- The application icon retains its off-black tile and bright orb.
- Dark mode uses the named off-black and off-white tokens.
- Text, chips, links, and status indicators remain readable on their actual backgrounds.
- Launch artwork fills the window without distorting the sphere or wordmark.
- Loading is visible, reduced motion is respected, and hidden visuals pause.
- Brand asset checks pass after generated assets change.

## Implementation references

The source files below define the current values described here. Update this guide alongside changes to those values.

- [Theme tokens](apps/omher/src/theme/tokens.css) and [base typography](apps/omher/src/theme/base.css).
- [Sidebar identity and motion](apps/omher/src/sidebar/sidebar.css) and [sidebar markup](apps/omher/src/sidebar/Sidebar.tsx).
- [Launch behavior](apps/omher/src/app/LaunchScreen.tsx), [daily intro policy](apps/omher/src/app/launchIntro.ts), and [launch layout](apps/omher/src/app/launch.css).
- [Orb component](apps/omher/src/ui/OrbMark.tsx), [account loading](apps/omher/src/app/AccountLoading.tsx), and [loading styles](apps/omher/src/app/account-loading.css).
- [Desktop identity and packaging](apps/omher/src-tauri/tauri.conf.json) and [desktop README](apps/omher/README.md).
