<div align="center">

<img src="public/icons/icon-128.png" width="72" alt="">

# Better MyUCLA

**Browse courses, compare sections and keep your schedule in view.**

An unofficial Chrome extension that rearranges the existing MyUCLA Class Planner.

[Download v0.18.2](https://github.com/comet-ctrl/better-myucla-planner/releases/tag/v0.18.2) ·
[Source](https://github.com/comet-ctrl/better-myucla-planner/tree/v0.18.2) ·
[Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md)

</div>

<img src="docs/images/multiple-details-v0.17.11.png" width="100%" alt="Fictional example: multiple course details open beside the class list and weekly schedule in v0.17.11.">

*Fictional courses shown in the v0.17.11 layout, before draggable and floating
panels. The extension works inside Class Planner; no separate planner website
or account is required.*

**Current release: v0.18.2, docking preview prerelease.** The redesigned layout is
opt-in, and the extension is not yet on the Chrome Web Store. This fork builds
on [Astro-wen/better-myucla-planner](https://github.com/Astro-wen/better-myucla-planner).
It is not made by, endorsed by, or affiliated with UCLA.

**Development version: v0.18.6 (unreleased).** Panel arrangements are now saved
locally across reopening Class Planner. **Default layout** in navigation resets
the arrangement. Dragging follows the pointer with updates grouped per animation
frame; native title buttons fit their labels so blank header space is grabbable.
Docked panels fill the workspace when the center area is unused; reopening a
module restores room for it. The schedule uses one header row when its controls
fit; sidebar collapse keeps panels aligned, and single-course Details avoids
duplicate close controls. The published v0.18.2 archive remains unchanged.

## Install or update

**New in v0.18.2:** drag a blank part of a panel's header, its dotted grip or its
navigation tab. Move toward the left or right side of the workspace, or over
the main panel's header. A shaded preview shows the full area the panel will
occupy when you release it. The drop regions are generous, and there is no
bottom dock. Drop elsewhere to float the panel inside Class Planner.
Header buttons, links and Help continue to work normally.

Resize floating panels from their lower-right
corner, and resize docked regions with their dividers. Double-click a grip to
float/return, or right-click it for placement choices and **Reset layout**.
The left navigation can collapse with its chevron or by dragging its edge.
The actual panel follows your pointer while dragging; **Escape** cancels the
move. Click the small **×** in a panel header to hide it. Reopen modules and
the calendar from navigation, or reopen the details panel from any course's
**Details** button. Hidden panels retain their controls and selections; hiding
the details panel retains its expanded courses. **Reset layout** reveals panels.
In the published v0.18.2, layout choices live in page memory and reset on reload.
In development v0.18.4, panel placement, size, hidden state and navigation choices
are saved in this browser profile. **Default layout** restores the starting
workspace and remembers that reset; **Original layout** returns to UCLA's native
presentation. Neither action changes your plan or course selections.

1. Download `better-myucla-v0.18.2.zip` from the [prerelease](https://github.com/comet-ctrl/better-myucla-planner/releases/tag/v0.18.2).
2. Extract it into a folder you will keep. The ZIP contains a `dist` folder.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
   and select that `dist` folder.
4. Open or refresh [MyUCLA Class Planner](https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx).
5. Open the extension popup and enable **Tidy up MyUCLA's own layout** to use the workspace.

**Updating an existing installation:** replace the contents of the `dist` folder
Chrome already loads, click **Reload** on the extension's card, then refresh
Class Planner. The folder's name may contain an older version; check the version
in the extension popup or Chrome's extension card.

Use **Original layout** in the workspace navigation to return to UCLA's layout,
or turn off the Tidy option. [v0.18.1](https://github.com/comet-ctrl/better-myucla-planner/releases/tag/v0.18.1)
remains available for rollback; v0.16.0 is the pre-redesign rollback point.

## Using the workspace

By default, named navigation sits on the left, the active module in the center,
and UCLA's original weekly calendar on the right. Drag, dock, float or hide
panels to arrange the workspace. Long lists and details scroll within their own
areas. UCLA's masthead and top navigation remain intact and can scroll away normally.

| Area | What you can do |
| --- | --- |
| **My classes** | Read meeting times and the original status for each lecture/discussion. Open **Details** on several classes at once; each has its own Close button. **Class actions** reveals reorder and note tools. |
| **Find classes** | Use UCLA's original search modes and required fields. Browse already-loaded courses beside their section details, with rooms and instructors visible. Filter loaded course headings locally. |
| **Weekly schedule** | Keep the native calendar visible while browsing. Click **Widen**, drag the divider, or use its arrow keys to make it larger. **Restore width** returns to your prior size; double-clicking the divider resets it. Native Grid size controls adjust the time-row height. |
| **Optimizer, Study list, Personal entries** | Reach each complete native module from a named navigation button. These retain UCLA's controls and loading behavior. See the Optimizer limitation below. |
| **Plan actions** | Access the original Rename, New plan, Save a copy, Delete, Load, Print and About controls where UCLA makes them available. |
| **Information & help** | Open the original sidebar widgets, including enrollment appointments, planner links and help. |

Statuses stay separate for each section: **green** for Open/Enrolled, **amber**
for Waitlist, and **red** for Closed. Original wording and counts remain intact;
unrecognized statuses stay neutral. The native detailed view retains its icons
and wording.

Below 1280px, navigation becomes a horizontal row. Below 1100px, a persistent
**Schedule** button switches between the calendar and browsing while retaining
their positions. **Compact header / Show header** scrolls the original banner
away or back; that preference is saved locally across terms and reloads.

### Multiple course details

Opening another class keeps existing Details open in a shared scrolling area.
Close a course with its **×**, its Details button, or **Escape** while using that
course's details. Keyboard focus returns to the corresponding Details button.
Rooms, instructors and native section actions stay available; final-exam notes
have a separate disclosure.

Open courses survive native content updates within the same plan. v0.17.11 fixes
a display bug that closed Details after such an update and could hide the next
native action panel. Switching plans or quarters clears obsolete details.
Open course details remain in page memory and reset on a full page reload.
The development version remembers panel sizing separately, without saving course
identifiers in the layout preference.

### Search and section selection

<img src="site/workspace-preview.png" width="100%" alt="Fictional Find classes results beside the native weekly calendar in v0.17.11, before draggable panels.">

*This screenshot shows the older v0.17.11 layout with fictional courses.*

The extension organizes results MyUCLA has already loaded. A single course opens
directly; multiple results have a course index beside the selected preview.
If a checked section is in another preview, a selection reminder lets you return
to it without changing the checkbox.

UCLA's required autocomplete selections, search submission and loading screens
still apply. This release does not fetch an entire catalog, search automatically,
check prerequisites, interpret DARS or generate schedules with AI.

### Reorder, save and notes

- Drag a class, move it to the top, or choose a numbered position. The arrangement
  stays local until you press **Save to MyUCLA**. One explicit Save authorizes
  the batch of native moves.
- Save replays adjacent moves through validated native up/down buttons in a
  same-origin frame, then refreshes the visible page. MyUCLA may return partial
  updates or full page loads. The extension checks the plan, controls and expected
  order before continuing. If saving is unavailable before any moves, the local
  arrangement remains available; interruption after moves reloads MyUCLA's
  current order, which may be partly changed.
- Use Undo before saving. An unsaved arrangement can be recovered locally; it
  expires after 24 hours and is removed when saved or discarded.
- Add a local class note of up to 24 characters. Notes remain in this browser
  and do not sync to MyUCLA.
- Filter your plan, inspect existing conflict information and open **Final exam
  week** from the plan toolbar's overflow menu.

## Privacy and native actions

The extension runs only on:

```text
https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx
```

`storage` is its only extension permission. There is no server, analytics,
telemetry or background seat polling. It reads information already rendered on
Class Planner and retains native controls, handlers and form association.
Unknown structures keep their native presentation or disable the affected
enhancement.

The extension **does not automate enrollment, dropping, exchanges or waitlisting**.
Those manual actions remain UCLA's. It does not read passwords, cookies, tokens,
UIDs, grades, DARS or Duo data. Saving a reordered plan uses UCLA's own requests;
the extension does not construct a separate API request.

Local storage holds notes, existing view preferences, the compact-header choice
and limited recovery state. Development v0.18.4 also saves workspace geometry
and public module choices. Open course Details remain in memory. The optional
**Stay signed in while reading** feature calls
UCLA's existing session-extension function during visible, focused activity,
subject to a user-selected time cap; it does not keep an unattended session alive
or bypass sign-in. See [PRIVACY.md](PRIVACY.md) for the complete boundaries.

## Verification and known limitations

For development v0.18.6, typecheck, the production build and **419 unit tests**
passed. Production browser checks cover saved layouts across fresh documents,
Default reset, interrupted/cancelled gestures, minimum widths, mobile bounds and
native control preservation. Live v0.18.4 checks confirmed saved custom layouts
and Default reset across refreshes. Automatic-fill browser checks passed at
2048/1440px, including one or two occupied panels, preview/drop geometry and
remembered divider sizes. Live v0.18.5 checks confirmed the calendar fills the
workspace after closing My classes, retains that layout after refresh and
restores the previous split when My classes reopens. The v0.18.6 browser checks
cover compact schedule controls, non-overlapping native click targets, sidebar
collapse, floating geometry and individual/group Details closes at 2048/1440/390px.
Live v0.18.6 checks confirmed the compact row, clean sidebar, same-frame dock
alignment after collapse, single-course close and reachable native display
controls. Published v0.18.2 verification is listed below.

For v0.18.2, typecheck, the production build and **389 unit tests** passed. Browser fixtures verify
docking preview geometry at 2048, 1440 and 390px, including hidden and floating
Details. Broader workspace checks passed at nine widths; native Details actions,
Plan Actions and module controls passed at four viewports each. Details checks
include immediate focus after scrolling and four native redraw forms. Tests use invented course data and intercept
requests; current release verification is recorded in [HANDOFF.md](HANDOFF.md).

- The missing-response regression was reproduced on v0.17.10 and corrected in
  the fictional native-action tests. **Actual enrollment completion has not been
  tested**. Live schedule float, close/reopen and left/right docking checks
  passed on v0.18.2; blank-header dragging was also verified live on v0.18.3.
- The native Optimizer has previously remained collapsed in both the redesigned
  and original layouts during a live check. Its backend response remains an
  unresolved limitation; fixture success does not establish that it works live.
- Course availability reflects what MyUCLA last rendered. There is no independent
  refresh or open-seat monitor.
- In the published v0.18.2, layout widths reset on reload; development v0.18.4
  remembers them. Expanded course Details still reset. Preferences and notes
  stay local to this browser profile, not across devices.
- MyUCLA markup can change. The extension requires recognized structures rather
  than guessing which native controls to use.

## Build and test

Use Node.js 22 or newer and npm, then:

```bash
npm ci
npm run typecheck
npm test -- --run
npm run build
```

The build bundles four entry points with esbuild and copies `public/` into
`dist/`. Build artifacts are included in release ZIPs, not committed. Load the
generated `dist` folder as an unpacked extension. After changing source, rebuild,
reload the extension and refresh Class Planner.

Browser tests require Playwright Chromium (`npx playwright install chromium`),
or an installed Chromium executable specified by `BETTER_MYUCLA_CHROMIUM`.

| Command | Coverage |
| --- | --- |
| `node harness/verify-workspace.mjs` | Responsive workspace, modules, resizing, native identity, redraws, printing, restoration and drag behavior. |
| `npm run test:panel-layout` | Header/grip/navigation dragging, full destination previews, docking, floating, resizing, close/reopen, cancellation and retained native controls. |
| `npm run test:details` | Native section layout, metadata, controls and hidden states. |
| `npm run test:course-detail-actions` | Multiple Details, native response visibility/focus after redraw, touch scrolling and context changes. |
| `npm run test:search-layout` / `npm run test:result-layout` | Native search fields and loaded course results. |
| `npm run test:plan-actions` / `npm run test:module-controls` | Original plan actions and module controls on fictional pages. |
| `npm run test:empty-plan` / `npm run test:optimizer` | Empty-plan and native Optimizer presentation fixtures. |
| `npm run test:course-controls` / `npm run test:finals-controls` | Reorder/note/recovery controls and the final-exam panel. |
| `npm run preview:build` / `npm run preview:verify` | Generate and check a preview using the production presentation code and built stylesheet. |

Never copy a real plan or account data into fixtures, screenshots or commits.

### Preview without a MyUCLA account

After `npm run build`, run `npm run preview:build` and open
`site/workspace-preview.html` in Chrome. It uses fictional courses and the same
presentation modules as the extension. The generator checks shared source against
the production source map and records the build hashes.

Searches in this preview use three local sample courses. Panel layout controls
are interactive. Account actions, saving, notes, course reordering and session
features are unavailable, and secondary modules are approximations. The preview
cannot read or change a MyUCLA account.
`public/demo.html` is a separate reordering fixture and does not represent the
current workspace.

The v0.18.2 source is tagged **`v0.18.2`** on **`flexible-panels`** in this fork.
The GitHub Pages workflow publishes `site/` when its files change on `main`, so
the hosted preview may lag this branch. Preview content is fictional; install
the extension from the versioned release above to use the workspace inside
MyUCLA Class Planner.

## Project documentation

| Topic | Reference |
| --- | --- |
| Current implementation, verification and handoff | [HANDOFF.md](HANDOFF.md) |
| Native DOM and button contracts | [docs/MYUCLA_CONTRACT.md](docs/MYUCLA_CONTRACT.md) |
| Version history | [CHANGELOG.md](CHANGELOG.md) |
| Data and storage boundaries | [PRIVACY.md](PRIVACY.md) |
| Agent rules and contribution guidance | [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md) |
| Design history and roadmap (some entries describe older versions) | [docs/UI_DIRECTION.md](docs/UI_DIRECTION.md), [docs/ROADMAP.md](docs/ROADMAP.md) |

## License

MIT. See [LICENSE](LICENSE).
