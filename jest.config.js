/**
 * @type {import("@jest/types").Config.InitialOptions}
 */
module.exports = {

	bail: true,
	preset: 'jest-puppeteer',
	setupFilesAfterEnv: [ 'expect-puppeteer' ],
	testRegex: '(/tests/)(.*?)(Tests?)(\\.ts|\\.js)$',
	extensionsToTreatAsEsm: [ '.ts' ],
	moduleNameMapper: {
		axios: '<rootDir>/node_modules/axios/dist/node/axios.cjs',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	transform: {
		'^.+\\.ts?$': [
			'ts-jest', {
				tsconfig: './tsconfig.tests.json',

				useESM: true
			}
		]
	},
	transformIgnorePatterns: [
		'node_modules[/\\\\]'
	],
	moduleFileExtensions: [ 'ts', 'tsx', 'js' ]

};
