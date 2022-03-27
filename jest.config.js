module.exports = {

	globals: {
		'ts-jest': {
			useESM: true
		}
	},
	preset: 'jest-puppeteer',
	setupFilesAfterEnv: [ 'expect-puppeteer' ],
	testRegex: '(/tests/)(.*?)(Tests?)(\\.ts|\\.js)$',
	transform: {
		'^.+\\.ts?$': 'ts-jest'
	},
	transformIgnorePatterns: [
		'node_modules[/\\\\]'
	],
	moduleFileExtensions: [ 'ts', 'tsx', 'js' ]

};
