import eslint from '@eslint/js';
import * as tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
        files: ["**/*.ts"],
		ignores: ['dist/**/*', 'node_modules/**/*', '.*/**/*'],
        linterOptions: {
			reportUnusedDisableDirectives: true,
		},
		plugins: {
			prettier: prettierPlugin,
		}
	},

	eslint.configs.recommended,
    tseslint.configs.recommended,
	tseslint.configs.stylistic,
    eslintConfigPrettier,

	{
		rules: {
			// Prettier rules need to be explicitly turned on
			'prettier/prettier': ['error', {
				// So this doesn't blow up on Windows CI
				'endOfLine': 'auto',
			}],

			// Overrides
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			]
		}
	}
);
