import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

type PexelsUser = {
  id: number
  name: string
  url: string
}

type PexelsVideoFile = {
  id: number
  quality: string
  file_type: string
  width: number
  height: number
  link: string
}

type PexelsVideo = {
  id: number
  duration: number
  image: string
  user: PexelsUser
  video_files: PexelsVideoFile[]
}

type FeedVideo = {
  id: number
  src: string
  previewImage: string
  duration: number
  photographer: string
  photographerUrl: string
}

const API_KEY =
  import.meta.env.VITE_PEXELS_API_KEY ??
  'oigofsD0VKNu7nW2ah8RZQ2hxY0z2KeT3jL2qhcj2uAB0ckoQtxZw5m5'

const POPULAR_VIDEOS_ENDPOINT = 'https://api.pexels.com/videos/popular'
const PER_PAGE = 12

const formatDuration = (seconds: number) => {
  if (!seconds && seconds !== 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')} min`
}

function App() {
  const [videos, setVideos] = useState<FeedVideo[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [unmutedVideoId, setUnmutedVideoId] = useState<number | null>(null)
  // @ts-ignore - used in pagination dots
  const [currentIndex, setCurrentIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  
  // Refs - simple approach following DEV article
  const feedRef = useRef<HTMLElement | null>(null)
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({})
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const fetchController = useRef<AbortController | null>(null)

  const fetchVideos = useCallback(
    async (pageToLoad: number, append = false) => {
      if (!API_KEY) {
        setStatus('error')
        setErrorMessage('Missing Pexels API key.')
        return false
      }

      const controller = new AbortController()
      fetchController.current?.abort()
      fetchController.current = controller

      if (!append) {
        setStatus('loading')
        setErrorMessage(null)
      } else {
        setIsLoadingMore(true)
      }

      try {
        const url = `${POPULAR_VIDEOS_ENDPOINT}?per_page=${PER_PAGE}&page=${pageToLoad}`
        const response = await fetch(url, {
          headers: {
            Authorization: API_KEY,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(
            `Failed to fetch videos (${response.status} ${response.statusText})`
          )
        }

        const data = (await response.json()) as { videos: PexelsVideo[] }
        const formatted = data.videos
          .map((video) => {
            const mp4Files = video.video_files.filter(
              (file) => file.file_type === 'video/mp4'
            )
            if (!mp4Files.length) {
              return null
            }

            const preferred =
              mp4Files.find((file) => file.quality === 'hd') ??
              mp4Files.find((file) => file.quality === 'sd') ??
              mp4Files[0]

            if (!preferred) {
              return null
            }

            return {
              id: video.id,
              src: preferred.link,
              previewImage: video.image,
              duration: video.duration,
              photographer: video.user?.name ?? 'Unknown creator',
              photographerUrl: video.user?.url ?? 'https://www.pexels.com/videos/',
            } satisfies FeedVideo
          })
          .filter((video): video is FeedVideo => Boolean(video))

        setVideos((prev) => {
          if (!append) {
            return formatted
          }

          const existingIds = new Set(prev.map((video) => video.id))
          const uniqueNew = formatted.filter((video) => !existingIds.has(video.id))
          return [...prev, ...uniqueNew]
        })

        setHasMore(data.videos.length === PER_PAGE)
        setStatus('success')
        return true
      } catch (error) {
        if (!append && !(error instanceof DOMException && error.name === 'AbortError')) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Something went wrong.'
          )
          setStatus('error')
        }
        return false
      } finally {
        if (append) {
          setIsLoadingMore(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    fetchVideos(1, false)

    return () => {
      fetchController.current?.abort()
    }
  }, [fetchVideos])

  const registerVideo = useCallback((id: number) => {
    return (node: HTMLVideoElement | null) => {
      if (node) {
        videoRefs.current[id] = node
      } else {
        delete videoRefs.current[id]
      }
    }
  }, [])

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([videoId, element]) => {
      if (!element) return
      const numericId = Number(videoId)
      const shouldMute = unmutedVideoId === null || numericId !== unmutedVideoId
      element.muted = shouldMute
    })
  }, [unmutedVideoId])

  const handleVideoClick = useCallback(
    (id: number) => {
      const video = videoRefs.current[id]
      if (!video) return
      const isActive = unmutedVideoId === id

      if (isActive) {
        video.muted = true
        setUnmutedVideoId(null)
        return
      }

      Object.entries(videoRefs.current).forEach(([videoId, element]) => {
        if (!element) return
        element.muted = Number(videoId) !== id
      })

      video.muted = false
      const playPromise = video.play()
      if (playPromise) {
        playPromise.catch(() => {
          /* autoplay/audio might be blocked; ignore */
        })
      }
      setUnmutedVideoId(id)
    },
    [unmutedVideoId]
  )

  // Simple IntersectionObserver approach - following DEV article
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return
    const nextPage = page + 1
    const loaded = await fetchVideos(nextPage, true)
    if (loaded) {
      setPage(nextPage)
    }
  }, [fetchVideos, hasMore, isLoadingMore, page])

  useEffect(() => {
    const cards = Array.from(
      feedRef.current?.querySelectorAll('[data-feed-card]') ?? []
    ) as HTMLElement[]

    if (!cards.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.75) {
            const index = parseInt(
              (entry.target as HTMLElement).dataset.cardIndex ?? '0',
              10
            )
            setCurrentIndex(index)

            // Play/pause videos
            const videoId = parseInt(
              (entry.target as HTMLElement).dataset.videoId ?? '0',
              10
            )
            const video = videoRefs.current[videoId]
            
            if (video) {
              const playPromise = video.play()
              if (playPromise) {
                playPromise.catch(() => {
                  /* autoplay blocked */
                })
              }
            }
          } else {
            // Pause when not visible
            const videoId = parseInt(
              (entry.target as HTMLElement).dataset.videoId ?? '0',
              10
            )
            const video = videoRefs.current[videoId]
            
            if (video) {
              video.pause()
              video.currentTime = 0
              
              // Auto-mute when scrolling away
              if (unmutedVideoId === videoId) {
                video.muted = true
                setUnmutedVideoId(null)
              }
            }
          }
        })
      },
      {
        root: feedRef.current,
        threshold: [0, 0.75, 1],
      }
    )

    cards.forEach((card) => observer.observe(card))

    return () => {
      cards.forEach((card) => observer.unobserve(card))
      observer.disconnect()
    }
  }, [videos, unmutedVideoId])

  useEffect(() => {
    if (!hasMore) return

    const sentinel = loadMoreRef.current
    const feed = feedRef.current
    if (!sentinel || !feed) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting) {
          loadMore()
        }
      },
      {
        root: feed,
        threshold: 0.5,
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [hasMore, loadMore])

  useEffect(() => {
    if (!hasMore || isLoadingMore || videos.length === 0) return

    const remaining = videos.length - (currentIndex + 1)
    if (remaining <= 4) {
      loadMore()
    }
  }, [currentIndex, hasMore, isLoadingMore, loadMore, videos.length])

  return (
    <main className="app">
      <header className="app__hero">
      </header>

      <section className="feed" aria-live="polite" ref={feedRef}>
        <div className="feed__pull-indicator" aria-hidden="true">
          <span className="feed__pull-indicator-arrow feed__pull-indicator-arrow--up" />
          <span className="feed__pull-indicator-line" />
          <span className="feed__pull-indicator-arrow feed__pull-indicator-arrow--down" />
        </div>

        {/* {videos.length > 1 && (
          <div className="feed__pagination" aria-hidden="true">
            {videos.map((video, index) => (
              <span
                key={video.id}
                className={`feed__pagination-dot ${
                  index === currentIndex ? 'feed__pagination-dot--active' : ''
                }`}
              />
            ))}
          </div>
        )} */}

        {status === 'loading' && (
          <div className="feed__status">Fetching trending videos…</div>
        )}

        {status === 'error' && (
          <div className="feed__status feed__status--error">
            {errorMessage ?? 'Unable to load videos right now.'}
      </div>
        )}

        {status === 'success' && !videos.length && (
          <div className="feed__status">No videos found. Try again later.</div>
        )}

        {videos.map((video, index) => (
            <article
              key={video.id}
              data-feed-card="true"
              data-card-index={index}
              data-video-id={video.id}
              className="feed-card"
              style={{ backgroundImage: `url(${video.previewImage})` }}
            >
            <div className="feed-card__overlay" />
            <video
              className="feed-card__media"
              ref={registerVideo(video.id)}
              src={video.src}
              muted
              loop
              playsInline
              preload="metadata"
              poster={video.previewImage}
              data-video-id={video.id}
              onClick={() => handleVideoClick(video.id)}
            />

            <div className="feed-card__meta">
              <div>
                <p className="feed-card__author">@{video.photographer}</p>
                <p className="feed-card__duration">
                  {formatDuration(video.duration)}
        </p>
      </div>
              <div className="feed-card__actions">
                <button
                  type="button"
                  className={`feed-card__audio ${
                    unmutedVideoId === video.id ? 'feed-card__audio--on' : ''
                  }`}
                  onClick={() => handleVideoClick(video.id)}
                  aria-pressed={unmutedVideoId === video.id}
                  aria-label={
                    unmutedVideoId === video.id
                      ? 'Mute video audio'
                      : 'Unmute video audio'
                  }
                >
                  <svg
                    className="feed-card__audio-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    role="presentation"
                  >
                    <path
                      d="M5 9v6h4l5 4V5l-5 4H5z"
                      fill="currentColor"
                      opacity="0.9"
                    />
                    {unmutedVideoId === video.id ? (
                      <>
                        <path
                          d="M17 8.5c1 .8 1.5 2 1.5 3.5s-.5 2.7-1.5 3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M19.5 6c1.6 1.3 2.5 3.2 2.5 6s-.9 4.7-2.5 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </>
                    ) : (
                      <>
                        <path
                          d="M18 9l4 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M22 9l-4 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </>
                    )}
                  </svg>
                </button>

                <a
                  className="feed-card__cta"
                  href={video.photographerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Pexels
                </a>
              </div>
            </div>
          </article>
        ))}

        {hasMore && (
          <div className="feed__sentinel" ref={loadMoreRef} aria-hidden="true">
            {isLoadingMore && (
              <div className="feed__status feed__status--loading-more">
                Loading more videos…
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
