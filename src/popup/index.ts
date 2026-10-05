import {
  ENABLED_KEY,
  readEnabled,
  readLayoutSettings,
  readSessionSettings,
  saveLayoutSettings,
  saveSessionSettings,
  watchLayoutSettings
} from "../storage/settings";
import { normalizeAppearance, saveAppearance } from "../storage/appearance";
import { subscribeAppearance, type AppearanceState } from "../appearance";

const toggle = document.getElementById("toggle") as HTMLInputElement | null;
const state = document.getElementById("state");
const keepAlive = document.getElementById("keep-alive") as HTMLInputElement | null;
const cap = document.getElementById("cap") as HTMLSelectElement | null;
const capRow = document.getElementById("cap-row");
const tidy = document.getElementById("tidy") as HTMLInputElement | null;
const version = document.getElementById("version");
const appearance = document.getElementById("appearance") as HTMLSelectElement | null;
const appearanceStatus = document.getElementById("appearance-status");
if (version) version.textContent = `v${chrome.runtime.getManifest().version}`;

let appearanceSave = 0;
let pendingAppearance: string | null = null;
function renderAppearance(state: AppearanceState): void {
  if (pendingAppearance !== null && state.preference !== pendingAppearance) return;
  if (appearance) { appearance.value = state.preference; appearance.disabled = false; }
  document.documentElement.dataset.plAppearance = state.resolved;
}
const stopAppearance = subscribeAppearance(renderAppearance);
window.addEventListener("pagehide", stopAppearance, { once: true });
appearance?.addEventListener("change", () => {
  if (appearance.disabled) return;
  const preference = normalizeAppearance(appearance.value), generation = ++appearanceSave;
  pendingAppearance = preference;
  renderAppearance({ preference, resolved: preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light" });
  if (appearanceStatus) appearanceStatus.textContent = "";
  void saveAppearance(preference).then(() => {
    if (generation === appearanceSave) pendingAppearance = null;
  }).catch(() => {
    if (generation !== appearanceSave) return;
    pendingAppearance = null;
    if (appearanceStatus) appearanceStatus.textContent = "Could not save appearance. Try again.";
  });
});

function renderEnabled(enabled: boolean): void {
  if (toggle) toggle.checked = enabled;
  if (state) {
    state.textContent = enabled
      ? "On. Active on the Class Planner page."
      : "Off. Class Planner looks exactly as MyUCLA made it.";
  }
}

function renderSession(settings: { keepAlive: boolean; capMinutes: number }): void {
  if (keepAlive) keepAlive.checked = settings.keepAlive;
  if (cap) cap.value = String(settings.capMinutes);
  if (capRow) capRow.hidden = !settings.keepAlive;
}

void readEnabled().then(renderEnabled);
void readSessionSettings().then(renderSession);
void readLayoutSettings().then(({ tidy: on }) => {
  if (tidy) tidy.checked = on;
});
const stopLayoutWatch = watchLayoutSettings(({tidy:on})=>{if(tidy)tidy.checked=on;});
window.addEventListener("pagehide",stopLayoutWatch,{once:true});

tidy?.addEventListener("change", () => {
  void saveLayoutSettings({ tidy: tidy.checked });
});

toggle?.addEventListener("change", () => {
  const enabled = toggle.checked;
  renderEnabled(enabled);
  void chrome.storage.local.set({ [ENABLED_KEY]: enabled });
});

function persistSession(): void {
  const settings = {
    keepAlive: keepAlive?.checked === true,
    capMinutes: Number(cap?.value ?? 60)
  };
  renderSession(settings);
  void saveSessionSettings(settings);
}

keepAlive?.addEventListener("change", persistSession);
cap?.addEventListener("change", persistSession);
