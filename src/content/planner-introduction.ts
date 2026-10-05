const OWNED = "data-planner-lift-owned";
const TERM = "ctl00_MainContent_termSessionChooser_TermChooser";
interface WorkspaceInformation {
  navigation: HTMLElement;
  onInformation: () => void;
  onCloseInformation: () => void;
}
interface Introduction {
  doc: Document; layout: HTMLElement; title: HTMLElement; description: HTMLElement; text: HTMLElement;
  anchor: Comment; about: HTMLDetailsElement; term: HTMLElement; label: HTMLLabelElement;
  sidebar: HTMLElement; header: HTMLButtonElement; info: HTMLButtonElement; close: HTMLButtonElement; notices: HTMLElement[];
  sidebarHadClass: boolean; sidebarHadStyle: boolean; layoutHadClass: boolean; noticeHadClass: boolean[];
  focus: (event: FocusEvent) => void;
  workspace?: WorkspaceInformation;
  beforePrint: () => void; afterPrint: () => void;
}

/** Compact only the recorded planner introduction; never touch UCLA's header. */
export class PlannerIntroduction {
  private state: Introduction | null = null;
  private compactHeader = false;
  private saveFailed = false;
  private saveSequence = 0;
  private pendingSave: Promise<void> = Promise.resolve();

  constructor(private readonly onHeaderChange: (compact: boolean) => void | Promise<void> = () => {}) {}

  setHeaderCompact(compact: boolean): void {
    this.compactHeader = compact; this.positionHeader(); this.positionInfo();
  }

  isHeaderCompact(): boolean { return this.compactHeader; }

  private saveChoice(compact: boolean): void {
    const sequence = ++this.saveSequence; this.saveFailed = false;
    this.pendingSave = this.pendingSave.catch(() => {}).then(() => this.onHeaderChange(compact));
    this.pendingSave.then(() => {
      if (sequence === this.saveSequence) { this.saveFailed = false; this.positionInfo(); }
    }).catch(() => {
      if (sequence === this.saveSequence) { this.saveFailed = true; this.positionInfo(); }
    });
  }

  needsRefresh(doc: Document): boolean {
    const s = this.state;
    return !!s && (doc.getElementById("layoutContentArea") !== s.layout ||
      doc.getElementById("div_page_title_section2") !== s.description ||
      doc.getElementById("titleText") !== s.title || !s.header.isConnected ||
      doc.getElementById("page_title_text") !== s.text || !s.info.isConnected ||
      !s.sidebar.isConnected || doc.getElementById(TERM)?.parentElement !== s.label.parentElement);
  }

  mount(doc: Document, toolbar: HTMLElement, onLayout: () => void, workspace?: WorkspaceInformation): boolean {
    if (this.state) return true;
    const layout = doc.getElementById("layoutContentArea"), title = doc.getElementById("titleText");
    const description = doc.getElementById("div_page_title_section2"), text = doc.getElementById("page_title_text");
    const main = doc.getElementById("main-content"), term = doc.getElementById("ctl00_MainContent_termSessionChooser");
    const select = doc.getElementById(TERM) as HTMLSelectElement | null;
    const columns = main?.parentElement, sidebars = columns?.querySelectorAll<HTMLElement>(":scope > right-sidebar");
    const sidebar = sidebars?.length === 1 ? sidebars[0] : null;
    if (!main || !layout?.matches("section#layoutContentArea") || title?.parentElement !== layout || title.tagName !== "H2" ||
      title.textContent?.trim() !== "Class Planner" || description?.parentElement !== layout ||
      description.children.length !== 1 || text?.parentElement !== description || text.tagName !== "DIV" ||
      text.querySelector("input,select,button,textarea,script,iframe") || columns?.parentElement !== layout ||
      !columns.matches("layout-columnwrapper.col-2MR") || !sidebar || !term || term.parentElement !== main ||
      term.children.length !== 2 || !term.children[0].matches("div.term_display") ||
      !term.children[1].matches("div.term") || select?.tagName !== "SELECT" ||
      select.parentElement !== term.children[1] || select.form !== doc.getElementById("aspnetForm") ||
      term.querySelectorAll("input,select,button,textarea").length !== 1) return false;

    const owned = <T extends HTMLElement>(e: T, cls: string): T => {
      e.className = cls; e.setAttribute(OWNED, "true"); return e;
    };
    const anchor = doc.createComment("planner-lift-introduction"); text.before(anchor);
    // This wrapper contains native text/links and deliberately is not owned.
    const about = doc.createElement("details"); about.className = "pl-intro-about";
    const summary = owned(doc.createElement("summary"), ""); summary.textContent = "About this planner";
    about.append(summary, text); description.append(about);
    about.addEventListener("toggle", onLayout);
    const label = owned(doc.createElement("label"), "pl-intro-term-label"); label.htmlFor = TERM; label.textContent = "Term";
    select.before(label);
    const header = owned(doc.createElement("button"), "pl-intro-header-toggle"); header.type = "button";
    toolbar.append(header);
    const info = owned(doc.createElement("button"), "pl-intro-info"); info.type = "button";
    info.textContent = workspace ? "Information & help" : "Links & help"; info.setAttribute("aria-expanded", "false");
    info.title = "Planner links, enrollment appointments and help";
    if(workspace){info.dataset.plModule="information";info.setAttribute("aria-pressed","false");workspace.navigation.prepend(info);}else toolbar.append(info);
    const close = owned(doc.createElement("button"), "pl-intro-info-close"); close.type = "button";
    close.textContent = "×"; close.setAttribute("aria-label", "Close links and help"); sidebar.prepend(close);
    const notices = [...main.children].filter((e): e is HTMLElement => e instanceof HTMLElement &&
      e.tagName === "DIV" && !e.id && !e.className && !e.querySelector("input,select,button,a,textarea,script,iframe") &&
      [...e.children].every(c => ["SPAN", "STRONG", "BR"].includes(c.tagName)));
    const noticeHadClass = notices.map(e => e.hasAttribute("class"));
    const sidebarHadClass = sidebar.hasAttribute("class"), sidebarHadStyle = sidebar.hasAttribute("style"), layoutHadClass = layout.hasAttribute("class");
    notices.forEach(e => e.classList.add("pl-intro-notice"));
    layout.classList.add("pl-planner-introduction"); term.classList.add("pl-intro-term"); sidebar.classList.add("pl-intro-sidebar");
    // Keyboard navigation to the untouched UCLA menu must remain reachable.
    const focus = (event: FocusEvent) => {
      if (!this.compactHeader || !(event.target instanceof Element) || !event.target.closest('layout-headerwrap')) return;
      this.setHeaderCompact(false); doc.defaultView?.scrollTo({top: 0, behavior: 'instant'});
      this.saveChoice(false); onLayout();
    };
    // Chromium suppresses closed details descendants even when print CSS asks
    // for display:block. Expose the original introduction only while printing.
    let printChoice:boolean|null=null;
    const beforePrint=()=>{if(printChoice===null)printChoice=about.open;about.open=true;};
    const afterPrint=()=>{if(printChoice!==null){about.open=printChoice;printChoice=null;}};
    this.state = {doc, layout, title, description, text, anchor, about, term, label, sidebar, header, info, close, notices,
      sidebarHadClass, sidebarHadStyle, layoutHadClass, noticeHadClass, focus, workspace, beforePrint, afterPrint};
    doc.addEventListener('focusin', focus);
    doc.defaultView?.addEventListener('beforeprint',beforePrint);doc.defaultView?.addEventListener('afterprint',afterPrint);
    header.addEventListener("click", () => {
      const view = doc.defaultView; if (!view) return;
      // Scroll the original banner away; never hide, move or restyle its menu.
      // Stop at the title so the term selector and notices remain accessible.
      const top = title.getBoundingClientRect().top;
      const compact = !(this.compactHeader || (top <= 13 && view.scrollY > 0));
      this.setHeaderCompact(compact);
      if (!compact) view.scrollTo({top: 0, behavior: "instant"});
      this.saveChoice(compact);
      onLayout(); header.focus({preventScroll: true});
    });
    info.addEventListener("click", () => {
      if(workspace){workspace.onInformation();return;}
      if (sidebar.classList.contains("pl-intro-sidebar-open")) { this.closeInfo(); return; }
      sidebar.classList.add("pl-intro-sidebar-open"); info.setAttribute("aria-expanded", "true");
      this.positionInfo(); close.focus({preventScroll: true});
    });
    close.addEventListener("click", () => {if(workspace)workspace.onCloseInformation();else this.closeInfo();});
    this.positionInfo();
    return true;
  }

  positionHeader(): void {
    const s = this.state, view = s?.doc.defaultView;
    if (!s || !view || !this.compactHeader || s.doc.visibilityState === 'hidden') return;
    const top = s.title.getBoundingClientRect().top;
    // Keep the saved compact view when native navigation resets root scrolling.
    // Scrolling deeper stays free; Show header releases this minimum position.
    if (top > 13) view.scrollTo({top: Math.max(0, view.scrollY + top - 12), behavior: 'instant'});
  }

  positionInfo(): void {
    const s = this.state; if (!s) return;
    const compact = this.compactHeader || ((s.doc.defaultView?.scrollY || 0) > 0 && s.title.getBoundingClientRect().top <= 13);
    s.header.textContent = compact ? "Show header" : "Compact header";
    s.header.setAttribute("aria-pressed", String(compact));
    s.header.title = this.saveFailed ? "Could not save the header preference. Try again." : compact ? "Show UCLA's menu and stop keeping the header compact" : "Keep UCLA's banner out of view across terms and reloads";
    if (s.workspace || !s.sidebar.classList.contains("pl-intro-sidebar-open")) return;
    const top = Math.max(12, Math.min(s.doc.defaultView!.innerHeight - 160, s.info.getBoundingClientRect().bottom + 8));
    s.sidebar.style.setProperty("--pl-info-top", `${Math.ceil(top)}px`);
  }

  /** Visually place the original sidebar in the main workspace without reparenting it. */
  showInformationInWorkspace(active: boolean, bounds: DOMRect, selected=active): void {
    const s=this.state;if(!s?.workspace)return;
    s.sidebar.classList.toggle("pl-intro-sidebar-open",active);
    s.sidebar.classList.add("pl-intro-sidebar-workspace");
    s.info.setAttribute("aria-expanded",String(active));s.info.setAttribute("aria-pressed",String(selected));
    for(const [key,value] of [["left",bounds.left],["top",bounds.top],["width",bounds.width],["height",bounds.height]] as const)s.sidebar.style.setProperty(`--pl-info-${key}`,`${Math.max(0,value)}px`);
  }

  closeInfo(focus = true): boolean {
    const s = this.state; if (!s?.sidebar.classList.contains("pl-intro-sidebar-open")) return false;
    s.sidebar.classList.remove("pl-intro-sidebar-open"); s.info.setAttribute("aria-expanded", "false");
    if(s.workspace)s.info.setAttribute("aria-pressed","false");
    if (focus && s.info.isConnected) s.info.focus({preventScroll: true}); return true;
  }

  restore(): void {
    const s = this.state; if (!s) return; this.state = null;
    s.doc.removeEventListener('focusin', s.focus);
    s.doc.defaultView?.removeEventListener('beforeprint',s.beforePrint);s.doc.defaultView?.removeEventListener('afterprint',s.afterPrint);s.afterPrint();
    s.layout.classList.remove("pl-planner-introduction"); s.term.classList.remove("pl-intro-term");
    s.sidebar.classList.remove("pl-intro-sidebar", "pl-intro-sidebar-open", "pl-intro-sidebar-workspace");
    if (!s.layoutHadClass && !s.layout.className) s.layout.removeAttribute("class");
    if (!s.sidebarHadClass && !s.sidebar.className) s.sidebar.removeAttribute("class");
    for(const name of ["left","top","width","height"])s.sidebar.style.removeProperty(`--pl-info-${name}`); if (!s.sidebarHadStyle && !s.sidebar.getAttribute("style")) s.sidebar.removeAttribute("style");
    s.notices.forEach((e,i) => {e.classList.remove("pl-intro-notice"); if (!s.noticeHadClass[i] && !e.className) e.removeAttribute("class");});
    // Preserve native replacements too; never revive disconnected text or discard a new child.
    for (const child of [...s.about.childNodes]) {
      if (child instanceof Element && child.hasAttribute(OWNED)) continue;
      if (s.anchor.isConnected) s.anchor.before(child); else s.about.before(child);
    }
    s.anchor.remove();
    s.about.remove(); s.label.remove(); s.header.remove(); s.info.remove(); s.close.remove();
  }
}
