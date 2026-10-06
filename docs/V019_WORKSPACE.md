# v0.19 workspace

Development branch: `v0.19-workspace`. Saved baseline: `flexible-panels`, commit
`1337c94` (v0.18.6). v0.19.1 is published; v0.19.4 adds header/calendar polish,
including the v0.19.3 layout presets and v0.19.2 tab-splitting fix.

## Problem

In the previous layout, opening Find classes while Schedule and My classes
occupied opposite edges could create a third, approximately 300px-wide pane.
Search and native sections then became difficult to read. Sidebar selection,
closing and floating also behaved like independent panels rather than familiar
tabs within a workspace.

## Implemented in v0.19

- My classes and Find classes share a browsing group by default; Schedule has
  the other pane. Other native modules open as tabs through named navigation.
- One tab is active in each group. Switching retains native controls, their
  values and handlers, and scroll positions. Closed tabs can be reopened.
- A center drop merges a tab into a group; a permitted edge drop splits it.
  Preview and commit use the same operation. At most two docked groups display.
- v0.19.2 fixes splitting a tab toward its own occupied edge, preserves the
  remaining group as a unit, and reserves strip drops for grouping/reordering.
  Wider edge targets and transient Split/Group labels clarify the destination.
- v0.19.3 adds bottom-left Settings with diagrammed One pane, Balanced, Browse
  wide, Schedule wide and Schedule on the left presets. The chosen preset is
  saved in the existing layout preference and scales with the viewport.
  Custom divider sizing clears the preset; Escape during resizing restores it.
  The picker supports light/dark appearance, keyboard access and dismissal.
- Minimum useful widths prevent cramped splits. Narrow screens display one
  group at a time without overwriting the saved desktop arrangement.
- Floating remains an in-page singleton panel. Details keeps the existing
  multiple-course projection and its original course-row ancestry.
- Save public tab membership, order and active choices in
  `plannerLift.workspace.v2`. Read legacy v1 when necessary and preserve the
  old key for rollback. No course, account, search or enrollment data is saved.
- Default layout and Original layout retain their existing meanings. Native
  UCLA masthead, plan actions, statuses and enrollment workflows are unchanged.
- A denser course index and section layout keep 14px body text, visible rooms
  and instructors, original per-section statuses and bounded action targets.
- Multiple open details have a compact jump row. It scrolls the existing local
  stack and supports arrow/Home/End keys; it does not close other courses.
  Selected-course presentation and focused jump survive recognized redraws.
- Calendar labels, borders and keyboard focus receive restrained styling;
  native meeting geometry, colors and controls remain authoritative.
- v0.19.4 preserves transparent native day overlays so dark calendar hour rules
  remain visible. Notice links keep inline backgrounds and readable icons.
- A top-edge grip temporarily reveals UCLA's original menu without rewriting
  the compact-header preference. The outer scrollbar is hidden while local
  panels retain theirs. Keyboard access, Show header, reduced motion and print
  remain available.

## Design draft and later work

![Fictional v0.19 design exploration, including later course and calendar refinements](images/v019-design-draft.png)

Open `harness/v019-design-draft.html` locally for an interactive fictional draft.
It explores the course index, details and calendar hierarchy. The implementation
adapts that hierarchy to native MyUCLA controls and their exact DOM. It is not a replacement
website, a live MyUCLA page or a promise that the first milestone matches every
pixel. Its masthead is schematic; the extension must retain UCLA's masthead.

Very narrow screens retain stacked native content and local scrolling. Further
mobile simplification can follow live feedback; the draft is a visual direction,
not a pixel-identical screenshot of the extension.

## Acceptance checks

- Switch Classes/Find without adding a third column or moving Schedule.
- Close active and inactive tabs, reopen, and retain remembered membership.
- Merge, split, float, resize and cancel; verify preview matches the committed
  bounds and cancellation does not save a transient layout.
- Restore in a fresh document and across native partial redraws. Restoration
  and Default layout must never invoke native disclosures or account actions.
- Check 2048, 1440, 1280, 960 and 390px, including collapsed navigation, local
  scrolling, keyboard selection, details focus and original control identity.
- Verify native status markup, original course-row parents, form association,
  calendar meeting geometry, printing and Original layout restoration.
- Run typecheck, unit tests, production build and fictional browser fixtures.
  Inspect the installed page separately before claiming live verification.

v0.19.1 adds saved System / Light / Dark appearance, with screen-only dark styles
and a themed extension popup. UCLA navigation and native event colors stay intact.
v0.19.4 is installed in the user's existing unpacked folder; all 20 files are
verified by SHA-256, with v0.19.3 backed up. Native header/calendar structure was
inspected live; checking the loaded new build awaits extension reload.

Typecheck, production build and 552 unit tests pass. Ten production header cases
cover light/dark appearance, nested native web components, hover/keyboard/touch,
safe click timing, preference isolation, both Escape regressions, print and
restoration. Five native-layered calendar cases verify painted gridline pixels,
meeting geometry/colors and redraws. Seven earlier Settings browser cases
cover saved presets, native identity/selections, keyboard dismissal/focus, print,
responsive geometry and restoration in light/dark appearance. Existing group
fixtures, 39 split regressions and the rebuilt preview also pass.
Production-browser fixtures
cover groups, course details/actions, native modules and calendar presentation,
including widths from 390 to 2048px and short 390x600 windows. These fixtures use
fictional data and do not establish live enrollment behavior.
Dark appearance checks additionally verify contrast, system changes, original
control identity, calendar geometry/colors, popup keyboard access and restoration
at 2048, 1440, 1280 and 390px. See HANDOFF.md for current release evidence.
