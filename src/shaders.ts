export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVideo;
uniform vec2 uResolution;
uniform vec2 uCrop;
uniform float uTime, uIntensity, uEffect, uPolygonValid, uMaskFeather, uPixelSize, uDistortion, uVisibility;
uniform vec2 uPolygon[4];
vec4 sampleVideo(vec2 uv) {
  vec2 source = (uv - 0.5) * uCrop + 0.5;
  source.x = 1.0 - source.x;
  return texture2D(uVideo, clamp(source, 0.0, 1.0));
}
float polygonMask(vec2 uv) {
  if (uPolygonValid < 0.5) return 0.0;
  float positive=0.0, negative=0.0, distanceToEdge=1e8;
  vec2 p=uv*uResolution;
  for(int i=0;i<4;i++) {
    vec2 a=uPolygon[i]*uResolution;
    vec2 b=uPolygon[(i+1)-((i+1)/4)*4]*uResolution;
    vec2 edge=b-a, relative=p-a;
    float side=edge.x*relative.y-edge.y*relative.x;
    positive=max(positive,step(0.0,side));
    negative=max(negative,1.0-step(0.0,side));
    float t=clamp(dot(relative,edge)/max(dot(edge,edge),0.0001),0.0,1.0);
    distanceToEdge=min(distanceToEdge,length(relative-edge*t));
  }
  // Feather only towards the interior: exterior pixels are exactly untouched.
  float inside=1.0-positive*negative;
  return inside*smoothstep(0.0,max(uMaskFeather,0.001),distanceToEdge);
}
float windowLuma(vec3 c) { return dot(c,vec3(0.2126,0.7152,0.0722)); }
float windowEdges(vec2 uv) {
  vec2 pixel = 1.5 / uResolution;
  float dx = windowLuma(sampleVideo(uv + vec2(pixel.x, 0.0)).rgb) - windowLuma(sampleVideo(uv - vec2(pixel.x, 0.0)).rgb);
  float dy = windowLuma(sampleVideo(uv + vec2(0.0, pixel.y)).rgb) - windowLuma(sampleVideo(uv - vec2(0.0, pixel.y)).rgb);
  return smoothstep(.015, .16, length(vec2(dx, dy)));
}
float shaderHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bayer2(vec2 p) { return mod(2.0 * p.x + 3.0 * p.y, 4.0); }
float printDots(vec2 uv, float angle, vec3 channel, float blackPlate) {
  float cell = 14.0 * max(1.0, uMaskFeather * .5);
  float c=cos(angle), s=sin(angle);
  mat2 rotation=mat2(c,s,-s,c);
  mat2 inverseRotation=mat2(c,-s,s,c);
  vec2 grid=rotation*(uv*uResolution)/cell;
  vec2 sampleUv=inverseRotation*(floor(grid)+.5)*cell/uResolution;
  vec3 ink=1.0-clamp(sampleVideo(sampleUv).rgb,0.0,1.0);
  float key=min(min(ink.r,ink.g),ink.b)*.65;
  float coverage=mix(max(0.0,(dot(ink,channel)-key)/(1.0-key)),key,blackPlate);
  float radius=sqrt(coverage)*.56;
  float aa=1.0/cell;
  return coverage>.002 ? 1.0-smoothstep(radius-aa,radius+aa,length(fract(grid)-.5)) : 0.0;
}
vec4 applyEffect(vec2 effectUv, vec4 originalColor) {
  if (uEffect > 9.5) {
    // Damaged analogue signal: every coloured fringe and torn band comes from the video.
    float tick=floor(uTime*4.0);
    float band=floor(effectUv.y*11.0);
    float noise=shaderHash(vec2(band,tick));
    float cut=step(.67,noise)*(noise-.5)*.26;
    float bandFine=floor(effectUv.y*37.0);
    float splice=step(.90,shaderHash(vec2(bandFine,tick+9.0)))*.07*sin(bandFine*8.0+tick);
    float waveCenter=.5+.25*sin(uTime*.42);
    float wave=exp(-pow((effectUv.y-waveCenter)/.048,2.0));
    float lowerWave=exp(-pow((effectUv.y-fract(.15+uTime*.045))/.025,2.0));
    float wobble=wave*sin(effectUv.y*145.0+uTime*2.4)*.055;
    wobble+=lowerWave*sin(effectUv.y*210.0-uTime*1.8)*.032;
    float unit=max(1.0,uMaskFeather*.5);
    float scanY=effectUv.y*uResolution.y/unit;
    float jitter=(shaderHash(vec2(floor(scanY),tick))-.5)*.002;
    vec2 uv=effectUv+vec2(cut+splice+wobble+jitter,0.0);
    float separation=.012+.010*(.5+.5*sin(effectUv.y*19.0+uTime*.7))+.02*wave+.014*step(.67,noise);
    vec3 color=vec3(
      sampleVideo(uv+vec2(separation,-.0015)).r,
      sampleVideo(uv+vec2(-separation*.25,.001)).g,
      sampleVideo(uv+vec2(-separation,.002)).b);
    // Faint displaced signal echo gives the multiple-image trails of an unstable CRT.
    vec3 echo=sampleVideo(uv+vec2(-.027-wave*.025,0.0)).rgb;
    color=mix(color,vec3(echo.r*.55,echo.g,echo.b*.85),.14);
    color=mix(vec3(windowLuma(color)),color,1.32);
    color=(color-.5)*1.13+.5;
    float scan=.76+.24*sin(scanY*2.0944);
    float grain=(shaderHash(floor(effectUv*uResolution)+vec2(tick*17.0,tick))-.5)*.055;
    color=color*vec3(.97,1.035,1.075)*scan+grain;
    return vec4(clamp(color,0.0,1.0),originalColor.a);
  }
  if (uEffect > 8.5) {
    vec2 pixel = floor(effectUv * uResolution / 3.0);
    float threshold = (4.0 * bayer2(mod(pixel, 2.0)) + bayer2(mod(floor(pixel / 2.0), 2.0)) + .5) / 16.0 - .5;
    vec3 color = sampleVideo((pixel + .5) * 3.0 / uResolution).rgb;
    return vec4(clamp(floor(color * 3.0 + threshold + .5) / 3.0, 0.0, 1.0), originalColor.a);
  }
  if (uEffect > 7.5) {
    // Four coloured ink plates with separate screen angles, like a printed image.
    float cyan=printDots(effectUv,.26,vec3(1.0,0.0,0.0),0.0);
    float magenta=printDots(effectUv,1.31,vec3(0.0,1.0,0.0),0.0);
    float yellow=printDots(effectUv,0.0,vec3(0.0,0.0,1.0),0.0);
    float black=printDots(effectUv,.7854,vec3(0.0),1.0);
    vec3 paper=vec3(1.0,.98,.94);
    paper*=mix(vec3(1.0),vec3(.05,.82,.93),cyan);
    paper*=mix(vec3(1.0),vec3(.94,.09,.48),magenta);
    paper*=mix(vec3(1.0),vec3(1.0,.88,.04),yellow);
    paper*=mix(vec3(1.0),vec3(.09,.08,.12),black);
    return vec4(paper,originalColor.a);
  }
  if (uEffect > 6.5) {
    vec2 grid = effectUv * uResolution / 20.0;
    vec3 sampled = sampleVideo((floor(grid)+.5) * 20.0 / uResolution).rgb;
    vec3 palette[10];
    palette[0]=vec3(.20,.16,.12); palette[1]=vec3(.42,.28,.17);
    palette[2]=vec3(.60,.43,.27); palette[3]=vec3(.33,.49,.18);
    palette[4]=vec3(.51,.65,.28); palette[5]=vec3(.45,.46,.44);
    palette[6]=vec3(.69,.70,.64); palette[7]=vec3(.34,.57,.74);
    palette[8]=vec3(.79,.75,.53); palette[9]=vec3(.91,.88,.79);
    vec3 color=palette[0]; float nearest=10.0;
    for(int i=0;i<10;i++) {float dist=dot(sampled-palette[i],sampled-palette[i]);if(dist<nearest){nearest=dist;color=palette[i];}}
    vec2 tile=fract(grid);
    float bevel = .10 * step(.86,tile.y) - .12 * (1.0-step(.10,tile.y)) - .08 * step(.9,tile.x);
    float grain = (shaderHash(floor(grid*4.0))-.5)*.09;
    return vec4(clamp(color + bevel + grain,0.0,1.0),originalColor.a);
  }
  if (uEffect > 5.5) return vec4(1.0 - originalColor.rgb, originalColor.a);
  if (uEffect > 4.5) {
    float edge = windowEdges(effectUv);
    vec3 electric = .5 + .5 * cos(6.2831853 * (vec3(.05, .38, .65) + effectUv.x * .4 + uTime * .035));
    return vec4(vec3(.008, .012, .025) + electric * edge, originalColor.a);
  }
  if (uEffect > 3.5) {
    // False colour from visible luminance; this does not measure temperature.
    float light = clamp(windowLuma(originalColor.rgb), 0.0, 1.0);
    vec3 heat = mix(vec3(.015, .005, .12), vec3(.25, .04, .8), smoothstep(0.0, .3, light));
    heat = mix(heat, vec3(1.0, .05, .12), smoothstep(.25, .55, light));
    heat = mix(heat, vec3(1.0, .85, .04), smoothstep(.5, .8, light));
    heat = mix(heat, vec3(1.0, 1.0, .85), smoothstep(.8, 1.0, light));
    return vec4(heat, originalColor.a);
  }
  if (uEffect > 2.5) {
    float light = smoothstep(.08, .88, windowLuma(originalColor.rgb));
    float edge = windowEdges(effectUv);
    float scan = .83 + .17 * sin(effectUv.y * uResolution.y * 1.57 - uTime * 2.0);
    float sweep = exp(-pow((effectUv.y - fract(uTime * .12)) / .018, 2.0));
    vec2 center = (uPolygon[0] + uPolygon[1] + uPolygon[2] + uPolygon[3]) * .25;
    vec2 p = abs((effectUv - center) * uResolution);
    float horizontal = (1.0 - smoothstep(.8, 1.8, p.y)) * (1.0 - step(25.0, p.x)) * step(7.0, p.x);
    float vertical = (1.0 - smoothstep(.8, 1.8, p.x)) * (1.0 - step(25.0, p.y)) * step(7.0, p.y);
    float ring = 1.0 - smoothstep(.7, 1.7, abs(length(p) - 36.0));
    float hud = max(max(horizontal, vertical), ring * .65);
    vec3 red = vec3(.07 + .84 * light, .012 + .045 * light, .008 + .025 * light) * scan;
    red += vec3(.32, .04, .025) * edge + vec3(.14, .018, .01) * sweep;
    return vec4(mix(clamp(red, 0.0, 1.0), vec3(1.0, .28, .16), hud * .85), originalColor.a);
  }
  if(uEffect>0.5 && uEffect<1.5) {
    vec2 grid=max(vec2(1.0),uResolution/uPixelSize);
    return sampleVideo((floor(effectUv*grid)+0.5)/grid);
  }
  vec2 offset=vec2(sin(effectUv.y*34.0+uTime*1.1),cos(effectUv.x*27.0-uTime*.8));
  effectUv+=offset*(uEffect>1.5?uDistortion:.004);
  vec4 sampled=sampleVideo(effectUv);
  if(uEffect>1.5) return sampled;
  float light=floor(windowLuma(sampled.rgb)*7.0)/6.0;
  vec3 palette=.5+.5*cos(6.2831853*(vec3(.02,.34,.66)+light*.85+uTime*.025));
  vec2 texel=vec2(1.5)/uResolution;
  float dx=windowLuma(sampleVideo(effectUv+vec2(texel.x,0.0)).rgb)-windowLuma(sampleVideo(effectUv-vec2(texel.x,0.0)).rgb);
  float dy=windowLuma(sampleVideo(effectUv+vec2(0.0,texel.y)).rgb)-windowLuma(sampleVideo(effectUv-vec2(0.0,texel.y)).rgb);
  float edge=smoothstep(.025,.20,length(vec2(dx,dy)));
  return vec4(mix(palette,vec3(.025,.025,.045),edge*.85),originalColor.a);
}
void main() {
  vec4 originalColor=sampleVideo(vUv);
  float mask=polygonMask(vUv)*uPolygonValid;
  float blendAmount=mask*clamp(uIntensity,0.0,1.0)*uVisibility;
  // Explicit bypass also avoids sampling a processed UV at zero intensity.
  if(blendAmount<=0.0) { gl_FragColor=originalColor; return; }
  vec2 effectUv=vUv;
  vec4 effectedColor=applyEffect(effectUv,originalColor);
  gl_FragColor=mix(originalColor,effectedColor,blendAmount);
}
`;
