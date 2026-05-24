var Provider = function() {
  this.base = "http://127.0.0.1:8765";
};

Provider.prototype.getSettings = function() {
  return {
    episodeServers: ["Kodik", "Alloha"],
    supportsDub: true,
  };
};

Provider.prototype.search = function(opts) {
  var self = this;
  var query = String(opts.query || "");

  return fetch(self.base + "/search?q=" + encodeURIComponent(query), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  }).then(function(res) {
    return res.json();
  });
};

Provider.prototype.findEpisodes = function(id) {
  var self = this;

  return fetch(self.base + "/episodes?id=" + encodeURIComponent(id), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  }).then(function(res) {
    return res.json();
  });
};

Provider.prototype.findEpisodeServer = function(episode, server) {
  var parts = episode.id.split("$");
  var iframeUrl = parts[1];

  return {
    server: server || "Kodik",
    headers: {
      Referer: "https://yummyanime.tv",
      Origin: "https://yummyanime.tv",
    },
    videoSources: [{
      url: iframeUrl,
      quality: "auto",
      type: "unknown",
      subtitles: [],
    }],
  };
};
