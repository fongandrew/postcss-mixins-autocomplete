const esbuild = require('esbuild');

const baseConfig = {
	entryPoints: ['./src/extension.ts'],
	bundle: true,
	outfile: 'out/extension.js',
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	sourcemap: true,
	minify: process.env.NODE_ENV === 'production',
};

// Build for production
if (process.argv.includes('--production')) {
	esbuild.buildSync({
		...baseConfig,
		minify: true,
	});
}

// Watch mode
else if (process.argv.includes('--watch')) {
	esbuild
		.context({
			...baseConfig,
		})
		.then((ctx) => {
			ctx.watch();
		});
}
// Regular build
else {
	esbuild.buildSync(baseConfig);
}
