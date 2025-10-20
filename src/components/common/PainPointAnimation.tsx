import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

const PAIN_POINTS_COUNT = 50;
const AUTO_PLAY_INTERVAL = 5000; // 5 seconds per state (problem/solution)
const INACTIVITY_TIMEOUT = 10000; // 10 seconds of inactivity before resuming auto-play

// Fisher-Yates shuffle algorithm
const shuffleArray = (array: number[]): number[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const PainPointAnimation: React.FC = () => {
  const { t } = useLanguage();

  // Create shuffled order of pain points on mount
  const [shuffledIndices] = useState(() =>
    shuffleArray(Array.from({ length: PAIN_POINTS_COUNT }, (_, i) => i))
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-play effect
  useEffect(() => {
    if (isPaused) {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      return;
    }

    autoPlayTimerRef.current = setTimeout(() => {
      if (!showSolution) {
        // Transition to solution
        setIsTransitioning(true);
        setTimeout(() => {
          setShowSolution(true);
          setIsTransitioning(false);
        }, 300);
      } else {
        // Transition to next problem
        setIsTransitioning(true);
        setTimeout(() => {
          setShowSolution(false);
          setCurrentIndex((prev) => (prev + 1) % PAIN_POINTS_COUNT);
          setIsTransitioning(false);
        }, 300);
      }
    }, AUTO_PLAY_INTERVAL);

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [currentIndex, showSolution, isPaused]);

  // Inactivity timer - resume auto-play after 10 seconds of no interaction
  useEffect(() => {
    if (!isPaused) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    inactivityTimerRef.current = setTimeout(() => {
      setIsPaused(false);
    }, INACTIVITY_TIMEOUT);

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isPaused, lastInteractionTime]);

  // Get current pain point data from translations using shuffled order
  const shuffledPainPointIndex = shuffledIndices[currentIndex];
  const painPointIndex = shuffledPainPointIndex + 1; // Translation keys are 1-indexed
  const category = t(`painPoints.${painPointIndex}.category` as any);
  const problem = t(`painPoints.${painPointIndex}.problem` as any);
  const solution = t(`painPoints.${painPointIndex}.solution` as any);

  // Manual control handlers
  const handlePauseToggle = () => {
    setIsPaused(!isPaused);
    setLastInteractionTime(Date.now());
  };

  const handlePrevious = () => {
    setIsPaused(true);
    setLastInteractionTime(Date.now());
    setIsTransitioning(true);
    setTimeout(() => {
      setShowSolution(false);
      setCurrentIndex((prev) => (prev - 1 + PAIN_POINTS_COUNT) % PAIN_POINTS_COUNT);
      setIsTransitioning(false);
    }, 300);
  };

  const handleNext = () => {
    setIsPaused(true);
    setLastInteractionTime(Date.now());
    setIsTransitioning(true);
    setTimeout(() => {
      setShowSolution(false);
      setCurrentIndex((prev) => (prev + 1) % PAIN_POINTS_COUNT);
      setIsTransitioning(false);
    }, 300);
  };

  const handleDotClick = (index: number) => {
    setIsPaused(true);
    setLastInteractionTime(Date.now());
    setCurrentIndex(index);
    setShowSolution(false);
    setIsTransitioning(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Main Animation Card */}
      <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 md:p-12 shadow-2xl border border-white/20 relative overflow-hidden">
        {/* Background gradient that changes with state */}
        <div
          className={`absolute inset-0 transition-all duration-500 ${
            showSolution
              ? 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10'
              : 'bg-gradient-to-br from-red-500/10 to-orange-500/10'
          }`}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Category Tag */}
          <div className="flex items-center justify-between mb-6">
            <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/30">
              <span className="text-xs md:text-sm font-medium text-white">
                {category}
              </span>
            </div>

            {/* Progress Counter */}
            <div className="text-xs md:text-sm text-white/70 font-medium">
              {painPointIndex} of {PAIN_POINTS_COUNT}
            </div>
          </div>

          {/* Icon and Text Container */}
          <div
            className={`transition-all duration-300 ${
              isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div
                className={`rounded-xl p-3 transition-all duration-500 ${
                  showSolution
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                    : 'bg-gradient-to-br from-red-500 to-red-600'
                }`}
              >
                {showSolution ? (
                  <CheckCircle className="h-8 w-8 text-white" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-white" />
                )}
              </div>
            </div>

            {/* State Label */}
            <div className="mb-4 text-center">
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold transition-all duration-500 ${
                  showSolution
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              >
                {showSolution ? t('painPoints.label.solution') : t('painPoints.label.problem')}
              </span>
            </div>

            {/* Text Content */}
            <div className="min-h-[120px] md:min-h-[100px]">
              <p
                className={`text-xl md:text-2xl lg:text-3xl font-semibold leading-relaxed transition-all duration-500 ${
                  showSolution ? 'text-emerald-100' : 'text-white'
                }`}
              >
                {showSolution ? solution : problem}
              </p>
            </div>
          </div>

          {/* Manual Controls */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={handlePrevious}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/30 transition-all duration-300 hover:scale-110"
              aria-label="Previous pain point"
            >
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>

            <button
              onClick={handlePauseToggle}
              className={`p-2 rounded-lg border transition-all duration-300 hover:scale-110 ${
                isPaused
                  ? 'bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/30'
                  : 'bg-white/10 border-white/30 hover:bg-white/20'
              }`}
              aria-label={isPaused ? 'Resume auto-play' : 'Pause auto-play'}
            >
              {isPaused ? (
                <Play className="h-5 w-5 text-emerald-300" />
              ) : (
                <Pause className="h-5 w-5 text-white" />
              )}
            </button>

            <button
              onClick={handleNext}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/30 transition-all duration-300 hover:scale-110"
              aria-label="Next pain point"
            >
              <ChevronRight className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Progress Dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {Array.from({ length: PAIN_POINTS_COUNT }, (_, index) => (
              <button
                key={index}
                onClick={() => handleDotClick(index)}
                className={`transition-all duration-300 rounded-full ${
                  index === currentIndex
                    ? 'w-8 h-2 bg-gradient-to-r from-cyan-400 to-blue-400'
                    : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Go to pain point ${index + 1}`}
              />
            ))}
          </div>

          {/* Auto-play status indicator */}
          {isPaused && (
            <div className="text-center mt-4">
              <p className="text-xs text-white/50">
                Auto-play paused • Will resume in 10s
              </p>
            </div>
          )}

          {/* Visual Progress Bar */}
          <div className="mt-6 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                showSolution
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                  : 'bg-gradient-to-r from-red-400 to-orange-400'
              }`}
              style={{
                width: !isPaused && showSolution ? '100%' : '0%',
                transition: isPaused ? 'width 0.3s ease, background-color 0.3s ease' : 'width 5s linear, background-color 0.3s ease'
              }}
              key={`${currentIndex}-${showSolution}-${isPaused}`}
            />
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center mt-8">
        <p className="text-blue-200 mb-4">
          {t('painPoints.cta.text')}
        </p>
        <a
          href="/contact"
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {t('painPoints.cta.button')}
        </a>
      </div>
    </div>
  );
};

export default PainPointAnimation;
