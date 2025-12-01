const fs = require('fs');
const path = require('path');

const files = [
	'src/lib/audio/synths/melodic/PluckSynth.js',
	'src/lib/audio/synths/melodic/SupersawSynth.js',
	'src/lib/audio/synths/melodic/OrganSynth.js',
	'src/lib/audio/synths/melodic/WavetableSynth.js',
	'src/lib/audio/synths/melodic/FMSynth.js',
	'src/lib/audio/synths/melodic/BassSynth.js',
	'src/lib/audio/synths/drums/SnareSynth.js',
	'src/lib/audio/synths/drums/TomSynth.js',
	'src/lib/audio/synths/drums/RimshotSynth.js',
	'src/lib/audio/synths/drums/ClapSynth.js',
	'src/lib/audio/synths/drums/HiHatSynth.js',
	'src/lib/audio/synths/drums/CymbalSynth.js'
];

files.forEach(file => {
	const filePath = path.join(__dirname, '..', file);
	let content = fs.readFileSync(filePath, 'utf8');
	
	// Remove import
	content = content.replace(/import\s*{\s*calculateChokeFadeOut\s*}\s*from\s*['"].*choke\.js['"];?\s*\n/g, '');
	
	// Remove triggerTime declarations
	content = content.replace(/this\.triggerTime\s*=\s*0;?\s*\/\/\s*.*choke.*\n/g, '');
	content = content.replace(/this\.triggerTime\s*=\s*0;?\s*\/\/\s*Reset trigger time.*\n/g, '');
	content = content.replace(/this\.triggerTime\s*=\s*0;?\s*\/\/\s*Store when.*\n/g, '');
	
	// Remove choke calculation block
	content = content.replace(/\/\/\s*Choke:.*\n(\/\/.*\n)*const\s*{\s*chokeFadeOut\s*}\s*=\s*calculateChokeFadeOut\(\{[^}]+\}\);?\s*\n/g, '');
	
	// Remove envelope *= chokeFadeOut
	content = content.replace(/\/\/\s*Apply choke fade-out.*\n(\/\/.*\n)*envelope\s*\*=\s*chokeFadeOut;?\s*\n/g, '');
	
	// Remove output *= chokeFadeOut
	content = content.replace(/\/\/\s*Apply choke fade-out.*\n(\/\/.*\n)*.*\*\s*chokeFadeOut;?\s*\n/g, (m) => {
		return m.replace(/\s*\*\s*chokeFadeOut/g, '');
	});
	
	// Remove triggerTime++
	content = content.replace(/this\.triggerTime\+\+;?\s*\n/g, '');
	
	fs.writeFileSync(filePath, content);
	console.log(`Processed ${file}`);
});

console.log('Done removing choke from all synth files!');

