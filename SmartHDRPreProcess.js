// Standalone PixInsight script. Rename SmartHDRPreProcess.txt to SmartHDRPreProcess.js before running.
/* Suite native zoom 1.0:. Fit / 1:1; original-resolution tiles at 50%+. */
#include <pjsr/SampleType.jsh>
/* Screen-fit layout update 1.0.1. */
/* 0.1.3: Measured startup HDR recommendation and matched-display Original/Recommended chooser. */
/* 0.1.3: Bottom-left New Instance triangle and Apply square; text Apply/Close removed. */
/* Smart HDR PreProcess 0.1.3 — experimental starless highlight compression.
 * Rename SmartHDRPreProcess.txt to SmartHDRPreProcess.js.
 * Linear input assumed. Correction is spatially adaptive (mathematically nonlinear),
 * with no global display stretch baked into the output. RGB ratios are preserved.
 * 0.1.3: Optional native-pixel luminance limit protects faint surroundings.
 * Star detection is heuristic; compact nebular knots can trigger a warning.
 */
#feature-id Utilities > Smart HDR PreProcess
#feature-info Starless linear-image highlight compression with feathered lasso protection.
// Run full-resolution work once the modal progress dialog has painted.
function SATRunProgress(title, work, requestCancel){
   var dialog = new Dialog;
   dialog.windowTitle = title;
   var message = new Label(dialog);
   message.setMinWidth(380);
   var bar = new Control(dialog);
   bar.setFixedHeight(22);
   var percent = 0, finished = false, failed = false, failure;
   bar.onPaint = function(){
      var graphics = new Graphics(this);
      try{
         graphics.fillRect(0, 0, this.width, this.height, new Brush(0xff252525));
         graphics.fillRect(0, 0, Math.round(this.width*percent/100), this.height, new Brush(0xff398bd4));
      }finally{graphics.end();}
   };
   dialog.sizer = new VerticalSizer;
   dialog.sizer.margin = 12;
   dialog.sizer.spacing = 8;
   dialog.sizer.add(message);
   dialog.sizer.add(bar);
   message.text = "Preparing full-resolution image… (0%)";
   var cancel = null;
   if(requestCancel){
      cancel = new PushButton(dialog);
      cancel.text = "Cancel";
      cancel.onClick = function(){
         cancel.enabled = false;
         message.text = "Cancelling…";
         requestCancel();
      };
      dialog.sizer.add(cancel);
   }
   function report(value, stage, lockCancel){
      if(cancel && lockCancel) cancel.enabled = false;
      percent = Math.max(percent, Math.min(100, value));
      message.text = stage + " (" + Math.round(percent) + "%)";
      bar.update();
      processEvents();
   }
   function rejectClose(){
      if(!finished && cancel && cancel.enabled) cancel.onClick();
   }
   dialog.onClose = function(){rejectClose();return finished;};
   var timer = new Timer;
   timer.interval = 0.05;
   timer.periodic = false;
   timer.onTimeout = function(){
      timer.stop();
      try{
         work(report);
         report(100, "Complete", true);
      }catch(error){failed = true;failure = error;}
      finally{finished = true;dialog.ok();}
   };
   dialog.onShow = function(){timer.start();};
   dialog.adjustToContents();
   try{STScreenFit.execute(dialog);}finally{timer.stop();}
   if(failed) throw failure;
}

#include <pjsr/Sizer.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/ButtonCodes.jsh>
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

STScreenFit.tileSize = function(c,w,h,columns,rows,overhead){
   var b=STScreenFit.bounds(c);
   return {width:Math.max(60,Math.min(w,Math.floor((b.width-STScreenFit.px(c,60))/columns))),
      height:Math.max(45,Math.min(h,Math.floor((b.height-STScreenFit.px(c,overhead||360))/rows)))};
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

STScreenFit.panel = function(owner,layout){
   var b=STScreenFit.bounds(owner),w=STScreenFit.sideWidth(owner),h=Math.max(80,b.height-STScreenFit.px(owner,140));
   var box=STScreenFit.scroll(owner,layout,w,h);
   box.setMinSize(w,h);return box;
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

STScreenFit.adjust = function(d){
   if(d instanceof Dialog && d._stBody){
      STScreenFit.install(d);
      d.ensureLayoutUpdated();STScreenFit.limit(d,false);
      return d;
   }
   return d.adjustToContents();
};

STScreenFit.execute = function(d){
   if(d instanceof Dialog){STScreenFit.install(d);STScreenFit.installCenter(d);}
   return d.execute();
};

var SmartTools = typeof SmartTools === "undefined" ? {} : SmartTools;

SmartTools.previewWidth=1280;

SmartTools.previewHeight=760;

SmartTools.setPreviewSize=function(control){
   STScreenFit.preview(control,SmartTools.previewWidth,SmartTools.previewHeight);
};

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

SmartTools.configureNumericInput=function(control,onTextCommit){
   // Preserve the caller's track width and NumericControl layout.
   control.edit.onEditCompleted=function(){
      // Enter/edit-completed must not process while the edit retains focus.
   };
   control.edit.onLoseFocus=function(){
      if(this.readOnly)return;
      var previous=control.value;
      control.evaluate();
      if(control.value!=previous && onTextCommit)onTextCommit(control.value);
   };
   // Font-relative dimensions keep the rectangular handle usable with display
   // scaling. Scope to this native slider; preserve all slider event handlers.
   control.slider.styleSheet=
      "QSlider::groove:horizontal { image: none; border-image: none;"+
      " height: 0.4em; border: 1px solid palette(mid); background: palette(base); }"+
      "QSlider::handle:horizontal { image: none; border-image: none;"+
      " width: 0.55em; margin: -0.45em 0; border: 1px solid palette(dark);"+
      " border-radius: 2px; background: palette(button); }"+
      "QSlider::handle:horizontal:hover, QSlider::handle:horizontal:pressed {"+
      " image: none; border-image: none; background: palette(highlight); }"+
      "QSlider::handle:horizontal:disabled { image: none; border-image: none;"+
      " background: palette(mid); border-color: palette(mid); }";
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

var HDR_VERSION="0.1.3";
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

function HDRLassoRaster(points,W,H,invert,feather){var N=W*H,mask=new Float32Array(N),dist=new Float32Array(N),i,x,y;
 for(y=0;y<H;y++){var sy=(y+.5)/H,cross=[];for(i=0;i<points.length;i++){var a=points[i],b=points[(i+1)%points.length];if((a[1]>sy)!=(b[1]>sy))cross.push((a[0]+(sy-a[1])*(b[0]-a[0])/(b[1]-a[1]))*W);}cross.sort(function(a,b){return a-b;});for(i=0;i+1<cross.length;i+=2){var lo=Math.max(0,Math.ceil(cross[i]-.5)),hi=Math.min(W,Math.ceil(cross[i+1]-.5));for(x=lo;x<hi;x++)mask[y*W+x]=1;}}
 if(invert)for(i=0;i<N;i++)mask[i]=1-mask[i];var radius=feather*.01*Math.min(W,H);if(radius<=0)return mask;
 for(i=0;i<N;i++)dist[i]=mask[i]?1e6:0;var diag=Math.SQRT2;
 for(y=0;y<H;y++)for(x=0;x<W;x++){i=y*W+x;if(!mask[i])continue;var d=dist[i];if(x)d=Math.min(d,dist[i-1]+1);if(y){d=Math.min(d,dist[i-W]+1);if(x)d=Math.min(d,dist[i-W-1]+diag);if(x+1<W)d=Math.min(d,dist[i-W+1]+diag);}dist[i]=d;}
 for(y=H-1;y>=0;y--)for(x=W-1;x>=0;x--){i=y*W+x;if(!mask[i])continue;var d=dist[i];if(x+1<W)d=Math.min(d,dist[i+1]+1);if(y+1<H){d=Math.min(d,dist[i+W]+1);if(x)d=Math.min(d,dist[i+W-1]+diag);if(x+1<W)d=Math.min(d,dist[i+W+1]+diag);}dist[i]=d;}
 for(i=0;i<N;i++){var t=Math.min(1,dist[i]/radius);mask[i]*=t*t*(3-2*t);}return mask;
}

function HDRLassoEditsRaster(edits,W,H,feather){var result=null;for(var e=0;e<edits.length;e++){var mask=HDRLassoRaster(edits[e].points,W,H,edits[e].subtract,feather);if(result===null)result=mask;else for(var i=0;i<result.length;i++)result[i]*=mask[i];}return result;}
function HDRClamp(x,a,b){return Math.max(a,Math.min(b,x));}
function HDRQuantile(a,q){var s=Array.prototype.slice.call(a);s.sort(function(x,y){return x-y;});return s[Math.floor((s.length-1)*q)];}
function HDRLuminance(im){var n=im.width*im.height,a=new Float32Array(n),p=[],c,i;for(c=0;c<im.numberOfChannels;c++)p.push(SmartTools.readPlane(im,c));for(i=0;i<n;i++){a[i]=im.isColor?.2126*p[0][i]+.7152*p[1][i]+.0722*p[2][i]:p[0][i];if(!isFinite(a[i]))throw new Error("Nonfinite image samples");}return a;}
// Three separable box passes approximate a broad Gaussian; edge samples extend outward.
function HDRBlur(a,w,h,r){r=Math.max(1,Math.round(r));var b=new Float32Array(a.length),o=new Float32Array(a.length),x,y,k,sum,n=2*r+1;
 for(y=0;y<h;y++){sum=0;for(k=-r;k<=r;k++)sum+=a[y*w+HDRClamp(k,0,w-1)];for(x=0;x<w;x++){b[y*w+x]=sum/n;sum+=a[y*w+HDRClamp(x+r+1,0,w-1)]-a[y*w+HDRClamp(x-r,0,w-1)];}}
 for(x=0;x<w;x++){sum=0;for(k=-r;k<=r;k++)sum+=b[HDRClamp(k,0,h-1)*w+x];for(y=0;y<h;y++){o[y*w+x]=sum/n;sum+=b[HDRClamp(y+r+1,0,h-1)*w+x]-b[HDRClamp(y-r,0,h-1)*w+x];}}return o;}
function HDRBase(a,w,h,r){for(var k=0;k<3;k++)a=HDRBlur(a,w,h,r);return a;}
function HDRGain(b,t,s){if(b<=t||b<=0||s<=0)return 1;var e=b-t;return HDRClamp((t+e/(1+s*e/Math.max(t,1e-12)))/b,0,1);}
// A blurred core must not dim a neighboring pixel more than that pixel's
// own luminance warrants. Below threshold, the native pixel remains unchanged.
function HDRProtectGain(g,y,t,s,protect){return protect?Math.max(g,HDRGain(y,t,s)):g;}
function HDRPixelLuminance(id,color){return color?"(.2126*"+id+"[0]+.7152*"+id+"[1]+.0722*"+id+"[2])":id;}
function HDRNativeGainExpression(map,y,t,s,protect){
 var spatial="min(1,max(0,"+map+"))";if(!protect)return spatial;
 var T=Number(t).toPrecision(17),S=Number(s).toPrecision(17);
 return "max("+spatial+",iif("+y+"<="+T+",1,("+T+"+max(0,"+y+"-"+T+")/(1+"+S+"*max(0,"+y+"-"+T+")/"+T+"))/max(1e-12,"+y+")))";
}
// Conservative, image-measured startup search. No target name or trained model is used.
function HDRRecommend(lum,w,h,progress){
 var bg=HDRQuantile(lum,.2),mid=HDRQuantile(lum,.75),high=HDRQuantile(lum,.998),floor=Math.max(1e-12,Math.abs(mid)*1e-6);
 var signal=Math.max(floor,mid-bg),dynamic=(high-bg)/signal;
 var fallback={strength:0,threshold:95,scale:1.5,protect:true,dynamic:dynamic,reason:"No strong highlight imbalance detected",candidates:0};
 if(!isFinite(dynamic)||dynamic<4||high-bg<floor*10)return fallback;
 var desired=1-HDRClamp(.18+.10*Math.log(dynamic/4)/Math.LN2,.18,.5),brightCut=HDRQuantile(lum,.995),scales=[.5,1.5,3,6],thresholds=[85,92,97],strengths=[.15,.3,.5,.75],best=null,done=0,total=48;
 for(var si=0;si<scales.length;si++){
  var base=HDRBase(lum,w,h,scales[si]*.01*Math.min(w,h));
  // Sort once for each scale, rather than for every candidate.
  var sorted=Array.prototype.slice.call(base);sorted.sort(function(a,b){return a-b;});
  for(var ti=0;ti<thresholds.length;ti++){
   var t=Math.max(1e-12,sorted[Math.floor((sorted.length-1)*thresholds[ti]/100)]);
   for(var ai=0;ai<strengths.length;ai++){
    var strength=strengths[ai],gain=new Float32Array(lum.length),bright=0,brightN=0,midLoss=0,midN=0,oldEdges=0,reversed=0,roughness=0,edgeN=0;
    for(var i=0;i<lum.length;i++){
     var g=HDRProtectGain(HDRGain(base[i],t,strength),lum[i],t,strength,true);gain[i]=g;
     if(lum[i]>=brightCut){bright+=g;brightN++;}
     if(lum[i]>=mid&&lum[i]<brightCut){midLoss+=1-g;midN++;}
    }
    // Compare contrast ordering on horizontal AND vertical boundaries.
    // A bright core should not force a neighboring lane into a new dark rim.
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
     var i=y*w+x;
     for(var dir=0;dir<2;dir++){
      if((dir==0&&x+1>=w)||(dir==1&&y+1>=h))continue;
      var j=i+(dir==0?1:w),a=lum[i],b=lum[j],diff=a-b,after=a*gain[i]-b*gain[j];
      if(Math.max(a,b)<mid)continue;
      var significant=Math.abs(diff)>Math.max(floor,.02*Math.max(Math.abs(a-bg),Math.abs(b-bg)));
      if(significant){oldEdges++;if(diff*after<0)reversed++;}
      roughness+=Math.abs(gain[i]-gain[j]);edgeN++;
     }
    }
    var brightGain=bright/Math.max(1,brightN),loss=midLoss/Math.max(1,midN),inversion=reversed/Math.max(1,oldEdges),rough=roughness/Math.max(1,edgeN);
    var score=Math.abs(brightGain-desired)+.65*loss+4*inversion+2*rough+.006*(strength/.75);
    var candidate={strength:strength,threshold:thresholds[ti],scale:scales[si],protect:true,dynamic:dynamic,score:score,brightGain:brightGain,midLoss:loss,reversalFraction:inversion,reason:"Measured highlight compression with surrounding-contrast penalties",candidates:total};
    if(!best||score<best.score)best=candidate;
    done++;if(progress)progress(done/total);
   }
  }
 }
 // Original is a real candidate: avoid making a recommendation merely because
 // every tested correction was worse than leaving the data alone.
 if(!best||best.score>=1-desired||best.brightGain>.98){fallback.reason="A useful low-artifact correction was not found";fallback.candidates=total;return fallback;}
 return best;
}

function HDRReduced(im,width){var p=new Image(im),scale=Math.min(1,width/im.width,700/im.height);if(scale<1)p.resample(scale);return p;}
function HDRStarCount(im){var p=HDRReduced(im,1600);try{var a=HDRLuminance(p),w=p.width,h=p.height,cut=HDRQuantile(a,.95),count=0;
 for(var y=4;y<h-4;y++)for(var x=4;x<w-4;x++){var i=y*w+x,v=a[i];if(v<=cut||v<=0)continue;
 if(v<=a[i-1]||v<=a[i+1]||v<=a[i-w]||v<=a[i+w])continue;
 var ring=[a[i-3],a[i+3],a[i-3*w],a[i+3*w],a[i-2*w-2],a[i+2*w+2],a[i-2*w+2],a[i+2*w-2]];ring.sort(function(a,b){return a-b;});
 var back=(ring[3]+ring[4])/2;if(v>Math.max(back*1.7,back+(cut-back)*.4)&&ring[6]<v*.8)count++;}
 return {count:count,limit:Math.max(8,Math.round(w*h/20000))};}finally{p.free();}}
function HDRCheck(view){var im=view.image;if((im.isColor&&im.numberOfChannels!=3)||(!im.isColor&&im.numberOfChannels!=1))throw new Error("Use an RGB or grayscale image without alpha channels.");var stars=HDRStarCount(im);console.writeln("[Smart HDR PreProcess] Possible compact sources: "+stars.count);
 if(stars.count>=stars.limit)return new MessageBox("Possible stars detected. This tool is designed for starless linear images. Stars may be dimmed by the correction. Compact nebular knots can also trigger this warning.\n\nContinue anyway?","Smart HDR PreProcess",StdIcon_Warning,StdButton_Yes,StdButton_Cancel).execute()==StdButton_Yes;return true;}
function HDRWindow(im,id){var w=new ImageWindow(im.width,im.height,im.numberOfChannels,32,true,im.isColor,id);try{w.hide();SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(im);}finally{w.mainView.endProcess();}return w;}catch(e){w.forceClose();throw e;}}
function HDRDialog(view){this.__base__=Dialog;this.__base__();var self=this;this.windowTitle="Smart HDR PreProcess "+HDR_VERSION;this.userResizable=true;this.view=view;this.source=null;this.loadedWidth=0;this.loadedHeight=0;this.bitmap=null;this.lassoDrawing=false;this.edits=[];this.draft=[];this.busy=false;this.mask=false;this.before=false;this.base=null;this.gains=null;this.closed=false;
 function error(e){console.criticalln(String(e));new MessageBox(String(e),"Smart HDR PreProcess",StdIcon_Error,StdButton_Ok).execute();}
 function run(f){if(self.busy||self.closed)return;self.busy=true;try{f();}catch(e){error(e);}finally{self.busy=false;}}
 function label(t){var l=new Label(self);l.text=t;return l;}
 function button(t,f,tip){var b=new PushButton(self);b.text=t;b.toolTip=tip||t;b.onClick=function(){run(f);};return b;}
 function row(a){var s=new HorizontalSizer;s.spacing=6;for(var i=0;i<a.length;i++)s.add(a[i]);return s;}
 this.timer=new Timer;this.timer.interval=.15;this.timer.periodic=false;this.timer.onTimeout=function(){if(self.busy){self.timer.start();return;}run(function(){self.render();});};
 function schedule(){if(self.closed)return;self.timer.stop();self.timer.start();}
 function number(t,lo,hi,v,tip,fn){var n=new NumericControl(self);n.label.text=t;n.setRange(lo,hi);n.setPrecision(3);n.slider.setRange(0,1000);n.setValue(v);n.toolTip=tip;SmartTools.configureNumericInput(n);n.onValueUpdated=function(){if(fn)fn();schedule();};return n;}
 this.scroll=new ScrollBox(this);SmartTools.setPreviewSize(this.scroll);this.preview=this.scroll.viewport;this.zoom=new STPreviewZoom(this,this.scroll,function(){return self.bitmap;});
 this.preview.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff101010));self.zoom.paint(g);if(self.bitmap)g.drawBitmap(0,0,self.bitmap);self.zoom.nativeTiles.paint(g);if(self.lassoDrawing&&self.bitmap){g.pen=new Pen(0xffffff00,2/Math.max(1e-8,self.zoom.scale));for(var i=1;i<self.draft.length;i++)g.drawLine(self.draft[i-1][0]*self.bitmap.width,self.draft[i-1][1]*self.bitmap.height,self.draft[i][0]*self.bitmap.width,self.draft[i][1]*self.bitmap.height);}}finally{g.end();}};
 this.point=function(x,y){return [HDRClamp(x/self.bitmap.width,0,1),HDRClamp(y/self.bitmap.height,0,1)];};
 this.preview.onMousePress=function(x,y,b){if(self.busy||!self.draw.checked||b!=MouseButton_Left||!self.bitmap||x<0||y<0||x>self.bitmap.width||y>self.bitmap.height)return;self.lassoDrawing=true;self.draft=[self.point(x,y)];self.preview.update();};
 this.preview.onMouseMove=function(x,y){if(!self.lassoDrawing)return;var p=self.point(x,y),last=self.draft[self.draft.length-1];if(Math.abs(p[0]-last[0])+Math.abs(p[1]-last[1])<.003)return;self.draft.push(p);if(self.draft.length>512){var a=[];for(var i=0;i<self.draft.length;i+=2)a.push(self.draft[i]);self.draft=a;}self.preview.update();};
 this.preview.onMouseRelease=function(x,y){if(!self.lassoDrawing)return;self.lassoDrawing=false;self.draft.push(self.point(x,y));if(self.draft.length>=3)self.edits.push({points:self.draft.slice(),subtract:self.subtract.checked});self.draft=[];self.preview.update();schedule();};
 this.strength=number("Strength",0,1,.5,"Zero leaves the image unchanged. Increase to reduce the broad bright structures.");
 this.threshold=number("Highlight threshold (%)",50,99.9,85,"Percentile of smoothed luminance where compression begins. Lower values affect more nebulosity.");
 this.scale=number("Structure scale (%)",.3,15,3,"Smoothing radius as a percentage of the shorter image dimension. Larger values target broader bright regions.",function(){self.base=null;});
 this.feather=number("Lasso feather (%)",0,10,2,"Feather lasso boundaries as a percentage of the shorter image dimension.");
 this.protect=new CheckBox(this);this.protect.text="Protect faint surroundings";this.protect.checked=true;this.protect.toolTip="Limit compression using each pixel's own brightness, protecting faint dust lanes beside bright cores. Disable to reproduce the original HDR behavior.";this.protect.onCheck=schedule;
 this.light=new CheckBox(this);this.light.text="Light preview stretch";this.light.checked=true;this.light.toolTip="Fixed display stretch shared by original and corrected previews. Never written to the image.";this.light.onCheck=schedule;
 this.compare=button("Show Original",function(){self.before=!self.before;self.compare.text=self.before?"Show Corrected":"Show Original";self.mask=false;self.render();},"Compare using the same display stretch.");
 this.maskButton=button("Show Mask",function(){self.mask=!self.mask;self.render();},"White marks highlight compression eligibility; black marks protected regions.");
 this.draw=new CheckBox(this);this.draw.text="Draw lasso";this.draw.toolTip="Drag in the preview to accumulate spatial restrictions.";
 this.keep=new RadioButton(this);this.keep.text="Keep Inside";this.subtract=new RadioButton(this);this.subtract.text="Subtract";this.subtract.checked=true;
 this.keep.toolTip="Keep correction inside each new polygon.";this.subtract.toolTip="Protect the inside of each new polygon.";
 this.clear=button("Clear Lasso Edits",function(){self.edits=[];self.draft=[];self.lassoDrawing=false;self.render();});
 this.reload=button("Reload Image",function(){if(HDRCheck(self.view))self.load();},"Reload the selected image and clear lasso edits.");
 this.createMask=button("Create Mask",function(){self.compute();var w=self.mapWindow(true);w.show();},"Export full-resolution grayscale correction eligibility mask.");
 this.newInstanceButton=new ToolButton(this);this.newInstanceButton.icon=this.scaledResource(":/process-interface/new-instance.png");this.newInstanceButton.setFixedSize(24,24);this.newInstanceButton.toolTip="New Instance — drag onto the workspace to save HDR settings and lasso restrictions.";
 this.newInstanceButton.onMousePress=function(x,y,button){if(button!=MouseButton_Left||self.busy||self.closed)return;this.hasFocus=true;this.pushed=false;run(function(){Parameters.set("hdrState",JSON.stringify(self.captureInstance()));self.newInstance();});};
 this.apply=new ToolButton(this);this.apply.icon=this.scaledResource(":/process-interface/apply.png");this.apply.setFixedSize(24,24);this.apply.toolTip="Apply HDR compression to the source image at full resolution. PixInsight Undo is available.";this.apply.onClick=function(){run(function(){self.applyFull();});};
 this.status=label("Starless linear input assumed. Output contains compression only; the preview stretch is display-only.");this.status.wordWrapping=true;
 var controls=new VerticalSizer;controls.spacing=10;controls.add(label("Starless highlight compression"));controls.add(this.strength);controls.add(this.threshold);controls.add(this.scale);controls.add(this.protect);controls.add(this.light);controls.add(row([this.compare,this.maskButton]));controls.add(label("Lasso restrictions"));controls.add(this.draw);controls.add(row([this.keep,this.subtract]));controls.add(this.feather);controls.add(this.clear);controls.addStretch();controls.add(this.createMask);controls.add(this.reload);
 var left=new VerticalSizer;left.spacing=4;left.add(this.scroll,100);left.add(this.zoom.row);var content=new HorizontalSizer;content.spacing=12;content.add(left,100);content.add(STScreenFit.panel(this,controls));this._stBody=new VerticalSizer;this._stBody.margin=10;this._stBody.spacing=8;this._stBody.add(content,100);this._stBody.add(this.status);var footer=new HorizontalSizer;footer.spacing=6;footer.add(this.newInstanceButton);footer.add(this.apply);footer.addStretch();this._stBody.add(footer);this._stFooter=footer;
 this.load=function(){self.timer.stop();if(self.source)self.source.free();self.loadedWidth=self.view.image.width;self.loadedHeight=self.view.image.height;self.source=HDRReduced(self.view.image,800);self.planes=[];for(var c=0;c<self.source.numberOfChannels;c++)self.planes.push(SmartTools.readPlane(self.source,c));self.lum=HDRLuminance(self.source);self.base=null;self.edits=[];self.draft=[];self.lassoDrawing=false;self.black=HDRQuantile(self.lum,.01);self.white=Math.max(self.black+1e-8,HDRQuantile(self.lum,.995));self.before=false;self.mask=false;self.compare.text="Show Original";self.render();};
 this.compute=function(){var w=self.source.width,h=self.source.height,n=w*h;if(!self.base)self.base=HDRBase(self.lum,w,h,self.scale.value*.01*Math.min(w,h));var t=Math.max(1e-12,HDRQuantile(self.base,self.threshold.value/100)),spatial=self.edits.length?HDRLassoEditsRaster(self.edits,w,h,self.feather.value):null;self.gains=new Float32Array(n);self.spatialGains=new Float32Array(n);self.weights=new Float32Array(n);self.spatialWeights=new Float32Array(n);
 for(var i=0;i<n;i++){var b=self.base[i],a=spatial?spatial[i]:1;self.spatialGains[i]=1-a*(1-HDRGain(b,t,self.strength.value));self.gains[i]=HDRProtectGain(self.spatialGains[i],self.lum[i],t,self.strength.value,self.protect.checked);var u=HDRClamp((b-t)/t,0,1),v=HDRClamp((self.lum[i]-t)/t,0,1);self.spatialWeights[i]=a*u*u*(3-2*u);self.weights[i]=self.spatialWeights[i]*(self.protect.checked?v*v*(3-2*v):1);}self.cut=t;};
 this.render=function(){if(!self.source)return;self.compute();var im=new Image(self.source);try{for(var c=0;c<self.planes.length;c++){var out=new Float32Array(self.lum.length);for(var i=0;i<out.length;i++){var v=self.planes[c][i]*(self.before?1:self.gains[i]);if(self.mask)v=self.weights[i];else if(self.light.checked){v=Math.max(0,(v-self.black)/(self.white-self.black));v=.75*Math.log(10*v+Math.sqrt(100*v*v+1))/Math.log(10+Math.sqrt(101));}out[i]=HDRClamp(v,0,1);}SmartTools.writePlane(im,out,c);}self.bitmap=im.render();self.zoom.update();self.preview.update();}finally{im.free();}self.maskButton.text=self.mask?"Hide Mask":"Show Mask";self.status.text=self.view.id+" | Linear threshold "+self.cut.toPrecision(4)+" | "+(self.mask?"Correction eligibility":self.before?"Original":"Corrected")+" | Preview stretch is display-only.";};
 this.mapWindow=function(mask){var im=new Image(self.source.width,self.source.height,1,ColorSpace_Gray),w=null;try{SmartTools.writePlane(im,mask?self.spatialWeights:self.spatialGains,0);w=HDRWindow(im,mask?"SmartHDRPreProcess_Mask":"SmartHDRPreProcess_Gain");var p=new Resample;p.mode=p.AbsolutePixels;p.absoluteMode=p.ForceWidthAndHeight;p.xSize=self.view.image.width;p.ySize=self.view.image.height;
 // Bilinear interpolation avoids negative gain overshoot at mask boundaries.
 p.interpolation=p.Bilinear;if(!p.executeOn(w.mainView,false))throw new Error("Gain map resampling failed");
 if(mask&&self.protect.checked){var pm=SmartTools.configurePixelMath(new PixelMath,64),t=Number(self.cut).toPrecision(17);pm.symbols="hdrU";pm.useSingleExpression=true;pm.expression="hdrU=min(1,max(0,("+HDRPixelLuminance(self.view.fullId,self.view.image.isColor)+"-"+t+")/"+t+"));$T*hdrU*hdrU*(3-2*hdrU)";if(!pm.executeOn(w.mainView,false))throw new Error("Mask protection failed");}return w;}catch(e){if(w)w.forceClose();throw e;}finally{im.free();}};
 this.applyFull=function(){if(!self.view||self.view.isNull)throw new Error("Target is unavailable");if(self.view.image.width!=self.loadedWidth||self.view.image.height!=self.loadedHeight)throw new Error("Image dimensions changed. Reload Image before applying.");if(self.view.window.maskEnabled&&!self.view.window.mask.isNull)throw new Error("Disable the attached PixInsight mask before applying. Use this tool's lasso restrictions to match the preview.");self.timer.stop();self.enabled=false;var gain=null;try{SATRunProgress('Smart HDR PreProcess — Applying',function(report){report(10,"Computing the gain map");self.compute();gain=self.mapWindow(false);var p=SmartTools.configurePixelMath(new PixelMath,64);p.truncate=false;p.useSingleExpression=true;p.expression="$T*"+HDRNativeGainExpression(gain.mainView.id,HDRPixelLuminance("$T",self.view.image.isColor),self.cut,self.strength.value,self.protect.checked);
 // PixelMath owns the target transaction and native Undo. Avoid nested beginProcess.
 report(55,"Compressing highlights");if(!p.executeOn(self.view))throw new Error("Highlight compression failed");console.writeln("[Smart HDR PreProcess] Applied strength="+self.strength.value+"; threshold="+self.cut+"; scale="+self.scale.value+"%; protect faint surroundings="+self.protect.checked);report(95,"Reloading preview");self.load();});}finally{if(gain)gain.forceClose();self.enabled=true;}};
 this.startBitmap=function(corrected){var im=new Image(self.source);try{
  for(var c=0;c<self.planes.length;c++){var out=new Float32Array(self.lum.length);for(var i=0;i<out.length;i++){var v=self.planes[c][i]*(corrected?self.gains[i]:1);v=Math.max(0,(v-self.black)/(self.white-self.black));out[i]=HDRClamp(.75*Math.log(10*v+Math.sqrt(100*v*v+1))/Math.log(10+Math.sqrt(101)),0,1);}SmartTools.writePlane(im,out,c);}
  var fit=Math.min(1,480/im.width,340/im.height);if(fit<1)im.resample(fit);return im.render();
 }finally{im.free();}};
 this.chooseStart=function(){
  self.timer.stop();var reduced=null,recommendation;
  self.status.text="Analyzing bright structures and testing HDR settings...";processEvents();
  try{reduced=HDRReduced(self.source,280);recommendation=HDRRecommend(HDRLuminance(reduced),reduced.width,reduced.height,function(f){self.status.text="Testing HDR candidates: "+Math.round(f*100)+"%";processEvents();});}finally{if(reduced)reduced.free();}
  console.writeln("[Smart HDR PreProcess Recommendation] "+JSON.stringify(recommendation));
  // Preview the proposed settings at the normal working resolution before choice.
  self.strength.setValue(recommendation.strength);self.threshold.setValue(recommendation.threshold);self.scale.setValue(recommendation.scale);self.protect.checked=true;self.base=null;self.timer.stop();self.compute();
  var original=self.startBitmap(false),corrected=self.startBitmap(true),d=new Dialog,choice=-1;
  d.windowTitle="Smart HDR — Original or Recommended";
  function pane(bitmap,title,text,index){var v=new VerticalSizer;v.spacing=6;var l=new Label(d);l.text=title;v.add(l);var canvas=new Control(d);var tileSize=STScreenFit.tileSize(d,480,340,2,1,300);canvas.setFixedSize(tileSize.width,tileSize.height);canvas.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff101010));var f=Math.min(this.width/bitmap.width,this.height/bitmap.height);g.scaleTransformation(f);g.drawBitmap(Math.round((this.width/f-bitmap.width)/2),Math.round((this.height/f-bitmap.height)/2),bitmap);}finally{g.end();}};v.add(canvas);var note=new Label(d);note.text=text;note.wordWrapping=true;note.setFixedWidth(tileSize.width);v.add(note);var b=new PushButton(d);b.text=index==0?"Use Original":"Use Recommended";b.onClick=function(){choice=index;d.ok();};v.add(b);return v;}
  var settings="Strength "+recommendation.strength.toFixed(2)+" | Threshold "+recommendation.threshold+"% | Scale "+recommendation.scale+"%";
  var comparison=new HorizontalSizer;comparison.spacing=12;comparison.add(pane(original,"Original","No HDR correction. Continue with Strength set to zero.",0));comparison.add(pane(corrected,"Recommended",settings,1));
  var explanation=new Label(d);explanation.text=recommendation.strength==0?recommendation.reason+". Both previews are identical.":"Both previews use the same display stretch. Recommendation is heuristic; inspect bright cores and their surroundings.";explanation.wordWrapping=true;explanation.setFixedWidth(2*STScreenFit.tileSize(d,480,340,2,1,300).width+12);
  var cancel=new PushButton(d);cancel.text="Cancel";cancel.onClick=function(){d.cancel();};var footer=new HorizontalSizer;footer.addStretch();footer.add(cancel);
  d._stBody=new VerticalSizer;d._stBody.margin=10;d._stBody.spacing=8;d._stBody.add(comparison);d._stBody.add(explanation);d._stBody.add(footer);d._stFooter=footer;STScreenFit.adjust(d);STScreenFit.execute(d);original=null;corrected=null;
  if(choice<0)return false;if(choice==0)self.strength.setValue(0);self.before=false;self.mask=false;self.compare.text="Show Original";self.timer.stop();self.render();self.status.text=(choice==0?"Original selected; Strength is zero. ":"Recommended starting settings selected. ")+"Refine controls before applying.";return true;
 };

 this.captureInstance=function(){return {schema:1,viewId:self.view.fullId,strength:self.strength.value,threshold:self.threshold.value,scale:self.scale.value,protect:self.protect.checked,feather:self.feather.value,light:self.light.checked,edits:JSON.parse(JSON.stringify(self.edits))};};
 this.restoreInstance=function(state){
  if(!state||state.schema!==1)throw new Error("Invalid HDR instance.");
  function valid(v,lo,hi){return typeof v=="number"&&isFinite(v)&&v>=lo&&v<=hi;}
  if(!valid(state.strength,0,1)||!valid(state.threshold,50,99.9)||!valid(state.scale,.3,15)||!valid(state.feather,0,10))throw new Error("HDR instance settings out of range.");
  var edits=state.edits||[];if(!Array.isArray(edits))throw new Error("Invalid HDR lasso edits.");
  for(var i=0;i<edits.length;i++){if(!Array.isArray(edits[i].points)||edits[i].points.length<3)throw new Error("Invalid HDR polygon.");for(var j=0;j<edits[i].points.length;j++){var p=edits[i].points[j];if(!Array.isArray(p)||p.length!=2||!valid(p[0],0,1)||!valid(p[1],0,1))throw new Error("Invalid HDR polygon point.");}}
  self.strength.setValue(state.strength);self.threshold.setValue(state.threshold);self.scale.setValue(state.scale);self.feather.setValue(state.feather);self.protect.checked=!!state.protect;self.light.checked=!!state.light;self.edits=JSON.parse(JSON.stringify(edits));self.base=null;self.timer.stop();self.render();
 };
 this.onClose=function(){return !self.busy;};
 this.dispose=function(){self.closed=true;self.timer.stop();if(self.source)self.source.free();self.source=null;self.bitmap=null;self.planes=null;self.base=null;self.gains=null;self.spatialGains=null;self.weights=null;self.spatialWeights=null;};
 this.zoom.install();this.load();STScreenFit.adjust(this);
}
HDRDialog.prototype=new Dialog;
function HDRMain(){console.show();var d=null;try{var state=Parameters.has("hdrState")?JSON.parse(Parameters.getString("hdrState")):null,target=Parameters.isViewTarget?Parameters.targetView:null;
 if(!target&&state&&state.viewId)target=View.viewById(state.viewId);if(!target||target.isNull){var w=ImageWindow.activeWindow;if(w.isNull)throw new Error("Open and select a starless linear image first.");target=w.mainView;}
 if(!HDRCheck(target))return;d=new HDRDialog(target);if(state)d.restoreInstance(state);else if(!Parameters.isViewTarget){var auto=new MessageBox("Determine recommended HDR settings for this image?\n\nYes: analyze and compare Original with Recommended.\nNo: open manual controls with Strength set to zero.","Smart HDR PreProcess",StdIcon_Question,StdButton_Yes,StdButton_No).execute();if(auto==StdButton_Yes){if(!d.chooseStart())return;}else{d.strength.setValue(0);d.timer.stop();d.render();}}if(Parameters.isViewTarget)d.applyFull();else STScreenFit.execute(d);
 }catch(e){console.criticalln(String(e));new MessageBox(String(e),"Smart HDR PreProcess",StdIcon_Error,StdButton_Ok).execute();}finally{if(d)d.dispose();}}
HDRMain();
