import assert from "node:assert/strict";
import { Input } from "../src/input.js";

class Target {
  constructor(action) { this.dataset={action};this.events=new Map();this.style={}; }
  addEventListener(type,fn) { const list=this.events.get(type)||[];list.push(fn);this.events.set(type,list); }
  setPointerCapture() {}
  getBoundingClientRect() { return {left:0,top:0,width:100,height:100}; }
  send(type,id,x=50,y=50) { for(const fn of this.events.get(type)||[])fn({pointerId:id,clientX:x,clientY:y,preventDefault(){}}); }
}
const base=new Target(),knob=new Target(),stick=new Target();
const buttons=["light","heavy","jump","dodge","special","finisher","interact","throw"].map(x=>new Target(x));
globalThis.window=new Target();globalThis.document=new Target();
document.querySelector=selector=>({".stick-wrap":stick,".stick-base":base,"#stick-knob":knob})[selector];
document.querySelectorAll=()=>buttons;document.getElementById=()=>knob;
Object.defineProperty(globalThis,"navigator",{value:{getGamepads:()=>[]},configurable:true});
const input=new Input(new Target());
base.send("pointerdown",1,83,50);
buttons[0].send("pointerdown",2);
buttons[2].send("pointerdown",3);
let frame=input.sample();
assert.ok(frame.moveX>.9&&frame.pressed.light&&frame.pressed.jump,"moving + light + jump use independent simultaneous pointers");
buttons[0].send("pointerup",2);frame=input.sample();
assert.ok(frame.moveX>.9&&frame.held.jump&&!frame.held.light,"releasing an attack does not release another finger or the stick");
base.send("pointerdown",4,0,50);base.send("pointermove",4,0,50);
assert.ok(input.sample().moveX>.9,"a second touch cannot hijack the stick");
base.send("pointerup",4);assert.ok(input.sample().moveX>.9,"a non-owner release cannot stop the stick");
base.send("pointercancel",1);assert.equal(input.sample().moveX,0);
buttons[2].send("pointercancel",3);assert.equal(input.sample().held.jump,false);
buttons[1].send("pointerdown",5);buttons[1].send("pointerdown",6);buttons[1].send("pointerup",5);
assert.equal(input.sample().held.heavy,true,"a button stays held while its second pointer remains");
buttons[1].send("lostpointercapture",6);assert.equal(input.sample().held.heavy,false);
buttons[7].send("pointerdown",7);assert.equal(input.sample().pressed.throw,true,"touch throw is a real input action");
base.send("pointerdown",8,83,50);input.clear();
base.send("pointermove",8,83,50);frame=input.sample();
assert.equal(frame.moveX,0);assert.ok(Object.values(frame.held).every(x=>!x));
assert.equal(input.touchPointers.size,0);assert.equal(input.stickPointer,null);
assert.equal(knob.style.transform,"translate(-50%, -50%)","pause/rotation clearing returns the knob to centre");
let prevented=false;
input.onKeyDown({key:"ArrowRight",target:{closest:()=>true},preventDefault(){prevented=true;}});
assert.equal(prevented,false,"native menu sliders and selects retain their keyboard arrows");
input.onKeyDown({key:" ",target:{closest:()=>true},preventDefault(){prevented=true;}});
assert.equal(prevented,false,"menu buttons retain Space activation");
console.log("touch input: simultaneous move/jump/attack, pointer ownership, cancellation, throw, and pause/rotation clearing passed");
