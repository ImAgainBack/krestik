// Public API (backward-compatible additions only):
// ensurePersistence(): Promise<boolean>
// exportBackup(): Promise<void> — version 1 JSON, File share or download.
// importBackup(file: Blob): Promise<{imported:number}> — validate first, atomic insert.
// onSaveStatus(callback: ('saving'|'saved'|'error') => void): () => void
// reportSaveStatus is internal to the stitch/storage integration.
import { allProjects, getSetting, importProjects, onSaveStatus, reportSaveStatus } from '../storage.js';
import { DMC } from '../engine/dmc.js';
import { threadPalette } from '../engine/palettes.js';
import { stitchRu } from '../i18n/ru-stitch.js';
export { onSaveStatus, reportSaveStatus };

export async function ensurePersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persisted() || await navigator.storage.persist();
  } catch { return false; }
}
function base64(bytes) {
  let text = '';
  for (let start=0; start<bytes.length; start+=8192) text += String.fromCharCode(...bytes.subarray(start,start+8192));
  return btoa(text);
}
function bytes(value) {
  if (typeof value !== 'string' || value.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw Error();
  return Uint8Array.from(atob(value), c=>c.charCodeAt(0));
}
let activeProjectSnapshot = () => null;
// Stitch supplies a fresh snapshot, including edits awaiting or failing persistence.
export function setBackupProjectProvider(provider) { activeProjectSnapshot = provider; }
export async function exportBackup() {
  const active = activeProjectSnapshot();
  let projects;
  try { projects = await allProjects(); }
  catch (error) { if (!active) throw error; projects = []; }
  if (active) projects = [...projects.filter(project => project.id !== active.id), active];
  const encoded = await Promise.all(projects.map(async project => {
    const bits = new Uint8Array(Math.ceil(project.pattern.cells.length/8));
    if (Array.isArray(project.checked)) for (const i of project.checked) bits[i>>3] |= 1<<(i%8);
    else if (project.checkedBits) bits.set(project.checkedBits);
    return {...project, source: project.source ? {type:project.source.type, data:base64(new Uint8Array(await project.source.arrayBuffer()))} : null,
      excludedCodes: project.excludedCodes || [], replacements: project.replacements || [], checked: undefined, checkedBits: base64(bits), pattern: {...project.pattern, cells:Array.from(project.pattern.cells)}};
  }));
  const date = new Date().toISOString();
  const content = JSON.stringify({format:'krestik', version:1, date, projects:encoded, ownedDmc:await getSetting('ownedDmc',[]).catch(()=>[])});
  const file = new File([content], `krestik-копия-${date.slice(0,10)}.json`, {type:'application/json'});
  if (navigator.canShare?.({files:[file]}) && navigator.share) {
    try { await navigator.share({files:[file]}); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href=url; link.download=file.name; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const codes = new Set(DMC.map(color=>color[0]));
const inventoryCodes = new Set(['dmc','gamma'].flatMap(brand=>threadPalette(brand).map(c=>`${brand}:${c[0]}`)));
function validateProject(p) {
  if (!p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name.trim() || !p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) throw Error();
  const settings=p.settings;
  const codes=new Set(threadPalette(settings.brand).map(c=>c[0]));
  const validCode=code=>typeof code==='string' && (codes.has(code) || (code.split('+').length===2 && new Set(code.split('+')).size===2 && code.split('+').every(c=>codes.has(c))));
  if(settings.maxBlends!=null && (!Number.isInteger(settings.maxBlends) || settings.maxBlends<0 || settings.maxBlends>25)) throw Error();
  for (const key of ['cols','rows']) if (settings[key]!=null && (!Number.isInteger(settings[key]) || settings[key]<1 || settings[key]>400)) throw Error();
  if (settings.mode!=null && !['chart','photo'].includes(settings.mode)) throw Error();
  for (const key of ['emptyBackground','onlyStock']) if (settings[key]!=null && typeof settings[key]!=='boolean') throw Error();
  const g=p.pattern;
  if (!g || !Number.isInteger(g.cols) || !Number.isInteger(g.rows) || g.cols<1 || g.cols>400 || g.rows<1 || g.rows>400 || !Array.isArray(g.cells) || g.cells.length!==g.cols*g.rows || !Array.isArray(g.colors) || g.colors.length>621) throw Error();
  for (const c of g.colors) if (!c || !validCode(c.code) || typeof c.name!=='string' || !/^#?[\da-f]{6}$/i.test(c.hex) || !Number.isInteger(c.count) || c.count<0) throw Error();
  for(const c of g.colors) {
    if(c.code.includes('+') && (!Array.isArray(c.blend) || c.blend.length!==2 || c.blend.join('+')!==c.code || !c.blend.every(code=>codes.has(code)))) throw Error();
    if(!c.code.includes('+') && c.blend!==undefined) throw Error();
  }
  const counts=new Array(g.colors.length).fill(0);
  for (const c of g.cells) if (c!==65535 && c>=0 && c<counts.length) counts[c]++;
  if (g.colors.some((c,i)=>c.count!==counts[i]) || new Set(g.colors.map(c=>c.code)).size!==g.colors.length) throw Error();
  if (g.cells.some(c=>!Number.isInteger(c) || (c!==65535 && (c<0 || c>=g.colors.length)))) throw Error();
  const bits=bytes(p.checkedBits);
  if (bits.length!==Math.ceil(g.cells.length/8)) throw Error();
  const checked=[];
  for (let i=0; i<bits.length*8;i++) if (bits[i>>3] & (1<<(i%8))) {
    if (i>=g.cells.length || g.cells[i]===65535) throw Error();
    checked.push(i);
  }
  if (!Array.isArray(p.excludedCodes) || p.excludedCodes.some(c=>!validCode(c)) || !Array.isArray(p.replacements) || p.replacements.some(pair=>!Array.isArray(pair) || pair.length!==2 || pair.some(c=>!validCode(c)))) throw Error();
  if (p.thumbnail!=null && (typeof p.thumbnail!=='string' || !/^data:image\/(png|jpeg|webp);base64,/.test(p.thumbnail))) throw Error();
  let source=null;
  if (p.source!==null) {
    if (!p.source || typeof p.source.type!=='string' || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(p.source.type)) throw Error();
    source=new Blob([bytes(p.source.data)],{type:p.source.type});
  }
  // Explicit fields prevent importing arbitrary object properties.
  return {id:p.id,name:p.name,settings:p.settings,thumbnail:p.thumbnail,source,pattern:{...g,cells:new Uint16Array(g.cells)},checked,checkedBits:bits,excludedCodes:p.excludedCodes,replacements:p.replacements,updated:Date.now()};
}
export async function importBackup(file) {
  let projects, owned;
  try {
    const data=JSON.parse(await file.text());
    if (data.format!=='krestik' || data.version!==1 || typeof data.date!=='string' || !Number.isFinite(Date.parse(data.date)) || !Array.isArray(data.projects) || !Array.isArray(data.ownedDmc) || data.ownedDmc.some(c=>!codes.has(c) && !inventoryCodes.has(c))) throw Error();
    projects=data.projects.map(validateProject); owned=data.ownedDmc;
  } catch { throw new Error(stitchRu.invalidBackup); }
  await importProjects(projects,owned);
  return {imported:projects.length};
}
