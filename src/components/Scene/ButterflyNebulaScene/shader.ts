// ─────────────────────────────────────────────────────────────
// SHADERS
// uProgress:   0 = stellar core, 1 = fully formed
// uEnterPhase: 1 = turbulent (forming/reversing), 0 = settled
// ─────────────────────────────────────────────────────────────

export const wingVertical = /* glsl */ `
  attribute float aSize;
  attribute float aOpacity;
  attribute vec3 aOrigin;
  attribute float aDelay;
  uniform float uTime;
  uniform float uProgress;
  uniform float uEnterPhase;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vFog;

  float easeOutQuart(float t) {
    float t1 = 1.0 - t;
    return 1.0 - t1 * t1 * t1 * t1;
  }

  void main() {
    float lp = clamp((uProgress - aDelay) / (1.0 - aDelay), 0.0, 1.0);
    float ep = easeOutQuart(lp);
    vec3 pos = mix(aOrigin, position, ep);

    // Turbulent swirl (active during entrance AND reverse)
    float chaos = (1.0 - ep) * uEnterPhase;
    float seed = aDelay * 30.0;
    pos.x += sin(uTime * 1.2 + seed) * chaos * 1.8;
    pos.y += cos(uTime * 0.9 + seed * 1.3) * chaos * 1.5;
    pos.z += sin(uTime * 1.1 + seed * 0.7 + pos.x * 0.5) * chaos * 1.2;

    // Overshoot
    float overshoot = sin(lp * 3.14159) * 0.12 * uEnterPhase;
    pos = mix(pos, position * (1.0 + overshoot), ep);

    // Settled breathing
    pos *= 1.0 + sin(uTime * 0.15 + length(pos) * 0.1) * 0.015 * ep;

    // Post-settle drift
    float drift = (1.0 - uEnterPhase) * ep;
    pos.x += sin(uTime * 0.08 + pos.y * 0.2) * 0.06 * drift;
    pos.z += cos(uTime * 0.06 + pos.x * 0.15) * 0.04 * drift;

    vColor = color;
    vOpacity = aOpacity * smoothstep(0.0, 0.25, lp);
    vOpacity += (1.0 - ep) * uEnterPhase * exp(-length(aOrigin) * 5.0) * 0.4;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vFog = exp(mv.z * 0.01);
    gl_PointSize = aSize * (250.0 / -mv.z) * (0.15 + 0.85 * ep);
    gl_Position = projectionMatrix * mv;
  }
`;
export const wingFragment = /* glsl */ `
  varying vec3 vColor; varying float vOpacity; varying float vFog;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vColor * vFog, exp(-d*d*1.8) * vOpacity * vFog);
  }
`;

export const shockVertical = /* glsl */ `
  attribute float aSize; attribute vec3 aOrigin; attribute float aDelay;
  uniform float uTime; uniform float uProgress; uniform float uEnterPhase;
  varying vec3 vColor; varying float vAlpha;
  float easeOutQuart(float t) { float t1=1.0-t; return 1.0-t1*t1*t1*t1; }
  void main() {
    float lp = clamp((uProgress-aDelay)/(1.0-aDelay),0.0,1.0);
    float ep = easeOutQuart(lp);
    vec3 pos = mix(aOrigin, position, ep);
    float chaos = (1.0-ep)*uEnterPhase*1.5;
    pos += sin(uTime*0.9+aDelay*30.0+pos.yzx*2.0)*chaos*0.5;
    vColor = color;
    pos *= 1.0+sin(uTime*0.3+pos.x*0.5)*0.02*ep;
    vec4 mv = modelViewMatrix*vec4(pos,1.0);
    vAlpha = (0.25+sin(uTime*0.4+length(pos)*0.3)*0.08)*smoothstep(0.0,0.3,lp);
    gl_PointSize = aSize*(200.0/-mv.z)*(0.15+0.85*ep);
    gl_Position = projectionMatrix*mv;
  }
`;
export const shockFragment = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d=length(gl_PointCoord-0.5)*2.0;
    gl_FragColor = vec4(vColor*1.3,(exp(-d*d*4.0)+exp(-d*d*1.2)*0.4)*vAlpha);
  }
`;

export const torusVertical = /* glsl */ `
  attribute float aSize; attribute float aOpacity;
  attribute vec3 aOrigin; attribute float aDelay;
  uniform float uTime; uniform float uProgress; uniform float uEnterPhase;
  varying vec3 vColor; varying float vOpacity;
  float easeOutQuart(float t) { float t1=1.0-t; return 1.0-t1*t1*t1*t1; }
  void main() {
    float lp = clamp((uProgress-aDelay)/(1.0-aDelay),0.0,1.0);
    float ep = easeOutQuart(lp);
    vec3 pos = mix(aOrigin,position,ep);
    pos += sin(uTime*0.7+aDelay*25.0+pos.zxy)*(1.0-ep)*uEnterPhase*0.6;
    pos.y += sin(uTime*0.05+pos.x*0.3)*0.02*ep;
    vColor=color; vOpacity=aOpacity*smoothstep(0.0,0.4,lp);
    vec4 mv=modelViewMatrix*vec4(pos,1.0);
    gl_PointSize=aSize*(220.0/-mv.z)*(0.2+0.8*ep);
    gl_Position=projectionMatrix*mv;
  }
`;
export const torusFragment = /* glsl */ `
  varying vec3 vColor; varying float vOpacity;
  void main() {
    float d=length(gl_PointCoord-0.5)*2.0;
    gl_FragColor=vec4(vColor,exp(-d*d*2.5)*vOpacity);
  }
`;

export const ironJetVertical = /* glsl */ `
  attribute float aSize; attribute float aPhase;
  attribute vec3 aOrigin; attribute float aDelay;
  uniform float uTime; uniform float uProgress; uniform float uEnterPhase;
  varying vec3 vColor; varying float vAlpha;
  float easeOutQuart(float t) { float t1=1.0-t; return 1.0-t1*t1*t1*t1; }
  void main() {
    float lp=clamp((uProgress-aDelay)/(1.0-aDelay),0.0,1.0);
    float ep=easeOutQuart(lp); vColor=color;
    vec3 pos=mix(aOrigin,position,ep);
    float t=fract(aPhase+uTime*0.06);
    pos*=1.0+t*0.3*ep; pos.y+=sin(t*6.28+pos.x*0.5)*0.3*t*ep;
    vAlpha=smoothstep(0.0,0.15,t)*smoothstep(1.0,0.5,t)*0.35*smoothstep(0.0,0.2,lp);
    vec4 mv=modelViewMatrix*vec4(pos,1.0);
    gl_PointSize=aSize*(1.0+t*0.5)*(180.0/-mv.z)*(0.2+0.8*ep);
    gl_Position=projectionMatrix*mv;
  }
`;
export const ironJetFragment = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d=length(gl_PointCoord-0.5)*2.0;
    gl_FragColor=vec4(vColor*1.2,exp(-d*d*3.0)*vAlpha);
  }
`;

export const flashVertical = /* glsl */ `
  attribute float aSize;
  uniform float uTime; uniform float uFlash;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vColor=color;
    vec3 pos=position*(1.0+uFlash*3.5);
    pos+=sin(uTime*2.0+position.yzx*5.0)*uFlash*0.5;
    vec4 mv=modelViewMatrix*vec4(pos,1.0);
    vAlpha=uFlash*exp(-length(position)*2.0);
    gl_PointSize=aSize*(1.0+uFlash*5.0)*(300.0/-mv.z);
    gl_Position=projectionMatrix*mv;
  }
`;
export const flashFragment = /* glsl */ `
  varying float vAlpha; varying vec3 vColor;
  void main() {
    float d=length(gl_PointCoord-0.5)*2.0;
    gl_FragColor=vec4(vColor*2.0,exp(-d*d*2.0)*vAlpha);
  }
`;
