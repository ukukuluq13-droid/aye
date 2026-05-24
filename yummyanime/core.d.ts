// Minimal Seanime runtime declarations for build compatibility.
// Full definitions are shipped by the Seanime runtime (Goja VM).

declare function fetch(url: string, options?: any): Promise<any>

declare class DocSelection {
  attr(name: string): string | undefined
  text(): string
  html(): string | null
  find(selector: string): DocSelection
  first(): DocSelection
  eq(index: number): DocSelection
  each(callback: (index: number, element: DocSelection) => void): DocSelection
  length(): number
}

declare function LoadDoc(html: string): (selector: string) => DocSelection

declare class Buffer {
  static from(data: string, encoding?: string): Buffer
  constructor(data: string, encoding?: string)
  toString(encoding?: string): string
}
