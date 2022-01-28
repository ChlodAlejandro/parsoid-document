/*
 * Easy-to-use and extend ES6 ParsoidDocument class for managing Parsoid-compatible HTML
 * by placing the data in an IFrame, making it accessible via DOM functions.
 *
 * Fires "parsoidDocument:load" event on load.
 *
 * This JavaScript file is used as a library. For more information, see
 * [[User:Chlod/Scripts/ParsoidDocument]]. A declaration file for TypeScript
 * can be found at [[User:Chlod/Scripts/ParsoidDocument.d.ts]]
 */
// <nowiki>
(() => {

    /**
     * Encodes text for an API parameter. This performs both an encodeURIComponent
     * and a string replace to change spaces into underscores.
     *
     * @param {string} text
     */
    function encodeAPIComponent(text) {
        return encodeURIComponent(text.replace(/ /g, "_"));
    }

    /**
     * An object containing an {@link HTMLIFrameElement} along with helper functions
     * to make manipulation easier.
     */
    class ParsoidDocument extends EventTarget {

        /**
         * The {@link Document} object of the iframe.
         * @returns {Document}
         */
        get document() {
            return this._document;
        }

        /**
         * Whether or not the frame has been built.
         * @returns {boolean}
         */
        get built() {
            return this.iframe !== undefined;
        }

        /**
         * Whether or not the frame has a page loaded.
         * @returns {boolean}
         */
        get loaded() {
            return this.page !== undefined;
        }

        /**
         * Constructs and returns the {@link HTMLIFrameElement} for this class.
         * @returns {HTMLIFrameElement}
         */
        buildFrame() {
            if (this.iframe !== undefined)
                throw "Frame already built!";

            this.iframe = document.createElement("iframe");
            this.iframe.id = "coordinatorFrame";
            Object.assign(this.iframe.style, {
                width: "0",
                height: "0",
                border: "0",
                position: "fixed",
                top: "0",
                left: "0"
            });

            this.iframe.addEventListener("load", () => {
                /**
                 * The document of this ParsoidDocument's IFrame.
                 * @type {Document}
                 * @private
                 */
                this._document = this.iframe.contentWindow.document;
            });

            return this.iframe;
        }

        /**
         * Initializes the frame. The frame must have first been built with
         * {@link buildFrame}.
         * @param {string} page The page to load.
         */
        async loadFrame(page) {
            if (this.iframe === undefined)
                throw "ParsoidDocument IFrame not yet built!";
            if (this.page !== undefined)
                throw "Page already loaded. Use `reloadFrame` to rebuilt the iframe document.";

            return fetch(`/api/rest_v1/page/html/${ encodeAPIComponent(page) }?stash=true&t=${
            	Date.now()
            }`, {
            	cache: "no-cache"
            })
                .then(data => {
                    /**
                     * The ETag of this iframe's content.
                     * @type {string}
                     */
                    this.etag = data.headers.get("ETag");

                    if (data.status === 404) {
                        console.log("[ParsoidDocument] Page not found. Using fallback HTML.");
                        // Talk page doesn't exist. Load in a dummy IFrame.
                        this.notFound = true;
                        // A Blob is used in order to allow cross-frame access without changing
                        // the origin of the frame.
                        return Promise.resolve(ParsoidDocument.defaultDocument);
                    } else {
                        return data.text();
                    }
                })
                .then(/** @param {string} html */ async (html) => {
                    // A Blob is used in order to allow cross-frame access without changing
                    // the origin of the frame.
                    this.iframe.src = URL.createObjectURL(
                        new Blob([html], {type : "text/html"})
                    );
                    /**
                     * The page currently loaded.
                     * @type {string}
                     */
                    this.page = page;
                })
                .then(async () => {
                    return new Promise((res) => {
                        this.iframe.addEventListener("load", () => {
                            res();
                        });
                    });
                })
                .catch(async (error) => {
                    if (mw.notify)
                        mw.notify([
                            (() => {
                                const a = document.createElement("span");
                                a.innerText = "An error occurred while loading a Parsoid document: ";
                                return a;
                            })(),
                            (() => {
                                const b = document.createElement("b");
                                b.innerText = error.message;
                                return b;
                            })(),
                        ], {
                            tag: "parsoidDocument-error",
                            type: "error"
                        });
                    throw error;
                });
        }

        /**
         * Destroys the frame and pops it off of the DOM (if inserted).
         * Silently fails if the frame has not yet been built.
         */
        destroyFrame() {
            if (this.iframe && this.iframe.parentElement) {
                this.iframe.parentElement.removeChild(this.iframe);
                this.iframe = undefined;
            }
        }

        /**
         * Clears the frame for a future reload.
         */
        resetFrame() {
            this.page = undefined;
        }

        /**
         * Reloads the page. This will destroy any modifications made to the document.
         */
        async reloadFrame() {
            const page = this.page;
            this.page = undefined;
            return this.loadFrame(page);
        }
        
        /**
         * Finds a template in the loaded document.
         * @param {string} templateName The name of the template to look for.
         * @param {boolean} hrefMode Use the href instead of the wikitext to search for templates.
         */
        findTemplate(templateName, hrefMode = false) {
        	if (!this.loaded)
        		throw new Error("Can't perform operations without a loaded document.");
    		[...this.document.querySelectorAll("[data-mw]")].filter((node) => {
    			const mwData = JSON.parse(node.getAttribute("data-mw"));
    			return mwData.parts.some(
    				(part) => part.template != null && part.template.target[
    					hrefMode ? "href" : "wt"
					] === templateName
				);
    		});
        }
        
        /**
         * Finds the element with the "data-mw" attribute containing the element
         * passed into the function.
         * @param {HTMLElement} element The element to find the parent of. This must
         *                              be a member of the ParsoidDocument's document.
         */
        findParsoidNode(element) {
        	let pivot = element;
        	while (pivot.getAttribute("about") == null) {
        		if (pivot.parentElement == null) {
        			// Dead end.
        			throw new Error("Reached root of DOM while looking for original Parsoid node.");
        		}
        		pivot = pivot.parentElement;
        	}
        	return this.document.querySelector(`[about="${pivot.getAttribute("about")}"][data-mw]`);
        }

        /**
         * Converts the contents of this document to wikitext.
         * @returns {Promise<string>} The wikitext of this document.
         */
        async toWikitext() {
            let target = `/api/rest_v1/transform/html/to/wikitext/${
                encodeAPIComponent(this.page)
            }`;
            if (this.notFound === undefined) {
                target += `/${+(/(\d+)$/.exec(
                    this._document.documentElement.getAttribute("about")
                )[1])}`;
            }
            return fetch(
                target,
                {
                    method: "POST",
                    headers: {
                        "If-Match": this.notFound ? undefined : this.etag
                    },
                    body: (() => {
                        const data = new FormData();
                        data.set("html", this.document.documentElement.outerHTML);
                        data.set("scrub_wikitext", "true");
                        data.set("stash", "true");

                        return data;
                    })()
                }
            ).then(data => data.text());
        }

    }

    /**
     * A blank Parsoid document, with a section 0.
     * @type {string}
     */
    ParsoidDocument.defaultDocument =
        "<html><body><section data-mw-section-id=\"0\"></section></body></html>";

    window.ParsoidDocument = ParsoidDocument;
    window.dispatchEvent(new Event("parsoidDocument:load"));

})();
// </nowiki>
/*
 * Copyright 2021 Chlod
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject
 * to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies
 * or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
 * OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Also licensed under the Creative Commons Attribution-ShareAlike 3.0
 * Unported License, a copy of which is available at
 *
 *     https://creativecommons.org/licenses/by-sa/3.0
 *
 */
