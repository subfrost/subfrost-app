#!/usr/bin/env node

/**
 * Clear all caches script
 * Run this to clear localStorage, browser cache, and other cached data
 */

console.log('🧹 Cache Clearing Guide');
console.log('='.repeat(50));
console.log('\n1. Clear localStorage (including pending wraps):');
console.log('   - Open browser DevTools (F12)');
console.log('   - Go to Application > Local Storage');
console.log('   - Right-click on your domain > Clear');
console.log('   - Or run in console: localStorage.clear()');

console.log('\n2. Clear React Query cache:');
console.log('   - Already handled on page refresh');

console.log('\n3. Clear browser cache:');
console.log('   - Chrome/Edge: Ctrl+Shift+Delete > Clear browsing data');
console.log('   - Or: DevTools > Network tab > Disable cache checkbox');
console.log('   - Or: Hard reload with Ctrl+Shift+R');

console.log('\n4. Clear Next.js cache:');
console.log('   - Run: rm -rf .next');

console.log('\n5. Restart dev server:');
console.log('   - Stop current server (Ctrl+C)');
console.log('   - Run: npm run dev');

console.log('\n✅ Quick cleanup commands:');
console.log('   npm run clean-cache (if configured)');
console.log('   Or manually: rm -rf .next && npm run dev');

console.log('\n📝 Don\'t forget to:');
console.log('   - Open DevTools console and run: localStorage.clear()');
console.log('   - Do a hard refresh (Ctrl+Shift+R) after server restarts');
console.log('='.repeat(50));
