Provider = function() {
  this.base = "https://yummyanime.tv";
};

Provider.prototype.getSettings = function() {
  return {
    episodeServers: ["Kodik", "Alloha"],
    supportsDub: true,
  };
};

Provider.prototype.search = function(opts) {
  var self = this;
  var body = "do=search&subaction=search&story=" + encodeURIComponent(opts.query);

  return fetch(self.base + "/search/", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": self.base + "/",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  }).then(function(res) {
    return res.text();
  }).then(function(html) {
    var $ = LoadDoc(html);
    var results = [];

    $(".movie-item").each(function(_, el) {
      var linkEl = $(el).find(".movie-item__link").first();
      var href = linkEl.attr("href");
      var title = linkEl.find(".movie-item__title").text().trim();

      if (!href || !title) return;

      var id = href;
      if (id.charAt(0) === "/") id = id.substring(1);

      var url = href;
      if (url.indexOf("http") !== 0) {
        url = self.base + (url.charAt(0) === "/" ? "" : "/") + url;
      }

      results.push({
        id: id,
        title: title,
        url: url,
        subOrDub: "sub",
      });
    });

    if (!results.length) {
      throw new Error("No anime found on YummyAnime.");
    }

    return results;
  });
};

Provider.prototype.findEpisodes = function(id) {
  var self = this;
  var animeUrl = id.indexOf("http") === 0 ? id : self.base + "/" + id;

  return fetch(animeUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": self.base + "/",
    },
  }).then(function(res) {
    return res.text();
  }).then(function(html) {
    var match = html.match(/data-params="mod=kodik-player[^"]*id=(\d+)/);
    if (!match) {
      throw new Error("No Kodik player found for this anime.");
    }

    var animeId = match[1];
    var iframeUrl = self.base + "/engine/ajax/controller.php?mod=kodik-player&url=1&action=iframe&id=" + animeId;

    return fetch(iframeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": self.base + "/",
        "X-Requested-With": "XMLHttpRequest",
      },
    }).then(function(res) {
      return res.json();
    }).then(function(data) {
      if (!data.success || !data.data) {
        throw new Error("Failed to get Kodik iframe URL.");
      }

      return [{
        id: "kodik$" + data.data + "$" + id,
        number: 1,
        title: "Episode 1",
        url: data.data,
      }];
    });
  });
};

Provider.prototype.findEpisodeServer = function(episode, server) {
  var parts = episode.id.split("$");
  var iframeUrl = parts[1];

  return {
    server: server || "Kodik",
    headers: {
      Referer: this.base,
      Origin: this.base,
    },
    videoSources: [{
      url: iframeUrl,
      quality: "auto",
      type: "unknown",
      subtitles: [],
    }],
  };
};
