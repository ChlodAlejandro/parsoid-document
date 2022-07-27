import ParsoidDocument from '../src/ParsoidDocument.module';

declare global {
	interface Window {
		testDocuments: Record<string, ParsoidDocument>;
		ParsoidDocument: typeof ParsoidDocument;
	}
}

jest.setTimeout( 60000 );

describe( 'English Wikipedia', () => {

	beforeAll( async () => {
		await page.goto( 'https://en.wikipedia.org/wiki/Wikipedia:Sandbox' );
		await page.addScriptTag( { path: './build/ParsoidDocument.js' } );

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

				return doc.getDocument() != null;
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

				return doc.getDocument() != null;
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

				return doc.getDocument() != null;
			} ) ).toBe( true );
		} );

		test( 'ParsoidDocument load from HTML', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.html = await window.ParsoidDocument.fromBlank(
					'Project:ThisPageShouldBeMissing/' +
					Math.random().toString().replace( '.', '' )
				);

				return doc.getDocument() != null;
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

				return doc.getDocument() != null;
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

	describe( 'Parsoid document manipulation tests', () => {

		test( 'Mutate existing page document', async () => {
			await page.evaluate( () => {
				const doc = window.testDocuments.default;

				const elP = document.createElement( 'p' );
				elP.innerText = 'This is test content!';
				doc.getSection( 0 ).appendChild( elP );
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
				doc.getSection( 0 ).appendChild( elP );
			} );

			await expect( ( await page.evaluate( async () => {
				const doc = window.testDocuments.blank;
				return doc.toWikitext();
			} ) ).trim() ).toBe( 'This is test content!' );
		} );

		test( 'Template insertion from constructed node', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromBlank( 'Wikipedia:Sandbox' );

				const node1 = await window.ParsoidDocument.Node.fromNew(
					doc, 'X1', {
						foo: 'bar',
						baz: 'qux'
					}
				);
				const node2 = await window.ParsoidDocument.Node.fromNew(
					doc, 'X2', {
						foo: 'bar',
						baz: 'qux'
					}
				);
				doc.getSection( 0 ).appendChild( node1.element );
				node1.element.insertAdjacentElement( 'beforebegin', node2.element );

				return doc.toWikitext();
			} ) ).trim() ).toBe( '{{X2|foo=bar|baz=qux}}{{X1|foo=bar|baz=qux}}' );
		} );

		test( 'Template insertion from document element', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromBlank( 'Wikipedia:Sandbox' );

				const elSpan = document.createElement( 'span' );
				elSpan.setAttribute( 'typeof', 'mw:Transclusion' );
				elSpan.setAttribute( 'data-mw', JSON.stringify( {
					parts: [
						{
							template: {
								target: { wt: 'X1', href: './Template:X1' },
								params: {
									foo: {
										wt: 'bar'
									},
									baz: {
										wt: 'qux'
									}
								},
								i: 0
							}
						},
						'text',
						{
							template: {
								target: { wt: 'X2', href: './Template:X2' },
								params: {
									foo: {
										wt: 'bar'
									},
									baz: {
										wt: 'qux'
									}
								},
								i: 2
							}
						}
					]
				} ) );
				doc.getSection( 0 ).appendChild( elSpan );

				return doc.toWikitext();
			} ) ).trim() ).toBe( '{{X1|foo=bar|baz=qux}}text{{X2|foo=bar|baz=qux}}' );
		} );

		test( 'Template destruction', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromWikitext(
					'Wikipedia:Sandbox',
					'{{collapse top}}\ntext\n{{X1}}\nbottom text\n{{collapse bottom}}'
				);

				const x1 = doc.findTemplate( 'X1' )[ 0 ];
				x1.destroy();

				return doc.toWikitext();
			} ) ).trim().replace( /\r\n/g, '\n' ) ).toBe(
				'{{collapse top}}\ntext\n\nbottom text\n{{collapse bottom}}'
			);
		} );

		test( 'Template destruction (eraseLine = true)', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromWikitext(
					'Wikipedia:Sandbox',
					'{{collapse top}}\ntext\n{{X1}}\nbottom text\n{{collapse bottom}}'
				);

				const x1 = doc.findTemplate( 'X1' )[ 0 ];
				x1.destroy( true );

				return doc.toWikitext();
			} ) ).trim().replace( /\r\n/g, '\n' ) ).toBe(
				'{{collapse top}}\ntext\nbottom text\n{{collapse bottom}}'
			);
		} );

	} );

	describe( 'MutationObserver-based index rebuilding', () => {

		test( 'Mutate existing page document', async () => {
			await page.evaluate( () => {
				const doc = window.testDocuments.default;

				// Modify Parsoid DOM with standard DOM manipulation functions.
				const elSpan = doc.getDocument().createElement( 'span' );
				elSpan.setAttribute( 'about', 'N' + Math.floor( Math.random() * 100 ) );
				elSpan.setAttribute( 'typeof', 'mw:Transclusion' );
				elSpan.setAttribute( 'data-mw', JSON.stringify( {
					parts: [ {
						template: {
							target: { wt: 'T\n', href: './Template:T' },
							params: {
								foo: {
									wt: '1'
								},
								bar: {
									wt: '1'
								}
							},
							i: 0
						}
					} ]
				} ) );
				( window as any ).test0 = elSpan;

				doc.getSection( 0 ).appendChild( elSpan );
			} );

			await expect( await page.evaluate( async () => {
				const doc = window.testDocuments.default;
				return doc.findTemplate( 'T' ) != null;
			} ) ).toBe( true );
		} );

	} );

} );
