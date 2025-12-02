/**
 * Quick script to verify wavetables are in the built worklet
 */

const fs = require('fs');
const path = require('path');

const workletPath = path.join(__dirname, '../static/EngineWorkletProcessor.js');

if (!fs.existsSync(workletPath)) {
    console.error('❌ EngineWorkletProcessor.js not found!');
    process.exit(1);
}

const content = fs.readFileSync(workletPath, 'utf8');

// Check for wavetables
const hasWavetables = content.includes('const wavetables = {');
const hasKick = content.includes('"wa_808tape_kick_01_clean"');
const hasOkwtComment = content.includes('Processed with: okwt');

// Get timestamp
const timestampMatch = content.match(/Generated: (\d{4}-\d{2}-\d{2}T[\d:\.]+Z)/);
const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';

// Count wavetables
const kickMatch = content.match(/"kick":\s*\{[^}]+"wa_808tape_kick_01_clean"/);
const clapMatch = content.match(/"clap":\s*\{[^}]+"wa_808tape_clap_01_clean"/);

// Get file size
const stats = fs.statSync(workletPath);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('🔍 Wavetable Verification Report');
console.log('================================');
console.log(`File: ${workletPath}`);
console.log(`Size: ${fileSizeMB} MB`);
console.log(`Generated: ${timestamp}`);
console.log('');
console.log('Checks:');
console.log(`  ✓ Has wavetables object: ${hasWavetables ? 'YES' : 'NO'}`);
console.log(`  ✓ Has kick sample: ${hasKick ? 'YES' : 'NO'}`);
console.log(`  ✓ Processed with okwt: ${hasOkwtComment ? 'YES' : 'NO'}`);
console.log('');

if (hasWavetables && hasKick && hasOkwtComment) {
    console.log('✅ All checks passed! Wavetables are in the built file.');
    console.log('');
    console.log('⚠️  If sounds haven\'t changed, try:');
    console.log('   1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)');
    console.log('   2. Clear browser cache');
    console.log('   3. Restart dev server');
    console.log('   4. Check browser console for debug logs');
} else {
    console.log('❌ Some checks failed! Rebuild the worklet:');
    console.log('   node scripts/build-worklet.js');
}

