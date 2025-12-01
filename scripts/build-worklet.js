/**
 * Build script to bundle all synth files into the AudioWorklet processor
 * This concatenates the processor core with all synth classes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Paths
const modulesDir = path.join(projectRoot, 'src/lib/audio/engine/modules');
const processorCorePath = path.join(projectRoot, 'src/lib/audio/engine/EngineWorkletProcessor.core.js');
const synthsDir = path.join(projectRoot, 'src/lib/audio/synths');
const outputPath = path.join(projectRoot, 'static/EngineWorkletProcessor.js');

// Module files in order (dependencies first)
// Note: Utility files and effect handlers must come before EffectsProcessor
const utilityFiles = [
	'utils/FilterUtils.js'
];

const effectHandlerFiles = [
	'effects/EffectHandlers.js'
];

const moduleFiles = [
	'TrackStateManager.js',
	'PlaybackController.js',
	'EventScheduler.js',
	'EffectsProcessor.js',
	'EnvelopesProcessor.js',
	'ProjectManager.js',
	'SynthManager.js',
	'AudioMixer.js',
	'AudioProcessor.js',
	'MessageHandler.js',
	'SynthFactory.js'
];

// Drum synth files
const drumSynthFiles = [
	'drums/KickSynth.js',
	'drums/SnareSynth.js',
	'drums/HiHatSynth.js',
	'drums/ClapSynth.js',
	'drums/TomSynth.js',
	'drums/CymbalSynth.js',
	'drums/ShakerSynth.js',
	'drums/RimshotSynth.js'
];

// Melodic synth files
const melodicSynthFiles = [
	'melodic/SubtractiveSynth.js',
	'melodic/FMSynth.js',
	'melodic/WavetableSynth.js',
	'melodic/SupersawSynth.js',
	'melodic/PluckSynth.js',
	'melodic/BassSynth.js',
	'melodic/PadSynth.js',
	'melodic/OrganSynth.js'
];

// Shared synth files (samples, etc.)
const sharedSynthFiles = [
	'shared/SampleSynth.js'
];

function buildWorklet() {
	console.log('Building AudioWorklet processor...');
	
	// Read and concatenate utility files first
	let modulesCode = '\n\n// ========== UTILITIES ==========\n\n';
	
	for (const utilityFile of utilityFiles) {
		const utilityPath = path.join(modulesDir, utilityFile);
		if (fs.existsSync(utilityPath)) {
			console.log(`  Adding utility ${utilityFile}...`);
			const utilityCode = fs.readFileSync(utilityPath, 'utf8');
			modulesCode += utilityCode + '\n\n';
		} else {
			console.warn(`  Warning: ${utilityFile} not found, skipping...`);
		}
	}
	
	// Read and concatenate effect handler files
	modulesCode += '\n\n// ========== EFFECT HANDLERS ==========\n\n';
	
	for (const effectHandlerFile of effectHandlerFiles) {
		const effectHandlerPath = path.join(modulesDir, effectHandlerFile);
		if (fs.existsSync(effectHandlerPath)) {
			console.log(`  Adding effect handler ${effectHandlerFile}...`);
			const effectHandlerCode = fs.readFileSync(effectHandlerPath, 'utf8');
			modulesCode += effectHandlerCode + '\n\n';
		} else {
			console.warn(`  Warning: ${effectHandlerFile} not found, skipping...`);
		}
	}
	
	// Read and concatenate all module files
	modulesCode += '\n\n// ========== MODULES ==========\n\n';
	
	for (const moduleFile of moduleFiles) {
		const modulePath = path.join(modulesDir, moduleFile);
		if (fs.existsSync(modulePath)) {
			console.log(`  Adding module ${moduleFile}...`);
			const moduleCode = fs.readFileSync(modulePath, 'utf8');
			modulesCode += moduleCode + '\n\n';
		} else {
			console.warn(`  Warning: ${moduleFile} not found, skipping...`);
		}
	}
	
	// Read processor core
	let processorCore = fs.readFileSync(processorCorePath, 'utf8');
	
	// Remove the registerProcessor line if it exists (we'll add it at the end)
	processorCore = processorCore.replace(/registerProcessor\([^)]+\);?\s*$/, '');
	
	// Read and concatenate drum synth files
	let drumSynthsCode = '\n\n// ========== DRUM SYNTH CLASSES ==========\n\n';
	
	for (const synthFile of drumSynthFiles) {
		// Skip comment lines
		if (synthFile.trim().startsWith('//')) continue;
		
		const synthPath = path.join(synthsDir, synthFile);
		if (fs.existsSync(synthPath)) {
			console.log(`  Adding drum synth: ${synthFile}...`);
			const synthCode = fs.readFileSync(synthPath, 'utf8');
			drumSynthsCode += synthCode + '\n\n';
		} else {
			console.warn(`  Warning: ${synthFile} not found, skipping...`);
		}
	}
	
	// Read and concatenate melodic synth files
	let melodicSynthsCode = '\n\n// ========== MELODIC SYNTH CLASSES ==========\n\n';
	
	for (const synthFile of melodicSynthFiles) {
		// Skip comment lines
		if (synthFile.trim().startsWith('//')) continue;
		
		const synthPath = path.join(synthsDir, synthFile);
		if (fs.existsSync(synthPath)) {
			console.log(`  Adding melodic synth: ${synthFile}...`);
			const synthCode = fs.readFileSync(synthPath, 'utf8');
			melodicSynthsCode += synthCode + '\n\n';
		} else {
			console.warn(`  Warning: ${synthFile} not found, skipping...`);
		}
	}
	
	// Read and concatenate shared synth files
	let sharedSynthsCode = '\n\n// ========== SHARED SYNTH CLASSES ==========\n\n';
	
	for (const synthFile of sharedSynthFiles) {
		// Skip comment lines
		if (synthFile.trim().startsWith('//')) continue;
		
		const synthPath = path.join(synthsDir, synthFile);
		if (fs.existsSync(synthPath)) {
			console.log(`  Adding shared synth: ${synthFile}...`);
			const synthCode = fs.readFileSync(synthPath, 'utf8');
			sharedSynthsCode += synthCode + '\n\n';
		} else {
			console.warn(`  Warning: ${synthFile} not found, skipping...`);
		}
	}
	
	const synthsCode = drumSynthsCode + melodicSynthsCode + sharedSynthsCode;
	
	// Combine everything: modules first, then processor core, then synths
	const finalCode = modulesCode + processorCore + synthsCode + '\nregisterProcessor(\'engine-worklet-processor\', EngineWorkletProcessor);\n';
	
	// Write to output
	fs.writeFileSync(outputPath, finalCode, 'utf8');
	
	console.log(`✓ Built ${outputPath}`);
	console.log(`  Modules: ${modulesCode.length} bytes`);
	console.log(`  Processor core: ${processorCore.length} bytes`);
	console.log(`  Drum synths: ${drumSynthsCode.length} bytes`);
	console.log(`  Melodic synths: ${melodicSynthsCode.length} bytes`);
	console.log(`  Shared synths: ${sharedSynthsCode.length} bytes`);
	console.log(`  Total: ${finalCode.length} bytes`);
}

buildWorklet();

