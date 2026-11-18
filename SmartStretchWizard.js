// Standalone PixInsight script. Rename SmartStretchWizard.txt to SmartStretchWizard.js before running.
/* Smart Stretch Wizard 0.3.0 — base global workflow with optional tonal HDR protection; no spatial masks.
 * Install as SmartStretchWizard.js. Standalone; no SmartTools.js required.
 * Arcsinh -> Midtones -> GHS-style contrast -> Color -> Linear endpoints.
 * Work is local until the Apply square commits one undoable image change.
 */
#feature-id Utilities > Smart Stretch Wizard
#feature-info Five-stage global stretch wizard with progressively finer refinement passes.
#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/ButtonCodes.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/KeyCodes.jsh>
var SW_NAMES=["Arcsinh — Reveal","Midtones — Brightness","GHS Style — Contrast","Color — Saturation","Linear — Endpoints"];
function SWClamp(x,a,b){return Math.max(a,Math.min(b,x));}
function SWCopy(o){return JSON.parse(JSON.stringify(o));}
function SWAsinh(x){return Math.log(x+Math.sqrt(x*x+1));}
function SWDefaults(stage){return {stage:stage,amount:0,color:1,balance:0,sp:.20,shape:1,shadows:0,highlights:0,black:0,white:1,saturation:0,vibrance:0,darkProtect:.5,brightProtect:.5,hdrEnabled:false,hdrStrength:.5};}
function SWIdentity(p){return p.stage==0||p.stage==2?p.amount===0:p.stage==1?p.balance===0:p.stage==3?p.saturation===0&&p.vibrance===0:p.black===0&&p.white===1;}
function SWValidate(p){
 if(!p||p.stage%1||p.stage<0||p.stage>4)throw Error("Invalid wizard stage.");
 var ranges={amount:[0,1],color:[0,1],balance:[-1,1],sp:[0,1],shape:[.1,4],shadows:[0,1],highlights:[0,1],black:[0,.25],white:[.05,1],saturation:[-1,1],vibrance:[-1,1],darkProtect:[0,1],brightProtect:[0,1],hdrStrength:[0,1]};
 for(var k in ranges)if(typeof p[k]!="number"||!isFinite(p[k])||p[k]<ranges[k][0]||p[k]>ranges[k][1])throw Error("Invalid stretch parameter: "+k);
 if(typeof p.hdrEnabled!="boolean")throw Error("Invalid HDR enable flag.");
 if(p.white<=p.black+1e-6)throw Error("White point must be above black point.");
}
// Positive hyperbolic slope centered on SP, integrated and normalized to 0..1.
// This is a GHS-style curve, not a parameter-compatible clone of PI's process.
function SWIntegral(x,D,b){var a=Math.abs(x),v=Math.abs(b-1)<1e-10?Math.log(1+D*a)/D:(Math.exp((1-b)*Math.log(1+D*a))-1)/(D*(1-b));return x<0?-v:v;}
function SWPrepare(p){
 SWValidate(p);var curve;
 if(SWIdentity(p))curve=function(x){return x;};
 else if(p.stage==0){var k=Math.exp(12*p.amount)-1,norm=SWAsinh(k);curve=function(x){return SWAsinh(k*x)/norm;};}
 else if(p.stage==1){var m=1/(1+Math.exp(6*p.balance));curve=function(x){return (1-m)*x/(m+(1-2*m)*x);};}
 else if(p.stage==3)curve=function(x){return x;};
 else if(p.stage==2){
  var D=Math.exp(12*p.amount)-1,b=p.shape,sp=p.sp,L=sp*p.shadows,H=1-(1-sp)*p.highlights;
  var il=SWIntegral(L-sp,D,b),ih=SWIntegral(H-sp,D,b),sl=Math.exp(-b*Math.log(1+D*Math.abs(L-sp))),sh=Math.exp(-b*Math.log(1+D*Math.abs(H-sp)));
  var low=il-L*sl,high=ih+(1-H)*sh,span=high-low;
  curve=function(x){var v=x<L?il+(x-L)*sl:x>H?ih+(x-H)*sh:SWIntegral(x-sp,D,b);return (v-low)/span;};
 }else{var black=p.black,span=p.white-p.black;curve=function(x){return SWClamp((x-black)/span,0,1);};}
 var hdr=null;
 if(!SWIdentity(p)&&p.stage!=3&&p.hdrEnabled&&p.hdrStrength>0){
  var base=curve,lo=0,hi=1;for(var i=0;i<42;i++){var mid=(lo+hi)/2;if(base(mid)<.65)lo=mid;else hi=mid;}
  var active=p.stage==0||p.stage==2?p.amount:p.stage==1?Math.abs(p.balance):Math.max(p.black/.25,(1-p.white)/.95);
  var knee=(lo+hi)/2,yk=base(knee),h=p.hdrStrength*SWClamp(active,0,1),ceiling=1-.035*h;
  hdr={knee:knee,yk:yk,strength:h,ceiling:ceiling};
  curve=function(x){var y=base(x);if(x<=knee)return y;var original=SWClamp((y-yk)/Math.max(1e-30,1-yk),0,1),linear=SWClamp((x-knee)/Math.max(1e-30,1-knee),0,1);return yk+(ceiling-yk)*((1-h)*original+h*linear);};
 }
 return {p:p,curve:curve,hdr:hdr,preserve:p.stage==4?(p.hdrEnabled&&p.hdrStrength>0?1:0):p.stage==0?p.color:1,identity:SWIdentity(p)};
}
function SWSmooth(x){x=SWClamp(x,0,1);return x*x*(3-2*x);}
function SWColorPixel(v,p){
 if(v.length!=3)return v.slice();
 var Y=.2126*v[0]+.7152*v[1]+.0722*v[2],hi=Math.max(v[0],v[1],v[2]),lo=Math.min(v[0],v[1],v[2]),sat=hi>1e-30?(hi-lo)/hi:0;
 var weight=(1-p.darkProtect*(1-SWSmooth(Y/.2)))*(1-p.brightProtect*SWSmooth((Y-.65)/.35));
 if(p.hdrEnabled)weight*=1-p.hdrStrength*SWSmooth((Y-.55)/.4);
 var desired=Math.exp(Math.LN2*2*(p.saturation+p.vibrance*(1-sat))*weight),limit=1e30;
 for(var c=0;c<3;c++){var delta=v[c]-Y;if(delta>0)limit=Math.min(limit,(1-Y)/delta);else if(delta<0)limit=Math.min(limit,-Y/delta);}
 var gain=desired;
 if(desired>1){var room=Math.max(0,limit-1);gain=room>1e-12?1+room*(1-Math.exp(-(desired-1)/room)):1;}
 return v.map(function(z){return SWClamp(Y+(z-Y)*gain,0,1);});
}
function SWPixel(v,op){
 if(op.identity)return v.slice();if(op.p.stage==3)return SWColorPixel(v,op.p);var f=op.curve,C=v.length,out=[];
 if(C==1)return [SWClamp(f(SWClamp(v[0],0,1)),0,1)];
 var R=SWClamp(v[0],0,1),G=SWClamp(v[1],0,1),B=SWClamp(v[2],0,1),Y=.2126*R+.7152*G+.0722*B;
 if(op.preserve===0)return [SWClamp(f(R),0,1),SWClamp(f(G),0,1),SWClamp(f(B),0,1)];
 var fy=SWClamp(f(Y),0,1),gain=Y>1e-30?fy/Y:0,t=1,raw=[R,G,B];
 for(var c=0;c<3;c++){var delta=raw[c]*gain-fy;if(delta>0)t=Math.min(t,(1-fy)/delta);else if(delta<0)t=Math.min(t,-fy/delta);}
 t=SWClamp(t,0,1);
 for(c=0;c<3;c++){var shared=fy+(raw[c]*gain-fy)*t;out.push(SWClamp(shared*op.preserve+(op.preserve<1?f(raw[c])*(1-op.preserve):0),0,1));}
 return out;
}
function SWRead(im,rect){var n=rect?(rect.x1-rect.x0)*(rect.y1-rect.y0):im.width*im.height,a=[];for(var c=0;c<im.numberOfChannels;c++){a[c]=new Float64Array(n);if(rect)im.getSamples(a[c],rect,c);else im.getSamples(a[c],new Rect(0,0,im.width,im.height),c);}return a;}
function SWMap(planes,steps){
 var out=planes.map(function(a){return new Float64Array(a);}),ops=steps.map(SWPrepare),C=out.length,N=out[0].length;
 for(var i=0;i<N;i++){var v=[];for(var c=0;c<C;c++)v.push(out[c][i]);for(var j=0;j<ops.length;j++)v=SWPixel(v,ops[j]);for(c=0;c<C;c++)out[c][i]=v[c];}return out;
}
function SWImage(planes,W,H){var C=planes.length,im=new Image(W,H,C,C==3?ColorSpace_RGB:ColorSpace_Gray,32,SampleType_Real);try{for(var c=0;c<C;c++)im.setSamples(planes[c],new Rect(0,0,W,H),c);return im;}catch(e){im.free();throw e;}}
function SWBitmap(planes,W,H,clip,input,p){
 var display=planes;
 if(clip&&p.stage==4){display=[new Float64Array(W*H),new Float64Array(W*H),new Float64Array(W*H)];
  for(var i=0;i<W*H;i++){var lo=false,hi=false;for(var c=0;c<input.length;c++){lo=lo||(p.hdrEnabled&&p.hdrStrength>0?planes[c][i]<=0:input[c][i]<p.black);hi=hi||(p.hdrEnabled&&p.hdrStrength>0?planes[c][i]>=1:input[c][i]>p.white);}
   for(c=0;c<3;c++)display[c][i]=hi?(c<2?1:0):lo?(c==1?0:1):planes[Math.min(c,planes.length-1)][i];}
 }
 var im=SWImage(display,W,H);try{return im.render();}finally{im.free();}
}
function SWBounds(d){var r=d.availableScreenRect;return {x:r.x0+12,y:r.y0+30,w:Math.max(320,r.width-24),h:Math.max(240,r.height-60)};}
function SWCenter(d){d.ensureLayoutUpdated();var b=SWBounds(d);d.move(b.x+Math.max(0,Math.floor((b.w-d.width)/2)),b.y+Math.max(0,Math.floor((b.h-d.height)/2)));}
function SWProgress(title,work){
 var d=new Dialog;d.windowTitle=title;d.cancelled=false;d.running=true;d.locked=false;d.fraction=0;
 var label=new Label(d);label.setMinWidth(440);label.text="Preparing...";
 var bar=new Control(d);bar.setFixedHeight(22);bar.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff252525));g.fillRect(0,0,Math.round(this.width*d.fraction),this.height,new Brush(0xff428cca));}finally{g.end();}};
 var cancel=new PushButton(d);cancel.text="Cancel";cancel.onClick=function(){if(!d.locked)d.cancelled=true;};
 d.sizer=new VerticalSizer;d.sizer.margin=12;d.sizer.spacing=8;d.sizer.add(label);d.sizer.add(bar);d.sizer.add(cancel);d.adjustToContents();
 d.onClose=function(){if(d.running){if(!d.locked)d.cancelled=true;return false;}return true;};
 var failure=null,result,last=0,timer=new Timer;timer.interval=.01;timer.periodic=false;
 function report(stage,f,locked){if(!d.locked&&console.abortRequested)d.cancelled=true;if(d.cancelled){var e=Error("Cancelled; image unchanged.");e.swCancelled=true;throw e;}d.locked=!!locked;cancel.enabled=!d.locked;d.fraction=SWClamp(f,0,1);
  var now=(new Date).getTime();if(now-last>50||locked||f>=1){last=now;label.text=stage+" ("+Math.round(100*d.fraction)+"%)";bar.update();processEvents();}
  if(d.cancelled){var e=Error("Cancelled; image unchanged.");e.swCancelled=true;throw e;}
 }
 timer.onTimeout=function(){try{result=work(report);}catch(e){failure=e;}finally{d.running=false;d.ok();}};
 d.onShow=function(){SWCenter(d);timer.start();};try{d.execute();}finally{timer.stop();}if(failure)throw failure;return result;
}
// Closed-form PixelMath expressions. Native output is checked against SWPixel.
function SWNum(x){if(!isFinite(x))throw Error("Nonfinite expression constant");return Number(x).toPrecision(17);}
function SWBaseExpression(p,x){
 if(SWIdentity(p))return x;
 if(p.stage==0){var k=Math.exp(12*p.amount)-1;return "(ln("+SWNum(k)+"*("+x+")+sqrt(1+"+SWNum(k*k)+"*("+x+")*("+x+")))/"+SWNum(SWAsinh(k))+")";}
 if(p.stage==1){var m=1/(1+Math.exp(6*p.balance));return "("+SWNum(1-m)+"*("+x+")/("+SWNum(m)+"+"+SWNum(1-2*m)+"*("+x+")))";}
 if(p.stage==3)return x;
 if(p.stage==4)return "min(1,max(0,(("+x+")-"+SWNum(p.black)+")/"+SWNum(p.white-p.black)+"))";
 var D=Math.exp(12*p.amount)-1,b=p.shape,sp=p.sp,L=sp*p.shadows,H=1-(1-sp)*p.highlights,il=SWIntegral(L-sp,D,b),ih=SWIntegral(H-sp,D,b),sl=Math.exp(-b*Math.log(1+D*Math.abs(L-sp))),sh=Math.exp(-b*Math.log(1+D*Math.abs(H-sp))),low=il-L*sl,high=ih+(1-H)*sh;
 var t="(("+x+")-"+SWNum(sp)+")",a="abs("+t+")",integral=Math.abs(b-1)<1e-10?"ln(1+"+SWNum(D)+"*"+a+")/"+SWNum(D):"(exp("+SWNum(1-b)+"*ln(1+"+SWNum(D)+"*"+a+"))-1)/"+SWNum(D*(1-b));
 integral="iif("+t+"<0,-("+integral+"),("+integral+"))";
 return "((iif(("+x+")<"+SWNum(L)+","+SWNum(il)+"+(("+x+")-"+SWNum(L)+")*"+SWNum(sl)+",iif(("+x+")>"+SWNum(H)+","+SWNum(ih)+"+(("+x+")-"+SWNum(H)+")*"+SWNum(sh)+","+integral+"))-("+SWNum(low)+"))/"+SWNum(high-low)+")";
}
function SWScalarExpression(p,x){
 var base=SWBaseExpression(p,x),op=SWPrepare(p);if(!op.hdr)return base;var h=op.hdr;
 return "iif(("+x+")<="+SWNum(h.knee)+",("+base+"),"+SWNum(h.yk)+"+"+SWNum(h.ceiling-h.yk)+"*("+SWNum(1-h.strength)+"*min(1,max(0,(("+base+")-"+SWNum(h.yk)+")/"+SWNum(1-h.yk)+"))+"+SWNum(h.strength)+"*min(1,max(0,(("+x+")-"+SWNum(h.knee)+")/"+SWNum(1-h.knee)+"))))";
}
function SWNativePass(view,p){
 var C=view.image.numberOfChannels,pm=new PixelMath,op=SWPrepare(p),common="",names=["swR","swG","swB"];
 if(op.identity)return;
 for(var c=0;c<C;c++)common+=names[c]+"=min(1,max(0,$T"+(C==1?"":"["+c+"]")+"));";
 if(p.stage==3&&C==3){
  common+="swY=0.2126*swR+0.7152*swG+0.0722*swB;swS=(max(swR,max(swG,swB))-min(swR,min(swG,swB)))/max(1e-30,max(swR,max(swG,swB)));swA=min(1,max(0,swY/0.2));swA=swA*swA*(3-2*swA);swC=min(1,max(0,(swY-0.65)/0.35));swC=swC*swC*(3-2*swC);swF=exp("+SWNum(Math.LN2*2)+"*("+SWNum(p.saturation)+"+"+SWNum(p.vibrance)+"*(1-swS))*(1-"+SWNum(p.darkProtect)+"*(1-swA))*(1-"+SWNum(p.brightProtect)+"*swC)"+(p.hdrEnabled?"*(1-"+SWNum(p.hdrStrength)+"*(min(1,max(0,(swY-0.55)/0.4))*min(1,max(0,(swY-0.55)/0.4))*(3-2*min(1,max(0,(swY-0.55)/0.4)))))":"")+");swK=1e30;";
  for(c=0;c<3;c++)common+="swD="+names[c]+"-swY;swK=min(swK,iif(swD>0,(1-swY)/max(1e-30,swD),iif(swD<0,swY/max(1e-30,-swD),1e30)));";
  common+="swT=max(0,swK-1);swF=iif(swF>1,iif(swT>1e-12,1+swT*(1-exp(-(swF-1)/max(1e-30,swT))),1),swF);";
  for(c=0;c<3;c++)common+=names[c]+"=swY+("+names[c]+"-swY)*swF;";
 }else if(C==3&&op.preserve>0){
  common+="swY=0.2126*swR+0.7152*swG+0.0722*swB;swF=min(1,max(0,"+SWScalarExpression(p,"swY")+"));swA=swF/max(1e-30,swY);swC=1;";
  for(c=0;c<3;c++)common+="swD="+names[c]+"*swA-swF;swC=min(swC,iif(swD>0,(1-swF)/max(1e-30,swD),iif(swD<0,swF/max(1e-30,-swD),1)));";
  for(c=0;c<3;c++)common+=names[c]+"="+SWNum(op.preserve)+"*(swF+("+names[c]+"*swA-swF)*swC)"+(op.preserve<1?"+"+SWNum(1-op.preserve)+"*("+SWScalarExpression(p,names[c])+")":"")+";";
 }else for(c=0;c<C;c++)common+=names[c]+"="+SWScalarExpression(p,names[c])+";";
 var probes=[];for(var y=0;y<8;y++)for(var x=0;x<12;x++){var xx=Math.min(view.image.width-1,Math.floor((x+.5)*view.image.width/12)),yy=Math.min(view.image.height-1,Math.floor((y+.5)*view.image.height/8)),v=[];for(c=0;c<C;c++)v.push(view.image.sample(xx,yy,c));probes.push({x:xx,y:yy,v:SWPixel(v,op)});}
 pm.useSingleExpression=C==1;pm.expression=common+"swR";if(C==3){pm.expression1=common+"swG";pm.expression2=common+"swB";}
 pm.symbols="swR,swG,swB,swY,swF,swA,swC,swD,swS,swK,swT";pm.generateOutput=true;pm.singleThreaded=false;pm.use64BitWorkingImage=true;pm.createNewImage=false;pm.rescale=false;pm.truncate=true;pm.truncateLower=0;pm.truncateUpper=1;
 if(!pm.executeOn(view,false))throw Error("Native curve execution failed.");
 var error=0;for(var i=0;i<probes.length;i++)for(c=0;c<C;c++){var z=view.image.sample(probes[i].x,probes[i].y,c);if(!isFinite(z))throw Error("Nonfinite native output.");error=Math.max(error,Math.abs(z-probes[i].v[c]));}
 if(error>2e-7)throw Error("Native curve validation mismatch: "+error);
}
function SWRenderFull(source,steps,progress){
 var w=null;
 try{progress("Preparing full-resolution working image",.02);w=new ImageWindow(source.width,source.height,source.numberOfChannels,64,true,source.isColor,"SmartWizard_Work");w.hide();var v=w.mainView;if(typeof UndoFlag_NoSwapFile!="undefined")v.beginProcess(UndoFlag_NoSwapFile);else v.beginProcess();try{v.image.assign(source);}finally{v.endProcess();}
  for(var i=0;i<steps.length;i++){progress("Applying "+SW_NAMES[steps[i].stage]+", pass "+(i+1),.05+.85*i/Math.max(1,steps.length));SWNativePass(v,steps[i]);}
  progress("Preparing final result",.92);return new Image(v.image);
 }catch(e){if(e.swCancelled)throw e;console.warningln("[Smart Stretch Wizard] Native path rejected; using exact tiled calculation: "+e);
 }finally{if(w&&!w.isNull)w.forceClose();}
 var out=new Image(source),rows=64;try{for(var y=0;y<source.height;y+=rows){progress("Calculating full-resolution tiles",.05+.85*y/source.height);var h=Math.min(rows,source.height-y),rect=new Rect(0,y,source.width,y+h),mapped=SWMap(SWRead(source,rect),steps);for(var c=0;c<mapped.length;c++)out.setSamples(mapped[c],rect,c);}return out;}catch(e){out.free();throw e;}
}
function SWControlPanel(owner,layout){
 var box=new ScrollBox(owner),doc=new Control(box.viewport),updating=false;
 doc.setFixedWidth(480);doc.sizer=layout;box.setFixedWidth(504);box.setMinHeight(280);box.autoScroll=true;box.lineHeight=24;
 box.updateContents=function(){if(updating)return;updating=true;try{doc.ensureLayoutUpdated();doc.adjustToContents();var h=Math.max(doc.height,box.viewport.height);doc.resize(doc.width,h);box.setVerticalScrollRange(0,Math.max(0,h-box.viewport.height));box.setHorizontalScrollRange(0,Math.max(0,doc.width-box.viewport.width));doc.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);}finally{updating=false;}};
 box.viewport.onResize=box.updateContents;box.onVerticalScrollPosUpdated=function(){doc.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);};box.onHorizontalScrollPosUpdated=box.onVerticalScrollPosUpdated;
 box.viewport.onMouseWheel=function(x,y,delta){box.verticalScrollPosition=SWClamp(box.verticalScrollPosition+(delta>0?-72:72),0,box.maxVerticalScrollPosition);doc.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);};
 return box;
}
function SWDialog(){
 this.__base__=Dialog;this.__base__();var self=this;this.windowTitle="Smart Stretch Wizard 0.3.0";this.userResizable=true;
 this.source=null;this.proxy=null;this.inputPlanes=null;this.basePlanes=null;this.proposed=null;this.view=null;this.steps=[];this.counts=[0,0,0,0,0];this.stage=0;this.history=[];this.busy=false;this.suspend=false;this.disposed=false;this.revision=0;this.zoom=1;this.panX=0;this.panY=0;this.before=false;
 function label(t){var c=new Label(self);c.text=t;return c;}
 function button(t,fn){var c=new PushButton(self);c.text=t;c.onClick=function(){run(fn);};return c;}
 function run(fn){if(self.busy||self.disposed)return;self.timer.stop();self.tileTimer.stop();self.busy=true;self.enabled=false;try{fn();}catch(e){if(e.swCancelled)self.status.text="Cancelled; image unchanged.";else new MessageBox(String(e),self.windowTitle,StdIcon_Error,StdButton_Ok).execute();}finally{self.busy=false;self.enabled=true;self.updateButtons();self.canvas.update();}}
 function row(a){var r=new HorizontalSizer;r.spacing=6;for(var i=0;i<a.length;i++)r.add(a[i]);return r;}
 function number(t,lo,hi,val,tip){var c=new NumericControl(self);c.label.text=t;c.setRange(lo,hi);c.setPrecision(5);c.slider.setRange(0,1000);c.setValue(val);c.toolTip=tip;c.onValueUpdated=function(){if(!self.suspend)self.schedule();};return c;}
 this.views=[];this.target=new ComboBox(this);this.target.addItem("Select image");var windows=ImageWindow.windows;
 for(var i=0;i<windows.length;i++){var v=windows[i].mainView;if(v.image.numberOfChannels==1||v.image.numberOfChannels==3){this.views.push(v);this.target.addItem(v.id);}}
 this.target.onItemSelected=function(i){if(i>0)run(function(){if(self.confirmDiscard())self.load(self.views[i-1]);else self.target.currentItem=self.views.indexOf(self.view)+1;});};
 this.reload=button("Reload",function(){if(self.view&&self.confirmDiscard())self.load(self.view);});
 this.heading=label("");this.passLabel=label("");this.passLabel.wordWrapping=true;this.passLabel.setMinHeight(34);this.description=label("");this.description.wordWrapping=true;this.description.setMinHeight(76);
 this.canvas=new Control(this);this.canvas.setMinSize(520,380);this.canvas.toolTip="Wheel: zoom at cursor. Drag: pan. Fit or 1:1 to inspect. No region selection.";
 this.bitmap=null;this.tiles={};this.tileQueue=[];this.tileTimer=new Timer;this.tileTimer.interval=.01;this.tileTimer.periodic=false;
 this.clearTiles=function(){self.tileTimer.stop();self.tiles={};self.tileQueue=[];self.revision++;};
 this.geometry=function(){if(!self.bitmap)return null;var fit=Math.min(self.canvas.width/self.bitmap.width,self.canvas.height/self.bitmap.height),scale=fit*self.zoom,cw=self.bitmap.width*scale,ch=self.bitmap.height*scale;self.panX=SWClamp(self.panX,-Math.max(0,(cw-self.canvas.width)/2),Math.max(0,(cw-self.canvas.width)/2));self.panY=SWClamp(self.panY,-Math.max(0,(ch-self.canvas.height)/2),Math.max(0,(ch-self.canvas.height)/2));return {scale:scale,x:(self.canvas.width-cw)/2+self.panX,y:(self.canvas.height-ch)/2+self.panY};};
 this.displaySteps=function(){var a=self.steps.slice(),p=self.parameters();if(!self.before&&!SWIdentity(p))a.push(p);return a;};
 this.tileTimer.onTimeout=function(){if(self.busy||self.disposed||!self.source||!self.tileQueue.length)return;var t=self.tileQueue.shift(),im=null;try{var steps=self.displaySteps(),rect=new Rect(t.x,t.y,t.x+t.w,t.y+t.h),raw=SWRead(self.source,rect),base=self.before?null:SWMap(raw,self.steps),mapped=SWMap(raw,steps);self.tiles[t.key]=SWBitmap(mapped,t.w,t.h,self.clipping.checked&&!self.before,base||raw,self.parameters());if(Object.keys(self.tiles).length>64)delete self.tiles[Object.keys(self.tiles)[0]];}catch(e){self.tileQueue=[];self.status.text="Native preview tile: "+e;}finally{self.canvas.update();}if(self.tileQueue.length)self.tileTimer.start();};
 this.canvas.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff111111));var z=self.geometry();if(!z)return;g.drawScaledBitmap(new Rect(z.x,z.y,z.x+self.bitmap.width*z.scale,z.y+self.bitmap.height*z.scale),self.bitmap);
  var ns=z.scale*self.bitmap.width/self.source.width;if(ns>=.5){var x0=Math.max(0,Math.floor(-z.x/ns/256)),y0=Math.max(0,Math.floor(-z.y/ns/256)),x1=Math.min(Math.ceil(self.source.width/256),Math.ceil((this.width-z.x)/ns/256)),y1=Math.min(Math.ceil(self.source.height/256),Math.ceil((this.height-z.y)/ns/256)),queue=[];
   for(var ty=y0;ty<y1;ty++)for(var tx=x0;tx<x1;tx++){var key=self.revision+":"+tx+":"+ty,x=tx*256,y=ty*256,w=Math.min(256,self.source.width-x),h=Math.min(256,self.source.height-y);if(self.tiles[key])g.drawScaledBitmap(new Rect(z.x+x*ns,z.y+y*ns,z.x+(x+w)*ns,z.y+(y+h)*ns),self.tiles[key]);else queue.push({key:key,x:x,y:y,w:w,h:h});}
   self.tileQueue=queue;if(queue.length&&!self.tileTimer.isRunning)self.tileTimer.start();}
 }finally{g.end();}};
 this.canvas.onMouseWheel=function(x,y,delta){if(!self.bitmap||!delta||self.busy)return;var z=self.geometry(),u=(x-z.x)/z.scale,v=(y-z.y)/z.scale;self.zoom=SWClamp(self.zoom*(delta>0?1.5:1/1.5),1,128);var nz=self.geometry();self.panX+=x-(nz.x+u*nz.scale);self.panY+=y-(nz.y+v*nz.scale);self.canvas.update();};
 this.canvas.onMousePress=function(x,y,b){if(b==MouseButton_Left)self.drag={x:x,y:y,px:self.panX,py:self.panY};};
 this.canvas.onMouseMove=function(x,y){if(self.drag){self.panX=self.drag.px+x-self.drag.x;self.panY=self.drag.py+y-self.drag.y;self.canvas.update();}};this.canvas.onMouseRelease=function(){self.drag=null;};
 this.fit=button("Fit",function(){self.zoom=1;self.panX=self.panY=0;self.canvas.update();});
 this.one=button("1:1",function(){if(!self.source||!self.bitmap)return;var fit=Math.min(self.canvas.width/self.bitmap.width,self.canvas.height/self.bitmap.height);self.zoom=SWClamp(self.source.width/self.bitmap.width/fit,1,128);self.canvas.update();});
 this.compare=new CheckBox(this);this.compare.text="Before this pass";this.compare.toolTip="Compare against the last accepted result; checked means the proposed pass is hidden.";this.compare.onCheck=function(v){self.before=v;self.refresh();};
 this.amount=number("Stretch amount",0,1,0,"Additional stretch for this pass. Each accepted refinement halves the available maximum.");
 this.color=number("Color preservation",0,1,1,"1 uses a shared brightness gain with gamut compression. 0 stretches RGB channels independently.");
 this.balance=number("Midtone balance",-1,1,0,"Positive brightens; negative darkens. Zero changes nothing. Endpoints remain fixed.");
 this.sp=number("Symmetry point",0,1,.2,"The tonal value receiving the strongest slope in the GHS-style curve. Click the input histogram to place it.");
 this.shape=number("Contrast shape",.1,4,1,"Concentration of the hyperbolic slope around the symmetry point. Higher is more concentrated.");
 this.shadows=number("Shadow linearity",0,1,0,"Extend the GHS-style curve linearly below a boundary approaching the symmetry point. This is global tonal control, not HDR protection.");
 this.highlights=number("Highlight linearity",0,1,0,"Extend the GHS-style curve linearly above a boundary approaching the symmetry point. This is global tonal control, not HDR protection.");
 this.black=number("Black point",0,.25,0,"Input value mapped to zero. Pixels below this point clip to black.");
 this.white=number("White point",.05,1,1,"Input value mapped to one. Pixels above this point clip in at least one channel.");
 this.black.onValueUpdated=function(){if(self.suspend)return;if(self.black.value>=self.white.value-1e-5){self.suspend=true;try{self.white.setValue(Math.min(1,self.black.value+1e-5));}finally{self.suspend=false;}}self.schedule();};
 this.white.onValueUpdated=function(){if(self.suspend)return;if(self.white.value<=self.black.value+1e-5){self.suspend=true;try{self.black.setValue(Math.max(0,self.white.value-1e-5));}finally{self.suspend=false;}}self.schedule();};
 this.hdrEnabled=new CheckBox(this);this.hdrEnabled.text="Enable HDR Protection";this.hdrEnabled.checked=true;
 this.hdrEnabled.toolTip="Global tonal protection, carried between stages. Brightness passes preserve an upper-tone slope and reserve highlight headroom; Color restrains bright-area color changes. No spatial mask is used.";
 this.hdrStrength=number("HDR protection strength",0,1,.5,"0 is the original unprotected curve. Higher values blend the upper curve toward a linear shoulder and reserve up to 3.5% headroom per active pass. Protection scales with pass strength so tiny refinements remain gentle. In Color, stronger protection restrains bright-area saturation changes.");
 this.hdrEnabled.onCheck=function(v){self.hdrStrength.enabled=v;self.schedule();};
 this.saturation=number("Saturation",-1,1,0,"Strengthen or reduce global color differences from neutral while preserving luminance. Zero is unchanged.");
 this.vibrance=number("Vibrance",-1,1,0,"Favor muted colors; already strongly saturated colors receive less adjustment.");
 this.darkProtect=number("Shadow protection",0,1,.5,"Reduce the color adjustment in dark pixels to restrain background color noise. Global luminance weighting only.");
 this.brightProtect=number("Highlight protection",0,1,.5,"Reduce the color adjustment in bright pixels. This is tonal weighting, not the proposed HDR feature.");
 this.clipping=new CheckBox(this);this.clipping.text="Show endpoint clipping";this.clipping.onCheck=function(){self.refresh();};this.clipping.toolTip="Magenta marks black-clipped channels and yellow marks white-clipped channels. With HDR Protection, this checks the protected output rather than the unprotected white threshold. Preview only.";
 this.hist=new Control(this);this.hist.setMinSize(420,170);this.hist.toolTip="Input histogram is gray; proposed histogram is blue. In GHS stage only, click to place the symmetry point. No pixels are selected.";
 this.histogram=function(planes){var bins=new Array(256);for(var i=0;i<256;i++)bins[i]=0;for(var i=0;i<planes[0].length;i++){var v=planes.length==1?planes[0][i]:.2126*planes[0][i]+.7152*planes[1][i]+.0722*planes[2][i];bins[Math.floor(SWClamp(v,0,1)*255)]++;}return bins;};
 this.hist.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff181818));if(!self.histInput)return;var a=self.histInput,b=self.histOutput,max=1;for(var i=0;i<256;i++)max=Math.max(max,Math.log(1+a[i]),Math.log(1+b[i]));for(var i=0;i<256;i++){var x=i*(this.width-1)/255;g.pen=new Pen(0xff777777);g.drawLine(x,this.height-15,x,this.height-15-(this.height-25)*Math.log(1+a[i])/max);g.pen=new Pen(0xff4e9fcf);g.drawLine(x,this.height-15,x,this.height-15-(this.height-25)*Math.log(1+b[i])/max);}var markers=self.stage==2?[self.sp.value]:self.stage==4?[self.black.value,self.white.value]:[];g.pen=new Pen(0xffffd050,2);for(i=0;i<markers.length;i++){var x=markers[i]*(this.width-1);g.drawLine(x,0,x,this.height-12);}}finally{g.end();}};
 this.hist.onMousePress=function(x,y,b){if(self.stage==2&&b==MouseButton_Left&&!self.busy){self.sp.setValue(SWClamp(x/(this.width-1),0,1));self.schedule();}};
 this.status=label("Load a linear image to begin. No changes are written until Apply.");this.status.wordWrapping=true;this.status.setMinHeight(55);
 this.refine=button("Accept & Refine",function(){var p=self.parameters();if(SWIdentity(p))throw Error("Adjust this pass before accepting a refinement.");self.saveUndo();self.steps.push(p);self.counts[self.stage]++;self.resetControls();self.rebuildBase();self.refresh();});
 this.undo=button("Undo Last Pass",function(){if(!self.history.length)return;var h=self.history.pop();self.steps=h.steps;self.counts=h.counts;self.stage=h.stage;self.configure();self.setParameters(h.parameters);self.rebuildBase();self.refresh();});
 this.back=button("Back",function(){if(self.stage==0)return;self.saveUndo();var previous=self.stage-1;self.steps=self.steps.filter(function(p){return p.stage<=previous;});for(var i=previous+1;i<5;i++)self.counts[i]=0;self.stage=previous;self.configure();self.resetControls();self.rebuildBase();self.refresh();});
 this.next=button("Next Stage",function(){if(self.stage>=4)return;self.saveUndo();var p=self.parameters();if(!SWIdentity(p)){self.steps.push(p);self.counts[self.stage]++;}self.stage++;self.configure();self.resetControls();self.rebuildBase();self.refresh();});
 this.reset=button("Restart Wizard",function(){if(self.source&&self.confirmDiscard()){self.steps=[];self.history=[];self.counts=[0,0,0,0,0];self.stage=0;self.configure();self.resetControls();self.rebuildBase();self.refresh();}});
 this.apply=new ToolButton(this);this.apply.icon=this.scaledResource(":/process-interface/apply.png");this.apply.setFixedSize(24,24);this.apply.toolTip="Final stage: apply all accepted passes plus the visible proposed pass to the actual image, with PixInsight Undo.";this.apply.onClick=function(){run(self.applyFull);};
 this.triangle=new ToolButton(this);this.triangle.icon=this.scaledResource(":/process-interface/new-instance.png");this.triangle.setFixedSize(24,24);this.triangle.toolTip="Drag to save the wizard recipe and settings. Image pixels are not stored.";this.triangle.onMousePress=function(x,y,b){if(b!=MouseButton_Left||self.busy)return;this.pushed=false;run(function(){Parameters.set("swWizard",JSON.stringify(self.capture()));self.newInstance();});};
 this.close=button("Close",function(){if(self.confirmDiscard()){self.closeApproved=true;self.ok();}});this.onClose=function(){return self.closeApproved||(!self.busy&&self.confirmDiscard());};this.onKeyPress=function(key){if(key==Key_Escape){if(!self.busy&&self.confirmDiscard()){self.closeApproved=true;self.cancel();}return true;}return false;};
 this.timer=new Timer;this.timer.interval=.12;this.timer.periodic=false;this.timer.onTimeout=function(){if(!self.disposed&&!self.busy)run(self.refresh);};this.schedule=function(){self.timer.stop();self.timer.start();};
 this.parameters=function(){return {stage:self.stage,amount:self.amount.value,color:self.color.value,balance:self.balance.value,sp:self.sp.value,shape:self.shape.value,shadows:self.shadows.value,highlights:self.highlights.value,black:self.black.value,white:self.white.value,saturation:self.saturation.value,vibrance:self.vibrance.value,darkProtect:self.darkProtect.value,brightProtect:self.brightProtect.value,hdrEnabled:self.hdrEnabled.checked,hdrStrength:self.hdrStrength.value};};
 this.setParameters=function(p){self.suspend=true;try{for(var k in p)if(k=="hdrEnabled")self.hdrEnabled.checked=!!p[k];else if(k!="stage"&&self[k]&&typeof self[k].setValue=="function")self[k].setValue(p[k]);self.hdrStrength.enabled=self.hdrEnabled.checked;}finally{self.suspend=false;}};
 this.resetControls=function(){var defaults=SWDefaults(self.stage);defaults.hdrEnabled=self.hdrEnabled.checked;defaults.hdrStrength=self.hdrStrength.value;self.setParameters(defaults);self.before=false;self.compare.checked=false;self.configure();};
 this.configure=function(){self.suspend=true;try{var scale=Math.pow(.5,Math.min(12,self.counts[self.stage]));self.amount.setRange(0,scale);self.balance.setRange(-scale,scale);self.black.setRange(0,.25*scale);self.white.setRange(1-.95*scale,1);self.saturation.setRange(-scale,scale);self.vibrance.setRange(-scale,scale);
  self.amount.visible=self.stage==0||self.stage==2;self.color.visible=self.stage==0;self.balance.visible=self.stage==1;self.sp.visible=self.shape.visible=self.shadows.visible=self.highlights.visible=self.stage==2;self.black.visible=self.white.visible=self.clipping.visible=self.stage==4;
  self.saturation.visible=self.vibrance.visible=self.darkProtect.visible=self.brightProtect.visible=self.stage==3;self.saturation.enabled=self.vibrance.enabled=!!self.source&&self.source.numberOfChannels==3;
  self.heading.text=(self.stage+1)+" / 5   "+SW_NAMES[self.stage];self.passLabel.text="Accepted passes: "+self.counts[self.stage]+"   |   Remaining adjustment range: "+(scale*100).toFixed(3)+"%";
  self.description.text=["Reveal the signal with an arcsinh curve. Leave headroom for the following stages. This first step is intended for linear data.","Set intermediate-tone brightness with a midtones transfer function. Positive brightens; negative darkens. Black and white stay fixed.","Shape contrast around a chosen tonal value. Histogram clicks move SP globally; they do not select a spatial region. This is a GHS-style hyperbolic curve.","Strengthen nebula colors with luminance-preserving saturation and vibrance. Shadow/highlight weighting limits unwanted color boosts. Gamut compression avoids hard channel clipping. Mono images are unchanged.","Set final black and white endpoints. Watch the clipping counts. These are global levels. With HDR Protection enabled, the upper curve becomes a nonlinear shoulder to reduce white-point clipping."][self.stage];
 }finally{self.suspend=false;}self.updateButtons();if(self.panel)self.panel.updateContents();};
 this.updateButtons=function(){self.refine.enabled=!!self.source&&self.counts[self.stage]<12;self.undo.enabled=!!self.history.length;self.back.enabled=!!self.source&&self.stage>0;self.next.enabled=!!self.source&&self.stage<4;self.apply.enabled=!!self.source&&self.stage==4;self.triangle.enabled=!!self.source;};
 this.saveUndo=function(){self.history.push({steps:SWCopy(self.steps),counts:self.counts.slice(),stage:self.stage,parameters:self.parameters()});if(self.history.length>100)self.history.shift();};
 this.confirmDiscard=function(){return (!self.steps.length&&(!self.source||SWIdentity(self.parameters())))||new MessageBox("Discard the current local wizard adjustments?",self.windowTitle,StdIcon_Warning,StdButton_Yes,StdButton_No).execute()==StdButton_Yes;};
 this.rebuildBase=function(){if(self.inputPlanes)self.basePlanes=SWMap(self.inputPlanes,self.steps);};
 this.refresh=function(){if(!self.source)return;var p=self.parameters();SWValidate(p);self.proposed=SWMap(self.basePlanes,[p]);var visible=self.before?self.basePlanes:self.proposed;
  self.bitmap=SWBitmap(visible,self.proxy.width,self.proxy.height,self.clipping.checked&&!self.before,self.basePlanes,p);self.histInput=self.histogram(self.basePlanes);self.histOutput=self.histogram(self.proposed);self.clearTiles();self.hist.update();self.canvas.update();
  var low=0,high=0,N=self.proposed[0].length;for(var i=0;i<N;i++){var l=false,h=false;for(var c=0;c<self.proposed.length;c++){if(self.stage==4&&!(p.hdrEnabled&&p.hdrStrength>0)){l=l||self.basePlanes[c][i]<p.black;h=h||self.basePlanes[c][i]>p.white;}else{l=l||self.proposed[c][i]<=0;h=h||self.proposed[c][i]>=1;}}if(l)low++;if(h)high++;}
  self.status.text="Local passes: "+self.steps.length+". Preview estimate: "+low+" pixels "+(self.stage==4&&!(p.hdrEnabled&&p.hdrStrength>0)?"below black":"at black")+" ("+(100*low/N).toFixed(2)+"%); "+high+" "+(self.stage==4&&!(p.hdrEnabled&&p.hdrStrength>0)?"above white":"at white")+" ("+(100*high/N).toFixed(2)+"%). "+(self.before?"Showing input to this pass.":"Showing proposed result.");
 };
 this.load=function(view){if(!view||view.isNull)throw Error("Image is closed.");var C=view.image.numberOfChannels;if(C!=1&&C!=3)throw Error("Use a mono or RGB image without alpha channels.");var source=new Image(view.image),proxy=null;try{proxy=new Image(source);var scale=Math.min(1,800/proxy.width,600/proxy.height);if(scale<1)proxy.resample(scale);var planes=SWRead(proxy);for(var c=0;c<C;c++)for(var i=0;i<planes[c].length;i++)if(!isFinite(planes[c][i])||planes[c][i]<0||planes[c][i]>1)throw Error("The image must have finite samples in [0,1].");}catch(e){source.free();if(proxy)proxy.free();throw e;}
  self.clearTiles();if(self.source)self.source.free();if(self.proxy)self.proxy.free();self.source=source;self.proxy=proxy;self.inputPlanes=planes;self.view=view;self.steps=[];self.history=[];self.counts=[0,0,0,0,0];self.stage=0;self.zoom=1;self.panX=self.panY=0;self.resetControls();self.rebuildBase();self.refresh();
 };
 this.applyFull=function(){if(!self.source||!self.view||self.view.isNull)throw Error("Load an image first.");if(self.stage!=4)throw Error("Complete all five wizard stages before applying.");var steps=self.steps.slice(),p=self.parameters();SWValidate(p);if(!SWIdentity(p))steps.push(p);if(!steps.length)throw Error("No stretch passes to apply.");
  SWProgress("Smart Stretch Wizard — Apply",function(progress){var live=self.view.image;if(live.width!=self.source.width||live.height!=self.source.height||live.numberOfChannels!=self.source.numberOfChannels)throw Error("Target changed. Reload before applying.");
   for(var y=0;y<live.height;y+=64){progress("Checking target image",.02*y/live.height);var rect=new Rect(0,y,live.width,Math.min(live.height,y+64)),a=SWRead(live,rect),b=SWRead(self.source,rect);for(var c=0;c<a.length;c++)for(var i=0;i<a[c].length;i++){if(!isFinite(b[c][i])||b[c][i]<0||b[c][i]>1)throw Error("Source samples outside [0,1] are not supported.");if(a[c][i]!==b[c][i])throw Error("Target pixels changed since loading. The source has not been overwritten.");}}
   var result=SWRenderFull(self.source,steps,progress);try{progress("Applying result to image",.98,true);self.view.beginProcess(UndoFlag_PixelData);try{self.view.image.assign(result);}finally{self.view.endProcess();}progress("Complete",1,true);}finally{result.free();}
  });self.closeApproved=true;self.ok();
 };
 this.capture=function(){return {schema:3,viewId:self.view?self.view.id:"",steps:SWCopy(self.steps),counts:self.counts.slice(),stage:self.stage,parameters:self.parameters()};};
 this.restore=function(state){
  if(state&&state.schema===1){state=SWCopy(state);state.schema=2;state.counts.splice(3,0,0);if(state.stage==3)state.stage=4;state.steps=state.steps.map(function(p){if(p.stage==3)p.stage=4;var d=SWDefaults(p.stage);for(var k in p)d[k]=p[k];return d;});if(state.parameters.stage==3)state.parameters.stage=4;var d=SWDefaults(state.parameters.stage);for(var k in state.parameters)d[k]=state.parameters[k];state.parameters=d;}
  if(state&&state.schema===2){state=SWCopy(state);state.schema=3;state.steps=state.steps.map(function(p){var d=SWDefaults(p.stage);for(var k in p)d[k]=p[k];return d;});var d=SWDefaults(state.parameters.stage);for(var k in state.parameters)d[k]=state.parameters[k];state.parameters=d;}
  if(!state||state.schema!==3||!Array.isArray(state.steps)||state.steps.length>100||!Array.isArray(state.counts)||state.counts.length!=5||state.stage%1||state.stage<0||state.stage>4)throw Error("Invalid wizard instance.");for(var i=0;i<state.steps.length;i++)SWValidate(state.steps[i]);SWValidate(state.parameters);if(state.parameters.stage!==state.stage)throw Error("Inconsistent saved stage.");for(i=0;i<5;i++)if(state.counts[i]%1||state.counts[i]<0||state.counts[i]>100)throw Error("Invalid refinement counter.");self.steps=SWCopy(state.steps);self.counts=state.counts.slice();self.stage=state.stage;self.configure();self.setParameters(state.parameters);self.rebuildBase();self.refresh();};
 this.dispose=function(){self.disposed=true;self.timer.stop();self.tileTimer.stop();self.centerTimer.stop();self.tiles={};self.bitmap=null;if(self.source)self.source.free();if(self.proxy)self.proxy.free();self.source=self.proxy=null;self.inputPlanes=self.basePlanes=self.proposed=null;};
 // A fixed-width controls column beside a flexible preview, no region controls.
 var left=new VerticalSizer;left.spacing=6;left.add(row([this.target,this.reload]));left.add(this.canvas,100);left.add(row([this.fit,this.one,this.compare]));
 var right=new VerticalSizer;right.spacing=8;right.add(this.heading);right.add(this.passLabel);right.add(this.description);right.add(this.hist);right.add(this.hdrEnabled);right.add(this.hdrStrength);
 var controls=[this.amount,this.color,this.balance,this.sp,this.shape,this.shadows,this.highlights,this.saturation,this.vibrance,this.darkProtect,this.brightProtect,this.black,this.white,this.clipping];for(var i=0;i<controls.length;i++)right.add(controls[i]);right.add(this.refine);right.add(row([this.undo,this.reset]));right.add(row([this.back,this.next]));right.add(this.status);right.addStretch();
 this.panel=SWControlPanel(this,right);var columns=new HorizontalSizer;columns.spacing=12;columns.add(left,100);columns.add(this.panel);
 var footer=new HorizontalSizer;footer.spacing=6;footer.add(this.triangle);footer.add(this.apply);footer.addStretch();footer.add(this.close);
 this.sizer=new VerticalSizer;this.sizer.margin=10;this.sizer.spacing=8;this.sizer.add(columns,100);this.sizer.add(footer);this.configure();this.adjustToContents();var bounds=SWBounds(this);this.setMinSize(Math.min(bounds.w,1020),Math.min(bounds.h,650));this.setMaxSize(bounds.w,bounds.h);this.resize(Math.min(bounds.w,1450),Math.min(bounds.h,900));
 this.centerTimer=new Timer;this.centerTimer.interval=.05;this.centerTimer.periodic=false;this.centerTimer.onTimeout=function(){SWCenter(self);};this.onShow=function(){self.centerTimer.start();};this.onHide=function(){self.centerTimer.stop();self.tileTimer.stop();};
 var active=ImageWindow.activeWindow;if(active&&!active.isNull){var index=this.views.indexOf(active.mainView);if(index>=0){this.target.currentItem=index+1;this.load(this.views[index]);}}
}
SWDialog.prototype=new Dialog;
function SWMain(){var d=new SWDialog;try{if(Parameters.has("swWizard")){var state=JSON.parse(Parameters.getString("swWizard")),view=Parameters.isViewTarget?Parameters.targetView:null;if(!view)for(var i=0;i<d.views.length;i++)if(d.views[i].id==state.viewId)view=d.views[i];if(view){d.target.currentItem=d.views.indexOf(view)+1;d.load(view);}if(!d.source)throw Error("Open the saved recipe's source image first.");d.restore(state);if(Parameters.isViewTarget&&d.stage==4){d.applyFull();return;}}d.execute();}finally{d.dispose();}}
SWMain();
