import { c as create_ssr_component, a as subscribe, b as each, e as escape, d as add_attribute, v as validate_component } from "../../../../chunks/ssr.js";
import { projectStore } from "../../../../chunks/projectStore.js";
import { p as playbackStore, e as engineStore, P as ParamControl, a as automationStore, v as viewStore, T as Toolbar, b as ProjectSkeleton } from "../../../../chunks/ProjectSkeleton.js";
import "../../../../chunks/loadingStore.js";
import { p as page } from "../../../../chunks/stores.js";
import "@sveltejs/kit/internal";
import "../../../../chunks/exports.js";
import "../../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/state.svelte.js";
function goto(url, opts = {}) {
  {
    throw new Error("Cannot call goto(...) on the server");
  }
}
const EffectsEnvelopesPanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let effects;
  let $page, $$unsubscribe_page;
  $$unsubscribe_page = subscribe(page, (value) => $page = value);
  let project;
  projectStore.subscribe((p) => project = p);
  let editingEffectId = null;
  let editingEffectInput = null;
  let { onDragStart = void 0 } = $$props;
  if ($$props.onDragStart === void 0 && $$bindings.onDragStart && onDragStart !== void 0) $$bindings.onDragStart(onDragStart);
  effects = project?.effects || [];
  project?.envelopes || [];
  $page.params.id;
  $$unsubscribe_page();
  return `<div class="effects-envelopes-panel"><div class="panel-tabs"><button class="${"tab " + escape("active", true)}">Effects</button> <button class="${"tab " + escape("", true)}">Envelopes</button></div> <div class="panel-content">${`<div class="effects-section"><div class="create-dropdown-wrapper"><button class="create-dropdown-trigger" title="Create new effect"><span data-svelte-h="svelte-po4y4q">+ Create Effect</span> <svg class="${"dropdown-arrow " + escape("", true)}" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button> ${``}</div> <div class="items-list">${each(effects, (effect) => {
    return `<button class="${"item " + escape(effect.type, true)}"${add_attribute("draggable", editingEffectId !== effect.id, 0)}><div class="item-color" style="${"background: " + escape(effect.color, true) + ";"}"></div> ${editingEffectId === effect.id ? `<input type="text" class="item-name-input"${add_attribute("value", effect.name, 0)}${add_attribute("this", editingEffectInput, 0)}>` : `<span class="item-name" role="button" tabindex="0" aria-label="Double-click to rename effect" title="Double-click to rename">${escape(effect.name)} </span>`} <span class="item-type">${escape(effect.type)}</span> <button class="item-delete" title="Delete effect" data-svelte-h="svelte-cfhv99">×</button> </button>`;
  })} ${effects.length === 0 ? `<div class="empty-state" data-svelte-h="svelte-1funn0j">No effects yet. Create one above!</div>` : ``}</div></div>`}</div></div>`;
});
function getAutomationValueAtBeat(points, beat, min, max) {
  if (!points || points.length === 0) {
    return (min + max) / 2;
  }
  const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);
  if (beat <= sortedPoints[0].beat) {
    return sortedPoints[0].value;
  }
  if (beat >= sortedPoints[sortedPoints.length - 1].beat) {
    return sortedPoints[sortedPoints.length - 1].value;
  }
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const p1 = sortedPoints[i];
    const p2 = sortedPoints[i + 1];
    if (beat >= p1.beat && beat <= p2.beat) {
      const t = (beat - p1.beat) / (p2.beat - p1.beat);
      return p1.value + (p2.value - p1.value) * t;
    }
  }
  return sortedPoints[0].value;
}
function generateAutomationCurvePath(width, height, automation, startBeat, duration) {
  if (!automation || !automation.points || automation.points.length === 0) {
    return "";
  }
  const { points, min, max } = automation;
  const endBeat = startBeat + duration;
  const relevantPoints = points.filter((p) => p.beat >= startBeat && p.beat <= endBeat);
  if (relevantPoints.length === 0) {
    return "";
  }
  [...relevantPoints].sort((a, b) => a.beat - b.beat);
  const numPoints = Math.max(20, Math.floor(width / 2));
  const curvePoints = [];
  for (let i = 0; i <= numPoints; i++) {
    const progress = i / numPoints;
    const beat = startBeat + progress * duration;
    const value = getAutomationValueAtBeat(points, beat, min, max);
    const normalizedValue = (value - min) / (max - min);
    const x = progress * width;
    const y = height * (1 - normalizedValue);
    curvePoints.push([x, y]);
  }
  const firstValue = getAutomationValueAtBeat(points, startBeat, min, max);
  const lastValue = getAutomationValueAtBeat(points, endBeat, min, max);
  const firstNormalized = (firstValue - min) / (max - min);
  const lastNormalized = (lastValue - min) / (max - min);
  const startY = height * (1 - firstNormalized);
  const endY = height * (1 - lastNormalized);
  const clampedStartY = Math.max(0, Math.min(height, startY));
  const clampedEndY = Math.max(0, Math.min(height, endY));
  let path = `M 0 ${height}`;
  path += ` L 0 ${clampedStartY}`;
  for (const [x, y] of curvePoints) {
    const clampedY = Math.max(0, Math.min(height, y));
    path += ` L ${x} ${clampedY}`;
  }
  path += ` L ${width} ${clampedEndY}`;
  path += ` L ${width} ${height} Z`;
  return path;
}
function getEnvelopeAutomationProps(parameterKey) {
  return {};
}
const EffectEnvelopeProperties = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let playbackState;
  let effects;
  let envelopes;
  let patterns;
  let timeline;
  let selectedEffect;
  let selectedEnvelope;
  let selectedTimelineEffect;
  let selectedTimelineEnvelope;
  let currentBeat;
  let $playbackStore, $$unsubscribe_playbackStore;
  $$unsubscribe_playbackStore = subscribe(playbackStore, (value) => $playbackStore = value);
  let { selectedEffectId = null } = $$props;
  let { selectedEnvelopeId = null } = $$props;
  let { selectedTimelineEffectId = null } = $$props;
  let { selectedTimelineEnvelopeId = null } = $$props;
  let project;
  projectStore.subscribe((p) => project = p);
  let engine = null;
  engineStore.subscribe((e) => engine = e);
  function getAutomatedValue(parameterKey, baseValue, min, max, currentBeat2) {
    if (!selectedEffect || !selectedTimelineEffect || !project?.automation) {
      return baseValue;
    }
    const automationId = `effect:${selectedEffect.id}:${selectedTimelineEffect.id}:${parameterKey}`;
    const automation = project.automation?.[automationId];
    if (!automation || !automation.points || automation.points.length === 0) {
      return baseValue;
    }
    const effectStartBeat = selectedTimelineEffect.startBeat || 0;
    const effectEndBeat = effectStartBeat + (selectedTimelineEffect.duration || 0);
    if (currentBeat2 < effectStartBeat || currentBeat2 >= effectEndBeat) {
      return baseValue;
    }
    const automatedValue = getAutomationValueAtBeat(automation.points, currentBeat2, automation.min ?? min, automation.max ?? max);
    return automatedValue;
  }
  function updateEffectSetting(key, value) {
    if (!selectedEffect) return;
    const newSettings = { ...selectedEffect.settings, [key]: value };
    projectStore.updateEffect(selectedEffect.id, { settings: newSettings });
    if (engine) {
      engine.updateEffect(selectedEffect.id, { [key]: value });
    }
  }
  function updateEnvelopeSetting(key, value) {
    if (!selectedEnvelope) return;
    const newSettings = {
      ...selectedEnvelope.settings,
      [key]: value
    };
    projectStore.updateEnvelope(selectedEnvelope.id, { settings: newSettings });
    if (engine) {
      engine.updateEnvelope(selectedEnvelope.id, { [key]: value });
    }
  }
  function getEffectAutomationProps(parameterKey) {
    if (!selectedEffect) return {};
    return {
      automationTargetType: "effect",
      automationTargetId: selectedEffect.id,
      automationParameterKey: parameterKey,
      automationTimelineInstanceId: selectedTimelineEffect?.id || null,
      automationLabel: `${selectedEffect.name} - ${parameterKey.charAt(0).toUpperCase() + parameterKey.slice(1)}`
    };
  }
  if ($$props.selectedEffectId === void 0 && $$bindings.selectedEffectId && selectedEffectId !== void 0) $$bindings.selectedEffectId(selectedEffectId);
  if ($$props.selectedEnvelopeId === void 0 && $$bindings.selectedEnvelopeId && selectedEnvelopeId !== void 0) $$bindings.selectedEnvelopeId(selectedEnvelopeId);
  if ($$props.selectedTimelineEffectId === void 0 && $$bindings.selectedTimelineEffectId && selectedTimelineEffectId !== void 0) $$bindings.selectedTimelineEffectId(selectedTimelineEffectId);
  if ($$props.selectedTimelineEnvelopeId === void 0 && $$bindings.selectedTimelineEnvelopeId && selectedTimelineEnvelopeId !== void 0) $$bindings.selectedTimelineEnvelopeId(selectedTimelineEnvelopeId);
  playbackState = $playbackStore;
  effects = project?.effects || [];
  envelopes = project?.envelopes || [];
  patterns = project?.patterns || [];
  timeline = project?.timeline;
  selectedEffect = selectedEffectId ? effects.find((e) => e.id === selectedEffectId) : null;
  selectedEnvelope = selectedEnvelopeId ? envelopes.find((e) => e.id === selectedEnvelopeId) : null;
  selectedTimelineEffect = selectedTimelineEffectId && timeline?.effects ? timeline.effects.find((te) => te.id === selectedTimelineEffectId) : null;
  selectedTimelineEnvelope = selectedTimelineEnvelopeId && timeline?.envelopes ? timeline.envelopes.find((te) => te.id === selectedTimelineEnvelopeId) : null;
  currentBeat = playbackState.currentTime || 0;
  $$unsubscribe_playbackStore();
  return `${selectedEffect || selectedEnvelope ? `<div class="effect-envelope-properties"><div class="properties-header"><h3>${escape(selectedEffect?.name || selectedEnvelope?.name)}</h3> <span class="properties-type">${escape(selectedEffect?.type || selectedEnvelope?.type)}</span></div> <div class="properties-content">${selectedTimelineEffect ? ` <div class="pattern-assignment"><label>Apply to Pattern:
						<select${add_attribute("value", selectedTimelineEffect.patternId || "", 0)}><option value="" data-svelte-h="svelte-9z4g18">All Patterns (Global)</option>${each(patterns, (pattern) => {
    return `<option${add_attribute("value", pattern.id, 0)}>${escape(pattern.name)}</option>`;
  })}</select></label> <p class="help-text" data-svelte-h="svelte-zuizk8">Select which pattern this effect applies to, or leave as &quot;All Patterns&quot; for global effect.</p></div>` : ``} ${selectedTimelineEnvelope ? ` <div class="pattern-assignment"><label>Apply to Pattern:
						<select${add_attribute("value", selectedTimelineEnvelope.patternId || "", 0)}><option value="" data-svelte-h="svelte-9z4g18">All Patterns (Global)</option>${each(patterns, (pattern) => {
    return `<option${add_attribute("value", pattern.id, 0)}>${escape(pattern.name)}</option>`;
  })}</select></label> <p class="help-text" data-svelte-h="svelte-fe9k0e">Select which pattern this envelope applies to, or leave as &quot;All Patterns&quot; for global envelope.</p></div>` : ``} ${selectedEffect ? `${selectedEffect.type === "reverb" ? (() => {
    let roomSizeValue = getAutomatedValue("roomSize", selectedEffect.settings.roomSize ?? 0.5, 0, 1, currentBeat), dampeningValue = getAutomatedValue("dampening", selectedEffect.settings.dampening ?? 0.5, 0, 1, currentBeat), wetValue = getAutomatedValue("wet", selectedEffect.settings.wet ?? 0.3, 0, 1, currentBeat), dryValue = getAutomatedValue("dry", selectedEffect.settings.dry ?? 0.7, 0, 1, currentBeat);
    return `    ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Room Size" },
        { value: roomSizeValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("roomSize", v)
        },
        getEffectAutomationProps("roomSize")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Dampening" },
        { value: dampeningValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("dampening", v)
        },
        getEffectAutomationProps("dampening")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Wet" },
        { value: wetValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("wet", v)
        },
        getEffectAutomationProps("wet")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Dry" },
        { value: dryValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("dry", v)
        },
        getEffectAutomationProps("dry")
      ),
      {},
      {}
    )}`;
  })() : `${selectedEffect.type === "delay" ? (() => {
    let timeValue = getAutomatedValue("time", selectedEffect.settings.time ?? 0.25, 0, 2, currentBeat), feedbackValue = getAutomatedValue("feedback", selectedEffect.settings.feedback ?? 0.3, 0, 1, currentBeat), delayWetValue = getAutomatedValue("wet", selectedEffect.settings.wet ?? 0.3, 0, 1, currentBeat), delayDryValue = getAutomatedValue("dry", selectedEffect.settings.dry ?? 0.7, 0, 1, currentBeat);
    return `    ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Time" },
        { value: timeValue },
        { min: 0 },
        { max: 2 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("time", v)
        },
        getEffectAutomationProps("time")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Feedback" },
        { value: feedbackValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("feedback", v)
        },
        getEffectAutomationProps("feedback")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Wet" },
        { value: delayWetValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("wet", v)
        },
        getEffectAutomationProps("wet")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Dry" },
        { value: delayDryValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("dry", v)
        },
        getEffectAutomationProps("dry")
      ),
      {},
      {}
    )}`;
  })() : `${selectedEffect.type === "filter" ? (() => {
    let frequencyValue = getAutomatedValue("frequency", selectedEffect.settings.frequency ?? 0.5, 0, 1, currentBeat), resonanceValue = getAutomatedValue("resonance", selectedEffect.settings.resonance ?? 0.5, 0, 1, currentBeat);
    return `  <label>Type
						<select${add_attribute("value", selectedEffect.settings.type ?? "lowpass", 0)}><option value="lowpass" data-svelte-h="svelte-qh68bg">Lowpass</option><option value="highpass" data-svelte-h="svelte-1al95b6">Highpass</option><option value="bandpass" data-svelte-h="svelte-1q8zb76">Bandpass</option></select></label> ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Frequency" },
        { value: frequencyValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("frequency", v)
        },
        getEffectAutomationProps("frequency")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Resonance" },
        { value: resonanceValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("resonance", v)
        },
        getEffectAutomationProps("resonance")
      ),
      {},
      {}
    )}`;
  })() : `${selectedEffect.type === "distortion" ? (() => {
    let amountValue = getAutomatedValue("amount", selectedEffect.settings.amount ?? 0.3, 0, 1, currentBeat), driveValue = getAutomatedValue("drive", selectedEffect.settings.drive ?? 0.5, 0, 1, currentBeat);
    return `  ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Amount" },
        { value: amountValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("amount", v)
        },
        getEffectAutomationProps("amount")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Drive" },
        { value: driveValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("drive", v)
        },
        getEffectAutomationProps("drive")
      ),
      {},
      {}
    )}`;
  })() : `${selectedEffect.type === "compressor" ? (() => {
    let thresholdValue = getAutomatedValue("threshold", selectedEffect.settings.threshold ?? 0.7, 0, 1, currentBeat), ratioValue = getAutomatedValue("ratio", selectedEffect.settings.ratio ?? 4, 1, 20, currentBeat), attackValue = getAutomatedValue("attack", selectedEffect.settings.attack ?? 0.01, 0, 1, currentBeat), releaseValue = getAutomatedValue("release", selectedEffect.settings.release ?? 0.1, 0, 1, currentBeat);
    return `    ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Threshold" },
        { value: thresholdValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("threshold", v)
        },
        getEffectAutomationProps("threshold")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Ratio" },
        { value: ratioValue },
        { min: 1 },
        { max: 20 },
        { step: 0.1 },
        {
          onChange: (v) => updateEffectSetting("ratio", v)
        },
        getEffectAutomationProps("ratio")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Attack" },
        { value: attackValue },
        { min: 0 },
        { max: 1 },
        { step: 1e-3 },
        {
          onChange: (v) => updateEffectSetting("attack", v)
        },
        getEffectAutomationProps("attack")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Release" },
        { value: releaseValue },
        { min: 0 },
        { max: 1 },
        { step: 1e-3 },
        {
          onChange: (v) => updateEffectSetting("release", v)
        },
        getEffectAutomationProps("release")
      ),
      {},
      {}
    )}`;
  })() : `${selectedEffect.type === "chorus" ? (() => {
    let rateValue = getAutomatedValue("rate", selectedEffect.settings.rate ?? 0.5, 0, 1, currentBeat), depthValue = getAutomatedValue("depth", selectedEffect.settings.depth ?? 0.3, 0, 1, currentBeat), chorusDelayValue = getAutomatedValue("delay", selectedEffect.settings.delay ?? 0.02, 0, 0.1, currentBeat);
    return `   ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Rate" },
        { value: rateValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("rate", v)
        },
        getEffectAutomationProps("rate")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Depth" },
        { value: depthValue },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("depth", v)
        },
        getEffectAutomationProps("depth")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Delay" },
        { value: chorusDelayValue },
        { min: 0 },
        { max: 0.1 },
        { step: 1e-3 },
        {
          onChange: (v) => updateEffectSetting("delay", v)
        },
        getEffectAutomationProps("delay")
      ),
      {},
      {}
    )} ${validate_component(ParamControl, "ParamControl").$$render(
      $$result,
      Object.assign(
        {},
        { label: "Wet" },
        {
          value: selectedEffect.settings.wet ?? 0.3
        },
        { min: 0 },
        { max: 1 },
        { step: 0.01 },
        {
          onChange: (v) => updateEffectSetting("wet", v)
        },
        getEffectAutomationProps("wet")
      ),
      {},
      {}
    )}`;
  })() : ``}`}`}`}`}`}` : `${selectedEnvelope ? `${selectedEnvelope.type === "volume" ? `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Volume Start" },
      {
        value: selectedEnvelope.settings.startValue ?? 0.5
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("startValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Volume End" },
      {
        value: selectedEnvelope.settings.endValue ?? 1
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("endValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} <div class="param"><label for="volume-curve" data-svelte-h="svelte-h9450r">Curve Type</label> <select id="volume-curve"${add_attribute("value", selectedEnvelope.settings.curve ?? "linear", 0)}><option value="linear" data-svelte-h="svelte-1jte1b2">Linear</option><option value="exponential" data-svelte-h="svelte-byu318">Exponential</option><option value="logarithmic" data-svelte-h="svelte-8u6hh4">Logarithmic</option></select></div> <div class="param param-checkbox"><label class="checkbox-label"><input type="checkbox" class="styled-checkbox" ${selectedEnvelope.settings.reverse ?? false ? "checked" : ""}> <span data-svelte-h="svelte-1qwxmvj">Reverse Direction</span></label></div>` : `${selectedEnvelope.type === "filter" ? `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Filter Start" },
      {
        value: selectedEnvelope.settings.startValue ?? 0.2
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("startValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Filter End" },
      {
        value: selectedEnvelope.settings.endValue ?? 0.8
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("endValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} <div class="param"><label for="filter-curve" data-svelte-h="svelte-zoc8f7">Curve Type</label> <select id="filter-curve"${add_attribute("value", selectedEnvelope.settings.curve ?? "linear", 0)}><option value="linear" data-svelte-h="svelte-1jte1b2">Linear</option><option value="exponential" data-svelte-h="svelte-byu318">Exponential</option><option value="logarithmic" data-svelte-h="svelte-8u6hh4">Logarithmic</option></select></div> <div class="param param-checkbox"><label class="checkbox-label"><input type="checkbox" class="styled-checkbox" ${selectedEnvelope.settings.reverse ?? false ? "checked" : ""}> <span data-svelte-h="svelte-1qwxmvj">Reverse Direction</span></label></div>` : `${selectedEnvelope.type === "pitch" ? `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Pitch Start" },
      {
        value: selectedEnvelope.settings.startValue ?? 0.5
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("startValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Pitch End" },
      {
        value: selectedEnvelope.settings.endValue ?? 1
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("endValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} <div class="param"><label for="pitch-curve" data-svelte-h="svelte-1efyil">Curve Type</label> <select id="pitch-curve"${add_attribute("value", selectedEnvelope.settings.curve ?? "linear", 0)}><option value="linear" data-svelte-h="svelte-1jte1b2">Linear</option><option value="exponential" data-svelte-h="svelte-byu318">Exponential</option><option value="logarithmic" data-svelte-h="svelte-8u6hh4">Logarithmic</option></select></div> <div class="param param-checkbox"><label class="checkbox-label"><input type="checkbox" class="styled-checkbox" ${selectedEnvelope.settings.reverse ?? false ? "checked" : ""}> <span data-svelte-h="svelte-1qwxmvj">Reverse Direction</span></label></div>` : `${selectedEnvelope.type === "pan" ? `${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Pan Start" },
      {
        value: selectedEnvelope.settings.startValue ?? 0.5
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("startValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} ${validate_component(ParamControl, "ParamControl").$$render(
    $$result,
    Object.assign(
      {},
      { label: "Pan End" },
      {
        value: selectedEnvelope.settings.endValue ?? 0.5
      },
      { min: 0 },
      { max: 1 },
      { step: 0.01 },
      {
        onChange: (v) => updateEnvelopeSetting("endValue", v)
      },
      getEnvelopeAutomationProps()
    ),
    {},
    {}
  )} <div class="param"><label for="pan-curve" data-svelte-h="svelte-1xhste2">Curve Type</label> <select id="pan-curve"${add_attribute("value", selectedEnvelope.settings.curve ?? "linear", 0)}><option value="linear" data-svelte-h="svelte-1jte1b2">Linear</option><option value="exponential" data-svelte-h="svelte-byu318">Exponential</option><option value="logarithmic" data-svelte-h="svelte-8u6hh4">Logarithmic</option></select></div> <div class="param param-checkbox"><label class="checkbox-label"><input type="checkbox" class="styled-checkbox" ${selectedEnvelope.settings.reverse ?? false ? "checked" : ""}> <span data-svelte-h="svelte-1qwxmvj">Reverse Direction</span></label></div>` : ``}`}`}`}` : ``}`}</div></div>` : ``}`;
});
const css = {
  code: ".pattern-card.svelte-1sc0z43.svelte-1sc0z43{background:#2a2a2a;border:1px solid #3a3a3a;border-radius:8px;padding:12px;cursor:pointer;transition:all 0.2s ease;display:flex;flex-direction:column;gap:12px;position:relative}.pattern-card.svelte-1sc0z43.svelte-1sc0z43:hover{background:#333;border-color:#4a4a4a;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0, 0, 0, 0.3)}.pattern-card.svelte-1sc0z43.svelte-1sc0z43:focus{outline:2px solid #7ab8ff;outline-offset:2px}.pattern-card-preview.svelte-1sc0z43.svelte-1sc0z43{width:100%;height:150px;background:#1a1a1a;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center}.pattern-card-preview.svelte-1sc0z43 canvas.svelte-1sc0z43{display:block;width:100%;height:100%}.pattern-card-info.svelte-1sc0z43.svelte-1sc0z43{display:flex;flex-direction:column;gap:4px}.pattern-card-title.svelte-1sc0z43.svelte-1sc0z43{margin:0;font-size:16px;font-weight:600;color:#ffffff}.pattern-card-instrument.svelte-1sc0z43.svelte-1sc0z43{font-size:12px;color:#888;text-transform:capitalize}.pattern-card-delete.svelte-1sc0z43.svelte-1sc0z43{position:absolute;top:8px;right:8px;background:rgba(255, 107, 107, 0.2);color:#ff6b6b;border:none;border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:18px;line-height:1;opacity:0;transition:all 0.2s ease;display:flex;align-items:center;justify-content:center;z-index:10}.pattern-card.svelte-1sc0z43:hover .pattern-card-delete.svelte-1sc0z43{opacity:1}.pattern-card-delete.svelte-1sc0z43.svelte-1sc0z43:hover{background:rgba(255, 107, 107, 0.3);transform:scale(1.1)}",
  map: '{"version":3,"file":"PatternCard.svelte","sources":["PatternCard.svelte"],"sourcesContent":["<script lang=\\"ts\\">export let pattern;\\nexport let onClick;\\nexport let onDelete = null;\\nfunction muteColor(color) {\\n  if (color.startsWith(\\"#\\")) {\\n    const num = parseInt(color.slice(1), 16);\\n    const r = num >> 16 & 255;\\n    const g = num >> 8 & 255;\\n    const b = num & 255;\\n    const mutedR = Math.floor(r * 0.6 + 100 * 0.4);\\n    const mutedG = Math.floor(g * 0.6 + 100 * 0.4);\\n    const mutedB = Math.floor(b * 0.6 + 100 * 0.4);\\n    return `rgb(${mutedR}, ${mutedG}, ${mutedB})`;\\n  }\\n  return color;\\n}\\nfunction colorToRgba(color, alpha) {\\n  if (color.startsWith(\\"#\\")) {\\n    const num = parseInt(color.slice(1), 16);\\n    const r = num >> 16 & 255;\\n    const g = num >> 8 & 255;\\n    const b = num & 255;\\n    return `rgba(${r}, ${g}, ${b}, ${alpha})`;\\n  } else if (color.startsWith(\\"rgb(\\")) {\\n    const match = color.match(/rgb\\\\((\\\\d+),\\\\s*(\\\\d+),\\\\s*(\\\\d+)\\\\)/);\\n    if (match) {\\n      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;\\n    }\\n  }\\n  return color;\\n}\\nfunction renderPreviewNode(node, ctx, scale, offsetX, offsetY, instrumentColor, depth, instrumentType) {\\n  const nodeX = node.x || 0;\\n  const nodeY = node.y || 0;\\n  if (nodeX === void 0 || nodeY === void 0 || isNaN(nodeX) || isNaN(nodeY)) {\\n    return;\\n  }\\n  const x = nodeX * scale + offsetX;\\n  const y = nodeY * scale + offsetY;\\n  const baseRadius = depth === 0 ? 50 : 18;\\n  const radius = baseRadius * scale;\\n  if (node.children && node.children.length > 0) {\\n    const mutedColor2 = muteColor(instrumentColor);\\n    ctx.strokeStyle = colorToRgba(mutedColor2, 0.2);\\n    ctx.lineWidth = Math.max(0.5, 1 * scale);\\n    ctx.lineCap = \\"round\\";\\n    for (const child of node.children) {\\n      const childX = (child.x || 0) * scale + offsetX;\\n      const childY = (child.y || 0) * scale + offsetY;\\n      if (child.x !== void 0 && child.y !== void 0 && !isNaN(child.x) && !isNaN(child.y)) {\\n        ctx.beginPath();\\n        ctx.moveTo(x, y);\\n        ctx.lineTo(childX, childY);\\n        ctx.stroke();\\n      }\\n      renderPreviewNode(child, ctx, scale, offsetX, offsetY, instrumentColor, depth + 1, instrumentType);\\n    }\\n  }\\n  const hasVelocity = node.velocity !== void 0 && node.velocity !== null && node.children.length === 0;\\n  const velocity = hasVelocity ? node.velocity ?? 1 : 1;\\n  const mutedColor = muteColor(instrumentColor);\\n  ctx.beginPath();\\n  ctx.arc(x, y, radius, 0, Math.PI * 2);\\n  if (hasVelocity && velocity < 1) {\\n    ctx.strokeStyle = colorToRgba(mutedColor, 0.3);\\n    ctx.lineWidth = Math.max(1, 2 * scale);\\n    ctx.stroke();\\n    const fillHeight = radius * 2 * velocity;\\n    const fillTop = y + radius - fillHeight;\\n    ctx.save();\\n    ctx.beginPath();\\n    ctx.arc(x, y, radius, 0, Math.PI * 2);\\n    ctx.clip();\\n    if (depth === 0) {\\n      const fillGradient = ctx.createLinearGradient(x, fillTop, x, y + radius);\\n      fillGradient.addColorStop(0, mutedColor);\\n      fillGradient.addColorStop(1, colorToRgba(mutedColor, 0.8));\\n      ctx.fillStyle = fillGradient;\\n    } else {\\n      ctx.fillStyle = colorToRgba(mutedColor, 0.5);\\n    }\\n    ctx.fillRect(x - radius, fillTop, radius * 2, fillHeight);\\n    ctx.restore();\\n  } else {\\n    if (depth === 0) {\\n      const gradient = ctx.createRadialGradient(\\n        x - radius * 0.2,\\n        y - radius * 0.2,\\n        0,\\n        x,\\n        y,\\n        radius\\n      );\\n      gradient.addColorStop(0, colorToRgba(mutedColor, 1));\\n      gradient.addColorStop(0.7, mutedColor);\\n      gradient.addColorStop(1, colorToRgba(mutedColor, 0.8));\\n      ctx.fillStyle = gradient;\\n    } else {\\n      ctx.fillStyle = colorToRgba(mutedColor, 0.5);\\n    }\\n    ctx.fill();\\n  }\\n  ctx.strokeStyle = depth === 0 ? \\"rgba(255, 255, 255, 0.3)\\" : \\"rgba(255, 255, 255, 0.2)\\";\\n  ctx.lineWidth = depth === 0 ? Math.max(1, 2 * scale) : Math.max(0.5, 1 * scale);\\n  ctx.stroke();\\n  let displayValue;\\n  if (depth === 1 && node.children.length > 0) {\\n    displayValue = node.children.length;\\n  } else {\\n    displayValue = node.division;\\n  }\\n  const fontSize = depth === 0 ? 18 * scale : 10 * scale;\\n  ctx.fillStyle = depth === 0 ? \\"#e8e8e8\\" : \\"rgba(255, 255, 255, 0.8)\\";\\n  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif`;\\n  ctx.textAlign = \\"center\\";\\n  ctx.textBaseline = \\"middle\\";\\n  ctx.fillText(displayValue.toString(), x, y);\\n  if (depth === 0 && instrumentType) {\\n    const labelY = y + radius + 20 * scale;\\n    const labelFontSize = 12 * scale;\\n    ctx.font = `${labelFontSize}px -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif`;\\n    ctx.fillStyle = \\"#b0b0b0\\";\\n    ctx.textAlign = \\"center\\";\\n    ctx.textBaseline = \\"top\\";\\n    const label = instrumentType.charAt(0).toUpperCase() + instrumentType.slice(1);\\n    ctx.fillText(label, x, labelY);\\n  }\\n}\\nfunction getPatternInstruments(pattern2) {\\n  if (pattern2.instruments && Array.isArray(pattern2.instruments) && pattern2.instruments.length > 0) {\\n    return pattern2.instruments;\\n  } else if (pattern2.instrumentType && pattern2.patternTree) {\\n    return [{\\n      id: pattern2.id,\\n      instrumentType: pattern2.instrumentType,\\n      patternTree: pattern2.patternTree,\\n      settings: pattern2.settings || {},\\n      instrumentSettings: pattern2.instrumentSettings,\\n      color: pattern2.color || \\"#7ab8ff\\",\\n      volume: pattern2.volume ?? 1,\\n      pan: pattern2.pan ?? 0,\\n      mute: pattern2.mute,\\n      solo: pattern2.solo\\n    }];\\n  }\\n  return [];\\n}\\nlet canvas;\\nlet canvasContext = null;\\n$: if (canvas && pattern) {\\n  canvasContext = canvas.getContext(\\"2d\\");\\n  if (canvasContext) {\\n    canvasContext.clearRect(0, 0, canvas.width, canvas.height);\\n    canvasContext.fillStyle = \\"#1a1a1a\\";\\n    canvasContext.fillRect(0, 0, canvas.width, canvas.height);\\n    const instruments = getPatternInstruments(pattern);\\n    if (instruments.length > 0) {\\n      let calculateBounds = function(node) {\\n        const x = node.x || 0;\\n        const y = node.y || 0;\\n        if (x !== void 0 && y !== void 0 && !isNaN(x) && !isNaN(y)) {\\n          hasNodes = true;\\n          minX = Math.min(minX, x);\\n          maxX = Math.max(maxX, x);\\n          minY = Math.min(minY, y);\\n          maxY = Math.max(maxY, y);\\n        }\\n        if (node.children && node.children.length > 0) {\\n          for (const child of node.children) {\\n            calculateBounds(child);\\n          }\\n        }\\n      };\\n      let minX = Infinity, maxX = -Infinity;\\n      let minY = Infinity, maxY = -Infinity;\\n      let hasNodes = false;\\n      for (const instrument of instruments) {\\n        if (instrument.patternTree) {\\n          calculateBounds(instrument.patternTree);\\n        }\\n      }\\n      if (hasNodes && minX !== Infinity && maxX !== -Infinity) {\\n        const contentWidth = maxX - minX;\\n        const contentHeight = maxY - minY;\\n        const paddingPercent = 0.2;\\n        const minPadding = 30;\\n        const paddingX = Math.max(minPadding, contentWidth * paddingPercent);\\n        const paddingY = Math.max(minPadding, contentHeight * paddingPercent);\\n        const totalWidth = contentWidth + paddingX * 2;\\n        const totalHeight = contentHeight + paddingY * 2;\\n        const canvasWidth = canvas.width;\\n        const canvasHeight = canvas.height;\\n        const margin = 10;\\n        const availableWidth = canvasWidth - margin * 2;\\n        const availableHeight = canvasHeight - margin * 2;\\n        const scaleX = availableWidth / totalWidth;\\n        const scaleY = availableHeight / totalHeight;\\n        const scale = Math.min(scaleX, scaleY);\\n        const scaledWidth = totalWidth * scale;\\n        const scaledHeight = totalHeight * scale;\\n        const offsetX = (canvasWidth - scaledWidth) / 2 - (minX - paddingX) * scale;\\n        const offsetY = (canvasHeight - scaledHeight) / 2 - (minY - paddingY) * scale;\\n        for (const instrument of instruments) {\\n          if (instrument.patternTree) {\\n            renderPreviewNode(\\n              instrument.patternTree,\\n              canvasContext,\\n              scale,\\n              offsetX,\\n              offsetY,\\n              instrument.color || \\"#7ab8ff\\",\\n              0,\\n              // Start at depth 0\\n              instrument.instrumentType\\n            );\\n          }\\n        }\\n      }\\n    }\\n  }\\n}\\n<\/script>\\r\\n\\r\\n<div class=\\"pattern-card\\" on:click={onClick} role=\\"button\\" tabindex=\\"0\\" on:keydown={(e) => {\\r\\n\\tif (e.key === \'Enter\' || e.key === \' \') {\\r\\n\\t\\te.preventDefault();\\r\\n\\t\\tonClick();\\r\\n\\t}\\r\\n}}>\\r\\n\\t{#if onDelete}\\r\\n\\t\\t<button \\r\\n\\t\\t\\tclass=\\"pattern-card-delete\\" \\r\\n\\t\\t\\ton:click|stopPropagation={(e) => {\\r\\n\\t\\t\\t\\te.preventDefault();\\r\\n\\t\\t\\t\\te.stopPropagation();\\r\\n\\t\\t\\t\\tif (onDelete) {\\r\\n\\t\\t\\t\\t\\tonDelete(pattern.id);\\r\\n\\t\\t\\t\\t}\\r\\n\\t\\t\\t}}\\r\\n\\t\\t\\ttitle=\\"Delete pattern\\"\\r\\n\\t\\t\\taria-label=\\"Delete pattern\\"\\r\\n\\t\\t>\\r\\n\\t\\t\\t×\\r\\n\\t\\t</button>\\r\\n\\t{/if}\\r\\n\\t<div class=\\"pattern-card-preview\\">\\r\\n\\t\\t<canvas bind:this={canvas} width={400} height={300}></canvas>\\r\\n\\t</div>\\r\\n\\t<div class=\\"pattern-card-info\\">\\r\\n\\t\\t<h3 class=\\"pattern-card-title\\">{pattern.name}</h3>\\r\\n\\t\\t{#if pattern.instruments && pattern.instruments.length > 0}\\r\\n\\t\\t\\t<span class=\\"pattern-card-instrument\\">\\r\\n\\t\\t\\t\\t{pattern.instruments.length} {pattern.instruments.length === 1 ? \'instrument\' : \'instruments\'}\\r\\n\\t\\t\\t</span>\\r\\n\\t\\t{:else if pattern.instrumentType}\\r\\n\\t\\t\\t<span class=\\"pattern-card-instrument\\">{pattern.instrumentType}</span>\\r\\n\\t\\t{/if}\\r\\n\\t</div>\\r\\n</div>\\r\\n\\r\\n<style>\\r\\n\\t.pattern-card {\\r\\n\\t\\tbackground: #2a2a2a;\\r\\n\\t\\tborder: 1px solid #3a3a3a;\\r\\n\\t\\tborder-radius: 8px;\\r\\n\\t\\tpadding: 12px;\\r\\n\\t\\tcursor: pointer;\\r\\n\\t\\ttransition: all 0.2s ease;\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\tflex-direction: column;\\r\\n\\t\\tgap: 12px;\\r\\n\\t\\tposition: relative;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card:hover {\\r\\n\\t\\tbackground: #333;\\r\\n\\t\\tborder-color: #4a4a4a;\\r\\n\\t\\ttransform: translateY(-2px);\\r\\n\\t\\tbox-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card:focus {\\r\\n\\t\\toutline: 2px solid #7ab8ff;\\r\\n\\t\\toutline-offset: 2px;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card-preview {\\r\\n\\t\\twidth: 100%;\\r\\n\\t\\theight: 150px;\\r\\n\\t\\tbackground: #1a1a1a;\\r\\n\\t\\tborder-radius: 4px;\\r\\n\\t\\toverflow: hidden;\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\talign-items: center;\\r\\n\\t\\tjustify-content: center;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card-preview canvas {\\r\\n\\t\\tdisplay: block;\\r\\n\\t\\twidth: 100%;\\r\\n\\t\\theight: 100%;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card-info {\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\tflex-direction: column;\\r\\n\\t\\tgap: 4px;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card-title {\\r\\n\\t\\tmargin: 0;\\r\\n\\t\\tfont-size: 16px;\\r\\n\\t\\tfont-weight: 600;\\r\\n\\t\\tcolor: #ffffff;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card-instrument {\\r\\n\\t\\tfont-size: 12px;\\r\\n\\t\\tcolor: #888;\\r\\n\\t\\ttext-transform: capitalize;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card-delete {\\r\\n\\t\\tposition: absolute;\\r\\n\\t\\ttop: 8px;\\r\\n\\t\\tright: 8px;\\r\\n\\t\\tbackground: rgba(255, 107, 107, 0.2);\\r\\n\\t\\tcolor: #ff6b6b;\\r\\n\\t\\tborder: none;\\r\\n\\t\\tborder-radius: 4px;\\r\\n\\t\\twidth: 24px;\\r\\n\\t\\theight: 24px;\\r\\n\\t\\tcursor: pointer;\\r\\n\\t\\tfont-size: 18px;\\r\\n\\t\\tline-height: 1;\\r\\n\\t\\topacity: 0;\\r\\n\\t\\ttransition: all 0.2s ease;\\r\\n\\t\\tdisplay: flex;\\r\\n\\t\\talign-items: center;\\r\\n\\t\\tjustify-content: center;\\r\\n\\t\\tz-index: 10;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card:hover .pattern-card-delete {\\r\\n\\t\\topacity: 1;\\r\\n\\t}\\r\\n\\t\\r\\n\\t.pattern-card-delete:hover {\\r\\n\\t\\tbackground: rgba(255, 107, 107, 0.3);\\r\\n\\t\\ttransform: scale(1.1);\\r\\n\\t}\\r\\n</style>\\r\\n\\r\\n"],"names":[],"mappings":"AAqQC,2CAAc,CACb,UAAU,CAAE,OAAO,CACnB,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,OAAO,CACzB,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,IAAI,CACb,MAAM,CAAE,OAAO,CACf,UAAU,CAAE,GAAG,CAAC,IAAI,CAAC,IAAI,CACzB,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAAM,CACtB,GAAG,CAAE,IAAI,CACT,QAAQ,CAAE,QACX,CAEA,2CAAa,MAAO,CACnB,UAAU,CAAE,IAAI,CAChB,YAAY,CAAE,OAAO,CACrB,SAAS,CAAE,WAAW,IAAI,CAAC,CAC3B,UAAU,CAAE,CAAC,CAAC,GAAG,CAAC,IAAI,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CACzC,CAEA,2CAAa,MAAO,CACnB,OAAO,CAAE,GAAG,CAAC,KAAK,CAAC,OAAO,CAC1B,cAAc,CAAE,GACjB,CAEA,mDAAsB,CACrB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,KAAK,CACb,UAAU,CAAE,OAAO,CACnB,aAAa,CAAE,GAAG,CAClB,QAAQ,CAAE,MAAM,CAChB,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,eAAe,CAAE,MAClB,CAEA,oCAAqB,CAAC,qBAAO,CAC5B,OAAO,CAAE,KAAK,CACd,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IACT,CAEA,gDAAmB,CAClB,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAAM,CACtB,GAAG,CAAE,GACN,CAEA,iDAAoB,CACnB,MAAM,CAAE,CAAC,CACT,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,GAAG,CAChB,KAAK,CAAE,OACR,CAEA,sDAAyB,CACxB,SAAS,CAAE,IAAI,CACf,KAAK,CAAE,IAAI,CACX,cAAc,CAAE,UACjB,CAEA,kDAAqB,CACpB,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,GAAG,CACR,KAAK,CAAE,GAAG,CACV,UAAU,CAAE,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CACpC,KAAK,CAAE,OAAO,CACd,MAAM,CAAE,IAAI,CACZ,aAAa,CAAE,GAAG,CAClB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,OAAO,CACf,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,CAAC,CACd,OAAO,CAAE,CAAC,CACV,UAAU,CAAE,GAAG,CAAC,IAAI,CAAC,IAAI,CACzB,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,eAAe,CAAE,MAAM,CACvB,OAAO,CAAE,EACV,CAEA,4BAAa,MAAM,CAAC,mCAAqB,CACxC,OAAO,CAAE,CACV,CAEA,kDAAoB,MAAO,CAC1B,UAAU,CAAE,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CACpC,SAAS,CAAE,MAAM,GAAG,CACrB"}'
};
const PatternCard = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { pattern } = $$props;
  let { onClick } = $$props;
  let { onDelete = null } = $$props;
  let canvas;
  if ($$props.pattern === void 0 && $$bindings.pattern && pattern !== void 0) $$bindings.pattern(pattern);
  if ($$props.onClick === void 0 && $$bindings.onClick && onClick !== void 0) $$bindings.onClick(onClick);
  if ($$props.onDelete === void 0 && $$bindings.onDelete && onDelete !== void 0) $$bindings.onDelete(onDelete);
  $$result.css.add(css);
  return `<div class="pattern-card svelte-1sc0z43" role="button" tabindex="0">${onDelete ? `<button class="pattern-card-delete svelte-1sc0z43" title="Delete pattern" aria-label="Delete pattern" data-svelte-h="svelte-v65pnz">×</button>` : ``} <div class="pattern-card-preview svelte-1sc0z43"><canvas${add_attribute("width", 400, 0)}${add_attribute("height", 300, 0)} class="svelte-1sc0z43"${add_attribute("this", canvas, 0)}></canvas></div> <div class="pattern-card-info svelte-1sc0z43"><h3 class="pattern-card-title svelte-1sc0z43">${escape(pattern.name)}</h3> ${pattern.instruments && pattern.instruments.length > 0 ? `<span class="pattern-card-instrument svelte-1sc0z43">${escape(pattern.instruments.length)} ${escape(pattern.instruments.length === 1 ? "instrument" : "instruments")}</span>` : `${pattern.instrumentType ? `<span class="pattern-card-instrument svelte-1sc0z43">${escape(pattern.instrumentType)}</span>` : ``}`}</div> </div>`;
});
let viewHeight = 200;
const AutomationCurveEditor = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let automation;
  let timelineObject;
  let paramMin;
  let paramMax;
  let points;
  let pointsKey;
  let $projectStore, $$unsubscribe_projectStore;
  $$unsubscribe_projectStore = subscribe(projectStore, (value) => $projectStore = value);
  let { automationWindow } = $$props;
  let project;
  let canvas;
  let viewStartBeat = 0;
  let viewEndBeat = 32;
  if ($$props.automationWindow === void 0 && $$bindings.automationWindow && automationWindow !== void 0) $$bindings.automationWindow(automationWindow);
  project = $projectStore;
  automation = (() => {
    if (!project || !project.automation) return null;
    const automationId = automationWindow.timelineInstanceId ? `${automationWindow.targetType}:${automationWindow.targetId}:${automationWindow.timelineInstanceId}:${automationWindow.parameterKey}` : `${automationWindow.targetType}:${automationWindow.targetId}:${automationWindow.parameterKey}`;
    return project.automation[automationId] || null;
  })();
  timelineObject = (() => {
    if (!automationWindow.timelineInstanceId || !project?.timeline) return null;
    if (automationWindow.targetType === "effect") {
      return project.timeline.effects?.find((e) => e.id === automationWindow.timelineInstanceId);
    } else {
      return project.timeline.envelopes?.find((e) => e.id === automationWindow.timelineInstanceId);
    }
  })();
  {
    {
      if (timelineObject) {
        viewStartBeat = timelineObject.startBeat || 0;
        viewEndBeat = (timelineObject.startBeat || 0) + (timelineObject.duration || 32);
      } else {
        viewStartBeat = 0;
        viewEndBeat = project?.timeline?.totalLength || 32;
      }
    }
  }
  paramMin = (() => {
    if (automationWindow.targetType === "effect") {
      const effect = project?.effects?.find((e) => e.id === automationWindow.targetId);
      if (effect) {
        return automation?.min ?? 0;
      }
    } else {
      const envelope = project?.envelopes?.find((e) => e.id === automationWindow.targetId);
      if (envelope) {
        return automation?.min ?? 0;
      }
    }
    return automation?.min ?? 0;
  })();
  paramMax = (() => {
    if (automationWindow.targetType === "effect") {
      const effect = project?.effects?.find((e) => e.id === automationWindow.targetId);
      if (effect) {
        return automation?.max ?? 1;
      }
    } else {
      const envelope = project?.envelopes?.find((e) => e.id === automationWindow.targetId);
      if (envelope) {
        return automation?.max ?? 1;
      }
    }
    return automation?.max ?? 1;
  })();
  points = automation?.points || [];
  pointsKey = points ? JSON.stringify(points) : "";
  `${pointsKey}-${viewStartBeat}-${viewEndBeat}-${automation?.points?.length || 0}-${paramMin}-${paramMax}`;
  $$unsubscribe_projectStore();
  return `<div class="automation-window"><div class="automation-window-header"><div class="automation-window-title"><span class="automation-icon" data-svelte-h="svelte-1hnspyf">📈</span> <span>${escape(automationWindow.label)}</span></div> <div class="automation-window-controls"><button class="clear-btn" title="Clear automation" data-svelte-h="svelte-1abnc5a">Clear</button> <button class="close-btn" title="Close" data-svelte-h="svelte-7arj6m">×</button></div></div> <div class="automation-window-content"><canvas class="automation-canvas" style="${"height: " + escape(viewHeight, true) + "px;"}"${add_attribute("this", canvas, 0)}></canvas> <div class="automation-info"><span>Beats: ${escape(viewStartBeat.toFixed(1))} - ${escape(viewEndBeat.toFixed(1))}</span> <span>Value: ${escape(paramMin.toFixed(2))} - ${escape(paramMax.toFixed(2))}</span> <span>Points: ${escape(points.length)}</span></div></div></div>`;
});
function calculateEnvelopeCurveValue(progress, settings, envelopeType) {
  let defaultStart = 0;
  let defaultEnd = 1;
  if (envelopeType === "pitch") {
    defaultStart = 0.5;
    defaultEnd = 0.5;
  }
  const startValue = settings.startValue !== void 0 && settings.startValue !== null ? settings.startValue : defaultStart;
  const endValue = settings.endValue !== void 0 && settings.endValue !== null ? settings.endValue : defaultEnd;
  const curve = settings.curve || "linear";
  const reverse = settings.reverse === true;
  let actualProgress = reverse ? 1 - progress : progress;
  let value;
  switch (curve) {
    case "exponential":
      value = startValue + (endValue - startValue) * ((Math.exp(actualProgress * 5) - 1) / (Math.exp(5) - 1));
      break;
    case "logarithmic":
      value = startValue + (endValue - startValue) * (Math.log(actualProgress * 9 + 1) / Math.log(10));
      break;
    case "linear":
    default:
      value = startValue + (endValue - startValue) * actualProgress;
      break;
  }
  return Math.max(0, Math.min(1, value));
}
function generateEnvelopeCurvePath(width, height, envelope, duration) {
  if (!envelope || !envelope.settings) return "";
  const settings = envelope.settings;
  let defaultStart = 0;
  let defaultEnd = 1;
  if (envelope.type === "pitch") {
    defaultStart = 0.5;
    defaultEnd = 0.5;
  }
  const startValue = settings.startValue !== void 0 && settings.startValue !== null ? settings.startValue : defaultStart;
  const endValue = settings.endValue !== void 0 && settings.endValue !== null ? settings.endValue : defaultEnd;
  const startY = height * (1 - startValue);
  const endY = height * (1 - endValue);
  const numPoints = Math.max(20, Math.floor(width / 2));
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const progress = i / numPoints;
    const value = calculateEnvelopeCurveValue(progress, settings, envelope.type);
    const x = progress * width;
    const y = height * (1 - value);
    points.push([x, y]);
  }
  const clampedStartY = Math.max(0, Math.min(height, startY));
  const clampedEndY = Math.max(0, Math.min(height, endY));
  let path = `M 0 ${height}`;
  path += ` L 0 ${clampedStartY}`;
  for (const [x, y] of points) {
    const clampedY = Math.max(0, Math.min(height, y));
    path += ` L ${x} ${clampedY}`;
  }
  path += ` L ${width} ${clampedEndY}`;
  path += ` L ${width} ${height} Z`;
  return path;
}
const TIMELINE_CONSTANTS = {
  ROW_LABEL_WIDTH: 200,
  BASE_ZOOM: 8,
  BASE_PIXELS_PER_BEAT: 4,
  RULER_HEIGHT: 50,
  PATTERN_ROW_HEIGHT: 80,
  BEATS_PER_BAR: 4
};
function beatToPixel(beat, pixelsPerBeat) {
  return beat * pixelsPerBeat;
}
function pixelToBeat(pixel, pixelsPerBeat) {
  return pixel / pixelsPerBeat;
}
function snapToBeat(beat) {
  return Math.round(beat * 4) / 4;
}
function formatZoomDisplay(zoomLevel, baseZoom) {
  return `${Math.round(zoomLevel / baseZoom * 100)}%`;
}
function clampZoomLevel(zoomLevel, delta, min = 0.25, max = 64) {
  return Math.max(min, Math.min(max, zoomLevel + delta));
}
function generateRulerMarks(totalLength, pixelsPerBeat) {
  if (!totalLength) return [];
  const marks = [];
  const { BEATS_PER_BAR } = TIMELINE_CONSTANTS;
  for (let beat = 0; beat <= totalLength; beat += 1) {
    const isBar = beat % BEATS_PER_BAR === 0;
    const barNumber = Math.floor(beat / BEATS_PER_BAR);
    const beatInBar = Math.floor(beat % BEATS_PER_BAR);
    marks.push({
      beat,
      x: beat * pixelsPerBeat,
      isBar,
      isBeat: true,
      barNumber,
      beatInBar
    });
  }
  return marks;
}
function generateGridLines(totalLength, pixelsPerBeat) {
  if (!totalLength) return [];
  const lines = [];
  const { BEATS_PER_BAR } = TIMELINE_CONSTANTS;
  for (let beat = 0; beat <= totalLength; beat += 1) {
    const isBar = beat % BEATS_PER_BAR === 0;
    lines.push({
      beat,
      x: beat * pixelsPerBeat,
      isBar,
      isBeat: true
    });
  }
  return lines;
}
const PatternSidebar = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $page, $$unsubscribe_page;
  $$unsubscribe_page = subscribe(page, (value) => $page = value);
  let { patterns } = $$props;
  let { sidebarWidth: sidebarWidth2 } = $$props;
  let { editingPatternId = null } = $$props;
  let { viewMode } = $$props;
  let { createPattern } = $$props;
  let { deletePattern } = $$props;
  let { selectPattern } = $$props;
  let { handleEffectEnvelopeDragStart } = $$props;
  let editingPatternInput = null;
  if ($$props.patterns === void 0 && $$bindings.patterns && patterns !== void 0) $$bindings.patterns(patterns);
  if ($$props.sidebarWidth === void 0 && $$bindings.sidebarWidth && sidebarWidth2 !== void 0) $$bindings.sidebarWidth(sidebarWidth2);
  if ($$props.editingPatternId === void 0 && $$bindings.editingPatternId && editingPatternId !== void 0) $$bindings.editingPatternId(editingPatternId);
  if ($$props.viewMode === void 0 && $$bindings.viewMode && viewMode !== void 0) $$bindings.viewMode(viewMode);
  if ($$props.createPattern === void 0 && $$bindings.createPattern && createPattern !== void 0) $$bindings.createPattern(createPattern);
  if ($$props.deletePattern === void 0 && $$bindings.deletePattern && deletePattern !== void 0) $$bindings.deletePattern(deletePattern);
  if ($$props.selectPattern === void 0 && $$bindings.selectPattern && selectPattern !== void 0) $$bindings.selectPattern(selectPattern);
  if ($$props.handleEffectEnvelopeDragStart === void 0 && $$bindings.handleEffectEnvelopeDragStart && handleEffectEnvelopeDragStart !== void 0) $$bindings.handleEffectEnvelopeDragStart(handleEffectEnvelopeDragStart);
  $$unsubscribe_page();
  return `<div class="pattern-sidebar" style="${"width: " + escape(sidebarWidth2, true) + "px;"}"><div class="sidebar-header"><h3 data-svelte-h="svelte-y7hicb">Patterns</h3> <button class="create-pattern-btn" title="Create new pattern" data-svelte-h="svelte-qnytug">+</button></div> <div class="patterns-list">${each(patterns, (pattern) => {
    return `<button class="${"pattern-item " + escape(
      $page.url.pathname.includes(`/pattern/${pattern.id}`) ? "active" : "",
      true
    )}"${add_attribute("draggable", viewMode === "arrangement" && editingPatternId !== pattern.id, 0)} tabindex="0"><div class="pattern-color" style="${"background: " + escape(pattern.color, true) + ";"}"></div> ${editingPatternId === pattern.id ? `<input type="text" class="pattern-name-input-inline"${add_attribute("value", pattern.name, 0)}${add_attribute("this", editingPatternInput, 0)}>` : `<span class="pattern-name" role="button" tabindex="0" aria-label="Double-click to rename pattern" title="Double-click to rename">${escape(pattern.name)} </span>`} <span class="pattern-instrument">${escape(pattern.instrumentType)}</span> <button class="pattern-delete" title="Delete pattern" data-svelte-h="svelte-1wnfonf">×</button> </button>`;
  })} ${patterns.length === 0 ? `<div class="empty-state" data-svelte-h="svelte-1f2ld55">No patterns yet. Create one to get started!</div>` : ``}</div> ${validate_component(EffectsEnvelopesPanel, "EffectsEnvelopesPanel").$$render(
    $$result,
    {
      onDragStart: handleEffectEnvelopeDragStart
    },
    {},
    {}
  )}</div>`;
});
const TimelineRuler = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let rulerMarks;
  let zoomDisplay;
  let { totalLength } = $$props;
  let { pixelsPerBeat } = $$props;
  let { zoomLevel } = $$props;
  let { showAddTrackMenu } = $$props;
  let { onZoomWheel = () => {
  } } = $$props;
  let { onCreateTrack } = $$props;
  let { onToggleAddTrackMenu } = $$props;
  if ($$props.totalLength === void 0 && $$bindings.totalLength && totalLength !== void 0) $$bindings.totalLength(totalLength);
  if ($$props.pixelsPerBeat === void 0 && $$bindings.pixelsPerBeat && pixelsPerBeat !== void 0) $$bindings.pixelsPerBeat(pixelsPerBeat);
  if ($$props.zoomLevel === void 0 && $$bindings.zoomLevel && zoomLevel !== void 0) $$bindings.zoomLevel(zoomLevel);
  if ($$props.showAddTrackMenu === void 0 && $$bindings.showAddTrackMenu && showAddTrackMenu !== void 0) $$bindings.showAddTrackMenu(showAddTrackMenu);
  if ($$props.onZoomWheel === void 0 && $$bindings.onZoomWheel && onZoomWheel !== void 0) $$bindings.onZoomWheel(onZoomWheel);
  if ($$props.onCreateTrack === void 0 && $$bindings.onCreateTrack && onCreateTrack !== void 0) $$bindings.onCreateTrack(onCreateTrack);
  if ($$props.onToggleAddTrackMenu === void 0 && $$bindings.onToggleAddTrackMenu && onToggleAddTrackMenu !== void 0) $$bindings.onToggleAddTrackMenu(onToggleAddTrackMenu);
  rulerMarks = generateRulerMarks(totalLength, pixelsPerBeat);
  zoomDisplay = formatZoomDisplay(zoomLevel, TIMELINE_CONSTANTS.BASE_ZOOM);
  return `<div class="timeline-ruler-container"><div class="ruler-label-spacer" style="${"width: " + escape(TIMELINE_CONSTANTS.ROW_LABEL_WIDTH, true) + "px;"}">${Math.round(zoomLevel / TIMELINE_CONSTANTS.BASE_ZOOM * 100) !== 100 ? `<div class="zoom-indicator" title="${"Zoom: " + escape(zoomDisplay, true) + " (Ctrl+Wheel to zoom)"}">${escape(zoomDisplay)}</div>` : ``} <div class="add-track-dropdown-ruler"><span class="add-track-trigger" role="button" tabindex="0" data-svelte-h="svelte-1b9cssx">+ Add Track</span> ${showAddTrackMenu ? `<div class="add-track-menu"><button data-svelte-h="svelte-5byxaf">Pattern Track</button> <button data-svelte-h="svelte-1uprckr">Effect Track</button> <button data-svelte-h="svelte-2k7w7x">Envelope Track</button></div>` : ``}</div></div> <div class="timeline-ruler" style="${"height: " + escape(TIMELINE_CONSTANTS.RULER_HEIGHT, true) + "px; width: " + escape(beatToPixel(totalLength, pixelsPerBeat), true) + "px;"}">${each(rulerMarks, (mark) => {
    return `<div class="${"ruler-mark " + escape(mark.isBar ? "bar" : "beat", true)}" style="${"left: " + escape(mark.x, true) + "px;"}">${mark.isBar ? `<span class="ruler-label bar-label">${escape(mark.barNumber + 1)}</span>` : `${mark.beatInBar > 0 ? `<span class="ruler-label beat-label">${escape(mark.beatInBar + 1)}</span>` : ``}`} </div>`;
  })}</div></div>`;
});
const TimelineClip = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let clipLeft;
  let clipWidth;
  let { clip } = $$props;
  let { pattern } = $$props;
  let { pixelsPerBeat } = $$props;
  let { isDragging } = $$props;
  let { isGreyedOut } = $$props;
  let { onMouseDown } = $$props;
  let { onClick } = $$props;
  let { onContextMenu } = $$props;
  const onDelete = () => {
  };
  if ($$props.clip === void 0 && $$bindings.clip && clip !== void 0) $$bindings.clip(clip);
  if ($$props.pattern === void 0 && $$bindings.pattern && pattern !== void 0) $$bindings.pattern(pattern);
  if ($$props.pixelsPerBeat === void 0 && $$bindings.pixelsPerBeat && pixelsPerBeat !== void 0) $$bindings.pixelsPerBeat(pixelsPerBeat);
  if ($$props.isDragging === void 0 && $$bindings.isDragging && isDragging !== void 0) $$bindings.isDragging(isDragging);
  if ($$props.isGreyedOut === void 0 && $$bindings.isGreyedOut && isGreyedOut !== void 0) $$bindings.isGreyedOut(isGreyedOut);
  if ($$props.onMouseDown === void 0 && $$bindings.onMouseDown && onMouseDown !== void 0) $$bindings.onMouseDown(onMouseDown);
  if ($$props.onClick === void 0 && $$bindings.onClick && onClick !== void 0) $$bindings.onClick(onClick);
  if ($$props.onContextMenu === void 0 && $$bindings.onContextMenu && onContextMenu !== void 0) $$bindings.onContextMenu(onContextMenu);
  if ($$props.onDelete === void 0 && $$bindings.onDelete && onDelete !== void 0) $$bindings.onDelete(onDelete);
  clipLeft = beatToPixel(clip.startBeat, pixelsPerBeat);
  clipWidth = Math.max(20, beatToPixel(clip.duration, pixelsPerBeat));
  return `${pattern ? `<div class="${"timeline-clip " + escape(isDragging ? "dragging" : "", true) + " " + escape(isGreyedOut ? "greyed-out" : "", true)}" style="${"left: " + escape(clipLeft, true) + "px; width: " + escape(clipWidth, true) + "px; background: " + escape(isGreyedOut ? "#666666" : pattern.color, true) + "CC; border-color: " + escape(isGreyedOut ? "#666666" : pattern.color, true) + "; opacity: " + escape(isGreyedOut ? 0.5 : 1, true) + ";"}" role="button" tabindex="0" aria-label="${"Timeline clip: " + escape(pattern.name, true)}" title="Right-click to delete"><div class="clip-resize-handle-left" title="Drag to resize left edge"></div> <span class="clip-label">${escape(pattern.name)}</span> <div class="clip-resize-handle-right" title="Drag to resize right edge"></div></div>` : ``}`;
});
const TimelineEffectClip = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let effectLeft;
  let effectWidth;
  let clipHeight;
  let { timelineEffect } = $$props;
  let { effect } = $$props;
  let { assignedPattern } = $$props;
  let { pixelsPerBeat } = $$props;
  let { isSelected } = $$props;
  let { isDragging } = $$props;
  let { automationCurves } = $$props;
  let { onMouseDown } = $$props;
  let { onClick } = $$props;
  let { onKeyDown } = $$props;
  let { onContextMenu } = $$props;
  const onDelete = () => {
  };
  if ($$props.timelineEffect === void 0 && $$bindings.timelineEffect && timelineEffect !== void 0) $$bindings.timelineEffect(timelineEffect);
  if ($$props.effect === void 0 && $$bindings.effect && effect !== void 0) $$bindings.effect(effect);
  if ($$props.assignedPattern === void 0 && $$bindings.assignedPattern && assignedPattern !== void 0) $$bindings.assignedPattern(assignedPattern);
  if ($$props.pixelsPerBeat === void 0 && $$bindings.pixelsPerBeat && pixelsPerBeat !== void 0) $$bindings.pixelsPerBeat(pixelsPerBeat);
  if ($$props.isSelected === void 0 && $$bindings.isSelected && isSelected !== void 0) $$bindings.isSelected(isSelected);
  if ($$props.isDragging === void 0 && $$bindings.isDragging && isDragging !== void 0) $$bindings.isDragging(isDragging);
  if ($$props.automationCurves === void 0 && $$bindings.automationCurves && automationCurves !== void 0) $$bindings.automationCurves(automationCurves);
  if ($$props.onMouseDown === void 0 && $$bindings.onMouseDown && onMouseDown !== void 0) $$bindings.onMouseDown(onMouseDown);
  if ($$props.onClick === void 0 && $$bindings.onClick && onClick !== void 0) $$bindings.onClick(onClick);
  if ($$props.onKeyDown === void 0 && $$bindings.onKeyDown && onKeyDown !== void 0) $$bindings.onKeyDown(onKeyDown);
  if ($$props.onContextMenu === void 0 && $$bindings.onContextMenu && onContextMenu !== void 0) $$bindings.onContextMenu(onContextMenu);
  if ($$props.onDelete === void 0 && $$bindings.onDelete && onDelete !== void 0) $$bindings.onDelete(onDelete);
  effectLeft = beatToPixel(timelineEffect.startBeat, pixelsPerBeat);
  effectWidth = Math.max(20, beatToPixel(timelineEffect.duration, pixelsPerBeat));
  clipHeight = TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT - 18;
  return `<div class="${"timeline-clip timeline-effect " + escape(isSelected ? "selected" : "", true) + " " + escape(isDragging ? "dragging" : "", true)}" style="${"left: " + escape(effectLeft, true) + "px; width: " + escape(effectWidth, true) + "px; background: " + escape(effect.color, true) + "80; border-color: " + escape(effect.color, true) + ";"}" role="button" tabindex="0" title="Right-click to delete"> ${automationCurves.length > 0 ? `<svg class="envelope-curve-visualization"${add_attribute("width", effectWidth, 0)}${add_attribute("height", clipHeight, 0)} style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1;">${each(automationCurves, (curveItem) => {
    let curvePath = generateAutomationCurvePath(effectWidth, clipHeight, curveItem.automation, timelineEffect.startBeat, timelineEffect.duration);
    return ` ${curvePath ? `<path${add_attribute("d", curvePath, 0)}${add_attribute("fill", effect.color, 0)} fill-opacity="0.5"></path>` : ``}`;
  })}</svg>` : ``} <div class="clip-resize-handle-left" title="Drag to resize left edge"></div> <span class="clip-label">${escape(effect.name)} ${assignedPattern ? `<span class="pattern-badge">→ ${escape(assignedPattern.name)}</span>` : `<span class="pattern-badge global" data-svelte-h="svelte-1fp1kt">Global</span>`}</span> <div class="clip-resize-handle-right" title="Drag to resize right edge"></div></div>`;
});
const TimelineEnvelopeClip = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let envelopeLeft;
  let envelopeWidth;
  let clipHeight;
  let curvePath;
  let { timelineEnvelope } = $$props;
  let { envelope } = $$props;
  let { assignedPattern } = $$props;
  let { pixelsPerBeat } = $$props;
  let { isSelected } = $$props;
  let { isDragging } = $$props;
  let { onMouseDown } = $$props;
  let { onClick } = $$props;
  let { onKeyDown } = $$props;
  let { onContextMenu } = $$props;
  const onDelete = () => {
  };
  if ($$props.timelineEnvelope === void 0 && $$bindings.timelineEnvelope && timelineEnvelope !== void 0) $$bindings.timelineEnvelope(timelineEnvelope);
  if ($$props.envelope === void 0 && $$bindings.envelope && envelope !== void 0) $$bindings.envelope(envelope);
  if ($$props.assignedPattern === void 0 && $$bindings.assignedPattern && assignedPattern !== void 0) $$bindings.assignedPattern(assignedPattern);
  if ($$props.pixelsPerBeat === void 0 && $$bindings.pixelsPerBeat && pixelsPerBeat !== void 0) $$bindings.pixelsPerBeat(pixelsPerBeat);
  if ($$props.isSelected === void 0 && $$bindings.isSelected && isSelected !== void 0) $$bindings.isSelected(isSelected);
  if ($$props.isDragging === void 0 && $$bindings.isDragging && isDragging !== void 0) $$bindings.isDragging(isDragging);
  if ($$props.onMouseDown === void 0 && $$bindings.onMouseDown && onMouseDown !== void 0) $$bindings.onMouseDown(onMouseDown);
  if ($$props.onClick === void 0 && $$bindings.onClick && onClick !== void 0) $$bindings.onClick(onClick);
  if ($$props.onKeyDown === void 0 && $$bindings.onKeyDown && onKeyDown !== void 0) $$bindings.onKeyDown(onKeyDown);
  if ($$props.onContextMenu === void 0 && $$bindings.onContextMenu && onContextMenu !== void 0) $$bindings.onContextMenu(onContextMenu);
  if ($$props.onDelete === void 0 && $$bindings.onDelete && onDelete !== void 0) $$bindings.onDelete(onDelete);
  envelopeLeft = beatToPixel(timelineEnvelope.startBeat, pixelsPerBeat);
  envelopeWidth = Math.max(20, beatToPixel(timelineEnvelope.duration, pixelsPerBeat));
  clipHeight = TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT - 18;
  curvePath = generateEnvelopeCurvePath(envelopeWidth, clipHeight, envelope, timelineEnvelope.duration);
  return `<div class="${"timeline-clip timeline-envelope " + escape(isSelected ? "selected" : "", true) + " " + escape(isDragging ? "dragging" : "", true)}" style="${"left: " + escape(envelopeLeft, true) + "px; width: " + escape(envelopeWidth, true) + "px; background: " + escape(envelope.color, true) + "40; border-color: " + escape(envelope.color, true) + ";"}" role="button" tabindex="0" title="Right-click to delete"> <svg class="envelope-curve-visualization"${add_attribute("width", envelopeWidth, 0)}${add_attribute("height", clipHeight, 0)} style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1;"><path${add_attribute("d", curvePath, 0)}${add_attribute("fill", envelope.color, 0)} opacity="0.7"></path></svg> <div class="clip-resize-handle-left" title="Drag to resize left edge"></div> <span class="clip-label">${escape(envelope.name)} ${assignedPattern ? `<span class="pattern-badge">→ ${escape(assignedPattern.name)}</span>` : `<span class="pattern-badge global" data-svelte-h="svelte-1fp1kt">Global</span>`}</span> <div class="clip-resize-handle-right" title="Drag to resize right edge"></div></div>`;
});
const TimelineTrackRow = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let gridLines;
  let defaultColors;
  let trackColor;
  let rowLabelBackground;
  let hasSoloedTrack;
  let isGreyedOut;
  let { track } = $$props;
  let { trackClips } = $$props;
  let { trackEffects } = $$props;
  let { trackEnvelopes } = $$props;
  let { trackPattern } = $$props;
  const patterns = [];
  let { effects } = $$props;
  let { envelopes } = $$props;
  let { timeline } = $$props;
  let { pixelsPerBeat } = $$props;
  let { totalLength } = $$props;
  let { dragOverRow } = $$props;
  let { dragOverTrackId } = $$props;
  let { draggedTrackId } = $$props;
  let { isResizing } = $$props;
  let { isDraggingClip } = $$props;
  let { selectedEffectId } = $$props;
  let { selectedEnvelopeId } = $$props;
  let { getAutomationCurvesForEffect } = $$props;
  let { onTrackDragStart } = $$props;
  let { onTrackDragOver } = $$props;
  let { onTrackDragLeave } = $$props;
  let { onTrackDrop } = $$props;
  let { onRowDragOver } = $$props;
  let { onRowDragLeave } = $$props;
  let { onRowDrop } = $$props;
  let { onRowClick } = $$props;
  let { onTrackVolumeMouseDown } = $$props;
  let { onToggleTrackMute } = $$props;
  let { onToggleTrackSolo } = $$props;
  let { onDeleteTrack } = $$props;
  let { onChangeTrackColor = () => {
  } } = $$props;
  let { onClipMouseDown } = $$props;
  let { onClipClick } = $$props;
  let { onClipKeyDown } = $$props;
  let { onDeleteClip } = $$props;
  const onAddClipToTimeline = () => {
  };
  const onAddEffectToTimeline = () => {
  };
  const onAddEnvelopeToTimeline = () => {
  };
  let { findPatternById } = $$props;
  if ($$props.track === void 0 && $$bindings.track && track !== void 0) $$bindings.track(track);
  if ($$props.trackClips === void 0 && $$bindings.trackClips && trackClips !== void 0) $$bindings.trackClips(trackClips);
  if ($$props.trackEffects === void 0 && $$bindings.trackEffects && trackEffects !== void 0) $$bindings.trackEffects(trackEffects);
  if ($$props.trackEnvelopes === void 0 && $$bindings.trackEnvelopes && trackEnvelopes !== void 0) $$bindings.trackEnvelopes(trackEnvelopes);
  if ($$props.trackPattern === void 0 && $$bindings.trackPattern && trackPattern !== void 0) $$bindings.trackPattern(trackPattern);
  if ($$props.patterns === void 0 && $$bindings.patterns && patterns !== void 0) $$bindings.patterns(patterns);
  if ($$props.effects === void 0 && $$bindings.effects && effects !== void 0) $$bindings.effects(effects);
  if ($$props.envelopes === void 0 && $$bindings.envelopes && envelopes !== void 0) $$bindings.envelopes(envelopes);
  if ($$props.timeline === void 0 && $$bindings.timeline && timeline !== void 0) $$bindings.timeline(timeline);
  if ($$props.pixelsPerBeat === void 0 && $$bindings.pixelsPerBeat && pixelsPerBeat !== void 0) $$bindings.pixelsPerBeat(pixelsPerBeat);
  if ($$props.totalLength === void 0 && $$bindings.totalLength && totalLength !== void 0) $$bindings.totalLength(totalLength);
  if ($$props.dragOverRow === void 0 && $$bindings.dragOverRow && dragOverRow !== void 0) $$bindings.dragOverRow(dragOverRow);
  if ($$props.dragOverTrackId === void 0 && $$bindings.dragOverTrackId && dragOverTrackId !== void 0) $$bindings.dragOverTrackId(dragOverTrackId);
  if ($$props.draggedTrackId === void 0 && $$bindings.draggedTrackId && draggedTrackId !== void 0) $$bindings.draggedTrackId(draggedTrackId);
  if ($$props.isResizing === void 0 && $$bindings.isResizing && isResizing !== void 0) $$bindings.isResizing(isResizing);
  if ($$props.isDraggingClip === void 0 && $$bindings.isDraggingClip && isDraggingClip !== void 0) $$bindings.isDraggingClip(isDraggingClip);
  if ($$props.selectedEffectId === void 0 && $$bindings.selectedEffectId && selectedEffectId !== void 0) $$bindings.selectedEffectId(selectedEffectId);
  if ($$props.selectedEnvelopeId === void 0 && $$bindings.selectedEnvelopeId && selectedEnvelopeId !== void 0) $$bindings.selectedEnvelopeId(selectedEnvelopeId);
  if ($$props.getAutomationCurvesForEffect === void 0 && $$bindings.getAutomationCurvesForEffect && getAutomationCurvesForEffect !== void 0) $$bindings.getAutomationCurvesForEffect(getAutomationCurvesForEffect);
  if ($$props.onTrackDragStart === void 0 && $$bindings.onTrackDragStart && onTrackDragStart !== void 0) $$bindings.onTrackDragStart(onTrackDragStart);
  if ($$props.onTrackDragOver === void 0 && $$bindings.onTrackDragOver && onTrackDragOver !== void 0) $$bindings.onTrackDragOver(onTrackDragOver);
  if ($$props.onTrackDragLeave === void 0 && $$bindings.onTrackDragLeave && onTrackDragLeave !== void 0) $$bindings.onTrackDragLeave(onTrackDragLeave);
  if ($$props.onTrackDrop === void 0 && $$bindings.onTrackDrop && onTrackDrop !== void 0) $$bindings.onTrackDrop(onTrackDrop);
  if ($$props.onRowDragOver === void 0 && $$bindings.onRowDragOver && onRowDragOver !== void 0) $$bindings.onRowDragOver(onRowDragOver);
  if ($$props.onRowDragLeave === void 0 && $$bindings.onRowDragLeave && onRowDragLeave !== void 0) $$bindings.onRowDragLeave(onRowDragLeave);
  if ($$props.onRowDrop === void 0 && $$bindings.onRowDrop && onRowDrop !== void 0) $$bindings.onRowDrop(onRowDrop);
  if ($$props.onRowClick === void 0 && $$bindings.onRowClick && onRowClick !== void 0) $$bindings.onRowClick(onRowClick);
  if ($$props.onTrackVolumeMouseDown === void 0 && $$bindings.onTrackVolumeMouseDown && onTrackVolumeMouseDown !== void 0) $$bindings.onTrackVolumeMouseDown(onTrackVolumeMouseDown);
  if ($$props.onToggleTrackMute === void 0 && $$bindings.onToggleTrackMute && onToggleTrackMute !== void 0) $$bindings.onToggleTrackMute(onToggleTrackMute);
  if ($$props.onToggleTrackSolo === void 0 && $$bindings.onToggleTrackSolo && onToggleTrackSolo !== void 0) $$bindings.onToggleTrackSolo(onToggleTrackSolo);
  if ($$props.onDeleteTrack === void 0 && $$bindings.onDeleteTrack && onDeleteTrack !== void 0) $$bindings.onDeleteTrack(onDeleteTrack);
  if ($$props.onChangeTrackColor === void 0 && $$bindings.onChangeTrackColor && onChangeTrackColor !== void 0) $$bindings.onChangeTrackColor(onChangeTrackColor);
  if ($$props.onClipMouseDown === void 0 && $$bindings.onClipMouseDown && onClipMouseDown !== void 0) $$bindings.onClipMouseDown(onClipMouseDown);
  if ($$props.onClipClick === void 0 && $$bindings.onClipClick && onClipClick !== void 0) $$bindings.onClipClick(onClipClick);
  if ($$props.onClipKeyDown === void 0 && $$bindings.onClipKeyDown && onClipKeyDown !== void 0) $$bindings.onClipKeyDown(onClipKeyDown);
  if ($$props.onDeleteClip === void 0 && $$bindings.onDeleteClip && onDeleteClip !== void 0) $$bindings.onDeleteClip(onDeleteClip);
  if ($$props.onAddClipToTimeline === void 0 && $$bindings.onAddClipToTimeline && onAddClipToTimeline !== void 0) $$bindings.onAddClipToTimeline(onAddClipToTimeline);
  if ($$props.onAddEffectToTimeline === void 0 && $$bindings.onAddEffectToTimeline && onAddEffectToTimeline !== void 0) $$bindings.onAddEffectToTimeline(onAddEffectToTimeline);
  if ($$props.onAddEnvelopeToTimeline === void 0 && $$bindings.onAddEnvelopeToTimeline && onAddEnvelopeToTimeline !== void 0) $$bindings.onAddEnvelopeToTimeline(onAddEnvelopeToTimeline);
  if ($$props.findPatternById === void 0 && $$bindings.findPatternById && findPatternById !== void 0) $$bindings.findPatternById(findPatternById);
  gridLines = generateGridLines(totalLength, pixelsPerBeat);
  defaultColors = {
    pattern: "#7ab8ff",
    effect: "#9b59b6",
    envelope: "#2ecc71"
  };
  trackColor = track.color || defaultColors[track.type];
  rowLabelBackground = trackColor + "20";
  hasSoloedTrack = timeline.tracks?.some((t) => t.type === "pattern" && t.solo === true) || false;
  isGreyedOut = track.mute || hasSoloedTrack && !track.solo;
  return `<div class="${"pattern-row " + escape(track.type, true) + "-row " + escape(dragOverRow === track.id ? "drag-over" : "", true) + " " + escape(dragOverTrackId === track.id ? "drag-over-track" : "", true)}" style="${"height: " + escape(TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT, true) + "px;"}" role="region" aria-label="${escape(track.type, true) + " timeline track"}"><div class="row-label" style="${"background: " + escape(rowLabelBackground, true) + ";"}" draggable="true" role="button" tabindex="0">${track.type === "pattern" ? `<div class="track-controls-group"><div class="track-volume-control" role="slider" aria-label="Track volume" aria-valuemin="0" aria-valuemax="200"${add_attribute("aria-valuenow", Math.round((track.volume ?? 1) * 100), 0)} tabindex="0" title="${"Drag to adjust volume: " + escape(Math.round((track.volume ?? 1) * 100), true) + "%"}"><div class="track-volume-bar"><div class="track-volume-fill" style="${"height: " + escape((track.volume ?? 1) / 2 * 100, true) + "%"}"></div></div></div> <div class="track-buttons-vertical"><button class="${"track-mute " + escape(track.mute ? "active" : "", true)}"${add_attribute("title", track.mute ? "Unmute track" : "Mute track", 0)}>M</button> <button class="${"track-solo " + escape(track.solo ? "active" : "", true)}"${add_attribute("title", track.solo ? "Unsolo track" : "Solo track", 0)}>S</button></div></div>` : ``} <span class="track-name">${escape(track.name)}</span></div> <div class="row-clips" style="${"width: " + escape(beatToPixel(totalLength, pixelsPerBeat), true) + "px;"}"> ${each(gridLines, (line) => {
    return `<div class="${"grid-line " + escape(line.isBar ? "bar-line" : "beat-line", true)}" style="${"left: " + escape(line.x, true) + "px;"}"></div>`;
  })} ${track.type === "pattern" ? ` ${each(trackClips, (clip) => {
    let clipPattern = findPatternById(clip.patternId);
    return ` ${clipPattern ? `${validate_component(TimelineClip, "TimelineClip").$$render(
      $$result,
      {
        clip,
        pattern: clipPattern,
        pixelsPerBeat,
        isDragging: isDraggingClip?.id === clip.id && isDraggingClip?.type === "clip",
        isGreyedOut,
        onMouseDown: (e) => onClipMouseDown(e, clip, "clip"),
        onClick: (e) => {
          if (!isResizing && !isDraggingClip) {
            e.stopPropagation();
          }
        },
        onContextMenu: (e) => {
          e.preventDefault();
          onDeleteClip(clip.id, "clip");
        },
        onDelete: () => onDeleteClip(clip.id, "clip")
      },
      {},
      {}
    )}` : ``}`;
  })}` : `${track.type === "effect" ? ` ${each(trackEffects, (timelineEffect) => {
    let effect = effects.find((e) => e.id === timelineEffect.effectId), assignedPattern = findPatternById(timelineEffect.patternId);
    return `  ${effect ? (() => {
      let automationCurves = getAutomationCurvesForEffect(effect.id, timelineEffect.id);
      return ` ${validate_component(TimelineEffectClip, "TimelineEffectClip").$$render(
        $$result,
        {
          timelineEffect,
          effect,
          assignedPattern,
          pixelsPerBeat,
          isSelected: selectedEffectId === timelineEffect.id,
          isDragging: isDraggingClip?.id === timelineEffect.id && isDraggingClip?.type === "effect",
          automationCurves,
          onMouseDown: (e) => onClipMouseDown(e, timelineEffect, "effect"),
          onClick: () => {
            if (!isResizing && !isDraggingClip) {
              onClipClick(timelineEffect.id, "effect");
            }
          },
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClipKeyDown(timelineEffect.id, "effect");
            }
          },
          onContextMenu: (e) => {
            e.preventDefault();
            onDeleteClip(timelineEffect.id, "effect");
          },
          onDelete: () => onDeleteClip(timelineEffect.id, "effect")
        },
        {},
        {}
      )}`;
    })() : ``}`;
  })}` : `${track.type === "envelope" ? ` ${each(trackEnvelopes, (timelineEnvelope) => {
    let envelope = envelopes.find((e) => e.id === timelineEnvelope.envelopeId), assignedPattern = findPatternById(timelineEnvelope.patternId);
    return `  ${envelope ? `${validate_component(TimelineEnvelopeClip, "TimelineEnvelopeClip").$$render(
      $$result,
      {
        timelineEnvelope,
        envelope,
        assignedPattern,
        pixelsPerBeat,
        isSelected: selectedEnvelopeId === timelineEnvelope.id,
        isDragging: isDraggingClip?.id === timelineEnvelope.id && isDraggingClip?.type === "envelope",
        onMouseDown: (e) => onClipMouseDown(e, timelineEnvelope, "envelope"),
        onClick: () => {
          if (!isResizing && !isDraggingClip) {
            onClipClick(timelineEnvelope.id, "envelope");
          }
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClipKeyDown(timelineEnvelope.id, "envelope");
          }
        },
        onContextMenu: (e) => {
          e.preventDefault();
          onDeleteClip(timelineEnvelope.id, "envelope");
        },
        onDelete: () => onDeleteClip(timelineEnvelope.id, "envelope")
      },
      {},
      {}
    )}` : ``}`;
  })}` : ``}`}`}</div> ${``}</div> `;
});
const sidebarWidth = 280;
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let viewMode;
  let patterns;
  let effects;
  let envelopes;
  let timeline;
  let timelineTracks;
  let currentBeat;
  let PIXELS_PER_BEAT;
  let timelineEffects;
  let timelineEnvelopes;
  let selectedBaseEffectId;
  let selectedBaseEnvelopeId;
  let $automationStore, $$unsubscribe_automationStore;
  let $engineStore, $$unsubscribe_engineStore;
  let $page, $$unsubscribe_page;
  let $viewStore, $$unsubscribe_viewStore;
  $$unsubscribe_automationStore = subscribe(automationStore, (value) => $automationStore = value);
  $$unsubscribe_engineStore = subscribe(engineStore, (value) => $engineStore = value);
  $$unsubscribe_page = subscribe(page, (value) => $page = value);
  $$unsubscribe_viewStore = subscribe(viewStore, (value) => $viewStore = value);
  let project;
  let playbackState;
  let isLoading = true;
  projectStore.subscribe((p) => {
    project = p;
    if (project && isLoading) {
      setTimeout(
        () => {
          isLoading = false;
        },
        100
      );
    }
  });
  playbackStore.subscribe((s) => playbackState = s);
  let editingPatternId = null;
  const ROW_LABEL_WIDTH = TIMELINE_CONSTANTS.ROW_LABEL_WIDTH;
  const BASE_ZOOM = TIMELINE_CONSTANTS.BASE_ZOOM;
  let zoomLevel = BASE_ZOOM;
  const BASE_PIXELS_PER_BEAT = TIMELINE_CONSTANTS.BASE_PIXELS_PER_BEAT;
  function handleTimelineWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    zoomLevel = clampZoomLevel(zoomLevel, delta);
  }
  function beatToPixelLocal(beat) {
    return beatToPixel(beat, PIXELS_PER_BEAT);
  }
  function pixelToBeatLocal(pixel) {
    return pixelToBeat(pixel, PIXELS_PER_BEAT);
  }
  function findPatternById(patternId) {
    if (!patternId) return null;
    return patterns.find((p) => p.id === patternId) || null;
  }
  function createPattern() {
    if (!project) {
      console.error("Cannot create pattern: no project exists");
      return;
    }
    try {
      const projectId = $page.params.id;
      if (!projectId) {
        console.error("Cannot create pattern: project ID is missing");
        return;
      }
      const newPattern = projectStore.createPattern(projectId, `Pattern ${patterns.length + 1}`);
      projectStore.addPattern(newPattern);
      goto(`/project/${projectId}/pattern/${newPattern.id}`);
    } catch (error) {
      console.error("Error creating pattern:", error);
    }
  }
  function deletePattern(patternId) {
    projectStore.deletePattern(patternId);
  }
  async function selectPattern(patternId) {
    const { loadingStore: loadingStore2 } = await import("../../../../chunks/loadingStore.js");
    loadingStore2.startLoading("Loading pattern editor...");
    const projectId = $page.params.id;
    if (projectId) {
      await goto();
    }
  }
  function addClipToTimeline(patternId, startBeat, trackId) {
    if (!project) return;
    const pattern = patterns.find((p) => p.id === patternId);
    if (!pattern) return;
    const snappedStart = snapToBeat(startBeat);
    const duration = pattern.baseMeter;
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const existingTrack = timeline.tracks?.find((t) => t.type === "pattern");
      if (existingTrack) {
        targetTrackId = existingTrack.id;
      } else {
        const newTrack = projectStore.createTimelineTrack("pattern", patternId, pattern.name);
        projectStore.addTimelineTrack(newTrack);
        targetTrackId = newTrack.id;
      }
    }
    const newClip = {
      id: crypto.randomUUID(),
      patternId,
      trackId: targetTrackId,
      startBeat: snappedStart,
      duration
    };
    projectStore.addTimelineClip(newClip);
    if (viewMode === "arrangement") {
      window.dispatchEvent(new CustomEvent("reloadProject"));
    }
  }
  function deleteClip(clipId) {
    projectStore.deleteTimelineClip(clipId);
  }
  let draggedPatternId = null;
  let draggedEffectId = null;
  let draggedEnvelopeId = null;
  let dragOverRow = null;
  let selectedEffectId = null;
  let selectedEnvelopeId = null;
  let isResizing = null;
  let isDraggingClip = null;
  function handleEffectEnvelopeDragStart(e, data) {
    if (viewMode !== "arrangement") return;
    if (data.type === "effect") {
      draggedEffectId = data.id;
    } else {
      draggedEnvelopeId = data.id;
    }
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/json", JSON.stringify(data));
    }
  }
  function handleClipMouseDown(e, clip, type = "clip") {
    if (e.button !== 0) return;
    e.stopPropagation();
    const target = e.target;
    const resizeHandle = target.closest(".clip-resize-handle-left, .clip-resize-handle-right");
    if (resizeHandle) {
      projectStore.startBatch();
      const side = resizeHandle.classList.contains("clip-resize-handle-left") ? "left" : "right";
      const clipContainer = e.currentTarget;
      if (!clipContainer) return;
      const rect = clipContainer.closest(".timeline-area")?.getBoundingClientRect();
      if (!rect) return;
      const startX = e.clientX - rect.left - ROW_LABEL_WIDTH;
      isResizing = {
        type,
        id: clip.id,
        side,
        startBeat: clip.startBeat,
        startDuration: clip.duration,
        startX
      };
    } else {
      projectStore.startBatch();
      const clipContainer = e.currentTarget;
      if (!clipContainer) return;
      const rect = clipContainer.closest(".timeline-area")?.getBoundingClientRect();
      if (!rect) return;
      const startX = e.clientX - rect.left - ROW_LABEL_WIDTH;
      isDraggingClip = {
        type,
        id: clip.id,
        startBeat: clip.startBeat,
        startX
      };
    }
  }
  function handleRowClick(e, trackId, patternId) {
    if (viewMode !== "arrangement") return;
    const target = e.target;
    if (target && (target.closest(".timeline-clip") || target.closest(".clip-controls") || target.closest(".clip-resize-handle-left") || target.closest(".clip-resize-handle-right") || target.closest("button"))) return;
    if (patternId) {
      const rowTarget = e.currentTarget;
      if (!rowTarget) return;
      const rect = rowTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
      const beat = Math.max(0, snapToBeat(pixelToBeatLocal(x)));
      addClipToTimeline(patternId, beat, trackId);
    }
  }
  function handleRowDragLeave(e) {
    const target = e.relatedTarget;
    const currentTarget = e.currentTarget;
    if (!target || !currentTarget.contains(target)) {
      dragOverRow = null;
      dragOverTrackId = null;
    }
  }
  function handleRowDrop(e, track) {
    e.preventDefault();
    dragOverRow = null;
    const target = e.currentTarget;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
    const beat = Math.max(0, snapToBeat(pixelToBeatLocal(x)));
    try {
      const dragData = e.dataTransfer?.getData("application/json");
      if (dragData) {
        const data = JSON.parse(dragData);
        if (data.type === "pattern" && track.type === "pattern") {
          addClipToTimeline(data.id, beat, track.id);
          draggedPatternId = null;
        } else if (data.type === "effect" && track.type === "effect") {
          addEffectToTimeline(data.id, beat, 4, void 0, track.id);
          draggedEffectId = null;
        } else if (data.type === "envelope" && track.type === "envelope") {
          addEnvelopeToTimeline(data.id, beat, 4, void 0, track.id);
          draggedEnvelopeId = null;
        }
      } else {
        const textData = e.dataTransfer?.getData("text/plain");
        if (textData && !timeline.tracks?.find((t) => t.id === textData)) {
          const patternIdText = textData;
          if (patternIdText && track.type === "pattern" && patterns.find((p) => p.id === patternIdText)) {
            addClipToTimeline(patternIdText, beat, track.id);
            draggedPatternId = null;
          }
        }
      }
    } catch (error) {
      console.error("Error handling drop:", error);
    }
  }
  function addEffectToTimeline(effectId, startBeat, duration, patternId, trackId) {
    if (!project) return;
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const existingTrack = timeline.tracks?.find((t) => t.type === "effect");
      if (existingTrack) {
        targetTrackId = existingTrack.id;
      } else {
        const newTrack = projectStore.createTimelineTrack("effect");
        projectStore.addTimelineTrack(newTrack);
        targetTrackId = newTrack.id;
      }
    }
    const newEffect = {
      id: crypto.randomUUID(),
      effectId,
      trackId: targetTrackId,
      startBeat: snapToBeat(startBeat),
      duration,
      patternId: void 0
    };
    projectStore.addTimelineEffect(newEffect);
    if (viewMode === "arrangement") {
      window.dispatchEvent(new CustomEvent("reloadProject"));
    }
  }
  function addEnvelopeToTimeline(envelopeId, startBeat, duration, patternId, trackId) {
    if (!project) return;
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const existingTrack = timeline.tracks?.find((t) => t.type === "envelope");
      if (existingTrack) {
        targetTrackId = existingTrack.id;
      } else {
        const newTrack = projectStore.createTimelineTrack("envelope");
        projectStore.addTimelineTrack(newTrack);
        targetTrackId = newTrack.id;
      }
    }
    const newEnvelope = {
      id: crypto.randomUUID(),
      envelopeId,
      trackId: targetTrackId,
      startBeat: snapToBeat(startBeat),
      duration,
      patternId: void 0
    };
    projectStore.addTimelineEnvelope(newEnvelope);
    if (viewMode === "arrangement") {
      window.dispatchEvent(new CustomEvent("reloadProject"));
    }
  }
  function deleteTimelineEffect(effectId) {
    projectStore.deleteTimelineEffect(effectId);
  }
  function deleteTimelineEnvelope(envelopeId) {
    projectStore.deleteTimelineEnvelope(envelopeId);
  }
  let showAddTrackMenu = false;
  function createTimelineTrack(type, patternId) {
    if (!project) return;
    const newTrack = projectStore.createTimelineTrack(type, patternId);
    projectStore.addTimelineTrack(newTrack);
    showAddTrackMenu = false;
  }
  function handleClickOutside(event) {
    const target = event.target;
    if (!target.closest(".add-track-dropdown-ruler")) {
      showAddTrackMenu = false;
    }
  }
  let draggedTrackId = null;
  let dragOverTrackId = null;
  function handleTrackDragStart(e, trackId) {
    e.stopPropagation();
    draggedTrackId = trackId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/json", JSON.stringify({ type: "track-reorder", trackId }));
      e.dataTransfer.setData("text/plain", trackId);
    }
  }
  function handleTrackDragOver(e, trackId) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (draggedTrackId && draggedTrackId !== trackId) {
      dragOverTrackId = trackId;
    }
  }
  function handleTrackDragLeave(e) {
    e.stopPropagation();
    dragOverTrackId = null;
  }
  function handleTrackDrop(e, targetTrackId) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedTrackId || !project || draggedTrackId === targetTrackId) {
      draggedTrackId = null;
      dragOverTrackId = null;
      return;
    }
    const allTracks = [...timeline.tracks || []].sort((a, b) => a.order - b.order);
    const draggedTrack = allTracks.find((t) => t.id === draggedTrackId);
    const targetTrack = allTracks.find((t) => t.id === targetTrackId);
    if (!draggedTrack || !targetTrack) {
      draggedTrackId = null;
      dragOverTrackId = null;
      return;
    }
    const draggedIndex = allTracks.indexOf(draggedTrack);
    const targetIndex = allTracks.indexOf(targetTrack);
    if (draggedIndex === targetIndex) {
      draggedTrackId = null;
      dragOverTrackId = null;
      return;
    }
    allTracks.splice(draggedIndex, 1);
    allTracks.splice(targetIndex, 0, draggedTrack);
    allTracks.forEach((track, index) => {
      if (track.order !== index) {
        projectStore.updateTimelineTrack(track.id, { order: index });
      }
    });
    draggedTrackId = null;
    dragOverTrackId = null;
  }
  function deleteTimelineTrack(trackId) {
    projectStore.deleteTimelineTrack(trackId);
  }
  function handleTrackVolumeMouseDown(e, trackId) {
    e.stopPropagation();
    e.preventDefault();
    const volumeBar = e.currentTarget.querySelector(".track-volume-bar");
    if (!volumeBar) return;
    const rect = volumeBar.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const height = rect.height;
    const volume = Math.max(0, Math.min(2, 2 * (1 - clickY / height)));
    updateTrackVolume(trackId, volume);
    const handleMouseMove = (moveEvent) => {
      const newRect = volumeBar.getBoundingClientRect();
      const newClickY = moveEvent.clientY - newRect.top;
      const newVolume = Math.max(0, Math.min(2, 2 * (1 - newClickY / newRect.height)));
      updateTrackVolume(trackId, newVolume);
    };
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }
  function updateTrackVolume(trackId, volume) {
    projectStore.updateTimelineTrack(trackId, { volume });
    const engine = $engineStore;
    if (engine) {
      engine.updateTimelineTrackVolume(trackId, volume);
    }
  }
  function toggleTrackMute(trackId) {
    if (!project || !project.timeline) return;
    const track = project.timeline.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const newMute = !(track.mute ?? false);
    projectStore.updateTimelineTrack(trackId, { mute: newMute });
    const engine = $engineStore;
    if (engine) {
      engine.updateTimelineTrackMute(trackId, newMute);
    }
  }
  function toggleTrackSolo(trackId) {
    if (!project || !project.timeline) return;
    const track = project.timeline.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const newSolo = !(track.solo ?? false);
    if (newSolo) {
      project.timeline.tracks.forEach((t) => {
        if (t.id !== trackId && t.type === "pattern") {
          projectStore.updateTimelineTrack(t.id, { solo: false });
          const engine2 = $engineStore;
          if (engine2) {
            engine2.updateTimelineTrackSolo(t.id, false);
          }
        }
      });
    }
    projectStore.updateTimelineTrack(trackId, { solo: newSolo });
    const engine = $engineStore;
    if (engine) {
      engine.updateTimelineTrackSolo(trackId, newSolo);
    }
  }
  function getClipsForTrack(trackId) {
    return (timeline.clips || []).filter((c) => c.trackId === trackId);
  }
  function getEffectsForTrack(trackId) {
    return (timeline.effects || []).filter((e) => e.trackId === trackId);
  }
  function getEnvelopesForTrack(trackId) {
    return (timeline.envelopes || []).filter((e) => e.trackId === trackId);
  }
  function getAutomationCurvesForEffect(effectId, timelineEffectId) {
    if (!project || !project.automation) return [];
    const curves = [];
    const automationData = project.automation;
    const openAutomationWindow = $automationStore.find((w) => w.targetType === "effect" && w.targetId === effectId && w.timelineInstanceId === timelineEffectId);
    for (const [key, value] of Object.entries(automationData)) {
      if (value && typeof value === "object" && "targetType" in value && "targetId" in value) {
        const auto = value;
        if (auto.targetType === "effect" && auto.targetId === effectId && auto.timelineInstanceId === timelineEffectId) {
          if (!openAutomationWindow || auto.parameterKey === openAutomationWindow.parameterKey) {
            if (auto.points && auto.points.length > 0) {
              curves.push({
                automation: auto,
                parameterKey: auto.parameterKey
              });
            }
          }
        }
      }
    }
    return curves;
  }
  let $$settled;
  let $$rendered;
  let previous_head = $$result.head;
  do {
    $$settled = true;
    $$result.head = previous_head;
    viewMode = $viewStore;
    {
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
      }
    }
    patterns = project?.patterns || [];
    effects = project?.effects || [];
    envelopes = project?.envelopes || [];
    timeline = project?.timeline || {
      tracks: [],
      clips: [],
      effects: [],
      envelopes: [],
      totalLength: 16
    };
    {
      if (timeline && !timeline.tracks) {
        timeline.tracks = [];
      }
    }
    timelineTracks = timeline.tracks || [];
    currentBeat = playbackState?.currentTime || 0;
    project?.bpm || 120;
    {
      if (project && timeline && (!timeline.tracks || timeline.tracks.length === 0)) {
        const firstPattern = patterns.find((p) => p.name === "Pattern 1") || patterns[0];
        if (firstPattern) {
          const patternTrack = projectStore.createTimelineTrack("pattern", firstPattern.id, "Pattern 1");
          const effectTrack = projectStore.createTimelineTrack("effect", void 0, "Effects");
          const envelopeTrack = projectStore.createTimelineTrack("envelope", void 0, "Envelopes");
          projectStore.addTimelineTrack(patternTrack);
          projectStore.addTimelineTrack(effectTrack);
          projectStore.addTimelineTrack(envelopeTrack);
        }
      }
    }
    PIXELS_PER_BEAT = BASE_PIXELS_PER_BEAT * zoomLevel;
    generateRulerMarks(timeline?.totalLength || 0, PIXELS_PER_BEAT);
    generateGridLines(timeline?.totalLength || 0, PIXELS_PER_BEAT);
    {
      if (showAddTrackMenu && typeof window !== "undefined") {
        window.addEventListener("click", handleClickOutside);
      } else if (typeof window !== "undefined") {
        window.removeEventListener("click", handleClickOutside);
      }
    }
    (() => {
      const map = /* @__PURE__ */ new Map();
      for (const pattern of patterns) {
        map.set(pattern.id, (timeline.clips || []).filter((c) => c.patternId === pattern.id));
      }
      return map;
    })();
    timelineEffects = (() => {
      return (timeline.effects || []).map((e) => {
        const effect = effects.find((eff) => eff.id === e.effectId);
        return { ...e, effect };
      }).filter((e) => e.effect);
    })();
    timelineEnvelopes = (() => {
      return (timeline.envelopes || []).map((e) => {
        const envelope = envelopes.find((env) => env.id === e.envelopeId);
        return { ...e, envelope };
      }).filter((e) => e.envelope);
    })();
    selectedBaseEffectId = selectedEffectId ? timelineEffects.find((te) => te.id === selectedEffectId)?.effectId || null : null;
    selectedBaseEnvelopeId = selectedEnvelopeId ? timelineEnvelopes.find((te) => te.id === selectedEnvelopeId)?.envelopeId || null : null;
    {
      {
        const openWindows = $automationStore;
        if (openWindows.length > 0) {
          if (!selectedEffectId && !selectedEnvelopeId) {
            automationStore.closeAll();
          } else if (viewMode !== "arrangement") {
            automationStore.closeAll();
          } else {
            for (const window2 of openWindows) {
              let shouldClose = false;
              if (window2.targetType === "effect") {
                if (!selectedEffectId || window2.timelineInstanceId !== selectedEffectId) {
                  shouldClose = true;
                }
              } else if (window2.targetType === "envelope") {
                if (!selectedEnvelopeId || window2.timelineInstanceId !== selectedEnvelopeId) {
                  shouldClose = true;
                }
              }
              if (shouldClose) {
                automationStore.closeWindow(window2.id);
              }
            }
          }
        }
      }
    }
    $$rendered = `${validate_component(Toolbar, "Toolbar").$$render($$result, {}, {}, {})} ${isLoading ? `${validate_component(ProjectSkeleton, "ProjectSkeleton").$$render($$result, { viewMode }, {}, {})}` : `<div class="project-view" style="${"--sidebar-width: " + escape(sidebarWidth, true) + "px;"}"> ${viewMode === "arrangement" ? `${validate_component(PatternSidebar, "PatternSidebar").$$render(
      $$result,
      {
        patterns,
        sidebarWidth,
        viewMode,
        createPattern,
        deletePattern,
        selectPattern,
        handleEffectEnvelopeDragStart,
        editingPatternId
      },
      {
        editingPatternId: ($$value) => {
          editingPatternId = $$value;
          $$settled = false;
        }
      },
      {}
    )}` : ``}  <div class="main-content" style="${"margin-left: " + escape(viewMode === "arrangement" ? sidebarWidth : 0, true) + "px;"}">${viewMode === "arrangement" ? ` <div class="${["arrangement-view", $automationStore.length > 0 ? "automation-open" : ""].join(" ").trim()}"><div class="timeline-area" role="region" aria-label="Timeline area">${validate_component(TimelineRuler, "TimelineRuler").$$render(
      $$result,
      {
        totalLength: timeline.totalLength,
        pixelsPerBeat: PIXELS_PER_BEAT,
        zoomLevel,
        onZoomWheel: handleTimelineWheel,
        onCreateTrack: createTimelineTrack,
        onToggleAddTrackMenu: () => showAddTrackMenu = !showAddTrackMenu,
        showAddTrackMenu
      },
      {
        showAddTrackMenu: ($$value) => {
          showAddTrackMenu = $$value;
          $$settled = false;
        }
      },
      {}
    )} <div class="playhead-container"><div class="playhead" style="${"left: " + escape(ROW_LABEL_WIDTH + beatToPixelLocal(currentBeat), true) + "px;"}"></div></div> <div class="pattern-rows"> ${each(timelineTracks.sort((a, b) => a.order - b.order), (track) => {
      let trackClips = getClipsForTrack(track.id), trackEffects = getEffectsForTrack(track.id), trackEnvelopes = getEnvelopesForTrack(track.id), trackPattern = track.type === "pattern" && track.patternId ? findPatternById(track.patternId) : null;
      return `    ${validate_component(TimelineTrackRow, "TimelineTrackRow").$$render(
        $$result,
        {
          track,
          trackClips,
          trackEffects,
          trackEnvelopes,
          trackPattern,
          patterns,
          effects,
          envelopes,
          timeline,
          pixelsPerBeat: PIXELS_PER_BEAT,
          totalLength: timeline.totalLength,
          dragOverRow,
          dragOverTrackId,
          draggedTrackId,
          isResizing,
          isDraggingClip,
          selectedEffectId,
          selectedEnvelopeId,
          getAutomationCurvesForEffect,
          onTrackDragStart: handleTrackDragStart,
          onTrackDragOver: handleTrackDragOver,
          onTrackDragLeave: handleTrackDragLeave,
          onTrackDrop: handleTrackDrop,
          onRowDragOver: (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
              e.dataTransfer.dropEffect = "copy";
            }
            dragOverRow = track.id;
          },
          onRowDragLeave: handleRowDragLeave,
          onRowDrop: (e) => handleRowDrop(e, track),
          onRowClick: (e) => handleRowClick(e, track.id, track.patternId),
          onTrackVolumeMouseDown: handleTrackVolumeMouseDown,
          onToggleTrackMute: toggleTrackMute,
          onToggleTrackSolo: toggleTrackSolo,
          onDeleteTrack: deleteTimelineTrack,
          onChangeTrackColor: (trackId, color) => {
            projectStore.updateTimelineTrack(trackId, { color });
          },
          onClipMouseDown: handleClipMouseDown,
          onClipClick: (clipId, type) => {
            if (type === "effect") {
              selectedEffectId = clipId;
              selectedEnvelopeId = null;
            } else if (type === "envelope") {
              selectedEnvelopeId = clipId;
              selectedEffectId = null;
            }
          },
          onClipKeyDown: (clipId, type) => {
            if (type === "effect") {
              selectedEffectId = clipId;
              selectedEnvelopeId = null;
            } else if (type === "envelope") {
              selectedEnvelopeId = clipId;
              selectedEffectId = null;
            }
          },
          onDeleteClip: (clipId, type) => {
            if (type === "clip") {
              deleteClip(clipId);
            } else if (type === "effect") {
              deleteTimelineEffect(clipId);
            } else if (type === "envelope") {
              deleteTimelineEnvelope(clipId);
            }
          },
          onAddClipToTimeline: addClipToTimeline,
          onAddEffectToTimeline: (effectId, beat, trackId) => addEffectToTimeline(effectId, beat, 4, void 0, trackId),
          onAddEnvelopeToTimeline: (envelopeId, beat, trackId) => addEnvelopeToTimeline(envelopeId, beat, 4, void 0, trackId),
          findPatternById
        },
        {},
        {}
      )}`;
    })}</div></div></div> ${validate_component(EffectEnvelopeProperties, "EffectEnvelopeProperties").$$render(
      $$result,
      {
        selectedEffectId: selectedBaseEffectId,
        selectedEnvelopeId: selectedBaseEnvelopeId,
        selectedTimelineEffectId: selectedEffectId,
        selectedTimelineEnvelopeId: selectedEnvelopeId
      },
      {},
      {}
    )}  ${$automationStore.length > 0 ? `<div class="automation-panel-container"><div class="automation-windows-container">${$automationStore[0] ? `${validate_component(AutomationCurveEditor, "AutomationCurveEditor").$$render($$result, { automationWindow: $automationStore[0] }, {}, {})}` : ``}</div></div>` : ``}` : `${viewMode === "pattern" ? ` <div class="pattern-list-view"><div class="pattern-list-header"><h2 data-svelte-h="svelte-jbqu7h">Patterns</h2> <button class="create-pattern-btn-large" title="Create new pattern" data-svelte-h="svelte-s6pdne">+ New Pattern</button></div> <div class="pattern-grid">${each(patterns, (pattern) => {
      return `${validate_component(PatternCard, "PatternCard").$$render(
        $$result,
        {
          pattern,
          onClick: () => selectPattern(pattern.id),
          onDelete: deletePattern
        },
        {},
        {}
      )}`;
    })}</div></div>` : ``}`}</div></div>`}`;
  } while (!$$settled);
  $$unsubscribe_automationStore();
  $$unsubscribe_engineStore();
  $$unsubscribe_page();
  $$unsubscribe_viewStore();
  return $$rendered;
});
export {
  Page as default
};
