import "./ParsoidDocument";

const parsoid = new window.ParsoidDocument();
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