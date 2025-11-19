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

const POPULAR_VIDEOS_ENDPOINT =
  'https://api.pexels.com/videos/popular?per_page=20'

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
  const [currentIndex, setCurrentIndex] = useState(0)
  
  // Refs for Instagram-style scroll
  const feedRef = useRef<HTMLElement | null>(null)
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({})
  const scrollState = useRef({
    isScrolling: false,
    isDragging: false,
    startY: 0,
    currentY: 0,
    lastScrollTime: 0,
    accumulatedDelta: 0,
    targetIndex: 0,
    animationFrame: null as number | null,
  })

  useEffect(() => {
    const controller = new AbortController()

    const fetchVideos = async () => {
      if (!API_KEY) {
        setStatus('error')
        setErrorMessage('Missing Pexels API key.')
        return
      }

      setStatus('loading')
      setErrorMessage(null)

      try {
        const response = await fetch(POPULAR_VIDEOS_ENDPOINT, {
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

        setVideos(formatted)
        setStatus('success')
      } catch (error) {
        if (controller.signal.aborted) return
        setErrorMessage(
          error instanceof Error ? error.message : 'Something went wrong.'
        )
        setStatus('error')
      }
    }

    fetchVideos()

    return () => controller.abort()
  }, [])

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

  // Get card element by index
  const getCardByIndex = useCallback((index: number): HTMLElement | null => {
    if (!feedRef.current) return null
    const cards = Array.from(
      feedRef.current.querySelectorAll<HTMLElement>('[data-feed-card]')
    )
    return cards[index] ?? null
  }, [])

  // Snap to specific index with Instagram-style animation
  const snapToIndex = useCallback(
    (targetIndex: number, immediate = false) => {
      const clampedIndex = Math.max(0, Math.min(targetIndex, videos.length - 1))
      if (clampedIndex === currentIndex && !immediate) return

      const targetCard = getCardByIndex(clampedIndex)
      if (!targetCard) return

      scrollState.current.isScrolling = true
      scrollState.current.targetIndex = clampedIndex
      scrollState.current.accumulatedDelta = 0

      // Reset current card transform before snapping
      const currentCard = getCardByIndex(currentIndex)
      if (currentCard) {
        currentCard.style.transform = ''
        currentCard.style.transition = ''
      }

      // Apply smooth scroll
      targetCard.scrollIntoView({
        behavior: immediate ? 'auto' : 'smooth',
        block: 'start',
      })

      setCurrentIndex(clampedIndex)

      // Reset scrolling state after animation
      window.setTimeout(
        () => {
          scrollState.current.isScrolling = false
        },
        immediate ? 0 : 500
      )
    },
    [currentIndex, videos, getCardByIndex]
  )

  // Play/pause video based on active index
  useEffect(() => {
    if (!videos.length) return

    Object.entries(videoRefs.current).forEach(([videoIdStr, element]) => {
      if (!element) return
      const videoId = Number(videoIdStr)
      const videoIndex = videos.findIndex((v) => v.id === videoId)
      const isActive = videoIndex === currentIndex

      if (isActive) {
        const playPromise = element.play()
        if (playPromise) {
          playPromise.catch(() => {
            /* autoplay might be blocked */
          })
        }
      } else {
        element.pause()
        element.currentTime = 0
        // Auto-mute when scrolling away
        if (unmutedVideoId === videoId) {
          element.muted = true
          setUnmutedVideoId(null)
        }
      }
    })
  }, [currentIndex, videos, unmutedVideoId])

  // Instagram Reels scroll handler with threshold and rubber-band
  useEffect(() => {
    const feedEl = feedRef.current
    if (!feedEl || !videos.length) return

    let wheelTimeout: ReturnType<typeof setTimeout> | null = null

    const handleWheel = (event: WheelEvent) => {
      // Don't interfere if already snapping
      if (scrollState.current.isScrolling) {
        event.preventDefault()
        return
      }

      const now = Date.now()
      scrollState.current.lastScrollTime = now

      // Accumulate scroll delta
      scrollState.current.accumulatedDelta += event.deltaY

      // Prevent default to control scroll
      event.preventDefault()

      // Clear existing timeout
      if (wheelTimeout) {
        clearTimeout(wheelTimeout)
      }

      // Calculate card height for threshold
      const cardHeight = feedEl.clientHeight
      const threshold = cardHeight * 0.01 // Reduced from 0.45 to 0.25 for easier scrolling

      // Check if we've crossed the threshold
      if (Math.abs(scrollState.current.accumulatedDelta) >= threshold) {
        const direction = scrollState.current.accumulatedDelta > 0 ? 1 : -1
        const nextIndex = currentIndex + direction

        // Clamp to valid range
        if (nextIndex >= 0 && nextIndex < videos.length) {
          snapToIndex(nextIndex)
          scrollState.current.accumulatedDelta = 0
        } else {
          // At boundary - apply stronger resistance
          const currentCard = getCardByIndex(currentIndex)
          if (currentCard) {
            const resistance = 0.12 // Reduced boundary resistance
            const translateY = -scrollState.current.accumulatedDelta * resistance
            const clampedTranslate = Math.max(-50, Math.min(50, translateY))
            currentCard.style.transform = `translateY(${clampedTranslate}px) scale(1)`
            currentCard.style.transition = 'none'
          }
        }
      } else {
        // Apply rubber-band resistance for visual feedback
        const resistance = 0.5 // Increased from 0.35 to 0.5 for more responsive feel
        const translateY = -scrollState.current.accumulatedDelta * resistance

        const currentCard = getCardByIndex(currentIndex)
        if (currentCard) {
          currentCard.style.transform = `translateY(${translateY}px) scale(1)`
          currentCard.style.transition = 'none'
        }
      }

      // Reset after user stops scrolling
      wheelTimeout = setTimeout(() => {
        const currentCard = getCardByIndex(currentIndex)
        if (currentCard && !scrollState.current.isScrolling) {
          currentCard.style.transform = ''
          currentCard.style.transition =
            'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)'
        }
        scrollState.current.accumulatedDelta = 0
      }, 150)
    }

    feedEl.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      feedEl.removeEventListener('wheel', handleWheel)
      if (wheelTimeout) clearTimeout(wheelTimeout)
    }
  }, [videos, currentIndex, snapToIndex, getCardByIndex])

  // Touch handler with rubber-band effect
  useEffect(() => {
    const feedEl = feedRef.current
    if (!feedEl || !videos.length) return

    const handleTouchStart = (event: TouchEvent) => {
      if (scrollState.current.isScrolling) return
      scrollState.current.isDragging = true
      scrollState.current.startY = event.touches[0]?.clientY ?? 0
      scrollState.current.currentY = scrollState.current.startY
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!scrollState.current.isDragging || scrollState.current.isScrolling) return

      const touchY = event.touches[0]?.clientY ?? 0
      const deltaY = scrollState.current.startY - touchY
      scrollState.current.currentY = touchY

      // Check boundaries
      const isAtTop = currentIndex === 0 && deltaY < 0
      const isAtBottom = currentIndex === videos.length - 1 && deltaY > 0

      // Apply rubber-band resistance
      const resistance = isAtTop || isAtBottom ? 0.12 : 0.5 // More responsive touch
      const translateY = -deltaY * resistance
      const clampedTranslate = isAtTop || isAtBottom 
        ? Math.max(-50, Math.min(50, translateY))
        : translateY

      const currentCard = getCardByIndex(currentIndex)
      if (currentCard) {
        currentCard.style.transform = `translateY(${clampedTranslate}px) scale(1)`
        currentCard.style.transition = 'none'
      }

      // Prevent default scroll
      event.preventDefault()
    }

    const handleTouchEnd = () => {
      if (!scrollState.current.isDragging) return

      const deltaY = scrollState.current.startY - scrollState.current.currentY
      const cardHeight = feedEl.clientHeight
      const threshold = cardHeight * 0.25 // Match wheel threshold for consistency

      const currentCard = getCardByIndex(currentIndex)

      if (Math.abs(deltaY) >= threshold) {
        // Crossed threshold - snap to next/prev
        const direction = deltaY > 0 ? 1 : -1
        const nextIndex = currentIndex + direction

        if (nextIndex >= 0 && nextIndex < videos.length) {
          snapToIndex(nextIndex)
        } else {
          // Bounce back if at boundary
          if (currentCard) {
            currentCard.style.transform = ''
            currentCard.style.transition =
              'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)'
          }
        }
      } else {
        // Didn't cross threshold - snap back
        if (currentCard) {
          currentCard.style.transform = ''
          currentCard.style.transition =
            'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)'
        }
      }

      scrollState.current.isDragging = false
      scrollState.current.startY = 0
      scrollState.current.currentY = 0
    }

    feedEl.addEventListener('touchstart', handleTouchStart, { passive: true })
    feedEl.addEventListener('touchmove', handleTouchMove, { passive: false })
    feedEl.addEventListener('touchend', handleTouchEnd)
    feedEl.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      feedEl.removeEventListener('touchstart', handleTouchStart)
      feedEl.removeEventListener('touchmove', handleTouchMove)
      feedEl.removeEventListener('touchend', handleTouchEnd)
      feedEl.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [videos, currentIndex, snapToIndex, getCardByIndex])

  // Initialize first video on mount
  useEffect(() => {
    if (videos.length > 0 && currentIndex === 0) {
      snapToIndex(0, true)
    }
  }, [videos.length, snapToIndex, currentIndex])

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

        {videos.map((video, index) => {
          const isActive = index === currentIndex
          const isIncoming = index === currentIndex + 1
          const isOutgoing = index === currentIndex - 1

          return (
            <article
              key={video.id}
              data-feed-card="true"
              data-card-index={index}
              className={`feed-card ${isActive ? 'feed-card--active' : ''} ${
                isIncoming ? 'feed-card--incoming' : ''
              } ${isOutgoing ? 'feed-card--outgoing' : ''}`}
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
          )
        })}
      </section>
    </main>
  )
}

export default App
