import { c as create_ssr_component, e as escape } from "../../chunks/ssr.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/state.svelte.js";
import "../../chunks/projectStore.js";
import "../../chunks/loadingStore.js";
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  const circleText = "DAWDUCTION • ".repeat(5);
  return `<div class="home"><div class="circle-wrapper"><svg class="circle-text" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><path id="text-ring" d="M200,200 m-170,0 a170,170 0 1,1 340,0 a170,170 0 1,1 -340,0"></path></defs><text><textPath href="#text-ring" startOffset="0%">${escape(circleText)}</textPath></text></svg> <button class="new-project-button" data-svelte-h="svelte-1yjdtri">New Project</button> <p class="subtitle" data-svelte-h="svelte-348qth">Procedural-Synthesis DAW with Tree-Based Rhythmic Structures</p></div></div>`;
});
export {
  Page as default
};
