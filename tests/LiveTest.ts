// eslint-disable-next-line no-unused-vars
declare interface Window {
	testDocuments: Record<string, any>;
	ParsoidDocument: any;
}

jest.setTimeout( 60000 );

describe( 'English Wikipedia', () => {

	beforeAll( async () => {
		await page.goto( 'https://en.wikipedia.org/wiki/Wikipedia:Sandbox' );
		await page.addScriptTag( { url: 'http://localhost:45000/ParsoidDocument.js' } );

		jest.setTimeout( 10000 );
	} );

	test( 'Wikipedia loaded properly', async () => {
		await expect( page ).toMatchElement( 'body.mediawiki' );
	}, 30000 );

	test( 'ParsoidDocument loaded properly', async () => {
		expect( await page.evaluate( () => {
			return window.ParsoidDocument != null;
		} ) ).toBe( true );
	} );

	describe( 'Loading and initialization tests', () => {

		beforeAll( async () => {
			await page.evaluate( () => {
				window.testDocuments = {};
			} );
		} );

		test( 'ParsoidDocument load existing page', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.default = await window.ParsoidDocument.fromPage(
					mw.config.get( 'wgPageName' )
				);

				return doc.document != null;
			} ) ).toBe( true );
			expect( await page.evaluate( () => {
				return window.testDocuments.default.isFromExisting();
			} ) ).toBe( true );
		} );

		test( 'ParsoidDocument load from missing page', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.missing = await window.ParsoidDocument.fromPage(
					'Project:ThisPageShouldBeMissing/' +
					Math.random().toString().replace( '.', '' )
				);

				return doc.document != null;
			} ) ).toBe( true );
			expect( await page.evaluate( () => {
				return window.testDocuments.missing.isFromExisting();
			} ) ).toBe( false );
		} );

		test( 'ParsoidDocument load from blank', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.blank = await window.ParsoidDocument.fromBlank(
					'Project:ThisPageShouldBeMissing/' +
					Math.random().toString().replace( '.', '' )
				);

				return doc.document != null;
			} ) ).toBe( true );
		} );

		test( 'ParsoidDocument load from HTML', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.html = await window.ParsoidDocument.fromBlank(
					'Project:ThisPageShouldBeMissing/' +
					Math.random().toString().replace( '.', '' )
				);

				return doc.document != null;
			} ) ).toBe( true );
		} );

		test( 'ParsoidDocument load from wikitext', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.wikitext =
					await window.ParsoidDocument.fromWikitext(
						'Project:ThisPageShouldBeMissing/' +
						Math.random().toString().replace( '.', '' ),
						'{{ T | X1 | foo = 1 | bar = 2 }}{{ X1 | foo = 1 | bar = 2 }}'
					);

				return doc.document != null;
			} ) ).toBe( true );
		} );

	} );

	describe( 'Parsoid template search tests', () => {

		test( 'Find {{T}} template in wikitext document', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.wikitext;
				const template = doc.findTemplate( 'T' )[ 0 ];

				return template != null &&
					template.getTarget().wt.trim() === 'T';
			} ) ).toBe( true );
		} );

		test( 'Access {{T}} template parameter in wikitext document', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.wikitext;
				const template = doc.findTemplate( 'T' )[ 0 ];

				return template != null &&
					template.getParameter( 'foo' ) === '1' &&
					template.getParameter( 'bar' ) === '2';
			} ) ).toBe( true );
		} );

		test( 'Find {{X1}} template in wikitext document', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.wikitext;
				const template = doc.findTemplate( 'X1' )[ 0 ];

				return template != null &&
					template.getTarget().wt.trim() === 'X1';
			} ) ).toBe( true );
		} );

	} );

	describe( 'Parsoid template manipulation tests', () => {

		test( 'Modify {{T}} template in wikitext document', async () => {
			await expect( await page.evaluate( async () => {
				const doc = window.testDocuments.wikitext;
				const template = doc.findTemplate( 'T' )[ 0 ];

				template.setParameter( 'foo', '5' );
				template.setParameter( 'bar', '6' );

				return doc.toWikitext();
			} ) ).toMatch( /foo\s*=\s*5\s*\|\s*bar\s*=\s*6/ );
		} );

	} );

	describe( 'Parsoid direct DOM manipulation tests', () => {

		test( 'Mutate existing page document', async () => {
			await page.evaluate( () => {
				const doc = window.testDocuments.default;

				const elP = document.createElement( 'p' );
				elP.innerText = 'This is test content!';
				doc.document.body.appendChild( elP );
			} );

			await expect( await page.evaluate( async () => {
				const doc = window.testDocuments.default;
				return doc.toWikitext();
			} ) ).toMatch( /This is test content!/ );
		} );

		test( 'Mutate blank page document', async () => {
			await page.evaluate( () => {
				const doc = window.testDocuments.blank;

				const elP = document.createElement( 'p' );
				elP.innerText = 'This is test content!';
				doc.document.body.appendChild( elP );
			} );

			await expect( ( await page.evaluate( async () => {
				const doc = window.testDocuments.blank;
				return doc.toWikitext();
			} ) ).trim() ).toBe( 'This is test content!' );
		} );

	} );

} );
