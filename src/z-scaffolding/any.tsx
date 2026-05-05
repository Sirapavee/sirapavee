import { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ─── Config & Data ──────────────────────────────────────
const SECTIONS = [
  { id: 'hero', label: 'Home', z: 0 },
  { id: 'about', label: 'About', z: -2400 },
  { id: 'work', label: 'Work', z: -4800 },
  { id: 'skills', label: 'Skills', z: -7200 },
  { id: 'contact', label: 'Contact', z: -9600 },
];

const PROJECTS = [
  {
    num: '001',
    name: 'Nebula Dashboard',
    desc: 'Real-time analytics with 3D data visualization and fluid transitions.',
    tags: ['React', 'Three.js', 'D3'],
  },
  {
    num: '002',
    name: 'Atelier Store',
    desc: 'E-commerce experience with WebGL product showcase and scroll-driven animations.',
    tags: ['Next.js', 'GSAP', 'Shopify'],
  },
  {
    num: '003',
    name: 'Wavelength',
    desc: 'Music streaming UI with generative visuals reacting to audio in real-time.',
    tags: ['Web Audio', 'Canvas', 'Vue'],
  },
];

const SKILLS = [
  { name: 'React', hl: true },
  { name: 'Next.js', hl: true },
  { name: 'TypeScript', hl: false },
  { name: 'Three.js', hl: true },
  { name: 'GSAP', hl: true },
  { name: 'Tailwind CSS', hl: true },
  { name: 'Framer Motion', hl: false },
  { name: 'WebGL / GLSL', hl: false },
  { name: 'Node.js', hl: false },
  { name: 'Figma', hl: false },
  { name: 'Git', hl: false },
  { name: 'Vercel', hl: false },
];

const TOTAL_DEPTH = 9600;
const PERSPECTIVE = 800;
const STAR_COUNT = 70;

// ─── Sub-components ─────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <span className='inline-block border-b border-white/[0.08] pb-2 font-mono text-[0.7rem] tracking-[0.25em] text-[#e8ff47] uppercase'>
      {children}
    </span>
  );
}

function ProjectCard({ num, name, desc, tags }) {
  return (
    <div className='group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] p-7 transition-all duration-300 hover:border-[#e8ff47]/20 hover:bg-white/[0.06]'>
      <div className='absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-[#e8ff47] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100' />
      <span className='font-mono text-[0.62rem] tracking-[0.15em] text-[#5a5a6e]'>
        {num}
      </span>
      <h3 className='mt-3 mb-2 font-serif text-[1.4rem] text-[#f0ece4]'>{name}</h3>
      <p className='text-[0.82rem] leading-relaxed font-light text-[#5a5a6e]'>{desc}</p>
      <div className='mt-4 flex flex-wrap gap-1.5'>
        {tags.map((tag) => (
          <span
            key={tag}
            className='rounded-full border border-white/[0.08] px-2.5 py-1 font-mono text-[0.58rem] tracking-wider text-[#5a5a6e] uppercase'
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function SkillPill({ name, highlighted }) {
  return (
    <span
      className={`cursor-default rounded-full border px-5 py-2 text-[0.88rem] transition-all duration-300 ${
        highlighted
          ? 'border-[#e8ff47] bg-[#e8ff47] font-semibold text-[#0a0a0c]'
          : 'border-white/[0.08] bg-white/[0.04] text-[#f0ece4] hover:border-[#e8ff47] hover:bg-[#e8ff47]/5 hover:text-[#e8ff47]'
      }`}
    >
      {name}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────
export default function ZAxisScroll() {
  const viewportRef = useRef(null);
  const sectionRefs = useRef([]);
  const starfieldRef = useRef(null);
  const progressRef = useRef(null);
  const dotRefs = useRef([]);

  const setSectionRef = useCallback((el, i) => {
    sectionRefs.current[i] = el;
  }, []);

  const setDotRef = useCallback((el, i) => {
    dotRefs.current[i] = el;
  }, []);

  // ── Starfield particles ──
  useEffect(() => {
    const container = starfieldRef.current;
    if (!container) return;

    const stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = document.createElement('div');
      const size = Math.random() * 2 + 1;
      Object.assign(star.style, {
        position: 'absolute',
        borderRadius: '50%',
        background: '#f0ece4',
        width: `${size}px`,
        height: `${size}px`,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        opacity: String(Math.random() * 0.4 + 0.1),
      });
      container.appendChild(star);
      stars.push(star);

      gsap.to(star, {
        opacity: Math.random() * 0.5 + 0.1,
        duration: Math.random() * 3 + 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: Math.random() * 3,
      });
    }

    return () => {
      stars.forEach((s) => {
        gsap.killTweensOf(s);
        s.remove();
      });
    };
  }, []);

  // ── GSAP ScrollTrigger z-axis engine ──
  useEffect(() => {
    const els = sectionRefs.current.filter(Boolean);

    els.forEach((sec, i) => {
      const z = SECTIONS[i].z;
      gsap.set(sec, {
        z,
        opacity: z === 0 ? 1 : 0,
        display: z === 0 ? 'flex' : 'none',
      });
    });

    const trigger = ScrollTrigger.create({
      trigger: '#z-scroll-spacer',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate(self) {
        const p = self.progress;
        const camZ = p * TOTAL_DEPTH;

        els.forEach((sec, i) => {
          const baseZ = Math.abs(SECTIONS[i].z);
          const cz = baseZ - camZ;

          let op, disp;
          if (cz < -250) {
            op = 0;
            disp = 'none';
          } else if (cz > PERSPECTIVE) {
            op = 0;
            disp = 'none';
          } else if (cz > PERSPECTIVE * 0.55) {
            op = 1 - (cz - PERSPECTIVE * 0.55) / (PERSPECTIVE * 0.45);
            disp = 'flex';
          } else if (cz < 0) {
            op = Math.max(0, 1 + cz / 250);
            disp = 'flex';
          } else {
            op = 1;
            disp = 'flex';
          }

          gsap.set(sec, { z: -cz, opacity: op, display: disp });
        });

        if (progressRef.current) {
          gsap.set(progressRef.current, { scaleX: p });
        }

        const activeIdx = Math.min(els.length - 1, Math.floor(p * els.length + 0.3));
        dotRefs.current.forEach((d, i) => {
          if (d) d.classList.toggle('z-dot-active', i === activeIdx);
        });
      },
    });

    return () => trigger.kill();
  }, []);

  // ── Mouse parallax on perspective origin ──
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    function onMove(e) {
      const xP = (e.clientX / window.innerWidth - 0.5) * 2;
      const yP = (e.clientY / window.innerHeight - 0.5) * 2;
      gsap.to(vp, {
        perspectiveOrigin: `${50 + xP * 5}% ${50 + yP * 5}%`,
        duration: 0.8,
        ease: 'power2.out',
      });
    }

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  function scrollToSection(index) {
    const spacer = document.getElementById('z-scroll-spacer');
    if (!spacer) return;
    const total = spacer.scrollHeight - window.innerHeight;
    const target = (index / (SECTIONS.length - 1)) * total;
    window.scrollTo({ top: target, behavior: 'smooth' });
  }

  // ─── Render ───────────────────────────────────────────
  return (
    <>
      {/* Scoped CSS for 3D properties + effects Tailwind can't express */}
      <style>{`
        .z-viewport {
          perspective: ${PERSPECTIVE}px;
          perspective-origin: 50% 50%;
        }
        .z-scene {
          transform-style: preserve-3d;
        }
        .z-frame {
          transform-style: preserve-3d;
          will-change: transform, opacity;
          backface-visibility: hidden;
        }
        .z-grain-bg {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .z-dot-active {
          border-color: #e8ff47 !important;
          background-color: #e8ff47 !important;
          box-shadow: 0 0 12px rgba(232, 255, 71, 0.4);
        }
        .z-nav-dot::after {
          content: attr(data-label);
          position: absolute;
          right: 1.4rem;
          top: 50%;
          transform: translateY(-50%);
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 0.58rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #5a5a6e;
          white-space: nowrap;
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .z-nav-dot:hover::after {
          opacity: 1;
        }
        @keyframes z-pulse-down {
          0%, 100% { opacity: 0.3; transform: scaleY(0.6); }
          50% { opacity: 1; transform: scaleY(1); }
        }
      `}</style>

      {/* Grain overlay */}
      <div
        className='z-grain-bg pointer-events-none fixed z-[999] opacity-[0.025]'
        style={{ inset: '-50%', width: '200%', height: '200%' }}
      />

      {/* Vignette */}
      <div
        className='pointer-events-none fixed inset-0 z-[2]'
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      {/* Progress bar */}
      <div
        ref={progressRef}
        className='fixed top-0 left-0 z-[100] h-[2px] w-full origin-left scale-x-0 bg-[#e8ff47]'
      />

      {/* Starfield */}
      <div ref={starfieldRef} className='pointer-events-none fixed inset-0 z-0' />

      {/* Nav dots */}
      <nav className='fixed top-1/2 right-7 z-10 flex -translate-y-1/2 flex-col gap-3.5'>
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => setDotRef(el, i)}
            data-label={s.label}
            onClick={() => scrollToSection(i)}
            className={`z-nav-dot relative h-2 w-2 cursor-pointer rounded-full border border-[#5a5a6e] bg-transparent transition-all duration-300 ${
              i === 0 ? 'z-dot-active' : ''
            }`}
            aria-label={`Go to ${s.label}`}
          />
        ))}
      </nav>

      {/* ── 3D Viewport ── */}
      <div ref={viewportRef} className='z-viewport fixed inset-0 z-[1] overflow-hidden'>
        <div className='z-scene absolute inset-0'>
          {/* Hero */}
          <section
            ref={(el) => setSectionRef(el, 0)}
            className='z-frame absolute inset-0 flex items-center justify-center'
          >
            <div className='flex w-[85%] max-w-[1000px] flex-col items-center gap-6 text-center'>
              <span className='font-mono text-[0.72rem] tracking-[0.3em] text-[#e8ff47] uppercase'>
                Portfolio — 2026
              </span>
              <h1 className='font-serif text-[clamp(3rem,8vw,7.5rem)] leading-[0.95] font-normal tracking-tight text-[#f0ece4]'>
                Creative
                <br />
                <em className='text-[#e8ff47] italic'>Developer</em>
              </h1>
              <p className='max-w-[460px] text-lg leading-relaxed font-light text-[#5a5a6e]'>
                Building immersive digital experiences through code, motion, and
                meticulous craft.
              </p>
              <div className='mt-8 flex flex-col items-center gap-2'>
                <span className='font-mono text-[0.62rem] tracking-[0.2em] text-[#5a5a6e] uppercase'>
                  Scroll to explore
                </span>
                <div
                  className='h-10 w-px bg-gradient-to-b from-[#e8ff47] to-transparent'
                  style={{ animation: 'z-pulse-down 2s ease-in-out infinite' }}
                />
              </div>
            </div>
          </section>

          {/* About */}
          <section
            ref={(el) => setSectionRef(el, 1)}
            className='z-frame absolute inset-0 flex items-center justify-center'
          >
            <div className='w-[85%] max-w-[1000px] text-left'>
              <SectionLabel>01 — About</SectionLabel>
              <h2 className='mt-4 font-serif text-[clamp(2rem,5vw,4rem)] leading-tight font-normal text-[#f0ece4]'>
                Designing at the intersection of code &amp; art
              </h2>
              <p className='mt-4 max-w-[600px] text-base leading-loose font-light text-[#5a5a6e]'>
                I&apos;m a frontend developer who obsesses over the details — the
                micro-interactions, the scroll behaviors, the pixel-perfect alignments. I
                believe the web should feel alive, surprising, and intentional.
              </p>
            </div>
          </section>

          {/* Work */}
          <section
            ref={(el) => setSectionRef(el, 2)}
            className='z-frame absolute inset-0 flex items-center justify-center'
          >
            <div className='w-[85%] max-w-[1000px] text-left'>
              <SectionLabel>02 — Selected Work</SectionLabel>
              <div className='mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'>
                {PROJECTS.map((p) => (
                  <ProjectCard key={p.num} {...p} />
                ))}
              </div>
            </div>
          </section>

          {/* Skills */}
          <section
            ref={(el) => setSectionRef(el, 3)}
            className='z-frame absolute inset-0 flex items-center justify-center'
          >
            <div className='w-[85%] max-w-[1000px] text-left'>
              <SectionLabel>03 — Toolkit</SectionLabel>
              <h2 className='mt-4 font-serif text-[clamp(2rem,5vw,4rem)] leading-tight font-normal text-[#f0ece4]'>
                Technologies I work with
              </h2>
              <div className='mt-8 flex flex-wrap gap-2.5'>
                {SKILLS.map((s) => (
                  <SkillPill key={s.name} name={s.name} highlighted={s.hl} />
                ))}
              </div>
            </div>
          </section>

          {/* Contact */}
          <section
            ref={(el) => setSectionRef(el, 4)}
            className='z-frame absolute inset-0 flex items-center justify-center'
          >
            <div className='flex w-[85%] max-w-[1000px] flex-col items-center gap-6 text-center'>
              <SectionLabel>04 — Contact</SectionLabel>
              <h2 className='font-serif text-[clamp(2.5rem,6vw,5.5rem)] leading-none font-normal text-[#f0ece4]'>
                Let&apos;s build
                <br />
                something <em className='text-[#e8ff47] italic'>great</em>
              </h2>
              <p className='max-w-[460px] text-lg leading-relaxed font-light text-[#5a5a6e]'>
                Have a project in mind? I&apos;d love to hear about it.
              </p>
              <div className='mt-4 flex flex-wrap justify-center gap-4'>
                {['Email', 'GitHub', 'LinkedIn', 'Twitter'].map((link) => (
                  <a
                    key={link}
                    href='#'
                    className='rounded-full border border-white/[0.08] px-5 py-2.5 font-mono text-[0.72rem] tracking-wider text-[#5a5a6e] uppercase no-underline transition-all duration-300 hover:border-[#e8ff47] hover:text-[#e8ff47]'
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Scroll spacer — drives the ScrollTrigger */}
      <div id='z-scroll-spacer' className='pointer-events-none h-[600vh]' />
    </>
  );
}
