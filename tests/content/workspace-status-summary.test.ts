// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
// @ts-expect-error Shared browser fixture is plain JavaScript.
import { workspaceFixtureHtml } from "../../harness/workspace-fixture.mjs";

describe("class-list section status colors", () => {
  let workspace: PlannerWorkspace;
  let adapter: MyUclaPlannerAdapter;
  let course: HTMLElement;
  let rows: HTMLTableRowElement[];
  const mount = () => workspace.reconcile(document, adapter.inspectContract().courses);
  const statuses = () => [...course.querySelectorAll<HTMLElement>('.pl-workspace-course-summary [data-pl-summary-field="2"]')];

  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(workspaceFixtureHtml(), "text/html").body.innerHTML;
    workspace = new PlannerWorkspace(); adapter = new MyUclaPlannerAdapter(document);
    course = adapter.inspectContract().courses[0].node;
    rows = [...course.querySelector<HTMLTableElement>("table.coursetable")!.rows]
      .filter(row => row.cells.length === 9 && row.cells[0].tagName === "TD");
  });
  afterEach(() => workspace.restore());

  it.each([
    ["Enrolled: 1 of 80 Left", "enrolled"],
    ["Enrolled: 0 of 3 Taken", "enrolled"],
    ["Open: 1 of 80 Left", "open"],
    ["Waitlisted: 0 of 3 Taken", "waitlist"],
    ["Waitlisted Class Full (3)", "waitlist"],
    ["Closed: 0 of 80 Left", "closed"],
    ["Closed Class Full (80)", "closed"]
  ])("preserves %s and assigns the same status tone after redraw", (text, tone) => {
    rows[0].cells[2].textContent = text;
    mount(); mount();
    expect(statuses()[0].textContent).toBe(text);
    expect(statuses()[0].dataset.plStatusTone).toBe(tone);
    expect(rows[0].cells[2].textContent).toBe(text);
  });

  it("keeps lecture/discussion wording, counts and original markup while assigning each its own tone", () => {
    rows[0].cells[2].innerHTML = '<i class="icon-unlock" style="color:green"></i>Open<br>1 of 80 Left';
    rows[1].cells[2].innerHTML = '<i class="icon-lock" style="color:orange"></i>Waitlist<br>0 of 3 Taken';
    const cells = rows.map(row => row.cells[2]);
    const native = cells.map(cell => ({ parent: cell.parentElement, html: cell.innerHTML }));
    mount(); mount();
    expect(statuses().map(node => [node.textContent, node.dataset.plStatusTone])).toEqual([
      ["Open 1 of 80 Left", "open"], ["Waitlist 0 of 3 Taken", "waitlist"]
    ]);
    cells.forEach((cell, index) => {
      expect(cell.parentElement).toBe(native[index].parent);
      expect(cell.innerHTML).toBe(native[index].html);
    });
    expect(course.querySelectorAll(".pl-workspace-course-summary")).toHaveLength(1);
    expect(workspace.needsReconcile(document)).toBe(false);
  });

  it("refreshes a tone when native content changes and leaves unfamiliar or contradictory statuses neutral", () => {
    rows[0].cells[2].textContent = "Enrolled Class Full (40)";
    rows[1].cells[2].textContent = "Closed Class Full (40)";
    mount();
    expect(statuses().map(node => node.dataset.plStatusTone)).toEqual(["enrolled", "closed"]);
    rows[0].cells[2].textContent = "Enrolled Pending";
    rows[1].cells[2].textContent = "Open: 81 of 80 Left";
    expect(workspace.needsReconcile(document)).toBe(true); mount();
    expect(statuses().map(node => [node.textContent, node.dataset.plStatusTone])).toEqual([
      ["Enrolled Pending", undefined], ["Open: 81 of 80 Left", undefined]
    ]);
    workspace.restore();
    expect(course.querySelector(".pl-workspace-course-summary")).toBeNull();
    expect(rows[0].cells[2].textContent).toBe("Enrolled Pending");
    expect(rows[1].cells[2].textContent).toBe("Open: 81 of 80 Left");
  });

  it("ignores explicit native hidden section rows and stale hidden status text", () => {
    rows[0].cells[2].innerHTML = '<span hidden>Enrolled</span><span class="hidden">Closed</span><span style="display:none">Waitlist</span>Open<br>2 of 30 Left';
    rows[1].classList.add("hidden"); mount();
    expect(statuses().map(node => [node.textContent, node.dataset.plStatusTone])).toEqual([["Open 2 of 30 Left", "open"]]);
    rows[1].classList.remove("hidden"); rows[1].cells[2].textContent = "Closed";
    expect(workspace.needsReconcile(document)).toBe(true); mount();
    expect(statuses().map(node => node.dataset.plStatusTone)).toEqual(["open", "closed"]);
    rows[0].hidden = true; expect(workspace.needsReconcile(document)).toBe(true); mount();
    expect(statuses().map(node => node.dataset.plStatusTone)).toEqual(["closed"]);
  });
});
