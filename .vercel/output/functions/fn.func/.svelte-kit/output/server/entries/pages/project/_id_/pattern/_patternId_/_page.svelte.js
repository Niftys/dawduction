import { c as create_ssr_component, d as add_attribute, e as escape, b as each, v as validate_component, a as subscribe, o as onDestroy } from "../../../../../../chunks/ssr.js";
import "@sveltejs/kit/internal";
import "../../../../../../chunks/exports.js";
import "../../../../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../../../../chunks/state.svelte.js";
import { projectStore } from "../../../../../../chunks/projectStore.js";
import { e as engineStore, c as canvasStore, s as selectionStore, p as playbackStore, N as NumericInput, P as ParamControl, d as editorModeStore, f as synthPluginStore, b as ProjectSkeleton, T as Toolbar } from "../../../../../../chunks/ProjectSkeleton.js";
import { loadingStore } from "../../../../../../chunks/loadingStore.js";
import { p as page } from "../../../../../../chunks/stores.js";
function updateEnginePatternTree(engine, context) {
  const { patternId, trackId, instrumentId } = context;
  if (!engine) {
    console.warn("[PatternTreeUpdater] No engine available");
    return false;
  }
  let currentProject = null;
  const unsubscribe = projectStore.subscribe((p) => {
    currentProject = p;
  });
  unsubscribe();
  if (!currentProject) {
    console.warn("[PatternTreeUpdater] No project available");
    return false;
  }
  if (patternId) {
    return updatePatternInstrument(engine, currentProject, patternId, instrumentId);
  }
  if (trackId) {
    return updateStandaloneInstrument(engine, currentProject, trackId);
  }
  console.warn("[PatternTreeUpdater] No patternId or trackId provided", context);
  return false;
}
function updatePatternInstrument(engine, project, patternId, instrumentId) {
  const pattern = project.patterns?.find((p) => p.id === patternId);
  if (!pattern) {
    console.warn("[PatternTreeUpdater] Pattern not found", {
      patternId,
      availablePatterns: project.patterns?.map((p) => p.id)
    });
    return false;
  }
  const patternInstruments = projectStore.getPatternInstruments(pattern);
  if (patternInstruments.length === 0) {
    console.warn("[PatternTreeUpdater] Pattern has no instruments", { patternId });
    return false;
  }
  const instrument = instrumentId ? patternInstruments.find((inst) => inst.id === instrumentId) : patternInstruments[0];
  if (!instrument) {
    console.warn("[PatternTreeUpdater] Instrument not found", {
      patternId,
      instrumentId,
      availableInstruments: patternInstruments.map((inst) => inst.id)
    });
    return false;
  }
  if (!instrument.patternTree) {
    console.warn("[PatternTreeUpdater] Instrument has no pattern tree", {
      patternId,
      instrumentId: instrument.id
    });
    return false;
  }
  const patternTrackId = `__pattern_${patternId}_${instrument.id}`;
  const baseMeter = pattern.baseMeter || 4;
  engine.updatePatternTree(patternTrackId, instrument.patternTree, baseMeter);
  return true;
}
function updateStandaloneInstrument(engine, project, instrumentId) {
  const instrument = project.standaloneInstruments?.find((i) => i.id === instrumentId);
  if (!instrument) {
    console.warn("[PatternTreeUpdater] Standalone instrument not found", {
      instrumentId,
      availableInstruments: project.standaloneInstruments?.map((i) => i.id)
    });
    return false;
  }
  if (!instrument.patternTree) {
    console.warn("[PatternTreeUpdater] Standalone instrument has no pattern tree", { instrumentId });
    return false;
  }
  engine.updatePatternTree(instrumentId, instrument.patternTree);
  return true;
}
function createUpdateContext(options) {
  return {
    patternId: options.patternId ?? options.editingNode?.patternId ?? options.menu?.patternId ?? options.selection?.selectedPatternId ?? null,
    trackId: options.trackId ?? options.editingNode?.trackId ?? options.menu?.trackId ?? options.selection?.selectedTrackId ?? null,
    instrumentId: options.instrumentId ?? options.editingNode?.instrumentId ?? options.menu?.instrumentId ?? options.selection?.selectedInstrumentId ?? null
  };
}
class Viewport {
  constructor(x = 0, y = 0, zoom = 1) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
  }
  /**
   * Transform world coordinates to screen coordinates
   */
  worldToScreen(wx, wy) {
    return [
      (wx - this.x) * this.zoom,
      (wy - this.y) * this.zoom
    ];
  }
  /**
   * Transform screen coordinates to world coordinates
   */
  screenToWorld(sx, sy) {
    return [
      sx / this.zoom + this.x,
      sy / this.zoom + this.y
    ];
  }
  /**
   * Apply viewport transform to canvas context
   */
  applyTransform(ctx) {
    ctx.save();
    ctx.translate(-this.x * this.zoom, -this.y * this.zoom);
    ctx.scale(this.zoom, this.zoom);
  }
  /**
   * Restore canvas context
   */
  restoreTransform(ctx) {
    ctx.restore();
  }
}
const Canvas = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { patternId = null } = $$props;
  let canvas;
  let viewport = new Viewport();
  let project;
  projectStore.subscribe((p) => project = p);
  engineStore.subscribe((e) => e);
  canvasStore.subscribe((state) => {
    viewport.x = state.x;
    viewport.y = state.y;
    viewport.zoom = state.zoom;
  });
  selectionStore.subscribe((s) => s);
  playbackStore.subscribe((s) => s);
  if ($$props.patternId === void 0 && $$bindings.patternId && patternId !== void 0) $$bindings.patternId(patternId);
  patternId && project ? project.patterns?.find((p) => p.id === patternId) || null : null;
  return `<canvas class="${[
    "canvas",
    " "
  ].join(" ").trim()}" style="${"cursor: " + escape(
    "grab",
    true
  ) + ";"}"${add_attribute("this", canvas, 0)}></canvas> ${``} ${``}`;
});
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNoteName(midi) {
  if (midi < 0 || midi > 127) return "---";
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  const noteName = NOTE_NAMES[noteIndex];
  return `${noteName}${octave}`;
}
const InstrumentSelector = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { isRootNode = false } = $$props;
  let { selectedInstrumentId = null } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  engineStore.subscribe((e) => e);
  const nonMelodicInstruments = [
    {
      value: "kick",
      label: "Kick",
      color: "#00ffff"
    },
    {
      value: "snare",
      label: "Snare",
      color: "#ff00ff"
    },
    {
      value: "hihat",
      label: "Hi-Hat",
      color: "#ffff00"
    },
    {
      value: "clap",
      label: "Clap",
      color: "#ff6600"
    },
    {
      value: "tom",
      label: "Tom",
      color: "#00ff00"
    },
    {
      value: "cymbal",
      label: "Cymbal",
      color: "#ff0066"
    },
    {
      value: "shaker",
      label: "Shaker",
      color: "#6600ff"
    },
    {
      value: "rimshot",
      label: "Rimshot",
      color: "#ff9900"
    }
  ];
  const melodicInstrumentsList = [
    {
      value: "bass",
      label: "Bass",
      color: "#0066ff"
    },
    {
      value: "subtractive",
      label: "Subtractive",
      color: "#00ffcc"
    },
    {
      value: "fm",
      label: "FM",
      color: "#cc00ff"
    },
    {
      value: "wavetable",
      label: "Wavetable",
      color: "#ffcc00"
    },
    {
      value: "supersaw",
      label: "Supersaw",
      color: "#ff3366"
    },
    {
      value: "pluck",
      label: "Pluck",
      color: "#66ff99"
    },
    {
      value: "pad",
      label: "Pad",
      color: "#9966ff"
    },
    {
      value: "organ",
      label: "Organ",
      color: "#ff9966"
    }
  ];
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.isRootNode === void 0 && $$bindings.isRootNode && isRootNode !== void 0) $$bindings.isRootNode(isRootNode);
  if ($$props.selectedInstrumentId === void 0 && $$bindings.selectedInstrumentId && selectedInstrumentId !== void 0) $$bindings.selectedInstrumentId(selectedInstrumentId);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  activeItem = selectedInstrument || selectedTrack;
  return `<div class="section"><h3 class="section-title" data-svelte-h="svelte-p4zah0">Instrument Type</h3> <div class="instrument-group"><h4 class="instrument-group-title" data-svelte-h="svelte-1h9ae5c">Drums</h4> <div class="instrument-grid">${each(nonMelodicInstruments, (inst) => {
    return `<button class="${[
      "instrument-btn",
      activeItem?.instrumentType === inst.value ? "active" : ""
    ].join(" ").trim()}" style="${"border-color: " + escape(inst.color, true) + ";"}">${escape(inst.label)} </button>`;
  })}</div></div> <div class="instrument-group"><h4 class="instrument-group-title" data-svelte-h="svelte-1m9whdo">Melodic</h4> <div class="instrument-grid">${each(melodicInstrumentsList, (inst) => {
    return `<button class="${[
      "instrument-btn",
      activeItem?.instrumentType === inst.value ? "active" : ""
    ].join(" ").trim()}" style="${"border-color: " + escape(inst.color, true) + ";"}">${escape(inst.label)} </button>`;
  })}</div></div></div>`;
});
const MixerControls = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let itemVolume;
  let itemPan;
  let { selectedTrack = void 0 } = $$props;
  const selectedPattern = void 0;
  let { selectedInstrument = void 0 } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  let project = null;
  projectStore.subscribe((p) => project = p);
  let selection = null;
  selectionStore.subscribe((s) => selection = s);
  function updateVolume(value) {
    const clampedValue = Math.max(0, Math.min(2, isNaN(value) ? 1 : value));
    if (!selection) {
      console.warn("[MixerControls] No selection available");
      return;
    }
    if (selection.selectedPatternId && selection.selectedInstrumentId) {
      projectStore.updatePatternInstrument(selection.selectedPatternId, selection.selectedInstrumentId, { volume: clampedValue });
      if (engine) {
        const patternTrackId = `__pattern_${selection.selectedPatternId}_${selection.selectedInstrumentId}`;
        engine.updateTrackVolume(patternTrackId, clampedValue);
      }
    } else if (selection.selectedTrackId) {
      projectStore.updateStandaloneInstrument(selection.selectedTrackId, { volume: clampedValue });
      if (engine) {
        engine.updateTrackVolume(selection.selectedTrackId, clampedValue);
      }
    }
  }
  function updatePan(value) {
    const clampedValue = Math.max(-1, Math.min(1, isNaN(value) ? 0 : value));
    if (!selection) {
      console.warn("[MixerControls] No selection available");
      return;
    }
    if (selection.selectedPatternId && selection.selectedInstrumentId) {
      projectStore.updatePatternInstrument(selection.selectedPatternId, selection.selectedInstrumentId, { pan: clampedValue });
      if (engine) {
        const patternTrackId = `__pattern_${selection.selectedPatternId}_${selection.selectedInstrumentId}`;
        engine.updateTrackPan(patternTrackId, clampedValue);
      }
    } else if (selection.selectedTrackId) {
      projectStore.updateStandaloneInstrument(selection.selectedTrackId, { pan: clampedValue });
      if (engine) {
        engine.updateTrackPan(selection.selectedTrackId, clampedValue);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) ;
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  itemVolume = (() => {
    if (!project || !selection) return 1;
    if (selection.selectedPatternId && selection.selectedInstrumentId) {
      const pattern = project.patterns?.find((p) => p.id === selection.selectedPatternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        const inst = instruments.find((inst2) => inst2.id === selection.selectedInstrumentId);
        return inst?.volume ?? 1;
      }
    }
    if (selection.selectedTrackId) {
      const track = project.standaloneInstruments?.find((t) => t.id === selection.selectedTrackId);
      return track?.volume ?? 1;
    }
    return 1;
  })();
  itemPan = (() => {
    if (!project || !selection) return 0;
    if (selection.selectedPatternId && selection.selectedInstrumentId) {
      const pattern = project.patterns?.find((p) => p.id === selection.selectedPatternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        const inst = instruments.find((inst2) => inst2.id === selection.selectedInstrumentId);
        return inst?.pan ?? 0;
      }
    }
    if (selection.selectedTrackId) {
      const track = project.standaloneInstruments?.find((t) => t.id === selection.selectedTrackId);
      return track?.pan ?? 0;
    }
    return 0;
  })();
  return `<div class="section"><div class="param-header"><label for="volume-range" data-svelte-h="svelte-1t9gfde">Volume</label> <button class="reset-btn" data-svelte-h="svelte-wfrkdx">Reset</button></div> <div class="param-controls"><input id="volume-range" type="range" min="0" max="2" step="0.01"${add_attribute("value", itemVolume, 0)}> ${validate_component(NumericInput, "NumericInput").$$render(
    $$result,
    {
      id: "volume-number",
      min: 0,
      max: 2,
      step: 0.01,
      value: itemVolume,
      onInput: updateVolume
    },
    {},
    {}
  )}</div></div> <div class="section"><div class="param-header"><label for="pan-range" data-svelte-h="svelte-15m1nv0">Pan</label> <button class="reset-btn" data-svelte-h="svelte-8hkr0j">Reset</button></div> <div class="param-controls pan-controls"><span class="pan-label pan-label-left" title="Left" data-svelte-h="svelte-1nggwdt">L</span> <input id="pan-range" type="range" min="-1" max="1" step="0.01"${add_attribute("value", itemPan, 0)}> <span class="pan-label pan-label-right" title="Right" data-svelte-h="svelte-9q2qib">R</span> ${validate_component(NumericInput, "NumericInput").$$render(
    $$result,
    {
      id: "pan-number",
      min: -1,
      max: 1,
      step: 0.01,
      value: itemPan,
      onInput: updatePan
    },
    {},
    {}
  )}</div></div>`;
});
function findNodeInTree(node, nodeId) {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}
const DrumSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let instrumentDefaults;
  let defaults;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  instrumentDefaults = {
    kick: { attack: 5e-3, decay: 0.4, release: 0.15 },
    snare: { attack: 5e-3, decay: 0.2, release: 0.1 },
    hihat: { attack: 1e-3, decay: 0.05, release: 0.01 },
    clap: { attack: 0.01, decay: 0.15, release: 0.05 },
    tom: { attack: 0.01, decay: 0.4, release: 0.1 },
    cymbal: { attack: 0.01, decay: 0.5, release: 0.2 },
    shaker: { attack: 0.01, decay: 0.3, release: 0.1 },
    rimshot: { attack: 1e-3, decay: 0.08, release: 0.05 }
  };
  defaults = activeItem?.instrumentType ? instrumentDefaults[activeItem.instrumentType] : null;
  return `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "attack-range-1",
      label: "Attack",
      value: trackSettings.attack ?? 0.01,
      min: 0,
      max: 1,
      step: 0.01,
      resetValue: defaults?.attack ?? 0.01,
      onReset: () => updateSetting("attack", defaults?.attack ?? 0.01),
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "decay-range-1",
      label: "Decay",
      value: trackSettings.decay ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      resetValue: defaults?.decay ?? 0.3,
      onReset: () => updateSetting("decay", defaults?.decay ?? 0.3),
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "release-range-1",
      label: "Release",
      value: trackSettings.release ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      resetValue: defaults?.release ?? 0.1,
      onReset: () => updateSetting("release", defaults?.release ?? 0.1),
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const SubtractiveSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterCutoff") {
        processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));
      } else if (key === "filterResonance") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `<div class="param"><label for="osc1-type" data-svelte-h="svelte-15oq4zt">Osc 1 Type</label> <select id="osc1-type"${add_attribute("value", trackSettings.osc1Type ?? "saw", 0)}><option value="sine" data-svelte-h="svelte-1mpn6cq">Sine</option><option value="saw" data-svelte-h="svelte-h02c1s">Saw</option><option value="square" data-svelte-h="svelte-bkgndu">Square</option><option value="triangle" data-svelte-h="svelte-1f5nbzi">Triangle</option></select></div> ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "filter-cutoff-range",
      label: "Filter Cutoff",
      value: trackSettings.filterCutoff ?? 5e3,
      min: 20,
      max: 2e4,
      step: 10,
      onUpdate: (v) => updateSetting("filterCutoff", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "filter-resonance-range",
      label: "Filter Resonance",
      value: trackSettings.filterResonance ?? 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("filterResonance", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "attack-range-2",
      label: "Attack",
      value: trackSettings.attack ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "decay-range-2",
      label: "Decay",
      value: trackSettings.decay ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "sustain-range",
      label: "Sustain",
      value: trackSettings.sustain ?? 0.7,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "release-range-2",
      label: "Release",
      value: trackSettings.release ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const FMSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  function updateOperatorFrequency(value) {
    if (isNaN(value)) return;
    const operators = trackSettings.operators || [
      {
        frequency: 1,
        amplitude: 1,
        waveform: "sine"
      }
    ];
    operators[0] = { ...operators[0], frequency: value };
    updateSetting("operators", operators);
  }
  function updateOperatorAmplitude(value) {
    if (isNaN(value)) return;
    const operators = trackSettings.operators || [
      {
        frequency: 1,
        amplitude: 1,
        waveform: "sine"
      }
    ];
    operators[0] = { ...operators[0], amplitude: value };
    updateSetting("operators", operators);
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "fm-op-freq",
      label: "Operator Frequency Ratio",
      value: trackSettings.operators?.[0]?.frequency ?? 1,
      min: 0.1,
      max: 10,
      step: 0.1,
      onUpdate: updateOperatorFrequency
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "fm-op-amp",
      label: "Operator Amplitude",
      value: trackSettings.operators?.[0]?.amplitude ?? 1,
      min: 0,
      max: 2,
      step: 0.01,
      onUpdate: updateOperatorAmplitude
    },
    {},
    {}
  )} <div class="param"><label for="fm-op-waveform" data-svelte-h="svelte-1s7nndq">Operator Waveform</label> <select id="fm-op-waveform"${add_attribute("value", trackSettings.operators?.[0]?.waveform ?? "sine", 0)}><option value="sine" data-svelte-h="svelte-1mpn6cq">Sine</option><option value="saw" data-svelte-h="svelte-h02c1s">Saw</option><option value="square" data-svelte-h="svelte-bkgndu">Square</option><option value="triangle" data-svelte-h="svelte-1f5nbzi">Triangle</option></select></div> ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "attack-range-fm",
      label: "Attack",
      value: trackSettings.attack ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "decay-range-fm",
      label: "Decay",
      value: trackSettings.decay ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "sustain-range-fm",
      label: "Sustain",
      value: trackSettings.sustain ?? 0.7,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "release-range-fm",
      label: "Release",
      value: trackSettings.release ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const WavetableSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "attack-range-wt",
      label: "Attack",
      value: trackSettings.attack ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "decay-range-wt",
      label: "Decay",
      value: trackSettings.decay ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "sustain-range-wt",
      label: "Sustain",
      value: trackSettings.sustain ?? 0.7,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "release-range-wt",
      label: "Release",
      value: trackSettings.release ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const SupersawSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterCutoff") {
        processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));
      } else if (key === "filterResonance") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "lfoAmount") {
        processedValue = Math.max(0, Math.min(5e3, parseFloat(value.toFixed(0))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-num-osc",
      label: "Number of Oscillators",
      value: trackSettings.numOscillators ?? 7,
      min: 3,
      max: 15,
      step: 1,
      onUpdate: (v) => updateSetting("numOscillators", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-detune",
      label: "Detune (semitones)",
      value: trackSettings.detune ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("detune", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-spread",
      label: "Spread",
      value: trackSettings.spread ?? 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("spread", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-filter-cutoff",
      label: "Filter Cutoff (Hz)",
      value: trackSettings.filterCutoff ?? 8e3,
      min: 20,
      max: 2e4,
      step: 10,
      onUpdate: (v) => updateSetting("filterCutoff", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-filter-resonance",
      label: "Filter Resonance",
      value: trackSettings.filterResonance ?? 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("filterResonance", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-lfo-rate",
      label: "LFO Rate (Hz)",
      value: trackSettings.lfoRate ?? 0,
      min: 0,
      max: 20,
      step: 0.1,
      onUpdate: (v) => updateSetting("lfoRate", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-lfo-amount",
      label: "LFO Amount (Hz)",
      value: trackSettings.lfoAmount ?? 0,
      min: 0,
      max: 5e3,
      step: 10,
      onUpdate: (v) => updateSetting("lfoAmount", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-attack",
      label: "Attack",
      value: trackSettings.attack ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-decay",
      label: "Decay",
      value: trackSettings.decay ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-sustain",
      label: "Sustain",
      value: trackSettings.sustain ?? 0.7,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "supersaw-release",
      label: "Release",
      value: trackSettings.release ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const PluckSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "damping") {
        processedValue = Math.max(0.9, Math.min(0.999, parseFloat(value.toFixed(3))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pluck-attack",
      label: "Attack",
      value: trackSettings.attack ?? 0.01,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pluck-decay",
      label: "Decay",
      value: trackSettings.decay ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pluck-release",
      label: "Release",
      value: trackSettings.release ?? 0.4,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pluck-damping",
      label: "Damping",
      value: trackSettings.damping ?? 0.98,
      min: 0.9,
      max: 0.999,
      step: 1e-3,
      onUpdate: (v) => updateSetting("damping", v)
    },
    {},
    {}
  )}`;
});
const BassSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterCutoff") {
        processedValue = Math.max(20, Math.min(8e3, parseFloat(value.toFixed(0))));
      } else if (key === "filterResonance") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `<div class="param"><label for="bass-osc1-type" data-svelte-h="svelte-14tfvwv">Oscillator Type</label> <select id="bass-osc1-type"${add_attribute("value", trackSettings.osc1Type ?? "saw", 0)}><option value="saw" data-svelte-h="svelte-hfmaw8">Sawtooth</option><option value="square" data-svelte-h="svelte-bkgndu">Square</option><option value="sine" data-svelte-h="svelte-1mpn6cq">Sine</option><option value="triangle" data-svelte-h="svelte-1f5nbzi">Triangle</option></select></div> ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-sub-level",
      label: "Sub Level",
      value: trackSettings.subLevel ?? 0.6,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("subLevel", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-saturation",
      label: "Saturation",
      value: trackSettings.saturation ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("saturation", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-filter-cutoff",
      label: "Filter Cutoff",
      value: trackSettings.filterCutoff ?? 2e3,
      min: 20,
      max: 8e3,
      step: 10,
      onUpdate: (v) => updateSetting("filterCutoff", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-filter-resonance",
      label: "Filter Resonance",
      value: trackSettings.filterResonance ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("filterResonance", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-attack",
      label: "Attack",
      value: trackSettings.attack ?? 0.05,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-decay",
      label: "Decay",
      value: trackSettings.decay ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-sustain",
      label: "Sustain",
      value: trackSettings.sustain ?? 0.8,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "bass-release",
      label: "Release",
      value: trackSettings.release ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const PadSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "release") {
        processedValue = Math.max(0, Math.min(3, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterCutoff") {
        processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));
      } else if (key === "filterResonance") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterLfoAmount") {
        processedValue = Math.max(0, Math.min(5e3, parseFloat(value.toFixed(0))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `<div class="param"><label for="pad-osc-type" data-svelte-h="svelte-1uyzizm">Oscillator Type</label> <select id="pad-osc-type"${add_attribute("value", trackSettings.oscType ?? "saw", 0)}><option value="saw" data-svelte-h="svelte-hfmaw8">Sawtooth</option><option value="square" data-svelte-h="svelte-bkgndu">Square</option><option value="sine" data-svelte-h="svelte-1mpn6cq">Sine</option><option value="triangle" data-svelte-h="svelte-1f5nbzi">Triangle</option></select></div> ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-num-osc",
      label: "Number of Oscillators",
      value: trackSettings.numOscillators ?? 8,
      min: 4,
      max: 16,
      step: 1,
      onUpdate: (v) => updateSetting("numOscillators", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-detune",
      label: "Detune (semitones)",
      value: trackSettings.detune ?? 0.15,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("detune", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-spread",
      label: "Spread",
      value: trackSettings.spread ?? 0.7,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("spread", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-cutoff",
      label: "Filter Cutoff (Hz)",
      value: trackSettings.filterCutoff ?? 4e3,
      min: 20,
      max: 2e4,
      step: 10,
      onUpdate: (v) => updateSetting("filterCutoff", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-resonance",
      label: "Filter Resonance",
      value: trackSettings.filterResonance ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("filterResonance", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-pitch-lfo-rate",
      label: "Pitch LFO Rate (Hz)",
      value: trackSettings.pitchLfoRate ?? 0.5,
      min: 0,
      max: 10,
      step: 0.1,
      onUpdate: (v) => updateSetting("pitchLfoRate", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-pitch-lfo-amount",
      label: "Pitch LFO Amount (semitones)",
      value: trackSettings.pitchLfoAmount ?? 0.02,
      min: 0,
      max: 0.5,
      step: 0.01,
      onUpdate: (v) => updateSetting("pitchLfoAmount", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-lfo-rate",
      label: "Filter LFO Rate (Hz)",
      value: trackSettings.filterLfoRate ?? 0.3,
      min: 0,
      max: 5,
      step: 0.1,
      onUpdate: (v) => updateSetting("filterLfoRate", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-lfo-amount",
      label: "Filter LFO Amount (Hz)",
      value: trackSettings.filterLfoAmount ?? 1e3,
      min: 0,
      max: 5e3,
      step: 10,
      onUpdate: (v) => updateSetting("filterLfoAmount", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-attack",
      label: "Attack",
      value: trackSettings.attack ?? 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-decay",
      label: "Decay",
      value: trackSettings.decay ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-sustain",
      label: "Sustain",
      value: trackSettings.sustain ?? 0.9,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-release",
      label: "Release",
      value: trackSettings.release ?? 1.5,
      min: 0,
      max: 3,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const OrganSynthParams = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let drawbarLabels;
  let drawbars;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterCutoff") {
        processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));
      } else if (key === "filterResonance") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key.startsWith("drawbar")) {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  function updateDrawbar(index, value) {
    if (!activeItem) return;
    const newDrawbars = [...drawbars];
    newDrawbars[index] = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
    updateSetting("drawbars", newDrawbars);
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  drawbarLabels = ["16'", "5 1/3'", "8'", "4'", "2 2/3'", "2'", "1 3/5'", "1 1/3'", "1'"];
  drawbars = trackSettings.drawbars ?? [0.8, 0, 1, 0, 0.6, 0, 0.4, 0, 0.2];
  return `<div class="param-section"><h4 data-svelte-h="svelte-1k4eyoy">Drawbars</h4> ${each(drawbars, (drawbar, i) => {
    return `${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      {
        id: "organ-drawbar-" + i,
        label: drawbarLabels[i],
        value: drawbar,
        min: 0,
        max: 1,
        step: 0.01,
        onUpdate: (v) => updateDrawbar(i, v)
      },
      {},
      {}
    )}`;
  })}</div> ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-rotary-speed",
      label: "Rotary Speed (Hz)",
      value: trackSettings.rotarySpeed ?? 4,
      min: 0,
      max: 10,
      step: 0.1,
      onUpdate: (v) => updateSetting("rotarySpeed", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-rotary-depth",
      label: "Rotary Depth",
      value: trackSettings.rotaryDepth ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("rotaryDepth", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-filter-cutoff",
      label: "Filter Cutoff (Hz)",
      value: trackSettings.filterCutoff ?? 8e3,
      min: 20,
      max: 2e4,
      step: 10,
      onUpdate: (v) => updateSetting("filterCutoff", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-filter-resonance",
      label: "Filter Resonance",
      value: trackSettings.filterResonance ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("filterResonance", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-attack",
      label: "Attack",
      value: trackSettings.attack ?? 0.01,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-decay",
      label: "Decay",
      value: trackSettings.decay ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-sustain",
      label: "Sustain",
      value: trackSettings.sustain ?? 1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-release",
      label: "Release",
      value: trackSettings.release ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}`;
});
const SynthParameters = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  selectionStore.subscribe((s) => s);
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  engineStore.subscribe((e) => e);
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  activeItem = selectedInstrument || selectedTrack;
  return `<div class="section"><div class="param-header"><h3 data-svelte-h="svelte-pxlaeq">Synth Parameters</h3> <div class="param-header-actions">${activeItem && (activeItem.instrumentType === "pad" || activeItem.instrumentType === "organ") ? `<button class="plugin-btn" title="Open Plugin Window" data-svelte-h="svelte-6wa2cm">Plugin</button>` : ``} <button class="reset-btn" data-svelte-h="svelte-k8wg2u">Reset All</button></div></div> ${activeItem && ["kick", "snare", "hihat", "clap", "tom", "cymbal", "shaker", "rimshot"].includes(activeItem.instrumentType) ? `${validate_component(DrumSynthParams, "DrumSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "subtractive" ? `${validate_component(SubtractiveSynthParams, "SubtractiveSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "fm" ? `${validate_component(FMSynthParams, "FMSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "wavetable" ? `${validate_component(WavetableSynthParams, "WavetableSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "supersaw" ? `${validate_component(SupersawSynthParams, "SupersawSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "pluck" ? `${validate_component(PluckSynthParams, "PluckSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "bass" ? `${validate_component(BassSynthParams, "BassSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "pad" ? `${validate_component(PadSynthParams, "PadSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : `${activeItem && activeItem.instrumentType === "organ" ? `${validate_component(OrganSynthParams, "OrganSynthParams").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}` : ``}`}`}`}`}`}`}`}`}</div>`;
});
const NoteControls = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let editorMode;
  let defaultPitch;
  let currentPitch;
  let currentVelocity;
  let currentDivision;
  let $editorModeStore, $$unsubscribe_editorModeStore;
  $$unsubscribe_editorModeStore = subscribe(editorModeStore, (value) => $editorModeStore = value);
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  const selectedTrack = void 0;
  const selectedPattern = void 0;
  let { selectedNodes } = $$props;
  const isMelodicInstrument = false;
  let { isMultiSelect } = $$props;
  let { getCommonValue } = $$props;
  let { hasMixedValues } = $$props;
  let { activeItem = void 0 } = $$props;
  let pitchNoteInput;
  function updateEnginePatternTreeFromSelection() {
    for (const { pattern, track, instrumentId } of selectedNodes) {
      updateEnginePatternTree(engine, createUpdateContext({
        patternId: pattern?.id ?? null,
        trackId: track?.id ?? null,
        instrumentId: instrumentId ?? null
      }));
    }
  }
  function updateNodePitch(value) {
    if (selectedNodes.length === 0) return;
    if (isNaN(value)) return;
    const clampedValue = Math.max(0, Math.min(127, value));
    for (const { node, pattern, track, instrumentId } of selectedNodes) {
      if (pattern) {
        projectStore.updatePatternNodePitch(pattern.id, node.id, clampedValue, instrumentId);
      } else if (track) {
        projectStore.updateNodePitch(track.id, node.id, clampedValue);
      }
    }
    updateEnginePatternTreeFromSelection();
  }
  function updateNodeVelocity(value) {
    if (selectedNodes.length === 0) return;
    if (isNaN(value)) return;
    const clampedValue = Math.max(0, Math.min(1, value));
    for (const { node, pattern, track, instrumentId } of selectedNodes) {
      if (pattern) {
        projectStore.updatePatternNodeVelocity(pattern.id, node.id, clampedValue, instrumentId);
      } else if (track) {
        projectStore.updateNodeVelocity(track.id, node.id, clampedValue);
      }
    }
    updateEnginePatternTreeFromSelection();
  }
  function updateNodeDivision(value) {
    if (selectedNodes.length === 0) return;
    for (const { node, pattern, track, instrumentId } of selectedNodes) {
      if (pattern) {
        projectStore.updatePatternNodeDivision(pattern.id, node.id, value, instrumentId);
      } else if (track) {
        projectStore.updateNodeDivision(track.id, node.id, value);
      }
    }
    updateEnginePatternTreeFromSelection();
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) ;
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) ;
  if ($$props.selectedNodes === void 0 && $$bindings.selectedNodes && selectedNodes !== void 0) $$bindings.selectedNodes(selectedNodes);
  if ($$props.isMelodicInstrument === void 0 && $$bindings.isMelodicInstrument && isMelodicInstrument !== void 0) $$bindings.isMelodicInstrument(isMelodicInstrument);
  if ($$props.isMultiSelect === void 0 && $$bindings.isMultiSelect && isMultiSelect !== void 0) $$bindings.isMultiSelect(isMultiSelect);
  if ($$props.getCommonValue === void 0 && $$bindings.getCommonValue && getCommonValue !== void 0) $$bindings.getCommonValue(getCommonValue);
  if ($$props.hasMixedValues === void 0 && $$bindings.hasMixedValues && hasMixedValues !== void 0) $$bindings.hasMixedValues(hasMixedValues);
  if ($$props.activeItem === void 0 && $$bindings.activeItem && activeItem !== void 0) $$bindings.activeItem(activeItem);
  editorMode = $editorModeStore;
  defaultPitch = (() => {
    if (!activeItem) return 60;
    return activeItem.instrumentType === "tom" ? 50 : 60;
  })();
  currentPitch = selectedNodes.length > 0 ? getCommonValue((n) => n.pitch, defaultPitch) : defaultPitch;
  currentVelocity = selectedNodes.length > 0 ? getCommonValue((n) => n.velocity, 1) : 1;
  currentDivision = selectedNodes.length > 0 ? getCommonValue((n) => n.division, 1) : 1;
  $$unsubscribe_editorModeStore();
  return `${isMultiSelect ? `<div class="section"><p class="multi-select-info">Editing ${escape(selectedNodes.length)} selected nodes</p> <div class="editor-mode-switch"><button class="${["mode-btn", editorMode === "pitch" ? "active" : ""].join(" ").trim()}" title="Pitch Editor" data-svelte-h="svelte-gleplz">Pitch Editor</button> <button class="${["mode-btn", editorMode === "velocity" ? "active" : ""].join(" ").trim()}" title="Velocity Editor" data-svelte-h="svelte-15aj0uz">Velocity Editor</button></div> ${editorMode === "pitch" ? `<div class="transpose-controls"><span class="transpose-label" data-svelte-h="svelte-vy5ssa">Transpose:</span> <div class="transpose-buttons" role="group" aria-label="Transpose selected notes"><button class="transpose-btn" title="Transpose down 1 octave" data-svelte-h="svelte-1feho76">-12</button> <button class="transpose-btn" title="Transpose down 1 semitone" data-svelte-h="svelte-uzvzm2">-1</button> <button class="transpose-btn" title="Transpose up 1 semitone" data-svelte-h="svelte-zhskgi">+1</button> <button class="transpose-btn" title="Transpose up 1 octave" data-svelte-h="svelte-ajnjs">+12</button></div></div>` : ``}</div>` : ``} ${!isMultiSelect || editorMode === "pitch" ? `<div class="section"><div class="param-header"><label for="pitch-range">Pitch ${escape(isMultiSelect ? `(all ${selectedNodes.length} nodes)` : "")}</label> <button class="reset-btn" data-svelte-h="svelte-17uouwx">Reset</button></div> <div class="param-controls"><input id="pitch-range" type="range" min="0" max="127" step="1"${add_attribute("value", currentPitch, 0)}> <div class="pitch-input-group"><input id="pitch-note" type="text"${add_attribute("value", midiToNoteName(currentPitch), 0)} class="note-input"${add_attribute(
    "placeholder",
    isMultiSelect && hasMixedValues((n) => n.pitch, defaultPitch) ? "Mixed" : midiToNoteName(defaultPitch),
    0
  )} title="Enter note name (e.g., C4, D#5)"${add_attribute("this", pitchNoteInput, 0)}> ${validate_component(NumericInput, "NumericInput").$$render(
    $$result,
    {
      id: "pitch-number",
      min: 0,
      max: 127,
      step: 1,
      value: currentPitch,
      placeholder: isMultiSelect && hasMixedValues((n) => n.pitch, defaultPitch) ? "Mixed" : "",
      title: "MIDI note number (0-127)",
      onInput: updateNodePitch
    },
    {},
    {}
  )}</div></div></div>` : ``} ${!isMultiSelect || editorMode === "velocity" ? `<div class="section"><div class="param-header"><label for="velocity-range">Velocity ${escape(isMultiSelect ? `(all ${selectedNodes.length} nodes)` : "")}</label> <button class="reset-btn" data-svelte-h="svelte-bzbark">Reset</button></div> <div class="param-controls"><input id="velocity-range" type="range" min="0" max="1" step="0.01"${add_attribute("value", currentVelocity, 0)}> ${validate_component(NumericInput, "NumericInput").$$render(
    $$result,
    {
      id: "velocity-number",
      min: 0,
      max: 1,
      step: 0.01,
      value: currentVelocity,
      placeholder: isMultiSelect && hasMixedValues((n) => n.velocity, 1) ? "Mixed" : "",
      onInput: updateNodeVelocity
    },
    {},
    {}
  )}</div></div>` : ``} <div class="section"><label for="division-input" data-svelte-h="svelte-1al6qdj">Division</label> ${validate_component(NumericInput, "NumericInput").$$render(
    $$result,
    {
      id: "division-input",
      min: 1,
      value: currentDivision,
      placeholder: isMultiSelect && hasMixedValues((n) => n.division, 1) ? "Mixed" : "",
      onInput: (val) => {
        if (val > 0) {
          updateNodeDivision(val);
        }
      }
    },
    {},
    {}
  )}</div>`;
});
const Sidebar = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let selectedTrack;
  let selectedPattern;
  let selectedInstrument;
  let patternTree;
  let isRootNode;
  let activeItem;
  let isMelodicInstrument;
  let trackSettings;
  let selectedNodes;
  let isMultiSelect;
  let project;
  let selection;
  projectStore.subscribe((p) => project = p);
  selectionStore.subscribe((s) => selection = s);
  engineStore.subscribe((e) => e);
  const melodicInstruments = ["bass", "subtractive", "fm", "wavetable", "supersaw", "pluck", "pad", "organ"];
  function getCommonValue(getter, defaultValue) {
    if (selectedNodes.length === 0) return defaultValue;
    if (selectedNodes.length === 1) {
      const value = getter(selectedNodes[0].node);
      return value !== void 0 ? value : defaultValue;
    }
    const firstValue = getter(selectedNodes[0].node);
    const first = firstValue !== void 0 ? firstValue : defaultValue;
    const allSame = selectedNodes.every(({ node }) => {
      const value = getter(node);
      const nodeValue = value !== void 0 ? value : defaultValue;
      return nodeValue === first;
    });
    return allSame ? first : defaultValue;
  }
  function hasMixedValues(getter, defaultValue) {
    if (selectedNodes.length <= 1) return false;
    const firstValue = getter(selectedNodes[0].node);
    const first = firstValue !== void 0 ? firstValue : defaultValue;
    return !selectedNodes.every(({ node }) => {
      const value = getter(node);
      const nodeValue = value !== void 0 ? value : defaultValue;
      return nodeValue === first;
    });
  }
  selectedTrack = selection.selectedTrackId && project?.standaloneInstruments.find((i) => i.id === selection.selectedTrackId);
  selectedPattern = selection.selectedPatternId && project?.patterns.find((p) => p.id === selection.selectedPatternId);
  selectedInstrument = (() => {
    if (!selectedPattern || !selection.selectedInstrumentId) return null;
    const instruments = selectedPattern.instruments && Array.isArray(selectedPattern.instruments) && selectedPattern.instruments.length > 0 ? selectedPattern.instruments : selectedPattern.instrumentType && selectedPattern.patternTree ? [
      {
        id: selectedPattern.id,
        instrumentType: selectedPattern.instrumentType,
        patternTree: selectedPattern.patternTree,
        settings: selectedPattern.settings || {},
        instrumentSettings: selectedPattern.instrumentSettings,
        color: selectedPattern.color || "#7ab8ff",
        volume: selectedPattern.volume ?? 1,
        pan: selectedPattern.pan ?? 0,
        mute: selectedPattern.mute,
        solo: selectedPattern.solo
      }
    ] : [];
    return instruments.find((inst) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
  })();
  patternTree = selectedInstrument?.patternTree || selectedTrack?.patternTree;
  patternTree && selection.selectedNodeId ? findNodeInTree(patternTree, selection.selectedNodeId) : null;
  isRootNode = selection.isRoot || false;
  activeItem = selectedInstrument || selectedTrack;
  isMelodicInstrument = activeItem ? melodicInstruments.includes(activeItem.instrumentType) : false;
  selectedTrack?.volume ?? selectedInstrument?.volume ?? 1;
  selectedTrack?.pan ?? selectedInstrument?.pan ?? 0;
  trackSettings = activeItem?.settings ?? {};
  selectedNodes = (() => {
    if (!project || !selection.selectedTrackId && !selection.selectedPatternId) return [];
    const tree = patternTree;
    if (!tree) return [];
    const nodeIds = selection.selectedNodes.size > 0 ? Array.from(selection.selectedNodes) : selection.selectedNodeId ? [selection.selectedNodeId] : [];
    if (nodeIds.length === 0) return [];
    return nodeIds.map((nodeId) => {
      const node = findNodeInTree(tree, nodeId);
      return node ? {
        node,
        pattern: selectedPattern,
        track: selectedTrack,
        instrument: selectedInstrument,
        instrumentId: selection.selectedInstrumentId
      } : null;
    }).filter((item) => item !== null);
  })();
  isMultiSelect = selectedNodes.length > 1;
  selectedNodes.length > 0 ? getCommonValue((n) => n.pitch, 60) : 60;
  selectedNodes.length > 0 ? getCommonValue((n) => n.velocity, 1) : 1;
  selectedNodes.length > 0 ? getCommonValue((n) => n.division, 1) : 1;
  return `${activeItem && isRootNode ? `<div class="sidebar"><div class="sidebar-header"><h2>${escape(selectedPattern ? "Pattern Settings" : "Instrument Settings")}</h2> <button class="close-btn" data-svelte-h="svelte-nt99sh">Close</button></div> <div class="sidebar-content">${validate_component(InstrumentSelector, "InstrumentSelector").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      isRootNode,
      selectedInstrumentId: selection.selectedInstrumentId,
      selectedInstrument
    },
    {},
    {}
  )} ${validate_component(MixerControls, "MixerControls").$$render($$result, { selectedTrack, selectedInstrument }, {}, {})} ${validate_component(SynthParameters, "SynthParameters").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedInstrument,
      trackSettings
    },
    {},
    {}
  )}</div></div>` : `${activeItem && selectedNodes.length > 0 && !isRootNode ? `<div class="sidebar"><div class="sidebar-header"><h2 data-svelte-h="svelte-14kktj1">Note Settings</h2> <button class="close-btn" data-svelte-h="svelte-nt99sh">Close</button></div> <div class="sidebar-content">${validate_component(NoteControls, "NoteControls").$$render(
    $$result,
    {
      selectedTrack,
      selectedPattern,
      selectedNodes,
      isMelodicInstrument,
      isMultiSelect,
      getCommonValue,
      hasMixedValues,
      activeItem
    },
    {},
    {}
  )}</div></div>` : ``}`}`;
});
const KEY_HEIGHT = 20;
const VELOCITY_STEPS$1 = 50;
const MidiEditor = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let editorMode;
  let shouldShow;
  let showPitchEditor;
  let showVelocityEditor;
  let selectedNodes;
  let selectedNodesForPitch;
  let allPianoKeys;
  let totalKeysHeight;
  let velocityRows;
  let totalVelocityRowsHeight;
  let selectedTrack;
  let $editorModeStore, $$unsubscribe_editorModeStore;
  $$unsubscribe_editorModeStore = subscribe(editorModeStore, (value) => $editorModeStore = value);
  let project;
  let selection;
  engineStore.subscribe((e) => e);
  let editorContainer;
  let gridArea;
  let pianoKeysContainer;
  let gridContainer;
  let columnWidth = 60;
  let hasAutoScrolled = false;
  let previousShouldShow = false;
  projectStore.subscribe((p) => project = p);
  selectionStore.subscribe((s) => selection = s);
  const melodicInstruments = ["bass", "subtractive", "fm", "wavetable", "supersaw", "pluck", "pad", "organ"];
  const drumInstruments = ["kick", "snare", "hihat", "clap", "tom", "cymbal", "shaker", "rimshot"];
  const pitchEditableInstruments = [...melodicInstruments, ...drumInstruments];
  const FULL_PITCH_RANGE = { min: 12, max: 108 };
  editorMode = $editorModeStore;
  selectedNodes = (() => {
    if (!project || !selection) return [];
    if (selection.selectedNodes.size < 2) {
      return [];
    }
    let track = null;
    if (selection.selectedTrackId) {
      track = project.standaloneInstruments?.find((i) => i.id === selection.selectedTrackId);
    }
    if (!track && selection.selectedPatternId && selection.selectedInstrumentId) {
      const pattern = project.patterns?.find((p) => p.id === selection.selectedPatternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        track = instruments.find((inst) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
      }
    }
    if (!track || !track.patternTree) return [];
    if (!pitchEditableInstruments.includes(track.instrumentType)) {
      return [];
    }
    const nodes = [];
    let index = 0;
    const findNodes = (node) => {
      if (selection.selectedNodes.has(node.id) && (!node.children || node.children.length === 0)) {
        nodes.push({ node, nodeId: node.id, index: index++ });
      }
      for (const child of node.children) {
        findNodes(child);
      }
    };
    findNodes(track.patternTree);
    return nodes;
  })();
  shouldShow = selectedNodes.length >= 2;
  selectedNodesForPitch = selectedNodes.filter(({ node }) => {
    const velocity = node.velocity ?? 1;
    return velocity > 0;
  });
  {
    if (shouldShow && !previousShouldShow && selectedNodes.length > 0) {
      if (selectedNodesForPitch.length > 0) {
        editorModeStore.setMode("pitch");
      } else {
        editorModeStore.setMode("velocity");
      }
      previousShouldShow = true;
    }
  }
  showPitchEditor = shouldShow && editorMode === "pitch" && selectedNodesForPitch.length > 0;
  showVelocityEditor = shouldShow && editorMode === "velocity";
  {
    {
      if (typeof document !== "undefined") {
        if (shouldShow) {
          document.body.classList.add("midi-editor-visible");
        } else {
          document.body.classList.remove("midi-editor-visible");
        }
      }
    }
  }
  {
    if (showPitchEditor && previousShouldShow && !hasAutoScrolled && selectedNodesForPitch.length > 0) {
      hasAutoScrolled = false;
      setTimeout(
        () => {
        },
        150
      );
    } else if (!shouldShow && previousShouldShow) {
      previousShouldShow = false;
      hasAutoScrolled = false;
    }
  }
  {
    if (showVelocityEditor && !previousShouldShow && selectedNodes.length > 0) {
      setTimeout(
        () => {
        },
        150
      );
    }
  }
  allPianoKeys = (() => {
    const keys = [];
    for (let pitch = FULL_PITCH_RANGE.max; pitch >= FULL_PITCH_RANGE.min; pitch--) {
      const noteName = midiToNoteName(pitch);
      const isBlack = noteName.includes("#");
      keys.push({ pitch, noteName, isBlack });
    }
    return keys;
  })();
  totalKeysHeight = allPianoKeys.length * KEY_HEIGHT;
  velocityRows = (() => {
    const rows = [];
    for (let i = VELOCITY_STEPS$1; i >= 0; i--) {
      const velocity = i / VELOCITY_STEPS$1;
      rows.push({
        velocity,
        value: Math.round(velocity * 100)
      });
    }
    return rows;
  })();
  totalVelocityRowsHeight = velocityRows.length * KEY_HEIGHT;
  selectedTrack = (() => {
    if (!shouldShow || !project) return null;
    if (selection.selectedTrackId) {
      return project.standaloneInstruments?.find((i) => i.id === selection.selectedTrackId) || null;
    }
    if (selection.selectedPatternId && selection.selectedInstrumentId) {
      const pattern = project.patterns?.find((p) => p.id === selection.selectedPatternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        return instruments.find((inst) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
      }
    }
    return null;
  })();
  $$unsubscribe_editorModeStore();
  return `${shouldShow && selectedNodes.length > 0 ? `<div class="midi-editor"${add_attribute("this", editorContainer, 0)}> <div class="editor-mode-toggle"><button class="${["mode-btn", editorMode === "pitch" ? "active" : ""].join(" ").trim()}" title="Pitch Editor" data-svelte-h="svelte-1194ees">Pitch</button> <button class="${["mode-btn", editorMode === "velocity" ? "active" : ""].join(" ").trim()}" title="Velocity Editor" data-svelte-h="svelte-m7vjnc">Velocity</button></div> <div class="piano-roll-container">${showPitchEditor ? ` <div class="piano-keys"${add_attribute("this", pianoKeysContainer, 0)}><div class="piano-keys-content" style="${"height: " + escape(totalKeysHeight, true) + "px"}">${each(allPianoKeys, (key) => {
    return `<div class="${"piano-key " + escape(key.isBlack ? "black" : "white", true)}" style="${"height: " + escape(KEY_HEIGHT, true) + "px"}"><span class="key-label">${escape(key.noteName)}</span> </div>`;
  })}</div></div>  <div class="grid-area"${add_attribute("this", gridArea, 0)}><div class="grid-container"${add_attribute("this", gridContainer, 0)}><div class="grid-content" style="${"height: " + escape(totalKeysHeight, true) + "px"}">${each(selectedNodesForPitch, ({ node, nodeId }, columnIndex) => {
    let currentPitch = node.pitch ?? 60;
    return ` <div class="grid-column" style="${"width: " + escape(columnWidth, true) + "px"}">${each(allPianoKeys, (key) => {
      let isActive = key.pitch === currentPitch;
      return ` <div class="${"grid-cell " + escape(key.isBlack ? "black" : "white", true) + " " + escape(isActive ? "active" : "", true)}" style="${"height: " + escape(KEY_HEIGHT, true) + "px"}" role="gridcell" tabindex="0">${isActive ? `<div class="note-block" style="${"background-color: " + escape(selectedTrack?.color || "#7ab8ff", true)}"><span class="note-label">${escape(key.noteName)}</span> </div>` : ``} </div>`;
    })} </div>`;
  })}</div></div></div>` : `${showVelocityEditor ? ` <div class="piano-keys"${add_attribute("this", pianoKeysContainer, 0)}><div class="piano-keys-content" style="${"height: " + escape(totalVelocityRowsHeight, true) + "px"}">${each(velocityRows, (row) => {
    return `<div class="piano-key white" style="${"height: " + escape(KEY_HEIGHT, true) + "px"}"><span class="key-label">${escape(row.value)}%</span> </div>`;
  })}</div></div>  <div class="grid-area"${add_attribute("this", gridArea, 0)}><div class="grid-container"${add_attribute("this", gridContainer, 0)}><div class="grid-content" style="${"height: " + escape(totalVelocityRowsHeight, true) + "px"}">${each(selectedNodes, ({ node, nodeId }, columnIndex) => {
    let currentVelocity = node.velocity ?? 1;
    return ` <div class="grid-column" style="${"width: " + escape(columnWidth, true) + "px"}">${each(velocityRows, (row) => {
      let isActive = Math.abs(row.velocity - currentVelocity) < 1 / VELOCITY_STEPS$1 / 2;
      return ` <div class="${"grid-cell white " + escape(isActive ? "active" : "", true)}" style="${"height: " + escape(KEY_HEIGHT, true) + "px"}" role="gridcell" tabindex="0">${isActive ? `<div class="note-block" style="${"background-color: " + escape(selectedTrack?.color || "#7ab8ff", true)}"><span class="note-label">${escape(Math.round(currentVelocity * 100))}%</span> </div>` : ``} </div>`;
    })} </div>`;
  })}</div></div></div>` : ``}`}</div></div>` : ``}`;
});
const ROW_HEIGHT = 20;
const VELOCITY_STEPS = 50;
const VelocityEditor = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let shouldShow;
  let selectedNodes;
  let velocityRows;
  let totalRowsHeight;
  let selectedTrack;
  let project;
  let selection;
  let editorContainer;
  let gridArea;
  let scaleContainer;
  let gridContainer;
  let columnWidth = 60;
  let previousShouldShow = false;
  projectStore.subscribe((p) => project = p);
  selectionStore.subscribe((s) => selection = s);
  const pitchEditableInstruments = [
    "bass",
    "subtractive",
    "fm",
    "wavetable",
    "supersaw",
    "pluck",
    "pad",
    "organ",
    "kick",
    "snare",
    "hihat",
    "clap",
    "tom",
    "cymbal",
    "shaker",
    "rimshot"
  ];
  shouldShow = (() => {
    if (!project || selection.selectedNodes.size < 2) {
      return false;
    }
    let track = null;
    if (selection.selectedTrackId) {
      track = project.standaloneInstruments?.find((i) => i.id === selection.selectedTrackId);
    }
    if (!track && selection.selectedPatternId && selection.selectedInstrumentId) {
      const pattern = project.patterns?.find((p) => p.id === selection.selectedPatternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        track = instruments.find((inst) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
      }
    }
    if (!track) return false;
    return !pitchEditableInstruments.includes(track.instrumentType);
  })();
  {
    {
      if (typeof document !== "undefined") {
        if (shouldShow) {
          document.body.classList.add("velocity-editor-visible");
          document.body.classList.add("midi-editor-visible");
        } else {
          document.body.classList.remove("velocity-editor-visible");
          if (!document.body.classList.contains("midi-editor-visible")) ;
        }
      }
    }
  }
  selectedNodes = (() => {
    if (!shouldShow || !project) return [];
    let track = null;
    if (selection.selectedTrackId) {
      track = project.standaloneInstruments?.find((i) => i.id === selection.selectedTrackId);
    }
    if (!track && selection.selectedPatternId && selection.selectedInstrumentId) {
      const pattern = project.patterns?.find((p) => p.id === selection.selectedPatternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        track = instruments.find((inst) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
      }
    }
    if (!track) return [];
    const nodes = [];
    let index = 0;
    const findNodes = (node) => {
      if (selection.selectedNodes.has(node.id) && (!node.children || node.children.length === 0)) {
        nodes.push({ node, nodeId: node.id, index: index++ });
      }
      for (const child of node.children) {
        findNodes(child);
      }
    };
    findNodes(track.patternTree);
    return nodes;
  })();
  velocityRows = (() => {
    const rows = [];
    for (let i = VELOCITY_STEPS; i >= 0; i--) {
      const velocity = i / VELOCITY_STEPS;
      rows.push({
        velocity,
        value: Math.round(velocity * 100)
      });
    }
    return rows;
  })();
  totalRowsHeight = velocityRows.length * ROW_HEIGHT;
  {
    if (shouldShow && !previousShouldShow && selectedNodes.length > 0) {
      previousShouldShow = true;
      setTimeout(
        () => {
        },
        150
      );
    } else if (!shouldShow && previousShouldShow) {
      previousShouldShow = false;
    } else if (shouldShow) {
      previousShouldShow = true;
    }
  }
  selectedTrack = (() => {
    if (!shouldShow || !project) return null;
    if (selection.selectedTrackId) {
      return project.standaloneInstruments?.find((i) => i.id === selection.selectedTrackId) || null;
    }
    if (selection.selectedPatternId && selection.selectedInstrumentId) {
      const pattern = project.patterns?.find((p) => p.id === selection.selectedPatternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        return instruments.find((inst) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
      }
    }
    return null;
  })();
  return `${shouldShow && selectedNodes.length > 0 ? `<div class="velocity-editor"${add_attribute("this", editorContainer, 0)}><div class="velocity-roll-container"> <div class="velocity-scale"${add_attribute("this", scaleContainer, 0)}><div class="velocity-scale-content" style="${"height: " + escape(totalRowsHeight, true) + "px"}">${each(velocityRows, (row) => {
    return `<div class="velocity-scale-row" style="${"height: " + escape(ROW_HEIGHT, true) + "px"}"><span class="scale-label">${escape(row.value)}%</span> </div>`;
  })}</div></div>  <div class="grid-area"${add_attribute("this", gridArea, 0)}><div class="grid-container"${add_attribute("this", gridContainer, 0)}><div class="grid-content" style="${"height: " + escape(totalRowsHeight, true) + "px"}">${each(selectedNodes, ({ node, nodeId }, columnIndex) => {
    let currentVelocity = node.velocity ?? 1;
    return ` <div class="grid-column" style="${"width: " + escape(columnWidth, true) + "px"}">${each(velocityRows, (row) => {
      let isActive = Math.abs(row.velocity - currentVelocity) < 1 / VELOCITY_STEPS / 2;
      return ` <div class="${"grid-cell " + escape(isActive ? "active" : "", true)}" style="${"height: " + escape(ROW_HEIGHT, true) + "px"}" role="gridcell" tabindex="0">${isActive ? `<div class="velocity-block" style="${"background-color: " + escape(selectedTrack?.color || "#7ab8ff", true)}"><span class="velocity-label">${escape(Math.round(currentVelocity * 100))}%</span> </div>` : ``} </div>`;
    })} </div>`;
  })}</div></div></div></div></div>` : ``}`;
});
const css$2 = {
  code: ".param-grid.four-column.svelte-jswoc3{grid-template-columns:repeat(4, 1fr)}",
  map: `{"version":3,"file":"PadSynthPlugin.svelte","sources":["PadSynthPlugin.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { projectStore } from \\"$lib/stores/projectStore\\";\\nimport { engineStore } from \\"$lib/stores/engineStore\\";\\nimport { getSelectValue } from \\"../sidebar/sidebarUtils\\";\\nimport ParamControl from \\"../sidebar/ParamControl.svelte\\";\\nimport \\"$lib/styles/components/SynthPluginWindow.css\\";\\nexport let selectedTrack = void 0;\\nexport let selectedPattern = void 0;\\nexport let selectedInstrument = void 0;\\nexport let trackSettings;\\nlet engine = null;\\nengineStore.subscribe((e) => engine = e);\\n$: activeItem = selectedInstrument || selectedTrack;\\nfunction updateSetting(key, value) {\\n  if (!activeItem) return;\\n  let processedValue = value;\\n  if (typeof value === \\"number\\") {\\n    if (isNaN(value)) return;\\n    if (key === \\"attack\\" || key === \\"decay\\") {\\n      processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));\\n    } else if (key === \\"release\\") {\\n      processedValue = Math.max(0, Math.min(3, parseFloat(value.toFixed(2))));\\n    } else if (key === \\"sustain\\") {\\n      processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));\\n    } else if (key === \\"filterCutoff\\") {\\n      processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));\\n    } else if (key === \\"filterResonance\\") {\\n      processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));\\n    } else if (key === \\"filterLfoAmount\\") {\\n      processedValue = Math.max(0, Math.min(5e3, parseFloat(value.toFixed(0))));\\n    } else {\\n      processedValue = parseFloat(value.toFixed(2));\\n    }\\n  }\\n  const newSettings = { ...activeItem.settings, [key]: processedValue };\\n  const instrumentSettings = activeItem.instrumentSettings || {};\\n  if (activeItem.instrumentType) {\\n    instrumentSettings[activeItem.instrumentType] = { ...newSettings };\\n  }\\n  if (selectedPattern && selectedInstrument) {\\n    projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {\\n      settings: newSettings,\\n      instrumentSettings\\n    });\\n    if (engine) {\\n      const patternTrackId = \`__pattern_\${selectedPattern.id}_\${selectedInstrument.id}\`;\\n      engine.updateTrackSettings(patternTrackId, newSettings);\\n    }\\n  } else if (selectedTrack) {\\n    projectStore.updateTrack(selectedTrack.id, {\\n      settings: newSettings,\\n      instrumentSettings\\n    });\\n    if (engine) {\\n      engine.updateTrackSettings(selectedTrack.id, newSettings);\\n    }\\n  }\\n}\\n<\/script>\\r\\n\\r\\n<div class=\\"synth-plugin\\">\\r\\n\\t<!-- Oscillator Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">Oscillator</div>\\r\\n\\t\\t<div class=\\"param-grid two-column\\">\\r\\n\\t\\t\\t<div class=\\"param\\">\\r\\n\\t\\t\\t\\t<label for=\\"pad-osc-type\\">Waveform</label>\\r\\n\\t\\t\\t\\t<select\\r\\n\\t\\t\\t\\t\\tid=\\"pad-osc-type\\"\\r\\n\\t\\t\\t\\t\\tvalue={trackSettings.oscType ?? 'saw'}\\r\\n\\t\\t\\t\\t\\ton:change={(e) => updateSetting('oscType', getSelectValue(e) || 'saw')}\\r\\n\\t\\t\\t\\t>\\r\\n\\t\\t\\t\\t\\t<option value=\\"saw\\">Sawtooth</option>\\r\\n\\t\\t\\t\\t\\t<option value=\\"square\\">Square</option>\\r\\n\\t\\t\\t\\t\\t<option value=\\"sine\\">Sine</option>\\r\\n\\t\\t\\t\\t\\t<option value=\\"triangle\\">Triangle</option>\\r\\n\\t\\t\\t\\t</select>\\r\\n\\t\\t\\t</div>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-num-osc\\"\\r\\n\\t\\t\\t\\tlabel=\\"Oscillators\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.numOscillators ?? 8}\\r\\n\\t\\t\\t\\tmin={4}\\r\\n\\t\\t\\t\\tmax={16}\\r\\n\\t\\t\\t\\tstep={1}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('numOscillators', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t\\t<div class=\\"param-grid three-column\\">\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-detune\\"\\r\\n\\t\\t\\t\\tlabel=\\"Detune\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.detune ?? 0.15}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('detune', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-spread\\"\\r\\n\\t\\t\\t\\tlabel=\\"Spread\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.spread ?? 0.7}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('spread', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n\\r\\n\\t<!-- Filter Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">Filter</div>\\r\\n\\t\\t<div class=\\"param-grid two-column\\">\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-filter-cutoff\\"\\r\\n\\t\\t\\t\\tlabel=\\"Cutoff (Hz)\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.filterCutoff ?? 4000}\\r\\n\\t\\t\\t\\tmin={20}\\r\\n\\t\\t\\t\\tmax={20000}\\r\\n\\t\\t\\t\\tstep={10}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('filterCutoff', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-filter-resonance\\"\\r\\n\\t\\t\\t\\tlabel=\\"Resonance\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.filterResonance ?? 0.3}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('filterResonance', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n\\r\\n\\t<!-- LFO Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">LFO Modulation</div>\\r\\n\\t\\t<div class=\\"param-grid\\">\\r\\n\\t\\t\\t<div class=\\"param-grid two-column\\">\\r\\n\\t\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\t\\tid=\\"pad-pitch-lfo-rate\\"\\r\\n\\t\\t\\t\\t\\tlabel=\\"Pitch LFO Rate\\"\\r\\n\\t\\t\\t\\t\\tvalue={trackSettings.pitchLfoRate ?? 0.5}\\r\\n\\t\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\t\\tmax={10}\\r\\n\\t\\t\\t\\t\\tstep={0.1}\\r\\n\\t\\t\\t\\t\\tonUpdate={(v) => updateSetting('pitchLfoRate', v)}\\r\\n\\t\\t\\t\\t/>\\r\\n\\t\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\t\\tid=\\"pad-pitch-lfo-amount\\"\\r\\n\\t\\t\\t\\t\\tlabel=\\"Pitch LFO Amount\\"\\r\\n\\t\\t\\t\\t\\tvalue={trackSettings.pitchLfoAmount ?? 0.02}\\r\\n\\t\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\t\\tmax={0.5}\\r\\n\\t\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\t\\tonUpdate={(v) => updateSetting('pitchLfoAmount', v)}\\r\\n\\t\\t\\t\\t/>\\r\\n\\t\\t\\t</div>\\r\\n\\t\\t\\t<div class=\\"param-grid two-column\\">\\r\\n\\t\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\t\\tid=\\"pad-filter-lfo-rate\\"\\r\\n\\t\\t\\t\\t\\tlabel=\\"Filter LFO Rate\\"\\r\\n\\t\\t\\t\\t\\tvalue={trackSettings.filterLfoRate ?? 0.3}\\r\\n\\t\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\t\\tmax={5}\\r\\n\\t\\t\\t\\t\\tstep={0.1}\\r\\n\\t\\t\\t\\t\\tonUpdate={(v) => updateSetting('filterLfoRate', v)}\\r\\n\\t\\t\\t\\t/>\\r\\n\\t\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\t\\tid=\\"pad-filter-lfo-amount\\"\\r\\n\\t\\t\\t\\t\\tlabel=\\"Filter LFO Amount\\"\\r\\n\\t\\t\\t\\t\\tvalue={trackSettings.filterLfoAmount ?? 1000}\\r\\n\\t\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\t\\tmax={5000}\\r\\n\\t\\t\\t\\t\\tstep={10}\\r\\n\\t\\t\\t\\t\\tonUpdate={(v) => updateSetting('filterLfoAmount', v)}\\r\\n\\t\\t\\t\\t/>\\r\\n\\t\\t\\t</div>\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n\\r\\n\\t<!-- Envelope Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">Envelope</div>\\r\\n\\t\\t<div class=\\"param-grid four-column\\">\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-attack\\"\\r\\n\\t\\t\\t\\tlabel=\\"Attack\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.attack ?? 0.5}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('attack', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-decay\\"\\r\\n\\t\\t\\t\\tlabel=\\"Decay\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.decay ?? 0.3}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('decay', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-sustain\\"\\r\\n\\t\\t\\t\\tlabel=\\"Sustain\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.sustain ?? 0.9}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('sustain', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"pad-release\\"\\r\\n\\t\\t\\t\\tlabel=\\"Release\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.release ?? 1.5}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={3}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('release', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n</div>\\r\\n\\r\\n<style>\\r\\n\\t.param-grid.four-column {\\r\\n\\t\\tgrid-template-columns: repeat(4, 1fr);\\r\\n\\t}\\r\\n</style>\\r\\n\\r\\n"],"names":[],"mappings":"AAkOC,WAAW,0BAAa,CACvB,qBAAqB,CAAE,OAAO,CAAC,CAAC,CAAC,GAAG,CACrC"}`
};
const PadSynthPlugin = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "release") {
        processedValue = Math.max(0, Math.min(3, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterCutoff") {
        processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));
      } else if (key === "filterResonance") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterLfoAmount") {
        processedValue = Math.max(0, Math.min(5e3, parseFloat(value.toFixed(0))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  $$result.css.add(css$2);
  activeItem = selectedInstrument || selectedTrack;
  return `<div class="synth-plugin"> <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-24p4tz">Oscillator</div> <div class="param-grid two-column"><div class="param"><label for="pad-osc-type" data-svelte-h="svelte-1b02dl3">Waveform</label> <select id="pad-osc-type"${add_attribute("value", trackSettings.oscType ?? "saw", 0)}><option value="saw" data-svelte-h="svelte-hfmaw8">Sawtooth</option><option value="square" data-svelte-h="svelte-bkgndu">Square</option><option value="sine" data-svelte-h="svelte-1mpn6cq">Sine</option><option value="triangle" data-svelte-h="svelte-1f5nbzi">Triangle</option></select></div> ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-num-osc",
      label: "Oscillators",
      value: trackSettings.numOscillators ?? 8,
      min: 4,
      max: 16,
      step: 1,
      onUpdate: (v) => updateSetting("numOscillators", v)
    },
    {},
    {}
  )}</div> <div class="param-grid three-column">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-detune",
      label: "Detune",
      value: trackSettings.detune ?? 0.15,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("detune", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-spread",
      label: "Spread",
      value: trackSettings.spread ?? 0.7,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("spread", v)
    },
    {},
    {}
  )}</div></div>  <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-10czic3">Filter</div> <div class="param-grid two-column">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-cutoff",
      label: "Cutoff (Hz)",
      value: trackSettings.filterCutoff ?? 4e3,
      min: 20,
      max: 2e4,
      step: 10,
      onUpdate: (v) => updateSetting("filterCutoff", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-resonance",
      label: "Resonance",
      value: trackSettings.filterResonance ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("filterResonance", v)
    },
    {},
    {}
  )}</div></div>  <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-9y8pj0">LFO Modulation</div> <div class="param-grid"><div class="param-grid two-column">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-pitch-lfo-rate",
      label: "Pitch LFO Rate",
      value: trackSettings.pitchLfoRate ?? 0.5,
      min: 0,
      max: 10,
      step: 0.1,
      onUpdate: (v) => updateSetting("pitchLfoRate", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-pitch-lfo-amount",
      label: "Pitch LFO Amount",
      value: trackSettings.pitchLfoAmount ?? 0.02,
      min: 0,
      max: 0.5,
      step: 0.01,
      onUpdate: (v) => updateSetting("pitchLfoAmount", v)
    },
    {},
    {}
  )}</div> <div class="param-grid two-column">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-lfo-rate",
      label: "Filter LFO Rate",
      value: trackSettings.filterLfoRate ?? 0.3,
      min: 0,
      max: 5,
      step: 0.1,
      onUpdate: (v) => updateSetting("filterLfoRate", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-filter-lfo-amount",
      label: "Filter LFO Amount",
      value: trackSettings.filterLfoAmount ?? 1e3,
      min: 0,
      max: 5e3,
      step: 10,
      onUpdate: (v) => updateSetting("filterLfoAmount", v)
    },
    {},
    {}
  )}</div></div></div>  <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-1d2koqh">Envelope</div> <div class="param-grid four-column svelte-jswoc3">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-attack",
      label: "Attack",
      value: trackSettings.attack ?? 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-decay",
      label: "Decay",
      value: trackSettings.decay ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-sustain",
      label: "Sustain",
      value: trackSettings.sustain ?? 0.9,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "pad-release",
      label: "Release",
      value: trackSettings.release ?? 1.5,
      min: 0,
      max: 3,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}</div></div> </div>`;
});
const css$1 = {
  code: ".param-grid.four-column.svelte-jswoc3{grid-template-columns:repeat(4, 1fr)}",
  map: `{"version":3,"file":"OrganSynthPlugin.svelte","sources":["OrganSynthPlugin.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { projectStore } from \\"$lib/stores/projectStore\\";\\nimport { engineStore } from \\"$lib/stores/engineStore\\";\\nimport ParamControl from \\"../sidebar/ParamControl.svelte\\";\\nimport \\"$lib/styles/components/SynthPluginWindow.css\\";\\nexport let selectedTrack = void 0;\\nexport let selectedPattern = void 0;\\nexport let selectedInstrument = void 0;\\nexport let trackSettings;\\nlet engine = null;\\nengineStore.subscribe((e) => engine = e);\\n$: activeItem = selectedInstrument || selectedTrack;\\n$: drawbarLabels = [\\"16'\\", \\"5 1/3'\\", \\"8'\\", \\"4'\\", \\"2 2/3'\\", \\"2'\\", \\"1 3/5'\\", \\"1 1/3'\\", \\"1'\\"];\\n$: drawbars = trackSettings.drawbars ?? [0.8, 0, 1, 0, 0.6, 0, 0.4, 0, 0.2];\\nfunction updateSetting(key, value) {\\n  if (!activeItem) return;\\n  let processedValue = value;\\n  if (typeof value === \\"number\\") {\\n    if (isNaN(value)) return;\\n    if (key === \\"attack\\" || key === \\"decay\\" || key === \\"release\\") {\\n      processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));\\n    } else if (key === \\"sustain\\") {\\n      processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));\\n    } else if (key === \\"filterCutoff\\") {\\n      processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));\\n    } else if (key === \\"filterResonance\\") {\\n      processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));\\n    } else {\\n      processedValue = parseFloat(value.toFixed(2));\\n    }\\n  }\\n  const newSettings = { ...activeItem.settings, [key]: processedValue };\\n  const instrumentSettings = activeItem.instrumentSettings || {};\\n  if (activeItem.instrumentType) {\\n    instrumentSettings[activeItem.instrumentType] = { ...newSettings };\\n  }\\n  if (selectedPattern && selectedInstrument) {\\n    projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {\\n      settings: newSettings,\\n      instrumentSettings\\n    });\\n    if (engine) {\\n      const patternTrackId = \`__pattern_\${selectedPattern.id}_\${selectedInstrument.id}\`;\\n      engine.updateTrackSettings(patternTrackId, newSettings);\\n    }\\n  } else if (selectedTrack) {\\n    projectStore.updateTrack(selectedTrack.id, {\\n      settings: newSettings,\\n      instrumentSettings\\n    });\\n    if (engine) {\\n      engine.updateTrackSettings(selectedTrack.id, newSettings);\\n    }\\n  }\\n}\\nfunction updateDrawbar(index, value) {\\n  if (!activeItem) return;\\n  const newDrawbars = [...drawbars];\\n  newDrawbars[index] = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));\\n  updateSetting(\\"drawbars\\", newDrawbars);\\n}\\n<\/script>\\r\\n\\r\\n<div class=\\"synth-plugin\\">\\r\\n\\t<!-- Drawbars Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">Drawbars</div>\\r\\n\\t\\t<div class=\\"drawbar-container\\">\\r\\n\\t\\t\\t{#each drawbars as drawbar, i}\\r\\n\\t\\t\\t\\t<div class=\\"drawbar-row\\">\\r\\n\\t\\t\\t\\t\\t<div class=\\"drawbar-label\\">{drawbarLabels[i]}</div>\\r\\n\\t\\t\\t\\t\\t<div class=\\"drawbar-slider\\">\\r\\n\\t\\t\\t\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\t\\t\\t\\tid=\\"organ-drawbar-{i}\\"\\r\\n\\t\\t\\t\\t\\t\\t\\tlabel=\\"\\"\\r\\n\\t\\t\\t\\t\\t\\t\\tvalue={drawbar}\\r\\n\\t\\t\\t\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\t\\t\\t\\tonUpdate={(v) => updateDrawbar(i, v)}\\r\\n\\t\\t\\t\\t\\t\\t/>\\r\\n\\t\\t\\t\\t\\t</div>\\r\\n\\t\\t\\t\\t\\t<div class=\\"drawbar-value\\">{Math.round(drawbar * 100)}%</div>\\r\\n\\t\\t\\t\\t</div>\\r\\n\\t\\t\\t{/each}\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n\\r\\n\\t<!-- Rotary Speaker Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">Rotary Speaker</div>\\r\\n\\t\\t<div class=\\"param-grid two-column\\">\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-rotary-speed\\"\\r\\n\\t\\t\\t\\tlabel=\\"Speed (Hz)\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.rotarySpeed ?? 4.0}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={10}\\r\\n\\t\\t\\t\\tstep={0.1}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('rotarySpeed', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-rotary-depth\\"\\r\\n\\t\\t\\t\\tlabel=\\"Depth\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.rotaryDepth ?? 0.3}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('rotaryDepth', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n\\r\\n\\t<!-- Filter Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">Filter</div>\\r\\n\\t\\t<div class=\\"param-grid two-column\\">\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-filter-cutoff\\"\\r\\n\\t\\t\\t\\tlabel=\\"Cutoff (Hz)\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.filterCutoff ?? 8000}\\r\\n\\t\\t\\t\\tmin={20}\\r\\n\\t\\t\\t\\tmax={20000}\\r\\n\\t\\t\\t\\tstep={10}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('filterCutoff', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-filter-resonance\\"\\r\\n\\t\\t\\t\\tlabel=\\"Resonance\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.filterResonance ?? 0.2}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('filterResonance', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n\\r\\n\\t<!-- Envelope Section -->\\r\\n\\t<div class=\\"param-group\\">\\r\\n\\t\\t<div class=\\"param-group-title\\">Envelope</div>\\r\\n\\t\\t<div class=\\"param-grid four-column\\">\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-attack\\"\\r\\n\\t\\t\\t\\tlabel=\\"Attack\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.attack ?? 0.01}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('attack', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-decay\\"\\r\\n\\t\\t\\t\\tlabel=\\"Decay\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.decay ?? 0.1}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('decay', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-sustain\\"\\r\\n\\t\\t\\t\\tlabel=\\"Sustain\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.sustain ?? 1.0}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('sustain', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t\\t<ParamControl\\r\\n\\t\\t\\t\\tid=\\"organ-release\\"\\r\\n\\t\\t\\t\\tlabel=\\"Release\\"\\r\\n\\t\\t\\t\\tvalue={trackSettings.release ?? 0.2}\\r\\n\\t\\t\\t\\tmin={0}\\r\\n\\t\\t\\t\\tmax={1}\\r\\n\\t\\t\\t\\tstep={0.01}\\r\\n\\t\\t\\t\\tonUpdate={(v) => updateSetting('release', v)}\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t</div>\\r\\n</div>\\r\\n\\r\\n<style>\\r\\n\\t.param-grid.four-column {\\r\\n\\t\\tgrid-template-columns: repeat(4, 1fr);\\r\\n\\t}\\r\\n</style>\\r\\n\\r\\n"],"names":[],"mappings":"AAsLC,WAAW,0BAAa,CACvB,qBAAqB,CAAE,OAAO,CAAC,CAAC,CAAC,GAAG,CACrC"}`
};
const OrganSynthPlugin = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let activeItem;
  let drawbarLabels;
  let drawbars;
  let { selectedTrack = void 0 } = $$props;
  let { selectedPattern = void 0 } = $$props;
  let { selectedInstrument = void 0 } = $$props;
  let { trackSettings } = $$props;
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function updateSetting(key, value) {
    if (!activeItem) return;
    let processedValue = value;
    if (typeof value === "number") {
      if (isNaN(value)) return;
      if (key === "attack" || key === "decay" || key === "release") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "sustain") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else if (key === "filterCutoff") {
        processedValue = Math.max(20, Math.min(2e4, parseFloat(value.toFixed(0))));
      } else if (key === "filterResonance") {
        processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
      } else {
        processedValue = parseFloat(value.toFixed(2));
      }
    }
    const newSettings = {
      ...activeItem.settings,
      [key]: processedValue
    };
    const instrumentSettings = activeItem.instrumentSettings || {};
    if (activeItem.instrumentType) {
      instrumentSettings[activeItem.instrumentType] = { ...newSettings };
    }
    if (selectedPattern && selectedInstrument) {
      projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
        engine.updateTrackSettings(patternTrackId, newSettings);
      }
    } else if (selectedTrack) {
      projectStore.updateTrack(selectedTrack.id, {
        settings: newSettings,
        instrumentSettings
      });
      if (engine) {
        engine.updateTrackSettings(selectedTrack.id, newSettings);
      }
    }
  }
  function updateDrawbar(index, value) {
    if (!activeItem) return;
    const newDrawbars = [...drawbars];
    newDrawbars[index] = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
    updateSetting("drawbars", newDrawbars);
  }
  if ($$props.selectedTrack === void 0 && $$bindings.selectedTrack && selectedTrack !== void 0) $$bindings.selectedTrack(selectedTrack);
  if ($$props.selectedPattern === void 0 && $$bindings.selectedPattern && selectedPattern !== void 0) $$bindings.selectedPattern(selectedPattern);
  if ($$props.selectedInstrument === void 0 && $$bindings.selectedInstrument && selectedInstrument !== void 0) $$bindings.selectedInstrument(selectedInstrument);
  if ($$props.trackSettings === void 0 && $$bindings.trackSettings && trackSettings !== void 0) $$bindings.trackSettings(trackSettings);
  $$result.css.add(css$1);
  activeItem = selectedInstrument || selectedTrack;
  drawbarLabels = ["16'", "5 1/3'", "8'", "4'", "2 2/3'", "2'", "1 3/5'", "1 1/3'", "1'"];
  drawbars = trackSettings.drawbars ?? [0.8, 0, 1, 0, 0.6, 0, 0.4, 0, 0.2];
  return `<div class="synth-plugin"> <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-19dpm1">Drawbars</div> <div class="drawbar-container">${each(drawbars, (drawbar, i) => {
    return `<div class="drawbar-row"><div class="drawbar-label">${escape(drawbarLabels[i])}</div> <div class="drawbar-slider">${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      {
        id: "organ-drawbar-" + i,
        label: "",
        value: drawbar,
        min: 0,
        max: 1,
        step: 0.01,
        onUpdate: (v) => updateDrawbar(i, v)
      },
      {},
      {}
    )}</div> <div class="drawbar-value">${escape(Math.round(drawbar * 100))}%</div> </div>`;
  })}</div></div>  <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-1qq2zjd">Rotary Speaker</div> <div class="param-grid two-column">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-rotary-speed",
      label: "Speed (Hz)",
      value: trackSettings.rotarySpeed ?? 4,
      min: 0,
      max: 10,
      step: 0.1,
      onUpdate: (v) => updateSetting("rotarySpeed", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-rotary-depth",
      label: "Depth",
      value: trackSettings.rotaryDepth ?? 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("rotaryDepth", v)
    },
    {},
    {}
  )}</div></div>  <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-10czic3">Filter</div> <div class="param-grid two-column">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-filter-cutoff",
      label: "Cutoff (Hz)",
      value: trackSettings.filterCutoff ?? 8e3,
      min: 20,
      max: 2e4,
      step: 10,
      onUpdate: (v) => updateSetting("filterCutoff", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-filter-resonance",
      label: "Resonance",
      value: trackSettings.filterResonance ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("filterResonance", v)
    },
    {},
    {}
  )}</div></div>  <div class="param-group"><div class="param-group-title" data-svelte-h="svelte-1d2koqh">Envelope</div> <div class="param-grid four-column svelte-jswoc3">${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-attack",
      label: "Attack",
      value: trackSettings.attack ?? 0.01,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("attack", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-decay",
      label: "Decay",
      value: trackSettings.decay ?? 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("decay", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-sustain",
      label: "Sustain",
      value: trackSettings.sustain ?? 1,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("sustain", v)
    },
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    {
      id: "organ-release",
      label: "Release",
      value: trackSettings.release ?? 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      onUpdate: (v) => updateSetting("release", v)
    },
    {},
    {}
  )}</div></div> </div>`;
});
const SynthPluginWindow = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let pluginWindow;
  let activeItem;
  let trackSettings;
  let selectedTrackForPlugin;
  let selectedPatternForPlugin;
  let { window: window2 } = $$props;
  let project;
  projectStore.subscribe((p) => project = p);
  let windowElement;
  let headerElement;
  let isDragging = false;
  let position = { x: 100, y: 100 };
  function handleMouseMove(e) {
    return;
  }
  function handleMouseUp() {
    isDragging = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }
  onDestroy(() => {
    handleMouseUp();
  });
  if ($$props.window === void 0 && $$bindings.window && window2 !== void 0) $$bindings.window(window2);
  pluginWindow = window2;
  {
    console.log("SynthPluginWindow rendered with window:", pluginWindow);
  }
  {
    console.log("Project available:", !!project);
  }
  activeItem = (() => {
    if (!project || !pluginWindow) return null;
    if (pluginWindow.trackId) {
      return project.standaloneInstruments?.find((i) => i.id === pluginWindow.trackId) || null;
    }
    if (pluginWindow.patternId && pluginWindow.instrumentId) {
      const pattern = project.patterns?.find((p) => p.id === pluginWindow.patternId);
      if (pattern) {
        const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [
          {
            id: pattern.id,
            instrumentType: pattern.instrumentType,
            patternTree: pattern.patternTree,
            settings: pattern.settings || {},
            instrumentSettings: pattern.instrumentSettings,
            color: pattern.color || "#7ab8ff",
            volume: pattern.volume ?? 1,
            pan: pattern.pan ?? 0,
            mute: pattern.mute,
            solo: pattern.solo
          }
        ] : [];
        return instruments.find((inst) => inst.id === pluginWindow.instrumentId) || instruments[0] || null;
      }
    }
    return null;
  })();
  trackSettings = activeItem?.settings || {};
  selectedTrackForPlugin = pluginWindow.trackId ? project?.standaloneInstruments?.find((i) => i.id === pluginWindow.trackId) : void 0;
  selectedPatternForPlugin = pluginWindow.patternId ? project?.patterns?.find((p) => p.id === pluginWindow.patternId) : void 0;
  return `<div class="${["synth-plugin-window", isDragging ? "dragging" : ""].join(" ").trim()}" style="${"left: " + escape(position.x, true) + "px; top: " + escape(position.y, true) + "px;"}"${add_attribute("this", windowElement, 0)}><div class="plugin-header" role="button" tabindex="0" aria-label="Plugin window header - drag to move" style="${"border-color: " + escape(activeItem?.color || "#7ab8ff", true) + ";"}"${add_attribute("this", headerElement, 0)}><div class="plugin-title"><span class="plugin-icon">${escape(pluginWindow.instrumentType === "pad" ? "🎹" : "🎹")}</span> <span class="plugin-name">${escape(pluginWindow.label)}</span></div> <button class="plugin-close" title="Close" data-svelte-h="svelte-4hn109">×</button></div> <div class="plugin-content">${activeItem ? `${pluginWindow.instrumentType === "pad" ? `${validate_component(PadSynthPlugin, "PadSynthPlugin").$$render(
    $$result,
    {
      selectedTrack: selectedTrackForPlugin,
      selectedPattern: selectedPatternForPlugin,
      selectedInstrument: activeItem,
      trackSettings
    },
    {},
    {}
  )}` : `${pluginWindow.instrumentType === "organ" ? `${validate_component(OrganSynthPlugin, "OrganSynthPlugin").$$render(
    $$result,
    {
      selectedTrack: selectedTrackForPlugin,
      selectedPattern: selectedPatternForPlugin,
      selectedInstrument: activeItem,
      trackSettings
    },
    {},
    {}
  )}` : ``}`}` : `<div style="padding: 20px; color: #b8b8b8; text-align: center;" data-svelte-h="svelte-u3qn2w">Loading instrument data...</div>`}</div></div>`;
});
const css = {
  code: ".pattern-editor.svelte-3jfcw5.svelte-3jfcw5{width:100%;height:100vh;display:flex;flex-direction:column}.pattern-header.svelte-3jfcw5.svelte-3jfcw5{position:fixed;top:60px;left:0;right:0;height:50px;background:#252525;border-bottom:1px solid rgba(255, 255, 255, 0.1);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 20px;z-index:1001}.pattern-header-left.svelte-3jfcw5.svelte-3jfcw5{display:flex;align-items:center;gap:16px;flex:1}.back-btn.svelte-3jfcw5.svelte-3jfcw5{background:#2d2d2d;color:#e8e8e8;border:1px solid rgba(255, 255, 255, 0.1);border-radius:4px;padding:6px 12px;cursor:pointer;font-size:13px;transition:all 0.2s ease}.back-btn.svelte-3jfcw5.svelte-3jfcw5:hover{background:#333333;border-color:rgba(255, 255, 255, 0.2)}.pattern-header.svelte-3jfcw5 h2.svelte-3jfcw5{margin:0;color:#e8e8e8;font-size:16px;font-weight:600}.pattern-name-input.svelte-3jfcw5.svelte-3jfcw5{background:#1a1a1a;color:#e8e8e8;border:1px solid rgba(255, 255, 255, 0.1);border-radius:4px;padding:6px 12px;font-size:14px;min-width:200px}.pattern-name-input.svelte-3jfcw5.svelte-3jfcw5:focus{outline:none;border-color:#7ab8ff}.add-instrument-btn.svelte-3jfcw5.svelte-3jfcw5{background:#2d2d2d;color:#e8e8e8;border:1px solid rgba(255, 255, 255, 0.1);border-radius:4px;padding:6px 12px;cursor:pointer;font-size:13px;transition:all 0.2s ease;margin-left:auto}.add-instrument-btn.svelte-3jfcw5.svelte-3jfcw5:hover{background:#333333;border-color:rgba(255, 255, 255, 0.2)}.loading.svelte-3jfcw5.svelte-3jfcw5{display:flex;align-items:center;justify-content:center;height:100vh;color:#b8b8b8}",
  map: '{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { onMount, onDestroy } from \\"svelte\\";\\nimport { beforeNavigate } from \\"$app/navigation\\";\\nimport { projectStore } from \\"$lib/stores/projectStore\\";\\nimport { selectionStore } from \\"$lib/stores/selectionStore\\";\\nimport { loadingStore } from \\"$lib/stores/loadingStore\\";\\nimport Canvas from \\"$lib/components/Canvas.svelte\\";\\nimport Toolbar from \\"$lib/components/Toolbar.svelte\\";\\nimport Sidebar from \\"$lib/components/Sidebar.svelte\\";\\nimport MidiEditor from \\"$lib/components/MidiEditor.svelte\\";\\nimport VelocityEditor from \\"$lib/components/VelocityEditor.svelte\\";\\nimport SynthPluginWindow from \\"$lib/components/SynthPluginWindow.svelte\\";\\nimport { synthPluginStore } from \\"$lib/stores/synthPluginStore\\";\\nimport { page } from \\"$app/stores\\";\\nimport { goto } from \\"$app/navigation\\";\\nimport { viewStore } from \\"$lib/stores/viewStore\\";\\nimport { engineStore } from \\"$lib/stores/engineStore\\";\\nimport ProjectSkeleton from \\"$lib/components/skeletons/ProjectSkeleton.svelte\\";\\nlet project;\\nlet pattern = null;\\nlet unsubscribeAutoSave = null;\\nlet engine = null;\\nlet isLoading = true;\\nengineStore.subscribe((e) => engine = e);\\nprojectStore.subscribe((p) => {\\n  project = p;\\n  if (project && $page.params.patternId) {\\n    pattern = project.patterns?.find((pat) => pat.id === $page.params.patternId) || null;\\n    if (pattern && isLoading) {\\n      setTimeout(() => {\\n        isLoading = false;\\n        loadingStore.stopLoading();\\n      }, 100);\\n    }\\n  }\\n});\\nfunction saveProject() {\\n  if (project && $page.params.id) {\\n    try {\\n      localStorage.setItem(`project_${$page.params.id}`, JSON.stringify(project));\\n      console.log(\\"[Pattern Editor] Project saved to localStorage\\");\\n    } catch (e) {\\n      console.error(\\"[Pattern Editor] Failed to save project:\\", e);\\n    }\\n  }\\n}\\nlet lastPatternSnapshot = \\"\\";\\nlet isInitialLoad = true;\\nlet reloadTimeout = null;\\n$: if (pattern && project) {\\n  const snapshot = JSON.stringify({\\n    id: pattern.id,\\n    patternTree: pattern.patternTree,\\n    instrumentType: pattern.instrumentType,\\n    settings: pattern.settings\\n  });\\n  if (snapshot !== lastPatternSnapshot) {\\n    lastPatternSnapshot = snapshot;\\n    if (!isInitialLoad) {\\n      if (reloadTimeout) clearTimeout(reloadTimeout);\\n      reloadTimeout = setTimeout(() => {\\n        window.dispatchEvent(new CustomEvent(\\"reloadProject\\"));\\n        reloadTimeout = null;\\n      }, 150);\\n    } else {\\n      isInitialLoad = false;\\n    }\\n  }\\n}\\nonMount(() => {\\n  isLoading = true;\\n  loadingStore.stopLoading();\\n  if (project && $page.params.patternId) {\\n    const existingPattern = project.patterns?.find((pat) => pat.id === $page.params.patternId);\\n    if (existingPattern) {\\n      pattern = existingPattern;\\n      isLoading = false;\\n      loadingStore.stopLoading();\\n    }\\n  }\\n  viewStore.setPattern();\\n  viewStore.setCurrentPatternId($page.params.patternId);\\n  selectionStore.selectNode(\\"root\\", null, true, false, $page.params.patternId);\\n  if (pattern) {\\n    return;\\n  }\\n  const saved = localStorage.getItem(`project_${$page.params.id}`);\\n  if (saved) {\\n    try {\\n      const loadedProject = JSON.parse(saved);\\n      projectStore.set(loadedProject);\\n    } catch (e) {\\n      console.error(\\"Failed to load project:\\", e);\\n      isLoading = false;\\n    }\\n  } else {\\n    isLoading = false;\\n  }\\n  unsubscribeAutoSave = projectStore.subscribe((p) => {\\n    if (p && $page.params.id) {\\n      setTimeout(() => {\\n        saveProject();\\n      }, 100);\\n    }\\n  });\\n  if (project && $page.params.patternId) {\\n    const existingPattern = project.patterns?.find((pat) => pat.id === $page.params.patternId);\\n    if (!existingPattern) {\\n      const newPattern = projectStore.createPattern(\\n        $page.params.id,\\n        `Pattern ${(project.patterns?.length || 0) + 1}`\\n      );\\n      projectStore.addPattern(newPattern);\\n    }\\n  }\\n  setTimeout(() => {\\n    isInitialLoad = false;\\n    window.dispatchEvent(new CustomEvent(\\"reloadProject\\"));\\n  }, 300);\\n});\\nbeforeNavigate(({ to, cancel }) => {\\n  saveProject();\\n});\\nonDestroy(() => {\\n  saveProject();\\n  if (unsubscribeAutoSave) {\\n    unsubscribeAutoSave();\\n  }\\n});\\n<\/script>\\r\\n\\r\\n{#if isLoading}\\r\\n\\t<ProjectSkeleton viewMode=\\"pattern\\" isPatternEditor={true} />\\r\\n{:else if pattern}\\r\\n\\t<Toolbar />\\r\\n\\t<div class=\\"pattern-editor\\">\\r\\n\\t\\t<div class=\\"pattern-header\\">\\r\\n\\t\\t<div class=\\"pattern-header-left\\">\\r\\n\\t\\t\\t<button class=\\"back-btn\\" on:click={() => {\\r\\n\\t\\t\\t\\t// Save before navigating\\r\\n\\t\\t\\t\\tsaveProject();\\r\\n\\t\\t\\t\\t// Navigate to pattern list (pattern view)\\r\\n\\t\\t\\t\\tviewStore.setPattern();\\r\\n\\t\\t\\t\\tgoto(`/project/${$page.params.id}`);\\r\\n\\t\\t\\t}}>\\r\\n\\t\\t\\t\\t← Back to Patterns\\r\\n\\t\\t\\t</button>\\r\\n\\t\\t\\t<h2>{pattern.name}</h2>\\r\\n\\t\\t\\t<input \\r\\n\\t\\t\\t\\ttype=\\"text\\" \\r\\n\\t\\t\\t\\tvalue={pattern.name}\\r\\n\\t\\t\\t\\ton:input={(e) => {\\r\\n\\t\\t\\t\\t\\tconst newName = e.currentTarget.value;\\r\\n\\t\\t\\t\\t\\tprojectStore.updatePattern(pattern.id, { name: newName });\\r\\n\\t\\t\\t\\t}}\\r\\n\\t\\t\\t\\tclass=\\"pattern-name-input\\"\\r\\n\\t\\t\\t/>\\r\\n\\t\\t</div>\\r\\n\\t\\t<button \\r\\n\\t\\t\\tclass=\\"add-instrument-btn\\" \\r\\n\\t\\t\\ton:click={() => {\\r\\n\\t\\t\\t\\tif (!project || !pattern) return;\\r\\n\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t// Create a new instrument with default kick settings\\r\\n\\t\\t\\t\\tconst instrumentDefaults = {\\r\\n\\t\\t\\t\\t\\tkick: { color: \'#00ffff\', settings: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.15 } }\\r\\n\\t\\t\\t\\t};\\r\\n\\t\\t\\t\\tconst defaults = instrumentDefaults.kick;\\r\\n\\t\\t\\t\\t\\r\\n\\t\\t\\t\\tconst newInstrument = {\\r\\n\\t\\t\\t\\t\\tid: crypto.randomUUID(),\\r\\n\\t\\t\\t\\t\\tinstrumentType: \'kick\',\\r\\n\\t\\t\\t\\t\\tpatternTree: {\\r\\n\\t\\t\\t\\t\\t\\tid: crypto.randomUUID(),\\r\\n\\t\\t\\t\\t\\t\\tdivision: 4,\\r\\n\\t\\t\\t\\t\\t\\tx: 400 + Math.random() * 200,\\r\\n\\t\\t\\t\\t\\t\\ty: 200 + Math.random() * 100,\\r\\n\\t\\t\\t\\t\\t\\tchildren: []\\r\\n\\t\\t\\t\\t\\t},\\r\\n\\t\\t\\t\\t\\tsettings: { ...defaults.settings },\\r\\n\\t\\t\\t\\t\\tinstrumentSettings: undefined,\\r\\n\\t\\t\\t\\t\\tcolor: defaults.color,\\r\\n\\t\\t\\t\\t\\tvolume: 1.0,\\r\\n\\t\\t\\t\\t\\tpan: 0.0,\\r\\n\\t\\t\\t\\t\\tmute: false,\\r\\n\\t\\t\\t\\t\\tsolo: false\\r\\n\\t\\t\\t\\t};\\r\\n\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t// Add the instrument to the pattern\\r\\n\\t\\t\\t\\tprojectStore.addPatternInstrument(pattern.id, newInstrument);\\r\\n\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t// Select the new instrument so the user can see it\\r\\n\\t\\t\\t\\tselectionStore.selectNode(newInstrument.patternTree.id, null, true, false, pattern.id, newInstrument.id);\\r\\n\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t// Update engine in real-time without stopping playback\\r\\n\\t\\t\\t\\t// Use a small delay to ensure store update completes\\r\\n\\t\\t\\t\\tsetTimeout(() => {\\r\\n\\t\\t\\t\\t\\tif (engine) {\\r\\n\\t\\t\\t\\t\\t\\t// Get the updated instrument from the store to ensure we have the latest data\\r\\n\\t\\t\\t\\t\\t\\tlet currentProject = null;\\r\\n\\t\\t\\t\\t\\t\\tprojectStore.subscribe((p) => (currentProject = p))();\\r\\n\\t\\t\\t\\t\\t\\tif (!currentProject) return;\\r\\n\\t\\t\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t\\t\\tconst updatedPattern = currentProject.patterns?.find((p) => p.id === pattern.id);\\r\\n\\t\\t\\t\\t\\t\\tif (!updatedPattern) return;\\r\\n\\t\\t\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t\\t\\tconst updatedInstruments = updatedPattern.instruments && Array.isArray(updatedPattern.instruments) && updatedPattern.instruments.length > 0\\r\\n\\t\\t\\t\\t\\t\\t\\t? updatedPattern.instruments\\r\\n\\t\\t\\t\\t\\t\\t\\t: [];\\r\\n\\t\\t\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t\\t\\tconst updatedInstrument = updatedInstruments.find((inst) => inst.id === newInstrument.id);\\r\\n\\t\\t\\t\\t\\t\\tif (!updatedInstrument) return;\\r\\n\\t\\t\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t\\t\\tconst patternTrackId = `__pattern_${pattern.id}_${newInstrument.id}`;\\r\\n\\t\\t\\t\\t\\t\\tconst trackForEngine = {\\r\\n\\t\\t\\t\\t\\t\\t\\tid: patternTrackId,\\r\\n\\t\\t\\t\\t\\t\\t\\tprojectId: pattern.projectId,\\r\\n\\t\\t\\t\\t\\t\\t\\tinstrumentType: updatedInstrument.instrumentType,\\r\\n\\t\\t\\t\\t\\t\\t\\tpatternTree: updatedInstrument.patternTree,\\r\\n\\t\\t\\t\\t\\t\\t\\tsettings: updatedInstrument.settings || {},\\r\\n\\t\\t\\t\\t\\t\\t\\tinstrumentSettings: updatedInstrument.instrumentSettings,\\r\\n\\t\\t\\t\\t\\t\\t\\tvolume: updatedInstrument.volume ?? 1.0,\\r\\n\\t\\t\\t\\t\\t\\t\\tpan: updatedInstrument.pan ?? 0.0,\\r\\n\\t\\t\\t\\t\\t\\t\\tcolor: updatedInstrument.color,\\r\\n\\t\\t\\t\\t\\t\\t\\tmute: updatedInstrument.mute ?? false,\\r\\n\\t\\t\\t\\t\\t\\t\\tsolo: updatedInstrument.solo ?? false\\r\\n\\t\\t\\t\\t\\t\\t};\\r\\n\\t\\t\\t\\t\\t\\t\\r\\n\\t\\t\\t\\t\\t\\t// Add the track to the engine - updateTrack will add it if it doesn\'t exist\\r\\n\\t\\t\\t\\t\\t\\tengine.updateTrack(patternTrackId, trackForEngine);\\r\\n\\t\\t\\t\\t\\t}\\r\\n\\t\\t\\t\\t}, 0);\\r\\n\\t\\t\\t}}\\r\\n\\t\\t\\ttitle=\\"Add new instrument to pattern\\"\\r\\n\\t\\t>\\r\\n\\t\\t\\t+ Instrument\\r\\n\\t\\t</button>\\r\\n\\t</div>\\r\\n\\t<Canvas patternId={pattern.id} />\\r\\n\\t\\t<Sidebar />\\r\\n\\t\\t<MidiEditor />\\r\\n\\t\\t<VelocityEditor />\\r\\n\\t\\t\\r\\n\\t\\t<!-- Synth Plugin Windows (only in pattern editor) -->\\r\\n\\t\\t{#if $synthPluginStore.length > 0}\\r\\n\\t\\t\\t{#each $synthPluginStore as window}\\r\\n\\t\\t\\t\\t<SynthPluginWindow {window} />\\r\\n\\t\\t\\t{/each}\\r\\n\\t\\t{/if}\\r\\n\\t</div>\\r\\n{:else}\\r\\n\\t<div class=\\"loading\\">Loading pattern...</div>\\r\\n{/if}\\r\\n\\r\\n<style>\\r\\n\\t.pattern-editor {\\r\\n\\t\\twidth: 100%;\\r\\n\\t\\theight: 100vh;\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\tflex-direction: column;\\r\\n\\t}\\r\\n\\r\\n\\t.pattern-header {\\r\\n\\t\\tposition: fixed;\\r\\n\\t\\ttop: 60px; /* Below toolbar */\\r\\n\\t\\tleft: 0;\\r\\n\\t\\tright: 0;\\r\\n\\t\\theight: 50px;\\r\\n\\t\\tbackground: #252525;\\r\\n\\t\\tborder-bottom: 1px solid rgba(255, 255, 255, 0.1);\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\talign-items: center;\\r\\n\\t\\tjustify-content: space-between;\\r\\n\\t\\tgap: 16px;\\r\\n\\t\\tpadding: 0 20px;\\r\\n\\t\\tz-index: 1001;\\r\\n\\t}\\r\\n\\r\\n\\t.pattern-header-left {\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\talign-items: center;\\r\\n\\t\\tgap: 16px;\\r\\n\\t\\tflex: 1;\\r\\n\\t}\\r\\n\\r\\n\\t.back-btn {\\r\\n\\t\\tbackground: #2d2d2d;\\r\\n\\t\\tcolor: #e8e8e8;\\r\\n\\t\\tborder: 1px solid rgba(255, 255, 255, 0.1);\\r\\n\\t\\tborder-radius: 4px;\\r\\n\\t\\tpadding: 6px 12px;\\r\\n\\t\\tcursor: pointer;\\r\\n\\t\\tfont-size: 13px;\\r\\n\\t\\ttransition: all 0.2s ease;\\r\\n\\t}\\r\\n\\r\\n\\t.back-btn:hover {\\r\\n\\t\\tbackground: #333333;\\r\\n\\t\\tborder-color: rgba(255, 255, 255, 0.2);\\r\\n\\t}\\r\\n\\r\\n\\t.pattern-header h2 {\\r\\n\\t\\tmargin: 0;\\r\\n\\t\\tcolor: #e8e8e8;\\r\\n\\t\\tfont-size: 16px;\\r\\n\\t\\tfont-weight: 600;\\r\\n\\t}\\r\\n\\r\\n\\t.pattern-name-input {\\r\\n\\t\\tbackground: #1a1a1a;\\r\\n\\t\\tcolor: #e8e8e8;\\r\\n\\t\\tborder: 1px solid rgba(255, 255, 255, 0.1);\\r\\n\\t\\tborder-radius: 4px;\\r\\n\\t\\tpadding: 6px 12px;\\r\\n\\t\\tfont-size: 14px;\\r\\n\\t\\tmin-width: 200px;\\r\\n\\t}\\r\\n\\r\\n\\t.pattern-name-input:focus {\\r\\n\\t\\toutline: none;\\r\\n\\t\\tborder-color: #7ab8ff;\\r\\n\\t}\\r\\n\\r\\n\\t.add-instrument-btn {\\r\\n\\t\\tbackground: #2d2d2d;\\r\\n\\t\\tcolor: #e8e8e8;\\r\\n\\t\\tborder: 1px solid rgba(255, 255, 255, 0.1);\\r\\n\\t\\tborder-radius: 4px;\\r\\n\\t\\tpadding: 6px 12px;\\r\\n\\t\\tcursor: pointer;\\r\\n\\t\\tfont-size: 13px;\\r\\n\\t\\ttransition: all 0.2s ease;\\r\\n\\t\\tmargin-left: auto;\\r\\n\\t}\\r\\n\\r\\n\\t.add-instrument-btn:hover {\\r\\n\\t\\tbackground: #333333;\\r\\n\\t\\tborder-color: rgba(255, 255, 255, 0.2);\\r\\n\\t}\\r\\n\\r\\n\\t.loading {\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\talign-items: center;\\r\\n\\t\\tjustify-content: center;\\r\\n\\t\\theight: 100vh;\\r\\n\\t\\tcolor: #b8b8b8;\\r\\n\\t}\\r\\n</style>\\r\\n\\r\\n"],"names":[],"mappings":"AA8PC,2CAAgB,CACf,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,KAAK,CACb,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MACjB,CAEA,2CAAgB,CACf,QAAQ,CAAE,KAAK,CACf,GAAG,CAAE,IAAI,CACT,IAAI,CAAE,CAAC,CACP,KAAK,CAAE,CAAC,CACR,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,OAAO,CACnB,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CACjD,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,eAAe,CAAE,aAAa,CAC9B,GAAG,CAAE,IAAI,CACT,OAAO,CAAE,CAAC,CAAC,IAAI,CACf,OAAO,CAAE,IACV,CAEA,gDAAqB,CACpB,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,GAAG,CAAE,IAAI,CACT,IAAI,CAAE,CACP,CAEA,qCAAU,CACT,UAAU,CAAE,OAAO,CACnB,KAAK,CAAE,OAAO,CACd,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAC1C,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,GAAG,CAAC,IAAI,CACjB,MAAM,CAAE,OAAO,CACf,SAAS,CAAE,IAAI,CACf,UAAU,CAAE,GAAG,CAAC,IAAI,CAAC,IACtB,CAEA,qCAAS,MAAO,CACf,UAAU,CAAE,OAAO,CACnB,YAAY,CAAE,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CACtC,CAEA,6BAAe,CAAC,gBAAG,CAClB,MAAM,CAAE,CAAC,CACT,KAAK,CAAE,OAAO,CACd,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,GACd,CAEA,+CAAoB,CACnB,UAAU,CAAE,OAAO,CACnB,KAAK,CAAE,OAAO,CACd,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAC1C,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,GAAG,CAAC,IAAI,CACjB,SAAS,CAAE,IAAI,CACf,SAAS,CAAE,KACZ,CAEA,+CAAmB,MAAO,CACzB,OAAO,CAAE,IAAI,CACb,YAAY,CAAE,OACf,CAEA,+CAAoB,CACnB,UAAU,CAAE,OAAO,CACnB,KAAK,CAAE,OAAO,CACd,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAC1C,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,GAAG,CAAC,IAAI,CACjB,MAAM,CAAE,OAAO,CACf,SAAS,CAAE,IAAI,CACf,UAAU,CAAE,GAAG,CAAC,IAAI,CAAC,IAAI,CACzB,WAAW,CAAE,IACd,CAEA,+CAAmB,MAAO,CACzB,UAAU,CAAE,OAAO,CACnB,YAAY,CAAE,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CACtC,CAEA,oCAAS,CACR,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,eAAe,CAAE,MAAM,CACvB,MAAM,CAAE,KAAK,CACb,KAAK,CAAE,OACR"}'
};
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $page, $$unsubscribe_page;
  let $synthPluginStore, $$unsubscribe_synthPluginStore;
  $$unsubscribe_page = subscribe(page, (value) => $page = value);
  $$unsubscribe_synthPluginStore = subscribe(synthPluginStore, (value) => $synthPluginStore = value);
  let project;
  let pattern = null;
  let isLoading = true;
  engineStore.subscribe((e) => e);
  projectStore.subscribe((p) => {
    project = p;
    if (project && $page.params.patternId) {
      pattern = project.patterns?.find((pat) => pat.id === $page.params.patternId) || null;
      if (pattern && isLoading) {
        setTimeout(
          () => {
            isLoading = false;
            loadingStore.stopLoading();
          },
          100
        );
      }
    }
  });
  function saveProject() {
    if (project && $page.params.id) {
      try {
        localStorage.setItem(`project_${$page.params.id}`, JSON.stringify(project));
        console.log("[Pattern Editor] Project saved to localStorage");
      } catch (e) {
        console.error("[Pattern Editor] Failed to save project:", e);
      }
    }
  }
  let lastPatternSnapshot = "";
  let isInitialLoad = true;
  let reloadTimeout = null;
  onDestroy(() => {
    saveProject();
  });
  $$result.css.add(css);
  {
    if (pattern && project) {
      const snapshot = JSON.stringify({
        id: pattern.id,
        patternTree: pattern.patternTree,
        instrumentType: pattern.instrumentType,
        settings: pattern.settings
      });
      if (snapshot !== lastPatternSnapshot) {
        lastPatternSnapshot = snapshot;
        if (!isInitialLoad) {
          if (reloadTimeout) clearTimeout(reloadTimeout);
          reloadTimeout = setTimeout(
            () => {
              window.dispatchEvent(new CustomEvent("reloadProject"));
              reloadTimeout = null;
            },
            150
          );
        } else {
          isInitialLoad = false;
        }
      }
    }
  }
  $$unsubscribe_page();
  $$unsubscribe_synthPluginStore();
  return `${isLoading ? `${validate_component(ProjectSkeleton, "ProjectSkeleton").$$render(
    $$result,
    {
      viewMode: "pattern",
      isPatternEditor: true
    },
    {},
    {}
  )}` : `${pattern ? `${validate_component(Toolbar, "Toolbar").$$render($$result, {}, {}, {})} <div class="pattern-editor svelte-3jfcw5"><div class="pattern-header svelte-3jfcw5"><div class="pattern-header-left svelte-3jfcw5"><button class="back-btn svelte-3jfcw5" data-svelte-h="svelte-16gkfju">← Back to Patterns</button> <h2 class="svelte-3jfcw5">${escape(pattern.name)}</h2> <input type="text"${add_attribute("value", pattern.name, 0)} class="pattern-name-input svelte-3jfcw5"></div> <button class="add-instrument-btn svelte-3jfcw5" title="Add new instrument to pattern" data-svelte-h="svelte-53gj7j">+ Instrument</button></div> ${validate_component(Canvas, "Canvas").$$render($$result, { patternId: pattern.id }, {}, {})} ${validate_component(Sidebar, "Sidebar").$$render($$result, {}, {}, {})} ${validate_component(MidiEditor, "MidiEditor").$$render($$result, {}, {}, {})} ${validate_component(VelocityEditor, "VelocityEditor").$$render($$result, {}, {}, {})}  ${$synthPluginStore.length > 0 ? `${each($synthPluginStore, (window2) => {
    return `${validate_component(SynthPluginWindow, "SynthPluginWindow").$$render($$result, { window: window2 }, {}, {})}`;
  })}` : ``}</div>` : `<div class="loading svelte-3jfcw5" data-svelte-h="svelte-115d3ox">Loading pattern...</div>`}`}`;
});
export {
  Page as default
};
