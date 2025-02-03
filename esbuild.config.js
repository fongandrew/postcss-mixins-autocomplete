const esbuild = require('esbuild');
const glob = require('glob');

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
	outfile: 'out/extension.js',
	minify: process.env.NODE_ENV === 'production',
};

const testConfig = {
	...baseConfig,
	entryPoints: glob.sync('./src/**/*.test.ts'),
	outdir: 'out',
	minify: false,
};

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
else if (process.argv.includes('--tests')) {
	esbuild.buildSync(testConfig);
}

// Regular build
else {
	esbuild.buildSync(mainConfig);
}
