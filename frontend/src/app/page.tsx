import SmoothScroll from '@/components/landing/SmoothScroll'
import Navbar from '@/components/layout/Navbar'
import ScrollStory from '@/components/landing/ScrollStory'
import LabScene from '@/components/three/LabScene'
import { Particles } from '@/components/ui/particles'
import { CAMERA_SEQUENCE, CHAPTERS } from '@/components/landing/chapters'

export default function Home() {
  return (
    <main className="relative bg-[#070b0c]">
      <Navbar />

      {/* Particle background — sits behind the 3D model */}
      <div className="fixed inset-0 z-[1]">
        <Particles
          quantity={150}
          color="#2DD4BF"
          size={0.5}
          staticity={40}
          ease={60}
          className="h-full w-full"
        />
      </div>

      {/* Pinned 3D stage — stays put while the page scrolls. */}
      <div className="fixed inset-0 z-[2]">
        <LabScene scrollSequence={CAMERA_SEQUENCE} />
      </div>


      {/* Pinned scrollytelling copy that crossfades chapter by chapter. */}
      <ScrollStory />

      {/* Invisible spacer sections only provide the scroll distance — one per
          chapter. The fixed stage + overlay above read the scroll progress. */}
      <SmoothScroll>
        {CHAPTERS.map((c, i) => (
          <section
            key={c.cam + i}
            id={i === 0 ? 'hero' : `section-${i}`}
            className="relative z-0 h-[150vh] pointer-events-none"
          />
        ))}
      </SmoothScroll>
    </main>
  )
}
