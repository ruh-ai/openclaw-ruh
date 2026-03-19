"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CarouselSlide } from "../interfaces";

// carousel images for auth carousel component
export const carouselSlides: CarouselSlide[] = [
  {
    image: "/assets/carousel/carousel-1.svg",
    title: "Build Powerful Developer Tools with OpenClaw",
  },
  {
    image: "/assets/carousel/carousel-2.svg",
    title: "Automate Your Development Workflow with AI-Powered Solutions",
  },
  {
    image: "/assets/carousel/carousel-3.svg",
    title: "Connect and Deploy Across Multiple Platforms Seamlessly",
  },
];

export function ImageCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide((prev) =>
      prev === carouselSlides.length - 1 ? 0 : prev + 1
    );
  };

  const prevSlide = () => {
    setCurrentSlide((prev) =>
      prev === 0 ? carouselSlides.length - 1 : prev - 1
    );
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="overflow-hidden rounded-lg">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {carouselSlides.map((slide, index) => (
            <div key={index} className="w-full flex-shrink-0">
              <div className="flex flex-col items-center p-8">
                <div className="relative w-full h-84 mb-8">
                  <Image
                    src={slide.image || "/placeholder.svg"}
                    alt={slide.title}
                    fill
                    className="object-contain"
                  />
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-semibold max-w-[450px] text-brand-primary-font">
                    {slide.title}
                  </h2>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Navigation Controls */}
      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          onClick={prevSlide}
          className="w-10 h-10 flex items-center justify-center text-gray-800 hover:text-gray-600 focus:outline-none cursor-pointer"
          aria-label="Previous slide"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="flex justify-center gap-2">
          {carouselSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full ${
                currentSlide === index ? "bg-brand-primary" : "bg-gray-300"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        <button
          onClick={nextSlide}
          className="w-10 h-10 flex items-center justify-center text-gray-800 hover:text-gray-600 focus:outline-none cursor-pointer"
          aria-label="Next slide"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}
