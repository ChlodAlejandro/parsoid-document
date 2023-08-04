/* eslint-disable compat/compat */
import ParsoidDocument from '../src/ParsoidDocument.module';
import axios, { AxiosResponse } from 'axios';
import 'expect-puppeteer';

declare global {
	interface Window {
		testDocuments: Record<string, ParsoidDocument>;
		ParsoidDocument: typeof ParsoidDocument;
	}
}

/**
 *
 * @param wikitext
 * @param title
 */
async function parseWikitext( wikitext: string, title = 'Wikipedia:Sandbox' ): Promise<any> {
	return await axios.post( 'https://en.wikipedia.org/w/api.php', new URLSearchParams( {
		formatversion: '2',
		format: 'json',
		action: 'parse',
		title,
		text: wikitext,
		prop: 'text',
		disablelimitreport: '1',
		disableeditsection: '1',
		preview: '1',
		disabletoc: '1'
	} ), {
		responseType: 'json'
	} ).then( ( r: AxiosResponse<any> ) => r.data );
}

jest.setTimeout( 60000 );

describe( 'English Wikipedia', () => {

	describe( 'Template content test', () => {

		test( 'X48 is blank when transcluded', async () => {
			const x48 = await parseWikitext( '{{X48}}' );
			expect( x48 ).toHaveProperty( 'parse' );
			expect( x48 ).toHaveProperty( 'parse.title' );
			expect( x48 ).toHaveProperty( 'parse.pageid' );
			expect( x48 ).toHaveProperty( 'parse.text' );
			expect( x48.parse.text ).toBe( '<div class="mw-parser-output"></div>' );
		} );

		test( 'X47 is blank when transcluded', async () => {
			const x47 = await parseWikitext( '{{X47}}' );
			expect( x47 ).toHaveProperty( 'parse' );
			expect( x47 ).toHaveProperty( 'parse.title' );
			expect( x47 ).toHaveProperty( 'parse.pageid' );
			expect( x47 ).toHaveProperty( 'parse.text' );
			expect( x47.parse.text ).toBe( '<div class="mw-parser-output"></div>' );
		} );

	} );

	beforeAll( async () => {
		jest.setTimeout( 10000 );
		
		await page.goto( 'https://en.wikipedia.org/wiki/Wikipedia:Sandbox' );
		await page.addScriptTag( { path: './build/ParsoidDocument.js' } );
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
						'{{ T | X48 | foo = 1 | bar = 2 }}{{ X48 | foo = 1 | bar = 2 }}'
					);

				return doc.getDocument() != null;
			} ) ).toBe( true );
		} );

	} );

	describe( 'Redirection and metadata handling', () => {

		test( 'Load redirect page (follow)', async () => {
			expect( await page.evaluate( async () => {
				const laptop = await window.ParsoidDocument.fromPage( '\u{1f4bb}' );

				return laptop.getPage();
			} ) ).toBe( 'Laptop' );
		} );

		test( 'Load redirect page (no-follow)', async () => {
			expect( await page.evaluate( async () => {
				const laptop = await window.ParsoidDocument.fromPage( '\u{1f4bb}', {
					followRedirects: false
				} );

				return laptop.getPage();
			} ) ).toBe( '\u{1f4bb}' );
		} );

		test( 'Redirect page check', async () => {
			expect( await page.evaluate( async () => {
				const laptop = await window.ParsoidDocument.fromPage( '\u{1f4bb}' );
				const laptopRedirect = await window.ParsoidDocument.fromPage( '\u{1f4bb}', {
					followRedirects: false
				} );

				return [ laptop.redirect, laptopRedirect.redirect ];
			} ) ).toEqual( [ false, true ] );
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

		test( 'Find {{X48}} template in wikitext document', async () => {
			expect( await page.evaluate( async () => {
				const doc = window.testDocuments.wikitext;
				const template = doc.findTemplate( 'X48' )[ 0 ];

				return template != null &&
					template.getTarget().wt.trim() === 'X48';
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
					doc, 'X48', {
						foo: 'bar',
						baz: 'qux'
					}
				);
				const node2 = await window.ParsoidDocument.Node.fromNew(
					doc, 'X47', {
						foo: 'bar',
						baz: 'qux'
					}
				);
				doc.getSection( 0 ).appendChild( node1.element );
				node1.element.insertAdjacentElement( 'beforebegin', node2.element );

				return doc.toWikitext();
			} ) ).trim() ).toBe( '{{X47|foo=bar|baz=qux}}{{X48|foo=bar|baz=qux}}' );
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
								target: { wt: 'X48', href: './Template:X48' },
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
								target: { wt: 'X47', href: './Template:X47' },
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
			} ) ).trim() ).toBe( '{{X48|foo=bar|baz=qux}}text{{X47|foo=bar|baz=qux}}' );
		} );

		test( 'Template destruction', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromWikitext(
					'Wikipedia:Sandbox',
					'{{collapse top}}\ntext\n{{X48}}\nbottom text\n{{collapse bottom}}'
				);

				const x48 = doc.findTemplate( 'X48' )[ 0 ];
				x48.destroy();

				return doc.toWikitext();
			} ) ).trim().replace( /\r\n/g, '\n' ) ).toBe(
				'{{collapse top}}\ntext\n\nbottom text\n{{collapse bottom}}'
			);
		} );

		test( 'Simple template destruction (eraseLine = true)', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromWikitext(
					'Wikipedia:Sandbox',
					'1\n{{X48}}\n4'
				);

				const x48 = doc.findTemplate( 'X48' )[ 0 ];
				x48.destroy( true );

				return doc.toWikitext();
			} ) ).trim().replace( /\r\n/g, '\n' ) ).toBe(
				'1\n4'
			);
		} );

		test( 'Complex template destruction (eraseLine = true)', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromWikitext(
					'Wikipedia:Sandbox',
					'{{collapse top}}\ntext\n{{X48}}\nbottom text\n{{collapse bottom}}'
				);

				const x48 = doc.findTemplate( 'X48' )[ 0 ];
				x48.destroy( true );

				return doc.toWikitext();
			} ) ).trim().replace( /\r\n/g, '\n' ) ).toBe(
				'{{collapse top}}\ntext\nbottom text\n{{collapse bottom}}'
			);
		} );

		test( 'Simple template destruction removes entire node', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromWikitext(
					'Wikipedia:Sandbox',
					'{{backwards copy}}'
				);

				const bc = doc.findTemplate( 'backwards copy' )[ 0 ];
				bc.destroy();

				return doc.getDocument().querySelector( '.box-backwards-copy' ) == null;
			} ) ) ).toBe(
				true
			);
		} );

		test( 'Complex template destruction removes only part of node', async () => {
			await expect( ( await page.evaluate( async () => {
				const doc = await window.ParsoidDocument.fromWikitext(
					'Wikipedia:Sandbox',
					'{{collapse top}}\ntext\n{{backwards copy}}\nbottom text\n{{collapse bottom}}'
				);

				const bc = doc.findTemplate( 'backwards copy' )[ 0 ];
				bc.destroy();

				return [
					bc.element.hasAttribute( 'data-mw' ),
					doc.getDocument().querySelector( '.box-backwards-copy' ) == null
				];
			} ) ) ).toEqual( [
				true,
				// This should be false since the tmbox element does not have any metadata that
				// can tell us that it is actually the {{backwards copy}] template.
				false
			] );
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
