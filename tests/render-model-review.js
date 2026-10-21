// Independent CPU mesh preview. This does not drive or capture a browser.
import fs from "node:fs/promises";
import * as THREE from "three";
import { world } from "./enemy-models.test.js";
import { ENEMY_MODELS } from "../src/enemy-models.js";
import { FIGHTERS } from "../src/data.js";

const output = new URL("../qa-screenshots/", import.meta.url);
const garmentNames = { bomber:'窄脊发型 · 短夹克',workvest:'光头 · 宽体工装',security:'保安帽 · 制服',courier:'针织帽 · 口罩 · 挎包',safety:'安全帽 · 反光背心',biker:'削边发型 · 翻领外套',enforcer:'光头 · 厚夹克 · 链饰',cropped:'不对称短发 · 短外套',foreman:'安全帽 · 防护面罩 · 围裙',longcoat:'束发 · 长外套',suit:'背头 · 西装领带' };
const light = new THREE.Vector3(-.4,.8,1).normalize();
const toSRGB = value => Math.round(255 * (value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055));
function triangles(root, camera, width, height) {
  const faces = [];
  root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  root.traverseVisible(mesh => {
    if (!mesh.isMesh || mesh.isSprite || mesh.name.startsWith("health")) return;
    const geometry = mesh.geometry, position = geometry.getAttribute("position"), color = geometry.getAttribute("color");
    if (!position) return;
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    const vertices = [];
    for (let i=0; i<position.count; i++) {
      const p=new THREE.Vector3().fromBufferAttribute(position,i);
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i,p);
      vertices.push(p.applyMatrix4(mesh.matrixWorld));
    }
    const indices = geometry.index?.array || Array.from({length:position.count},(_,i)=>i);
    for (let i=0; i<indices.length; i+=3) {
      const ids=[indices[i],indices[i+1],indices[i+2]], pts=ids.map(id=>vertices[id]);
      const normal=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();
      const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
      if (material.side!==THREE.DoubleSide && normal.z<0) continue;
      const base=material.color.clone();
      if (color) {const rgb=ids.map(id=>new THREE.Color().fromBufferAttribute(color,id));base.multiply(rgb[0].add(rgb[1]).add(rgb[2]).multiplyScalar(1/3));}
      else if (material.map) {base.multiply(new THREE.Color(/regular/.test(material.name.toLowerCase())?'#c39c7f':/legs|feet/i.test(mesh.name)?'#454b48':'#b68a65'));}
      const shade=.46+.54*Math.max(0,normal.dot(light));base.multiplyScalar(shade);
      const projected=pts.map(p=>p.clone().project(camera));
      faces.push({d:projected.reduce((sum,p)=>sum+p.z,0)/3, p:projected.map(p=>[(p.x+1)*width/2,(1-p.y)*height/2]), c:[toSRGB(base.r),toSRGB(base.g),toSRGB(base.b)]});
    }
  });
  return faces.sort((a,b)=>b.d-a.d);
}

function clear() { for(const id of [...world.actors.keys()]) world.resetActor(id); }
async function enemies(keys, file) {
  clear();
  keys.forEach((key,i)=>{
    const state={id:key+'-'+i,type:key,style:key,boss:['ram','dart','slam','feint','tactician'].includes(key),phase:i===5&&key==='tactician'?2:1,health:100,maxHealth:100,x:-6.8+i*2.72,y:0,z:0,facing:1,action:'idle',state:'idle'};
    state.visual={...world.enemyVisual(state),facingRotation:-1.02};world.syncOne(state.id,state);
  });
  const width=1800,height=490,camera=new THREE.OrthographicCamera(-8.1,8.1,2.85,-.55,.1,90);
  camera.position.set(0,0,22);camera.lookAt(0,0,0);
  const faces=triangles(world.actorGroup,camera,width,height);
  await fs.writeFile(new URL(file+'.json',output),JSON.stringify({width,height,faces,labels:keys.map((key,i)=>({x:(i+.5)*width/6,text:ENEMY_MODELS[key].name+(i===5&&key==='tactician'?' · 第二式':''),detail:garmentNames[ENEMY_MODELS[key].costume]}))}));
}
await enemies(['swift','heavy','guard','ranged','charger','elite'],'enemy-costumes-troops');
await enemies(['ram','dart','slam','feint','tactician','tactician'],'enemy-costumes-bosses');
// Six positions show an actual guard, tuck, inverted body, landing and recovery.
clear();
const width=1800,height=480,camera=new THREE.OrthographicCamera(-7.8,7.8,2.7,-.55,.1,90);
camera.position.set(0,0,22);camera.lookAt(0,0,0);
const frames=[0,.18,.38,.53,.72,1];
frames.forEach((fraction,i)=>{
  const id='roll-'+i,state={x:-6.5+i*2.6,y:0,z:0,facing:1,dodgeDirection:1,action:'dodge',actionElapsed:fraction*.42,actionTotal:.42,visual:world.fighterVisual(FIGHTERS[0])};
  const actor=world.makeActor(state.visual);world.actorGroup.add(actor.group);world.actors.set(id,actor);world.attachFighterModel(actor,'lin');world.syncOne(id,state);
});
await fs.writeFile(new URL('roll-poses.json',output),JSON.stringify({width,height,faces:triangles(world.actorGroup,camera,width,height),labels:frames.map((fraction,i)=>({x:(i+.5)*width/6,text:['准备','收身','翻转','倒置','落地','恢复'][i],detail:Math.round(fraction*100)+'%'}))}));
console.log('CPU mesh inspection files saved under qa-screenshots');
