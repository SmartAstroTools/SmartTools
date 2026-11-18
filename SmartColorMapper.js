// Standalone PixInsight script. Rename SmartColorMapper.txt to SmartColorMapper.js before running.
// Shared region click rule: normal click replaces; Ctrl-click toggles.
function STRegionColorHit(regions,q){
 var sum=q.r+q.g+q.b;
 for(var i=0;i<regions.length;i++){var s=regions[i];if((s.mode||s.type)!="color"||s.spatial)continue;
  var ss=s.r+s.g+s.b;if(ss<=1e-10||sum<=1e-10){if(ss<=1e-10&&sum<=1e-10)return i;continue;}
  var dr=s.r/ss-q.r/sum,dg=s.g/ss-q.g/sum,db=s.b/ss-q.b/sum;
  if(Math.sqrt(dr*dr+dg*dg+db*db)<=.35*Math.min(s.tolerance,q.tolerance))return i;
 }return -1;
}
/* 0.1.22: Continuous Natural/Narrowband pickers and image-derived rainbow. */
/* 0.1.21: Natural/Narrowband/Vivid/Custom palettes; independent saturation/value; persistent favorites. */
/* Suite native zoom 1.0:. Fit / 1:1; original-resolution tiles at 50%+. */
/* 0.1.20: Pin transaction View objects; close private strip writes before UI events. */
/* Screen-fit layout update 1.0.1. */
#include <pjsr/SampleType.jsh>
// Connected faint-color selection. Shared implementation embedded in suite scripts.
function SCCSmooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
function SCCGrow(planes,W,H,regions,reach){
 var N=W*H,out=new Float32Array(N);reach=Math.max(0,Math.min(1,reach));if(reach<=0||planes.length<3)return out;
 var sums=new Float32Array(N),lum=new Float32Array(N),samples=[];
 for(var i=0;i<N;i++){sums[i]=Math.max(0,planes[0][i])+Math.max(0,planes[1][i])+Math.max(0,planes[2][i]);lum[i]=.2126*planes[0][i]+.7152*planes[1][i]+.0722*planes[2][i];if(i%13==0&&isFinite(lum[i]))samples.push(lum[i]);}
 samples.sort(function(a,b){return a-b;});var floor=Math.max(1e-10,samples.length?samples[Math.floor(samples.length*.15)]:0),maxSteps=Math.max(1,Math.round(Math.min(W,H)*.15*reach));
 for(var qn=0;qn<regions.length;qn++){
  var q=regions[qn];if(q.mode!="color"&&q.type!="color")continue;
  var sum=q.r+q.g+q.b;if(sum<=1e-10)continue;
  var cr=q.r/sum,cg=q.g/sum,cb=q.b/sum,seedLum=.2126*q.r+.7152*q.g+.0722*q.b,chroma=Math.sqrt(Math.pow(cr-1/3,2)+Math.pow(cg-1/3,2)+Math.pow(cb-1/3,2));
  if(chroma<.025)continue; // Gray selections cannot define a reliable color direction.
  var tol=Math.max(.001,q.tolerance),loose=tol*(1+2*reach),candidate=new Float32Array(N),dist=new Int32Array(N),queue=new Int32Array(N),head=0,tail=0;
  for(var i=0;i<N;i++){
   dist[i]=-1;if(sums[i]<=1e-10||!isFinite(sums[i]))continue;
   var r=planes[0][i]/sums[i],g=planes[1][i]/sums[i],b=planes[2][i]/sums[i],d=Math.sqrt(Math.pow(r-cr,2)+Math.pow(g-cg,2)+Math.pow(b-cb,2));
   var strict=SCCSmooth((tol-d)/tol);
   if(strict>=.25){candidate[i]=1;if(!q.seedMask||q.seedMask[i]>0){dist[i]=0;queue[tail++]=i;}continue;}
   var c=Math.sqrt(Math.pow(r-1/3,2)+Math.pow(g-1/3,2)+Math.pow(b-1/3,2));
   var direction=(r-1/3)*(cr-1/3)+(g-1/3)*(cg-1/3)+(b-1/3)*(cb-1/3);
   if(lum[i]<=floor||lum[i]>seedLum||c<Math.max(.015,.15*chroma)||direction<=0||d>=loose)continue;
   candidate[i]=SCCSmooth((loose-d)/loose)*Math.min(1,(lum[i]-floor)/Math.max(1e-10,floor));
  }
  while(head<tail){var p=queue[head++],steps=dist[p];if(steps>=maxSteps)continue;var x=p%W,y=Math.floor(p/W);
   for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){if((dx==0&&dy==0)||x+dx<0||x+dx>=W||y+dy<0||y+dy>=H)continue;var n=p+dy*W+dx;if(dist[n]>=0||candidate[n]<=.01)continue;dist[n]=steps+1;queue[tail++]=n;}
  }
  for(var i=0;i<N;i++)if(dist[i]>0){var fade=SCCSmooth(1-dist[i]/(maxSteps+1));out[i]=Math.max(out[i],candidate[i]*fade);}
 }
 return out;
}
function SCCBuild(source,regions,reach){
 var im=new Image(source);try{var scale=Math.min(1,800/im.width,800/im.height);if(scale<1)im.resample(scale);var planes=[];for(var c=0;c<3&&c<im.numberOfNominalChannels;c++){var p=new Float32Array(im.width*im.height);im.getSamples(p,new Rect(0,0,im.width,im.height),c);planes.push(p);}return {width:im.width,height:im.height,weights:SCCGrow(planes,im.width,im.height,regions,reach)};}finally{im.free();}
}
function SCCSample(grid,x,y,W,H){if(!grid)return 0;var gx=Math.max(0,Math.min(grid.width-1,Math.floor((x+.5)*grid.width/W))),gy=Math.max(0,Math.min(grid.height-1,Math.floor((y+.5)*grid.height/H)));return grid.weights[gy*grid.width+gx];}
function SCCApply(view,grid,invert){
 if(!grid)return;var W=view.image.width,H=view.image.height,win=new ImageWindow(W,H,1,32,true,false,"ConnectedFaintColor");win.hide();
 try{var gridView=win.mainView;SmartTools.beginPrivateProcess(gridView);try{for(var y=0;y<H;y++){var row=new Float32Array(W);for(var x=0;x<W;x++)row[x]=SCCSample(grid,x,y,W,H);gridView.image.setSamples(row,new Rect(0,y,W,y+1),0);}}finally{gridView.endProcess();}
  var pm=new PixelMath;pm.expression=(invert?"1-":"")+"max($T,"+win.mainView.id+")";pm.useSingleExpression=true;pm.generateOutput=true;pm.createNewImage=false;pm.rescale=false;pm.truncate=false;if(!pm.executeOn(view,false))throw Error("Connected faint-color mask failed");
 }finally{win.forceClose();}
}

/* 0.1.15: Every source-color pick selects its nearest visible rainbow swatch and synchronizes shade. */
/* 0.1.15: Remove Apply progress dialog; retain tiled processing, responsiveness and console timings. */
/* 0.1.15: Typed-buffer tiled Apply with bounded array fallback and stage progress dialog. */
/* 0.1.15: Open a View editing transaction before writing mapped result planes. */
/* 0.1.15: Allocation-free mapping loop, skip protected pixels, detailed full Apply stage timings. */
/* 0.1.15: Replacement Shade traverses the complete hue column: black, pure color, white. */
/* 0.1.15: Electric Blue quick-select beside Replacement swatch (#00A8FF). */
/* 0.1.15: Double-height rainbow: white tints above pure hue, black shades below. */
/* 0.1.15: Remove grayscale bar, standalone saturation slider and brightness-only mode. Retain rainbow mapping and color-edge feather. */
/* 0.1.15: Color Edge Feather controls the smooth color-distance transition inside tolerance. */
/* 2026-10-17: Color Tolerance starts and resets at 0.100; saved values remain respected. */
/* 0.1.15: Keep rainbow grid fully visible regardless of replacement shade or sampled pixel brightness. */
/* Smart Color Mapper 0.1.15 — first experimental build.
 * Rename to SmartColorMapper.js.5.0 or later).
 * Pick original color, choose hue/saturation on grid, adjust shade and strength.
 * Color selection uses normalized RGB distance, with smooth tolerance falloff.
 * Preview mask and full mask use the existing selection/lasso engine.
 * Preserve brightness uses Rec.709 luminance and gamut compression toward gray.
 * Full-resolution mapping uses the same JavaScript arithmetic as preview.
 * UI and native mask processing require PixInsight testing.
 */
// Display-only zoom: processing buffers retain their established dimensions.
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

#feature-id Utilities > Smart Color Mapper
#feature-info Selective color replacement with rainbow grid, tolerance mask and feathered lassos.
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
#include <pjsr/DataType.jsh>
#include <pjsr/SectionBar.jsh>
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

SmartTools.elapsed=function(t){return ((SmartTools.now()-t)/1000).toFixed(2)+" s";};

SmartTools.clamp=function(x,a,b){return Math.max(a,Math.min(b,x));};

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

SmartTools.histogram = function( image, numberOfBins, channelMode )
{
   var bins = new Array( numberOfBins );

   for ( var i = 0; i < numberOfBins; ++i )
      bins[i] = 0;

   var w = image.width;
   var h = image.height;

   // Sampling keeps the Stage 1 UI responsive on large ASI2600 frames.
   var targetSamples = 250000;
   var step = Math.max( 1, Math.ceil( Math.sqrt( w*h/targetSamples ) ) );

   for ( var y = 0; y < h; y += step )
      for ( var x = 0; x < w; x += step )
      {
         var value;

         if(image.numberOfChannels<3)value=image.sample(x,y,0);
         else if(channelMode=="R")value=image.sample(x,y,0);
         else if(channelMode=="G")value=image.sample(x,y,1);
         else if(channelMode=="B")value=image.sample(x,y,2);
         else
         {
            var r=image.sample(x,y,0),g=image.sample(x,y,1),b=image.sample(x,y,2);
            value=0.2126*r+0.7152*g+0.0722*b;
         }

         value = Math.max( 0, Math.min( 1, value ) );

         var bin = Math.floor( value*numberOfBins );
         if ( bin >= numberOfBins )
            bin = numberOfBins - 1;

         ++bins[bin];
      }

   return bins;
};

SmartTools.resetViewSTF=function(view){
   var process=new ScreenTransferFunction;
   if(!process.executeOn(view))
      throw new Error("ScreenTransferFunction reset failed");
};

SmartTools.closeWindowPool=function(pool){
   if(!pool)return;
   for(var key in pool)if(pool.hasOwnProperty(key)){
      try{pool[key].window.forceClose();}catch(e){}
      delete pool[key];
   }
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

var SCM_VERSION="0.1.22";
function SCMCopyWindow(im,id){
   var w=new ImageWindow(im.width,im.height,im.numberOfChannels,
      im.isReal&&im.bitsPerSample==64?64:32,true,im.isColor,id);
   try{w.hide();var copyView=w.mainView;SmartTools.beginPrivateProcess(copyView);
      try{copyView.image.assign(im);}finally{copyView.endProcess();}return w;
   }catch(e){w.forceClose();throw e;}
}
// Exact geometry for arbitrary aspect ratios; never interpret pixel counts as scale factors.
function SCMResizeWindow(w,width,height){
   if(w.mainView.image.width==width&&w.mainView.image.height==height)return;
   var p=new Resample;
   if(typeof p.AbsolutePixels!="number"||typeof p.ForceWidthAndHeight!="number")throw new Error("Resample process does not expose absolute pixel sizing modes");
   p.mode=p.AbsolutePixels;p.absoluteMode=p.ForceWidthAndHeight;
   p.xSize=width;p.ySize=height;
   if(!p.executeOn(w.mainView,false))throw new Error("Mask resampling failed");
   if(w.mainView.image.width!=width||w.mainView.image.height!=height)throw new Error("Mask resampling geometry mismatch");
}
function SCMPixelMath(view,spec){
   var p=SmartTools.configurePixelMath(new PixelMath,64);
   p.symbols=spec.symbols||"";
   p.useSingleExpression=!spec.expressions;
   if(spec.expressions){p.expression=spec.expressions[0];p.expression1=spec.expressions[1];p.expression2=spec.expressions[2];}
   else p.expression=spec.expression;
   if(!p.executeOn(view,false))throw new Error("PixelMath failed");
}
function SCMCurves(curves,type){
   if(typeof type!="number"||type!=Math.floor(type)||type<0||type>2)
      throw new Error("Invalid curve interpolation type");
   var p=new CurvesTransformation,n=["R","G","B","K","S"];
   for(var i=0;i<n.length;i++){p[n[i]]=curves[i];p[n[i]+"t"]=type;}
   return p;
}
// Interactive interpolation is a display approximation; Apply retains native curves.
function SCMPreviewTable(points,type){var N=4096,n=points.length,h=[],d=[],m=[],z=[],u=[],i;
 for(i=0;i<n-1;i++){h[i]=points[i+1][0]-points[i][0];d[i]=(points[i+1][1]-points[i][1])/h[i];}
 if(type==0){z[0]=u[0]=0;for(i=1;i<n-1;i++){var a=h[i-1]/(h[i-1]+h[i]),b=a*z[i-1]+2;z[i]=(a-1)/b;u[i]=(6*(d[i]-d[i-1])/(h[i-1]+h[i])-a*u[i-1])/b;}z[n-1]=0;for(i=n-2;i>=0;i--)z[i]=z[i]*z[i+1]+u[i];}
 else if(type==2){var e=[];for(i=0;i<n-1;i++)e[i+2]=d[i];e[1]=2*e[2]-e[3];e[0]=2*e[1]-e[2];if(n==2){e[0]=e[1]=e[2]=e[3]=e[4]=d[0];}else{e[n+1]=2*e[n]-e[n-1];e[n+2]=2*e[n+1]-e[n];}for(i=0;i<n;i++){var w1=Math.abs(e[i+3]-e[i+2]),w2=Math.abs(e[i+1]-e[i]);m[i]=w1+w2>1e-20?(w1*e[i+1]+w2*e[i+2])/(w1+w2):.5*(e[i+1]+e[i+2]);}}
 var table=[],j=0;for(i=0;i<=N;i++){var x=i/N;while(j<n-2&&x>points[j+1][0])j++;var t=(x-points[j][0])/h[j],v;
  if(type==0){var A=1-t;v=A*points[j][1]+t*points[j+1][1]+((A*A*A-A)*z[j]+(t*t*t-t)*z[j+1])*h[j]*h[j]/6;}
  else if(type==2){var t2=t*t,t3=t2*t;v=(2*t3-3*t2+1)*points[j][1]+(t3-2*t2+t)*h[j]*m[j]+(-2*t3+3*t2)*points[j+1][1]+(t3-t2)*h[j]*m[j+1];}
  else v=points[j][1]+t*(points[j+1][1]-points[j][1]);table.push(Math.max(0,Math.min(1,v)));}return table;
}
function SCMPreviewLookup(table,v){var p=Math.max(0,Math.min(1,v))*(table.length-1),i=Math.floor(p);return i>=table.length-1?table[table.length-1]:table[i]+(p-i)*(table[i+1]-table[i]);}
function SCMFaintWeight(peak,strength,anchors){anchors=anchors||{low:0,high:1};var t=Math.max(0,Math.min(1,(peak-anchors.low)/Math.max(1e-8,anchors.high-anchors.low)));return 1-strength*t*t*(3-2*t);}
function SCMFaintExpression(id,color,strength,anchors){anchors=anchors||{low:0,high:1};var peak=color?"max("+id+"[0],max("+id+"[1],"+id+"[2]))":id;return {symbols:"fwT",expression:"fwT=min(1,max(0,("+peak+"-"+Number(anchors.low).toPrecision(17)+")/"+Number(Math.max(1e-8,anchors.high-anchors.low)).toPrecision(17)+"));$T*(1-"+Number(strength).toPrecision(17)+"*fwT*fwT*(3-2*fwT))"};}
function SCMFaintAnchors(values){if(!values.length)return {low:0,high:1};values.sort(function(a,b){return a-b;});var lo=values[Math.floor((values.length-1)*.10)],hi=values[Math.floor((values.length-1)*.85)];if(hi-lo<1e-8)lo=Math.max(0,hi-1e-6);return {low:lo,high:Math.max(lo+1e-8,hi)};}
function SCMMeasureFaintAnchors(source){var values=[],step=Math.max(1,Math.ceil(Math.sqrt(source.width*source.height/8192)));for(var y=0;y<source.height;y+=step)for(var x=0;x<source.width;x+=step){var peak=0;for(var c=0;c<source.numberOfChannels;c++)peak=Math.max(peak,source.sample(x,y,c));values.push(peak);}return SCMFaintAnchors(values);}

function SCMPreviewWeight(rgb,regions,invert,color){var Y=color?.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]:rgb[0],w=0;
 function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}
 for(var i=0;i<regions.length;i++){var q=regions[i],a=0;if(q.mode=="color"&&color){var sum=q.r+q.g+q.b,s=rgb[0]+rgb[1]+rgb[2];if(sum>1e-10&&s>1e-10){var r=rgb[0]/s-q.r/sum,g=rgb[1]/s-q.g/sum,b=rgb[2]/s-q.b/sum;var distance=Math.sqrt(r*r+g*g+b*b),tol=Math.max(.001,q.tolerance),feather=typeof q.edgeFeather=="number"?Math.max(0,Math.min(1,q.edgeFeather)):1;a=feather<=0?(distance<tol?1:0):smooth((tol-distance)/(tol*feather));}}
  else if(q.mode=="signal"&&q.hi>q.lo){var f=Math.max(1e-6,.12*(q.hi-q.lo));a=Math.min(q.lo<=0?1:smooth((Y-q.lo)/(Math.min(q.hi,q.lo+f)-q.lo)),q.hi>=1?1:1-smooth((Y-Math.max(q.lo,q.hi-f))/(q.hi-Math.max(q.lo,q.hi-f))));}w=Math.max(w,a);}return invert?1-w:w;
}
function SCMSelectionPixelMath(source,isColor,regions,invert){
   var Y=isColor?"(.2126*"+source+"[0]+.7152*"+source+"[1]+.0722*"+source+"[2])":source;
   var expr="scY="+Y+";scW=0;",symbols="scY,scW,scA,scB,scT,scU,scD,scSum";
   function n(v){if(!isFinite(v))throw new Error("Nonfinite selection parameter");return v.toPrecision(17);}
   function step(x){return "("+x+"*"+x+"*(3-2*"+x+"))";}
   for(var i=0;i<regions.length;i++){
      var q=regions[i];
      if(q.mode=="color"&&isColor){
         var sum=q.r+q.g+q.b,tol=Math.max(.001,q.tolerance),feather=typeof q.edgeFeather=="number"?Math.max(0,Math.min(1,q.edgeFeather)):1;
         if(sum<=1e-10)continue;
         expr+="scSum="+source+"[0]+"+source+"[1]+"+source+"[2];"+
            "scD=sqrt(("+source+"[0]/max(1e-10,scSum)-"+n(q.r/sum)+")^2+"+
            "("+source+"[1]/max(1e-10,scSum)-"+n(q.g/sum)+")^2+"+
            "("+source+"[2]/max(1e-10,scSum)-"+n(q.b/sum)+")^2);"+
            "scT="+(feather<=0?"iif(scD<"+n(tol)+",1,0)":"min(1,max(0,("+n(tol)+"-scD)/"+n(tol*feather)+"))")+";scW=max(scW,iif(scSum>1e-10,"+step("scT")+",0));";
      }else if(q.mode=="signal"&&q.hi>q.lo){
         var f=Math.max(1e-6,.12*(q.hi-q.lo));
         var le=Math.min(q.hi,q.lo+f),rs=Math.max(q.lo,q.hi-f);
         expr+="scT="+(q.lo<=0?"1":"min(1,max(0,(scY-"+n(q.lo)+")/"+n(le-q.lo)+"))")+";"+
            "scU="+(q.hi>=1?"0":"min(1,max(0,(scY-"+n(rs)+")/"+n(q.hi-rs)+"))")+";"+
            "scW=max(scW,min("+step("scT")+",1-"+step("scU")+"));";
      }
   }
   if(!regions.length)expr+="scW=0;";
   expr+=(invert?"1-scW":"scW");return {expression:expr,symbols:symbols};
};

function SCMPreviewSaturation(v,table){var hi=Math.max(v[0],v[1],v[2]),lo=Math.min(v[0],v[1],v[2]),s=hi>0?(hi-lo)/hi:0,target=SCMPreviewLookup(table,s);if(s<=1e-12)return v;var k=target/s;return v.map(function(z){return Math.max(0,Math.min(1,hi-(hi-z)*k));});}

// Coordinates are normalized to the image, independent of display size.
function SCMLassoRaster(points,W,H,invert,feather){var N=W*H,mask=new Float32Array(N),dist=new Float32Array(N),i,x,y;
 for(y=0;y<H;y++){var sy=(y+.5)/H,cross=[];for(i=0;i<points.length;i++){var a=points[i],b=points[(i+1)%points.length];if((a[1]>sy)!=(b[1]>sy))cross.push((a[0]+(sy-a[1])*(b[0]-a[0])/(b[1]-a[1]))*W);}cross.sort(function(a,b){return a-b;});for(i=0;i+1<cross.length;i+=2){var lo=Math.max(0,Math.ceil(cross[i]-.5)),hi=Math.min(W,Math.ceil(cross[i+1]-.5));for(x=lo;x<hi;x++)mask[y*W+x]=1;}}
 if(invert)for(i=0;i<N;i++)mask[i]=1-mask[i];var radius=feather*.01*Math.min(W,H);if(radius<=0)return mask;
 for(i=0;i<N;i++)dist[i]=mask[i]?1e6:0;var diag=Math.SQRT2;
 for(y=0;y<H;y++)for(x=0;x<W;x++){i=y*W+x;if(!mask[i])continue;var d=dist[i];if(x)d=Math.min(d,dist[i-1]+1);if(y){d=Math.min(d,dist[i-W]+1);if(x)d=Math.min(d,dist[i-W-1]+diag);if(x+1<W)d=Math.min(d,dist[i-W+1]+diag);}dist[i]=d;}
 for(y=H-1;y>=0;y--)for(x=W-1;x>=0;x--){i=y*W+x;if(!mask[i])continue;var d=dist[i];if(x+1<W)d=Math.min(d,dist[i+1]+1);if(y+1<H){d=Math.min(d,dist[i+W]+1);if(x)d=Math.min(d,dist[i+W-1]+diag);if(x+1<W)d=Math.min(d,dist[i+W+1]+diag);}dist[i]=d;}
 for(i=0;i<N;i++){var t=Math.min(1,dist[i]/radius);mask[i]*=t*t*(3-2*t);}return mask;
}

function SCMLassoEditsRaster(edits,W,H,feather){var result=null;for(var e=0;e<edits.length;e++){var mask=SCMLassoRaster(edits[e].points,W,H,edits[e].subtract,feather);if(result===null)result=mask;else for(var i=0;i<result.length;i++)result[i]*=mask[i];}return result;}
function SCMStrengthColor(color,strength){var t=Math.max(0,Math.min(1,strength));return (0xff000000|(Math.round(((color>>>16)&255)*t)<<16)|(Math.round(((color>>>8)&255)*t)<<8)|Math.round((color&255)*t))>>>0;}
function SCMDimColor(color){return (0xff000000|((Math.floor(((color>>>16)&255)/2))<<16)|((Math.floor(((color>>>8)&255)/2))<<8)|Math.floor((color&255)/2))>>>0;}
function SCMHSV(h,s,v){var k=h*6,i=Math.floor(k),f=k-i,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];}
function SCMRGBHSV(rgb){var hi=Math.max.apply(null,rgb),lo=Math.min.apply(null,rgb),d=hi-lo,h=0;if(d>1e-12){if(hi==rgb[0])h=((rgb[1]-rgb[2])/d+6)%6;else if(hi==rgb[1])h=(rgb[2]-rgb[0])/d+2;else h=(rgb[0]-rgb[1])/d+4;h/=6;}return [h,hi>0?d/hi:0,hi];}
function SCMNearestPalette(rgb){
   var best=Infinity,result=[0,0,1];
   for(var row=0;row<33;row++)for(var col=0;col<72;col++){
      var h=col/71,s=Math.min(1,2*row/32),v=Math.min(1,2*(1-row/32)),candidate=SCMHSV(h,s,v),distance=0;
      for(var c=0;c<3;c++){var delta=candidate[c]-Math.max(0,Math.min(1,rgb[c]));distance+=delta*delta;}
      if(distance<best){best=distance;result=[h,s,v];}
   }return result;
}
function SCMColorInt(v){return (0xff000000|(Math.round(Math.max(0,Math.min(1,v[0]))*255)<<16)|(Math.round(Math.max(0,Math.min(1,v[1]))*255)<<8)|Math.round(Math.max(0,Math.min(1,v[2]))*255))>>>0;}
function SCMReadTile(image,rect,ch){
   var count=rect.width*rect.height,a=image.bitsPerSample>32?new Float64Array(count):new Float32Array(count);
   try{image.getSamples(a,rect,ch);}catch(e){a=[];image.getSamples(a,rect,ch);if(!SCMReadTile.warned){console.writeln("[Smart Color Mapper Apply] Typed read unavailable; using bounded tile arrays.");SCMReadTile.warned=true;}}
   if(a.length!=count)throw new Error("Tile sample geometry mismatch");return a;
}
function SCMMap(rgb,target,preserve){
   if(!preserve)return target.slice();
   var y=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],ty=.2126*target[0]+.7152*target[1]+.0722*target[2],k=1,d=[];
   for(var c=0;c<3;c++){d[c]=target[c]-ty;if(d[c]>0)k=Math.min(k,(1-y)/d[c]);else if(d[c]<0)k=Math.min(k,-y/d[c]);}
   k=Math.max(0,k);return [y+k*d[0],y+k*d[1],y+k*d[2]];
}
function SCMIdentity(){var a=[];for(var i=0;i<8;i++)a.push([[0,0],[1,1]]);return a;}
function SCMValidate(im,source){
   if(im.width!=source.width||im.height!=source.height||im.numberOfChannels!=source.numberOfChannels)
      throw new Error("Output geometry/channel regression");
   var step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/4096))),n=0;
   for(var y=0;y<im.height;y+=step)for(var x=0;x<im.width;x+=step)
      for(var c=0;c<im.numberOfChannels;c++){
         var v=im.sample(x,y,c);if(!isFinite(v))throw new Error("Nonfinite output sample");n++;
      }
   console.writeln("[Smart Color Mapper] finite sample validation: "+n+" samples (sampled, not exhaustive)");
}
function SCMHistogramControl( parent )
{
   this.__base__ = Control;
   this.__base__( parent );

   var self = this;

   this.bins = [];
   this.maximum = 1;
   this.ranges = [ { center:0.5, low:0.0, high:1.0 } ];
   this.onSignalClicked = null;
   this.zoomMin = 0.0;
   this.zoomMax = 1.0;
   this.spatialLocked = false;
   this.channelMode = "RGBK";
   this.selectionMode = "symmetry";

   this.setChannelMode=function(m){this.channelMode=m;this.update();};
   this.setSelectionMode=function(m)
   {
      this.selectionMode=m;
      this.toolTip=m=="symmetry" ? "Click to set the Symmetry Point (SP)." :
         (m=="color" ? "Color mode — histogram selection is locked." :
          "Click to select a signal value. Ctrl-click adds/removes signal ranges.");
      this.update();
   };

   this.setMinSize(Math.min(640,STScreenFit.previewSize(this,1280,760).width),Math.min(170,Math.max(80,Math.floor(STScreenFit.bounds(this).height*.19))));

   this.setHistogram = function( bins, resetZoom )
   {
      this.bins = bins;
      this.maximum = 1;
      for ( var i = 0; i < bins.length; ++i )
         if ( bins[i] > this.maximum )
            this.maximum = bins[i];

      // Live histogram updates must not destroy a user-selected zoom.
      if ( resetZoom === true )
      {
         this.zoomMin = 0.0;
         this.zoomMax = 1.0;
      }
      else
      {
         this.zoomMin = Math.max( 0.0, Math.min( 1.0, this.zoomMin ) );
         this.zoomMax = Math.max( 0.0, Math.min( 1.0, this.zoomMax ) );
         if ( this.zoomMax <= this.zoomMin )
         {
            this.zoomMin = 0.0;
            this.zoomMax = 1.0;
         }
      }
      this.update();
   };

   this.setRanges = function( ranges )
   {
      this.ranges = [];
      for ( var i = 0; i < ranges.length; ++i )
         this.ranges.push( { center:ranges[i].center,
                             low:ranges[i].low,
                             high:ranges[i].high,
                             type:ranges[i].type || "signal" } );
      this.update();
   };

   this.setSelectionLocked = function( locked, reason )
   {
      this.spatialLocked=locked;
      this.lockReason=reason || "";
      this.toolTip=locked ? this.lockReason :
         "Click to select a signal value. Ctrl-click adds/removes signal ranges.";
      this.update();
   };

   this.resetZoom = function()
   {
      this.zoomMin = 0.0;
      this.zoomMax = 1.0;
      this.update();
   };

   this.zoomToPeak = function()
   {
      this.lastPeak=null;
      if ( this.bins.length < 2 )
         return null;

      var n=this.bins.length;
      var total=0;
      for(var i=0;i<n;++i)
         total+=this.bins[i];
      if(total<=0)
         return null;

      // A lightly smoothed copy is used ONLY to identify the main peak.
      // Unlike percentile limits, peak-width framing does not include a
      // long, faint highlight tail in the zoom window.
      var smooth=new Array(n);
      var peakBin=0,peakValue=0;
      for(var j=0;j<n;++j)
      {
         var left=this.bins[Math.max(0,j-1)];
         var mid=this.bins[j];
         var right=this.bins[Math.min(n-1,j+1)];
         smooth[j]=0.25*left+0.5*mid+0.25*right;
         if(smooth[j]>peakValue)
         {
            peakValue=smooth[j];
            peakBin=j;
         }
      }
      if(peakValue<=0)
         return null;

      // Find where the dominant population falls to 10% of its peak,
      // then provide extra room on either side for the full peak profile.
      var threshold=0.10*peakValue;
      var loBin=peakBin,hiBin=peakBin;
      while(loBin>0 && smooth[loBin-1]>=threshold)
         --loBin;
      while(hiBin<n-1 && smooth[hiBin+1]>=threshold)
         ++hiBin;

      // Frame the 10%-height peak base to approximately 20% of the
      // histogram plot HEIGHT in screen pixels. This makes zoom consistent
      // across different histogram/window sizes instead of letting the peak
      // expand across most of the display width.
      var plotHeight=Math.max(1,this.height-27);
      var targetBasePixels=Math.max(1,0.20*plotHeight);
      var plotWidth=Math.max(1,this.width);
      var peakWidthBins=Math.max(1,hiBin-loBin+1);
      var visibleBins=Math.max(16,Math.min(n,
         peakWidthBins*plotWidth/targetBasePixels));

      // Center on the main peak while retaining the full desired span.
      // At the black/white endpoints shift the entire window inward rather
      // than cutting its width and accidentally zooming back in.
      var centerBin=0.5*(loBin+hiBin+1);
      var startBin=centerBin-0.5*visibleBins;
      startBin=Math.max(0,Math.min(n-visibleBins,startBin));

      this.zoomMin=startBin/n;
      this.zoomMax=(startBin+visibleBins)/n;
      this.lastPeak={bin:peakBin,value:(peakBin+0.5)/n,bins:n};
      this.update();
      return this.lastPeak;
   };

   this.onPaint = function()
   {
      var g = new Graphics( this );
      try
      {
         var w = this.width;
         var h = this.height;
         var bottom = h - 36;
         var z0 = this.zoomMin;
         var z1 = this.zoomMax;
         var zs = Math.max( 1.0e-12, z1-z0 );

         g.fillRect( 0, 0, w, h, new Brush( 0xff181818 ) );

         if ( this.bins.length > 0 )
         {
            var n = this.bins.length;

            // Keep the RAW histogram intact for calculations and SP clicks.
            // Only a very small, display-only filter is applied so a narrow
            // linear peak stays narrow instead of becoming a broad plateau.
            // Fractional-bin interpolation prevents stair-step blocks.
            var displayValues=new Array(w);
            var displayMaximum=0;

            for(var dx=0;dx<w;++dx)
            {
               var dv=z0+zs*(dx+0.5)/w;
               var bp=dv*n-0.5;
               var bi=Math.floor(bp);
               var bt=bp-bi;

               // 1:2:1 smoothing across neighboring raw bins, followed by
               // linear interpolation at the exact fractional position.
               var i0=Math.max(0,Math.min(n-1,bi));
               var i1=Math.max(0,Math.min(n-1,bi+1));
               var a0=0.25*this.bins[Math.max(0,i0-1)]+
                      0.5*this.bins[i0]+
                      0.25*this.bins[Math.min(n-1,i0+1)];
               var a1=0.25*this.bins[Math.max(0,i1-1)]+
                      0.5*this.bins[i1]+
                      0.25*this.bins[Math.min(n-1,i1+1)];
               var value=a0*(1-bt)+a1*bt;
               displayValues[dx]=value;
               if(value>displayMaximum)
                  displayMaximum=value;
            }

            // Linear vertical scaling faithfully shows peak sharpness.
            // Leave 10% headroom so the crest is never flush with the top.
            var verticalScale=displayMaximum>0 ?
               0.90*(bottom-5)/displayMaximum : 0;

            for ( var x = 0; x < w; ++x )
            {
               var v = z0 + zs*(x+0.5)/w;
               var y = bottom - Math.round(
                  displayValues[x]*verticalScale );
               if(y<5)y=5;

               var selected = false;
               if(this.selectionMode!="symmetry")
                  for ( var r = 0; r < this.ranges.length; ++r )
                     if ( this.ranges[r].type!="symmetry" &&
                          v >= this.ranges[r].low && v <= this.ranges[r].high )
                     {
                        selected = true;
                        break;
                     }

               var nc=0xff606060, sc=0xffc8c8c8;
               if(this.channelMode=="R"){nc=0xff902828;sc=0xffff6060;}
               else if(this.channelMode=="G"){nc=0xff287828;sc=0xff60ff60;}
               else if(this.channelMode=="B"){nc=0xff303090;sc=0xff7070ff;}
               g.fillRect(x,y,x+1,bottom,new Brush(selected?sc:nc));
            }
         }

         // Selection ranges remain in true 0..1 signal coordinates.
         for ( var q = 0; q < this.ranges.length; ++q )
         {
            var range = this.ranges[q];
            var dlo = Math.max( range.low, z0 );
            var dhi = Math.min( range.high, z1 );

            if ( this.selectionMode!="symmetry" && range.type!="symmetry" &&
                 dhi >= dlo )
            {
               var lx = Math.round( (dlo-z0)/zs*w );
               var hx = Math.round( (dhi-z0)/zs*w );
               if ( hx > lx )
                  g.fillRect( lx, 0, hx, bottom, new Brush( 0x2030a0ff ) );

               g.pen = new Pen( 0xffffffff, 1 );
               g.drawLine( lx, 0, lx, bottom );
               g.drawLine( hx, 0, hx, bottom );
            }

            if ( range.center >= z0 && range.center <= z1 )
            {
               var cx = Math.round( (range.center-z0)/zs*(w-1) );
               g.pen = new Pen( 0xffffff00,
                  this.selectionMode=="symmetry" ? 3 : 2 );
               g.drawLine( cx, 0, cx, bottom );
               if(this.selectionMode=="symmetry")
                  g.drawText(Math.min(w-62,cx+5),16,
                     "SP "+range.center.toFixed(3));
            }
         }

         g.pen = new Pen( 0xff909090 );
         g.drawLine( 0, bottom, w-1, bottom );

         // Brightness legend shares the histogram's input axis, including zoom.
         for(var gx=0;gx<w;gx++){
            var gray=Math.round(255*Math.max(0,Math.min(1,z0+zs*gx/Math.max(1,w-1))));
            var grayColor=(0xff000000|(gray<<16)|(gray<<8)|gray)>>>0;
            g.fillRect(gx,bottom+3,gx+1,bottom+14,new Brush(grayColor));
         }
         g.pen = new Pen( 0xffd0d0d0 );
         g.drawText( 3, h-5, z0.toFixed( 4 ) );
         var rightLabel = z1.toFixed( 4 );
         g.drawText( Math.max( 3, w-55 ), h-5, rightLabel );
         if ( this.spatialLocked )
         {
            g.pen = new Pen( 0xffc0c0c0 );
            g.drawText( 12, 20,
               "Color selection — histogram interaction disabled" );
         }
      }
      finally
      {
         g.end();
      }
   };

   this.onMousePress = function( x, y, button, buttons, modifiers )
   {
      if ( this.spatialLocked || button != MouseButton_Left )
         return;

if ( this.width < 2 )
         return;

      var fraction = Math.max( 0, Math.min( 1, x/(this.width-1) ) );
      var value = this.zoomMin + fraction*(this.zoomMax-this.zoomMin);

      // Keep the proven Stage 4.3.1 raw Control modifier bit.
      var ctrl = (modifiers & 0x02) != 0;

      if ( this.onSignalClicked != null )
         this.onSignalClicked( value, ctrl );
   };
}
SCMHistogramControl.prototype = new Control;
function SCMDialog(initialView){
   this.__base__=Dialog;this.__base__();var self=this;
   var controlParent=this;
   this.windowTitle="Smart Color Mapper "+SCM_VERSION;this.userResizable=true;
   this.targetHSV=[.5,1,.85];this.hasTarget=false;this.curves=SCMIdentity();this.channel=3;this.selectedChannels=[3];this.point=0;this.graphTable=[];this.graphTables=[[],[],[],[],[],[],[],[]];this.graphKeys=["","","","","","","",""];
   this.previewPlanes=null;this.previewResult=null;this.previewOverlay=null;this.previewWeights=null;this.previewAttached=null;
   this.displayImage=null;this.source=null;this.previewSource=null;this.maskCache=null;
   this.previewPool={};this.graphPool={};this.previewWorkUses=0;this.disposed=false;this.previewOriginalReady=false;this.previewMaskValid=false;this.previewMaskKey="";this.graphKey="";this.graphRamp=null;
   this.dragPreviewTimer=new Timer;this.dragPreviewTimer.interval=.08;this.dragPreviewTimer.periodic=false;
   this.dragPreviewPending=false;this.dragPosition=null;this.restoreMaskAfterDrag=false;this.dragReleasePending=false;
   this.selectionPreviewTimer=new Timer;this.selectionPreviewTimer.interval=.12;this.selectionPreviewTimer.periodic=false;
   this.previewMaskGeneration=0;this.overlayMaskGeneration=-1;
   this.previewDisplayWidth=1280;this.previewDisplayHeight=760;
   this.view=null;this.regions=[];this.selectedRegion=-1;this.busy=false;this.suspend=false;
   this.lassoEdits=[];this.lassoPoints=[];this.lassoDraft=[];this.lassoDrawing=false;this.lassoRestoreMask=false;
   this.changesOn=true;this.bitmap=null;this.bitmapX=0;this.bitmapY=0;this.displayIsOriginal=true;this.showingMask=false;this.pickX=-1;this.pickY=-1;
   var initialWindow=ImageWindow.activeWindow;
   this.curveColors=[0xffff5555,0xff55dd55,0xff5588ff,0xffeeeeee,0xffdd66ff,0xffffff00,0xffff00ff,0xff00ffff];
   function error(e){console.criticalln("[Smart Color Mapper] "+e);new MessageBox(String(e),self.windowTitle,StdIcon_Error,StdButton_Ok).execute();}
   function guarded(fn){if(self.busy||self.disposed)return;self.busy=true;try{fn();}catch(e){error(e);}finally{self.busy=false;}}
   function label(text){var q=new Label(controlParent);q.text=text;return q;}
   function button(text,fn){var b=new PushButton(controlParent);b.text=text;b.onClick=function(){guarded(fn);};return b;}
   function row(items){var r=new HorizontalSizer;r.spacing=6;for(var i=0;i<items.length;i++)r.add(items[i]);return r;}
   function number(text,lo,hi,value,fn,deferred){
      var n=new NumericControl(controlParent);n.label.text=text;n.setRange(lo,hi);n.setPrecision(5);
      n.slider.setRange(0,1000);n.setValue(value);SmartTools.configureNumericInput(n);
      n.onValueUpdated=function(v){if(self.suspend||self.disposed)return;if(deferred)fn(v);else guarded(function(){fn(v);});};return n;
   }
   function check(text,value,fn){var c=new CheckBox(controlParent);c.text=text;c.checked=value;c.onCheck=function(v){guarded(function(){fn(v);});};return c;}
   this.status=label("Select an image. Click Original to pick signal/color regions; Ctrl-click adds a region.");
   this.status.wordWrapping=true;
   this.imageList=new ComboBox(this);this.imageList.addItem("Select image");this.views=[];
   var windows=ImageWindow.windows;
   for(var wi=0;wi<windows.length;wi++)if(!windows[wi].isNull){this.views.push(windows[wi].mainView);this.imageList.addItem(windows[wi].mainView.id);}
   this.imageList.onItemSelected=function(i){guarded(function(){if(i>0)self.load(self.views[i-1]);});};
   this.previewScroll=new ScrollBox(this);SmartTools.setPreviewSize(this.previewScroll);this.preview=this.previewScroll.viewport;
   this.previewZoom=new STPreviewZoom(this,this.previewScroll,function(){return self.bitmap;});
   this.preview.onPaint=function(){var g=new Graphics(this);try{
      g.fillRect(0,0,this.width,this.height,new Brush(0xff101010));self.previewZoom.paint(g);
      if(self.bitmap){g.drawBitmap(self.bitmapX,self.bitmapY,self.bitmap);self.previewZoom.nativeTiles.paint(g);
         var overlayUnit=1/Math.max(1e-6,self.previewZoom.scale),crossRadius=9*overlayUnit;
         if(self.pickX>=0&&self.previewSource){var px=self.bitmapX+self.pickX*self.bitmap.width/self.previewSource.width,py=self.bitmapY+self.pickY*self.bitmap.height/self.previewSource.height;
            g.pen=new Pen(0xff000000,4*overlayUnit);g.drawLine(px-crossRadius,py,px+crossRadius,py);g.drawLine(px,py-crossRadius,px,py+crossRadius);
            g.pen=new Pen(0xffffff00,2*overlayUnit);g.drawLine(px-crossRadius,py,px+crossRadius,py);g.drawLine(px,py-crossRadius,px,py+crossRadius);}
         var outline=self.lassoDrawing?self.lassoDraft:[];if(outline.length>1){g.pen=new Pen(0xffffff00,2*overlayUnit);for(var oi=1;oi<outline.length;oi++)g.drawLine(self.bitmapX+outline[oi-1][0]*self.bitmap.width,self.bitmapY+outline[oi-1][1]*self.bitmap.height,self.bitmapX+outline[oi][0]*self.bitmap.width,self.bitmapY+outline[oi][1]*self.bitmap.height);if(!self.lassoDrawing)g.drawLine(self.bitmapX+outline[outline.length-1][0]*self.bitmap.width,self.bitmapY+outline[outline.length-1][1]*self.bitmap.height,self.bitmapX+outline[0][0]*self.bitmap.width,self.bitmapY+outline[0][1]*self.bitmap.height);}
      }
   }finally{g.end();}};
   this.preview.onResize=function(){if(!self.busy&&self.previewSource)guarded(function(){self.showImage(self.displayImage||self.previewSource,self.displayIsOriginal,self.showingMask);});};
   this.toggleChanges=button("Toggle Changes (On)",function(){self.changesOn=!self.changesOn;self.toggleChanges.text=self.changesOn?"Toggle Changes (On)":"Toggle Changes (Off)";self.showingMask=false;self.maskButton.text="Show Mask";self.invalidateMask();self.refresh();});
   this.toggleChanges.toolTip="On shows the adjusted preview; Off shows original pixels. Selections and curve settings are retained. Apply always uses your curve settings.";
   this.maskButton=button("Show Mask",function(){if(!self.previewSource)return;if(self.showingMask){self.showingMask=false;self.maskButton.text="Show Mask";self.refresh();}else self.showMask();});
   this.preview.onMousePress=function(x,y,button,buttons,modifiers){
      if(button!=MouseButton_Left||!self.previewSource||!self.bitmap)return;
      if(self.selectionTabs.currentPageIndex==1){var pt=self.lassoPoint(x,y,false);if(!pt)return;self.lassoDrawing=true;self.lassoDraft=[pt];self.preview.update();return;}
      guarded(function(){
         var px=Math.floor((x-self.bitmapX)*self.previewSource.width/self.bitmap.width);
         var py=Math.floor((y-self.bitmapY)*self.previewSource.height/self.bitmap.height);
         if(px<0||py<0||px>=self.previewSource.width||py>=self.previewSource.height)return;
         var im=self.previewSource,r=im.sample(px,py,0),gg=im.isColor?im.sample(px,py,1):r,b=im.isColor?im.sample(px,py,2):r;
         var q;if(self.mode.currentItem==1&&im.isColor)q={mode:"color",r:r,g:gg,b:b,tolerance:self.tolerance.value,edgeFeather:self.colorFeather.value};
         else{var v=im.isColor?.2126*r+.7152*gg+.0722*b:r;
            self.pickSignal(v,(modifiers&0x02)!=0,px,py);return;}
         var add=(modifiers&0x02)!=0,hit=add?STRegionColorHit(self.regions,q):-1;
         if(!add){self.resetSelectionState();self.regions=[];}
         if(hit>=0)self.regions.splice(hit,1);else self.regions.push(q);
         self.selectedRegion=self.regions.length-1;self.pickX=px;self.pickY=py;
         if(!add){self.targetHSV=SCMRGBHSV([r,gg,b].map(function(v){return Math.max(0,Math.min(1,v));}));self.hasTarget=true;self.syncPoint();}
         self.invalidateMask();self.syncRegion();self.updateGraph();self.showMask();self.status.text=self.regions.length+" source color"+(self.regions.length==1?"":"s")+" selected; all share one replacement. Ctrl-click toggles a matching color; normal click starts over.";
      });
   };
   this.lassoPoint=function(x,y,clamp){var u=(x-self.bitmapX)/self.bitmap.width,v=(y-self.bitmapY)/self.bitmap.height;if(!clamp&&(u<0||u>1||v<0||v>1))return null;return [Math.max(0,Math.min(1,u)),Math.max(0,Math.min(1,v))];};
   this.preview.onMouseMove=function(x,y){if(!self.lassoDrawing||self.disposed)return;var pt=self.lassoPoint(x,y,true),last=self.lassoDraft[self.lassoDraft.length-1],dx=(pt[0]-last[0])*self.bitmap.width,dy=(pt[1]-last[1])*self.bitmap.height;if(dx*dx+dy*dy<4)return;self.lassoDraft.push(pt);if(self.lassoDraft.length>512){var reduced=[];for(var i=0;i<self.lassoDraft.length;i+=2)reduced.push(self.lassoDraft[i]);self.lassoDraft=reduced;}self.preview.update();};
   this.preview.onMouseRelease=function(x,y){if(!self.lassoDrawing)return;self.lassoDrawing=false;if(typeof x=="number"&&typeof y=="number")self.lassoDraft.push(self.lassoPoint(x,y,true));if(self.lassoDraft.length>=3){self.lassoPoints=self.lassoDraft.slice();self.lassoEdits.push({points:self.lassoPoints.slice(),subtract:self.lassoSubtract.checked});self.invalidateMask();self.selectionPreviewTimer.stop();self.showMask();self.status.text="Lasso edits accumulated. Show Mask displays the combined result; Clear Lasso Edits removes all edits.";}self.lassoPoints=[];self.lassoDraft=[];self.preview.update();};
   this.histogram=new SCMHistogramControl(this);
   this.histogram.setSelectionMode("signal");this.histogram.setRanges([]);
   this.histogram.onSignalClicked=function(value,ctrl){
      if(self.mode.currentItem!=0||!self.previewSource)return;
      guarded(function(){self.pickSignal(value,ctrl,-1,-1);});
   };
   this.zoomHistogram=button("Zoom To Peak",function(){if(self.mode.currentItem==0)self.histogram.zoomToPeak();});
   this.resetHistogram=button("Reset Zoom",function(){if(self.mode.currentItem==0)self.histogram.resetZoom();});
   this.pickSignal=function(value,ctrl,px,py){
      value=SmartTools.clamp(value,0,1);var radius=self.bandWidth.value;
      var q={mode:"signal",center:value,width:radius,lo:Math.max(0,value-radius),hi:Math.min(1,value+radius)};
      if(!ctrl){self.resetSelectionState();self.regions=[q];}
      else{var hit=-1;for(var i=0;i<self.regions.length;i++)if(self.regions[i].mode=="signal"&&Math.abs(self.regions[i].center-value)<=radius){hit=i;break;}
         if(hit>=0)self.regions.splice(hit,1);else self.regions.push(q);}
      self.selectedRegion=self.regions.length-1;self.pickX=px;self.pickY=py;self.graph.update();
      self.invalidateMask();self.syncRegion();self.showMask();
   };
   this.paletteTabs=new TabBox(this);this.paletteTabs.setFixedHeight(510);
   this.vividPage=new Control(this.paletteTabs);this.vividPage.sizer=new VerticalSizer;
   this.graph=new Control(this.vividPage);this.graph.setFixedSize(700,480);this.graph.dragging=false;
   this.graph.onPaint=function(){var g=new Graphics(this),cols=72,rows=33;try{
      for(var y=0;y<rows;y++)for(var x=0;x<cols;x++)g.fillRect(Math.floor(x*this.width/cols),Math.floor(y*this.height/rows),Math.ceil((x+1)*this.width/cols),Math.ceil((y+1)*this.height/rows),new Brush(SCMColorInt(SCMHSV(x/(cols-1),Math.min(1,2*y/(rows-1)),Math.min(1,2*(1-y/(rows-1)))))));
      var marker=SCMNearestPalette(SCMHSV.apply(null,self.targetHSV));var xx=marker[0]*(this.width-1),yy=(marker[1]<1-1e-6?marker[1]/2:1-marker[2]/2)*(this.height-1);
      g.pen=new Pen(0xff000000,4);g.drawRect(xx-5,yy-5,xx+5,yy+5);g.pen=new Pen(0xffffffff,1);g.drawRect(xx-5,yy-5,xx+5,yy+5);
   }finally{g.end();}};
   this.pickTarget=function(x,y){self.targetHSV[0]=SmartTools.clamp(x/(self.graph.width-1),0,1);var row=SmartTools.clamp(y/(self.graph.height-1),0,1);self.targetHSV[1]=Math.min(1,2*row);self.targetHSV[2]=Math.min(1,2*(1-row));self.hasTarget=true;self.mappingChanged();};
   this.graph.onMousePress=function(x,y,button){if(button!=MouseButton_Left)return;this.dragging=true;self.pickTarget(x,y);};
   this.graph.onMouseMove=function(x,y){if(this.dragging)self.pickTarget(x,y);};
   this.graph.onMouseRelease=function(){this.dragging=false;self.schedulePointEdit();};
   this.tabButtons=[];this.tabs=new HorizontalSizer;
   this.endCurveDrag=function(){self.dragReleasePending=false;self.curveChanged();};
   this.linkPoint=function(){};
   this.input=number("Input",0,1,0,function(v){self.movePoint([v,self.curves[self.channel][self.point][1]]);self.schedulePointEdit();},true);
   this.output=number("Output",0,1,0,function(v){self.movePoint([self.curves[self.channel][self.point][0],v]);self.schedulePointEdit();},true);
   this.input.hide();this.output.hide();
   this.pointEditPending=false;this.pointEditTimer=new Timer;this.pointEditTimer.interval=.08;this.pointEditTimer.periodic=false;
   this.schedulePointEdit=function(){if(self.disposed)return;if(!self.pointEditPending){self.pointEditPending=true;self.pointEditTimer.start();}};
   this.pointEditTimer.onTimeout=function(){self.pointEditPending=false;if(self.disposed)return;if(self.busy){self.schedulePointEdit();return;}guarded(function(){self.curveChanged();});};
   this.input.slider.onMouseRelease=this.output.slider.onMouseRelease=function(){self.pointEditTimer.stop();self.pointEditPending=false;guarded(function(){self.curveChanged();});};
   this.reset=button("Match source",function(){if(!self.regions.length)return;var q=self.regions[0];self.targetHSV=SCMNearestPalette([q.r,q.g,q.b]);self.hasTarget=true;self.syncPoint();self.mappingChanged();});
   this.resetAll=button("Reset mapping",function(){self.suspend=true;try{self.strength.setValue(.65);self.preserve.checked=true;self.preserve.enabled=true;}finally{self.suspend=false;}if(self.regions.length){var q=self.regions[0];self.targetHSV=SCMNearestPalette([q.r,q.g,q.b]);}else self.targetHSV=[.5,1,.85];self.syncPoint();self.mappingChanged();});
   this.live=check("Live Preview",true,function(v){if(!v){self.dragPreviewTimer.stop();self.dragPreviewPending=false;}else self.refresh();});
   this.selectionTabs=new TabBox(this);this.selectionTabs.setMinWidth(520);this.selectionTabs.setMinHeight(340);
   this.optionsContent=new Control(this.selectionTabs);
   this.optionsContent.sizer=new VerticalSizer;
   this.optionsContent.sizer.spacing=5;this.optionsContent.sizer.margin=4;
   controlParent=this.optionsContent;
   this.mode=new ComboBox(this.optionsContent);this.mode.addItem("Signal selection");this.mode.addItem("Color selection");
   this.mode.currentItem=1;
   this.mode.onItemSelected=function(){self.updateEnabled();self.status.text="Click the image to pick "+(self.mode.currentItem==1?"a color":"a signal range")+". Ctrl-click adds a selection.";};
   this.mode.toolTip="Click any preview display to select original pixels. Ctrl-click toggles matching regions or adds new ones. Multiple regions are combined by maximum weight.";
   this.bandWidth=number("Click Range",.00001,1,.025,function(v){self.setClickRange(v);},true);
   this.bandWidth.toolTip="Select signal +/- Click Range, matching Smart Stretch. Ctrl-click adds or removes a range.";
   this.tolerance=number("Color tolerance",.001,1,.100,function(v){var q=self.regions[self.selectedRegion];if(q&&q.mode=="color"){q.tolerance=v;self.scheduleSelectionPreview();}},true);
   this.connectedColor=check("Include connected faint color",false,function(v){self.faintColorReach.enabled=v;self.invalidateMask();self.refresh();});
   this.faintColorReach=number("Faint color reach",0,1,.5,function(){self.scheduleSelectionPreview();},true);this.faintColorReach.enabled=false;
   this.connectedColor.toolTip="Extend strong color matches into connected dimmer pixels with a looser color match. Neutral background is restricted. Review the mask; this is an estimate of structure.";
   this.faintColorReach.toolTip="Higher values relax color matching and extend farther from strong matches. Uses a shared grid up to 800 pixels per side for preview and full Apply.";
   this.colorFeather=number("Color Edge Feather",0,1,1,function(v){for(var i=0;i<self.regions.length;i++)self.regions[i].edgeFeather=v;self.scheduleSelectionPreview();},true);
   this.low=number("Region low",0,1,0,function(v){self.editRegion("lo",v);});
   this.high=number("Region high",0,1,1,function(v){self.editRegion("hi",v);});
   this.invert=check("Invert selection",false,function(){self.invalidateMask();self.refresh();});
   this.favorFaint=check("Favor faint areas",false,function(v){self.faintProtection.enabled=v;self.invalidateMask();self.refresh();});
   this.faintProtection=number("Bright-area protection",0,1,1,function(){self.scheduleSelectionPreview();},true);self.faintProtection.enabled=false;
   this.favorFaint.toolTip="Reduce curve strength in bright selected pixels using the original maximum RGB channel (mono: original intensity). Faint selected pixels retain more strength. Does not expand the selection.";
   this.faintProtection.toolTip="0 leaves mask strength unchanged; 1 fully protects the brightest selected pixels. Uses the original selection brightness distribution (10th to 85th percentile).";
   this.clearRegions=button("Clear selections",function(){self.regions=[];self.selectedRegion=-1;self.pickX=-1;self.pickY=-1;self.invert.checked=false;self.lassoEdits=[];self.lassoPoints=[];self.lassoDraft=[];self.lassoDrawing=false;self.showingMask=false;self.restoreMaskAfterDrag=false;self.maskButton.text="Show Mask";self.invalidateMask();self.syncRegion();self.preview.update();self.graph.update();self.refresh();self.status.text="Signal/color selections, inversion and lasso edits cleared. Curve settings retained.";});
   this.removeRegion=button("Remove region",function(){if(self.selectedRegion>=0){self.regions.splice(self.selectedRegion,1);self.selectedRegion=self.regions.length-1;self.invalidateMask();self.syncRegion();self.refresh();}});
   this.attachedMask=check("Use attached image mask",true,function(){self.invalidateMask();self.refresh();});
   this.exportMask=button("Create Mask",function(){if(!self.source)return;var m=self.buildMask(self.source,true);m.show();self.status.text="Created full-resolution mask: "+m.mainView.id;});
   controlParent=this;
   this.newInstanceButton=new ToolButton(this);this.newInstanceButton.icon=this.scaledResource(":/process-interface/new-instance.png");this.newInstanceButton.setFixedSize(24,24);
   this.newInstanceButton.toolTip="New Instance — drag onto the workspace to save the current curves and mask settings.";
   this.newInstanceButton.onMousePress=function(x,y,button){if(button!=MouseButton_Left)return;this.hasFocus=true;this.pushed=false;guarded(function(){Parameters.set("scmState",JSON.stringify(self.captureInstance()));self.newInstance();});};
   this.apply=new ToolButton(this);this.apply.icon=this.scaledResource(":/process-interface/apply.png");this.apply.setFixedSize(24,24);this.apply.toolTip="Apply changes to the source image (Undo available).";
   this.apply.onClick=function(){guarded(function(){self.applyFull();});};
   this.reload=button("Reload image",function(){
      if(!self.view)return;
      self.dragPreviewTimer.stop();self.pointEditTimer.stop();self.selectionPreviewTimer.stop();
      self.dragPreviewPending=false;self.pointEditPending=false;self.dragReleasePending=false;
      self.dragPosition=null;self.graph.dragging=false;
      self.targetHSV=[.5,1,.85];self.hasTarget=false;self.preserve.enabled=true;self.curves=SCMIdentity();self.point=0;
      self.suspend=true;
      try{
         self.invert.checked=false;self.favorFaint.checked=false;
         self.faintProtection.setValue(1);self.faintProtection.enabled=false;
         self.attachedMask.checked=false;
         self.lassoKeep.checked=false;self.lassoSubtract.checked=true;self.lassoFeather.setValue(1);
         self.bandWidth.setValue(.025);self.tolerance.setValue(.100);self.colorFeather.setValue(1);
      }finally{self.suspend=false;}
      self.showingMask=false;self.restoreMaskAfterDrag=false;self.lassoRestoreMask=false;
      self.maskButton.text="Show Mask";
      self.changesOn=true;self.toggleChanges.text="Toggle Changes (On)";
      self.load(self.view);
   });
   this.left=new VerticalSizer;this.left.spacing=6;this.left.add(row([label("Image:"),this.imageList,this.reload]));this.left.add(this.previewScroll,1);this.left.add(this.previewZoom.row);this.histogram.hide();
   this.histogramActions=new HorizontalSizer;this.histogramActions.spacing=6;
   this.zoomHistogram.hide();this.resetHistogram.hide();var histogramButtons=[this.toggleChanges,this.maskButton];
   var histogramLabels=["Toggle Changes (Off)","Show Mask"];
   for(var hb=0;hb<histogramButtons.length;hb++){var action=histogramButtons[hb];action.setFixedWidth(action.font.width(histogramLabels[hb])+26);action.setFixedHeight(26);action.styleSheet="padding: 1px 5px;";this.histogramActions.add(action);}
   this.histogramActions.addStretch();this.left.add(this.histogramActions);this.status.show();this.left.add(this.status);
   this.channelBar=new Control(this);this.channelBar.setFixedHeight(31);this.channelBar.sizer=this.tabs;
   this.curveActions=new Control(this);this.curveActions.setFixedHeight(26);this.curveActions.sizer=row([this.reset,this.resetAll,this.live]);
   this.reset.setFixedHeight(26);this.resetAll.setFixedHeight(26);
   this.shade=number("Replacement shade",0,1,.5,function(v){self.targetHSV[1]=Math.min(1,2*(1-v));self.targetHSV[2]=Math.min(1,2*v);self.hasTarget=true;self.mappingChanged();},true);
   this.strength=number("Mapping strength",0,1,.65,function(){self.mappingChanged();},true);
   this.preserve=check("Preserve brightness",true,function(){self.mappingChanged();});
   this.swatches=new Control(this);this.swatches.setFixedHeight(45);this.swatches.setFixedWidth(420);
   this.swatches.onPaint=function(){var g=new Graphics(this);try{var q=self.regions[self.selectedRegion]||self.regions[0],source=q?[q.r,q.g,q.b]:[.15,.15,.15];
      g.fillRect(0,0,70,40,new Brush(SCMColorInt(source)));g.fillRect(230,0,300,40,new Brush(SCMColorInt(SCMHSV.apply(null,self.targetHSV))));
      g.pen=new Pen(0xff111111,1);g.drawText(78,24,q?"Source color":"Click preview");g.drawText(308,24,"Replacement");
   }finally{g.end();}};
   this.electricBlue=button("Electric Blue",function(){self.targetHSV=SCMRGBHSV([0,168/255,1]);self.hasTarget=true;self.mappingChanged();});
   this.electricBlue.setMinWidth(this.electricBlue.font.width("Electric Blue")+28);this.electricBlue.setFixedHeight(28);
   this.swatchRow=new HorizontalSizer;this.swatchRow.spacing=8;this.swatchRow.add(this.swatches);this.swatchRow.add(this.electricBlue);this.swatchRow.addStretch();
   // Palette browsing never changes targetHSV or the selection mask.
   this.customColors=[];
   function validColors(a){return a instanceof Array&&a.length<=48&&a.every(function(c){return c instanceof Array&&c.length==3&&c.every(function(v){return typeof v=="number"&&isFinite(v)&&v>=0&&v<=1;});});}
   try{var savedColors=Settings.read("SmartColorMapper/CustomColors",DataType_String);if(Settings.lastReadOK){var parsedColors=JSON.parse(savedColors);if(validColors(parsedColors))this.customColors=parsedColors;}}catch(ignore){}
   this.choosePaletteColor=function(rgb){self.targetHSV=SCMRGBHSV(rgb);self.hasTarget=true;self.mappingChanged();};
   this.palettePickers=[];this.imagePalette=[];
   function palettePage(title,entries){
      var page=new Control(self.paletteTabs);page.sizer=new VerticalSizer;page.sizer.spacing=4;
      var picker=new Control(page);picker.setMinWidth(700);picker.setFixedHeight(460);picker.dragging=false;
      picker.colors=entries?entries.map(function(e){return e[1].map(function(v){return v/255;});}).sort(function(a,b){return SCMRGBHSV(a)[0]-SCMRGBHSV(b)[0];}):[];
      picker.colorAt=function(x,y){var colors=this.colors;if(!colors.length)return [.15,.15,.15];
         var t=SmartTools.clamp(x,0,1)*(colors.length-1),i=Math.min(colors.length-1,Math.floor(t)),j=Math.min(colors.length-1,i+1),f=t-i;
         return colors[i].map(function(v,k){var base=v*(1-f)+colors[j][k]*f;return y<.5?1-(1-base)*2*y:base*2*(1-y);});
      };
      picker.onPaint=function(){var g=new Graphics(this);try{for(var y=0;y<48;y++)for(var x=0;x<120;x++)g.fillRect(Math.floor(x*this.width/120),Math.floor(y*this.height/48),Math.ceil((x+1)*this.width/120),Math.ceil((y+1)*this.height/48),new Brush(SCMColorInt(this.colorAt(x/119,y/47))));
         if(!this.colors.length){g.pen=new Pen(0xffeeeeee);g.drawText(16,30,"Load an RGB image to build its palette");}
         if(this.pick){var px=this.pick[0]*(this.width-1),py=this.pick[1]*(this.height-1);g.pen=new Pen(0xff000000,4);g.drawRect(px-5,py-5,px+5,py+5);g.pen=new Pen(0xffffffff,1);g.drawRect(px-5,py-5,px+5,py+5);}
      }finally{g.end();}};
      picker.select=function(x,y){if(!this.colors.length)return;this.pick=[SmartTools.clamp(x/(this.width-1),0,1),SmartTools.clamp(y/(this.height-1),0,1)];self.activePalettePicker=this;self.choosePaletteColor(this.colorAt(this.pick[0],this.pick[1]));this.update();};
      picker.onMousePress=function(x,y,b){if(b!=MouseButton_Left)return;this.dragging=true;this.select(x,y);};
      picker.onMouseMove=function(x,y){if(this.dragging)this.select(x,y);};picker.onMouseRelease=function(){this.dragging=false;self.schedulePointEdit();};
      var caption=new Label(page);caption.text=title=="Image"?"Sampled image colors, sorted by hue; smooth blends between samples. White above / darker below.":"Palette colors arranged by hue; white above / darker below. Click or drag to choose.";
      page.sizer.add(picker,1);page.sizer.add(caption);self.paletteTabs.addPage(page,title);self.palettePickers.push(picker);return picker;
   }
   this.buildImagePalette=function(){
      var bins=[],planes=self.previewPlanes;if(!planes||planes.length<3)return;
      for(var i=0;i<36;i++)bins.push({rgb:[0,0,0],weight:0});
      var N=planes[0].length,step=Math.max(1,Math.floor(N/80000));
      for(var i=0;i<N;i+=step){var rgb=[planes[0][i],planes[1][i],planes[2][i]].map(function(v){return Math.max(0,Math.min(1,v));});
         if(rgb.some(function(v){return !isFinite(v);}))continue;var hsv=SCMRGBHSV(rgb);if(hsv[1]<.08||hsv[2]<1e-7)continue;
         var bin=bins[Math.min(35,Math.floor(hsv[0]*36))],w=hsv[1];bin.weight+=w;for(var c=0;c<3;c++)bin.rgb[c]+=rgb[c]*w;
      }
      var total=bins.reduce(function(a,b){return a+b.weight;},0),colors=[];
      for(var i=0;i<bins.length;i++)if(bins[i].weight>Math.max(.001,total*.002))colors.push(bins[i].rgb.map(function(v){return v/bins[i].weight;}));
      // Neutral images still get a usable grayscale picker.
      if(!colors.length)colors=[[.5,.5,.5]];
      self.imagePicker.colors=colors;self.imagePicker.pick=null;self.imagePicker.update();
   };
   palettePage("Natural",[
      ["Dusty rose",[185,119,127]],["Brick red",[164,79,64]],["Warm cream",[230,216,183]],
      ["Muted gold",[184,155,94]],["Slate blue",[105,133,163]],["Soft cyan",[126,184,190]],
      ["Terracotta",[189,122,94]],["Dust brown",[143,118,99]],["Soft peach",[218,168,140]],
      ["Steel blue",[113,150,174]],["Sage",[143,160,136]],["Warm gray",[169,161,150]]]);
   palettePage("Narrowband",[
      ["Copper",[184,113,77]],["Amber",[203,153,73]],["Pale gold",[218,199,137]],
      ["Teal",[80,151,153]],["Oxygen blue",[102,164,204]],["Soft aqua",[134,193,189]],
      ["Sulfur gold",[189,166,104]],["Hydrogen rose",[191,116,135]],["Deep blue",[79,112,173]],
      ["Burnt orange",[178,106,60]],["Pearl",[210,218,213]],["Muted violet",[146,130,175]]]);
   this.vividPage.sizer.add(this.graph);this.vividPage.sizer.addStretch();this.paletteTabs.addPage(this.vividPage,"Vivid");
   this.imagePicker=palettePage("Image",null);
   this.customPage=new Control(this.paletteTabs);this.customPage.sizer=new VerticalSizer;this.customPage.sizer.margin=10;this.customPage.sizer.spacing=8;
   this.customList=new ComboBox(this.customPage);this.customList.toolTip="Choose a saved color; browsing palette tabs retains your current replacement.";
   this.refreshCustomColors=function(){if(self.customGrid)self.customGrid.update();self.customList.clear();self.customList.addItem("Choose a saved favorite");for(var i=0;i<self.customColors.length;i++){var c=self.customColors[i];self.customList.addItem((i+1)+": RGB "+c.map(function(v){return Math.round(v*255);}).join(", "));}};
   this.customList.onItemSelected=function(i){if(i>0)guarded(function(){self.choosePaletteColor(self.customColors[i-1]);});};
   this.saveCustomColor=function(rgb){
      for(var i=0;i<self.customColors.length;i++)if(self.customColors[i].every(function(v,j){return Math.abs(v-rgb[j])<.5/255;}))return;
      if(self.customColors.length>=48){self.status.text="Custom palette is full (48 colors). Remove a favorite to make room.";return;}
      self.customColors.push(rgb.slice());Settings.write("SmartColorMapper/CustomColors",DataType_String,JSON.stringify(self.customColors));self.refreshCustomColors();
   };
   var oldParent=controlParent;controlParent=this.customPage;
   this.saveFavorite=button("Save replacement",function(){self.saveCustomColor(SCMHSV.apply(null,self.targetHSV));});
   this.sampleFavorite=button("Save sampled source",function(){var q=self.regions[self.selectedRegion]||self.regions[0];if(q&&q.mode=="color")self.saveCustomColor([q.r,q.g,q.b].map(function(v){return Math.max(0,Math.min(1,v));}));else self.status.text="Select a source color in the preview first.";});
   this.removeFavorite=button("Remove favorite",function(){var i=self.customList.currentItem-1;if(i<0)return;self.customColors.splice(i,1);Settings.write("SmartColorMapper/CustomColors",DataType_String,JSON.stringify(self.customColors));self.refreshCustomColors();});
   this.customGrid=new Control(this.customPage);this.customGrid.setFixedHeight(288);
   this.customGrid.onPaint=function(){var g=new Graphics(this);try{for(var i=0;i<48;i++){var x=(i%8)*this.width/8,y=Math.floor(i/8)*48;g.fillRect(x+3,y+3,x+this.width/8-3,y+45,new Brush(i<self.customColors.length?SCMColorInt(self.customColors[i]):0xff252525));}}finally{g.end();}};
   this.customGrid.onMousePress=function(x,y,button){if(button!=MouseButton_Left)return;var i=Math.floor(y/48)*8+Math.floor(x*8/this.width);if(i>=0&&i<self.customColors.length)guarded(function(){self.customList.currentItem=i+1;self.choosePaletteColor(self.customColors[i]);});};
   this.customPage.sizer.add(this.customGrid);this.customPage.sizer.add(this.customList);this.customPage.sizer.add(row([this.saveFavorite,this.sampleFavorite,this.removeFavorite]));this.customPage.sizer.addStretch();controlParent=oldParent;
   this.paletteTabs.addPage(this.customPage,"Custom");this.refreshCustomColors();
   this.saturation=number("Replacement saturation",0,1,1,function(v){self.targetHSV[1]=v;self.hasTarget=true;self.mappingChanged();},true);
   this.saturation.toolTip="Reduce saturation for subtler replacement colors; brightness and hue are retained.";
   // Shade now controls value independently so it does not reset saturation.
   this.shade.onValueUpdated=function(v){if(self.suspend||self.disposed)return;self.targetHSV[2]=v;self.hasTarget=true;self.mappingChanged();};
   this.right=new VerticalSizer;this.right.spacing=3;this.right.add(label("Replacement palette — click a color to select it"));this.right.add(this.paletteTabs);this.right.add(this.shade);this.right.add(this.saturation);this.right.add(this.swatchRow);this.right.add(this.strength);this.right.add(this.preserve);this.channelBar.hide();this.right.addSpacing(3);this.right.addSpacing(5);this.right.add(this.curveActions);

   this.maskPanel=new Control(this.optionsContent);this.maskPanel.sizer=new VerticalSizer;this.maskPanel.sizer.spacing=4;
   var selectionLabel=new Label(this.maskPanel);selectionLabel.text="Selection type:";
   // Reserve each action's full label width, including native button padding.
   var selectionActions=[this.clearRegions,this.removeRegion,this.exportMask];
   var selectionActionsWidth=12; // Two inter-button gaps.
   for(var sa=0;sa<selectionActions.length;sa++){
      var selectionAction=selectionActions[sa];
      var actionWidth=Math.max(190,Math.ceil(selectionAction.font.width(selectionAction.text)*1.25)+64);
      selectionAction.setFixedWidth(actionWidth);
      selectionActionsWidth+=actionWidth;
   }
   // Reserve panel margins around the action row.
   var optionsColumnWidth=Math.max(700,selectionActionsWidth+80);
   this.graph.setFixedWidth(optionsColumnWidth);
   this.optionsContent.setMinWidth(optionsColumnWidth-20);
   this.selectionTabs.setMinWidth(optionsColumnWidth);
   this.mode.hide();this.bandWidth.hide();this.low.hide();this.high.hide();this.invert.hide();this.favorFaint.hide();this.faintProtection.hide();selectionLabel.hide();this.removeRegion.hide();
   this.attachedMask.checked=false;
   var maskItems=[this.tolerance,this.connectedColor,this.faintColorReach,this.colorFeather,row([this.clearRegions,this.exportMask]),this.attachedMask];
   for(var mi=0;mi<maskItems.length;mi++)this.maskPanel.sizer.add(maskItems[mi]);
   this.optionsContent.sizer.add(this.maskPanel);this.optionsContent.sizer.addStretch();
   this.selectionTabs.addPage(this.optionsContent,"Selection");
   this.lassoPage=new Control(this.selectionTabs);controlParent=this.lassoPage;
   this.lassoKeep=new RadioButton(this.lassoPage);this.lassoKeep.text="Keep Inside";this.lassoKeep.checked=false;this.lassoKeep.toolTip="Keep the existing mask inside the lasso; remove it outside.";
   this.lassoSubtract=new RadioButton(this.lassoPage);this.lassoSubtract.text="Subtract";this.lassoSubtract.checked=true;this.lassoSubtract.toolTip="Remove the area inside the lasso from the existing mask.";
   this.lassoKeep.onCheck=function(v){if(!v)return;guarded(function(){self.lassoSubtract.checked=false;self.invalidateMask();self.refresh();});};
   this.lassoSubtract.onCheck=function(v){if(!v)return;guarded(function(){self.lassoKeep.checked=false;self.invalidateMask();self.refresh();});};
   this.lassoFeather=number("Feather (% of image short side)",0,10,1,function(){self.scheduleSelectionPreview();},true);
   this.lassoClear=button("Clear Lasso Edits",function(){self.lassoEdits=[];self.lassoPoints=[];self.lassoDraft=[];self.lassoDrawing=false;self.invalidateMask();self.preview.update();self.refresh();});
   this.lassoPage.sizer=new VerticalSizer;this.lassoPage.sizer.margin=8;this.lassoPage.sizer.spacing=8;
   var lassoItems=[row([this.lassoKeep,this.lassoSubtract]),this.lassoFeather,this.lassoClear];for(var li=0;li<lassoItems.length;li++)this.lassoPage.sizer.add(lassoItems[li]);this.lassoPage.sizer.addStretch();
   this.selectionTabs.addPage(this.lassoPage,"Lasso");this.selectionTabs.currentPageIndex=0;
   this.selectionTabs.onPageSelected=function(){self.preview.update();if(self.selectionTabs.currentPageIndex==1)self.status.text="Lasso: drag around the desired area on the image preview; release to finish.";};
   controlParent=this;this.right.addSpacing(9);this.right.add(this.selectionTabs,1);
   this.onShow=function(){self.previewZoom.plus.setFixedWidth(26);self.previewZoom.plus.setFixedHeight(26);self.previewZoom.minus.setFixedWidth(26);self.previewZoom.minus.setFixedHeight(26);self.previewZoom.update();console.writeln("[Smart Color Mapper 0.1.154] Zoom button size: "+self.previewZoom.plus.width+"x"+self.previewZoom.plus.height);};
   this.columns=new HorizontalSizer;this.columns.spacing=10;this.columns.add(this.left,1);this.optionsScroll=STScreenFit.panel(this,this.right);this.columns.add(this.optionsScroll,1);
   this.footer=new HorizontalSizer;this.footer.spacing=6;this.footer.add(this.newInstanceButton);this.footer.add(this.apply);this.footer.addStretch();
   this._stBody=new VerticalSizer;this._stBody.margin=8;this._stBody.spacing=6;this._stBody.add(this.columns,1);this._stBody.add(this.footer);this._stFooter=this.footer;
   this.maskPanel.show();
   // Native CurveType enumeration: CubicSpline=0, Linear=1, AkimaSubsplines=2.
   // Process enumeration constants are not portable as constructor properties.
   this.type=function(){return 2;}; // Fixed Akima subsplines for graph, preview and native Apply.
   this.updateCurveButtons=function(){for(var i=0;i<self.tabButtons.length;i++)self.tabButtons[i].update();};
   this.updateEnabled=function(){self.mode.currentItem=1;self.tolerance.enabled=!!(self.source&&self.source.isColor);};
   this.syncPoint=function(){if(!self.shade)return;self.suspend=true;try{self.shade.setValue(self.targetHSV[2]);if(self.saturation)self.saturation.setValue(self.targetHSV[1]);}finally{self.suspend=false;}};
   this.movePoint=function(){};
   this.updateGraph=function(){for(var pi=0;pi<self.palettePickers.length;pi++){var pk=self.palettePickers[pi];if(pk!=self.activePalettePicker)pk.pick=null;pk.update();}self.graph.update();if(self.swatches)self.swatches.update();};
   this.mappingChanged=function(){self.syncPoint();self.showingMask=false;self.maskButton.text="Show Mask";self.changesOn=true;self.toggleChanges.text="Toggle Changes (On)";self.updateGraph();self.schedulePointEdit();};
   this.curveChanged=function(){self.dragPreviewTimer.stop();self.dragPreviewPending=false;var start=SmartTools.now();self.syncPoint();self.updateGraph();if(self.live.checked)self.refresh();console.writeln("[Smart Color Mapper] Curve edit total (graph + preview): "+SmartTools.elapsed(start));};
   // Throttle rather than debounce: continuous motion still produces frames.
   // Keep only the latest point; never build a queue of obsolete image renders.
   this.scheduleDragPreview=function(){if(self.disposed||self.dragPreviewPending)return;
      if(!self.live.checked&&!self.graph.dragging&&!self.dragPosition&&!self.dragReleasePending)return;
      self.dragPreviewPending=true;self.dragPreviewTimer.start();
   };
   this.dragPreviewTimer.onTimeout=function(){self.dragPreviewPending=false;if(self.disposed)return;
      if(self.busy){self.scheduleDragPreview();return;}
      guarded(function(){if(self.dragReleasePending){self.endCurveDrag();return;}if(self.dragPosition){self.movePoint(self.dragPosition);self.dragPosition=null;}self.updateGraph();
         if(self.live.checked)self.refresh();
      });
   };
   // Slider input must not synchronously rebuild native masks: retain the latest
   // value and render once motion pauses. Existing numeric edit focus semantics remain.
   this.scheduleSelectionPreview=function(){if(self.disposed)return;self.selectionPreviewTimer.stop();self.selectionPreviewTimer.start();};
   this.selectionPreviewTimer.onTimeout=function(){if(self.disposed)return;
      if(self.busy){self.scheduleSelectionPreview();return;}
      guarded(function(){var t=SmartTools.now();self.invalidateMask();self.syncRegion(false);self.refresh();
         console.writeln("[Smart Color Mapper] Selection edit mask / preview total: "+SmartTools.elapsed(t));});
   };
   this.setClickRange=function(v){var q=self.regions[self.selectedRegion];
      if(q&&q.mode=="signal"){q.width=v;q.lo=Math.max(0,q.center-v);q.hi=Math.min(1,q.center+v);self.scheduleSelectionPreview();}
      else self.status.text="Click Range sets the width of the next signal pick. Click the image to select a signal.";
   };
   this.invalidateMask=function(){self.connectedGrid=null;self.previewWeights=null;self.previewAttached=null;self.previewMaskValid=false;if(self.maskCache){self.maskCache.free();self.maskCache=null;}};
   this.syncRegion=function(rebuild){
      self.suspend=true;try{
         var q=self.regions[self.selectedRegion],signal=q&&q.mode=="signal";self.low.enabled=!!signal;self.high.enabled=!!signal;
         if(signal){self.low.setValue(q.lo);self.high.setValue(q.hi);self.bandWidth.setValue(q.width);}if(q&&q.mode=="color")self.tolerance.setValue(q.tolerance);
      }finally{self.suspend=false;}
      var ranges=[];for(var ri=0;ri<self.regions.length;ri++){var r=self.regions[ri];if(r.mode=="signal")ranges.push({center:r.center,low:r.lo,high:r.hi,type:"signal"});}
      self.histogram.setRanges(ranges);
   };
   this.editRegion=function(key,v){var q=self.regions[self.selectedRegion];if(q&&q.mode=="signal"){
      var lo=key=="lo"?v:q.lo,hi=key=="hi"?v:q.hi;
      if(hi<=lo){self.syncRegion(false);throw new Error("Region high must exceed low");}q[key]=v;q.center=(q.lo+q.hi)/2;q.width=(q.hi-q.lo)/2;self.invalidateMask();self.syncRegion(false);self.refresh();}
   };
   this.resetSelectionState=function(){
      self.selectionPreviewTimer.stop();self.lassoEdits=[];self.lassoPoints=[];self.lassoDraft=[];self.lassoDrawing=false;
      self.restoreMaskAfterDrag=false;self.lassoRestoreMask=false;self.dragReleasePending=false;
      self.invert.checked=false;self.showingMask=false;self.maskButton.text="Show Mask";
      self.pickX=-1;self.pickY=-1;self.selectedRegion=-1;self.invalidateMask();
   };
   this.load=function(view){self.resetSelectionState();if(view&&!view.isNull&&(!view.image.isColor||view.image.numberOfChannels!=3))throw new Error("Smart Color Mapper requires an RGB image without alpha channels");if(!view||view.isNull)throw new Error("Selected image is unavailable");
      if(self.source)self.source.free();if(self.previewSource)self.previewSource.free();
      self.invalidateMask();SmartTools.closeWindowPool(self.previewPool);self.previewOriginalReady=false;self.previewWorkUses=0;self.view=view;self.source=new Image(view.image);self.faintAnchors=SCMMeasureFaintAnchors(self.source);self.previewSource=self.makePreviewSource(self.source);self.previewPlanes=[];for(var pc=0;pc<self.previewSource.numberOfChannels;pc++)self.previewPlanes.push(SmartTools.readPlane(self.previewSource,pc));
      self.buildImagePalette();
      self.histogram.setHistogram(SmartTools.histogram(self.previewSource,65536,"RGBK"),true);
      self.lassoEdits=[];self.lassoPoints=[];self.lassoDraft=[];self.lassoDrawing=false;self.regions=[];self.selectedRegion=-1;self.pickX=-1;self.pickY=-1;self.syncRegion();if(!self.source.isColor){self.channel=3;self.selectedChannels=[3];self.point=0;}
      self.updateEnabled();self.updateCurveButtons();self.syncPoint();self.updateGraph();self.showingMask=false;self.refresh();
      self.status.text="Loaded "+view.id+". Click the preview to pick one source color. Show Mask displays affected areas in magenta.";
   };
   this.makePreviewSource=function(source){var t=SmartTools.now(),scale=Math.min(1,SmartTools.previewWidth/source.width,SmartTools.previewHeight/source.height);
      self.previewDisplayWidth=Math.max(1,Math.floor(source.width*scale));self.previewDisplayHeight=Math.max(1,Math.floor(source.height*scale));
      var pw=Math.max(1,Math.floor(self.previewDisplayWidth/2)),ph=Math.max(1,Math.floor(self.previewDisplayHeight*pw/self.previewDisplayWidth));
      var reduced=new Image(source);if(pw!=source.width||ph!=source.height)reduced.resample(pw/source.width);
      console.writeln("[Smart Color Mapper] Preview baseline reduction: "+SmartTools.elapsed(t)+"; working="+reduced.width+"x"+reduced.height+"; fitted display="+self.previewDisplayWidth+"x"+self.previewDisplayHeight);return reduced;
   };
   this.attachedMaskKey=function(){var w=self.view.window,m=w.mask;
      if(!self.attachedMask.checked||!w.maskEnabled||!m||m.isNull)return "none";
      var im=m.mainView.image;return [m.mainView.id,w.maskInverted,im.width,im.height,im.numberOfChannels,im.bitsPerSample].join("|");
   };
   this.needsMask=function(){return self.lassoEdits.length>0||self.regions.length>0||self.invert.checked||self.favorFaint.checked||self.attachedMaskKey()!="none";};
   // Curve edits reuse the original-source mask. Refresh Preview explicitly
   // invalidates it, including edits made externally to an attached mask.
   // Full Apply always rebuilds the live mask through the original path.
   this.getConnectedGrid=function(){if(!self.connectedColor.checked||!self.source||!self.source.isColor)return null;var key=JSON.stringify([self.regions,self.faintColorReach.value]);if(!self.connectedGrid||self.connectedGridKey!=key){self.connectedGrid=SCCBuild(self.source,self.regions,self.faintColorReach.value);self.connectedGridKey=key;}return self.connectedGrid;};
   this.getPreviewWeights=function(){var key=self.attachedMaskKey();if(self.previewWeights&&key==self.previewMaskKey)return self.previewWeights;
      var N=self.previewSource.width*self.previewSource.height,C=self.previewSource.numberOfChannels,attached=null,aw=[],result=[],connected=self.getConnectedGrid();
      try{if(key!="none"){attached=new Image(self.view.window.mask.mainView.image);if(attached.width!=self.source.width||attached.height!=self.source.height)throw new Error("Attached mask dimensions differ from source");attached.resample(self.previewSource.width/attached.width);if(attached.width!=self.previewSource.width||attached.height!=self.previewSource.height)throw new Error("Preview attached-mask geometry mismatch");for(var c=0;c<attached.numberOfChannels;c++)aw.push(SmartTools.readPlane(attached,c));}
       for(var i=0;i<N;i++){var rgb=C==3?[self.previewPlanes[0][i],self.previewPlanes[1][i],self.previewPlanes[2][i]]:[self.previewPlanes[0][i]],w=SCMPreviewWeight(rgb,self.regions,false,C==3);w=Math.max(w,SCCSample(connected,i%self.previewSource.width,Math.floor(i/self.previewSource.width),self.previewSource.width,self.previewSource.height));if(self.invert.checked)w=1-w;for(var c=0;c<C;c++){if(!result[c])result[c]=[];var a=aw.length?aw[Math.min(c,aw.length-1)][i]:1;if(aw.length&&self.view.window.maskInverted)a=1-a;var strength=w*a;result[c][i]=strength;}}
       if(self.lassoEdits.length>0){var spatial=SCMLassoEditsRaster(self.lassoEdits,self.previewSource.width,self.previewSource.height,self.lassoFeather.value);for(var c=0;c<C;c++)for(var i=0;i<N;i++)result[c][i]*=spatial[i];}
       if(self.favorFaint.checked){var anchors=self.faintAnchors;for(var i=0;i<N;i++){var peak=0;for(var c=0;c<C;c++)peak=Math.max(peak,self.previewPlanes[c][i]);var gain=SCMFaintWeight(peak,self.faintProtection.value,anchors);for(var c=0;c<C;c++)result[c][i]*=gain;}console.writeln("[Smart Color Mapper Faint] Preview anchors="+anchors.low+" / "+anchors.high);}
       self.previewMaskKey=key;self.previewWeights=result;return result;
      }finally{if(attached)attached.free();}
   };
   this.showImage=function(im,original,mask){var t=SmartTools.now(),tmp=null;
      self.displayImage=im; // Borrowed from a dialog-owned source or pooled window.
      console.writeln("[Smart Color Mapper] Display reference (no snapshot copy): "+SmartTools.elapsed(t));t=SmartTools.now();
      try{var scale=Math.min(self.previewDisplayWidth/im.width,self.previewDisplayHeight/im.height);
         if(Math.abs(scale-1)>1e-8){tmp=new Image(im);tmp.resample(scale);}self.bitmap=(tmp||im).render();
         self.bitmapX=0;self.bitmapY=0;self.previewZoom.update();
      }finally{if(tmp)tmp.free();}self.displayIsOriginal=original;self.showingMask=mask===true;self.maskButton.text=self.showingMask?"Hide Mask":"Show Mask";self.preview.update();
      console.writeln("[Smart Color Mapper] Display fit / bitmap render: "+SmartTools.elapsed(t));
   };
   this.showMask=function(){if(!self.previewSource)return;var weights=self.getPreviewWeights(),C=self.previewSource.numberOfChannels;if(!self.previewOverlay)self.previewOverlay=new Image(self.previewSource.width,self.previewSource.height,3,ColorSpace_RGB);for(var c=0;c<3;c++){var plane=[],src=self.previewPlanes[Math.min(c,C-1)],w=weights[Math.min(c,C-1)];for(var i=0;i<src.length;i++)plane.push(src[i]*(1-.55*w[i])+(c==1?0:.55*w[i]));SmartTools.writePlane(self.previewOverlay,plane,c);}self.showImage(self.previewOverlay,false,true);self.status.text="Mask overlay shown; selection remains active when hidden.";};
   this.buildMask=function(source,full,originalWindow){
      var start=SmartTools.now(),src=null,m=null,aux=null,lasso=null;
      var attachedLive=self.attachedMask.checked&&self.view.window.maskEnabled&&self.view.window.mask&&!self.view.window.mask.isNull;
      
      try{src=originalWindow||SCMCopyWindow(source,"SmartColorMapper_MaskSource");var mw=self.view.window;var mc=self.attachedMask.checked&&mw.maskEnabled&&mw.mask&&!mw.mask.isNull&&mw.mask.mainView.image.isColor?3:1;m=new ImageWindow(source.width,source.height,mc,32,true,mc==3,"SmartColorMapper_Mask");m.hide();
         var connected=self.getConnectedGrid();var spec=SCMSelectionPixelMath(src.mainView.id,source.isColor,self.regions,connected?false:self.invert.checked);SCMPixelMath(m.mainView,spec);if(connected)SCCApply(m.mainView,connected,self.invert.checked);
         var win=self.view.window;
         if(self.attachedMask.checked&&win.maskEnabled&&win.mask&&!win.mask.isNull){
            var attached=win.mask.mainView.image;{
               if(attached.width!=self.source.width||attached.height!=self.source.height)throw new Error("Attached mask dimensions differ from source");
               aux=SCMCopyWindow(attached,"SmartColorMapper_AttachedMask");SCMResizeWindow(aux,source.width,source.height);
            }
            var aid=aux.mainView.id,am=aid;
            SCMPixelMath(m.mainView,{expression:"$T*"+(win.maskInverted?"(1-"+am+")":am)});aux.forceClose();aux=null;
         }
         if(self.lassoEdits.length>0){var scale=Math.min(1,1600/source.width,1600/source.height),lw=Math.max(1,Math.round(source.width*scale)),lh=Math.max(1,Math.round(source.height*scale));lasso=new ImageWindow(lw,lh,1,32,true,false,"SmartColorMapper_Lasso");lasso.hide();var lassoView=lasso.mainView;SmartTools.beginPrivateProcess(lassoView);try{SmartTools.writePlane(lassoView.image,SCMLassoEditsRaster(self.lassoEdits,lw,lh,self.lassoFeather.value),0);}finally{lassoView.endProcess();}SCMResizeWindow(lasso,source.width,source.height);SCMPixelMath(m.mainView,{expression:"$T*min(1,max(0,"+lasso.mainView.id+"))"});lasso.forceClose();lasso=null;}
         if(self.favorFaint.checked){var anchors=self.faintAnchors;console.writeln("[Smart Color Mapper Faint] Full anchors="+anchors.low+" / "+anchors.high);SCMPixelMath(m.mainView,SCMFaintExpression(src.mainView.id,source.isColor,self.faintProtection.value,anchors));}
         console.writeln("[Smart Color Mapper] "+(full?"Full":"Preview")+" mask build: "+SmartTools.elapsed(start));var out=m;m=null;return out;
      }finally{if(src&&!originalWindow)src.forceClose();if(lasso)lasso.forceClose();if(aux)aux.forceClose();if(m)m.forceClose();}
   };
   this.mapPlanes=function(source,planes,weights){
      var target=SCMHSV.apply(null,self.targetHSV),N=source.width*source.height,out=[new Float64Array(N),new Float64Array(N),new Float64Array(N)],amount=self.strength.value,preserve=self.preserve.checked;
      var ty=.2126*target[0]+.7152*target[1]+.0722*target[2],dr=target[0]-ty,dg=target[1]-ty,db=target[2]-ty;
      var wr=weights?weights[0]:null,wg=weights?weights[Math.min(1,weights.length-1)]:null,wb=weights?weights[Math.min(2,weights.length-1)]:null;
      var full=source!==self.previewSource,changed=0;
      for(var i=0;i<N;i++){
         var r=planes[0][i],g=planes[1][i],b=planes[2][i],ar=wr?wr[i]*amount:0,ag=wg?wg[i]*amount:0,ab=wb?wb[i]*amount:0;
         if(ar==0&&ag==0&&ab==0){out[0][i]=r;out[1][i]=g;out[2][i]=b;continue;}
         var mr=target[0],mg=target[1],mb=target[2];
         if(preserve){var y=.2126*r+.7152*g+.0722*b,k=1;
            if(dr>0)k=Math.min(k,(1-y)/dr);else if(dr<0)k=Math.min(k,-y/dr);
            if(dg>0)k=Math.min(k,(1-y)/dg);else if(dg<0)k=Math.min(k,-y/dg);
            if(db>0)k=Math.min(k,(1-y)/db);else if(db<0)k=Math.min(k,-y/db);
            k=Math.max(0,k);mr=y+k*dr;mg=y+k*dg;mb=y+k*db;
         }
         out[0][i]=r+(mr-r)*ar;out[1][i]=g+(mg-g)*ag;out[2][i]=b+(mb-b)*ab;changed++;
      }
      if(full&&!self.tiledMapping)console.writeln("[Smart Color Mapper Apply] Mapped "+changed+" / "+N+" pixels; protected pixels copied unchanged.");
      return out;
   };
   this.transformPreview=function(){var src=self.previewSource,planes=self.mapPlanes(src,self.previewPlanes,self.getPreviewWeights());
      if(!self.previewResult)self.previewResult=new Image(src);for(var c=0;c<3;c++)SmartTools.writePlane(self.previewResult,planes[c],c);return {mainView:{image:self.previewResult}};
   };
   this.transform=function(source,full){if(!full)return self.transformPreview();var mask=null,work=null,stage;
      try{
         mask=self.buildMask(source,true,null);
         stage=SmartTools.now();work=SCMCopyWindow(source,"SmartColorMapper_Result");
         console.writeln("[Smart Color Mapper Apply] Result buffer copy: "+SmartTools.elapsed(stage));
         var readMS=0,mapMS=0,writeMS=0,tileRows=128,H=source.height,W=source.width;
         // Keep the exact View object that opens each private transaction.
         // Yield to the interface only after the strip transaction has closed.
         var workView=work.mainView,maskView=mask.mainView;
         self.tiledMapping=true;
         try{for(var y=0;y<H;y+=tileRows){var rows=Math.min(tileRows,H-y),rect=new Rect(0,y,W,y+rows),planes=[],weights=[];
            stage=SmartTools.now();for(var c=0;c<3;c++)planes.push(SCMReadTile(source,rect,c));for(var c=0;c<maskView.image.numberOfChannels;c++)weights.push(SCMReadTile(maskView.image,rect,c));readMS+=SmartTools.now()-stage;
            stage=SmartTools.now();var mapped=self.mapPlanes({width:W,height:rows},planes,weights);mapMS+=SmartTools.now()-stage;
            stage=SmartTools.now();SmartTools.beginPrivateProcess(workView);
            try{for(var c=0;c<3;c++)workView.image.setSamples(mapped[c],rect,c);}finally{workView.endProcess();}
            writeMS+=SmartTools.now()-stage;
            if(typeof processEvents=="function")processEvents();
         }}finally{self.tiledMapping=false;}
         console.writeln("[Smart Color Mapper Apply] Tile reads: "+(readMS/1000).toFixed(2)+" s | mapping: "+(mapMS/1000).toFixed(2)+" s | writes: "+(writeMS/1000).toFixed(2)+" s | strip rows="+tileRows);
         SCMValidate(work.mainView.image,source);var result=work;work=null;return result;
      }finally{self.tiledMapping=false;if(mask)mask.forceClose();if(work)work.forceClose();}
   };
   this.refresh=function(){if(!self.previewSource)return;if(!self.changesOn&&!self.showingMask){self.showImage(self.previewSource,true,false);self.status.text="Changes hidden; original pixels displayed. Curve settings and selections are retained.";return;}if(self.showingMask){self.showMask();return;}var t=SmartTools.now(),w=null;
      try{w=self.transform(self.previewSource,false);self.showImage(w.mainView.image,false);self.status.text="Color mapping preview. Full-resolution Apply uses the same mapping math. Selections use original pixels.";}
      finally{console.writeln("[Smart Color Mapper] Preview total: "+SmartTools.elapsed(t));}
   };
   this.applyFull=function(){self.selectionPreviewTimer.stop();if(!self.regions.length)throw new Error("Click a source color in the preview first");self.invalidateMask();if(!self.view||self.view.isNull||!self.source)throw new Error("Select an image first");
      // Rebuild baseline from the live image at Apply; external changes are not overwritten.
      var t=SmartTools.now(),work=null,live=null,targetView=self.view,applyStage="source snapshot";self.enabled=false;self.dragPreviewTimer.stop();self.pointEditTimer.stop();
      try{SATRunProgress('Smart Color Mapper — Applying',function(report){live=new Image(self.view.image);if(live.width!=self.source.width||live.height!=self.source.height||live.numberOfChannels!=self.source.numberOfChannels)throw new Error("Image geometry changed: Reload image first");
         applyStage="full-resolution mapping";report(20,"Mapping colors");work=self.transform(live,true);var write=SmartTools.now();applyStage="target commit";report(80,"Writing the result");targetView.beginProcess();try{targetView.image.assign(work.mainView.image);}finally{targetView.endProcess();}
         applyStage="display reset";SmartTools.resetViewSTF(targetView);console.writeln("[Smart Color Mapper] Target transaction / STF reset: "+SmartTools.elapsed(write));
         applyStage="preview reload";report(95,"Reloading preview");var reloadStart=SmartTools.now();console.writeln("[Smart Color Mapper Apply] Reload preview BEGIN");self.load(targetView);console.writeln("[Smart Color Mapper Apply] Reload preview: "+SmartTools.elapsed(reloadStart));self.status.text="Apply complete (Undo available). Mapping settings retained; selections cleared for the new baseline.";
         console.writeln("[Smart Color Mapper] Apply total: "+SmartTools.elapsed(t));
      });}catch(e){throw new Error("Apply failed during "+applyStage+": "+String(e));}finally{if(live)live.free();if(work)work.forceClose();self.enabled=true;}
   };
   this.captureInstance=function(){return {schema:1,paletteTab:self.paletteTabs.currentPageIndex,customColors:self.customColors,connectedColor:self.connectedColor.checked,faintColorReach:self.faintColorReach.value,colorFeather:self.colorFeather.value,targetHSV:self.targetHSV,hasTarget:self.hasTarget,strength:self.strength.value,preserve:self.preserve.checked,viewId:self.view&&!self.view.isNull?self.view.id:"",curves:self.curves,channel:self.channel,selectedChannels:self.selectedChannels,regions:self.regions,selectedRegion:self.selectedRegion,lassoEdits:self.lassoEdits,lassoKeep:self.lassoKeep.checked,lassoFeather:self.lassoFeather.value,invert:self.invert.checked,favorFaint:self.favorFaint.checked,faintProtection:self.faintProtection.value,attachedMask:self.attachedMask.checked,selectionMode:self.mode.currentItem,clickRange:self.bandWidth.value,tolerance:self.tolerance.value};};
   this.restoreInstance=function(state){
      if(!state||state.schema!==1||!state.curves||(state.curves.length!==5&&state.curves.length!==8))throw new Error("Invalid Smart Color Mapper instance settings");
      if(!state.targetHSV||state.targetHSV.length!=3||state.targetHSV.some(function(v){return !isFinite(v)||v<0||v>1;}))throw new Error("Invalid replacement color");
      if(validColors(state.customColors)){self.customColors=state.customColors.map(function(c){return c.slice();});self.refreshCustomColors();}
      if(typeof state.paletteTab=="number"&&state.paletteTab>=0&&state.paletteTab<5)self.paletteTabs.currentPageIndex=Math.floor(state.paletteTab);
      self.targetHSV=state.targetHSV.slice();self.hasTarget=!!state.hasTarget;self.suspend=true;try{self.connectedColor.checked=state.connectedColor===true;self.faintColorReach.setValue(typeof state.faintColorReach=="number"&&isFinite(state.faintColorReach)?Math.max(0,Math.min(1,state.faintColorReach)):.5);self.faintColorReach.enabled=self.connectedColor.checked;self.strength.setValue(state.strength);self.preserve.checked=!!state.preserve;}finally{self.suspend=false;}
      // Validate stored state before changing dialog state.
      SCMCurves(state.curves,2);
      self.curves=state.curves.slice();while(self.curves.length<8)self.curves.push([[0,0],[1,1]]);
      self.channel=Math.max(0,Math.min(7,state.channel));
      self.selectedChannels=self.channel==5?[0,1]:self.channel==6?[0,2]:self.channel==7?[1,2]:[self.channel];self.point=0;
      self.regions=state.regions||[];var cf=typeof state.colorFeather=="number"?SmartTools.clamp(state.colorFeather,0,1):1;self.suspend=true;try{self.colorFeather.setValue(cf);}finally{self.suspend=false;}for(var fi=0;fi<self.regions.length;fi++)self.regions[fi].edgeFeather=cf;self.selectedRegion=Math.max(-1,Math.min(self.regions.length-1,state.selectedRegion));
      self.lassoEdits=state.lassoEdits||[];self.lassoPoints=[];self.lassoDraft=[];self.lassoDrawing=false;
      self.suspend=true;try{self.lassoKeep.checked=!!state.lassoKeep;self.lassoSubtract.checked=!state.lassoKeep;self.lassoFeather.setValue(state.lassoFeather);self.invert.checked=!!state.invert;self.favorFaint.checked=!!state.favorFaint;self.faintProtection.setValue(state.faintProtection);self.faintProtection.enabled=!!state.favorFaint;self.attachedMask.checked=!!state.attachedMask;self.mode.currentItem=1;self.bandWidth.setValue(state.clickRange);self.tolerance.setValue(state.tolerance);}finally{self.suspend=false;}
      self.selectionPreviewTimer.stop();self.invalidateMask();self.syncRegion();self.syncPoint();self.updateEnabled();self.updateCurveButtons();self.updateGraph();self.refresh();
   };
   this.dispose=function(){if(self.disposed)return;self.disposed=true;self.pointEditTimer.stop();self.selectionPreviewTimer.stop();self.dragPreviewTimer.stop();self.dragPreviewPending=false;self.dragPosition=null;self.busy=true;var total=SmartTools.now();
      console.writeln("[Smart Color Mapper Close] BEGIN");self.displayImage=null;self.bitmap=null;self.histogram.bins=[];self.histogram.ranges=[];self.graphTable=[];self.graphTables=[[],[],[],[],[]];self.graphKeys=["","","","",""];
      var pools=[self.previewPool,self.graphPool];for(var pi=0;pi<pools.length;pi++)for(var key in pools[pi])if(pools[pi].hasOwnProperty(key)){
         var t=SmartTools.now();console.writeln("[Smart Color Mapper Close] Releasing "+key+" BEGIN");try{pools[pi][key].window.forceClose();}catch(e){console.warningln("[Smart Color Mapper Close] "+key+": "+e);}delete pools[pi][key];
         console.writeln("[Smart Color Mapper Close] "+key+": "+SmartTools.elapsed(t));if(typeof processEvents=="function")processEvents();}
      self.lassoEdits=[];self.lassoPoints=[];self.lassoDraft=[];self.previewPlanes=null;self.previewWeights=null;var names=["previewResult","previewOverlay","source","previewSource","maskCache","graphRamp"];
      for(var i=0;i<names.length;i++){var t=SmartTools.now();console.writeln("[Smart Color Mapper Close] Releasing "+names[i]+" BEGIN");if(self[names[i]]){try{self[names[i]].free();}catch(e){console.warningln("[Smart Color Mapper Close] "+names[i]+": "+e);}self[names[i]]=null;}
         console.writeln("[Smart Color Mapper Close] release "+names[i]+": "+SmartTools.elapsed(t));}
      self.displayImage=null;self.views=[];self.view=null;self.regions=[];console.writeln("[Smart Color Mapper Close] TOTAL: "+SmartTools.elapsed(total));
   };
   // Set help on the whole numeric control and on each hoverable child.
   function tip(control,text,numeric){control.toolTip=text;if(numeric){control.slider.toolTip=text;control.edit.toolTip=text;control.label.toolTip=text;}}
   tip(this.imageList,"Choose the open image to edit. Loading an image rebuilds the preview and clears its signal/color selections and lasso edits.");
   tip(this.reload,"Reload the selected source image after external edits. Clears selections and lasso edits while retaining your curves.");
   tip(this.preview,"Selection tab: normal click starts a new source-color selection and initializes its replacement. Ctrl-click toggles source colors while keeping one shared replacement; matching source colors are removed when clicked again. Lasso tab: drag to draw a closed mask edit. Use the mouse wheel to zoom and the scrollbars to pan.");
   tip(this.previewScroll,"Image preview. Use the mouse wheel or +/− buttons to zoom; scrollbars pan the zoomed image. Zoom does not change processing resolution.");
   tip(this.electricBlue,"Select our Electric Blue preset (#00A8FF), updating the rainbow marker, replacement swatch and shade. Color tolerance, feathering and mapping strength stay unchanged.");
   tip(this.graph,"Click or drag: hue runs across. The upper half mixes white into the color; the middle is pure saturated color; the lower half adds black. Picking updates the replacement shade slider. Preserve brightness still controls whether image luminosity can change.");
   tip(this.shade,"Travel along the selected hue column: 0 is black, 0.5 is pure saturated color, and 1 is white. The rainbow marker follows. Preserve brightness retains source luminosity while changing color.",true);
   tip(this.strength,"Blend amount toward the replacement color inside the mask. Zero leaves the image unchanged.",true);
   tip(this.preserve,"Keep each pixel’s Rec.709 luminance and compress out-of-gamut colors toward neutral gray.");
   tip(this.input,"Original input level of the selected curve point, from 0 (black) to 1 (white). Moving this value changes the point horizontally.",true);
   tip(this.output,"Resulting output level of the selected curve point, from 0 to 1. Raise it to brighten that input level; lower it to darken it.",true);
   tip(this.reset,"Set the replacement color to the sampled source color.");
   tip(this.resetAll,"Reset replacement color, mapping strength and brightness preservation. Retains the selected source color and lasso edits.");
   tip(this.live,"Update the reduced image preview while editing curves. Full-resolution processing happens when you click the bottom-left Apply rectangle.");
   tip(this.mode,"Choose whether preview clicks select a brightness range or similar normalized RGB colors. Ctrl-click toggles matching selections or adds new ones; signal selections can also be picked in the histogram.");
   tip(this.bandWidth,"Half-width of a signal selection: picked signal plus or minus this amount. Updates the active signal range, or sets the width for the next pick when none is selected.",true);
   tip(this.colorFeather,"Softness of the color-selection boundary inside Color Tolerance. 0 gives a hard cutoff; 1 fades smoothly across the full tolerance range. The mask shows the blend weights. Separate from lasso feathering.",true);
   tip(this.tolerance,"How different a color may be from the picked color and remain selected. Higher values include more colors; lower values isolate a narrower color range.",true);
   tip(this.low,"Lowest signal value in the active signal selection. The upper limit must remain greater than this value.",true);
   tip(this.high,"Highest signal value in the active signal selection. The lower limit must remain smaller than this value.",true);
   tip(this.invert,"Reverse the signal/color selection: previously selected tones become protected and previously protected tones become selected. Lasso edits and an attached mask are then applied.");
   tip(this.favorFaint,"Reduce curve strength in bright selected areas while retaining more strength in faint areas. Brightness is measured from the original image; this does not expand the selection.");
   tip(this.faintProtection,"Strength of Favor faint areas. 0 disables bright-area protection; 1 fully protects the brightest tones. Uses fixed source-image brightness measurements, so changing Click Range does not shift the protection thresholds.",true);
   tip(this.clearRegions,"Clear all signal/color selections and accumulated lasso edits, and turn off inversion. Retains curves. Without a picked source color, the mask is empty and no pixels are changed.");
   tip(this.removeRegion,"Remove the active signal/color selection. Retains other selections, lasso edits and curves.");
   tip(this.reload,"Reload the source image and clear all curves, selections, lasso edits and mask effects. Disables use of the attached image mask.");
   tip(this.attachedMask,"Combine the generated selection with the source image’s enabled attached mask. Both masks must allow a pixel for the curves to affect it.");
   tip(this.exportMask,"Create a separate full-resolution mask image from the current selections, lasso edits, faint protection and enabled attached mask.");
   tip(this.newInstanceButton,"Drag the triangle onto the workspace to create a reusable Smart Color Mapper script instance containing curves, selections, lasso edits and mask settings.");
   tip(this.apply,"Apply the current curves and mask to the source image at full resolution. PixInsight Undo is available. The updated image becomes the new preview baseline.");
   tip(this.zoomHistogram,"Zoom the histogram to its meaningful occupied signal range. Changes only the histogram display, not the image or selection values.");
   tip(this.resetHistogram,"Show the histogram’s full 0–1 signal range. Does not alter the image or selections.");
   tip(this.toggleChanges,"Compare adjusted and original image previews. Off displays the original; On displays the adjusted result. Curves and selections are retained; Apply still uses the curves.");
   tip(this.maskButton,"Show or hide the magenta selection overlay. Stronger magenta means greater curve influence. Hiding the overlay does not disable the mask.");
   tip(this.selectionTabs,"Selection: choose signal or color regions. Lasso: refine the mask by drawing spatial outlines on the image preview.");
   tip(this.lassoPage,"With this tab selected, drag on the preview to draw an outline and release to close it. Each completed outline adds another mask edit.");
   tip(this.lassoKeep,"For the next outline, keep the existing mask inside the lasso and remove it outside. Earlier lasso edits remain accumulated.");
   tip(this.lassoSubtract,"For the next outline, remove the area inside the lasso from the existing mask. Earlier lasso edits remain accumulated.");
   tip(this.lassoFeather,"Soften lasso boundaries. Value is a percentage of the image’s shorter side: 0 gives a hard edge; larger values create a wider transition.",true);
   tip(this.lassoClear,"Remove all accumulated lasso edits and outlines. Retains signal/color selections, curves and other mask options.");

   tip(this.previewZoom.plus,"Zoom into the image preview, keeping the viewed area centered where possible. Mouse wheel up also zooms in.");
   tip(this.previewZoom.minus,"Zoom out of the image preview, down to fit-to-window. Mouse wheel down also zooms out.");
   this.previewZoom.install();
   this.syncPoint();this.syncRegion();this.updateEnabled();this.updateCurveButtons();this.updateGraph();
   if(initialView&&!initialView.isNull){this.load(initialView);for(var vi=0;vi<this.views.length;vi++)if(this.views[vi].id==initialView.id)this.imageList.currentItem=vi+1;}
   else if(initialWindow&&!initialWindow.isNull){for(var vi=0;vi<this.views.length;vi++)if(this.views[vi].id==initialWindow.mainView.id){this.imageList.currentItem=vi+1;this.load(this.views[vi]);break;}}
   STScreenFit.adjust(this);
}
SCMDialog.prototype=new Dialog;
function SCMMain(){
   console.show();console.writeln("[Smart Color Mapper] Build "+SCM_VERSION+" | reduced preview / full-resolution color mapping");
   var state=Parameters.has("scmState")?JSON.parse(Parameters.getString("scmState")):null;
   var target=Parameters.isViewTarget?Parameters.targetView:null;
   if(!target&&state&&state.viewId){var savedView=View.viewById(state.viewId);if(savedView&&!savedView.isNull)target=savedView;}
   var d=new SCMDialog(target);try{if(state)d.restoreInstance(state);if(Parameters.isViewTarget)d.applyFull();else STScreenFit.execute(d);}finally{d.dispose();d=null;}
}
SCMMain();
