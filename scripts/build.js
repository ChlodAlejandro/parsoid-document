const path = require( 'path' );
const childProcess = require( 'child_process' );
const fs = require( 'fs' );

( async () => {

	const tscPath = path.resolve(
		__dirname, '..', 'node_modules', '.bin',
		process.platform.startsWith( 'win' ) ? 'tsc.cmd' : 'tsc'
	);

	const child = childProcess.spawn( tscPath );
	child.stdout.on( 'data', ( data ) => {
		console.log( data.toString() );
	} );
	child.stderr.on( 'data', ( data ) => {
		console.error( data.toString() );
	} );
	await new Promise( ( res ) => {
		child.on( 'exit', () => {
			res();
		} );
	} );

	const buildFolder = path.resolve( __dirname, '..', 'build' );
	const moduleJsFile = fs.readFileSync(
		path.resolve( buildFolder, 'ParsoidDocument.module.js' )
	).toString( 'utf8' );

	const browserJsHeader = fs.readFileSync(
		path.resolve( __dirname, 'header.js' )
	).toString( 'utf8' );
	const browserJsFooter = fs.readFileSync(
		path.resolve( __dirname, 'footer.js' )
	).toString( 'utf8' );
	const browserJsFile = browserJsHeader.trim() +
		'\n( () => {\n' +
		moduleJsFile
			// Strip everything before start
			.replace( /[\s\S]*\/\/\s*ParsoidDocument:start\s*/, '' )
			// Strip everything after end
			.replace( /\s*\/\/\s*ParsoidDocument:end[\s\S]*/, '' )
			// Remove the exports declaration line
			.replace( /^Object\.defineProperty\(exports.+$/m, '' )
			// Indent all by 1 tab
			.replace( /^(.+)$/gm, '    $1' ) +
		'\n' +
		'\n    window.ParsoidDocument = ParsoidDocument;' +
		'\n} )();\n' +
		browserJsFooter.trim();

	fs.writeFileSync( path.resolve( buildFolder, 'ParsoidDocument.js' ), browserJsFile );

} )();
