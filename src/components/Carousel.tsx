import { useState, useEffect } from 'react'
import carouselData from '../data/carouselImages.json'
import type { CarouselImage } from '../types'
import './Carousel.css'

function Carousel() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const images = carouselData as CarouselImage[]

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [images.length])

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length)
  }

  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length)
  }

  return (
    <div className="carousel">
      <div className="carousel-inner">
        <button className="carousel-button carousel-button-left" onClick={goToPrevious}>
          ‹
        </button>
        <div className="carousel-slide">
          <img
            src={images[currentIndex].image}
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
