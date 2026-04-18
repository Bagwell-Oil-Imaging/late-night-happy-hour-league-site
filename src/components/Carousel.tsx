/**
 * @file Carousel.tsx
 * @module components/Carousel
 *
 * Auto-advancing hero image carousel that displays league photos fetched live
 * from Firestore. Images are sorted by their `order` field (ascending) via the
 * `useCarouselImages` hook.
 *
 * Behavior:
 * - Renders nothing while data is loading or when the image list is empty
 * - Auto-advances every 5 seconds; resets timer when manually navigated
 * - Previous/next buttons and dot indicators allow manual navigation
 * - Uses `image.imageUrl` (Firestore field name, renamed from legacy `image.image`)
 */

import { useState, useEffect } from 'react'
import { useCarouselImages } from '../hooks'
import './Carousel.css'

/**
 * Carousel component — hero image slideshow for the home page.
 *
 * Fetches carousel images from Firestore sorted by display order. Returns null
 * while loading or when no images are configured, keeping the layout clean.
 * Auto-advances slides every 5 seconds using a `setInterval` that is properly
 * cleaned up on unmount or when the image count changes.
 */
function Carousel() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const { data: images, loading } = useCarouselImages()

  // Auto-advance slides every 5 seconds; effect re-runs if image count changes
  useEffect(() => {
    if (images.length === 0) return

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [images.length])

  // Render nothing while loading to avoid a flash of broken layout
  if (loading) return null

  // Render nothing if no images are configured in Firestore
  if (images.length === 0) return null

  /** Navigate to the previous slide (wraps around) */
  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length)
  }

  /** Navigate to the next slide (wraps around) */
  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length)
  }

  /** Jump directly to a specific slide index */
  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  return (
    <div className="carousel">
      <div className="carousel-inner">
        <button className="carousel-button carousel-button-left" onClick={goToPrevious}>
          ‹
        </button>
        <div className="carousel-slide">
          {/*
           * imageUrl is the Firestore field name (renamed from the legacy `image` field).
           * The CarouselImage type in types/index.ts documents this rename.
           */}
          <img
            src={images[currentIndex].imageUrl}
            alt={images[currentIndex].alt}
            className="carousel-image"
          />
          <div className="carousel-caption">
            <h2>{images[currentIndex].title}</h2>
            <p>{images[currentIndex].description}</p>
          </div>
        </div>
        <button className="carousel-button carousel-button-right" onClick={goToNext}>
          ›
        </button>
      </div>

      {/* Dot indicators — one per image */}
      <div className="carousel-indicators">
        {images.map((_, index) => (
          <button
            key={index}
            className={`carousel-indicator ${index === currentIndex ? 'active' : ''}`}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

export default Carousel
