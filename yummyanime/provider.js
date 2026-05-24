/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

/**
 * YummyAnime.tv Online Streaming Provider for Seanime
 * Uses local micro-proxy at 127.0.0.1:8765
 */
var Provider = function() {
  this.base = "http://127.0.0.1:8765";
};

Provider.prototype.getSettings = function() {
  return {
    episodeServers: ["Kodik"],
    supportsDub: false,
  };
};

Provider.prototype.search = function(opts) {
  var self = this;
  return fetch(self.base + "/search?q=" + encodeURIComponent(opts.query))
    .then(function(res) {
      if (!res.ok) throw new Error("Search failed: " + res.status);
      return res.json();
    });
};

Provider.prototype.findEpisodes = function(id) {
  var self = this;
  return fetch(self.base + "/episodes?id=" + encodeURIComponent(id))
    .then(function(res) {
      if (!res.ok) throw new Error("Episodes failed: " + res.status);
      return res.json();
    });
};

Provider.prototype.findEpisodeServer = function(episode, server) {
  var parts = episode.id.split("$");
  var playerType = parts[0];
  var iframeUrl = parts[1];
  var animeId = parts[2];

  if (playerType === "kodik") {
    return {
      server: "Kodik",
      headers: {
        Referer: "https://yummyanime.tv/",
        Origin: "https://yummyanime.tv",
      },
      videoSources: [
        {
          url: iframeUrl,
          quality: "auto",
          type: "unknown",
          subtitles: [],
        },
      ],
    };
  }

  throw new Error("Unknown player type: " + playerType);
};
