import { w as writable } from "./index.js";
function createEffectsModule(updateFn, getCurrent) {
  return {
    createEffect: (projectId, name, type) => {
      const now = Date.now();
      const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#6c5ce7", "#a29bfe"];
      const colorIndex = Math.floor(Math.random() * colors.length);
      const defaultSettings = {
        reverb: { roomSize: 0.7, dampening: 0.5, wet: 0.5, dry: 0.5 },
        delay: { time: 0.25, feedback: 0.5, wet: 0.5, dry: 0.5 },
        filter: { type: "lowpass", frequency: 0.5, resonance: 0.5 },
        distortion: { amount: 0.3, drive: 0.5 },
        compressor: { threshold: 0.7, ratio: 4, attack: 0.01, release: 0.1 },
        chorus: { rate: 0.5, depth: 0.6, delay: 0.02, wet: 0.5 }
      };
      return {
        id: crypto.randomUUID(),
        projectId,
        name,
        type,
        settings: defaultSettings[type] || {},
        color: colors[colorIndex],
        createdAt: now,
        updatedAt: now
      };
    },
    addEffect: (effect) => {
      updateFn((project) => {
        if (!project) {
          console.warn("Cannot add effect: no project exists");
          return project;
        }
        if (!Array.isArray(project.effects)) {
          project.effects = [];
        }
        return {
          ...project,
          effects: [...project.effects, effect]
        };
      });
    },
    updateEffect: (effectId, updates) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          effects: (project.effects || []).map(
            (effect) => effect.id === effectId ? { ...effect, ...updates, updatedAt: Date.now() } : effect
          )
        };
      });
    },
    deleteEffect: (effectId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          effects: (project.effects || []).filter((e) => e.id !== effectId)
        };
      });
    }
  };
}
function createEnvelopesModule(updateFn, getCurrent) {
  return {
    createEnvelope: (projectId, name, type) => {
      const now = Date.now();
      const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#6c5ce7", "#a29bfe"];
      const colorIndex = Math.floor(Math.random() * colors.length);
      const defaultSettings = {
        volume: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
        filter: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, cutoffStart: 0.2, cutoffEnd: 0.8 },
        pitch: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.2, pitchStart: 0, pitchEnd: 12 },
        pan: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, panStart: -0.5, panEnd: 0.5 }
      };
      return {
        id: crypto.randomUUID(),
        projectId,
        name,
        type,
        settings: defaultSettings[type] || {},
        color: colors[colorIndex],
        createdAt: now,
        updatedAt: now
      };
    },
    addEnvelope: (envelope) => {
      updateFn((project) => {
        if (!project) {
          console.warn("Cannot add envelope: no project exists");
          return project;
        }
        if (!Array.isArray(project.envelopes)) {
          project.envelopes = [];
        }
        return {
          ...project,
          envelopes: [...project.envelopes, envelope]
        };
      });
    },
    updateEnvelope: (envelopeId, updates) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          envelopes: (project.envelopes || []).map(
            (envelope) => envelope.id === envelopeId ? { ...envelope, ...updates, updatedAt: Date.now() } : envelope
          )
        };
      });
    },
    deleteEnvelope: (envelopeId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          envelopes: (project.envelopes || []).filter((e) => e.id !== envelopeId)
        };
      });
    }
  };
}
function createAutomationModule(updateFn, getCurrent) {
  return {
    getAutomationId: (targetType, targetId, parameterKey, timelineInstanceId) => {
      return timelineInstanceId ? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}` : `${targetType}:${targetId}:${parameterKey}`;
    },
    getParameterAutomation: (targetType, targetId, parameterKey, timelineInstanceId) => {
      const current = getCurrent();
      if (!current || !current.automation) return null;
      const automationId = timelineInstanceId ? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}` : `${targetType}:${targetId}:${parameterKey}`;
      const automation = current.automation;
      return automation[automationId] || null;
    },
    setParameterAutomation: (automation, timelineInstanceId) => {
      updateFn((project) => {
        if (!project) return project;
        const automationId = timelineInstanceId || automation.timelineInstanceId ? `${automation.targetType}:${automation.targetId}:${timelineInstanceId || automation.timelineInstanceId}:${automation.parameterKey}` : `${automation.targetType}:${automation.targetId}:${automation.parameterKey}`;
        const currentAutomation = project.automation || {};
        return {
          ...project,
          automation: {
            ...currentAutomation,
            [automationId]: {
              ...automation,
              timelineInstanceId: timelineInstanceId || automation.timelineInstanceId
            }
          }
        };
      });
    },
    deleteParameterAutomation: (targetType, targetId, parameterKey, timelineInstanceId) => {
      updateFn((project) => {
        if (!project || !project.automation) return project;
        const automationId = timelineInstanceId ? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}` : `${targetType}:${targetId}:${parameterKey}`;
        const currentAutomation = project.automation;
        const { [automationId]: removed, ...rest } = currentAutomation;
        return {
          ...project,
          automation: rest
        };
      });
    },
    updateAutomationPoint: (targetType, targetId, parameterKey, pointIndex, point, timelineInstanceId) => {
      updateFn((project) => {
        if (!project) return project;
        const automationId = timelineInstanceId ? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}` : `${targetType}:${targetId}:${parameterKey}`;
        const currentAutomation = project.automation?.[automationId];
        if (!currentAutomation) return project;
        const updatedPoints = [...currentAutomation.points];
        updatedPoints[pointIndex] = { ...updatedPoints[pointIndex], ...point };
        const automation = project.automation || {};
        return {
          ...project,
          automation: {
            ...automation,
            [automationId]: {
              ...currentAutomation,
              points: updatedPoints
            }
          }
        };
      });
    },
    addAutomationPoint: (targetType, targetId, parameterKey, point, timelineInstanceId) => {
      updateFn((project) => {
        if (!project) return project;
        const automationId = timelineInstanceId ? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}` : `${targetType}:${targetId}:${parameterKey}`;
        const currentAutomation = project.automation?.[automationId];
        if (!currentAutomation) {
          project.effects?.find((e) => e.id === targetId);
          project.envelopes?.find((e) => e.id === targetId);
          const min = 0;
          const max = 1;
          const automation2 = project.automation || {};
          return {
            ...project,
            automation: {
              ...automation2,
              [automationId]: {
                targetType,
                targetId,
                parameterKey,
                timelineInstanceId,
                points: [point],
                min,
                max
              }
            }
          };
        }
        const updatedPoints = [...currentAutomation.points, point].sort((a, b) => a.beat - b.beat);
        const automation = project.automation || {};
        return {
          ...project,
          automation: {
            ...automation,
            [automationId]: {
              ...currentAutomation,
              points: updatedPoints
            }
          }
        };
      });
    },
    removeAutomationPoint: (targetType, targetId, parameterKey, pointIndex, timelineInstanceId) => {
      updateFn((project) => {
        if (!project) return project;
        const automationId = timelineInstanceId ? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}` : `${targetType}:${targetId}:${parameterKey}`;
        const currentAutomation = project.automation?.[automationId];
        if (!currentAutomation) return project;
        const updatedPoints = currentAutomation.points.filter((_, i) => i !== pointIndex);
        const automation = project.automation || {};
        return {
          ...project,
          automation: {
            ...automation,
            [automationId]: {
              ...currentAutomation,
              points: updatedPoints
            }
          }
        };
      });
    }
  };
}
function createProjectStore() {
  const { subscribe, set, update: svelteUpdate } = writable(null);
  const MAX_HISTORY = 50;
  let history = [];
  let historyIndex = -1;
  let isUndoRedo = false;
  let isBatching = false;
  let batchInitialState = null;
  const { subscribe: subscribeHistory, set: setHistory } = writable({ canUndo: false, canRedo: false });
  const updateHistoryState = () => {
    const canUndo = history.length >= 2 && historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;
    setHistory({ canUndo, canRedo });
  };
  const cloneProject2 = (project) => {
    if (!project) return null;
    return JSON.parse(JSON.stringify(project));
  };
  const getCurrent = () => {
    let current = null;
    subscribe((p) => current = p)();
    return current;
  };
  const updateFn = (updater, skipHistory = false) => {
    if (isUndoRedo) {
      svelteUpdate(updater);
      return;
    }
    if (skipHistory) {
      svelteUpdate(updater);
      return;
    }
    let currentProject = null;
    subscribe((p) => currentProject = p)();
    if (isBatching) {
      if (!batchInitialState && currentProject) {
        const cloned = cloneProject2(currentProject);
        if (cloned && cloned.id) {
          batchInitialState = cloned;
          history = history.slice(0, historyIndex + 1);
          history.push(cloned);
          historyIndex++;
          if (history.length > MAX_HISTORY) {
            history.shift();
            historyIndex--;
          }
          updateHistoryState();
        }
      }
      svelteUpdate(updater);
      return;
    }
    if (currentProject) {
      const proj = currentProject;
      if (!Array.isArray(proj.standaloneInstruments)) {
        proj.standaloneInstruments = [];
      }
      if (!Array.isArray(proj.effects)) {
        proj.effects = [];
      }
      if (!Array.isArray(proj.envelopes)) {
        proj.envelopes = [];
      }
      history = history.slice(0, historyIndex + 1);
      const cloned = cloneProject2(currentProject);
      if (cloned && cloned.id) {
        if (!Array.isArray(cloned.standaloneInstruments)) {
          cloned.standaloneInstruments = [];
        }
        history.push(cloned);
        historyIndex++;
        if (history.length > MAX_HISTORY) {
          history.shift();
          historyIndex--;
        }
        updateHistoryState();
      } else {
        console.warn("Failed to clone project for history", currentProject);
      }
    } else {
      console.warn("Cannot save to history: invalid project", currentProject);
    }
    let newProject = null;
    svelteUpdate((project) => {
      newProject = updater(project);
      return newProject;
    });
    if (newProject && Array.isArray(newProject.standaloneInstruments)) {
      cloneProject2(newProject);
    }
  };
  return {
    subscribe,
    subscribeHistory,
    // Expose history state subscription
    getCurrent,
    // Helper to get current value without subscribing
    startBatch: () => {
      if (!isBatching) {
        isBatching = true;
        batchInitialState = null;
      }
    },
    endBatch: () => {
      if (isBatching) {
        isBatching = false;
        let currentProject = null;
        subscribe((p) => currentProject = p)();
        if (currentProject) {
          const proj = currentProject;
          if (!Array.isArray(proj.standaloneInstruments)) {
            proj.standaloneInstruments = [];
          }
          if (!Array.isArray(proj.effects)) {
            proj.effects = [];
          }
          if (!Array.isArray(proj.envelopes)) {
            proj.envelopes = [];
          }
          history = history.slice(0, historyIndex + 1);
          const cloned = cloneProject2(currentProject);
          if (cloned && cloned.id) {
            if (!Array.isArray(cloned.standaloneInstruments)) {
              cloned.standaloneInstruments = [];
            }
            history.push(cloned);
            historyIndex++;
            if (history.length > MAX_HISTORY) {
              history.shift();
              historyIndex--;
            }
            updateHistoryState();
          }
        }
        batchInitialState = null;
      }
    },
    set: (project) => {
      if (!isUndoRedo && project && project.id && history.length === 0) {
        if (!Array.isArray(project.standaloneInstruments)) {
          project.standaloneInstruments = [];
        }
        const cloned = cloneProject2(project);
        if (cloned && cloned.id) {
          if (!Array.isArray(cloned.standaloneInstruments)) {
            cloned.standaloneInstruments = [];
          }
          history.push(cloned);
          historyIndex = 0;
          updateHistoryState();
        }
      }
      set(project);
    },
    update: updateFn,
    undo: () => {
      if (history.length === 0) {
        return false;
      }
      if (historyIndex <= 0 || history.length < 2) {
        return false;
      }
      isUndoRedo = true;
      historyIndex--;
      const previousState = history[historyIndex];
      if (!previousState || !previousState.id || !Array.isArray(previousState.standaloneInstruments)) {
        let foundValid = false;
        for (let i = historyIndex; i >= 0; i--) {
          const candidate = history[i];
          if (candidate && candidate.id && Array.isArray(candidate.standaloneInstruments)) {
            historyIndex = i;
            const cloned = cloneProject2(candidate);
            if (cloned) {
              set(cloned);
              foundValid = true;
              break;
            }
          }
        }
        if (!foundValid) {
          historyIndex++;
          isUndoRedo = false;
          updateHistoryState();
          return false;
        }
      } else {
        const cloned = cloneProject2(previousState);
        if (cloned && cloned.id && Array.isArray(cloned.standaloneInstruments)) {
          set(cloned);
        } else {
          historyIndex++;
          isUndoRedo = false;
          updateHistoryState();
          return false;
        }
      }
      isUndoRedo = false;
      updateHistoryState();
      return true;
    },
    redo: () => {
      if (history.length === 0 || historyIndex >= history.length - 1) {
        return false;
      }
      isUndoRedo = true;
      historyIndex++;
      const nextState = history[historyIndex];
      if (!nextState || !nextState.id || !Array.isArray(nextState.standaloneInstruments)) {
        let foundValid = false;
        for (let i = historyIndex; i < history.length; i++) {
          const candidate = history[i];
          if (candidate && candidate.id && Array.isArray(candidate.standaloneInstruments)) {
            historyIndex = i;
            const cloned = cloneProject2(candidate);
            if (cloned) {
              set(cloned);
              foundValid = true;
              break;
            }
          }
        }
        if (!foundValid) {
          historyIndex--;
          isUndoRedo = false;
          updateHistoryState();
          return false;
        }
      } else {
        const cloned = cloneProject2(nextState);
        if (cloned && cloned.id && Array.isArray(cloned.standaloneInstruments)) {
          set(cloned);
        } else {
          historyIndex--;
          isUndoRedo = false;
          updateHistoryState();
          return false;
        }
      }
      isUndoRedo = false;
      updateHistoryState();
      return true;
    },
    canUndo: () => {
      return history.length > 1 && historyIndex > 0;
    },
    canRedo: () => {
      return historyIndex < history.length - 1;
    },
    /**
     * Create a new INSTRUMENT (legacy name: "track")
     * Creates a generated synth with a pattern tree structure.
     * This is an Instrument that goes into patterns' canvas or exists standalone.
     * 
     * Structure: Root (4 beats) - Level 1 (4 beats) - Level 2 (4 subdivisions per beat)
     * Creates default 4-4-1 tree structure (4/4 time with 16th notes)
     */
    createNewStandaloneInstrument: (projectId, instrumentType = "kick") => {
      const rootX = 400 + Math.random() * 200;
      const rootY = 200 + Math.random() * 100;
      const rootNode = {
        id: crypto.randomUUID(),
        division: 4,
        // 4 beats total
        x: rootX,
        y: rootY,
        children: []
      };
      const childSpacing = 200;
      const childStartX = rootX - childSpacing * 1.5;
      const childY = rootY + 200;
      for (let i = 0; i < 4; i++) {
        const childX = childStartX + i * childSpacing;
        const childNode = {
          id: crypto.randomUUID(),
          division: 1,
          // Each beat is 1 beat
          x: childX,
          y: childY,
          children: [],
          velocity: 1,
          // Default velocity for child nodes (100%)
          pitch: 60
          // Default pitch (Middle C)
        };
        const grandchildSpacing = 40;
        const grandchildStartX = childX - grandchildSpacing * 1.5;
        const grandchildY = childY + 150;
        for (let j = 0; j < 4; j++) {
          const grandchildX = grandchildStartX + j * grandchildSpacing;
          childNode.children.push({
            id: crypto.randomUUID(),
            division: 1,
            // Each subdivision
            x: grandchildX,
            y: grandchildY,
            children: [],
            velocity: childNode.velocity !== void 0 ? childNode.velocity : 1,
            // Inherit from parent or default
            pitch: childNode.pitch !== void 0 ? childNode.pitch : 60
            // Inherit from parent or default
          });
        }
        rootNode.children.push(childNode);
      }
      const instrumentDefaults = {
        kick: { color: "#00ffff", settings: { attack: 5e-3, decay: 0.4, sustain: 0, release: 0.15 } },
        snare: { color: "#ff00ff", settings: { attack: 5e-3, decay: 0.2, sustain: 0, release: 0.1 } },
        hihat: { color: "#ffff00", settings: { attack: 1e-3, decay: 0.05, sustain: 0, release: 0.01 } },
        clap: { color: "#ff6600", settings: { attack: 1e-3, decay: 0.1, sustain: 0, release: 0.05 } },
        tom: { color: "#00ff00", settings: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.1 } },
        cymbal: { color: "#ff0066", settings: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.2 } },
        shaker: { color: "#6600ff", settings: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 } },
        rimshot: { color: "#ff9900", settings: { attack: 1e-3, decay: 0.08, sustain: 0, release: 0.05 } },
        subtractive: { color: "#00ffcc", settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, osc1Type: "saw", osc2Type: "saw", osc2Detune: 0, filterCutoff: 5e3, filterResonance: 0.5 } },
        fm: { color: "#cc00ff", settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, operators: [{ frequency: 1, amplitude: 1, waveform: "sine" }] } },
        wavetable: { color: "#ffcc00", settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3 } },
        supersaw: { color: "#ff3366", settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, numOscillators: 7, detune: 0.1, spread: 0.5, filterCutoff: 8e3, filterResonance: 0.5, lfoRate: 0, lfoAmount: 0 } },
        pluck: { color: "#66ff99", settings: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.4, damping: 0.96 } },
        bass: { color: "#0066ff", settings: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, osc1Type: "saw", subLevel: 0.6, saturation: 0.3, filterCutoff: 2e3, filterResonance: 0.3 } }
      };
      const defaults = instrumentDefaults[instrumentType] || instrumentDefaults.kick;
      return {
        id: crypto.randomUUID(),
        projectId,
        instrumentType,
        patternTree: rootNode,
        settings: { ...defaults.settings },
        volume: 1,
        pan: 0,
        color: defaults.color,
        mute: false,
        solo: false
      };
    },
    /**
     * Add a standalone instrument to project
     * Adds a generated synth with pattern tree to the project's standalone instruments list.
     */
    addStandaloneInstrument: (instrument) => {
      updateFn((project) => {
        if (!project) {
          console.warn("Cannot add standalone instrument: no project exists");
          return project;
        }
        if (!Array.isArray(project.standaloneInstruments)) {
          project.standaloneInstruments = [];
        }
        const isFirstInstrument = project.standaloneInstruments.length === 0;
        const newProject = {
          ...project,
          standaloneInstruments: [...project.standaloneInstruments, instrument],
          baseMeterTrackId: isFirstInstrument ? instrument.id : project.baseMeterTrackId
        };
        console.log("Adding standalone instrument:", { instrumentId: instrument.id, totalInstruments: newProject.standaloneInstruments.length });
        return newProject;
      });
    },
    // Update standalone instrument
    updateStandaloneInstrument: (instrumentId, updates, skipHistory = false) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          standaloneInstruments: project.standaloneInstruments.map(
            (instrument) => instrument.id === instrumentId ? { ...instrument, ...updates } : instrument
          )
        };
      }, skipHistory);
    },
    // Remove standalone instrument
    removeStandaloneInstrument: (instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        let baseMeterTrackId = project.baseMeterTrackId;
        if (baseMeterTrackId === instrumentId) {
          const remainingInstruments = project.standaloneInstruments.filter((instrument) => instrument.id !== instrumentId);
          baseMeterTrackId = remainingInstruments[0]?.id;
        }
        return {
          ...project,
          standaloneInstruments: project.standaloneInstruments.filter((instrument) => instrument.id !== instrumentId),
          baseMeterTrackId
        };
      });
    },
    // Set the base meter track (determines pattern loop length)
    setBaseMeterTrack: (instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          baseMeterTrackId: instrumentId || project.standaloneInstruments[0]?.id
        };
      });
    },
    /**
     * Copy a standalone instrument
     * Duplicates an instrument with new IDs, copying instrument type, settings, and pattern structure.
     */
    copyStandaloneInstrument: (instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        const instrumentToCopy = project.standaloneInstruments.find((i) => i.id === instrumentId);
        if (!instrumentToCopy) return project;
        const instrumentIndex = project.standaloneInstruments.findIndex((i) => i.id === instrumentId);
        const deepCopyPatternTree = (node) => {
          return JSON.parse(JSON.stringify(node));
        };
        const clonedTree = deepCopyPatternTree(instrumentToCopy.patternTree);
        const regenerateIds = (node) => ({
          ...node,
          id: crypto.randomUUID(),
          children: node.children.map(regenerateIds)
        });
        const newTree = regenerateIds(clonedTree);
        newTree.x = (instrumentToCopy.patternTree.x ?? 0) + 300;
        newTree.y = (instrumentToCopy.patternTree.y ?? 0) + 100;
        const deepCopySettings2 = (settings) => {
          return JSON.parse(JSON.stringify(settings));
        };
        const newInstrument = {
          id: crypto.randomUUID(),
          projectId: instrumentToCopy.projectId,
          instrumentType: instrumentToCopy.instrumentType,
          // Copy instrument type
          patternTree: newTree,
          // Copy pattern structure
          settings: deepCopySettings2(instrumentToCopy.settings || {}),
          // Copy instrument settings
          instrumentSettings: instrumentToCopy.instrumentSettings ? Object.keys(instrumentToCopy.instrumentSettings).reduce((acc, key) => {
            acc[key] = deepCopySettings2(instrumentToCopy.instrumentSettings[key]);
            return acc;
          }, {}) : void 0,
          // Copy all instrument settings
          volume: instrumentToCopy.volume,
          pan: instrumentToCopy.pan,
          color: instrumentToCopy.color,
          mute: instrumentToCopy.mute,
          solo: instrumentToCopy.solo
        };
        const newInstruments = [...project.standaloneInstruments];
        newInstruments.splice(instrumentIndex + 1, 0, newInstrument);
        return {
          ...project,
          standaloneInstruments: newInstruments
        };
      });
    },
    // Add child node to a parent node in a standalone instrument
    addChildNode: (instrumentId, parentNodeId, division = 1) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          standaloneInstruments: project.standaloneInstruments.map((instrument) => {
            if (instrument.id !== instrumentId) return instrument;
            const addChild = (node) => {
              if (node.id === parentNodeId) {
                const newChild = {
                  id: crypto.randomUUID(),
                  division,
                  x: 0,
                  // Will be calculated below
                  y: 0,
                  // Will be calculated below
                  children: [],
                  velocity: node.velocity !== void 0 ? node.velocity : 1,
                  // Inherit from parent or default to 100%
                  pitch: node.pitch !== void 0 ? node.pitch : 60
                  // Inherit from parent or default to Middle C
                };
                const allChildren = [...node.children, newChild];
                const totalChildren = allChildren.length;
                const radius = 160;
                const spreadAngle = Math.PI / 3;
                const centerAngle = Math.PI / 2;
                const startAngle = centerAngle - spreadAngle / 2;
                const repositionedChildren = allChildren.map((child, index) => {
                  let angle;
                  if (totalChildren === 1) {
                    angle = centerAngle;
                  } else {
                    const ratio = index / (totalChildren - 1);
                    angle = startAngle + spreadAngle * (1 - ratio);
                  }
                  const x = (node.x || 0) + Math.cos(angle) * radius;
                  const y = (node.y || 0) + Math.sin(angle) * radius;
                  if (child.id === newChild.id) {
                    const actualRatio = totalChildren > 1 ? index / (totalChildren - 1) : 0;
                    console.log("[NodePositioning] New child node", {
                      index,
                      totalChildren,
                      ratio: actualRatio.toFixed(3),
                      angle: (angle * 180 / Math.PI).toFixed(1) + "°",
                      startAngle: (startAngle * 180 / Math.PI).toFixed(1) + "°",
                      spreadAngle: (spreadAngle * 180 / Math.PI).toFixed(1) + "°",
                      formula: `startAngle(${(startAngle * 180 / Math.PI).toFixed(1)}°) + spreadAngle(${(spreadAngle * 180 / Math.PI).toFixed(1)}°) * (1 - ratio(${actualRatio.toFixed(3)})) = ${(angle * 180 / Math.PI).toFixed(1)}°`,
                      x: x.toFixed(1),
                      y: y.toFixed(1),
                      radius
                    });
                  }
                  return {
                    ...child,
                    x,
                    y
                  };
                });
                return {
                  ...node,
                  children: repositionedChildren
                };
              }
              return {
                ...node,
                children: node.children.map(addChild)
              };
            };
            return {
              ...instrument,
              patternTree: addChild(instrument.patternTree)
            };
          })
        };
      });
    },
    // Delete node and all its children
    deleteNode: (instrumentId, nodeId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          standaloneInstruments: project.standaloneInstruments.map((instrument) => {
            if (instrument.id !== instrumentId) return instrument;
            const deleteNodeRecursive = (node) => {
              if (node.id === nodeId) return null;
              return {
                ...node,
                children: node.children.map(deleteNodeRecursive).filter((n) => n !== null)
              };
            };
            const newTree = deleteNodeRecursive(instrument.patternTree);
            if (!newTree) return instrument;
            return {
              ...instrument,
              patternTree: newTree
            };
          })
        };
      });
    },
    // Update node division
    updateNodeDivision: (instrumentId, nodeId, division) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          standaloneInstruments: project.standaloneInstruments.map((instrument) => {
            if (instrument.id !== instrumentId) return instrument;
            const updateNode = (node) => {
              if (node.id === nodeId) {
                return { ...node, division };
              }
              return {
                ...node,
                children: node.children.map(updateNode)
              };
            };
            return {
              ...instrument,
              patternTree: updateNode(instrument.patternTree)
            };
          })
        };
      });
    },
    // Update node pitch (and inherit to all children)
    updateNodePitch: (instrumentId, nodeId, pitch) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          standaloneInstruments: project.standaloneInstruments.map((instrument) => {
            if (instrument.id !== instrumentId) return instrument;
            const updateNode = (node) => {
              if (node.id === nodeId) {
                const updateChildren = (n) => ({
                  ...n,
                  pitch,
                  children: n.children.map(updateChildren)
                });
                return updateChildren(node);
              }
              return {
                ...node,
                children: node.children.map(updateNode)
              };
            };
            return {
              ...instrument,
              patternTree: updateNode(instrument.patternTree)
            };
          })
        };
      });
    },
    // Update node velocity (and inherit to all children)
    updateNodeVelocity: (instrumentId, nodeId, velocity) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          standaloneInstruments: project.standaloneInstruments.map((instrument) => {
            if (instrument.id !== instrumentId) return instrument;
            const updateNode = (node) => {
              if (node.id === nodeId) {
                const updateChildren = (n) => ({
                  ...n,
                  velocity,
                  children: n.children.map(updateChildren)
                });
                return updateChildren(node);
              }
              return {
                ...node,
                children: node.children.map(updateNode)
              };
            };
            return {
              ...instrument,
              patternTree: updateNode(instrument.patternTree)
            };
          })
        };
      });
    },
    // Timeline management
    addTimelineClip: (clip) => {
      updateFn((project) => {
        if (!project) return project;
        const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 16 };
        const updatedTimeline = {
          ...timeline,
          clips: [...timeline.clips || [], clip],
          totalLength: Math.max(timeline.totalLength, clip.startBeat + clip.duration)
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    updateTimelineClip: (clipId, updates) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          clips: project.timeline.clips.map(
            (clip) => clip.id === clipId ? { ...clip, ...updates } : clip
          ),
          totalLength: project.timeline.totalLength
        };
        if (updates.startBeat !== void 0 || updates.duration !== void 0) {
          const maxEnd = Math.max(
            ...updatedTimeline.clips.map((c) => c.startBeat + c.duration),
            updatedTimeline.totalLength
          );
          updatedTimeline.totalLength = maxEnd;
        }
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    deleteTimelineClip: (clipId) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          clips: (project.timeline.clips || []).filter((clip) => clip.id !== clipId)
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    updateTimelineLength: (length) => {
      updateFn((project) => {
        if (!project) return project;
        const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 16 };
        return {
          ...project,
          timeline: {
            ...timeline,
            totalLength: Math.max(length, timeline.totalLength)
          }
        };
      });
    },
    // Timeline effect management
    addTimelineEffect: (effect) => {
      updateFn((project) => {
        if (!project) return project;
        const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 16 };
        const updatedTimeline = {
          ...timeline,
          effects: [...timeline.effects || [], effect],
          totalLength: Math.max(timeline.totalLength, effect.startBeat + effect.duration)
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    updateTimelineEffect: (effectId, updates) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          effects: (project.timeline.effects || []).map(
            (effect) => effect.id === effectId ? { ...effect, ...updates } : effect
          ),
          totalLength: project.timeline.totalLength
        };
        if (updates.startBeat !== void 0 || updates.duration !== void 0) {
          const maxEnd = Math.max(
            ...(updatedTimeline.effects || []).map((e) => e.startBeat + e.duration),
            updatedTimeline.totalLength
          );
          updatedTimeline.totalLength = maxEnd;
        }
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    deleteTimelineEffect: (effectId) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          effects: (project.timeline.effects || []).filter((effect) => effect.id !== effectId)
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    // Timeline envelope management
    addTimelineEnvelope: (envelope) => {
      updateFn((project) => {
        if (!project) return project;
        const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 16 };
        const updatedTimeline = {
          ...timeline,
          envelopes: [...timeline.envelopes || [], envelope],
          totalLength: Math.max(timeline.totalLength, envelope.startBeat + envelope.duration)
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    updateTimelineEnvelope: (envelopeId, updates) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          envelopes: (project.timeline.envelopes || []).map(
            (envelope) => envelope.id === envelopeId ? { ...envelope, ...updates } : envelope
          ),
          totalLength: project.timeline.totalLength
        };
        if (updates.startBeat !== void 0 || updates.duration !== void 0) {
          const maxEnd = Math.max(
            ...(updatedTimeline.envelopes || []).map((e) => e.startBeat + e.duration),
            updatedTimeline.totalLength
          );
          updatedTimeline.totalLength = maxEnd;
        }
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    deleteTimelineEnvelope: (envelopeId) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          envelopes: (project.timeline.envelopes || []).filter((envelope) => envelope.id !== envelopeId)
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    /**
     * Create a TRACK (TimelineTrack) - the actual track in arrangement view
     * Tracks are where patterns, effects, and envelopes are manipulated to create songs.
     * Tracks exist ONLY in the arrangement view timeline editor.
     */
    createTimelineTrack: (type, patternId, name) => {
      const now = Date.now();
      const defaultNames = {
        pattern: "Pattern Track",
        effect: "Effect Track",
        envelope: "Envelope Track"
      };
      const defaultColors = {
        pattern: "#7ab8ff",
        // Blue
        effect: "#9b59b6",
        // Purple
        envelope: "#2ecc71"
        // Green
      };
      const project = getCurrent();
      const existingTracks = project?.timeline?.tracks || [];
      let order;
      if (type === "pattern") {
        const patternTracks = existingTracks.filter((t) => t.type === "pattern");
        if (patternTracks.length === 0) {
          order = 0;
        } else {
          const minPatternOrder = Math.min(...patternTracks.map((t) => t.order));
          order = minPatternOrder - 1;
        }
      } else {
        const maxOrder = existingTracks.length > 0 ? Math.max(...existingTracks.map((t) => t.order)) : 999;
        order = maxOrder + 1;
      }
      return {
        id: crypto.randomUUID(),
        type,
        name: name || `${defaultNames[type]} ${existingTracks.filter((t) => t.type === type).length + 1}`,
        patternId,
        order,
        volume: 1,
        // Default volume
        mute: false,
        // Default mute state
        solo: false,
        // Default solo state
        color: defaultColors[type],
        // Default color based on track type
        createdAt: now
      };
    },
    addTimelineTrack: (track) => {
      updateFn((project) => {
        if (!project) return project;
        const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 16 };
        const updatedTimeline = {
          ...timeline,
          tracks: [...timeline.tracks || [], track]
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    deleteTimelineTrack: (trackId) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          tracks: (project.timeline.tracks || []).filter((track) => track.id !== trackId),
          clips: (project.timeline.clips || []).filter((clip) => clip.trackId !== trackId),
          effects: (project.timeline.effects || []).filter((effect) => effect.trackId !== trackId),
          envelopes: (project.timeline.envelopes || []).filter((envelope) => envelope.trackId !== trackId)
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    updateTimelineTrack: (trackId, updates) => {
      updateFn((project) => {
        if (!project || !project.timeline) return project;
        const updatedTimeline = {
          ...project.timeline,
          tracks: (project.timeline.tracks || []).map(
            (track) => track.id === trackId ? { ...track, ...updates } : track
          )
        };
        return {
          ...project,
          timeline: updatedTimeline
        };
      });
    },
    /**
     * Helper: Convert legacy pattern (single instrument) to new format (instruments array)
     */
    normalizePattern: (pattern) => {
      if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
        return pattern;
      }
      if (pattern.instrumentType && pattern.patternTree) {
        const instrument = {
          id: crypto.randomUUID(),
          instrumentType: pattern.instrumentType,
          patternTree: pattern.patternTree,
          settings: pattern.settings || {},
          instrumentSettings: pattern.instrumentSettings,
          color: pattern.color || "#7ab8ff",
          volume: pattern.volume ?? 1,
          pan: pattern.pan ?? 0,
          mute: pattern.mute,
          solo: pattern.solo
        };
        return {
          ...pattern,
          instruments: [instrument],
          // Keep legacy fields for backward compatibility during transition
          instrumentType: pattern.instrumentType,
          patternTree: pattern.patternTree,
          settings: pattern.settings,
          instrumentSettings: pattern.instrumentSettings,
          color: pattern.color,
          volume: pattern.volume,
          pan: pattern.pan
        };
      }
      return {
        ...pattern,
        instruments: []
      };
    },
    /**
     * Get all instruments from a pattern (handles both new and legacy formats)
     */
    getPatternInstruments: (pattern) => {
      if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
        return pattern.instruments;
      }
      if (pattern.instrumentType && pattern.patternTree) {
        return [{
          id: crypto.randomUUID(),
          instrumentType: pattern.instrumentType,
          patternTree: pattern.patternTree,
          settings: pattern.settings || {},
          instrumentSettings: pattern.instrumentSettings,
          color: pattern.color || "#7ab8ff",
          volume: pattern.volume ?? 1,
          pan: pattern.pan ?? 0,
          mute: pattern.mute,
          solo: pattern.solo
        }];
      }
      return [];
    },
    /**
     * Create a new PATTERN (container for multiple instruments)
     * Creates a pattern that can store multiple instruments that play simultaneously.
     */
    createPattern: (projectId, name, instrumentType, withDefaultKick) => {
      const now = Date.now();
      return {
        id: crypto.randomUUID(),
        projectId,
        name,
        baseMeter: 4,
        mute: false,
        solo: false,
        createdAt: now,
        updatedAt: now,
        // Start with empty instruments array - no default instruments
        instruments: [],
        // LEGACY: Keep single instrument fields empty for backward compatibility
        instrumentType: "",
        patternTree: {
          id: crypto.randomUUID(),
          division: 4,
          x: 0,
          y: 0,
          children: []
        },
        settings: {},
        instrumentSettings: void 0,
        color: "#7ab8ff",
        volume: 1,
        pan: 0
      };
    },
    addPattern: (pattern) => {
      updateFn((project) => {
        if (!project) {
          console.warn("Cannot add pattern: no project exists");
          return project;
        }
        if (!Array.isArray(project.patterns)) {
          project.patterns = [];
        }
        const deepCopyPatternTree = (node) => {
          return {
            ...node,
            children: node.children.map((child) => deepCopyPatternTree(child))
          };
        };
        const deepCopyInstruments = (instruments) => {
          return instruments.map((inst) => ({
            ...inst,
            patternTree: deepCopyPatternTree(inst.patternTree),
            settings: { ...inst.settings },
            instrumentSettings: inst.instrumentSettings ? Object.keys(inst.instrumentSettings).reduce((acc, key) => {
              acc[key] = { ...inst.instrumentSettings[key] };
              return acc;
            }, {}) : void 0
          }));
        };
        const independentPattern = {
          ...pattern,
          // Deep copy instruments array if present
          instruments: pattern.instruments && Array.isArray(pattern.instruments) ? deepCopyInstruments(pattern.instruments) : void 0,
          // Legacy: deep copy patternTree if present (for backward compatibility)
          patternTree: pattern.patternTree ? deepCopyPatternTree(pattern.patternTree) : void 0,
          settings: { ...pattern.settings },
          instrumentSettings: pattern.instrumentSettings ? Object.keys(pattern.instrumentSettings).reduce((acc, key) => {
            acc[key] = { ...pattern.instrumentSettings[key] };
            return acc;
          }, {}) : void 0
        };
        return {
          ...project,
          patterns: [...project.patterns, independentPattern]
        };
      });
    },
    updatePattern: (patternId, updates, skipHistory = false) => {
      updateFn((project) => {
        if (!project) return project;
        const deepCopyPatternTree = (node) => {
          return {
            ...node,
            children: node.children.map((child) => deepCopyPatternTree(child))
          };
        };
        const deepCopyInstruments = (instruments) => {
          return instruments.map((inst) => ({
            ...inst,
            patternTree: deepCopyPatternTree(inst.patternTree),
            settings: { ...inst.settings },
            instrumentSettings: inst.instrumentSettings ? Object.keys(inst.instrumentSettings).reduce((acc, key) => {
              acc[key] = { ...inst.instrumentSettings[key] };
              return acc;
            }, {}) : void 0
          }));
        };
        const processedUpdates = { ...updates };
        if (updates.patternTree) {
          processedUpdates.patternTree = deepCopyPatternTree(updates.patternTree);
        }
        if (updates.instruments && Array.isArray(updates.instruments)) {
          processedUpdates.instruments = deepCopyInstruments(updates.instruments);
        }
        if (updates.settings) {
          processedUpdates.settings = { ...updates.settings };
        }
        if (updates.instrumentSettings) {
          processedUpdates.instrumentSettings = Object.keys(updates.instrumentSettings).reduce((acc, key) => {
            acc[key] = { ...updates.instrumentSettings[key] };
            return acc;
          }, {});
        }
        const updatedPatterns = (project.patterns || []).map(
          (pattern) => pattern.id === patternId ? { ...pattern, ...processedUpdates, updatedAt: Date.now() } : pattern
        );
        return {
          ...project,
          patterns: updatedPatterns
        };
      }, skipHistory);
    },
    /**
     * Add an instrument to a pattern
     * When editing a pattern, this adds a new instrument to the pattern's instruments array.
     * All instruments in a pattern play simultaneously.
     */
    addPatternInstrument: (patternId, instrument) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const normalized = projectStore.normalizePattern(pattern);
            const instruments = [...normalized.instruments || [], instrument];
            return {
              ...normalized,
              instruments,
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    /**
     * Remove an instrument from a pattern
     */
    removePatternInstrument: (patternId, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const normalized = projectStore.normalizePattern(pattern);
            const instruments = (normalized.instruments || []).filter((inst) => inst.id !== instrumentId);
            return {
              ...normalized,
              instruments,
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    /**
     * Update an instrument in a pattern
     */
    updatePatternInstrument: (patternId, instrumentId, updates, skipHistory = false) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const normalized = projectStore.normalizePattern(pattern);
            const instruments = (normalized.instruments || []).map(
              (inst) => inst.id === instrumentId ? { ...inst, ...updates } : inst
            );
            return {
              ...normalized,
              instruments,
              updatedAt: Date.now()
            };
          })
        };
      }, skipHistory);
    },
    /**
     * Copy a single instrument within a pattern
     * Creates a duplicate instrument in the same pattern with all properties copied
     */
    copyPatternInstrument: (patternId, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        const pattern = (project.patterns || []).find((p) => p.id === patternId);
        if (!pattern) return project;
        const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0 ? pattern.instruments : pattern.instrumentType && pattern.patternTree ? [{
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
        }] : [];
        const instrumentToCopy = patternInstruments.find((inst) => inst.id === instrumentId);
        if (!instrumentToCopy) return project;
        const deepCopyPatternTree = (node) => {
          return JSON.parse(JSON.stringify(node));
        };
        const regenerateIds = (node) => ({
          ...node,
          id: crypto.randomUUID(),
          children: node.children.map(regenerateIds)
        });
        const deepCopySettings2 = (settings) => {
          return JSON.parse(JSON.stringify(settings));
        };
        const clonedTree = deepCopyPatternTree(instrumentToCopy.patternTree);
        const newTree = regenerateIds(clonedTree);
        const offsetX = 300;
        const offsetY = 100;
        const offsetTree = (node) => ({
          ...node,
          x: (node.x ?? 0) + offsetX,
          y: (node.y ?? 0) + offsetY,
          children: node.children.map(offsetTree)
        });
        const offsetNewTree = offsetTree(newTree);
        const newInstrument = {
          id: crypto.randomUUID(),
          instrumentType: instrumentToCopy.instrumentType,
          patternTree: offsetNewTree,
          settings: deepCopySettings2(instrumentToCopy.settings || {}),
          instrumentSettings: instrumentToCopy.instrumentSettings ? Object.keys(instrumentToCopy.instrumentSettings).reduce((acc, key) => {
            acc[key] = deepCopySettings2(instrumentToCopy.instrumentSettings[key]);
            return acc;
          }, {}) : void 0,
          color: instrumentToCopy.color,
          volume: instrumentToCopy.volume,
          pan: instrumentToCopy.pan,
          mute: instrumentToCopy.mute ?? false,
          solo: instrumentToCopy.solo ?? false
        };
        return {
          ...project,
          patterns: (project.patterns || []).map((p) => {
            if (p.id !== patternId) return p;
            const normalized = projectStore.normalizePattern(p);
            const instruments = [...normalized.instruments || [], newInstrument];
            return {
              ...normalized,
              instruments,
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    /**
     * Copy an INSTRUMENT stored as Pattern (legacy name: "copyPattern")
     * Creates a new standalone instrument (track) in arrangement view with the same instrument properties.
     * This allows copying a pattern's instrument to the canvas for editing.
     */
    copyPattern: (patternId) => {
      updateFn((project) => {
        if (!project) return project;
        const patternToCopy = (project.patterns || []).find((p) => p.id === patternId);
        if (!patternToCopy) return project;
        const patternInstruments = patternToCopy.instruments && Array.isArray(patternToCopy.instruments) && patternToCopy.instruments.length > 0 ? patternToCopy.instruments : patternToCopy.instrumentType && patternToCopy.patternTree ? [{
          id: patternToCopy.id,
          instrumentType: patternToCopy.instrumentType,
          patternTree: patternToCopy.patternTree,
          settings: patternToCopy.settings || {},
          instrumentSettings: patternToCopy.instrumentSettings,
          color: patternToCopy.color || "#7ab8ff",
          volume: patternToCopy.volume ?? 1,
          pan: patternToCopy.pan ?? 0,
          mute: patternToCopy.mute,
          solo: patternToCopy.solo
        }] : [];
        const deepCopyPatternTree = (node) => {
          return JSON.parse(JSON.stringify(node));
        };
        const regenerateIds = (node) => ({
          ...node,
          id: crypto.randomUUID(),
          children: node.children.map(regenerateIds)
        });
        const deepCopySettings2 = (settings) => {
          return JSON.parse(JSON.stringify(settings));
        };
        const newInstruments = patternInstruments.map((instrument, index) => {
          const clonedTree = deepCopyPatternTree(instrument.patternTree);
          const newTree = regenerateIds(clonedTree);
          newTree.x = (instrument.patternTree.x ?? 0) + index * 300;
          newTree.y = (instrument.patternTree.y ?? 0) + index * 100;
          return {
            id: crypto.randomUUID(),
            projectId: patternToCopy.projectId,
            instrumentType: instrument.instrumentType,
            patternTree: newTree,
            settings: deepCopySettings2(instrument.settings || {}),
            instrumentSettings: instrument.instrumentSettings ? Object.keys(instrument.instrumentSettings).reduce((acc, key) => {
              acc[key] = deepCopySettings2(instrument.instrumentSettings[key]);
              return acc;
            }, {}) : void 0,
            volume: instrument.volume,
            pan: instrument.pan,
            color: instrument.color,
            mute: false,
            solo: false
          };
        });
        if (!Array.isArray(project.standaloneInstruments)) {
          project.standaloneInstruments = [];
        }
        const updatedInstruments = [...project.standaloneInstruments, ...newInstruments];
        const isFirstInstrument = project.standaloneInstruments.length === 0;
        return {
          ...project,
          standaloneInstruments: updatedInstruments,
          baseMeterTrackId: isFirstInstrument ? newInstruments[0]?.id : project.baseMeterTrackId
        };
      });
    },
    deletePattern: (patternId) => {
      updateFn((project) => {
        if (!project) return project;
        const timeline = project.timeline;
        if (timeline) {
          timeline.clips = (timeline.clips || []).filter((clip) => clip.patternId !== patternId);
        }
        return {
          ...project,
          patterns: (project.patterns || []).filter((p) => p.id !== patternId),
          timeline
        };
      });
    },
    getPattern: (patternId) => {
      let project = null;
      subscribe((p) => project = p)();
      if (!project) return null;
      return (project.patterns || []).find((p) => p.id === patternId) || null;
    },
    // Pattern node operations (similar to track node operations)
    updatePatternTree: (patternId, patternTree, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
              const instruments = pattern.instruments.map(
                (inst) => inst.id === instrumentId ? { ...inst, patternTree } : inst
              );
              return { ...pattern, instruments, updatedAt: Date.now() };
            }
            return { ...pattern, patternTree, updatedAt: Date.now() };
          })
        };
      });
    },
    updatePatternNodeDivision: (patternId, nodeId, division, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const updateNode = (node) => {
              if (node.id === nodeId) {
                return { ...node, division };
              }
              return {
                ...node,
                children: node.children.map(updateNode)
              };
            };
            if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
              const instruments = pattern.instruments.map(
                (inst) => inst.id === instrumentId ? { ...inst, patternTree: updateNode(inst.patternTree) } : inst
              );
              return { ...pattern, instruments, updatedAt: Date.now() };
            }
            return {
              ...pattern,
              patternTree: updateNode(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    updatePatternNodePitch: (patternId, nodeId, pitch, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const updateNode = (node) => {
              if (node.id === nodeId) {
                const updateChildren = (n) => ({
                  ...n,
                  pitch,
                  children: n.children.map(updateChildren)
                });
                return updateChildren(node);
              }
              return {
                ...node,
                children: node.children.map(updateNode)
              };
            };
            if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
              const instruments = pattern.instruments.map(
                (inst) => inst.id === instrumentId ? { ...inst, patternTree: updateNode(inst.patternTree) } : inst
              );
              return { ...pattern, instruments, updatedAt: Date.now() };
            }
            return {
              ...pattern,
              patternTree: updateNode(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    updatePatternNodeVelocity: (patternId, nodeId, velocity, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const updateNode = (node) => {
              if (node.id === nodeId) {
                const updateChildren = (n) => ({
                  ...n,
                  velocity,
                  children: n.children.map(updateChildren)
                });
                return updateChildren(node);
              }
              return {
                ...node,
                children: node.children.map(updateNode)
              };
            };
            if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
              const instruments = pattern.instruments.map(
                (inst) => inst.id === instrumentId ? { ...inst, patternTree: updateNode(inst.patternTree) } : inst
              );
              return { ...pattern, instruments, updatedAt: Date.now() };
            }
            return {
              ...pattern,
              patternTree: updateNode(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    addPatternChildNode: (patternId, parentNodeId, division = 1, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const addChild = (node) => {
              if (node.id === parentNodeId) {
                const newChild = {
                  id: crypto.randomUUID(),
                  division,
                  x: 0,
                  // Will be calculated below
                  y: 0,
                  // Will be calculated below
                  children: [],
                  velocity: node.velocity !== void 0 ? node.velocity : 1,
                  // Inherit from parent or default to 100%
                  pitch: node.pitch !== void 0 ? node.pitch : 60
                  // Inherit from parent or default to Middle C
                };
                const allChildren = [...node.children, newChild];
                const totalChildren = allChildren.length;
                const radius = 160;
                const spreadAngle = Math.PI / 3;
                const centerAngle = Math.PI / 2;
                const startAngle = centerAngle - spreadAngle / 2;
                const repositionedChildren = allChildren.map((child, index) => {
                  let angle;
                  if (totalChildren === 1) {
                    angle = centerAngle;
                  } else {
                    const ratio = index / (totalChildren - 1);
                    angle = startAngle + spreadAngle * (1 - ratio);
                  }
                  const x = (node.x || 0) + Math.cos(angle) * radius;
                  const y = (node.y || 0) + Math.sin(angle) * radius;
                  if (child.id === newChild.id) {
                    const actualRatio = totalChildren > 1 ? index / (totalChildren - 1) : 0;
                    console.log("[NodePositioning] New child node", {
                      index,
                      totalChildren,
                      ratio: actualRatio.toFixed(3),
                      angle: (angle * 180 / Math.PI).toFixed(1) + "°",
                      startAngle: (startAngle * 180 / Math.PI).toFixed(1) + "°",
                      spreadAngle: (spreadAngle * 180 / Math.PI).toFixed(1) + "°",
                      formula: `startAngle(${(startAngle * 180 / Math.PI).toFixed(1)}°) + spreadAngle(${(spreadAngle * 180 / Math.PI).toFixed(1)}°) * (1 - ratio(${actualRatio.toFixed(3)})) = ${(angle * 180 / Math.PI).toFixed(1)}°`,
                      x: x.toFixed(1),
                      y: y.toFixed(1),
                      radius
                    });
                  }
                  return {
                    ...child,
                    x,
                    y
                  };
                });
                return {
                  ...node,
                  children: repositionedChildren
                };
              }
              return {
                ...node,
                children: node.children.map(addChild)
              };
            };
            if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
              const instruments = pattern.instruments.map(
                (inst) => inst.id === instrumentId ? { ...inst, patternTree: addChild(inst.patternTree) } : inst
              );
              return { ...pattern, instruments, updatedAt: Date.now() };
            }
            return {
              ...pattern,
              patternTree: addChild(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    deletePatternNode: (patternId, nodeId, instrumentId) => {
      updateFn((project) => {
        if (!project) return project;
        return {
          ...project,
          patterns: (project.patterns || []).map((pattern) => {
            if (pattern.id !== patternId) return pattern;
            const deleteNode = (node) => {
              if (node.id === nodeId) {
                return null;
              }
              return {
                ...node,
                children: node.children.map(deleteNode).filter((n) => n !== null)
              };
            };
            if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
              const instruments = pattern.instruments.map((inst) => {
                if (inst.id !== instrumentId) return inst;
                const newTree2 = deleteNode(inst.patternTree);
                if (!newTree2) {
                  return {
                    ...inst,
                    patternTree: {
                      id: crypto.randomUUID(),
                      division: pattern.baseMeter || 4,
                      x: 0,
                      y: 0,
                      children: []
                    }
                  };
                }
                return { ...inst, patternTree: newTree2 };
              });
              return { ...pattern, instruments, updatedAt: Date.now() };
            }
            const patternTree = pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] };
            const newTree = deleteNode(patternTree);
            if (!newTree) {
              return {
                ...pattern,
                patternTree: {
                  id: crypto.randomUUID(),
                  division: pattern.baseMeter || 4,
                  x: 0,
                  y: 0,
                  children: []
                },
                updatedAt: Date.now()
              };
            }
            return {
              ...pattern,
              patternTree: newTree,
              updatedAt: Date.now()
            };
          })
        };
      });
    },
    // Effect management - delegated to module
    ...createEffectsModule(updateFn),
    // Envelope management - delegated to module
    ...createEnvelopesModule(updateFn),
    // Automation management - delegated to module
    ...createAutomationModule(updateFn, getCurrent)
  };
}
const projectStore = createProjectStore();
export {
  projectStore
};
