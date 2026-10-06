/** Native percentage sizing with fictional meetings, including collisions. */
import { fixtureHtml } from "./fixture.mjs";

export function calendarFixtureHtml(count = 5) {
  const meeting = (day, slot, left, width, border, top, height) =>
    `<div class="planneritembox${height < 40 ? " smallitem" : ""}" style="background-color:${slot % 2 ? "#f6ecf9" : "#ecf8f9"};border:${border};top:${top}px;height:${height}px;left:${left};width:${width}">DEMO ${day * 10 + slot + 101}<br class="hide-small"><span class="hide-above-small"> · </span>Lec 1<br class="hide-small"><span class="hide-above-small"> · </span>Example Building ${slot + 10}</div>`;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const grid = `<div id="gridDiv" class="sgChecked">
    <div class="fixture-weekdays">${days.map(day => `<div>${day}</div>`).join("")}</div>
    <div class="fixture-weekbody"><div class="hourbox">8<sup>AM</sup></div>${days.map((_, day) => `<div class="timebox">
      ${meeting(day, 0, "0%", "calc(50% - 3px)", "solid 1px #41b5eb", 0, 38)}
      ${meeting(day, 1, "50%", "calc(50% - 7px)", "double 3px #4a2ff1", 20, 55)}
      ${meeting(day, 2, "0%", "calc(100% - 3px)", "solid 1px #41b5eb", 90, 38)}
      ${meeting(day, 3, "0%", "calc(100% - 7px)", "double 3px #4a2ff1", 140, 35)}
    </div>`).join("")}</div>
  </div>`;
  const fixture = fixtureHtml(count)
    .replace("box-sizing:border-box; border:1px solid #9ba7c4", "box-sizing:content-box; border:1px solid #9ba7c4")
    .replace(/<div id="gridDiv" class="sgChecked">[\s\S]*?<\/div><\/div>\s*<div id="ctl00_MainContent_classPlanPanel">/, `${grid}</div><div id="ctl00_MainContent_classPlanPanel">`);
  return fixture.replace("</style>", `
    #gridDiv { display:block; }
    .fixture-weekdays { display:flex; margin-left:40px; background:#24528f; color:#fff; }
    .fixture-weekdays > div { flex:1; text-align:center; padding:4px 0; }
    .fixture-weekbody { display:flex; }
    .hourbox { flex:0 0 40px; }
    .timebox { flex:1; width:auto; min-width:0; height:200px; }
  </style>`);
}

/** Native calendar layering with invented meetings. The actual calendar draws
 * full-width hour rows first, then transparent full-height weekday columns.
 * Keep it separate from the historical flex fixture used by older suites. */
export function nativeLayeredCalendarMarkup(hourHeight = 48) {
  const hours = 12, totalHeight = hours * hourHeight;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const rows = Array.from({ length: hours }, (_, index) =>
    `<div class="hourbox" style="top:${index * hourHeight}px;height:${hourHeight}px">${(index + 7) % 12 + 1}<sup>${index < 4 ? 'AM' : 'PM'}</sup></div>`).join('');
  const columns = days.map((day, index) => `<div class="timebox" style="left:${5 + index * 19}%;width:19%;height:${totalHeight}px">
    <div class="planneritembox smallitem" tabindex="0" role="button" style="background-color:#ecf8f9;border:solid 1px #41b5eb;top:${hourHeight / 2}px;height:${hourHeight * .8}px;left:0%;width:calc(100% - 3px)">EXAMPLE ${101 + index}<br class="hide-small"><span class="hide-above-small"> · </span>Lec 1<br class="hide-small"><span class="hide-above-small"> · </span>Example Hall ${index + 10}</div>
    <div class="planneritembox" tabindex="0" role="button" style="background-color:#f6ecf9;border:double 3px #4a2ff1;top:${hourHeight * 2}px;height:${hourHeight * 1.4}px;left:0%;width:calc(50% - 7px)">EXAMPLE ${201 + index}<br class="hide-small"><span class="hide-above-small"> · </span>Lec 1<br class="hide-small"><span class="hide-above-small"> · </span>Example Hall ${index + 20}</div>
  </div>`).join('');
  return {
    html: `<div id="ctl00_MainContent_weekGrid"><div class="PlannerGridBox"><table><tbody><tr class="primary light headerBar classPlanner"><td></td>${days.map(day => `<td>${day}</td>`).join('')}</tr></tbody></table><div class="daybox" style="height:${totalHeight}px">${rows}${columns}</div></div></div>`,
    css: `#ctl00_MainContent_weekGrid .PlannerGridBox { width:100%; }
      #ctl00_MainContent_weekGrid .PlannerGridBox > table { width:100%;table-layout:fixed;border-collapse:collapse; }
      #ctl00_MainContent_weekGrid .PlannerGridBox > table td { width:19%;text-align:center;background:#24528f;color:white;line-height:24px;padding:0; }
      #ctl00_MainContent_weekGrid .PlannerGridBox > table td:first-child { width:5%; }
      #ctl00_MainContent_weekGrid .daybox { position:relative;width:100%; }
      #ctl00_MainContent_weekGrid .daybox > .hourbox { position:absolute;left:0;width:100%;box-sizing:border-box;border-top:1px solid #ddd;background-color:white;color:#4e4e4e;font-size:11px; }
      #ctl00_MainContent_weekGrid .daybox > .timebox { position:absolute;top:0;box-sizing:border-box;border-left:1px solid #ccc;background-color:transparent; }
      #ctl00_MainContent_weekGrid .planneritembox { position:absolute;box-sizing:content-box; }`,
  };
}
