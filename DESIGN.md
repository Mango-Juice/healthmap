# 건강식 지도 Design System

## 1. Atmosphere & Identity

**Distinctive direction — Neighborhood Food Atlas.** The app feels like a compact local food guide laid over a real city map: deep herb green establishes identity, warm grain orange distinguishes mixed-grain options, and concise Korean labels make the choice legible at a glance. NAVER remains the basemap authority while the product owns its category-coded SDK marker system.

This is a consumer utility, not a wellness campaign. It opens on the map, avoids heroic copy and medical promises, and lets the user understand “where, what category, what next” in one glance.

### Audience and inclusive personas

- **Time-boxed office worker:** one-handed mobile use between meetings, glare or crowding, wants a nearby choice with minimal reading. Needs 44px targets, persistent orientation, and no drag-only behavior.
- **Health-conscious explorer:** compares categories without assuming a medical score. Needs explicit text labels in addition to color, stable filter geometry, and honest empty/error recovery.
- **Low-vision or temporary-strain user:** may zoom to 200%, use high contrast, keyboard, or reduced motion. Needs strong text contrast, visible focus, reflow, non-clipped Korean, and state announcements.
- **Motor-limited keyboard user:** may not use precise pointing. Every action must be reachable in DOM order; the sheet has an explicit close button and Escape behavior in the product implementation.

### Principles

Discovery starts around the user's location when permission succeeds and uses a fixed camera default while waiting or when location is unavailable. A user action may request recentering; the default is never presented as the user's location or as the origin of a distance label.

Search stays above the map at every width, with visible category choices in one rail. The mobile sheet owns results and place detail while preserving a large map area; the location control lives on the map with a target icon and visible label.

An explicit location request that fails shows a brief, polite failure notice. Initial location failure remains quiet. When the active view is empty but matching results exist elsewhere, an explicit recovery action offers the available area choices. It preserves the current search and category, clears selection and pagination only after the user chooses, and never moves the map automatically.

1. **Map before chrome:** the map owns the primary visual field; search, chips, and place cards stay compact and detached.
2. **Choose by need:** categories describe a meal a person can ask for, never a database field or review process.
3. **Food first:** venue name, menu names, address, and category lead. Internal review material does not appear in the consumer flow.
4. **Warm, not whimsical:** material warmth comes from solid tones and soft elevation, never gradients, orbs, glass, emoji, or decoration-only motion.
5. **Recovery is a first-class state:** loading, empty, error, disabled, and closed states have deliberate dimensions and copy.

### Place comparison and detail reading order

- Result cards lead with the place name, then the search-distance basis and address, followed by
  matching menu examples and auxiliary confirmed-feature tags. Tags describe observed food or menu
  features; they are not a health guarantee.
- Place detail leads with the place summary and NAVER place-information and directions actions.
  Matching menus follow, with at most three visible initially and an explicit control for the rest.
  Ordering conditions stay beside their menu.
- Returning from a list-opened detail with Back, Close, or Escape restores the same result trigger,
  keyboard focus, and list reading position when the active query is unchanged.

## 2. Color

### Palette

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Canvas/oat | `--hm-canvas` | `#f4f0e7` | Page and map surround |
| Map/paper | `--hm-map` | `#ebe8dc` | Map field |
| Surface/ceramic | `--hm-surface` | `#fffdf8` | Cards, pane, sheet |
| Surface/subtle | `--hm-surface-subtle` | `#f8f5ed` | Quiet controls and skeleton |
| Ink/primary | `--hm-ink` | `#17231c` | Headings and body |
| Ink/secondary | `--hm-ink-muted` | `#536159` | Metadata and helper text |
| Border/default | `--hm-border` | `#d7d2c6` | Surface boundaries |
| Border/strong | `--hm-border-strong` | `#aba497` | Active utility outlines |
| Botanical/950 | `--hm-green-950` | `#0d3425` | High-emphasis text and active press |
| Botanical/900 | `--hm-green-900` | `#17231c` | Recovery and result headings, preserving the canvas ink tone |
| Botanical/800 | `--hm-green-800` | `#18563b` | Primary actions and selected filter |
| Botanical/700 | `--hm-green-700` | `#2b6048` | Brighter selected mixed-category marker |
| Botanical/600 | `--hm-green-600` | `#2f7651` | Hover and secondary emphasis |
| Botanical/300 | `--hm-green-300` | `#98bba5` | Disabled botanical marks |
| Botanical/100 | `--hm-green-100` | `#e1ece3` | Focus-adjacent and selected wash |
| Grain/700 | `--hm-grain-700` | `#a8542f` | Mixed-grain marker and category emphasis |
| Grain/500 | `--hm-grain-500` | `#c66a3a` | Brighter selected mixed-grain marker |
| Grain/100 | `--hm-grain-100` | `#f8e6d8` | Mixed-grain chip and media fallback wash |
| Focus/accent | `--hm-blue` | `#26699c` | Focus ring and secondary accent |
| Status/error | `--hm-error` | `#b53a2f` | Error border, icon, action |
| Status/error wash | `--hm-error-wash` | `#fff0ec` | Error background |
| Status/info | `--hm-info` | `#225f86` | Informational alert |
| Status/info wash | `--hm-info-wash` | `#eaf4fa` | Informational background |

### Color rules

- No colors outside this table enter product CSS; extend the table first.
- Category colors never communicate alone: each tag includes an accessible name or visible label.
- The green ramp uses separate role stops; one green hex is never reused through opacity to fake a system.
- Solid color blocks create atmosphere. Gradients and decorative orbs are prohibited.
- Focus uses `--hm-focus-ring`: an outer `--hm-blue` ring plus a ceramic separation ring, visible in forced-colors mode.

## 3. Typography

### Font stack

- Primary: `"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`.
- No secondary font is needed for the MVP.
- The application uses this local system stack and makes no remote font request.

### Scale

| Role | Token | Size | Weight | Line height | Letter spacing | Usage |
| --- | --- | --- | --- | --- | --- | --- |
| Display | `--hm-type-display` / `--hm-type-display-compact` | `32px` / `28px` | 700 | `42px` / `36px` | `0` | Editorial trust-page title |
| Title | `--hm-type-title` | `24px` | 700 | `32px` | `0` | Showcase/product title |
| Heading | `--hm-type-heading` | `20px` | 700 | `28px` | Sheet and pane title |
| Subheading | `--hm-type-subheading` | `16px` | 700 | `24px` | Group heading |
| Body | `--hm-type-body` | `16px` | 400 | `24px` | Primary content |
| Label | `--hm-type-label` | `14px` | 600 | `20px` | Buttons, tags, filters |
| Caption | `--hm-type-caption` | `13px` | 500 | `20px` | Metadata and state names |

### Semantic weight and leading tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--hm-weight-label` | `600` | Filter and compact state labels |
| `--hm-weight-action` | `700` | Action-button labels requiring stronger affordance than passive labels |
| `--hm-weight-emphasis` | `700` | Titles, kickers, and section emphasis |
| `--hm-leading-tight` / `--hm-leading-body` | `20px` / `24px` | Caption/label and body/subheading leading |
| `--hm-leading-heading` / `--hm-leading-title` | `28px` / `32px` | Heading and title leading |
| `--hm-leading-display` / `--hm-leading-display-compact` | `42px` / `36px` | Editorial display title leading |
| `--hm-leading-relaxed` | `28px` | Long-form Korean body copy |

### Typography rules

- Body text is never below 16px; nonessential metadata may use the 13px caption token.
- Letter spacing is always `0`. Negative tracking and arbitrary positive tracking are prohibited.
- Font sizes are fixed tokens, never viewport-scaled.
- Korean labels wrap at meaningful phrase boundaries. Controls keep short labels on one line; long labels wrap within a stable control height only when the stress fixture requires it.
- Unbroken URLs use `overflow-wrap: anywhere` and may never widen the shell.

## 4. Spacing & Layout

### Base unit and tokens

All intentional space derives from 4px.

| Token | Value | Usage |
| --- | --- | --- |
| `--hm-space-1` | `4px` | Icon optical adjustment |
| `--hm-space-2` | `8px` | Icon-label and compact cluster |
| `--hm-space-3` | `12px` | Control inset and small gap |
| `--hm-space-4` | `16px` | Mobile gutter and card padding |
| `--hm-space-6` | `24px` | Section and pane padding |
| `--hm-space-8` | `32px` | Showcase group separation |
| `--hm-space-10` | `40px` | Wide shell gutter |
| `--hm-space-12` | `48px` | Major state section separation |

### Geometry and layers

| Token | Value | Usage |
| --- | --- | --- |
| `--hm-radius-control` | `999px` | Filter and action pills only |
| `--hm-radius-card` | `16px` | Result cards and compact state surfaces |
| `--hm-radius-panel` | `24px` | Mobile sheets and selected-place card |
| `--hm-border-width` | `1px` | Standard component and surface border |
| `--hm-border-accent` | `4px` | Editorial leading rule and informational accent |
| `--hm-control-min` | `44px` | Minimum interactive block/inline target |
| `--hm-focus-ring` | `3px` | Keyboard focus ring |
| `--hm-icon-sm` | `16px` | Inline metadata icon |
| `--hm-icon-md` | `20px` | Button and filter icon |
| `--hm-icon-lg` | `24px` | Icon-only control glyph |
| `--hm-pane-wide` | `352px` | Desktop discovery pane |
| `--hm-content-max` | `1180px` | Showcase documentation measure |
| `--hm-detail-menu-copy-min` | `120px` | Readable menu-copy floor beside secondary actions |
| `--hm-detail-evidence-max` | `160px` | Maximum wrapped secondary-action measure |
| `--hm-sheet-block-min` | `272px` | Mobile detail sheet floor |
| `--hm-state-column-min` / `--hm-feedback-column-min` | `152px` / `260px` | Responsive showcase grids |
| `--hm-skeleton-block` / `--hm-empty-block` | `132px` / `220px` | Stable feedback-state heights |
| `--hm-empty-glyph` | `48px` | Empty-state illustration frame |
| `--hm-skeleton-line-wide` / `--hm-skeleton-line-mid` / `--hm-skeleton-action-wide` | `240px` / `160px` / `200px` | Loading-placeholder measures |
| `--hm-viewport-block` | `100dvb` | Minimum showcase viewport block size |
| `--hm-visually-hidden-size` | `1px` | Screen-reader-only clipping frame |
| `--hm-copy-measure` / `--hm-empty-copy-measure` | `62ch` / `30ch` | Introductory and empty-state reading measures |
| `--hm-sheet-max` | `52%` | Mobile detail-sheet maximum block share |
| `--hm-food-map-sheet-peek` / `--hm-food-map-sheet-expanded` | `var(--hm-space-12)` / `72%` | Discovery drawer collapsed reveal and expanded workspace share below 900px |
| `--hm-food-map-sheet-offset` | `calc( min(var(--hm-food-map-sheet-expanded), calc(100% - var(--hm-space-6))) - var(--hm-food-map-sheet-peek) )` | Default collapsed drawer transform before pointer interaction |
| `--hm-food-map-place-preview` | `264px` | Compact selected-place preview, capped at 45% of the viewport; full menus open only on request |
| `--hm-search-text-scale` | `0.875` | Scaled search input geometry that retains a 16px rendered text size |
| `--hm-skeleton-line-short` | `65%` | Short loading line proportion |
| `--hm-layer-map` | `0` | Map field |
| `--hm-layer-controls` | `10` | Map controls and filters |
| `--hm-layer-detail` | `20` | Sheet/pane |

### Map-shell grammar and scroll ownership

- The product shell is bounded by `100dvb`; `100vh` and `h-screen` are prohibited.
- Compact `<900px`: map fills the shell. The Discovery starts with a `48px` result drawer peek. Selecting a place opens a content-sized summary capped at `264px` and 42dvb, with its name, first menu, address and visit actions. Selection never automatically expands full detail. `메뉴 펼치기` opens menus to `72%`; `접기` returns to the compact summary. The map remains interactive in both states. Closing restores the invoking list or map. The active body is the sole vertical scroll owner, including on short viewports.
- Desktop `>=900px`: a fixed inline-start `--hm-pane-wide` discovery pane contains brand, search, filters, and results; the map owns remaining space with `minmax(0, 1fr)`. Selecting a place renders a compact photo-led card over the map while preserving the list and filter context. The pane body is the only vertical scroll owner.
- Shell and scroll children use `min-block-size: 0` and `min-inline-size: 0` so long Korean or URL content cannot force overflow.
- Product viewport/filter/map state remains mounted when detail opens or closes.
- Production never substitutes a synthetic basemap. Until NAVER tiles are ready, the map region shows a
  loading status; missing configuration, authorization failure, or timeout shows the error Alert and hides
  map-only controls and markers.
- The showcase itself may document-scroll and documents only reusable controls and feedback states.

## 5. Components

### Filter Rail

- **Structure:** transparent labelled horizontal reel → detached native pill buttons with `aria-pressed`; the rail itself never gains a card background, border, or shadow.
- **Discovery labels:** category labels sit directly below the masthead, remain visible above the collapsed drawer, and double as the pin legend. The rail scrolls horizontally at compact widths.
- **Discovery pin meanings:** salad uses a serving bowl (`--hm-info`), cooking uses a grill (`--hm-error`), grain uses a grain stalk (`--hm-grain-700`), an explicit dietary label uses a leaf (`--hm-green-800`), and rice uses a rice bowl (`--hm-ink-muted`). Unknown facts use a neutral location dot. Shapes and colors are paired with visible labels in the top rail; list and detail facts remain explicit.
- **Discovery place and menu surface:** warm ceramic surface, generous heading rhythm, fine dividers, and a small botanical menu index replace inset rectangular menu boxes. Copy uses `메뉴 둘러보기`, `함께 살펴볼 메뉴`, and `장소 정보 보기`. It does not promise that a menu is currently sold or available at a particular branch. Missing media leaves no fake image region. All actions retain 44px targets.
- **Discovery inclusion:** a classification is an exploration aid, not a medical or availability claim. Results, markers, and matching menus use the same public conditions. Consumer controls cannot reveal non-public records.
- **Result continuity:** cards and detail lead with the matching menu. Cards group place name → matching menu and category tags → address and distance. Place names use the heading token, menu previews the label token, and location metadata the caption token. Empty results offer search or category reset actions without promising coverage.
- **Filter layout:** Discovery category choices use one horizontally scrollable row above the map. On short or zoomed viewports the complete results body becomes the single scroll owner so results remain reachable.
- **Spacing:** `--hm-space-2`, `--hm-space-3`; `--hm-control-min` target.
- **States:** default, hover, active/pressed, focus-visible, selected, disabled. Selected uses fill plus weight/check semantics, never color alone.
- **Accessibility:** visible group label; DOM order matches visual order; Enter/Space activates; at 200% zoom no category is clipped outside the narrow CSS viewport.
- **Motion:** background/ink transition uses micro timing; active compresses with transform. Reduced motion removes transform and preserves color/outline feedback.
- **Layout:** reel on narrow containers; cluster when space allows. The rail owns horizontal overflow only.

### Search and Discovery Surface

- **Discovery surface:** the header contains full-width search and category tags. Search, category selection, list, and markers share the same bounded server query.
- **Discovery selection:** results may show a thumbnail and clearly labelled straight-line distance when location is available. Detail adds optional media, contact, place information, directions, and a menu-information suggestion action. Failed media leaves text and actions usable.

- **Search rule:** normalize text with Unicode NFKC, lowercase Latin text, trim, and collapse whitespace. Every nonempty token must match a public place or menu field. The server returns a bounded page, and markers, the loaded count, and list/detail use that same result set.
- **Surface:** the desktop 352px pane and mobile bottom drawer are the same discovery surface in responsive forms. They render an announced result count, a labelled results list, and either a selected-place detail or a clear recovery state. The mobile drawer keeps its labelled two-state `aria-expanded` toggle and accepts a vertical direct-manipulation drag on that toggle only; content, close, and map controls do not begin a sheet drag.
- **Result hierarchy:** each populated result reads in decision order: place, available distance, matching menu, then category tags. Internal material stays private; the menu is never an unlabelled text fragment.
- **Accessibility:** a keyboard-operable result list is always the alternative to provider markers. Result count and successful search updates use a concise status announcement; opening detail moves focus to its title, and explicit Back/Close plus Escape restore the stable invoking control.

### Action Button

- **Structure:** native `button` → optional Lucide icon → stable label/status.
- **Variants:** primary, secondary, quiet/icon-only, destructive.
- **Spacing:** `--hm-space-2`/`--hm-space-4`; minimum 44×44px.
- **States:** default, hover, active, focus-visible, disabled, loading. Loading reserves the default label width and sets `aria-busy`; disabled uses the native attribute.
- **Accessibility:** icon-only controls require an accessible name; visual text is never replaced by an unlabeled glyph.
- **Motion:** 120ms press transform and 180ms tone change; reduced motion removes scaling.
- **Layout:** cluster; buttons do not resize between default/loading/error.

### NAVER Map Marker

- **Structure:** NAVER SDK `Marker` with `position`, `map`, `title`, `clickable`, and a product-owned SVG `icon` URL. It is still created, positioned, and destroyed exclusively by the provider adapter.
- **Data:** `position` is created directly from each published Supabase row's latitude and longitude.
- **Lifecycle:** place IDs retain native SDK marker instances across selection and result reordering. Only changed options update; filtering detaches removed IDs. Unmount and retries remove listeners and call `setMap(null)`.
- **Legacy variants:** grain orange, plant green, and mixed dark green. Each has a slightly larger selected asset that
  preserves the original category glyph, uses a brighter stop of its category color, and keeps the same
  ceramic outline weight as the resting pin. Selected markers receive the highest marker z-index without a
  ring or heavy border. Category meaning is exposed in the marker title and parallel list, so color never acts
  alone.
- **Discovery variants:** the labelled category assets above use 40×48 desktop geometry and a 3px ceramic outline. On mobile, the same asset paints at 36×43 inside a bottom-anchored 44×48 native marker target. Selection inverts the category glyph on a ceramic disk without changing its category or outline weight; the SDK z-index raises the selected marker.
- **Interaction:** selecting a marker opens the matching place detail and swaps only that marker to its
  category-preserving selected asset. The visible map also announces the number of displayed places.
- **Styling:** product CSS never positions or substitutes markers. SVG assets are static, provider-owned marker icons rather than CSS-positioned page elements.

### Alert

- **Structure:** status icon → heading/copy → optional recovery button.
- **Variants:** info and error.
- **Spacing:** `--hm-space-3`/`--hm-space-4`.
- **States:** default info, error, long Korean copy, unbroken URL stress.
- **Accessibility:** info uses `role="status"`; error uses `role="alert"`; icon is redundant/decorative; recovery control is keyboard reachable.
- **Motion:** none; urgency is content, not animation.
- **Layout:** stack; wraps in its own width with `overflow-wrap: anywhere`.

### Skeleton

- **Structure:** status container → fixed-dimension bars matching final content geometry.
- **Variants:** map detail loading.
- **Spacing:** mirrors content tokens.
- **States:** loading only; stable dimensions.
- **Accessibility:** one Korean loading label exposed through `role="status"`; decorative bars are hidden.
- **Motion:** opacity pulse only; reduced motion renders static bars.
- **Layout:** stack; never changes shell size when content resolves.

Loading, search, list, pagination, and detail requests show concise Korean status text with a subtle spinner and `aria-busy`. A failure remains an alert with retry; it never becomes a successful empty state. Late or aborted responses cannot replace the latest query. Detail keeps the known summary visible while additional detail loads. Reduced motion stops spinner rotation while retaining the status text.

### Empty State

- **Structure:** Lucide map/leaf glyph → short heading → recovery guidance/action.
- **Variants:** filter empty and unavailable map.
- **Spacing:** `--hm-space-4`/`--hm-space-6`.
- **States:** empty and error are distinct; never merge them into vague copy.
- **Accessibility:** heading and action communicate recovery without relying on illustration.
- **Motion:** none.
- **Layout:** centered stack inside detail region, never a card nested in another card.

### Responsive Detail Surface

- **Structure:** optional official photo → category chips → venue title + explicit close → address → representative menus → actions when available.
- **Information hierarchy:** the first screen answers `어디인지`, `어떤 메뉴 정보인지`, and `어떤 건강식 선택인지`. Price, source, matching, review status, evidence method/link, confirmation date, and validity date are never consumer-visible.
- **Media:** official store/brand media leads the card when verified. Its aspect ratio is reserved, alt text describes the scene, and failure removes the media region without showing a broken-image icon. No fake venue photo or generic stock photo fills the gap.
- **Variants:** mobile bottom sheet replacing the results tray and desktop compact inline-end overlay card that
  preserves the result/filter pane; same content anatomy and explicit Back-to-results path.
- **Spacing:** `--hm-space-4` mobile, `--hm-space-6` desktop.
- **States:** closed, opening/open, focus-visible close, loading, error, empty.
- **Accessibility:** the open surface moves focus to its title and remains a labelled region. Escape and explicit close dismiss it, and focus returns to a stable control. No drag-only or gesture-only control.
- **Motion:** mobile enters from bottom and desktop from inline-end using standard timing. Reduced motion uses an opacity-only substitution.
- **Layout:** the active tray/sheet owns its scroll below 768px; the desktop result pane and selected-place
  card each own only their bounded content. No hidden parallel result scroller, page scroll, map-shell scroll,
  or nested card shell is permitted. The mobile sheet and selected-place card use
  `--hm-radius-panel`.

### Discovery Result Drawer

- **Structure:** ceramic sheet → 44px native toggle/close row → preserved list or detail content. The row shows the result count or `메뉴 펼치기` / `접기`, with a chevron and a separate close action.
- **States:** collapsed peek (mobile default), expanded list, expanded detail, and collapsed detail. Desktop
  always renders the content as a fixed pane and hides the drawer control.
- **Control:** tap, Enter or Space toggles the sheet. A primary-pointer vertical intent on the existing toggle captures only after an 8px threshold, follows between the measured compact and expanded stops, then snaps to the nearest stop or the qualified release direction. It never dismisses the sheet; close, content scroll, map gestures, and a second pointer retain their own behavior.
- **Motion:** the full-height sheet stays mounted and moves only with `transform`. Direct manipulation disables the transition while following the pointer, then the existing `--hm-motion-standard` and `--hm-ease-out` settle the selected stop. Content visibility changes with the snap so collapsed controls cannot receive focus. Reduced motion settles state changes immediately.
- **Accessibility:** the toggle is at least 44px, reports `aria-expanded`, has state-specific Korean naming,
  and remains available at 200% zoom. All state changes are button accessible.
- **Scroll ownership:** only the expanded result/detail body scrolls. The toggle row stays
  fixed inside the sheet; the page and map never scroll behind it.

### Discovery Data Surface

- **Purpose:** browse the public discovery projection at `/`.
- **Structure:** compact brand/search/filter chrome → provider map with product SVG markers → one responsive result/detail surface. No internal status or review information is visible.
- **States:** result list, selected place, query/filter empty, map loading/error, and environment-disabled error. Empty and failure states remain distinct.
- **Actions:** search, category filters, marker/list selection, Back-to-results, place information, and directions. Prices and internal material remain absent.
- **Data:** public DTOs contain only consumer-facing facts. A category never implies medical suitability, current availability, or approval.
- **Accessibility:** the result count is an informational status; the list is the keyboard alternative to
  markers; selected detail receives focus; Korean place, menu, and address text reflows without widening the
  shell.

### Product Masthead

- **Structure:** botanical mark → product/context copy → compact public navigation → optional page action.
  The title remains the only level-one heading and the mark is decorative.
- **Navigation:** the map shell has no persistent policy or methodology links. Legal and methodology routes may remain addressable, but they do not compete with the primary discovery task.
- **Variants:** map uses the compact shell form with refresh; the discovery uses the same identity without internal
  version/status copy; editorial trust pages use the same link grammar with an explicit map return action.
- **Accessibility:** links and actions keep 44px targets, visible focus, and meaningful text at every width.
  On narrow screens the content wraps as a cluster without horizontal page overflow or hidden destinations.
- **Layout:** compact solid surface on editorial pages; inside the map shell the identity is integrated with the search region so it does not create a second full-width slab.

### Selection Criteria Page

- **Purpose:** explain what is listed, how evidence is checked, and what health tags do and do not mean.
- **Structure:** compact masthead/navigation → editorial introduction → three numbered criteria sections →
  scope note and map return action. Content follows the visitor's trust decision path rather than a generic
  marketing feature grid.
- **Copy:** factual and bounded. It never implies medical suitability, nutrition scoring, or real-time menu
  availability; freshness and branch-level evidence limits stay explicit.
- **Layout:** readable `--hm-copy-measure` column on the warm canvas, solid section dividers, and asymmetric
  numbered labels. It reflows at 375px without horizontal overflow.

### Lucide Icon

- Use only Lucide outline geometry at `--hm-icon-sm/md/lg`, `stroke-width: 2`, rounded line caps/joins, current color, no fill unless the original Lucide icon specifies it.
- Icons never substitute for visible labels when the action is unfamiliar. No emoji, mixed icon families, brand logos, or hand-drawn lookalikes.
- SVG is `aria-hidden="true"` when adjacent text names the action; icon-only buttons carry `aria-label`.

## 6. Motion & Interaction

| Token | Value | Usage |
| --- | --- | --- |
| `--hm-motion-press` | `120ms` | Press compression |
| `--hm-motion-micro` | `180ms` | Hover, focus-adjacent tone |
| `--hm-motion-standard` | `240ms` | Sheet/pane and state change |
| `--hm-motion-spinner` / `--hm-motion-skeleton` | `800ms` / `1200ms` | Continuous loading feedback only |
| `--hm-motion-reduced` | `0.01ms` | Reduced-motion substitution |
| `--hm-press-offset` | `1px` | Pressed-control spatial feedback |
| `--hm-spinner-turn` | `360deg` | One complete loading-spinner rotation |
| `--hm-ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Enter and direct manipulation release |
| `--hm-ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Tone and opacity transitions |

### State rendering tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--hm-disabled-opacity` | `0.52` | Disabled native controls |
| `--hm-skeleton-opacity-low` / `--hm-skeleton-opacity-high` | `0.48` / `0.9` | Loading pulse endpoints |
| `--hm-active-brightness` | `0.86` | Pressed action tone without geometry change |

- Motion communicates cause and state. No decoration-only entrance, shimmer travel, bounce, parallax, or hover on noninteractive content.
- Only `transform`, `opacity`, and `filter` animate. Layout dimensions remain stable.
- Press uses a tokenized brightness change without changing control geometry.
- The Discovery drawer has two transform-only stops: a 48px collapsed peek and a 72% expanded workspace, with selected-place previews capped at `min(264px, 42dvb)`. Its existing labelled button remains the keyboard control and the only drag start area. After vertical intent exceeds 8px it captures the primary pointer, follows the clamped measured range without a transition, and releases to the nearest or qualified-velocity stop. Cancel, lost capture, second pointer, selection, resize, and breakpoint changes restore the committed stop. The frame stays at the expanded height; a ResizeObserver measures the visible content-sized preview and moves the sheet/dock stack together. The map does not resize. No decorative grip is shown. Fixture-only map surfaces retain their own behavior.
- `prefers-reduced-motion: reduce` sets durations to `0.01ms`, removes transforms, and makes skeletons static. State changes remain visually distinct.

## 7. Depth & Surface

### Strategy: mixed tonal shift + restrained layered shadows

| Token | Value | Usage |
| --- | --- | --- |
| `--hm-shadow-control` | `0 1px 2px rgba(13, 52, 37, 0.08), 0 4px 12px rgba(13, 52, 37, 0.06)` | Floating filter/control |
| `--hm-shadow-detail` | `0 1px 1px rgba(13, 52, 37, 0.10), 0 12px 32px rgba(13, 52, 37, 0.12)` | Sheet and pane |

- Most hierarchy comes from solid oat/map/ceramic tonal shifts.
- Shadows are reserved for elements that actually float over the map. Cards never nest inside shadowed cards.
- No gradients, glass, blur, texture overlay, or decorative glow.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA: body/text contrast at least 4.5:1; large text and meaningful UI graphics at least 3:1.
- All pointer targets are at least 44×44 CSS px with at least 8px separation where adjacent.
- Every interactive element has visible `:focus-visible`; forced-colors mode preserves a system outline.
- Keyboard reachability follows visual order; no hover-only or drag-only action. The Discovery drawer has
  a labelled toggle, and detail behavior includes focus entry, Escape close, and focus restoration.
- Color is never the sole category/status cue. Text, selection weight, outline, and accessible names carry equivalent meaning.
- At 200% zoom and 375px width, the layout reflows without horizontal page overflow, clipping, or hidden actions.
- `prefers-reduced-motion` is honored for press, sheet, and skeleton behavior.
- Korean copy must not clip glyphs or orphan one-syllable endings due to fixed heights; long unbroken strings wrap anywhere.
- Loading, error, and empty regions reserve useful stable dimensions so state changes do not shift critical actions.

### Accepted debt

- No accessibility blocker is accepted. Any Critical or Major accessibility finding blocks release.
- The internal Discovery desktop detail currently replaces the result list inside the 352px pane. Preserving
  list/filter comparison context with a map-side detail card is accepted MVP usability debt and remains the
  next desktop interaction task.

### Current boundary and roadmap

The current experience uses public categories and search without fabricating nutrition tags or surfacing internal material. Public results and detail show the matching menu; availability remains a user decision. Future catalog changes must preserve these consumer, accessibility, and data-boundary rules.

- Place heading navigation: restaurant titles own a full row. Desktop uses a separate toolbar above them; mobile uses a labelled chevron toggle and close icon in the drawer toolbar. Keep content-sized previews and 44px actions.
