"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useEffect, useState, Component, ReactNode } from "react";
import * as THREE from "three";

class CanvasErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
        constructor(props: { children: ReactNode; fallback: ReactNode }) {
                super(props);
                this.state = { hasError: false };
        }
        static getDerivedStateFromError() {
                return { hasError: true };
        }
        componentDidCatch(error: any, errorInfo: any) {
                console.error("Canvas Error:", error, errorInfo);
        }
        render() {
                if (this.state.hasError) return this.props.fallback;
                return this.props.children;
        }
}

function isWebGLAvailable() {
        try {
                const canvas = document.createElement("canvas");
                return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
        } catch (e) {
                return false;
        }
}
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Note: SplitText is a GSAP Premium plugin. 
// Since we don't have access to premium plugins in this environment, 
// we will implement a standard GSAP animation that mimics the effect.

interface ShaderPlaneProps {
        vertexShader: string;
        fragmentShader: string;
        uniforms: { [key: string]: { value: unknown } };
}

const ShaderPlane = ({
        vertexShader,
        fragmentShader,
        uniforms,
}: ShaderPlaneProps) => {
        const meshRef = useRef<THREE.Mesh>(null);
        const { size, gl } = useThree();

        useEffect(() => {
                if (!gl.getContext()) {
                        console.error("WebGL Context could not be created.");
                }
        }, [gl]);

        useFrame((state) => {
                if (meshRef.current) {
                        const material = meshRef.current.material as THREE.ShaderMaterial;
                        material.uniforms.u_time.value = state.clock.elapsedTime * 0.5;
                        material.uniforms.u_resolution.value.set(size.width, size.height, 1.0);
                }
        });

        return (
                <mesh ref={meshRef}>
                        <planeGeometry args={[2, 2]} />
                        <shaderMaterial
                                vertexShader={vertexShader}
                                fragmentShader={fragmentShader}
                                uniforms={uniforms}
                                side={THREE.FrontSide}
                                depthTest={false}
                                depthWrite={false}
                        />
                </mesh>
        );
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform float u_time;
  uniform vec3 u_resolution;

  vec2 toPolar(vec2 p) {
      float r = length(p);
      float a = atan(p.y, p.x);
      return vec2(r, a);
  }

  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 p = 6.0 * ((fragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y);

      vec2 polar = toPolar(p);
      float r = polar.x;
      float a = polar.y;

      vec2 i = p;
      float c = 0.0;
      float rot = r + u_time + p.x * 0.100;
      for (float n = 0.0; n < 4.0; n++) {
          float rr = r + 0.15 * sin(u_time*0.7 + float(n) + r*2.0);
          float cosRot = cos(rot - sin(u_time / 10.0));
          float sinRot = sin(rot);
          float mCosRot = cos(rot);
          float mSinRot = -sin(mCosRot - u_time / 10.0);
          
          p *= mat2(
              cosRot, sinRot,
              mSinRot, cosRot
          ) * -0.25;

          float t = r - u_time / (n + 30.0);
          i -= p + sin(t - i.y) + rr;

          c += 2.2 / length(vec2(
              (sin(i.x + t) / 0.15),
              (cos(i.y + t) / 0.15)
          ));
      }

      c /= 8.0;

      // BLUE COLOR: #00abec → RGB(0, 171, 236) → Normalized(0.0, 0.67, 0.93)
      vec3 baseColor = vec3(0.0, 0.67, 0.93);
      vec3 finalColor = baseColor * smoothstep(0.0, 1.0, c * 0.6);

      fragColor = vec4(finalColor, 1.0);
  }

  void main() {
      vec4 fragColor;
      vec2 fragCoord = vUv * u_resolution.xy;
      mainImage(fragColor, fragCoord);
      gl_FragColor = fragColor;
  }
`;

interface HeroProps {
        title?: string;
        description?: string;
        badgeText?: string;
        badgeLabel?: string;
        ctaButtons?: Array<{ text: string; href?: string; primary?: boolean; onClick?: () => void }>;
        microDetails?: Array<string>;
}

const SyntheticHero = ({
        title = "Restaurant Digital Buzzer System",
        description = "Experience the future of restaurant service. Instant notifications, real-time tracking, and seamless communication — all from your phone.",
        badgeText = "Next Gen Dining",
        badgeLabel = "Service",
        ctaButtons = [],
        microDetails = [
                "Real-time status updates",
                "One-tap waiter calling",
                "No apps to download",
        ],
}: HeroProps) => {
        const sectionRef = useRef<HTMLElement | null>(null);
        const badgeWrapperRef = useRef<HTMLDivElement | null>(null);
        const headingRef = useRef<HTMLHeadingElement | null>(null);
        const paragraphRef = useRef<HTMLParagraphElement | null>(null);
        const ctaRef = useRef<HTMLDivElement | null>(null);
        const microRef = useRef<HTMLUListElement | null>(null);
        
        const shaderUniforms = useMemo(
                () => ({
                        u_time: { value: 0 },
                        u_resolution: { value: new THREE.Vector3(1, 1, 1) },
                }),
                [],
        );

        useGSAP(
                () => {
                        if (!headingRef.current) return;

                        // Animation timeline
                        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

                        // Initial state
                        gsap.set([badgeWrapperRef.current, headingRef.current, paragraphRef.current, ctaRef.current], { 
                                autoAlpha: 0, 
                                y: 20
                        });

                        const microItems = microRef.current ? Array.from(microRef.current.querySelectorAll("li")) : [];
                        if (microItems.length > 0) {
                                gsap.set(microItems, { autoAlpha: 0, y: 10 });
                        }

                        // Sequence
                        tl.to(badgeWrapperRef.current, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.2)
                          .to(headingRef.current, { autoAlpha: 1, y: 0, duration: 1 }, "-=0.4")
                          .to(paragraphRef.current, { autoAlpha: 1, y: 0, duration: 0.8 }, "-=0.6")
                          .to(ctaRef.current, { autoAlpha: 1, y: 0, duration: 0.8 }, "-=0.4");

                        if (microItems.length > 0) {
                                tl.to(microItems, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 }, "-=0.2");
                        }
                },
                { scope: sectionRef }
        );

        const [webGlError, setWebGlError] = useState(!isWebGLAvailable());

        return (
                <section
                        ref={sectionRef}
                        className="relative flex items-center justify-center min-h-[70vh] overflow-hidden rounded-3xl mx-4 my-8 bg-slate-900"
                >
                        <div className="absolute inset-0 z-0">
                                {!webGlError ? (
                                        <CanvasErrorBoundary fallback={<div className="absolute inset-0 bg-gradient-to-br from-[#00abec]/40 to-slate-900" />}>
                                                <Canvas 
                                                        camera={{ position: [0, 0, 1] }}
                                                        onCreated={({ gl }) => {
                                                                if (!gl.getContext()) setWebGlError(true);
                                                        }}
                                                        onError={() => setWebGlError(true)}
                                                >
                                                        <ShaderPlane
                                                                vertexShader={vertexShader}
                                                                fragmentShader={fragmentShader}
                                                                uniforms={shaderUniforms}
                                                        />
                                                </Canvas>
                                        </CanvasErrorBoundary>
                                ) : (
                                        <div className="absolute inset-0 bg-gradient-to-br from-[#00abec]/40 to-slate-900" />
                                )}
                        </div>

                        {/* Dark wash for readability as per design guidelines */}
                        <div className="absolute inset-0 z-[5] bg-gradient-to-b from-black/40 via-transparent to-black/40 pointer-events-none" />

                        <div className="relative z-10 flex flex-col items-center text-center px-6 py-20">
                                <div ref={badgeWrapperRef}>
                                        <Badge className="mb-6 bg-white/10 hover:bg-white/15 text-[#00abec] backdrop-blur-md border border-white/20 uppercase tracking-wider font-medium flex items-center gap-2 px-4 py-1.5 no-default-hover-elevate">
                                                <span className="text-[10px] font-light tracking-[0.18em] text-[#a0e7ff]/80">
                                                        {badgeLabel}
                                                </span>
                                                <span className="h-1 w-1 rounded-full bg-[#00abec]/60" />
                                                <span className="text-xs font-light tracking-tight text-[#00abec]">
                                                        {badgeText}
                                                </span>
                                        </Badge>
                                </div>

                                <h1
                                        ref={headingRef}
                                        className="text-4xl md:text-6xl max-w-4xl font-bold tracking-tight text-white mb-4 drop-shadow-lg"
                                >
                                        {title}
                                </h1>

                                <p
                                        ref={paragraphRef}
                                        className="text-white/90 text-lg max-w-2xl mx-auto mb-10 font-medium drop-shadow-md"
                                >
                                        {description}
                                </p>

                                <div
                                        ref={ctaRef}
                                        className="flex flex-wrap items-center justify-center gap-4"
                                >
                                        {ctaButtons.length > 0 ? (
                                                ctaButtons.map((button, index) => {
                                                        const isPrimary = button.primary ?? index === 0;
                                                        const classes = isPrimary
                                                                ? "px-8 py-3 h-auto rounded-xl text-base font-semibold backdrop-blur-lg bg-[#00abec]/80 hover:bg-[#00abec]/90 text-white shadow-xl transition-all border-none"
                                                                : "px-8 py-3 h-auto rounded-xl text-base font-semibold border-white/40 text-white hover:bg-white/10 backdrop-blur-lg transition-all";

                                                        return (
                                                                <Button
                                                                        key={index}
                                                                        variant={isPrimary ? "default" : "outline"}
                                                                        className={classes}
                                                                        onClick={button.onClick}
                                                                >
                                                                        {button.text}
                                                                </Button>
                                                        );
                                                })
                                        ) : null}
                                </div>

                                {microDetails.length > 0 && (
                                        <ul
                                                ref={microRef}
                                                className="mt-8 flex flex-wrap justify-center gap-6 text-xs font-medium tracking-tight text-white/80"
                                        >
                                                {microDetails.map((detail, index) => (
                                                        <li key={index} className="flex items-center gap-2 drop-shadow-sm">
                                                                <span className="h-1 w-1 rounded-full bg-[#00abec]" />
                                                                {detail}
                                                        </li>
                                                ))}
                                        </ul>
                                )}
                        </div>
                </section>
        );
};

export default SyntheticHero;
