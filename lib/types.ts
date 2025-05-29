export interface FeedItem {
  title: string
  link?: string
  pubDate?: string
  isoDate?: string
  creator?: string
  summary?: string
  shortSummary?: string
  translated_title?: string
  images?: Array<{
    url: string
    alt: string
    title: string
    position: number
  }>
  contentSource?: string
  // Content fields only included when summary is missing
  content?: string
  contentSnippet?: string
  enclosure?: {
    url: string
    type: string
  }
}

export interface Feed {
  title: string
  description: string
  link: string
  items: FeedItem[]
}

export interface FeedData {
  sourceUrl: string
  title: string
  description: string
  link: string
  items: FeedItem[]
  lastUpdated: string
}
