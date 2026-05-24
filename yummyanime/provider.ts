/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

type PlayerConfig = {
  type: "kodik" | "alloha"
  animeId: string
}

class Provider {

  base = "https://yummyanime.tv"
  headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://yummyanime.tv/",
  }

  getSettings(): Settings {
    return {
      episodeServers: ["Kodik", "Alloha"],
      supportsDub: true,
    }
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const body = "do=search&subaction=search&story=" + encodeURIComponent(opts.query)

    const res = await fetch(this.base + "/search/", {
      method: "POST",
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": this.base + "/",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    })

    const html = await res.text()
    const $ = LoadDoc(html)
    const results: SearchResult[] = []

    $(".movie-item").each((_: number, el: DocSelection) => {
      const linkEl = $(el).find(".movie-item__link").first()
      const href = linkEl.attr("href")
      const title = linkEl.find(".movie-item__title").text().trim()

      if (!href || !title) return

      let id = href
      if (id.indexOf("/") === 0) {
        id = id.substring(1)
      }

      let url = href
      if (url.indexOf("http") !== 0) {
        url = this.base + (url.indexOf("/") === 0 ? "" : "/") + url
      }

      results.push({
        id: id,
        title: title,
        url: url,
        subOrDub: "sub",
      })
    })

    if (!results.length) {
      throw new Error("No anime found on YummyAnime.")
    }

    return results
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    const animeUrl = id.indexOf("http") === 0 ? id : this.base + "/" + id
    const res = await fetch(animeUrl, { headers: this.headers })
    const html = await res.text()

    const players = this._extractPlayers(html)
    if (!players.length) {
      throw new Error("No video players found for this anime.")
    }

    let kodikPlayer: PlayerConfig | null = null
    let allohaPlayer: PlayerConfig | null = null

    for (let i = 0; i < players.length; i++) {
      if (players[i].type === "kodik") kodikPlayer = players[i]
      if (players[i].type === "alloha") allohaPlayer = players[i]
    }

    const episodes: EpisodeDetails[] = []

    // Try Kodik first for episode enumeration
    if (kodikPlayer) {
      try {
        const kodikIframeUrl = await this._getPlayerIframeUrl(kodikPlayer)
        const kodikEpisodes = await this._extractKodikEpisodes(kodikIframeUrl, id)
        for (let i = 0; i < kodikEpisodes.length; i++) {
          episodes.push(kodikEpisodes[i])
        }
      } catch (e: any) {
        console.error("Kodik episode extraction failed:", e.message || e)
      }
    }

    // Fallback to Alloha (single episode)
    if (!episodes.length && allohaPlayer) {
      try {
        const allohaIframeUrl = await this._getPlayerIframeUrl(allohaPlayer)
        episodes.push({
          id: "alloha$" + allohaIframeUrl + "$" + id,
          number: 1,
          title: "Episode 1",
          url: allohaIframeUrl,
        })
      } catch (e: any) {
        console.error("Alloha iframe fetch failed:", e.message || e)
      }
    }

    if (!episodes.length) {
      throw new Error("No episodes found for this anime.")
    }

    // Sort by episode number
    episodes.sort((a, b) => a.number - b.number)

    // Renumber if lowest > 1
    const lowest = episodes[0].number
    if (lowest > 1) {
      for (let i = 0; i < episodes.length; i++) {
        episodes[i].number = episodes[i].number - lowest + 1
      }
    }

    // Filter out non-integer episodes
    const filtered = episodes.filter((ep) => Number.isInteger(ep.number))

    if (!filtered.length) {
      throw new Error("No valid episodes found after filtering.")
    }

    return filtered
  }

  async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
    const parts = episode.id.split("$")
    const idPlayerType = parts[0]

    // Respect the server parameter when it explicitly selects a backend
    let selectedType = idPlayerType
    if (server === "Alloha") selectedType = "alloha"
    else if (server === "Kodik") selectedType = "kodik"

    if (selectedType === "alloha") {
      const iframeUrl = parts[1]
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
      }
    }

    if (selectedType === "kodik") {
      const epId = parts[1]
      const epHash = parts[2]
      const animeId = parts[3]
      return await this._extractKodikVideo(epId, epHash, animeId)
    }

    throw new Error("Unknown player type: " + selectedType)
  }

  // ─── Private helpers ───

  private _extractPlayers(html: string): PlayerConfig[] {
    const players: PlayerConfig[] = []
    const regex = /data-params="mod=([^&]+)&[^"]*id=([0-9]+)"/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(html)) !== null) {
      const mod = match[1]
      const animeId = match[2]

      const exists = players.some(
        (p) => p.animeId === animeId && p.type === (mod.indexOf("kodik") !== -1 ? "kodik" : "alloha")
      )

      if (!exists) {
        players.push({
          type: mod.indexOf("kodik") !== -1 ? "kodik" : "alloha",
          animeId: animeId,
        })
      }
    }

    return players
  }

  private async _getPlayerIframeUrl(player: PlayerConfig): Promise<string> {
    const mod = player.type === "kodik" ? "kodik-player" : "alloha-player"
    const url = this.base + "/engine/ajax/controller.php?mod=" + mod + "&url=1&action=iframe&id=" + player.animeId

    const res = await fetch(url, {
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": this.base + "/",
        "X-Requested-With": "XMLHttpRequest",
      },
    })

    const data = await res.json()
    if (!data.success || !data.data) {
      throw new Error("Failed to get " + player.type + " iframe URL.")
    }

    return data.data
  }

  private async _extractKodikEpisodes(iframeUrl: string, animePageId: string): Promise<EpisodeDetails[]> {
    const res = await fetch(iframeUrl, {
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": this.base + "/" + animePageId,
      },
    })

    const html = await res.text()
    const episodes: EpisodeDetails[] = []

    // Extract episodes from data-id / data-hash / data-title attributes
    const regex = /data-id="([0-9]+)"\s+data-hash="([^"]+)"\s+data-title="([^"]+)"/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(html)) !== null) {
      const epId = match[1]
      const epHash = match[2]
      const epTitle = match[3]
      const epNum = this._extractEpisodeNumber(epTitle)

      episodes.push({
        id: "kodik$" + epId + "$" + epHash + "$" + animePageId,
        number: epNum,
        title: epTitle,
        url: iframeUrl,
      })
    }

    // Fallback for movies / OVAs with no episode list
    if (!episodes.length) {
      const serialIdMatch = html.match(/var\s+serialId\s*=\s*Number\((\d+)\)/)
      const serialHashMatch = html.match(/var\s+serialHash\s*=\s*"([^"]+)"/)

      if (serialIdMatch && serialHashMatch) {
        episodes.push({
          id: "kodik$" + serialIdMatch[1] + "$" + serialHashMatch[1] + "$" + animePageId,
          number: 1,
          title: "Episode 1",
          url: iframeUrl,
        })
      }
    }

    return episodes
  }

  private _extractEpisodeNumber(title: string): number {
    const match = title.match(/(\d+)\s*(?:серия|episode|ep)/i)
    if (match) return parseInt(match[1], 10)

    const numMatch = title.match(/(\d+)/)
    if (numMatch) return parseInt(numMatch[1], 10)

    return 1
  }

  private async _extractKodikVideo(episodeId: string, episodeHash: string, animePageId: string): Promise<EpisodeServer> {
    const gviUrl = "https://kodikplayer.com/gvi"

    const res = await fetch(gviUrl, {
      method: "POST",
      headers: {
        "User-Agent": this.headers["User-Agent"],
        "Referer": "https://kodikplayer.com/",
        "Origin": "https://kodikplayer.com",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: "id=" + episodeId + "&hash=" + episodeHash + "&bad_user=false&min_age=18",
    })

    if (!res.ok) {
      return this._kodikIframeFallback(episodeId, episodeHash)
    }

    let data: any
    try {
      data = await res.json()
    } catch (_) {
      return this._kodikIframeFallback(episodeId, episodeHash)
    }

    if (!data || !data.links) {
      return this._kodikIframeFallback(episodeId, episodeHash)
    }

    const videoSources: VideoSource[] = []

    for (const quality in data.links) {
      if (!data.links.hasOwnProperty(quality)) continue

      const sources = data.links[quality]
      if (Array.isArray(sources) && sources.length > 0) {
        let src = sources[0].src
        src = this._decodeKodikSrc(src)

        const type: VideoSourceType = src.indexOf(".m3u8") !== -1 ? "m3u8" : "mp4"

        videoSources.push({
          url: src,
          quality: quality,
          type: type,
          subtitles: [],
        })
      }
    }

    if (!videoSources.length) {
      return this._kodikIframeFallback(episodeId, episodeHash)
    }

    return {
      server: "Kodik",
      headers: {
        Referer: "https://kodikplayer.com/",
        Origin: "https://kodikplayer.com",
      },
      videoSources: videoSources,
    }
  }

  private _kodikIframeFallback(episodeId: string, episodeHash: string): EpisodeServer {
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
    }
  }

  private _decodeKodikSrc(src: string): string {
    try {
      const rot13 = src.replace(/[a-zA-Z]/g, function (c: string) {
        const base = c <= "Z" ? 65 : 97
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
      })
      const decoded = Buffer.from(rot13, "base64").toString("utf-8")
      return decoded || src
    } catch (_) {
      return src
    }
  }
}
