"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { loadFeedData } from "@/lib/data-store"
import type { FeedData } from "@/lib/types"
import { findSourceByUrl } from "@/config/rss-config"
import { ExternalLink } from "lucide-react"

// Function to clean up double-escaped content for proper markdown rendering
const cleanMarkdownContent = (content: string | undefined): string => {
  if (!content) return "无法生成摘要。"
  
  // Fix double-escaped newlines that occur during Next.js build process
  let cleaned = content
    .replace(/\\\\n/g, '\n')  // Convert \\n to actual newlines
    .replace(/\\n/g, '\n')    // Convert \n to actual newlines (backup)
    .replace(/\\\\/g, '\\')   // Fix any other double-escaped backslashes
  
  return cleaned
}

export function RssFeed({ defaultSource }: { defaultSource: string }) {
  const searchParams = useSearchParams()
  const sourceUrl = searchParams.get("source") || defaultSource

  const [feedData, setFeedData] = useState<FeedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFeed = async (url: string) => {
    try {
      setLoading(true)
      setError(null)

      const cachedData = await loadFeedData(url)
      
      if (cachedData) {
        setFeedData(cachedData)
      } else {
        setError("数据为空，请检查数据源是否出错🫠")
      }
    } catch (err) {
      console.error("Error fetching feed:", err)
      setError("数据获取失败，请检查数据源是否出错🫠")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFeed(sourceUrl)
  }, [sourceUrl])

  const source = findSourceByUrl(sourceUrl)
  const displayTitle = source?.name || feedData?.title || "信息源"

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">{displayTitle}</h2>
          {source && <Badge variant="outline">{source.category}</Badge>}
          {feedData?.lastUpdated && (
            <span className="text-xs text-muted-foreground">
              更新于: {new Date(feedData.lastUpdated).toLocaleString("zh-CN")}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="feed-card">
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {feedData?.items.map((item, index) => (
            <Card key={index} className="feed-card relative">
              <div className="absolute -left-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold shadow-md">
                {index + 1}
              </div>
              <CardHeader>
                <CardTitle className="text-xl">
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1"
                  >
                    {item.title}
                    <ExternalLink className="h-4 w-4 inline" />
                  </a>
                </CardTitle>
                <CardDescription>
                  {new Date(item.pubDate || item.isoDate || "").toLocaleString("zh-CN")}
                  {item.creator && ` · ${item.creator}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="short">
                  <TabsList className="mb-4">
                    <TabsTrigger value="short">简短摘要</TabsTrigger>
                    <TabsTrigger value="summary">详细摘要</TabsTrigger>
                    <TabsTrigger value="original">原文内容</TabsTrigger>
                  </TabsList>
                  <TabsContent value="short" className="space-y-2">
                    <div className="text-sm text-muted-foreground mb-2">由 AI 生成的简短摘要 (100词内)：</div>
                    <div className="text-foreground prose prose-sm max-w-none">
                      <p className="text-sm leading-relaxed">
                        {item.shortSummary || "暂无简短摘要"}
                      </p>
                    </div>
                  </TabsContent>
                  <TabsContent value="summary" className="space-y-2">
                    <div className="text-sm text-muted-foreground mb-2">由 AI 生成的详细摘要：</div>
                    <div className="text-foreground prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {cleanMarkdownContent(item.summary)}
                      </ReactMarkdown>
                    </div>
                  </TabsContent>
                  <TabsContent value="original">
                    <div className="text-sm prose prose-sm max-w-none">
                      {item.content || item.contentSnippet ? (
                        // Try markdown first, but if content contains HTML tags, render as HTML
                        (item.content || item.contentSnippet || "").includes('<') ? (
                          <div 
                            dangerouslySetInnerHTML={{ 
                              __html: item.content || item.contentSnippet || "无内容" 
                            }} 
                          />
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {item.content || item.contentSnippet || "无内容"}
                          </ReactMarkdown>
                        )
                      ) : (
                        "无内容"
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
