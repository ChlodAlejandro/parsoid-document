// ParsoidDocument:start

/**
 * Encodes text for an API parameter. This performs both an encodeURIComponent
 * and a string replace to change spaces into underscores.
 * @param {string} text
 * @returns {string}
 */
function encodeAPIComponent( text: string ): string {
	return encodeURIComponent( text.replace( / /g, '_' ) );
}

/**
 * Clones a regular expression.
 * @param regex The regular expression to clone.
 * @returns A new regular expression object.
 */
function cloneRegex( regex: RegExp ): RegExp {
	return new RegExp(
		regex.source,
		regex.flags
	);
}

interface ParsoidTransclusionTemplateInterface {
	/**
	 * The target of the transclusion. This is, in most cases, a template.
	 */
	target: {
		/**
		 * The wikitext of the transclusion. For block type transclusions, this will include
		 * the newline at the end of the string.
		 * @example "copied"
		 */
		wt: string;
		/**
		 * A URI to the template being transcluded. If generating a template or modifying the
		 * target, this can be omitted.
		 * @example "./Template:Copied"
		 */
		href?: string;
	}
	/**
	 * Parameters to the transclusion. All members of this object are objects that have a
	 * `wt` (wikitext) parameter, indicating the wikitext provided in the transclusion parameters.
	 */
	params: Record<string, { wt: string }>;
	/**
	 * For unbalanced wikitext, where multiple templates form a single element (such as {{collapse
	 * top}} and {{collapse bottom}}) wrapping text with separate `<div>` tags found in both
	 * templates. Since Parsoid is only able to attach attributes to a single element, it cannot
	 * attach metadata on an element that spans multiple transclusions. In such a case, an `i` will
	 * be provided. This is the template node's index in the block of content. For the most part,
	 * you wouldn't need to touch this, as ParsoidDocument will automatically save to the correct
	 * index.
	 */
	i: number;
}

/**
 * A class denoting a transclusion template node (a transcluded template, barring any included
 * text or inline parameters) inside an element with [typeof="mw:Transclusion"].
 */
class ParsoidTransclusionTemplateNode {

	/**
	 * The ParsoidDocument handling this node.
	 */
	public readonly parsoidDocument: ParsoidDocument;
	/**
	 * The HTMLElement that contains this template.
	 */
	public readonly element: HTMLElement;
	/**
	 * This template's data. This is the value for `template` for this specific "part" in the
	 * `data-mw`.
	 */
	public readonly data: ParsoidTransclusionTemplateInterface;
	/**
	 * The `i` property of this specific node.
	 */
	public readonly i: number;

	/**
	 * Whether to automatically save parameter and target changes or not.
	 */
	public readonly autosave: boolean;

	/**
	 * Creates a new ParsoidTransclusionTemplateNode. Can be used later on to add a template
	 * into wikitext. To have this node show up in wikitext, append the node's element (using
	 * {@link ParsoidTransclusionTemplateNode.element}) to the document of a ParsoidDocument.
	 * @param document The document used to generate this node.
	 * @param template The template to create. If you wish to generate wikitext as a block-type
	 *   transclusion (as long as a format is not provided through TemplateData), append a "\n"
	 *   to the end of the template name.
	 * @param parameters The parameters to the template.
	 * @param autosave
	 * @returns A new ParsoidTransclusionTemplateNode.
	 */
	static fromNew(
		document: ParsoidDocument,
		template: string,
		parameters?: Record<string, string | { toString(): string } >,
		autosave?: boolean
	): ParsoidTransclusionTemplateNode {
		const el = document.getDocument().createElement( 'span' );

		const target: ParsoidTransclusionTemplateInterface['target'] = { wt: template };
		if ( mw?.Title ) {
			// If `mediawiki.Title` is loaded, use it.
			target.href = './' + new mw.Title(
				target.wt,
				mw.config.get( 'wgNamespaceIds' ).template
			).getPrefixedDb();
		}

		const data = {
			target,
			params: <Record<string, { wt: string }>>{},
			i: 0
		};

		for ( const param in ( parameters ?? {} ) ) {
			const value = parameters[ param ];
			data.params[ param ] = {
				wt: typeof value === 'string' ? value : value.toString()
			};
		}

		el.setAttribute( 'typeof', 'mw:Transclusion' );
		el.setAttribute( 'data-mw', JSON.stringify( {
			parts: [ {
				template: data
			} ]
		} ) );
		return new ParsoidTransclusionTemplateNode(
			document, el, data, data.i, autosave
		);
	}

	/**
	 * Create a new ParsoidTransclusionTemplateNode.
	 * @param parsoidDocument
	 *     The document handling this transclusion node.
	 * @param originalElement
	 *     The original element where the `data-mw` of this node is found.
	 * @param data
	 *     The `data-mw` `part.template` of this node.
	 * @param i
	 *     The `i` property of this node.
	 * @param autosave
	 *     Whether to automatically save parameter and target changes or not.
	 */
	constructor(
		parsoidDocument: ParsoidDocument,
		originalElement: HTMLElement,
		data: any,
		i: number,
		autosave = true
	) {
		this.parsoidDocument = parsoidDocument;
		this.element = originalElement;
		this.data = data;
		this.i = i;
		this.autosave = autosave;
	}

	/**
	 * Gets the target of this node.
	 * @returns {object} The target of this node, in wikitext and href (for links).
	 */
	getTarget(): { wt: string, href?: string } {
		return this.data.target;
	}

	/**
	 * Sets the target of this template (in wikitext).
	 * @param {string} wikitext
	 *   The target template (in wikitext, e.g. `Test/{{FULLPAGENAME}}`).
	 */
	setTarget( wikitext: string ): void {
		this.data.target.wt = wikitext;
		if ( mw?.Title ) {
			// If `mediawiki.Title` is loaded, use it.
			this.data.target.href = './' + new mw.Title(
				wikitext,
				mw.config.get( 'wgNamespaceIds' ).template
			).getPrefixedDb();
		} else {
			// Likely inaccurate. Just remove it to make sent data cleaner.
			delete this.data.target.href;
		}

		if ( this.autosave ) {
			this.save();
		}
	}

	/**
	 * Gets the parameters of this node.
	 * @returns {{[key:string]:{wt:string}}} The parameters of this node, in wikitext.
	 */
	getParameters(): { [key: string]: { wt: string } } {
		return this.data.params;
	}

	/**
	 * Checks if a template has a parameter.
	 * @param {string} key The key of the parameter to check.
	 * @returns {boolean} `true` if the template has the given parameter
	 */
	hasParameter( key: string ): boolean {
		return this.data.params[ key ] != null;
	}

	/**
	 * Gets the value of a parameter.
	 * @param {string} key The key of the parameter to check.
	 * @returns {string} The parameter value.
	 */
	getParameter( key: string ): string {
		return this.data.params[ key ]?.wt;
	}

	/**
	 * Sets the value for a specific parameter. If `value` is null or undefined,
	 * the parameter is removed.
	 * @param {string} key The parameter key to set.
	 * @param {string} value The new value of the parameter.
	 */
	setParameter( key: string, value: string ): void {
		if ( value != null ) {
			this.data.params[ key ] = { wt: value };

			if ( this.autosave ) {
				this.save();
			}
		} else {
			this.removeParameter( key );
		}
	}

	/**
	 * Removes a parameter from the template.
	 * @param key The parameter key to remove.
	 */
	removeParameter( key: string ): void {
		if ( this.data.params[ key ] != null ) {
			delete this.data.params[ key ];
		}

		if ( this.autosave ) {
			this.save();
		}
	}

	/**
	 * Fix improperly-set parameters.
	 */
	cleanup() {
		for ( const key of Object.keys( this.data.params ) ) {
			const param = this.data.params[ key ];
			if ( typeof param === 'string' ) {
				this.data.params[ key ] = {
					wt: param
				};
			}
		}
	}

	/**
	 * Removes this node from its element. This will prevent the node from being saved
	 * again.
	 * @param eraseLine For block templates. Setting this to `true` will also erase a newline
	 * that immediately succeeds this template, if one exists. This is useful in ensuring that
	 * there are no excesses of newlines in the document.
	 */
	destroy( eraseLine?: boolean ) {
		const existingData = JSON.parse( this.element.getAttribute( 'data-mw' ) );

		if ( existingData.parts.length === 1 ) {
			const nodeElements = this.parsoidDocument.getNodeElements( this );
			const succeedingTextNode = nodeElements[ nodeElements.length - 1 ]?.nextSibling;
			// The element contains nothing else except this node. Destroy the element entirely.
			this.parsoidDocument.destroyParsoidNode( this.element );

			if (
				eraseLine && succeedingTextNode &&
				succeedingTextNode.nodeType === Node.TEXT_NODE
			) {
				// Erase a starting newline, if one exists
				succeedingTextNode.nodeValue = succeedingTextNode.nodeValue
					.replace( /^\n/, '' );
			}
		} else {
			const partToRemove = existingData.parts.find(
				( part: { template: ParsoidTransclusionTemplateInterface } | any ) =>
					part.template?.i === this.i
			);
			if ( eraseLine ) {
				const iFront = existingData.parts.indexOf( partToRemove ) - 1;
				const iBack = existingData.parts.indexOf( partToRemove ) + 1;

				let removed = false;
				if (
					iBack < existingData.parts.length &&
					typeof existingData.parts[ iBack ] === 'string'
				) {
					// Attempt to remove whitespace from the string in front of the template.
					if ( /^\r?\n/.test( existingData.parts[ iBack ] ) ) {
						// Whitespace found, remove it.
						existingData.parts[ iBack ] =
							existingData.parts[ iBack ].replace( /^\r?\n/, '' );
						removed = true;
					}
				}

				if ( !removed && iFront > -1 && typeof existingData.parts[ iFront ] === 'string' ) {
					// Attempt to remove whitespace from the string behind the template.
					if ( /\r?\n$/.test( existingData.parts[ iFront ] ) ) {
						// Whitespace found, remove it.
						existingData.parts[ iFront ] =
							existingData.parts[ iFront ].replace( /\r?\n$/, '' );
					}
				}
			}
			existingData.parts.splice( existingData.parts.indexOf( partToRemove ), 1 );

			this.element.setAttribute( 'data-mw', JSON.stringify( existingData ) );
		}
	}

	/**
	 * Saves this node (including modifications) back into its element.
	 */
	save() {
		this.cleanup();

		const existingData = JSON.parse( this.element.getAttribute( 'data-mw' ) );
		existingData.parts.find(
			( part: any ) => part.template?.i === this.i
		).template = this.data;
		this.element.setAttribute( 'data-mw', JSON.stringify( existingData ) );
	}

}

/**
 * A class containing an {@link HTMLIFrameElement} along with helper functions
 * to make manipulation easier.
 */
class ParsoidDocument extends EventTarget {

	static readonly Node: typeof ParsoidTransclusionTemplateNode = ParsoidTransclusionTemplateNode;
	/**
	 * A blank Parsoid document, with a section 0.
	 */
	static blankDocument = '<html><body><section data-mw-section-id="0"></section></body></html>';
	/**
	 * The default document to create if a page was not found.
	 */
	static defaultDocument = ParsoidDocument.blankDocument;

	/**
	 * The {@link Document} object of the iframe.
	 * @protected
	 */
	protected document: Document;
	/**
	 * The JQuery (window.$) object of the iframe.
	 * @protected
	 */
	protected $document: JQuery<Document>;
	/**
	 * The frame element used by this ParsoidDocument instance.
	 * @protected
	 */
	protected iframe: HTMLIFrameElement;
	/**
	 * A MutationObserver that watches the document for DOM changes.
	 * @protected
	 */
	protected observer: MutationObserver;
	/**
	 * The page currently loaded.
	 * @protected
	 */
	protected page: string;
	/**
	 * The MediaWiki REST object, responsible for making requests to this wiki's.
	 * REST API
	 * @protected
	 */
	protected rest: mw.Rest;
	/**
	 * The ETag of the loaded Parsoid document.
	 * @protected
	 */
	protected etag: string;
	/**
	 * `true` if the page exists on the wiki.
	 * @protected
	 */
	protected fromExisting: boolean;

	/**
	 * A set of element arrays indexed by their MediaWiki RDFa type. For example, this array
	 * may include the key "Transclusion" from the RDFa type "mw:Transclusion".
	 * @protected
	 */
	protected elementIndex: { [key: string]: HTMLElement[] };

	/**
	 * Create a new ParsoidDocument instance from a page on-wiki.
	 * @param {string} page The page to load.
	 * @param {object} options Options for frame loading.
	 * @param {boolean} options.reload
	 *   Whether the current page should be discarded and reloaded.
	 * @param options.allowMissing
	 *   Set to `false` to avoid loading a blank document if the page does not exist.
	 */
	static async fromPage(
		page: string,
		options: Parameters<ParsoidDocument['loadPage']>[1] = {}
	): Promise<ParsoidDocument> {
		const doc = new ParsoidDocument();
		await doc.loadPage( page, options );

		return doc;
	}

	/**
	 * Create a new ParsoidDocument instance from plain HTML.
	 * @param page The name of the page.
	 * @param html The HTML to use.
	 * @param wrap Set to `false` to avoid wrapping the HTML within the body.
	 */
	static async fromHTML(
		page: string,
		html: string,
		wrap = true
	): Promise<ParsoidDocument> {
		const doc = new ParsoidDocument();
		await doc.loadHTML(
			page,
			wrap ? ParsoidDocument.blankDocument : html
		);
		if ( wrap ) {
			doc.document.getElementsByTagName( 'body' )[ 0 ].innerHTML = html;
		}

		return doc;
	}

	/**
	 * Creates a new ParsoidDocument from a blank page.
	 * @param {string} page The name of the page.
	 */
	static async fromBlank( page: string ) {
		const doc = new ParsoidDocument();
		await doc.loadHTML( page, ParsoidDocument.blankDocument );

		return doc;
	}

	/**
	 * Creates a new ParsoidDocument from wikitext.
	 * @param {string} page The page of the document.
	 * @param {string} wikitext The wikitext to load.
	 */
	static async fromWikitext( page: string, wikitext: string ) {
		const doc = new ParsoidDocument();
		await doc.loadWikitext( page, wikitext );

		return doc;
	}

	/**
	 * Get additional request options to be patched onto RESTBase API calls.
	 * Extend this class to modify this.
	 * @protected
	 */
	protected getRequestOptions(): JQueryAjaxSettings {
		return {
			headers: {
				'Api-User-Agent': 'parsoid-document/2.0.0 (https://github.com/ChlodAlejandro/parsoid-document; chlod@chlod.net)'
			}
		};
	}

	/**
	 * @returns `true` if the page is a redirect. `false` if otherwise.
	 */
	get redirect(): boolean {
		return this.document &&
			this.document.querySelector( "[rel='mw:PageProp/redirect']" ) !== null;
	}

	/**
	 * Create a new ParsoidDocument instance.
	 * @param rest A `mw.Rest` or `mw.ForeignRest` object to use.
	 */
	protected constructor( rest?: mw.Rest ) {
		super();
		this.rest = rest ?? new mw.Rest({
			ajax: this.getRequestOptions()
		});

		this.iframe = document.createElement( 'iframe' );
		Object.assign( this.iframe.style, {
			width: '0',
			height: '0',
			border: '0',
			position: 'fixed',
			top: '0',
			left: '0'
		} );

		this.iframe.addEventListener( 'load', () => {
			if ( this.iframe.contentWindow.document.URL === 'about:blank' ) {
				// Blank document loaded. Ignore.
				return;
			}

			/**
			 * The document of this ParsoidDocument's IFrame.
			 * @type {Document}
			 * @protected
			 */
			this.document = this.iframe.contentWindow.document;
			this.$document = $( this.document );
			this.setupJquery( this.$document );
			this.buildIndex();

			if ( this.observer ) {
				// This very much assumes that the MutationObserver is still connected.
				// Yes, this is quite an assumption, but should not be a problem during normal use.
				// If only MutationObserver had a `.connected` field...
				this.observer.disconnect();
			}
			this.observer = new MutationObserver( () => {
				this.buildIndex();
			} );
			this.observer.observe( this.document.getElementsByTagName( 'body' )[ 0 ], {
				// Listen for ALL DOM mutations.
				attributes: true,
				childList: true,
				subtree: true
			} );

			// Replace the page title. Handles redirects.
			if ( this.document.title ) {
				this.page = mw?.Title ?
					new mw.Title( this.document.title ).getPrefixedText() :
					this.document.title;
			}
		} );

		document.getElementsByTagName( 'body' )[ 0 ].appendChild( this.iframe );
	}

	/**
	 * Set up a JQuery object for this window.
	 * @param $doc The JQuery object to set up.
	 * @returns The JQuery object.
	 */
	setupJquery( $doc: JQuery<Document> ): JQuery<Document> {
		// noinspection JSPotentiallyInvalidConstructorUsage
		const $proto: any = ( $doc as any ).constructor.prototype;

		/* eslint-disable-next-line @typescript-eslint/no-this-alias */
		const doc = this;
		$proto.parsoidNode = function () {
			if ( this.length === 1 ) {
				return doc.findParsoidNode( this[ 0 ] );
			} else {
				return this.map( ( node: HTMLElement ) => doc.findParsoidNode( node ) );
			}
		};
		$proto.parsoid = function () {
			/**
			 * Processes an element and extracts its transclusion parts.
			 * @param {HTMLElement} element Element to process.
			 * @returns The transclusion parts.
			 */
			function process(
				element: HTMLElement
			): ( string | ParsoidTransclusionTemplateNode )[] {
				const rootNode = doc.findParsoidNode( element );
				const mwData = JSON.parse( rootNode.getAttribute( 'data-mw' ) );

				return mwData.parts.map( ( part: any ) => {
					if ( part.template ) {
						return new ParsoidTransclusionTemplateNode(
							this, rootNode, part.template, part.template.i
						);
					} else {
						return part;
					}
				} );
			}

			if ( this.length === 1 ) {
				return process( this[ 0 ] );
			} else {
				return this.map( ( element: HTMLElement ) => process( element ) );
			}
		};

		return $doc;
	}

	/**
	 * Notify the user of a document loading error.
	 * @param {Error} error An error object.
	 */
	notifyLoadError( error: Error ): void {
		if ( mw?.notify ) {
			mw.notify( [
				( () => {
					const a = document.createElement( 'span' );
					a.innerText = 'An error occurred while loading a Parsoid document: ';
					return a;
				} )(),
				( () => {
					const b = document.createElement( 'b' );
					b.innerText = error.message;
					return b;
				} )()
			], {
				tag: 'parsoidDocument-error',
				type: 'error'
			} );
		}
		throw error;
	}

	/**
	 * Loads a wiki page with this ParsoidDocument.
	 * @param {string} page The page to load.
	 * @param {object} options Options for frame loading.
	 * @param {boolean} options.reload
	 *   Whether the current page should be discarded and reloaded.
	 * @param options.allowMissing
	 *   Set to `false` to avoid loading a blank document if the page does not exist.
	 * @param options.followRedirects
	 *   Whether to follow page redirects or not.
	 */
	async loadPage( page: string, options: {
		followRedirects?: boolean,
		reload?: boolean,
		allowMissing?: boolean
	} = {} ): Promise<void> {
		if ( this.document && options.reload !== true ) {
			throw new Error( 'Attempted to reload an existing frame.' );
		}

		const queryOptions: Record<string, any> = {};
		if (options.followRedirects === false) {
            queryOptions["redirect"] = "no";
		}
		queryOptions["t"] = Date.now();

		return this.rest.get(
			`/v1/page/${encodeAPIComponent(page)}/html`,
			queryOptions
		)
			.then( ( data ) => {
				/**
				 * The ETag of this iframe's content.
				 * @type {string}
				 */
				this.etag = data.headers.get( 'ETag' );

				if ( data.status === 404 && options.allowMissing !== false ) {
					this.fromExisting = false;
					// A Blob is used in order to allow cross-frame access without changing
					// the origin of the frame.
					return Promise.resolve( ParsoidDocument.defaultDocument );
				} else {
					this.fromExisting = true;

					return data.text();
				}
			} )
			.then( ( html ) => this.loadHTML( page, html ) )
			.catch( this.notifyLoadError );
	}

	/**
	 * Load a document from wikitext.
	 * @param {string} page The page title of this document.
	 * @param {string} wikitext The wikitext to load.
	 */
	async loadWikitext( page: string, wikitext: string ) {
		return this.rest.post(
			`/v1/transform/wikitext/to/html/${encodeAPIComponent( page )}`,
			{
				wikitext,
				body_only: 'false'
			}
		)
			.then( ( data ) => {
				/**
				 * The ETag of this iframe's content.
				 * @type {string}
				 */
				this.etag = data.headers.get( 'ETag' );
				this.fromExisting = false;

				return data.text();
			} )
			.then( ( html ) => this.loadHTML( page, html ) )
			.catch( this.notifyLoadError );
	}

	/**
	 * Load a document from HTML.
	 * @param {string} page The loaded page's name.
	 * @param {string} html The page's HTML.
	 */
	async loadHTML( page: string, html: string ): Promise<void> {
		// A Blob is used in order to allow cross-frame access without changing
		// the origin of the frame.
		this.iframe.src = URL.createObjectURL(
			new Blob( [ html ], { type: 'text/html' } )
		);
		this.page = page;

		return new Promise<void>( ( res ) => {
			this.iframe.addEventListener( 'load', () => {
				res();
			}, { once: true } );
		} );
	}

	/**
	 * Destroys the frame and pops it off of the DOM (if inserted).
	 * Silently fails if the frame has not yet been built.
	 */
	destroy(): void {
		if ( this.iframe && this.iframe.parentElement ) {
			this.iframe.parentElement.removeChild( this.iframe );
			this.iframe = undefined;
		}
	}

	/**
	 * Reloads the page. This will destroy any modifications made to the document.
	 */
	async reload() {
		const page = this.page;
		this.page = undefined;
		return this.loadPage( page, { reload: true } );
	}

	/**
	 * Clears the frame for a future reload. This will later permit `loadPage` and
	 * other related functions to run without the `reload` option.
	 */
	reset() {
		// Reset the page
		this.page = undefined;
		// Reset the element index
		this.elementIndex = undefined;

		// Reset DOM-related fields
		this.document = undefined;
		this.$document = undefined;
		this.etag = undefined;
		this.fromExisting = undefined;

		// Disconnect the mutation observer
		this.observer.disconnect();
		this.observer = undefined;

		// Reset the IFrame
		this.iframe.src = 'about:blank';

		// By this point, this whole thing should be a clean state.
	}

	/**
	 * Constructs the {@link ParsoidDocument#elementIndex} from the current document.
	 */
	buildIndex(): void {
		if ( this.document == null ) {
			throw new Error( "Can't perform operations without a loaded page." );
		}

		this.elementIndex = {};

		const nodes = this.document.querySelectorAll( '[typeof^=\'mw:\']' );
		nodes.forEach( ( node: HTMLElement ) => {
			node.getAttribute( 'typeof' )
				.split( /\s+/g )
				.map( ( type ) => type.replace( /^mw:/, '' ) )
				.forEach( ( type ) => {
					if ( this.elementIndex[ type ] == null ) {
						this.elementIndex[ type ] = [];
					}
					this.elementIndex[ type ].push( node );
				} );
		} );
	}

	/**
	 * Gets the `<section>` HTMLElement given a section ID.
	 * @param id The ID of the section
	 * @returns The HTMLElement of the section. If the section cannot be found, `null`.
	 */
	getSection( id: number ): HTMLElement {
		return this.document.querySelector( `section[data-mw-section-id="${id}"]` );
	}

	/**
	 * Finds a template in the loaded document.
	 * @param templateName The name of the template to look for.
	 * @param hrefMode Use the href instead of the wikitext to search for templates.
	 * @returns A list of {@link ParsoidTransclusionTemplateNode}s.
	 */
	findTemplate(
		templateName: string | RegExp, hrefMode = false
	): ParsoidTransclusionTemplateNode[] {
		if ( this.document == null ) {
			throw new Error( "Can't perform operations without a loaded page." );
		}

		const templates = this.elementIndex?.Transclusion;
		if ( templates == null || templates.length === 0 ) {
			return [];
		}

		return templates.map( ( node ): ParsoidTransclusionTemplateNode[] => {
			const mwData = JSON.parse( node.getAttribute( 'data-mw' ) );
			const matching = mwData.parts.filter(
				( part: any ) => {
					if ( part.template == null ) {
						return false;
					}
					if ( part.template.target?.href == null ) {
						// Parser function or magic word, not a template transclusion
						return false;
					}

					const compareTarget: string = part.template.target[
						hrefMode ? 'href' : 'wt'
					];
					if ( typeof templateName !== 'string' ) {
						return cloneRegex( templateName ).test( compareTarget.trim() );
					} else {
						return templateName === compareTarget.trim();
					}
				}
			);

			if ( matching.length > 0 ) {
				return matching.map( ( part: any ) => {
					return new ParsoidTransclusionTemplateNode(
						this, node, part.template, part.template.i
					);
				} );
			} else {
				return [];
			}
		} ).reduce( ( a, b ) => a.concat( b ), [] );
	}

	/**
	 * Finds the element with the "data-mw" attribute containing the element
	 * passed into the function.
	 * @param {HTMLElement} element
	 *   The element to find the parent of. This must be a member of the
	 *   ParsoidDocument's document.
	 * @returns {HTMLElement} The element responsible for showing the given element.
	 */
	findParsoidNode( element: HTMLElement ): HTMLElement {
		let pivot = element;
		while ( pivot.getAttribute( 'about' ) == null ) {
			if ( pivot.parentElement == null ) {
				// Dead end.
				throw new Error( 'Reached root of DOM while looking for original Parsoid node.' );
			}
			pivot = pivot.parentElement;
		}
		return this.document.querySelector(
			`[about="${pivot.getAttribute( 'about' )}"][data-mw]`
		);
	}

	/**
	 * Get HTML elements that are associated to a specific Parsoid node using its
	 * `about` attribute.
	 * @param node The node to get the elements of
	 * @returns All elements that match the `about` of the given node.
	 */
	getNodeElements( node: HTMLElement | ParsoidTransclusionTemplateNode ): HTMLElement[] {
		return Array.from(
			this.document.querySelectorAll(
				`[about="${
					( node instanceof ParsoidTransclusionTemplateNode ? node.element : node )
						.getAttribute( 'about' )
				}"]`
			)
		);
	}

	/**
	 * Deletes all elements that have the same `about` attribute as the given element.
	 * This effectively deletes an element, be it a transclusion set, file, section,
	 * or otherwise.
	 * @param element
	 */
	destroyParsoidNode( element: HTMLElement ): void {
		if ( element.hasAttribute( 'about' ) ) {
			this.getNodeElements( element ).forEach( ( nodeElement ) => {
				nodeElement.parentElement.removeChild( nodeElement );
			} );
		} else {
			// No "about" attribute. Just remove that element only.
			element.parentElement.removeChild( element );
		}
	}

	/**
	 * Converts the contents of this document to wikitext.
	 * @returns The wikitext of this document.
	 */
	async toWikitext() {
		let target = `/v1/transform/html/to/wikitext/${
			encodeAPIComponent( this.page )
		}`;
		if ( this.fromExisting ) {
			target += `/${+( /(\d+)$/.exec(
				this.document.documentElement.getAttribute( 'about' )
			)[ 1 ] )}`;
		}
		return this.rest.post(
			target,
			{
				html: this.document.documentElement.outerHTML,
				scrub_wikitext: true,
				stash: true
			},
			{
				'If-Match': this.fromExisting ? this.etag : undefined
			}
		)
			.then( ( data ) => data.text() );
	}

	/**
	 * Get the {@link Document} object of this ParsoidDocument.
	 * @returns {Document} {@link ParsoidDocument#document}
	 */
	getDocument(): Document {
		return this.document;
	}

	/**
	 * Get the JQuery object associated with this ParsoidDocument.
	 * @returns {*} {@link ParsoidDocument#$document}
	 */
	getJQuery(): JQuery<Document> {
		return this.$document;
	}

	/**
	 * Get the IFrame element of this ParsoidDocument.
	 * @returns {HTMLIFrameElement} {@link ParsoidDocument#iframe}
	 */
	getIframe(): HTMLIFrameElement {
		return this.iframe;
	}

	/**
	 * Get the page name of the currently-loaded page.
	 * @returns {string} {@link ParsoidDocument#page}
	 */
	getPage(): string {
		return this.page;
	}

	/**
	 * Get the element index of this ParsoidDocument.
	 * @returns {{ [p: string]: HTMLElement[] }} {@link ParsoidDocument#elementIndex}
	 */
	getElementIndex(): { [p: string]: HTMLElement[] } {
		return this.elementIndex;
	}

	/**
	 * Check if this element exists on-wiki or not.
	 * @returns {boolean} {@link ParsoidDocument#fromExisting}
	 */
	isFromExisting(): boolean {
		return this.fromExisting;
	}

}
declare global {
	interface Window {
		ParsoidDocument: typeof ParsoidDocument;
	}
}

// ParsoidDocument:end
export default ParsoidDocument;
