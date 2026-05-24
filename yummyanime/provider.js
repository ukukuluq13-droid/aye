/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

/**
 * YummyAnime.tv Online Streaming Provider for Seanime
 * Supports Kodik and Alloha video sources
 */
class Provider {
  constructor() {
    this.base = "https://yummyanime.tv";
    this.headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://yummyanime.tv/",
    };
  }

  getSettings() {
    return {
      episodeServers: ["Kodik", "Alloha"],
      supportsDub: true,
    };
  }

  async search(opts) {
    var body = "do=search&subaction=search&story=" + encodeURIComponent(opts.query);

    var res = await fetch(this.base + "/search/", {
      method: "POST",
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": this.base + "/",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    var html = await res.text();
    var $ = LoadDoc(html);
    var results = [];

    $(".movie-item").each(function (_, el) {
      var linkEl = $(el).find(".movie-item__link").first();
      var href = linkEl.attr("href");
      var title = linkEl.find(".movie-item__title").text().trim();

      if (!href || !title) return;

      var id = href;
      if (id.charAt(0) === "/") id = id.substring(1);

      var url = href;
      if (url.indexOf("http") !== 0) {
        url = "https://yummyanime.tv" + (url.charAt(0) === "/" ? "" : "/") + url;
      }

      results.push({
        id: id,
        title: title,
        url: url,
        subOrDub: "sub",
      });
    });

    if (!results.length) throw new Error("No anime found on YummyAnime.");

    return results;
  }

  async findEpisodes(id) {
    var animeUrl = id.indexOf("http") === 0 ? id : this.base + "/" + id;
    var res = await fetch(animeUrl, { headers: this.headers });
    var html = await res.text();

    var players = this._extractPlayers(html);
    if (!players.length) throw new Error("No video players found for this anime.");

    var kodikPlayer = null;
    var allohaPlayer = null;

    for (var i = 0; i < players.length; i++) {
      if (players[i].type === "kodik") kodikPlayer = players[i];
      if (players[i].type === "alloha") allohaPlayer = players[i];
    }

    var episodes = [];

    // Kodik provides episode lists
    if (kodikPlayer) {
      try {
        var kodikIframeUrl = await this._getPlayerIframeUrl(kodikPlayer);
        var kodikEpisodes = await this._extractKodikEpisodes(kodikIframeUrl, id);
        for (var j = 0; j < kodikEpisodes.length; j++) {
          episodes.push(kodikEpisodes[j]);
        }
      } catch (e) {
        console.error("Kodik episode extraction failed:", e.message || e);
      }
    }

    // Alloha fallback: single video stream
    if (!episodes.length && allohaPlayer) {
      try {
        var allohaIframeUrl = await this._getPlayerIframeUrl(allohaPlayer);
        episodes.push({
          id: "alloha$" + allohaIframeUrl + "$" + id,
          number: 1,
          title: "Episode 1",
          url: allohaIframeUrl,
        });
      } catch (e) {
        console.error("Alloha iframe fetch failed:", e.message || e);
      }
    }

    if (!episodes.length) throw new Error("No episodes found for this anime.");

    // Sort and renumber
    episodes.sort(function (a, b) { return a.number - b.number; });

    var lowest = episodes[0].number;
    if (lowest > 1) {
      for (var k = 0; k < episodes.length; k++) {
        episodes[k].number = episodes[k].number - lowest + 1;
      }
    }

    // Filter non-integer episodes
    var filtered = [];
    for (var m = 0; m < episodes.length; m++) {
      if (Number.isInteger(episodes[m].number)) filtered.push(episodes[m]);
    }

    if (!filtered.length) throw new Error("No valid episodes found.");

    return filtered;
  }

  async findEpisodeServer(episode, server) {
    var parts = episode.id.split("$");
    var playerType = parts[0];

    if (playerType === "alloha") {
      var iframeUrl = parts[1];
      return {
        server: "Alloha",
        headers: {
          Referer: this.base,
          Origin: this.base,
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

    if (playerType === "kodik") {
      var epId = parts[1];
      var epHash = parts[2];
      var animeId = parts[3];
      return await this._extractKodikVideo(epId, epHash, animeId);
    }

    throw new Error("Unknown player type: " + playerType);
  }

  // ─── Internal helpers ───

  _extractPlayers(html) {
    var players = [];
    var regex = /data-params="mod=([^&]+)&[^"]*id=([0-9]+)"/g;
    var match;

    while ((match = regex.exec(html)) !== null) {
      var mod = match[1];
      var animeId = match[2];
      var type = mod.indexOf("kodik") !== -1 ? "kodik" : "alloha";

      var exists = false;
      for (var i = 0; i < players.length; i++) {
        if (players[i].animeId === animeId && players[i].type === type) {
          exists = true;
          break;
        }
      }

      if (!exists) players.push({ type: type, animeId: animeId });
    }

    return players;
  }

  async _getPlayerIframeUrl(player) {
    var mod = player.type === "kodik" ? "kodik-player" : "alloha-player";
    var url = this.base + "/engine/ajax/controller.php?mod=" + mod + "&url=1&action=iframe&id=" + player.animeId;

    var res = await fetch(url, {
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": this.base + "/",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    var data = await res.json();
    if (!data.success || !data.data) {
      throw new Error("Failed to get " + player.type + " iframe URL.");
    }

    return data.data;
  }

  async _extractKodikEpisodes(iframeUrl, animePageId) {
    var res = await fetch(iframeUrl, {
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": this.base + "/" + animePageId,
      },
    });

    var html = await res.text();
    var episodes = [];

    // Extract episodes from data-id / data-hash / data-title attributes
    var regex = /data-id="([0-9]+)"\s+data-hash="([^"]+)"\s+data-title="([^"]+)"/g;
    var match;

    while ((match = regex.exec(html)) !== null) {
      var epId = match[1];
      var epHash = match[2];
      var epTitle = match[3];
      var epNum = this._extractEpisodeNumber(epTitle);

      episodes.push({
        id: "kodik$" + epId + "$" + epHash + "$" + animePageId,
        number: epNum,
        title: epTitle,
        url: iframeUrl,
      });
    }

    // Fallback for movies / OVAs with no episode list
    if (!episodes.length) {
      var serialIdMatch = html.match(/var\s+serialId\s*=\s*Number\((\d+)\)/);
      var serialHashMatch = html.match(/var\s+serialHash\s*=\s*"([^"]+)"/);

      if (serialIdMatch && serialHashMatch) {
        episodes.push({
          id: "kodik$" + serialIdMatch[1] + "$" + serialHashMatch[1] + "$" + animePageId,
          number: 1,
          title: "Episode 1",
          url: iframeUrl,
        });
      }
    }

    return episodes;
  }

  _extractEpisodeNumber(title) {
    var match = title.match(/(\d+)\s*(?:серия|episode|ep)/i);
    if (match) return parseInt(match[1], 10);

    var numMatch = title.match(/(\d+)/);
    if (numMatch) return parseInt(numMatch[1], 10);

    return 1;
  }

  async _extractKodikVideo(episodeId, episodeHash, animePageId) {
    // Attempt Kodik GVI API for direct video links
    var gviUrl = "https://kodikplayer.com/gvi";

    var res = await fetch(gviUrl, {
      method: "POST",
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": "https://kodikplayer.com/",
        "Origin": "https://kodikplayer.com",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: "id=" + episodeId + "&hash=" + episodeHash + "&bad_user=false&min_age=18",
    });

    if (!res.ok) {
      return this._kodikIframeFallback(episodeId, episodeHash);
    }

    var data;
    try {
      data = await res.json();
    } catch (_) {
      return this._kodikIframeFallback(episodeId, episodeHash);
    }

    if (!data || !data.links) {
      return this._kodikIframeFallback(episodeId, episodeHash);
    }

    var videoSources = [];

    for (var quality in data.links) {
      if (!data.links.hasOwnProperty(quality)) continue;

      var sources = data.links[quality];
      if (Array.isArray(sources) && sources.length > 0) {
        var src = sources[0].src;
        src = this._decodeKodikSrc(src);

        var type = src.indexOf(".m3u8") !== -1 ? "m3u8" : "mp4";

        videoSources.push({
          url: src,
          quality: quality,
          type: type,
          subtitles: [],
        });
      }
    }

    if (!videoSources.length) {
      return this._kodikIframeFallback(episodeId, episodeHash);
    }

    return {
      server: "Kodik",
      headers: {
        Referer: "https://kodikplayer.com/",
        Origin: "https://kodikplayer.com",
      },
      videoSources: videoSources,
    };
  }

  _kodikIframeFallback(episodeId, episodeHash) {
    return {
      server: "Kodik",
      headers: {
        Referer: "https://kodikplayer.com/",
        Origin: "https://kodikplayer.com",
      },
      videoSources: [
        {
          url: "https://kodikplayer.com/serial/" + episodeId + "/" + episodeHash + "/720p",
          quality: "auto",
          type: "unknown",
          subtitles: [],
        },
      ],
    };
  }

  /**
   * Kodik encodes video URLs with base64 + ROT13 on letters.
   * This reverses the encoding to get the actual m3u8/mp4 URL.
   */
  _decodeKodikSrc(src) {
    try {
      var rot13 = src.replace(/[a-zA-Z]/g, function (c) {
        var base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
      });
      var decoded = this._base64Decode(rot13);
      return decoded || src;
    } catch (_) {
      return src;
    }
  }

  /**
   * Pure-JS base64 decoder (no Buffer/Node API needed for ES5 Goja).
   */
  _base64Decode(str) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

    str = str.replace(/[^A-Za-z0-9+/=]/g, "");

    while (i < str.length) {
      enc1 = chars.indexOf(str.charAt(i++));
      enc2 = chars.indexOf(str.charAt(i++));
      enc3 = chars.indexOf(str.charAt(i++));
      enc4 = chars.indexOf(str.charAt(i++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      output += String.fromCharCode(chr1);
      if (enc3 !== 64) output += String.fromCharCode(chr2);
      if (enc4 !== 64) output += String.fromCharCode(chr3);
    }

    return output;
  }
}
