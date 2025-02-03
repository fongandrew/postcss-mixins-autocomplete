const esbuild = require('esbuild');
const glob = require('glob');
const fs = require('fs');
const path = require('path');

const OUT_DIR = 'out';

const baseConfig = {
	bundle: true,
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	sourcemap: true,
};

const mainConfig = {
	...baseConfig,
	entryPoints: ['./src/extension.ts'],
	outfile: path.join(OUT_DIR, 'extension.js'),
	minify: process.env.NODE_ENV === 'production',
};

const testConfig = {
	...baseConfig,
	entryPoints: glob.sync('./src/**/*.test.ts'),
	outdir: OUT_DIR,
	minify: false,
};

// Delete the out directory before build
fs.rmSync(OUT_DIR, { recursive: true, force: true });

// Build for production
if (process.argv.includes('--production')) {
	esbuild.buildSync({
		...mainConfig,
		minify: true,
	});
}

// Watch mode
else if (process.argv.includes('--watch')) {
	esbuild
		.context({
			...mainConfig,
		})
		.then((ctx) => {
			ctx.watch();
		});
}

// Build tests
else if (process.argv.includes('--test')) {
	esbuild.buildSync(testConfig);
}

// Regular build
else {
	esbuild.buildSync(mainConfig);
}
