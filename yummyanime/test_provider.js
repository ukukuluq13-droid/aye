// Simple test harness that mocks the Goja/Seanime environment
// and tests the YummyAnime provider

// Mock fetch
function fetch(url, options) {
    console.log("[fetch]", options && options.method || "GET", url);
    return new MockFetchResponse(url);
}

function MockFetchResponse(url) {
    this.url = url;
    this.ok = true;
    this.status = 200;
    this._url = url;
}

MockFetchResponse.prototype.text = function() { return ""; };
MockFetchResponse.prototype.json = function() { return {}; };

// Mock LoadDoc
function LoadDoc(html) {
    return function(selector) {
        return {
            first: function() { return this; },
            text: function() { return ""; },
            attr: function(name) { return undefined; },
            find: function(sel) { return this; },
            each: function(fn) { return this; },
        };
    };
}

// Mock Buffer
function Buffer(arg, encoding) {
    if (typeof arg === "string" && encoding === "base64") {
        // Simple base64 decode
        try {
            var atob = function(str) {
                return Buffer.from(str, "base64").toString("binary");
            };
            return { toString: function(enc) { return atob(arg); } };
        } catch(e) {
            return { toString: function() { return arg; } };
        }
    }
    return {
        toString: function() { return arg.toString(); }
    };
}
Buffer.from = function(arg, encoding) {
    if (typeof arg === "string" && encoding === "base64") {
        try {
            var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            var str = arg.replace(/[^A-Za-z0-9+/]/g, "");
            var output = "";
            for (var i = 0; i < str.length; i += 4) {
                var enc1 = chars.indexOf(str.charAt(i));
                var enc2 = chars.indexOf(str.charAt(i + 1));
                var enc3 = chars.indexOf(str.charAt(i + 2));
                var enc4 = chars.indexOf(str.charAt(i + 3));
                var chr1 = (enc1 << 2) | (enc2 >> 4);
                var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                var chr3 = ((enc3 & 3) << 6) | enc4;
                output += String.fromCharCode(chr1);
                if (enc3 !== 64) output += String.fromCharCode(chr2);
                if (enc4 !== 64) output += String.fromCharCode(chr3);
            }
            return { toString: function() { return output; } };
        } catch(e) {
            return { toString: function() { return arg; } };
        }
    }
    return { toString: function() { return String(arg); } };
};

// Load provider
var fs = require("fs");
var providerCode = fs.readFileSync(__dirname + "/provider.js", "utf-8");
eval(providerCode);

var provider = new Provider();

console.log("=== Testing YummyAnime Provider ===");
console.log("Settings:", JSON.stringify(provider.getSettings()));

// Test search
(async function() {
    try {
        var results = await provider.search({
            media: { id: 1, synonyms: [], isAdult: false },
            query: "Naruto",
            dub: false,
        });
        console.log("Search results:", results.length);
    } catch(e) {
        console.error("Search error:", e.message || e);
    }
})();
