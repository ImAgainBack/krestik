// CIELAB D65, IEC sRGB transfer, and Sharma et al. (2005) CIEDE2000.
const linear = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  linear[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 841) / 108 + 4 / 29);
export function rgbToLab(r, g, b, out = new Float64Array(3), offset = 0) {
  const R = linear[Math.max(0, Math.min(255, Math.round(r)))],
    G = linear[Math.max(0, Math.min(255, Math.round(g)))],
    B = linear[Math.max(0, Math.min(255, Math.round(b)))];
  const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047),
    y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B),
    z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  out[offset] = 116 * y - 16;
  out[offset + 1] = 500 * (x - y);
  out[offset + 2] = 200 * (y - z);
  return out;
}
export function labToRgb(L, a, b) {
  const y = (L + 16) / 116,
    x = y + a / 500,
    z = y - b / 200;
  const inv = (t) => (t > 6 / 29 ? t * t * t : ((t - 4 / 29) * 108) / 841);
  const X = inv(x) * 0.95047,
    Y = inv(y),
    Z = inv(z) * 1.08883;
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ].map((c) =>
    Math.max(
      0,
      Math.min(
        255,
        255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055),
      ),
    ),
  );
}
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1,
    [L2, a2, b2] = lab2;
  const rad = Math.PI / 180,
    C1 = Math.hypot(a1, b1),
    C2 = Math.hypot(a2, b2),
    C = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7))),
    ap1 = (1 + G) * a1,
    ap2 = (1 + G) * a2;
  const cp1 = Math.hypot(ap1, b1),
    cp2 = Math.hypot(ap2, b2);
  const hue = (a, b) => (Math.atan2(b, a) / rad + 360) % 360,
    h1 = cp1 ? hue(ap1, b1) : 0,
    h2 = cp2 ? hue(ap2, b2) : 0;
  const dl = L2 - L1,
    dc = cp2 - cp1;
  let dh = h2 - h1;
  if (cp1 * cp2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2),
    lp = (L1 + L2) / 2,
    cp = (cp1 + cp2) / 2;
  let hp = h1 + h2;
  if (cp1 * cp2 !== 0)
    hp =
      Math.abs(h1 - h2) <= 180
        ? hp / 2
        : hp < 360
          ? (hp + 360) / 2
          : (hp - 360) / 2;
  const T =
    1 -
    0.17 * Math.cos((hp - 30) * rad) +
    0.24 * Math.cos(2 * hp * rad) +
    0.32 * Math.cos((3 * hp + 6) * rad) -
    0.2 * Math.cos((4 * hp - 63) * rad);
  const sl = 1 + (0.015 * (lp - 50) ** 2) / Math.sqrt(20 + (lp - 50) ** 2),
    sc = 1 + 0.045 * cp,
    sh = 1 + 0.015 * cp * T;
  const rt =
    -2 *
    Math.sqrt(cp ** 7 / (cp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hp - 275) / 25) ** 2)) * rad);
  return Math.sqrt(
    (dl / sl) ** 2 +
      (dc / sc) ** 2 +
      (dH / sh) ** 2 +
      rt * (dc / sc) * (dH / sh),
  );
}

function continuousLinear(c) {
  c = Math.max(0, Math.min(255, c));
  if (Number.isInteger(c)) return linear[c];
  c /= 255;
  return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
}
// Ottosson 2020, updated 2021 sRGB matrices: https://bottosson.github.io/posts/oklab/
export function rgbToOKLab(r, g, b, out = new Float64Array(3), offset = 0) {
  r = continuousLinear(r); g = continuousLinear(g); b = continuousLinear(b);
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b),
    m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b),
    s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  out[offset] = .2104542553*l + .793617785*m - .0040720468*s;
  out[offset+1] = 1.9779984951*l - 2.428592205*m + .4505937099*s;
  out[offset+2] = .0259040371*l + .7827717662*m - .808675766*s;
  if(offset===0) out.chroma=Math.hypot(out[1],out[2]);
  return out;
}
const cache = new WeakMap();
export function photoSpace(palette) {
  if (cache.has(palette)) return cache.get(palette);
  const colors = palette.map(c => c.oklab ?? rgbToOKLab(...c.rgb));
  const faces=convexHull(colors);
  // Cache radial hull intersections at 5° hue / .01 lightness for cell throughput.
  // shortcut: interpolation approximates the continuous hull; discrete stock stays discrete.
  const limits=new Float64Array(72*101);
  for(let h=0;h<72;h++) for(let l=0;l<=100;l++) {
    const ux=Math.cos(h*Math.PI/36), uy=Math.sin(h*Math.PI/36);
    let cap=Infinity;
    for(const [nx,ny,nz,d] of faces) {
      const slope=ny*ux+nz*uy;
      if(slope>1e-10) cap=Math.min(cap,(-d-nx*l/100)/slope);
    }
    limits[h*101+l]=Number.isFinite(cap)?Math.max(0,cap):0;
  }
  function boundary(h,L) {
    const l=Math.max(0,Math.min(100,L*100)), lo=Math.min(99,Math.floor(l)), f=l-lo;
    const offset=((h+72)%72)*101;
    return limits[offset+lo]*(1-f)+limits[offset+lo+1]*f;
  }
  function map(a) {
    const C=a.chroma ?? Math.hypot(a[1],a[2]);
    if(C<.005 || !faces.length) return a;
    const h=(Math.atan2(a[2],a[1])*36/Math.PI+72)%72, lo=Math.floor(h), f=h-lo;
    const cap=L => boundary(lo,L)*(1-f)+boundary(lo+1,L)*f;
    let L=a[0], limit=cap(L);
    if(C>limit) {
      for(const candidate of [Math.max(0,a[0]-.02),Math.min(1,a[0]+.02)]) {
        const c=cap(candidate);
        if(c>limit) {L=candidate;limit=c;}
      }
    }
    const scale=Math.min(1,limit/C);
    const result=[L,a[1]*scale,a[2]*scale];
    result.chroma=C*scale;
    return result;
  }
  const space={colors,map}; cache.set(palette,space); return space;
}
// Hoist source-only terms once per nearest-thread search. Arithmetic order stays v7.
export function photoDistanceFrom(a) {
  const ca=a.chroma ?? Math.hypot(a[1],a[2]);
  const dark=a[0]<.45 && ca<.06;
  const chromatic=dark && ca>Math.max(.1*a[0],.035+.15*Math.max(0,.25-a[0]));
  const angularWeight=4*Math.max(ca,.015)**2;
  const allowance=a[0]<.3?.015:.03;
  const hueWeight=3+4*Math.min(1,ca/.15);
  return b => {
    const cb=b.chroma ?? Math.hypot(b[1],b[2]), dc=ca-cb;
    const ab=(a[1]-b[1])**2+(a[2]-b[2])**2;
    const dh=Math.max(0,ab-dc*dc);
    const angular=chromatic ? angularWeight*Math.max(0,1-(a[1]*b[1]+a[2]*b[2])/(ca*Math.max(cb,.4*ca))) : 0;
    const excess=Math.max(0,cb-1.3*ca-allowance);
    return 10000*(angular + 2*Math.max(0,dc)**2 + 30*excess*excess + (dark?.45:.21)*(a[0]-b[0])**2 + (dark?6:4)*dc*dc + hueWeight*dh);
  };
}
export function photoDistance(a,b) { return photoDistanceFrom(a)(b); }

// Incremental 3D convex hull. Face normals point away from an interior tetrahedron.
function convexHull(points) {
  if(points.length<4) return [];
  const sub=(a,b)=>a.map((v,i)=>v-b[i]), dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),
    cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const farthest=score=>points.reduce((best,p,i)=>score(p)>score(points[best])?i:best,0);
  const a=0, b=farthest(p=>dot(sub(p,points[a]),sub(p,points[a]))),
    c=farthest(p=>{const n=cross(sub(points[b],points[a]),sub(p,points[a]));return dot(n,n);});
  const normal=cross(sub(points[b],points[a]),sub(points[c],points[a]));
  const d=farthest(p=>Math.abs(dot(normal,sub(p,points[a]))));
  if(Math.abs(dot(normal,sub(points[d],points[a])))<1e-12) return [];
  const interior=points[a].map((v,i)=>(v+points[b][i]+points[c][i]+points[d][i])/4);
  function face(a,b,c) {
    let n=cross(sub(points[b],points[a]),sub(points[c],points[a]));
    if(dot(n,sub(interior,points[a]))>0) { [b,c]=[c,b]; n=n.map(v=>-v); }
    const length=Math.hypot(...n); n=n.map(v=>v/length);
    return {vertices:[a,b,c], plane:[...n,-dot(n,points[a])]};
  }
  let faces=[face(a,b,c),face(a,d,b),face(a,c,d),face(b,d,c)];
  for(let i=0;i<points.length;i++) {
    const visible=faces.filter(f=>dot(f.plane.slice(0,3),points[i])+f.plane[3]>1e-10);
    if(!visible.length) continue;
    const edges=new Map();
    for(const f of visible) for(let e=0;e<3;e++) {
      const a=f.vertices[e], b=f.vertices[(e+1)%3], reverse=`${b},${a}`;
      if(edges.has(reverse)) edges.delete(reverse); else edges.set(`${a},${b}`,[a,b]);
    }
    faces=faces.filter(f=>!visible.includes(f));
    for(const [a,b] of edges.values()) faces.push(face(a,b,i));
  }
  return faces.map(f=>f.plane);
}

// Use a same-hue thread when the selected stock has one; grey hue is unstable.
export function hueCompatible(a,b) {
  const ca=a.chroma ?? Math.hypot(a[1],a[2]), cb=b.chroma ?? Math.hypot(b[1],b[2]);
  if(cb>1.3*ca+(a[0]<.3?.015:.03) || (a[0]<.3 && b[0]>a[0]+.12)) return false;
  if(a[0]<.45 && ca<.15 && ca>Math.max(.1*a[0],.035+.15*Math.max(0,.25-a[0]))) return cb>=.4*ca && Math.abs(a[0]-b[0])<.16 &&
    a[1]*b[1]+a[2]*b[2]>=ca*cb*Math.cos(Math.PI/4);
  return ca<.03 || cb<.005 || a[1]*b[1]+a[2]*b[2]>=ca*cb*Math.cos(Math.PI/6);
}
