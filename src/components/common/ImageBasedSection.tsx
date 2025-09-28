import React from 'react';
import ParticleBackground from './ParticleBackground';
import LoadingSpinner from './LoadingSpinner';

interface ImageBasedSectionProps {
  imageUrl: string;
  children: React.ReactNode;
  className?: string;
  height?: number; // Optional height override to match current particle areas
}

const ImageBasedSection: React.FC<ImageBasedSectionProps> = ({
  imageUrl,
  children,
  className = "relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white overflow-hidden cursor-crosshair",
  height
}) => {
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const [imageDimensions, setImageDimensions] = React.useState<{width: number, height: number} | null>(null);

  React.useEffect(() => {
    // Match the exact dimensions of Services/About/Contact sections
    // These sections use: py-20 (160px) + content (varies but typically 400-500px)
    // Services section height is approximately: 160px (py-20) + ~420px content = ~580px
    // About section height is approximately: 160px (py-20) + ~450px content = ~610px
    // Contact section height is approximately: 160px (py-20) + ~400px content = ~560px
    // Average: ~580px

    const width = window.innerWidth;
    const sectionHeight = height || 580; // Match typical section height

    setImageDimensions({ width, height: sectionHeight });

    // Handle window resize
    const handleResize = () => {
      const newWidth = window.innerWidth;
      setImageDimensions({ width: newWidth, height: sectionHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  if (!imageDimensions) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
        <LoadingSpinner size="lg" color="white" text="Loading..." />
      </div>
    );
  }

  return (
    <div className="w-full">
      <section
        ref={sectionRef}
        className={`${className} overflow-hidden`}
        style={{
          width: `${imageDimensions.width}px`,
          height: `${imageDimensions.height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          // Only trigger particles if click is within image bounds
          if (clickX >= 0 && clickX <= imageDimensions.width &&
              clickY >= 0 && clickY <= imageDimensions.height) {
            const particleEvent = new CustomEvent('generateParticles', {
              detail: { x: clickX, y: clickY }
            });
            window.dispatchEvent(particleEvent);
          }
        }}
      >
        {/* Dot pattern overlay */}
        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}></div>
        </div>

        {/* Background Photo - sized to match container exactly */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{
            backgroundImage: `url("${imageUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />

        {/* Particle Background with exact image boundaries */}
        <ParticleBackground
          containerRef={sectionRef}
          boundaries={{
            left: 0,
            top: 0,
            right: imageDimensions.width,
            bottom: imageDimensions.height
          }}
        />

        {/* Content */}
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          {children}
        </div>
      </section>
    </div>
  );
};

export default ImageBasedSection;