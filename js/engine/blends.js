import { rgbToLab, rgbToOKLab } from "./color.js";
const distance = (a,b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
export function blendColor(a, b) {
  const linear = c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055)**2.4;
  const rgb = a.rgb.map((v,i) => {
    const c = (linear(v/255) + linear(b.rgb[i]/255))/2;
    return Math.round(255 * (c <= .0031308 ? 12.92*c : 1.055*c**(1/2.4)-.055));
  });
  return { code: `${a.code}+${b.code}`, name: `${a.name} + ${b.name}`,
    hex: rgb.map(c=>c.toString(16).padStart(2,"0")).join(""),
    blend: [a.code,b.code], rgb, lab: rgbToLab(...rgb), oklab: rgbToOKLab(...rgb) };
}
export function compatiblePair(a,b) {
  if (distance(a.lab,b.lab)>35**2) return false;
  const ca=Math.hypot(a.lab[1],a.lab[2]), cb=Math.hypot(b.lab[1],b.lab[2]);
  if (ca<8 || cb<8) return ca<8 && cb<8;
  return a.lab[1]*b.lab[1]+a.lab[2]*b.lab[2] >= ca*cb*Math.cos(Math.PI/4);
}
function assign(rgb, cells, colors) {
  for(let i=0;i<cells.length;i++) {
    if(cells[i]===65535) continue;
    const lab=rgbToLab(rgb[i*3],rgb[i*3+1],rgb[i*3+2]);
    let best=Infinity;
    for(let j=0;j<colors.length;j++) {
      const d=distance(lab,colors[j].lab);
      if(d<best) { best=d; cells[i]=j; }
    }
  }
}
export function addBlends(rgb, cells, solids, limit, excluded = []) {
  // At most 80 solids -> 3160 pairs; keep the best 128 histogram gains.
  const histogram=new Map();
  let stitches=0;
  for(let i=0;i<cells.length;i++) {
    if(cells[i]===65535) continue;
    stitches++;
    const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2],key=(r>>4)*256+(g>>4)*16+(b>>4);
    let bin=histogram.get(key);
    if(!bin) {bin={sum:[0,0,0],n:0};histogram.set(key,bin);}
    bin.n++; bin.sum[0]+=r;bin.sum[1]+=g;bin.sum[2]+=b;
  }
  const bins=[...histogram.values()].map(b=>({n:b.n,lab:rgbToLab(...b.sum.map(v=>v/b.n))}));
  const best=Float64Array.from(bins,b=>Math.min(...solids.map(c=>distance(b.lab,c.lab))));
  const minimum=Math.max(20,Math.ceil(stitches*.003));
  const candidates=[];
  for(let a=0;a<solids.length;a++) for(let b=a+1;b<solids.length;b++) {
    if(!compatiblePair(solids[a],solids[b])) continue;
    const color=blendColor(solids[a],solids[b]);
    if(excluded.includes(color.code)) continue;
    const costs=Float32Array.from(bins,b=>distance(b.lab,color.lab));
    let gain=0;
    for(let h=0;h<bins.length;h++) gain+=bins[h].n*Math.max(0,best[h]-costs[h]);
    if(gain>0) candidates.push({color,costs,gain});
    if(candidates.length>=256) { candidates.sort((a,b)=>b.gain-a.gain); candidates.length=128; }
  }
  candidates.sort((a,b)=>b.gain-a.gain);
  const bounded=candidates.slice(0,128), selected=[...solids];
  for(let step=0;step<limit;step++) {
    let winner=null, gain=0;
    for(const c of bounded) {
      if(c.used) continue;
      let score=0,count=0;
      for(let h=0;h<bins.length;h++) if(c.costs[h]<best[h]) {
        score+=bins[h].n*(best[h]-c.costs[h]);count+=bins[h].n;
      }
      if(count>=minimum && score>gain) {winner=c;gain=score;}
    }
    if(!winner) break;
    winner.used=true;selected.push(winner.color);
    for(let h=0;h<bins.length;h++) best[h]=Math.min(best[h],winner.costs[h]);
  }
  if(selected.length===solids.length) return solids;
  assign(rgb,cells,selected);
  return pruneBlends(rgb,cells,selected);
}
export function pruneBlends(rgb,cells,selected) {
  const minimum=Math.max(20,Math.ceil(cells.reduce((n,c)=>n+(c!==65535),0)*.003));
  while(true) {
    const counts=new Uint32Array(selected.length);
    for(const c of cells) if(c!==65535) counts[c]++;
    const used=new Set(selected.filter((c,i)=>!c.blend && counts[i]).map(c=>c.code));
    const next=selected.filter((c,i)=>!c.blend || (counts[i]>=minimum && c.blend.every(code=>used.has(code))));
    if(next.length===selected.length) return selected;
    selected=next;assign(rgb,cells,selected);
  }
}
