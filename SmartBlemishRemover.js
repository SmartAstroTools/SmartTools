// Standalone PixInsight script. Rename SmartBlemishRemover.txt to SmartBlemishRemover.js before running.
// Shared region click rule: normal click replaces; Ctrl-click toggles.
function STRegionColorHit(regions,q){
 var sum=q.r+q.g+q.b;
 for(var i=0;i<regions.length;i++){var s=regions[i];if((s.mode||s.type)!="color"||s.spatial)continue;
  var ss=s.r+s.g+s.b;if(ss<=1e-10||sum<=1e-10){if(ss<=1e-10&&sum<=1e-10)return i;continue;}
  var dr=s.r/ss-q.r/sum,dg=s.g/ss-q.g/sum,db=s.b/ss-q.b/sum;
  if(Math.sqrt(dr*dr+dg*dg+db*db)<=.35*Math.min(s.tolerance,q.tolerance))return i;
 }return -1;
}
/* Suite native zoom 1.0:. Fit / 1:1; original-resolution tiles at 50%+. */
#include <pjsr/SampleType.jsh>
/* Screen-fit layout update 1.0.1. */
/* Smart Blemish Remover 0.6.0 — experimental PJSR color repair.
Install as SmartBlemishRemover.js.
Local mode preserves weighted RGB intensity. Background mode maps brightness
to the selected background while preserving adjustable local contrast. Negative/HDR samples outside [0,1] are rejected.
Background preview supplies robust median chromaticity, not cloned texture.
Local donors exclude every color-selected pixel, including lasso exclusions.
Preview is reduced; Delete Blemish repairs the native-resolution local working copy.
The Apply square commits accumulated repairs to the target in one undoable write.
*/
#feature-id Utilities > Smart Blemish Remover
#feature-info Color blemish repair preserving original intensity gradients, with display-only Auto STF.
#include <pjsr/Sizer.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/ButtonCodes.jsh>
#include <pjsr/KeyCodes.jsh>
#include <pjsr/UndoFlag.jsh>
#define SMART_SUITE_APP
// Embedded SmartTools support.
var STScreenFit = typeof STScreenFit === "undefined" ? {} : STScreenFit;

STScreenFit.px = function(c,n){
   return typeof c.logicalPixelsToPhysical == "function" ? c.logicalPixelsToPhysical(n) : n;
};

STScreenFit.bounds = function(c){
   var r=null;
   try{r=c.availableScreenRect;}catch(e){}
   if(!r || !isFinite(r.width) || !isFinite(r.height) || r.width<160 || r.height<160)
      return {x:0,y:0,width:1000,height:640,fallback:true};
   var mx=STScreenFit.px(c,12),my=STScreenFit.px(c,32);
   return {x:r.x0+mx,y:r.y0+my,
      width:Math.max(120,Math.floor(r.width-2*mx)),
      height:Math.max(120,Math.floor(r.height-2*my)),fallback:false};
};

STScreenFit.center = function(d){
   d.ensureLayoutUpdated();
   var b=STScreenFit.bounds(d);
   d.move(b.x+Math.max(0,Math.floor((b.width-d.width)/2)),
          b.y+Math.max(0,Math.floor((b.height-d.height)/2)));
};

STScreenFit.installCenter = function(d){
   if(d._stCenterInstalled)return;
   var oldShow=d.onShow,oldHide=d.onHide;
   // Native modal placement may run AFTER onShow. Defer the final move until
   // the event loop resumes, retaining the timer for the dialog lifetime.
   d._stCenterTimer=new Timer;d._stCenterTimer.interval=.05;d._stCenterTimer.periodic=false;
   d._stCenterTimer.onTimeout=function(){STScreenFit.center(d);};
   d.onShow=function(){var result;if(oldShow)result=oldShow.apply(d,arguments);STScreenFit.center(d);d._stCenterTimer.start();return result;};
   d.onHide=function(){d._stCenterTimer.stop();if(oldHide)return oldHide.apply(d,arguments);return undefined;};
   d._stCenterInstalled=true;
};

STScreenFit.sideWidth = function(c){
   return Math.max(160,Math.min(820,Math.floor(STScreenFit.bounds(c).width*.42)));
};

STScreenFit.previewSize = function(c,w,h,reserveWidth,reserveHeight){
   var b=STScreenFit.bounds(c);
   var rw=reserveWidth===undefined ? STScreenFit.sideWidth(c)+80 : reserveWidth;
   var rh=reserveHeight===undefined ? STScreenFit.px(c,340) : reserveHeight;
   return {width:Math.max(100,Math.min(w||1280,Math.floor(b.width-rw))),
      height:Math.max(80,Math.min(h||760,Math.floor(b.height-rh)))};
};

STScreenFit.preview = function(c,w,h,rw,rh,fixed){
   var s=STScreenFit.previewSize(c,w,h,rw,rh);
   if(fixed)c.setFixedSize(s.width,s.height);else c.setMinSize(s.width,s.height);
   return s;
};

STScreenFit.scroll = function(owner,layout,w,h){
   var box=new ScrollBox(owner),document=new Control(box.viewport);
   box.autoScroll=true;box.lineWidth=STScreenFit.px(owner,24);box.lineHeight=STScreenFit.px(owner,24);
   document.sizer=layout;document.adjustToContents();
   var naturalW=Math.max(1,document.width),naturalH=Math.max(1,document.height),updating=false;
   box.setMinSize(Math.min(w,STScreenFit.px(owner,240)),Math.min(h,STScreenFit.px(owner,100)));
   box.resize(w,h);
   var update=function(){
      if(updating)return;updating=true;
      try{
         document.resize(Math.max(naturalW,box.viewport.width),Math.max(naturalH,box.viewport.height));
         box.pageWidth=box.viewport.width;box.pageHeight=box.viewport.height;
         box.setHorizontalScrollRange(0,Math.max(0,document.width-box.viewport.width));
         box.setVerticalScrollRange(0,Math.max(0,document.height-box.viewport.height));
         document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);
      }finally{updating=false;}
   };
   box.viewport.onResize=update;
   box.onHorizontalScrollPosUpdated=function(){document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);};
   box.onVerticalScrollPosUpdated=function(){document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);};
   box.viewport.onMouseWheel=function(x,y,delta){
      var step=delta>0?-box.lineHeight*3:delta<0?box.lineHeight*3:0;
      box.verticalScrollPosition=Math.max(0,Math.min(box.maxVerticalScrollPosition,box.verticalScrollPosition+step));
      document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);
   };
   box._stDocument=document;box._stUpdate=update;
   box._stNaturalWidth=naturalW;box._stNaturalHeight=naturalH;
   update();return box;
};

STScreenFit.limit = function(d,initial){
   var b=STScreenFit.bounds(d);
   d.setMinSize(Math.min(STScreenFit.px(d,360),b.width),Math.min(STScreenFit.px(d,240),b.height));
   d.setMaxSize(b.width,b.height);
   d.resize(Math.min(b.width,initial?d._stDesiredWidth:d.width),Math.min(b.height,initial?d._stDesiredHeight:d.height));
   return b;
};

STScreenFit.install = function(d){
   if(d._stScreenFitted || !d._stBody)return;
   var body=d._stBody,footer=d._stFooter||null;
   if(footer)body.remove(footer);
   // _stBody is a fresh, unattached layout, never previously a dialog sizer.
   // Every sizer is assigned once. Do not clear, detach or transfer a native
   // control's sizer: PJSR rejects that with "Illegal call to SetSizer".
   var b=STScreenFit.bounds(d),box=STScreenFit.scroll(d,body,b.width-16,b.height-70);
   var root=new VerticalSizer;root.margin=6;root.spacing=6;root.add(box,100);
   if(footer)root.add(footer);
   d.sizer=root;d.userResizable=true;
   d._stScreenFitted=true;
   d._stScroll=box;
   d._stDesiredWidth=Math.min(b.width,box._stNaturalWidth+STScreenFit.px(d,36));
   d._stDesiredHeight=Math.min(b.height,box._stNaturalHeight+STScreenFit.px(d,footer?100:36));
   d.adjustToContents();STScreenFit.limit(d,true);
   var oldShow=d.onShow,oldMove=d.onMove,moving=false;
   var position=function(){
      if(moving)return;moving=true;
      try{
         var a=STScreenFit.limit(d,false),p=d.position;
         d.move(Math.max(a.x,Math.min(p.x,a.x+a.width-d.width)),Math.max(a.y,Math.min(p.y,a.y+a.height-d.height)));
         box._stUpdate();
      }finally{moving=false;}
   };
   d.onShow=function(){position();var result;if(oldShow)result=oldShow.apply(d,arguments);position();return result;};
   d.onMove=function(){if(oldMove)oldMove.apply(d,arguments);position();};
   STScreenFit.installCenter(d);
   if(typeof console!="undefined" && console.writeln)
      console.writeln("[Smart Tools Screen Fit 1.0.3] "+Math.round(b.width)+"x"+Math.round(b.height)+" available; window "+d.width+"x"+d.height+(b.fallback?" (conservative fallback)":""));
};

STScreenFit.execute = function(d){
   if(d instanceof Dialog){STScreenFit.install(d);STScreenFit.installCenter(d);}
   return d.execute();
};

var SmartTools = typeof SmartTools === "undefined" ? {} : SmartTools;

SmartTools.now=function(){return new Date().getTime();};

SmartTools.copyWindow=function(im,id){
   var w=new ImageWindow(im.width,im.height,im.numberOfChannels,32,true,im.numberOfChannels>=3,id||"SmartTools_Work");
   try{
      w.hide();SmartTools.beginPrivateProcess(w.mainView);
      try{w.mainView.image.assign(im);}finally{w.mainView.endProcess();}
      return w;
   }catch(e){w.forceClose();throw e;}
};

SmartTools.configurePixelMath=function(p,bits){
   p.clearImageCacheAndExit=false;p.cacheGeneratedImages=false;
   p.generateOutput=true;p.singleThreaded=false;p.optimization=true;
   p.use64BitWorkingImage=bits!==32;p.createNewImage=false;
   p.rescale=false;p.truncate=true;p.truncateLower=0;p.truncateUpper=1;
   return p;
};

SmartTools.pixelMath=function(view,expr,symbols){
   var p=SmartTools.configurePixelMath(new PixelMath);
   p.useSingleExpression=true;p.expression=expr;p.symbols=symbols||"";
   if(!p.executeOn(view))throw new Error("PixelMath execution failed");
};

SmartTools.beginPrivateProcess=function(view){
   if(typeof UndoFlag_NoSwapFile!="undefined")view.beginProcess(UndoFlag_NoSwapFile);
   else view.beginProcess();
};

SmartTools.readPlane=function(im,ch){var a=[];
   if(typeof im.getSamples=="function")im.getSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)a.push(im.sample(x,y,ch));
   if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");return a;
};

SmartTools.writePlane=function(im,a,ch){if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");
   if(typeof im.setSamples=="function")im.setSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)im.setSample(a[y*im.width+x],x,y,ch);
};

function STSuiteSource(o){
   if(o.activeView)return o.activeView.image;
   if(o.calibrated)return o.calibrated;
   if(o.source&&typeof o.source.sample==='function'){
      if(o.view&&o.view.image&&o.source.width<o.view.image.width)return o.view.image;
      return o.source;
   }
   return o.view&&!o.view.isNull?o.view.image:null;
}

function STSuiteReleaseWindow(window){
 var current=window;
 return function(){var owned=current;current=null;if(owned&&!owned.isNull)owned.forceClose();};
}

function STSuiteOwned(image){var current=image;return {image:image,release:function(){var owned=current;current=null;if(owned)owned.free();}};}

function STSuitePrepare(o){
   var src=STSuiteSource(o),result;
   if(!src)throw Error('Load an image first.');
   if(typeof o.processFullResolution==='function'){
      if(o.before_CheckBox.checked){if(o.basicStretchEnabled){if(!o.quickAnalysisRecipe)return STSuiteOwned(o.processNativeQuick(src,false));var base=o.quickFaintPass(src);try{if(o.basicStretchLinearEnabled){var linear=o.quickLinearPass(base);base.free();base=linear;}if(o.quickNebulosityEnabled){var nebulosity=o.quickNebulosityPass(base,o.quickNebulosityStrength,false,true);base.free();base=nebulosity;}return STSuiteOwned(base);}catch(e){base.free();throw e;}}return {image:src};}
      result=o.processFullResolution(src,false);
      if(o.autoHighContrastEnabled)result=o.replaceApplyResultWithContrast(result,true).image;
      if(o.autoColorBrightnessEnabled)result=o.replaceApplyResultWithAutoColor(result,true).image;
      return STSuiteOwned(result);
   }
   if(typeof o.transform==='function'){
      if(o.showingMask){
         var mask=o.buildMask(src,true,null),mv=mask.mainView,mi=mv.image;
         return {image:src,release:STSuiteReleaseWindow(mask),mapTile:function(planes,rect,w,h){
            var masks=[];for(var c=0;c<mi.numberOfChannels;c++){var m=new Float32Array(w*h);mi.getSamples(m,rect,c);masks.push(m);}
            for(var c=0;c<planes.length;c++){var weights=masks[Math.min(c,masks.length-1)],p=planes[c];for(var i=0;i<p.length;i++){var a=.55*weights[i];p[i]=p[i]*(1-a)+(c==1?0:a);}}return planes;
         }};
      }
      if(o.displayIsOriginal)return {image:src};
      if(typeof o.mapPlanes==='function'){
         var tileMask=o.buildMask(src,true,null),tileMaskImage=tileMask.mainView.image;
         return {image:src,release:STSuiteReleaseWindow(tileMask),mapTile:function(planes,rect,w,h){
            var weights=[];for(var c=0;c<tileMaskImage.numberOfChannels;c++){var a=new Float32Array(w*h);tileMaskImage.getSamples(a,rect,c);weights.push(a);}
            var wasTiled=o.tiledMapping;o.tiledMapping=true;try{return o.mapPlanes({width:w,height:h},planes,weights);}finally{o.tiledMapping=wasTiled;}
         }};
      }
      var win=o.transform(src,true),view=win.mainView;
      return {image:view.image,release:STSuiteReleaseWindow(win)};
   }
   if(o.calibrated&&typeof o.expression==='function'){
      var star=SmartTools.copyWindow(o.calibrated,'SmartStar_NativeZoom');
      try{SmartTools.pixelMath(star.mainView,o.expression(),SSS_SYMBOLS);return {image:star.mainView.image,release:STSuiteReleaseWindow(star)};}catch(e){star.forceClose();throw e;}
   }
   if(typeof o.compute==='function'&&typeof o.reference==='function'){
      var repair=o.displayImage===o.small&&!o.displayMask?{image:new Image(src)}:o.compute(src,o.displayMask);
      try{result=SBDisplayImage(repair.image,o.stf.checked?o.displaySTF:null);}finally{repair.image.free();}return STSuiteOwned(result);
   }
   if(o.spatialGains&&typeof o.cut==='number'){
      o.compute();var W=o.source.width,H=o.source.height,sw=src.width,sh=src.height;
      var gain=o.spatialGains,weights=o.spatialWeights,cut=o.cut,strength=o.strength.value,protect=o.protect.checked,before=o.before,mask=o.mask,light=o.light.checked,black=o.black,white=o.white;
      var sample=function(a,x,y){var gx=Math.max(0,Math.min(W-1,(x+.5)*W/sw-.5)),gy=Math.max(0,Math.min(H-1,(y+.5)*H/sh-.5)),ix=Math.floor(gx),iy=Math.floor(gy),jx=Math.min(W-1,ix+1),jy=Math.min(H-1,iy+1),tx=gx-ix,ty=gy-iy;return (a[iy*W+ix]*(1-tx)+a[iy*W+jx]*tx)*(1-ty)+(a[jy*W+ix]*(1-tx)+a[jy*W+jx]*tx)*ty;};
      return {image:src,shade:function(rgb,x,y){var Y=rgb.length==1?rgb[0]:.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],g=before?1:HDRProtectGain(sample(gain,x,y),Y,cut,strength,protect),out=[];
         for(var c=0;c<rgb.length;c++){var v=rgb[c]*g;if(mask){var t=Math.max(0,Math.min(1,(Y-cut)/Math.max(1e-12,cut)));v=sample(weights,x,y)*(protect?t*t*(3-2*t):1);}else if(light){v=Math.max(0,(v-black)/(white-black));v=.75*Math.log(10*v+Math.sqrt(100*v*v+1))/Math.log(10+Math.sqrt(101));}out[c]=Math.max(0,Math.min(1,v));}return out;}};
   }
   throw Error('This dialog has no native processing adapter.');
}

function STSuiteTiles(owner,z,scroll,getBitmap){
   var n=this;n.buffer=null;n.bitmap=null;n.cache={};n.keys=[];n.queue=[];n.pending={};n.failed=false;n.preparing=false;n.timer=new Timer;n.timer.interval=.001;n.timer.periodic=false;
   n.label=new Label(owner);n.label.text='Overview';n.label.setFixedWidth(220);n.label.toolTip='At 50% native scale, visible original-resolution tiles replace the overview. Full-result tools prepare a complete result buffer first; this can take time and memory.';
   n.schedule=function(){if(!n.timer.isRunning)n.timer.start();};
   n.clear=function(){n.timer.stop();n.cache={};n.keys=[];n.queue=[];n.pending={};n.failed=false;var oldBuffer=n.buffer;n.buffer=null;if(oldBuffer&&oldBuffer.release)oldBuffer.release();};
   n.timer.onTimeout=function(){
      if(n.preparing||n.failed)return;
      if(getBitmap()!==n.bitmap){n.clear();n.bitmap=getBitmap();scroll.viewport.update();return;}
      if(!n.buffer){
         n.preparing=true;n.label.text='Preparing native result...';var enabled=owner.enabled,expected=n.bitmap;owner.enabled=false;
         try{processEvents();var buffer=STSuitePrepare(owner);if(getBitmap()!==expected){if(buffer.release)buffer.release();return;}n.buffer=buffer;}
         catch(e){n.failed=true;n.label.text='Native preview failed: '+String(e);console.warningln(n.label.text);}
         finally{owner.enabled=enabled;n.preparing=false;scroll.viewport.update();}
         return;
      }
      if(!n.queue.length)return;var deadline=SmartTools.now()+12;do{var t=n.queue.shift();delete n.pending[t.key];var im=null;
      try{
         var src=n.buffer.image,C=src.numberOfChannels,rect=new Rect(t.x,t.y,t.x+t.w,t.y+t.h),planes=[];
         for(var c=0;c<C;c++){planes[c]=new Float32Array(t.w*t.h);src.getSamples(planes[c],rect,c);}
         if(n.buffer.mapTile)planes=n.buffer.mapTile(planes,rect,t.w,t.h);
         if(n.buffer.shade)for(var y=0;y<t.h;y++)for(var x=0;x<t.w;x++){var i=y*t.w+x,rgb=[];for(c=0;c<C;c++)rgb.push(planes[c][i]);var mapped=n.buffer.shade(rgb,t.x+x,t.y+y);for(c=0;c<C;c++)planes[c][i]=mapped[c];}
         im=new Image(t.w,t.h,C,src.colorSpace,32,SampleType_Real);for(c=0;c<C;c++)im.setSamples(planes[c],new Rect(0,0,t.w,t.h),c);
         n.cache[t.key]=im.render();n.keys.push(t.key);
         // 512 RGBA tiles have a maximum bitmap payload of 128 MiB.
         while(n.keys.length>512)delete n.cache[n.keys.shift()];
      }catch(e){n.failed=true;n.label.text='Native tile failed: '+String(e);n.queue=[];console.warningln(n.label.text);}
      finally{if(im)im.free();}
      }while(n.queue.length&&!n.failed&&SmartTools.now()<deadline);
      scroll.viewport.update();
      if(n.queue.length&&!n.failed)n.schedule();
   };
   n.paint=function(g){
      var b=getBitmap(),src=STSuiteSource(owner);if(!b||!src)return;
      if(n.bitmap!==b){if(n.preparing)return;n.clear();n.bitmap=b;}
      var nativeScale=z.scale*b.width/src.width;
      n.queue=[];n.pending={};
      if(nativeScale<.5){n.label.text='Overview '+(nativeScale*100).toFixed(0)+'%';return;}
      if(n.failed)return;if(!n.buffer){if(!n.preparing){n.label.text='Preparing native result...';n.schedule();}return;}
      src=n.buffer.image;var sx=b.width/src.width,sy=b.height/src.height,vp=scroll.viewport;
      var x0=Math.max(0,Math.floor((-z.x/z.scale)/sx/256)),y0=Math.max(0,Math.floor((-z.y/z.scale)/sy/256));
      var x1=Math.min(Math.ceil(src.width/256),Math.ceil(((vp.width-z.x)/z.scale)/sx/256)),y1=Math.min(Math.ceil(src.height/256),Math.ceil(((vp.height-z.y)/z.scale)/sy/256)),ready=0,total=0;
      for(var ty=y0;ty<y1;ty++)for(var tx=x0;tx<x1;tx++){
         var key=tx+'|'+ty,x=tx*256,y=ty*256,w=Math.min(256,src.width-x),h=Math.min(256,src.height-y);total++;
         if(n.cache[key]){ready++;g.drawScaledBitmap(new Rect(x*sx,y*sy,(x+w)*sx,(y+h)*sy),n.cache[key]);}
         else if(!n.pending[key]){n.queue.push({key:key,x:x,y:y,w:w,h:h});n.pending[key]=true;}
      }
      n.label.text=(nativeScale*100).toFixed(0)+'% native | tiles '+ready+'/'+total;if(n.queue.length)n.schedule();
   };
   var hide=owner.onHide;owner.onHide=function(){n.clear();n.bitmap=null;if(hide)return hide.apply(owner,arguments);return undefined;};
   var fit=new ToolButton(owner);fit.text='Fit';fit.onClick=function(){z.factor=1;scroll.horizontalScrollPosition=0;scroll.verticalScrollPosition=0;z.update();};
   var one=new ToolButton(owner);one.text='1:1';one.toolTip='One native image pixel per screen pixel. Native preparation may take time.';one.onClick=function(){var b=getBitmap(),src=STSuiteSource(owner);if(!b||!src)return;z.change((src.width/b.width)/z.scale);};
   z.row.insert(0,fit);z.row.insert(1,one);z.row.insert(2,n.label);z.nativeTiles=n;
}

function STPreviewZoom(owner,scroll,getBitmap){
   var z=this;this.factor=1;this.scale=1;this.x=0;this.y=0;this.updating=false;this.maxX=0;this.maxY=0;
   scroll.autoScroll=false;scroll.horizontalScrollBarVisible=false;scroll.verticalScrollBarVisible=false;
   this.minus=new ToolButton(owner);this.minus.text="−";this.minus.setFixedSize(26,26);this.minus.toolTip="Zoom out (minimum: fit image)";
   this.plus=new ToolButton(owner);this.plus.text="+";this.plus.setFixedSize(26,26);this.plus.toolTip="Zoom in";
   this.row=new HorizontalSizer;this.row.spacing=4;this.row.addStretch();this.row.add(this.plus);this.row.add(this.minus);
   this.nativeTiles=new STSuiteTiles(owner,z,scroll,getBitmap);
   this.update=function(){if(z.updating)return;if(z.nativeTiles&&!z.nativeTiles.preparing){z.nativeTiles.queue=[];z.nativeTiles.pending={};}z.updating=true;try{
      var b=getBitmap(),vp=scroll.viewport,zoomed=z.factor>1;
      scroll.horizontalScrollBarVisible=zoomed;scroll.verticalScrollBarVisible=zoomed;
      if(!b){scroll.setHorizontalScrollRange(0,0);scroll.setVerticalScrollRange(0,0);z.minus.enabled=z.plus.enabled=false;vp.update();return;}
      var w=Math.max(1,vp.width),h=Math.max(1,vp.height);
      z.scale=Math.min(1,w/b.width,h/b.height)*z.factor;
      var cw=b.width*z.scale,ch=b.height*z.scale;
      var mx=Math.max(0,Math.ceil(cw-w)),my=Math.max(0,Math.ceil(ch-h));
      z.maxX=mx;z.maxY=my;scroll.setHorizontalScrollRange(0,mx);scroll.setVerticalScrollRange(0,my);
      scroll.horizontalScrollPosition=Math.max(0,Math.min(mx,scroll.horizontalScrollPosition));
      scroll.verticalScrollPosition=Math.max(0,Math.min(my,scroll.verticalScrollPosition));
      z.x=Math.max(0,(w-cw)/2)-scroll.horizontalScrollPosition;
      z.y=Math.max(0,(h-ch)/2)-scroll.verticalScrollPosition;
      z.minus.enabled=z.factor>1;z.plus.enabled=z.factor<4096;vp.update();
   }finally{z.updating=false;}};
   this.change=function(mult,ax,ay){if(!getBitmap())return;var vp=scroll.viewport;
      if(typeof ax!="number")ax=vp.width/2;if(typeof ay!="number")ay=vp.height/2;
      var cx=(ax-z.x)/z.scale,cy=(ay-z.y)/z.scale;
      z.factor=Math.max(1,Math.min(4096,z.factor*mult));z.update();
      scroll.horizontalScrollPosition=Math.max(0,Math.min(z.maxX,Math.round(cx*z.scale-ax)));
      scroll.verticalScrollPosition=Math.max(0,Math.min(z.maxY,Math.round(cy*z.scale-ay)));z.update();};
   this.minus.onClick=function(){z.change(1/1.5);};this.plus.onClick=function(){z.change(1.5);};
   this.paint=function(g){g.translateTransformation(z.x,z.y);g.scaleTransformation(z.scale,z.scale);};
   this.install=function(){var vp=scroll.viewport;
      var press=vp.onMousePress,move=vp.onMouseMove,release=vp.onMouseRelease;
      function map(handler){return function(x,y,a,b,c){if(handler)handler.call(vp,(x-z.x)/z.scale,(y-z.y)/z.scale,a,b,c);};}
      if(press)vp.onMousePress=map(press);if(move)vp.onMouseMove=map(move);if(release)vp.onMouseRelease=map(release);
      vp.onMouseWheel=function(x,y,delta,buttons,modifiers){if(!delta||!getBitmap()||owner.lassoDrawing)return;z.change(delta>0?1.5:1/1.5,x,y);};
      vp.onResize=function(){z.update();};scroll.onHorizontalScrollPosUpdated=function(){z.update();};scroll.onVerticalScrollPosUpdated=function(){z.update();};z.update();
   };
}
function SCTPreviewWeight(rgb,regions,invert,color){var Y=color?.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]:rgb[0],w=regions.length?0:1;
 function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}
 for(var i=0;i<regions.length;i++){var q=regions[i],a=0;if(q.mode=="color"&&color){var sum=q.r+q.g+q.b,s=rgb[0]+rgb[1]+rgb[2];if(sum>1e-10&&s>1e-10){var r=rgb[0]/s-q.r/sum,g=rgb[1]/s-q.g/sum,b=rgb[2]/s-q.b/sum;a=smooth(Math.max(0,1-Math.sqrt(r*r+g*g+b*b)/Math.max(.001,q.tolerance)));}}
  else if(q.mode=="signal"&&q.hi>q.lo){var f=Math.max(1e-6,.12*(q.hi-q.lo));a=Math.min(q.lo<=0?1:smooth((Y-q.lo)/(Math.min(q.hi,q.lo+f)-q.lo)),q.hi>=1?1:1-smooth((Y-Math.max(q.lo,q.hi-f))/(q.hi-Math.max(q.lo,q.hi-f))));}w=Math.max(w,a);}return invert?1-w:w;
}
function SCTLassoRaster(points,W,H,invert,feather){var N=W*H,mask=new Float32Array(N),dist=new Float32Array(N),i,x,y;
 for(y=0;y<H;y++){var sy=(y+.5)/H,cross=[];for(i=0;i<points.length;i++){var a=points[i],b=points[(i+1)%points.length];if((a[1]>sy)!=(b[1]>sy))cross.push((a[0]+(sy-a[1])*(b[0]-a[0])/(b[1]-a[1]))*W);}cross.sort(function(a,b){return a-b;});for(i=0;i+1<cross.length;i+=2){var lo=Math.max(0,Math.ceil(cross[i]-.5)),hi=Math.min(W,Math.ceil(cross[i+1]-.5));for(x=lo;x<hi;x++)mask[y*W+x]=1;}}
 if(invert)for(i=0;i<N;i++)mask[i]=1-mask[i];var radius=feather*.01*Math.min(W,H);if(radius<=0)return mask;
 for(i=0;i<N;i++)dist[i]=mask[i]?1e6:0;var diag=Math.SQRT2;
 for(y=0;y<H;y++)for(x=0;x<W;x++){i=y*W+x;if(!mask[i])continue;var d=dist[i];if(x)d=Math.min(d,dist[i-1]+1);if(y){d=Math.min(d,dist[i-W]+1);if(x)d=Math.min(d,dist[i-W-1]+diag);if(x+1<W)d=Math.min(d,dist[i-W+1]+diag);}dist[i]=d;}
 for(y=H-1;y>=0;y--)for(x=W-1;x>=0;x--){i=y*W+x;if(!mask[i])continue;var d=dist[i];if(x+1<W)d=Math.min(d,dist[i+1]+1);if(y+1<H){d=Math.min(d,dist[i+W]+1);if(x)d=Math.min(d,dist[i+W-1]+diag);if(x+1<W)d=Math.min(d,dist[i+W+1]+diag);}dist[i]=d;}
 for(i=0;i<N;i++){var t=Math.min(1,dist[i]/radius);mask[i]*=t*t*(3-2*t);}return mask;
}

function SCTLassoEditsRaster(edits,W,H,feather){var result=null;for(var e=0;e<edits.length;e++){var mask=SCTLassoRaster(edits[e].points,W,H,edits[e].subtract,feather);if(result===null)result=mask;else for(var i=0;i<result.length;i++)result[i]*=mask[i];}return result;}

function SBY(v){return .2126*v[0]+.7152*v[1]+.0722*v[2];}
function SBMedian(a){a.sort(function(x,y){return x-y;});return a[Math.floor(a.length/2)];}
function SBReference(view){
 if(!view||view.isNull||!view.image.isColor)throw Error("Choose an RGB background preview or image.");
 var im=view.image,step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/16000))),p=[[],[],[]],samples=[];
 for(var y=0;y<im.height;y+=step)for(var x=0;x<im.width;x+=step){
  var rgb=[];for(var c=0;c<3;c++){var z=im.sample(x,y,c);if(!isFinite(z)||z<0||z>1)throw Error("Background requires finite RGB data in [0,1].");rgb.push(z);p[c].push(z);}
  samples.push({x:(x+.5)/im.width-.5,y:(y+.5)/im.height-.5,v:rgb});
 }
 if(samples.length<16)throw Error("Use a background preview containing at least 16 sampled pixels.");
 var v=p.map(SBMedian),Y=SBY(v);if(Y<=1e-12)throw Error("Background reference is black.");
 // Robust plane: median profiles suppress stars; iterative residual clipping
 // rejects bright and dark outliers even when a gradient spans the preview.
 var planes=[];
 for(var c=0;c<3;c++){
  var left=[],right=[],top=[],bottom=[];
  for(var i=0;i<samples.length;i++){var q=samples[i];if(q.x<-.2)left.push(q.v[c]);if(q.x>.2)right.push(q.v[c]);if(q.y<-.2)top.push(q.v[c]);if(q.y>.2)bottom.push(q.v[c]);}
  var bx=left.length&&right.length?(SBMedian(right)-SBMedian(left))/.7:0,by=top.length&&bottom.length?(SBMedian(bottom)-SBMedian(top))/.7:0,base=v[c];
  for(var pass=0;pass<3;pass++){
   var residual=[];for(i=0;i<samples.length;i++){q=samples[i];residual.push(q.v[c]-(base+bx*q.x+by*q.y));}
   var center=SBMedian(residual.slice()),dev=residual.map(function(t){return Math.abs(t-center);}),sigma=1.4826*SBMedian(dev),limit=Math.max(4*sigma,1e-8);
   var n=0,sx=0,sy=0,sv=0,sxx=0,syy=0,sxy=0,sxv=0,syv=0;
   for(i=0;i<samples.length;i++){if(Math.abs(residual[i]-center)>limit)continue;q=samples[i];n++;sx+=q.x;sy+=q.y;sv+=q.v[c];sxx+=q.x*q.x;syy+=q.y*q.y;sxy+=q.x*q.y;sxv+=q.x*q.v[c];syv+=q.y*q.v[c];}
   if(n<8)break;var xx=sxx-sx*sx/n,yy=syy-sy*sy/n,xy=sxy-sx*sy/n,xv=sxv-sx*sv/n,yv=syv-sy*sv/n,det=xx*yy-xy*xy;
   if(Math.abs(det)<1e-12)break;bx=(xv*yy-yv*xy)/det;by=(yv*xx-xv*xy)/det;base=(sv-bx*sx-by*sy)/n;
  }
  planes.push({base:base,x:bx,y:by});
 }
 return {chroma:v.map(function(z){return z/Y;}),brightness:Y,planes:planes};
}
// Gamut compression towards neutral preserves luminance without channel clipping.
function SBMap(chroma,Y){var t=1;for(var c=0;c<3;c++){
 var d=Y*(chroma[c]-1);if(d>0)t=Math.min(t,(1-Y)/d);else if(d<0)t=Math.min(t,-Y/d);}
 return chroma.map(function(z){return Y+Math.max(0,Math.min(1,t))*Y*(z-1);});}
// A Keep Inside lasso bounds the computation. Donors are still tested against
// every picked color, including pixels outside the lasso, as in the original.
function SBPrepareRepair(im,regions,edits,feather,radius,progress,cache){
 var W=im.width,H=im.height,key=JSON.stringify([regions,edits,feather,radius]);
 if(cache&&cache.image===im&&cache.key===key&&cache.data)return cache.data;
 var x0=0,y0=0,x1=W,y1=H;
 for(var e=0;e<edits.length;e++)if(!edits[e].subtract){
  var pts=edits[e].points,l=W,t=H,r=0,b=0;
  for(var k=0;k<pts.length;k++){l=Math.min(l,pts[k][0]*W);r=Math.max(r,pts[k][0]*W);t=Math.min(t,pts[k][1]*H);b=Math.max(b,pts[k][1]*H);}
  x0=Math.max(x0,Math.max(0,Math.floor(l)-1));y0=Math.max(y0,Math.max(0,Math.floor(t)-1));x1=Math.min(x1,Math.min(W,Math.ceil(r)+1));y1=Math.min(y1,Math.min(H,Math.ceil(b)+1));
 }
 if(x1<=x0||y1<=y0)return {empty:true};
 var reach=Math.max(1,radius*.01*Math.min(W,H)),pad=Math.ceil(reach+feather*.01*Math.min(W,H))+2;
 var dx0=Math.max(0,x0-pad),dy0=Math.max(0,y0-pad),dx1=Math.min(W,x1+pad),dy1=Math.min(H,y1+pad),DW=dx1-dx0,DH=dy1-dy0,N=DW*DH;
 if(progress)progress("Reading selected area and donor margin",.05);
 var rect=new Rect(dx0,dy0,dx1,dy1),p=[];
 for(var c=0;c<3;c++){p[c]=new Float64Array(N);im.getSamples(p[c],rect,c);}
 var transformed=edits.map(function(e){return {subtract:e.subtract,points:e.points.map(function(q){return [(q[0]*W-dx0)/DW,(q[1]*H-dy0)/DH];})};});
 var spatial=edits.length?SCTLassoEditsRaster(transformed,DW,DH,feather*Math.min(W,H)/Math.min(DW,DH)):null;
 var picks=regions.map(function(q){var sum=q.r+q.g+q.b;return {valid:sum>1e-10,r:q.r/sum,g:q.g/sum,b:q.b/sum,t:Math.max(.001,q.tolerance)};}),raw=new Float32Array(N),weights=new Float32Array(N),active=[];
 var xmin=W,xmax=-1,ymin=H,ymax=-1,rx0=W,ry0=H,rx1=-1,ry1=-1;
 for(var y=0;y<DH;y++){
  if(progress&&y%32==0)progress("Building selection",.10+.16*y/DH);
  for(var x=0;x<DW;x++){var i=y*DW+x,R=p[0][i],G=p[1][i],B=p[2][i];
   if(!isFinite(R)||!isFinite(G)||!isFinite(B)||R<0||G<0||B<0||R>1||G>1||B>1)throw Error("Source requires finite RGB samples in [0,1].");
   var sum=R+G+B,w=0;if(sum>1e-10){var nr=R/sum,ng=G/sum,nb=B/sum;
    for(var q=0;q<picks.length;q++){var pick=picks[q];if(!pick.valid)continue;var dr=nr-pick.r,dg=ng-pick.g,db=nb-pick.b,z=Math.max(0,1-Math.sqrt(dr*dr+dg*dg+db*db)/pick.t);z=Math.max(0,Math.min(1,z));w=Math.max(w,z*z*(3-2*z));}
   }
   raw[i]=w;var gx=x+dx0,gy=y+dy0;
   weights[i]=raw[i]*(spatial?spatial[i]:1);
   if(gx<x0||gx>=x1||gy<y0||gy>=y1)weights[i]=0;
   if(weights[i]>1e-6){active.push(i);rx0=Math.min(rx0,gx);ry0=Math.min(ry0,gy);rx1=Math.max(rx1,gx);ry1=Math.max(ry1,gy);}
   if(weights[i]>.01){xmin=Math.min(xmin,gx);ymin=Math.min(ymin,gy);xmax=Math.max(xmax,gx);ymax=Math.max(ymax,gy);}
  }
 }
 var offsets=[];for(var ring=1;ring<=3;ring++)for(var a=0;a<16;a++){var r=reach*ring/3,angle=a*Math.PI/8,dx=Math.round(Math.cos(angle)*r),dy=Math.round(Math.sin(angle)*r);if(dx||dy)offsets.push({x:dx,y:dy,w:1/(dx*dx+dy*dy)});}
 var data={W:W,H:H,DW:DW,DH:DH,x:dx0,y:dy0,p:p,raw:raw,weights:weights,active:active,offsets:offsets,xmin:xmin,ymin:ymin,xmax:xmax,ymax:ymax,rx0:rx0,ry0:ry0,rx1:rx1+1,ry1:ry1+1};
 // Donor cache is bounded to 48 MiB per resolution. NaN denotes uncomputed.
 if(active.length*3*8<=48*1024*1024){data.donors=new Float64Array(active.length*3);for(var i=0;i<data.donors.length;i+=3)data.donors[i]=NaN;}
 if(cache){cache.image=im;cache.key=key;cache.data=data;}return data;
}
function SBRepair(im,regions,edits,feather,radius,strength,reference,maskOnly,contrast,gradient,progress,cache){
 if(!im.isColor||im.numberOfNominalChannels!=3)throw Error("Select an RGB image.");
 if(!regions.length)throw Error("Pick at least one blemish color first.");
 var d=SBPrepareRepair(im,regions,edits,feather,radius,progress,cache),out=null;
 if(d.empty||!d.active.length)return {image:new Image(im),selected:0,changed:0,missing:0};
 var p=d.p,DW=d.DW,N=d.W*d.H,baseline=0;
 if(reference&&!maskOnly){var vals=[],stride=Math.max(1,Math.floor(N/50000));
  for(var pass=0;pass<2&&!vals.length;pass++)for(var gy=d.ry0;gy<d.ry1;gy++){
   var first=gy*d.W+d.rx0,end=gy*d.W+d.rx1;first+=((stride-first%stride)%stride);
   for(var gi=first;gi<end;gi+=stride){var i=(gy-d.y)*DW+(gi%d.W-d.x);if(d.weights[i]>(pass?1e-6:.5))vals.push(.2126*p[0][i]+.7152*p[1][i]+.0722*p[2][i]);}
  }if(vals.length)baseline=SBMedian(vals);
 }
 var RW=d.rx1-d.rx0,RH=d.ry1-d.ry0,patch=[],patchRect=new Rect(d.rx0,d.ry0,d.rx1,d.ry1),changed=0,missing=0;
 if(progress)progress("Preparing affected pixels",.28);
 for(var c=0;c<3;c++){patch[c]=new Float64Array(RW*RH);im.getSamples(patch[c],patchRect,c);}
 for(var n=0;n<d.active.length;n++){
  if(n%2048==0){if(progress)progress("Repairing selected pixels",.30+.55*n/d.active.length);else processEvents();if(console.abortRequested)throw Error("Repair aborted; target unchanged.");}
  var i=d.active[n],lx=i%DW,ly=Math.floor(i/DW),x=lx+d.x,y=ly+d.y,pi=(y-d.ry0)*RW+x-d.rx0,w=d.weights[i];
  if(maskOnly){for(c=0;c<3;c++)patch[c][pi]=p[c][i]*(1-.55*w)+(c==1?0:.55*w);continue;}
  var cr,cg,cb;
  if(reference){cr=reference.chroma[0];cg=reference.chroma[1];cb=reference.chroma[2];}
  else{
   var ci=3*n;
   if(d.donors&&!isNaN(d.donors[ci])){cr=d.donors[ci];cg=d.donors[ci+1];cb=d.donors[ci+2];}
   else{var sr=0,sg=0,sb=0,ws=0;
    for(var k=0;k<d.offsets.length;k++){var off=d.offsets[k],xx=lx+off.x,yy=ly+off.y;if(xx<0||yy<0||xx>=DW||yy>=d.DH)continue;
     var j=yy*DW+xx;if(d.raw[j]>.001)continue;var lum=.2126*p[0][j]+.7152*p[1][j]+.0722*p[2][j];if(lum<=1e-10)continue;
     ws+=off.w;sr+=off.w*p[0][j]/lum;sg+=off.w*p[1][j]/lum;sb+=off.w*p[2][j]/lum;
    }
    cr=ws>0?sr/ws:-1;cg=ws>0?sg/ws:0;cb=ws>0?sb/ws:0;
    if(d.donors){d.donors[ci]=cr;d.donors[ci+1]=cg;d.donors[ci+2]=cb;}
   }
   if(cr<0){missing++;continue;}
  }
  var Y=.2126*p[0][i]+.7152*p[1][i]+.0722*p[2][i],targetY=reference?reference.brightness:Y;
  if(reference&&gradient>0&&d.xmax>=d.xmin){var gx=(x-d.xmin)/Math.max(1,d.xmax-d.xmin)-.5,gy=(y-d.ymin)/Math.max(1,d.ymax-d.ymin)-.5,refRGB=[];
   for(c=0;c<3;c++){var plane=reference.planes[c];refRGB[c]=Math.max(0,plane.base+gradient*(plane.x*gx+plane.y*gy));}
   var refY=SBY(refRGB);if(refY>1e-12){cr=refRGB[0]/refY;cg=refRGB[1]/refY;cb=refRGB[2]/refY;targetY=refY;}
  }
  var v=SBMap([cr,cg,cb],reference?Math.max(0,Math.min(1,targetY+(Y-baseline)*contrast)):Y),amount=w*strength;
  for(c=0;c<3;c++)patch[c][pi]=p[c][i]+amount*(v[c]-p[c][i]);changed++;
 }
 try{if(progress)progress("Copying local working image",.86);out=new Image(im);
  for(c=0;c<3;c++){if(progress)progress("Writing affected area",.88+.02*c);out.setSamples(patch[c],patchRect,c);}
  return {image:out,selected:d.active.length,changed:changed,missing:missing};
 }catch(e){if(out)out.free();throw e;}
}
// Linked automatic display stretch. Parameters are measured once from the
// original reduced image and reused for Original and Repair Preview.
// No display-transformed samples enter selection, donor estimation or Apply.
function SBMTF(m,x){
 if(x<=0)return 0;if(x>=1)return 1;
 return (m-1)*x/((2*m-1)*x-m);
}
// Conservative statistical estimate; image pixels do not record stretch history.
// Ambiguous or already bright images start with display STF disabled.
function SBDetectLinear(im){
 var a=[],step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/20000)));
 for(var y=0;y<im.height;y+=step)for(var x=0;x<im.width;x+=step){
  var v=.2126*im.sample(x,y,0)+.7152*im.sample(x,y,1)+.0722*im.sample(x,y,2);
  if(isFinite(v)&&v>=0&&v<=1)a.push(v);
 }
 if(!a.length)return {linear:false,label:"Unknown data — STF off"};
 a.sort(function(x,y){return x-y;});
 function q(f){return a[Math.min(a.length-1,Math.floor((a.length-1)*f))];}
 var mid=q(.5),hi=q(.9),peak=q(.99);
 var linear=mid>1e-8&&mid<.012&&hi<.06&&peak<.35;
 return {linear:linear,label:linear?"Likely linear — STF on":(mid>=.025||hi>=.15?"Likely stretched — STF off":"Uncertain — STF off")};
}
function SBAutoDisplay(im){
 var med=[],dev=[],step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/20000)));
 for(var c=0;c<3;c++){
  var a=[];for(var y=0;y<im.height;y+=step)for(var x=0;x<im.width;x+=step){var v=im.sample(x,y,c);if(isFinite(v))a.push(v);}
  if(!a.length)return {lo:0,hi:1,m:.5};
  var mid=SBMedian(a);med.push(mid);
  var d=[];for(var i=0;i<a.length;i++)d.push(Math.abs(a[i]-mid));dev.push(1.4826*SBMedian(d));
 }
 var center=(med[0]+med[1]+med[2])/3,sigma=(dev[0]+dev[1]+dev[2])/3;
 var lo=Math.max(0,Math.min(.999999,center-2.8*sigma));
 var x=Math.max(.000001,Math.min(.999999,(center-lo)/(1-lo)));
 return {lo:lo,hi:1,m:SBMTF(.25,x)};
}
function SBDisplayImage(im,stf){
 var out=new Image(im);
 try{if(stf)for(var c=0;c<3;c++){
  var a=SmartTools.readPlane(im,c);
  for(var i=0;i<a.length;i++)a[i]=SBMTF(stf.m,Math.max(0,Math.min(1,(a[i]-stf.lo)/(stf.hi-stf.lo))));
  SmartTools.writePlane(out,a,c);
 }return out;}catch(e){out.free();throw e;}
}
function SBProgress(title,work){
 var d=new Dialog;d.windowTitle=title;d.cancelled=false;d.running=true;d.canCancel=true;d.fraction=0;
 d.message=new Label(d);d.message.text="Preparing...";d.message.setMinWidth(420);
 d.bar=new Control(d);d.bar.setFixedHeight(22);d.bar.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff303030));g.fillRect(0,0,Math.round(this.width*d.fraction),this.height,new Brush(0xff438bc9));}finally{g.end();}};
 d.cancelButton=new PushButton(d);d.cancelButton.text="Cancel";d.cancelButton.onClick=function(){if(d.canCancel)d.cancelled=true;};
 d.onClose=function(){if(d.running){if(d.canCancel)d.cancelled=true;return false;}return true;};
 d.sizer=new VerticalSizer;d.sizer.margin=12;d.sizer.spacing=8;d.sizer.add(d.message);d.sizer.add(d.bar);d.sizer.add(d.cancelButton);d.adjustToContents();
 var failure=null,result,last=0;
 var report=function(stage,value,locked){
  if(d.canCancel&&d.cancelled){var cancelled=Error("Cancelled; image unchanged.");cancelled.sbCancelled=true;throw cancelled;}
  d.canCancel=!locked;d.cancelButton.enabled=d.canCancel;d.fraction=Math.max(0,Math.min(1,value));
  var now=(new Date).getTime();if(now-last>60||locked||value>=.95){last=now;d.message.text=stage+" ("+Math.round(d.fraction*100)+"%)";d.bar.update();processEvents();}
  if(d.canCancel&&(d.cancelled||console.abortRequested)){var e=Error("Cancelled; image unchanged.");e.sbCancelled=true;throw e;}
 };
 var timer=new Timer;timer.interval=.01;timer.periodic=false;
 timer.onTimeout=function(){try{result=work(report);report("Complete",1,true);}catch(e){failure=e;}finally{d.running=false;d.ok();}};
 d.onShow=function(){timer.start();};
 try{STScreenFit.execute(d);}finally{timer.stop();}
 if(failure)throw failure;return result;
}
function SBDialog(){
 this.__base__=Dialog;this.__base__();var self=this;
 this.windowTitle="Smart Blemish Remover 0.6.0";this.userResizable=true;this.busy=false;this.disposed=false;
 this.displaySTF=null;this.displayImage=null;this.displayMask=false;
 this.fullRepairCache={};this.previewRepairCache={};this.baseline=null;this.history=[];this.repairCount=0;this.source=null;this.small=null;this.output=null;this.bitmap=null;this.bitmapX=0;this.bitmapY=0;
 this.regions=[];this.edits=[];this.lassoDrawing=false;this.draft=[];this.views=[];this.refs=[];this.view=null;
 function run(fn){if(self.busy)return;self.busy=true;self.enabled=false;try{fn();}catch(e){if(e.sbCancelled)self.status.text="Cancelled; image unchanged.";else new MessageBox(String(e),self.windowTitle,StdIcon_Error,StdButton_Ok).execute();}finally{self.enabled=true;self.busy=false;}}
 function row(a){var s=new HorizontalSizer;s.spacing=6;for(var i=0;i<a.length;i++)s.add(a[i]);return s;}
 function btn(t,fn,tip,parent){var b=new PushButton(parent||self);b.text=t;b.toolTip=tip||t;b.onClick=function(){run(fn);};return b;}
 function num(t,lo,hi,v,tip,parent){var n=new NumericControl(parent||self);n.label.text=t;n.setRange(lo,hi);n.setPrecision(3);n.slider.setRange(0,1000);n.setValue(v);n.toolTip=tip;n.onValueUpdated=function(){self.stale();};return n;}
 this.status=new Label(this);this.status.wordWrapping=true;this.status.text="Click a blemish color; Ctrl-click toggles colors. Inspect Repair Preview, then Shift+Delete to repair locally. Use the square to apply to the image.";
 this.target=new ComboBox(this);this.target.addItem("Select RGB target");
 this.background=new ComboBox(this);this.background.addItem("Select background preview / image");
 var wins=ImageWindow.windows;for(var w=0;w<wins.length;w++){
 var v=wins[w].mainView;if(v.image.isColor){self.views.push(v);self.target.addItem(v.id);self.refs.push(v);self.background.addItem(v.fullId);}
 var previews=wins[w].previews;for(var k=0;k<previews.length;k++)if(previews[k].image.isColor){self.refs.push(previews[k]);self.background.addItem(previews[k].fullId);}}
 this.target.onItemSelected=function(i){if(i>0)run(function(){if(self.confirmDiscard())self.load(self.views[i-1]);else self.target.currentItem=self.views.indexOf(self.view)+1;});};
 this.background.toolTip="Used in Background Preview mode. Choose a clean RGB preview or image representing the background you want in the repaired area. Its color and brightness provide the replacement baseline. Background contrast retains relative brightness variations; Smooth gradient strength adds the broad gradient measured in that reference. Inspect Repair Preview before applying.";
 this.background.onItemSelected=function(){self.stale();};
 this.mode=new ComboBox(this);this.mode.addItem("Local colors → existing intensity");this.mode.addItem("Background preview color → existing gradients");
 this.mode.toolTip="Local Colors: Use clean nearby pixels to replace the blemish color while retaining each selected pixel's existing brightness. Best for unwanted color patches where the underlying brightness and detail are useful. Local reach controls the donor search distance.\n\nBackground Preview: Use a chosen clean background preview/image as the replacement color AND brightness baseline. Best for blemishes that should blend into the background. Background contrast controls retained brightness variations; Smooth gradient strength brings in the reference's broad gradient. Choose the background in the selector below and inspect Repair Preview.";
 this.mode.onItemSelected=function(i){self.background.enabled=i==1;self.radius.enabled=i==0;self.stale();};this.background.enabled=false;
 this.tolerance=num("Color tolerance",.001,1,.1,"Same normalized RGB color-distance selection as Smart Curves. Changes the active pick.");
 this.tolerance.onValueUpdated=function(v){var q=self.regions[self.regions.length-1];if(q)q.tolerance=v;self.stale();};
 this.radius=num("Local reach (% short side)",.1,40,5,"Search three rings around each selected pixel; all picked colors are excluded from donors. Increase if no clean neighbors are found.");
 this.strength=num("Repair strength",0,1,1,"Blend the repair with the original image.");
 this.contrast=num("Background contrast",0,2,0.25,"Preserve relative brightness variations around the selected background brightness. Zero makes the replacement uniform; larger values retain more contrast.");
 this.gradient=num("Smooth gradient strength",0,1,0,"Use the smooth color and brightness gradient fitted to the background preview. Zero uses a uniform background. The preview gradient maps across the selection bounding box; inspect the result.");
 this.tabs=new TabBox(this);this.pickPage=new Control(this.tabs);this.pickPage.sizer=new VerticalSizer;
 var note=new Label(this.pickPage);note.text="Click selects a color. Ctrl-click toggles matching colors or adds new ones.\nPicks sample the local working image before the next repair.";this.pickPage.sizer.add(note);this.pickPage.sizer.addStretch();this.tabs.addPage(this.pickPage,"Color selection");
 this.lassoPage=new Control(this.tabs);this.keep=new RadioButton(this.lassoPage);this.keep.text="Keep Inside";
 this.subtract=new RadioButton(this.lassoPage);this.subtract.text="Subtract";this.subtract.checked=true;
 this.keep.onCheck=function(v){if(v)self.subtract.checked=false;};this.subtract.onCheck=function(v){if(v)self.keep.checked=false;};
 this.clearLasso=btn("Clear Lasso Edits",function(){self.edits=[];self.stale();},undefined,this.lassoPage);
 this.feather=num("Lasso feather (% short side)",0,10,1,"Soften accumulated Keep Inside / Subtract lasso boundaries.",this.lassoPage);
 this.lassoPage.sizer=new VerticalSizer;this.lassoPage.sizer.spacing=6;this.lassoPage.sizer.margin=6;this.lassoPage.sizer.add(row([this.keep,this.subtract,this.clearLasso]));this.lassoPage.sizer.add(this.feather);this.lassoPage.sizer.addStretch();this.tabs.addPage(this.lassoPage,"Lasso");
 this.scroll=new ScrollBox(this);STScreenFit.preview(this.scroll,640,460);this.preview=this.scroll.viewport;
 this.previewZoom=new STPreviewZoom(this,this.scroll,function(){return self.bitmap;});
 this.preview.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff101010));self.previewZoom.paint(g);if(self.bitmap)g.drawBitmap(0,0,self.bitmap);self.previewZoom.nativeTiles.paint(g);
 if(self.draft.length>1){g.pen=new Pen(0xffffff00,2/self.previewZoom.scale);for(var i=1;i<self.draft.length;i++)g.drawLine(self.draft[i-1][0]*self.bitmap.width,self.draft[i-1][1]*self.bitmap.height,self.draft[i][0]*self.bitmap.width,self.draft[i][1]*self.bitmap.height);}}finally{g.end();}};
 this.point=function(x,y){return [Math.max(0,Math.min(1,x/self.bitmap.width)),Math.max(0,Math.min(1,y/self.bitmap.height))];};
 this.preview.onMousePress=function(x,y,b,buttons,mods){if(self.busy||!self.small||b!=MouseButton_Left||x<0||y<0||x>=self.bitmap.width||y>=self.bitmap.height)return;
 if(self.tabs.currentPageIndex==1){self.lassoDrawing=true;self.draft=[self.point(x,y)];return;}
 var px=Math.min(self.small.width-1,Math.floor(x*self.small.width/self.bitmap.width)),py=Math.min(self.small.height-1,Math.floor(y*self.small.height/self.bitmap.height));
 var q={mode:"color",r:self.small.sample(px,py,0),g:self.small.sample(px,py,1),b:self.small.sample(px,py,2),tolerance:self.tolerance.value},add=!!(mods&0x02),hit=add?STRegionColorHit(self.regions,q):-1;
 if(!add){self.regions=[];self.edits=[];}if(hit>=0)self.regions.splice(hit,1);else self.regions.push(q);self.displayMask=true;run(function(){self.stale();});};
 this.preview.onMouseMove=function(x,y){if(!self.lassoDrawing)return;self.draft.push(self.point(x,y));if(self.draft.length>512)self.draft=self.draft.filter(function(p,i){return i%2==0;});self.preview.update();};
 this.preview.onMouseRelease=function(x,y){if(!self.lassoDrawing)return;self.lassoDrawing=false;self.draft.push(self.point(x,y));if(self.draft.length>=3)self.edits.push({points:self.draft.slice(),subtract:self.subtract.checked});self.draft=[];self.displayMask=self.regions.length>0;run(function(){self.stale();});};
 this.previewZoom.install();
 this.stf=new CheckBox(this);this.stf.text="Auto STF";this.stf.checked=false;
 this.stf.toolTip="On image load, conservative pixel statistics enable STF only for likely linear data; uncertain images start with STF off. Very dark stretched images can still look linear statistically. Use this checkbox to override the estimate. Original and Repair Preview use the same original-image stretch. Repairs and color picks always use unstretched data.";
 this.stf.onCheck=function(){run(function(){if(self.displayImage)self.display(self.displayImage,self.displayMask);});};
 this.display=function(im,mask){
 self.displayImage=im;self.displayMask=!!mask;if(self.mask)self.mask.text=self.displayMask?"Hide Mask":"Show Mask";
 var shown=SBDisplayImage(mask?self.small:im,self.stf.checked?self.displaySTF:null);
 try{
  if(mask){
   var W=shown.width,H=shown.height,planes=[],spatial=self.edits.length?SCTLassoEditsRaster(self.edits,W,H,self.feather.value):null;
   for(var c=0;c<3;c++)planes[c]=SmartTools.readPlane(shown,c);
   for(var y=0;y<H;y++)for(var x=0;x<W;x++){
    var i=y*W+x,rgb=[self.small.sample(x,y,0),self.small.sample(x,y,1),self.small.sample(x,y,2)];
    var a=.55*(self.regions.length?SCTPreviewWeight(rgb,self.regions,false,true):0)*(spatial?spatial[i]:1);
    for(c=0;c<3;c++)planes[c][i]=planes[c][i]*(1-a)+(c==1?0:a);
   }
   for(c=0;c<3;c++)SmartTools.writePlane(shown,planes[c],c);
  }
  self.bitmap=shown.render();
 }finally{shown.free();}
 self.previewZoom.update();self.preview.update();
 };
 this.stale=function(){if(!self.small)return;var keepMask=self.displayMask;if(self.output){self.output.free();self.output=null;}self.display(self.small,keepMask);self.status.text=self.regions.length+" color picks, "+self.edits.length+" lasso edits. "+self.repairCount+" unapplied local repairs.";if(self.pending)self.pending.text=self.repairCount?self.repairCount+" unapplied repairs":"No unapplied repairs";};
 this.clearHistory=function(){for(var i=0;i<self.history.length;i++)self.history[i].image.free();self.history=[];};
 this.confirmDiscard=function(){return !self.repairCount||new MessageBox("Discard "+self.repairCount+" unapplied local repairs?",self.windowTitle,StdIcon_Warning,StdButton_Yes,StdButton_No).execute()==StdButton_Yes;};
 this.makeSmall=function(im){var small=new Image(im);try{var scale=Math.min(1,1000/small.width,750/small.height);if(scale<1)small.resample(scale);return small;}catch(e){small.free();throw e;}};
 this.setWorking=function(im,small){self.fullRepairCache={};self.previewRepairCache={};if(self.small)self.small.free();self.source=im;self.small=small;self.regions=[];self.edits=[];self.draft=[];self.lassoDrawing=false;self.displayMask=false;self.stale();};
 this.load=function(v){self.fullRepairCache={};self.previewRepairCache={};if(!v||v.isNull)throw Error("Target closed.");var fresh=new Image(v.image),small=null;try{if(!fresh.isColor)throw Error("RGB target required.");small=new Image(fresh);var scale=Math.min(1,1000/small.width,750/small.height);if(scale<1)small.resample(scale);}catch(e){fresh.free();if(small)small.free();throw e;}
 var base;try{base=new Image(fresh);}catch(e){fresh.free();small.free();throw e;}self.clearHistory();if(self.baseline)self.baseline.free();self.baseline=base;self.repairCount=0;
 if(self.source)self.source.free();if(self.small)self.small.free();self.displayMask=false;self.source=fresh;self.small=small;self.view=v;self.displaySTF=SBAutoDisplay(self.small);var detection=SBDetectLinear(self.small);self.stf.checked=detection.linear;self.stf.text="Auto STF — "+detection.label.replace(/ — STF (on|off)/,"");self.regions=[];self.edits=[];self.previewZoom.factor=1;self.stale();};
 this.reference=function(){
 if(self.mode.currentItem!=1)return null;
 var index=self.background.currentItem-1;
 if(index<0||index>=self.refs.length)throw Error("Choose a clean background preview or image in the background selector before Repair Preview or Apply.");
 var ref=self.refs[index];
 if(!ref||ref.isNull)throw Error("The selected background preview or image has been closed. Reopen Blemish Remover and select an available background.");
 return SBReference(ref);
 };
 this.compute=function(im,mask,progress){if(mask&&!self.regions.length)return {image:new Image(im),selected:0,changed:0,missing:0};if(progress)progress("Estimating replacement data",.03);return SBRepair(im,self.regions,self.edits,self.feather.value,self.radius.value,self.strength.value,mask?null:self.reference(),mask,self.contrast.value,self.gradient.value,progress,im===self.source?self.fullRepairCache:self.previewRepairCache);};
 this.showResult=function(mask){if(!self.small)throw Error("Choose a target.");
  if(mask){if(!self.regions.length)throw Error("Pick a blemish color first.");self.display(self.small,true);return;}
  SBProgress("Repair Preview",function(progress){var r=self.compute(self.small,false,progress);try{progress("Refreshing preview",.97);self.display(r.image,false);if(self.output)self.output.free();self.output=r.image;r.image=null;self.status.text="Preview only: "+r.selected+" selected; "+r.missing+" without donors. Delete Blemish commits locally.";}finally{if(r.image)r.image.free();}});
 };
 this.repairLocal=function(){if(!self.source)throw Error("Choose a target.");if(self.lassoDrawing)throw Error("Finish the lasso first.");
  SBProgress("Delete Blemish — local repair",function(progress){var r=self.compute(self.source,false,progress),small=null;
   try{if(!r.selected)throw Error("Selection is empty.");if(!r.changed||self.strength.value<=0)throw Error("No repairable pixels. Increase Local reach or choose a background preview.");
    progress("Preparing local preview",.96);small=self.makeSmall(r.image);progress("Committing local repair",.98,true);
    self.history.push({image:self.source,count:self.repairCount});while(self.history.length>3)self.history.shift().image.free();
    self.repairCount++;var image=r.image,newSmall=small;r.image=null;small=null;self.setWorking(image,newSmall);
    self.status.text="Local repair stored. "+self.repairCount+" unapplied repairs. Use the Apply square to update the image. "+r.missing+" pixels without donors were unchanged.";
   }finally{if(r.image)r.image.free();if(small)small.free();}
  });
 };
 this.undoLocal=function(){if(!self.history.length)return;var h=self.history[self.history.length-1],small=self.makeSmall(h.image);self.history.pop();self.source.free();self.repairCount=h.count;self.setWorking(h.image,small);};
 this.resetLocal=function(){if(!self.baseline||!self.confirmDiscard())return;var im=new Image(self.baseline),small;try{small=self.makeSmall(im);}catch(e){im.free();throw e;}self.clearHistory();self.source.free();self.repairCount=0;self.setWorking(im,small);};
 this.apply=function(){if(!self.view||self.view.isNull||!self.source)throw Error("Choose a target.");if(!self.repairCount)throw Error("No local repairs to apply. Use Delete Blemish first.");
  SBProgress("Apply Blemish Repairs",function(progress){var live=self.view.image;
   if(live.width!=self.baseline.width||live.height!=self.baseline.height||live.numberOfChannels!=self.baseline.numberOfChannels)throw Error("Target changed; save local repairs separately or reload before applying.");
   for(var c=0;c<live.numberOfChannels;c++){progress("Checking target image",.05+.65*c/3);var a=SmartTools.readPlane(live,c),b=SmartTools.readPlane(self.baseline,c);for(var i=0;i<a.length;i++){if(i%262144==0)progress("Checking target image",.05+.65*(c+i/a.length)/3);if(a[i]!==b[i])throw Error("Target changed since loading. Local repairs retained; reload only if you want to discard them.");}}
   var base=new Image(self.source);try{progress("Applying to actual image",.8,true);self.view.beginProcess(UndoFlag_PixelData);try{self.view.image.assign(self.source);}finally{self.view.endProcess();}
    self.baseline.free();self.baseline=base;base=null;self.clearHistory();self.repairCount=0;progress("Refreshing preview",.97,true);self.regions=[];self.edits=[];self.displayMask=false;self.stale();self.status.text="Applied to image. PixInsight Undo is available.";
   }finally{if(base)base.free();}
  });
 };
 this.onKeyPress=function(key,mods){if(key==Key_Escape){if(!self.busy&&self.confirmDiscard()){self.discardApproved=true;self.cancel();}return true;}if(key==Key_Delete&&(mods&KeyModifier_Shift)){run(self.repairLocal);return true;}return false;};
 this.preview.onKeyPress=this.onKeyPress;
 this.clear=btn("Clear selections",function(){self.regions=[];self.edits=[];self.stale();},"Clear all selected colors and lasso edits.",this.pickPage);
 this.remove=btn("Remove last color",function(){self.regions.pop();self.stale();},"Remove the most recently selected blemish color.",this.pickPage);
 this.pickPage.sizer.spacing=6;this.pickPage.sizer.margin=6;this.pickPage.sizer.insert(1,row([this.clear,this.remove]));
 this.mask=btn("Show Mask",function(){if(self.displayMask){self.display(self.small,false);self.status.text="Mask hidden.";}else{self.showResult(true);}},"Toggle the magenta overlay showing actual soft repair weights.");
 this.test=btn("Repair Preview",function(){self.showResult(false);},"Compute a reduced repair without changing the target.");
 this.original=btn("Working Image",function(){if(self.small)self.display(self.small);},"Show the current local working copy, including stored local repairs, before the next repair preview.");
 this.reload=btn("Reload",function(){if(self.view&&self.confirmDiscard())self.load(self.view);});
 this.applyButton=btn("Delete Blemish (Shift+Del)",this.repairLocal,"Repair the local working copy at full resolution. The actual image changes only when you click the Apply square.");
 this.undoButton=btn("Undo Last Repair",this.undoLocal,"Undo up to the three most recent local repairs.");
 this.resetButton=btn("Reset Local Repairs",this.resetLocal,"Discard all unapplied repairs and return to the last applied image.");
 this.pending=new Label(this);this.pending.text="No unapplied repairs";
 this.newInstanceButton=new ToolButton(this);this.newInstanceButton.icon=this.scaledResource(":/process-interface/new-instance.png");this.newInstanceButton.setFixedSize(24,24);this.newInstanceButton.toolTip="Drag to save settings and selections. Local repaired pixel data is not stored.";
 this.newInstanceButton.onMousePress=function(x,y,b){if(b!=MouseButton_Left||self.busy)return;this.pushed=false;run(function(){Parameters.set("sbState",JSON.stringify(self.captureInstance()));self.newInstance();});};
 this.applySquare=new ToolButton(this);this.applySquare.icon=this.scaledResource(":/process-interface/apply.png");this.applySquare.setFixedSize(24,24);this.applySquare.toolTip="Apply all local repairs to the actual image in one undoable operation.";this.applySquare.onClick=function(){run(self.apply);};
 this.closeButton=btn("Close",function(){if(self.confirmDiscard()){self.discardApproved=true;self.ok();}});
 this.onClose=function(){return self.discardApproved||(!self.busy&&self.confirmDiscard());};
 // Two-column layout: the preview never scrolls with the settings panel.
 var screen=STScreenFit.bounds(this),panelWidth=Math.max(420,Math.min(620,Math.floor(screen.width*.40)));
 this.scroll.setMinSize(Math.min(420,Math.floor(screen.width*.40)),240);
 this.leftLayout=new VerticalSizer;this.leftLayout.spacing=6;
 this.leftLayout.add(row([this.target,this.reload]));this.leftLayout.add(this.scroll,100);
 this.previewZoom.row.insert(0,this.stf);this.leftLayout.add(this.previewZoom.row);
 this.leftLayout.add(row([this.original,this.mask,this.test]));
 // Explicit tab height reserves space for the tab strip, note, and buttons.
 note.wordWrapping=true;note.setMinHeight(Math.max(42,3*note.font.height));
 this.tabs.setMinHeight(STScreenFit.px(this,156));
 this.rightLayout=new VerticalSizer;this.rightLayout.margin=8;this.rightLayout.spacing=8;
 this.rightLayout.add(this.mode);this.rightLayout.add(this.background);
 this.rightLayout.add(this.tolerance);this.rightLayout.add(this.radius);
 this.rightLayout.add(this.strength);this.rightLayout.add(this.contrast);this.rightLayout.add(this.gradient);
 this.rightLayout.add(this.tabs);this.rightLayout.add(this.applyButton);
 this.rightLayout.add(row([this.undoButton,this.resetButton]));this.rightLayout.add(this.pending);
 this.status.setMinWidth(panelWidth-40);this.status.setMinHeight(3*this.status.font.height);this.rightLayout.add(this.status);this.rightLayout.addStretch();
 this.controlPanel=STScreenFit.scroll(this,this.rightLayout,panelWidth,Math.max(320,Math.min(800,screen.height-90)));
 this.controlPanel.setFixedWidth(panelWidth);
 this.columns=new HorizontalSizer;this.columns.spacing=10;this.columns.add(this.leftLayout,100);this.columns.add(this.controlPanel);
 this.footer=new HorizontalSizer;this.footer.spacing=6;this.footer.add(this.newInstanceButton);this.footer.add(this.applySquare);this.footer.addStretch();this.footer.add(this.closeButton);
 this.sizer=new VerticalSizer;this.sizer.margin=8;this.sizer.spacing=8;this.sizer.add(this.columns,100);this.sizer.add(this.footer);
 this.adjustToContents();this.setMinSize(Math.min(900,screen.width),Math.min(500,screen.height));this.setMaxSize(screen.width,screen.height);
 this.resize(Math.min(screen.width,1600),Math.min(screen.height,900));
 this.captureInstance=function(){return {schema:1,viewId:self.view?self.view.id:"",backgroundId:self.background.currentItem>0?self.refs[self.background.currentItem-1].fullId:"",mode:self.mode.currentItem,tolerance:self.tolerance.value,radius:self.radius.value,strength:self.strength.value,contrast:self.contrast.value,gradient:self.gradient.value,feather:self.feather.value,stf:self.stf.checked,regions:self.regions,edits:self.edits,subtract:self.subtract.checked};};
 this.restoreInstance=function(state){
  if(!state||state.schema!==1)throw Error("Invalid Blemish Remover instance.");
  var fields=[['tolerance',.001,1],['radius',.1,40],['strength',0,1],['contrast',0,2],['gradient',0,1],['feather',0,10]];
  for(var i=0;i<fields.length;i++){var v=state[fields[i][0]];if(typeof v!="number"||!isFinite(v)||v<fields[i][1]||v>fields[i][2])throw Error("Invalid instance parameter: "+fields[i][0]);}
  if(!Array.isArray(state.regions)||!Array.isArray(state.edits))throw Error("Invalid instance selection.");
  for(var i=0;i<state.regions.length;i++){var q=state.regions[i];if(q.mode!="color"||[q.r,q.g,q.b,q.tolerance].some(function(v){return typeof v!="number"||!isFinite(v)||v<0||v>1;})||q.tolerance<.001)throw Error("Invalid saved color.");}
  for(var i=0;i<state.edits.length;i++){var e=state.edits[i];if(!Array.isArray(e.points)||e.points.length<3||e.points.length>1024||e.points.some(function(p){return !Array.isArray(p)||p.length!=2||p.some(function(v){return typeof v!="number"||!isFinite(v)||v<0||v>1;});}))throw Error("Invalid saved lasso.");}
  for(var i=0;i<fields.length;i++)self[fields[i][0]].setValue(state[fields[i][0]]);
  self.mode.currentItem=state.mode==1?1:0;self.background.enabled=self.mode.currentItem==1;self.radius.enabled=self.mode.currentItem==0;
  self.background.currentItem=0;for(var i=0;i<self.refs.length;i++)if(self.refs[i].fullId==state.backgroundId)self.background.currentItem=i+1;
  self.stf.checked=!!state.stf;self.regions=state.regions;self.edits=state.edits;self.subtract.checked=!!state.subtract;self.keep.checked=!self.subtract.checked;self.displayMask=self.regions.length>0;self.stale();
 };
 this.dispose=function(){self.disposed=true;self.fullRepairCache={};self.previewRepairCache={};if(self._sbCenterTimer)self._sbCenterTimer.stop();self.clearHistory();[self.baseline,self.source,self.small,self.output].forEach(function(im){if(im)im.free();});self.source=self.small=self.output=null;self.bitmap=null;self.displayImage=null;};
 // Support older shared files that predate installCenter.
 if(typeof STScreenFit.installCenter=="function")STScreenFit.installCenter(this);
 else{
  this._sbCenterTimer=new Timer;this._sbCenterTimer.interval=.05;this._sbCenterTimer.periodic=false;
  this._sbCenterTimer.onTimeout=function(){self.ensureLayoutUpdated();var b=STScreenFit.bounds(self);self.move(b.x+Math.max(0,Math.floor((b.width-self.width)/2)),b.y+Math.max(0,Math.floor((b.height-self.height)/2)));};
  var priorShow=this.onShow,priorHide=this.onHide;
  this.onShow=function(){var result;if(priorShow)result=priorShow.apply(self,arguments);self._sbCenterTimer.start();return result;};
  this.onHide=function(){self._sbCenterTimer.stop();if(priorHide)return priorHide.apply(self,arguments);return undefined;};
 }
 var active=ImageWindow.activeWindow;if(active&&!active.isNull&&active.mainView.image.isColor){var index=self.views.indexOf(active.mainView);if(index>=0){self.target.currentItem=index+1;self.load(self.views[index]);}}
}
SBDialog.prototype=new Dialog;
function SBMain(){var d=new SBDialog;try{
 var state=Parameters.has("sbState")?JSON.parse(Parameters.getString("sbState")):null;
 var target=Parameters.isViewTarget?Parameters.targetView:null;
 if(!target&&state&&state.viewId)for(var i=0;i<d.views.length;i++)if(d.views[i].id==state.viewId)target=d.views[i];
 if(target&&!target.isNull){d.target.currentItem=d.views.indexOf(target)+1;d.load(target);}
 if(state)d.restoreInstance(state);
 if(Parameters.isViewTarget){if(!state)throw Error("No saved repair settings.");d.repairLocal();d.apply();}else STScreenFit.execute(d);
 }finally{d.dispose();}}
SBMain();
