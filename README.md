# ParsoidDocument
[![npm version](https://img.shields.io/npm/v/@chlodalejandro/parsoid.svg?style=flat-square)](https://www.npmjs.org/package/@chlodalejandro/parsoid)
[![npm downloads](https://img.shields.io/npm/dm/@chlodalejandro/parsoid.svg?style=flat-square)](http://npm-stat.com/charts.html?package=@chlodalejandro/parsoid)

*Originally from [User:Chlod/Scripts/ParsoidDocument](https://en.wikipedia.org/wiki/User:Chlod/Scripts/ParsoidDocument) on the English Wikipedia.*

ParsoidDocument is an ES6+ library which implements a Parsoid-compatible document handler using an HTML5 IFrame. It is not a userscript, but is instead loaded by other userscripts. The IFrame contains the Parsoid document, which can then be modified using standard DOM functions. This is used to perform Parsoid-dependent operations in the browser without having to pull in the entirety of the VisualEditor codebase.

To be fully optimized, this should be implemented as a gadget and loaded through [mw.loader](https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.loader). Since the Gadgets extension [does not support ES6](https://phabricator.wikimedia.org/T75714), however, it cannot yet be implemented as one on most wikis.

## Usage
As a developer, insert the following code in the initialization section of your userscript. **This is the only way to use the library on the English Wikipedia, and for most Wikimedia wikis.**
```js
// The "await" is optional, but ensures that the script has loaded and run before proceeding.
// On the English Wikipedia
await mw.loader.getScript("https://en.wikipedia.org/wiki/User:Chlod/Scripts/ParsoidDocument.js?action=raw&ctype=text/javascript");

// On other wikis, you must upload ParsoidDocument.js from the English Wikipedia or this repository
// first, and then change the URL to lead to the correct page. Make sure to keep the
// `?action=raw&ctype=text/javascript` at the end of the URL!
```

If it is available as a gadget, you can instead use the following.
```js
mw.loader.load("ext.gadget.ParsoidDocument"); // where ParsoidDocument is the ID of the gadget.
```

If your userscript is bundled with Webpack, you can also install the [@chlodalejandro/parsoid](https://npmjs.com/package/@chlodalejandro/parsoid) package. This package also adds typings for ParsoidDocument, in case you're developing with TypeScript or a decent IDE with a type checker.
```shell
npm install @chlodalejandro/parsoid
```

You can then access ParsoidDocument using the `ParsoidDocument` window global.
```js
const parsoid = new ParsoidDocument();
// You can append the frame anywhere; it will never be visible to the user.
document.body.appendChild(parsoid.buildFrame());

parsoid.loadFrame("User:Chlod/Scripts/ParsoidDocument");
parsoid.document.body.classList.contains("parsoid-body"); // true

// Prints the "data-mw" attribute of all transclusions.
parsoid.document.querySelectorAll("[typeof=\"mw:Transclusion\"]").forEach(v => {
    console.log(v.getAttribute("data-mw"));
});

// Convert the document, including any modification, to wikitext.
parsoid.toWikitext();
```

You can also extend the ParsoidDocument class as any other class.
```js
class MyParsoidHandler extends ParsoidDocument {

    findAllTransclusions() {
        return this.document.querySelectorAll("[typeof=\"mw:Transclusion\"]");
    }

}

const parsoid = new MyParsoidHandler();
// ...
parsoid.findAllTransclusions();
```
## See also
* [types-mediawiki](https://github.com/wikimedia-gadgets/types-mediawiki) – provides types for the MediaWiki global (`mw`).