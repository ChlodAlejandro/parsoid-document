// ParsoidDocument:start
/**
 * The root of this wiki's RestBase endpoint.
 */
const restBaseRoot = ( window as any ).restBaseRoot || '/api/rest_v1';

/**
 * Encodes text for an API parameter. This performs both an encodeURIComponent
 * and a string replace to change spaces into underscores.
 *
 * @param {string} text
 * @return {string}
 */
function encodeAPIComponent( text: string ): string {
	return encodeURIComponent( text.replace( / /g, '_' ) );
}

/**
 * Clones a regular expression.
 *
 * @param regex The regular expression to clone.
 * @return A new regular expression object.
 */
function cloneRegex( regex: RegExp ): RegExp {
	return new RegExp(
		regex.source,
		regex.flags
	);
}

/**
 * A class denoting a transclusion template node (a transcluded template, barring any included
 * text or inline parameters) inside an element with [typeof="mw:Transclusion"].
 */
class ParsoidTransclusionTemplateNode {

	/**
	 * The HTMLElement that contains this template.
	 */
	public readonly originalElement: HTMLElement;
	/**
	 * This template's data. This is the value for `template` for this specific "part" in the
	 * `data-mw`.
	 */
	public readonly data: any;
	/**
	 * The `i` property of this specific node.
	 */
	public readonly i: number;

	/**
	 * Whether to automatically save parameter and target changes or not.
	 */
	public readonly autosave: boolean;

	/**
	 * Create a new ParsoidTransclusionTemplateNode.
	 *
	 * @param {HTMLElement} originalElement
	 *     The original element where the `data-mw` of this node is found.
	 * @param {*} data
	 *     The `data-mw` `part.template` of this node.
	 * @param {number} i
	 *     The `i` property of this node.
	 * @param {boolean} autosave
	 *     Whether to automatically save parameter and target changes or not.
	 */
	constructor( originalElement: HTMLElement, data: any, i: number, autosave = true ) {
		this.originalElement = originalElement;
		this.data = data;
		this.i = i;
		this.autosave = autosave;
	}

	/**
	 * Gets the target of this node.
	 *
	 * @return {Object} The target of this node, in wikitext and href (for links).
	 */
	getTarget(): { wt: string, href: string } {
		return this.data.target;
	}

	/**
	 * Sets the target of this template (in wikitext).
	 *
	 * @param {string} wikitext
	 *   The target template (in wikitext, e.g. `Test/{{FULLPAGENAME}}`).
	 */
	setTarget( wikitext: string ): void {
		this.data.target = wikitext;
		if ( this.autosave ) {
			this.save();
		}
	}

	/**
	 * Gets the parameters of this node.
	 *
	 * @return {Object.<string, {wt: string}>} The parameters of this node, in wikitext.
	 */
	getParameters(): { [key: string]: { wt: string } } {
		return this.data.params;
	}

	/**
	 * Gets the value of a parameter.
	 *
	 * @param {string} key The key of the parameter to check.
	 * @return {string} The parameter value.
	 */
	getParameter( key: string ): string {
		return this.data.params[ key ].wt;
	}

	/**
	 * Sets the value for a specific parameter.
	 *
	 * @param {string} key The parameter key to set.
	 * @param {string} value The new value of the parameter.
	 */
	setParameter( key: string, value: string ): void {
		this.data.params[ key ] = { wt: value };
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
	 * Saves this node (including modifications) back into its element.
	 */
	save() {
		this.cleanup();

		const existingData = JSON.parse( this.originalElement.getAttribute( 'data-mw' ) );
		existingData.parts.find(
			( part: any ) => part.template?.i === this.i
		).template = this.data;
		this.originalElement.setAttribute( 'data-mw', JSON.stringify( existingData ) );
	}

}

/**
 * A class containing an {@link HTMLIFrameElement} along with helper functions
 * to make manipulation easier.
 */
class ParsoidDocument extends EventTarget {

	/**
	 * A blank Parsoid document, with a section 0.
	 *
	 * @type {string}
	 */
	static blankDocument = '<html><body><section data-mw-section-id="0"></section></body></html>';
	/**
	 * The default document to create if a page was not found.
	 *
	 * @type {string}
	 */
	static defaultDocument = ParsoidDocument.blankDocument;

	/**
	 * The {@link Document} object of the iframe.
	 *
	 * @protected
	 */
	protected document: Document;
	/**
	 * The {@link JQuery} object of the iframe.
	 *
	 * @protected
	 */
	protected $document: JQuery<Document>;
	/**
	 * The frame element used by this ParsoidDocument instance.
	 *
	 * @protected
	 */
	protected iframe: HTMLIFrameElement;
	/**
	 * A MutationObserver that watches the document for DOM changes.
	 *
	 * @protected
	 */
	protected observer: MutationObserver;
	/**
	 * The page currently loaded.
	 *
	 * @type {string}
	 */
	protected page: string;
	/**
	 * The ETag of the loaded Parsoid document.
	 *
	 * @protected
	 */
	protected etag: string;
	/**
	 * `true` if the page exists on the wiki.
	 *
	 * @protected
	 */
	protected fromExisting: boolean;

	/**
	 * A set of element arrays indexed by their MediaWiki RDFa type. For example, this array
	 * may include the key "Transclusion" from the RDFa type "mw:Transclusion".
	 *
	 * @protected
	 */
	protected elementIndex: { [key: string]: HTMLElement[] };

	/**
	 * Create a new ParsoidDocument instance from a page on-wiki.
	 *
	 * @param {string} page The page to load.
	 * @param {Object} options Options for frame loading.
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
	 *
	 * @param {string} page The name of the page.
	 * @param {string} html The HTML to use.
	 * @param {boolean} wrap Set to `false` to avoid wrapping the HTML within the body.
	 */
	static async fromHTML(
		page: string,
		html: string,
		wrap = true
	): Promise<ParsoidDocument> {
		const doc = new ParsoidDocument();
		await doc.loadHTML( page, wrap ? ParsoidDocument.blankDocument : html );
		if ( wrap ) {
			doc.document.getElementsByTagName( 'body' )[ 0 ].innerHTML = html;
		}

		return doc;
	}

	/**
	 * Creates a new ParsoidDocument from a blank page.
	 *
	 * @param {string} page The name of the page.
	 */
	static async fromBlank( page: string ) {
		const doc = new ParsoidDocument();
		await doc.loadHTML( page, ParsoidDocument.blankDocument );

		return doc;
	}

	/**
	 * Creates a new ParsoidDocument from wikitext.
	 *
	 * @param {string} page The page of the document.
	 * @param {string} wikitext The wikitext to load.
	 */
	static async fromWikitext( page: string, wikitext: string ) {
		const doc = new ParsoidDocument();
		await doc.loadWikitext( page, wikitext );

		return doc;
	}

	/**
	 * Create a new ParsoidDocument instance.
	 */
	protected constructor() {
		super();

		this.iframe = document.createElement( 'iframe' );
		this.iframe.id = 'coordinatorFrame';
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
			 *
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
		} );

		document.getElementsByTagName( 'body' )[ 0 ].appendChild( this.iframe );
	}

	/**
	 * Set up a JQuery object for this window.
	 *
	 * @param $doc The JQuery object to set up.
	 * @return The JQuery object.
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
			 *
			 * @param {HTMLElement} element Element to process.
			 * @return The transclusion parts.
			 */
			function process(
				element: HTMLElement
			): ( string | ParsoidTransclusionTemplateNode )[] {
				const rootNode = doc.findParsoidNode( element );
				const mwData = JSON.parse( rootNode.getAttribute( 'data-mw' ) );

				return mwData.parts.map( ( part: any ) => {
					if ( part.template ) {
						return new ParsoidTransclusionTemplateNode(
							rootNode, part.template, part.template.i
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
	 *
	 * @param {Error} error An error object.
	 */
	notifyLoadError( error: Error ): void {
		if ( mw.notify ) {
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
	 *
	 * @param {string} page The page to load.
	 *
	 * @param {Object} options Options for frame loading.
	 * @param {boolean} options.reload
	 *   Whether the current page should be discarded and reloaded.
	 * @param options.allowMissing
	 *   Set to `false` to avoid loading a blank document if the page does not exist.
	 */
	async loadPage( page: string, options: {
		reload?: boolean,
		allowMissing?: boolean
	} = {} ): Promise<void> {
		if ( this.document && options.reload !== true ) {
			throw new Error( 'Attempted to reload an existing frame.' );
		}

		return fetch(
			`${restBaseRoot}/page/html/${
				encodeAPIComponent( page )
			}?stash=true&t=${
				Date.now()
			}`, {
				cache: 'no-cache'
			}
		)
			.then( ( data ) => {
				/**
				 * The ETag of this iframe's content.
				 *
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
	 *
	 * @param {string} page The page title of this document.
	 * @param {string} wikitext The wikitext to load.
	 */
	async loadWikitext( page: string, wikitext: string ) {
		return fetch(
			`${restBaseRoot}/transform/wikitext/to/html/${
				encodeAPIComponent( page )
			}?t=${
				Date.now()
			}`, {
				cache: 'no-cache',
				method: 'POST',
				body: ( (): FormData => {
					const formData = new FormData();
					formData.set( 'wikitext', wikitext );
					formData.set( 'body_only', 'false' );
					return formData;
				} )()
			}
		)
			.then( ( data ) => {
				/**
				 * The ETag of this iframe's content.
				 *
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
	 *
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
			} );
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
	 * Clears the frame for a future reload.
	 */
	reset() {
		this.page = undefined;
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
	 * Finds a template in the loaded document.
	 *
	 * @param {string|RegExp} templateName The name of the template to look for.
	 * @param {boolean} hrefMode Use the href instead of the wikitext to search for templates.
	 * @return {HTMLElement} A list of elements.
	 */
	findTemplate(
		templateName: string | RegExp, hrefMode = false
	): ParsoidTransclusionTemplateNode[] {
		if ( this.document == null ) {
			throw new Error( "Can't perform operations without a loaded page." );
		}

		const templates = this.elementIndex.Transclusion;
		if ( templates.length === 0 ) {
			return [];
		}

		return templates.map( ( node ): ParsoidTransclusionTemplateNode[] => {
			const mwData = JSON.parse( node.getAttribute( 'data-mw' ) );
			const matching = mwData.parts.filter(
				( part: any ) => {
					if ( part.template == null ) {
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
						node, part.template, part.template.i
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
	 *
	 * @param {HTMLElement} element
	 *   The element to find the parent of. This must be a member of the
	 *   ParsoidDocument's document.
	 * @return {HTMLElement} The element responsible for showing the given element.
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
	 * Converts the contents of this document to wikitext.
	 *
	 * @return {Promise<string>} The wikitext of this document.
	 */
	async toWikitext() {
		let target = `${restBaseRoot}/transform/html/to/wikitext/${
			encodeAPIComponent( this.page )
		}`;
		if ( this.fromExisting ) {
			target += `/${+( /(\d+)$/.exec(
				this.document.documentElement.getAttribute( 'about' )
			)[ 1 ] )}`;
		}
		return fetch(
			target,
			{
				method: 'POST',
				headers: {
					'If-Match': this.fromExisting ? this.etag : undefined
				},
				body: ( () => {
					const data = new FormData();
					data.set( 'html', this.document.documentElement.outerHTML );
					data.set( 'scrub_wikitext', 'true' );
					data.set( 'stash', 'true' );

					return data;
				} )()
			}
		).then( ( data ) => data.text() );
	}

	/**
	 * Get the {@link Document} object of this ParsoidDocument.
	 *
	 * @return {Document} {@link ParsoidDocument#document}
	 */
	getDocument(): Document {
		return this.document;
	}

	/**
	 * Get the JQuery object associated with this ParsoidDocument.
	 *
	 * @return {*} {@link ParsoidDocument#$document}
	 */
	getJQuery(): JQuery<Document> {
		return this.$document;
	}

	/**
	 * Get the IFrame element of this ParsoidDocument.
	 *
	 * @return {HTMLIFrameElement} {@link ParsoidDocument#iframe}
	 */
	getIframe(): HTMLIFrameElement {
		return this.iframe;
	}

	/**
	 * Get the page name of the currently-loaded page.
	 *
	 * @return {string} {@link ParsoidDocument#page}
	 */
	getPage(): string {
		return this.page;
	}

	/**
	 * Get the element index of this ParsoidDocument.
	 *
	 * @return {Object.<string, HTMLElement[]>} {@link ParsoidDocument#elementIndex}
	 */
	getElementIndex(): { [p: string]: HTMLElement[] } {
		return this.elementIndex;
	}

	/**
	 * Check if this element exists on-wiki or not.
	 *
	 * @return {boolean} {@link ParsoidDocument#fromExisting}
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
