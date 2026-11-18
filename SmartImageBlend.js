// Standalone PixInsight script. Rename SmartImageBlend.txt to SmartImageBlend.js before running.
#feature-id SmartSuite > Smart Image Blend
#feature-info Blend two images with independent strengths and an output-only preview.
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
#include <pjsr/NumericControl.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>

/* Smart Tools screen fitting 1.0.1 (2026-10-30).
 * All geometry stays in native Control pixels. Do not divide screen geometry
 * by the DPI ratio: availableScreenRect and Control dimensions share units.
 * Preview display sizes change; processing constants and recipes do not.
 */
var STScreenFit = typeof STScreenFit === "undefined" ? {} : STScreenFit;
STScreenFit.version = "1.0.1";
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
// A real child control holds the layout. The viewport itself has no sizer,
// so its document's minimum dimensions never force the outer window larger.
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
   if(typeof console!="undefined" && console.writeln)
      console.writeln("[Smart Tools Screen Fit 1.0.1] "+Math.round(b.width)+"x"+Math.round(b.height)+" available; window "+d.width+"x"+d.height+(b.fallback?" (conservative fallback)":""));
};
// Constructors build _stBody without assigning it to a native control. These
// entry points install the completed body before layout or modeless display.
STScreenFit.adjust = function(d){
   if(d instanceof Dialog && d._stBody){
      STScreenFit.install(d);
      d.ensureLayoutUpdated();STScreenFit.limit(d,false);
      return d;
   }
   return d.adjustToContents();
};
STScreenFit.show = function(d){
   if(d instanceof Dialog)STScreenFit.install(d);
   return d.show();
};
STScreenFit.execute = function(d){
   if(d instanceof Dialog)STScreenFit.install(d);
   return d.execute();
};

// Smart Image Blend 1.2.2 - PixInsight PJSR
// Rename SmartImageBlend.txt to SmartImageBlend.js before running.
// Registered, equally sized monochrome or RGB inputs are required.
// Weighted average or luminance-linked Favor Bright Data blending.

// HaRGB: enhance red with positive Ha excess. Green and blue are copied exactly.
// Background matching is an offset, not continuum subtraction or flux calibration.
function SIBHaRed(red,ha,strength,gain,offset) {
   var excess=Math.max(0,gain*ha+offset-red),headroom=Math.max(0,1-red);
   if(strength<=0 || excess<=0 || headroom<=0)return red;
   return red+headroom*(1-Math.exp(-strength*excess/Math.max(1e-12,headroom)));
}
function SIBMedian(values) {
   values.sort(function(a,b){return a-b;});
   var n=values.length;return n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2;
}
function SIBBackground(view,channel) {
   var im=view.image,step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/50000))),v=[];
   for(var y=0;y<im.height;y+=step)for(var x=0;x<im.width;x+=step){
      var a=im.sample(x,y,channel);if(isFinite(a))v.push(a);
   }
   if(!v.length)throw new Error('Cannot measure a finite input background.');
   return SIBMedian(v);
}

// Relative luminance difference: average nearby values, smoothly favor the brighter source.
// A single weight is shared by RGB channels to retain each source pixel's color.
function SIBWeight(ya,yb,a,b,favor,tolerance) {
   if(a<=0)return 0;
   if(b<=0)return 1;
   var base=a/(a+b);
   if(!favor)return base;
   var d=Math.abs(ya-yb)/Math.max(1e-8,Math.abs(ya),Math.abs(yb));
   var edge=Math.max(1e-6,tolerance);
   var t=Math.max(0,Math.min(1,(d-tolerance)/edge));
   t=t*t*(3-2*t);
   return base*(1-t)+(ya>yb?1:0)*t;
}
function SIBExpression(a,b,wa,wb,favor,tolerance,rgb) {
   if(wa<=0)return b;
   if(wb<=0)return a;
   var base=wa/(wa+wb);
   if(!favor)return '('+a+'*'+base.toPrecision(17)+'+'+b+'*'+(1-base).toPrecision(17)+')';
   var luminance=function(id){return rgb?'(0.2126*'+id+'[0]+0.7152*'+id+'[1]+0.0722*'+id+'[2])':id;};
   return 'sibYA='+luminance(a)+';sibYB='+luminance(b)+';'+
      'sibD=abs(sibYA-sibYB)/max(1e-8,max(abs(sibYA),abs(sibYB)));'+
      'sibT=min(1,max(0,(sibD-'+tolerance.toPrecision(17)+')/'+Math.max(1e-6,tolerance).toPrecision(17)+'));'+
      'sibT=sibT*sibT*(3-2*sibT);sibW='+base.toPrecision(17)+'*(1-sibT)+iif(sibYA>sibYB,1,0)*sibT;'+
      a+'*sibW+'+b+'*(1-sibW)';
}

function ImageBlendDialog() {
   this.__base__ = Dialog; this.__base__();
   var self = this;
   this.windowTitle = 'Smart Image Blend';
   this.owned = []; this.sources = [null,null]; this.cache = [null,null];
   this.favorBright=false; this.tolerance=0.10;
   this.haMode=false;this.haStrength=0.5;this.haGain=1;this.haMatch=true;this.haBackgrounds=null;
   this.weights = [100,100]; this.bitmap = null;
   this.pw = 0; this.ph = 0;
   this.previewMessage='Select both input images, then choose a blend mode.';
   this.fail = function(e) { new MessageBox(String(e), 'Smart Image Blend', StdIcon_Error, StdButton_Ok).execute(); };
   this.status = new Label(this);
   this.status.text = 'Choose two aligned images to see the blended output.';
   this.status.wordWrapping = true;
   this.preview = new Control(this);
   STScreenFit.preview(this.preview,720,460,48,360);
   this.preview.onPaint = function() {
      var g = new Graphics(this);
      try {
         g.fillRect(0,0,this.width,this.height,new Brush(0xff181818));
         if (self.bitmap) {
            var f = Math.min(this.width/self.pw,this.height/self.ph);
            var w = Math.round(self.pw*f), h = Math.round(self.ph*f);
            var x = Math.floor((this.width-w)/2), y = Math.floor((this.height-h)/2);
            g.scaleTransformation(f);
            g.drawBitmap(Math.round(x/f),Math.round(y/f),self.bitmap);
         } else {
            g.pen=new Pen(0xffdddddd);
            g.drawText(12,28,self.previewMessage);
         }
      } finally { g.end(); }
   };
   this.validate = function() {
      var a = self.sources[0], b = self.sources[1];
      if (!a || !b || a.isNull || b.isNull) throw new Error('Choose both input images.');
      var x = a.image, y = b.image;
      if (x.width !== y.width || x.height !== y.height) throw new Error('Inputs must have identical dimensions and be registered before blending.');
      if(self.haMode){
         if(!((x.numberOfNominalChannels===3 && x.isColor && y.numberOfNominalChannels===1 && !y.isColor)||(y.numberOfNominalChannels===3 && y.isColor && x.numberOfNominalChannels===1 && !x.isColor)))
            throw new Error('HaRGB requires one RGB image and one monochrome Ha image, in either input slot.');
         return;
      }
      if (x.numberOfNominalChannels !== y.numberOfNominalChannels || x.isColor !== y.isColor)
         throw new Error('Inputs must have identical dimensions and matching monochrome/RGB channels. Align them before blending.');
      if (x.numberOfNominalChannels !== 1 && x.numberOfNominalChannels !== 3) throw new Error('Use monochrome or RGB images.');
      if (self.weights[0]+self.weights[1] === 0) throw new Error('At least one image strength must be greater than zero.');
   };
   this.haInputs=function(){var rgb=self.sources[0].image.isColor?0:1;return {rgb:rgb,ha:1-rgb};};
   this.haOffset=function(roles){
      if(!self.haMatch)return 0;
      if(!self.haBackgrounds)self.haBackgrounds=[SIBBackground(self.sources[roles.rgb],0),SIBBackground(self.sources[roles.ha],0)];
      return self.haBackgrounds[0]-self.haGain*self.haBackgrounds[1];
   };
   this.sample = function(view,w,h) {
      var im=view.image, channels=im.numberOfNominalChannels, result=[];
      for(var c=0;c<channels;++c) {
         var data=new Float32Array(w*h);
         for(var y=0;y<h;++y) {
            var sy=Math.min(im.height-1,Math.floor((y+0.5)*im.height/h));
            var row=new Float32Array(im.width);
            im.getSamples(row,new Rect(0,sy,im.width,sy+1),c);
            for(var x=0;x<w;++x) data[y*w+x]=row[Math.min(im.width-1,Math.floor((x+0.5)*im.width/w))];
         }
         result.push(data);
      }
      return result;
   };
   this.render = function() {
      self.bitmap=null;
      try {
         self.validate();
         var roles=self.haMode?self.haInputs():null;
         var im=self.sources[roles?roles.rgb:0].image;
         var scale=Math.min(1,800/im.width,520/im.height);
         var w=Math.max(1,Math.round(im.width*scale)),h=Math.max(1,Math.round(im.height*scale));
         for(var i=0;i<2;++i) if(!self.cache[i]) self.cache[i]=self.sample(self.sources[i],w,h);
         var total=self.weights[0]+self.weights[1], a=self.weights[0]/total,b=self.weights[1]/total;
         var out=new Image(w,h,im.numberOfNominalChannels,im.colorSpace,32,SampleType_Real);
         try {
            var blendWeights=new Float32Array(w*h),rgb=im.numberOfNominalChannels===3;
            if(!self.haMode)for(var q=0;q<w*h;++q) {
               var ca=self.cache[0],cb=self.cache[1];
               var ya=rgb?0.2126*ca[0][q]+0.7152*ca[1][q]+0.0722*ca[2][q]:ca[0][q];
               var yb=rgb?0.2126*cb[0][q]+0.7152*cb[1][q]+0.0722*cb[2][q]:cb[0][q];
               blendWeights[q]=SIBWeight(ya,yb,self.weights[0],self.weights[1],self.favorBright,self.tolerance);
            }
            for(var c=0;c<im.numberOfNominalChannels;++c) {
               var pixels=new Float32Array(w*h);
               var offset=self.haMode?self.haOffset(roles):0;
               for(var p=0;p<pixels.length;++p) pixels[p]=self.haMode?
                  (c===0?SIBHaRed(self.cache[roles.rgb][0][p],self.cache[roles.ha][0][p],self.haStrength,self.haGain,offset):self.cache[roles.rgb][c][p]):
                  blendWeights[p]*self.cache[0][c][p]+(1-blendWeights[p])*self.cache[1][c][p];
               out.setSamples(pixels,new Rect(0,0,w,h),c);
            }
            self.bitmap=out.render(); self.pw=w; self.ph=h;
         } finally { out.free(); }
         self.status.text=format('Image 1: %.1f%%   |   Image 2: %.1f%%   |   Output: %d x %d',100*a,100*b,im.width,im.height)+(self.favorBright?' | Favor Bright Data':' | Weighted Average');
         if(self.haMode)self.status.text=format('HaRGB | RGB: %s | Ha: %s | Ha strength: %.1f%% | Scale: %.2f | %d x %d',self.sources[roles.rgb].id,self.sources[roles.ha].id,100*self.haStrength,self.haGain,im.width,im.height);
         self.create.enabled=true;
      } catch(e) { self.status.text=String(e);self.previewMessage=String(e); self.create.enabled=false; }
      self.preview.update();
   };
   this.timer=new Timer;
   this.timer.interval=0.15; this.timer.periodic=false;
   this.timer.onTimeout=function(){self.render();};
   this.schedule=function(){self.timer.stop();self.timer.start();};
   this.lists=[]; this.sliders=[];
   this.rows=[];
   for(var k=0;k<2;++k) (function(index){
      var label=new Label(self); label.text='Image '+(index+1)+':';
      var list=new ViewList(self); list.getMainViews(); list.setMinWidth(350);
      list.toolTip='Select an open image. Inputs must already be registered to each other.';
      list.onViewSelected=function(v){self.sources[index]=v.isNull?null:v;self.cache=[null,null];self.haBackgrounds=null;self.schedule();};
      var load=new PushButton(self);load.text='Load...';
      load.toolTip='Load an image file without displaying an input preview.';
      load.onClick=function(){
         var d=new OpenFileDialog;d.caption='Load image '+(index+1);d.multipleSelections=false;
         d.filters=[['Images','*.xisf','*.fit','*.fits','*.fts','*.tif','*.tiff','*.png'],['All files','*']];
         if(!STScreenFit.execute(d)) return;
         try {
            var windows=ImageWindow.open(d.fileName);
            if(!windows.length) throw new Error('No image found in this file.');
            for(var n=0;n<windows.length;++n){ windows[n].hide();self.owned.push(windows[n]); }
            self.sources[index]=windows[0].mainView;
            for(var j=0;j<self.lists.length;++j) {self.lists[j].getMainViews();if(self.sources[j])self.lists[j].currentView=self.sources[j];}
            self.cache=[null,null];self.haBackgrounds=null;self.schedule();
         }catch(e){self.fail(e);}
      };
      var row=new HorizontalSizer;row.spacing=6;row.add(label);row.add(list,100);row.add(load);
      var strength=new NumericControl(self);strength.label.text='Image '+(index+1)+' strength:';
      strength.setRange(0,100);strength.setPrecision(1);strength.slider.setRange(0,1000);strength.setValue(100);
      strength.toolTip='Relative contribution to the blend. Equal values give 50/50; zero excludes this image.';
      strength.onValueUpdated=function(v){self.weights[index]=v;self.schedule();};
      self.lists.push(list);self.sliders.push(strength);self.rows.push(row);
   })(k);
   this.mode=new ComboBox(this);this.mode.addItem('Weighted Average');this.mode.addItem('Favor Bright Data');this.mode.addItem('HaRGB — mono Ha into RGB');
   this.mode.toolTip='Favor Bright Data keeps the brighter source pixel when luminance differs clearly. Similar pixels use the strength-weighted average. RGB channels share one weight.';
   this.updateMode=function(){
      self.favorBright=self.mode.currentItem===1;self.haMode=self.mode.currentItem===2;
      self.brightnessTolerance.enabled=self.favorBright;
      for(var j=0;j<2;j++)self.sliders[j].enabled=!self.haMode;
      self.haAmount.enabled=self.haScale.enabled=self.matchBackground.enabled=self.haMode;
      self.schedule();
   };
   this.mode.onItemSelected=function(){self.updateMode();};
   var modeLabel=new Label(this);modeLabel.text='Blend mode:';
   var modeRow=new HorizontalSizer;modeRow.spacing=6;modeRow.add(modeLabel);modeRow.add(this.mode,100);
   this.brightnessTolerance=new NumericControl(this);this.brightnessTolerance.label.text='Brightness tolerance (%):';
   this.brightnessTolerance.setRange(0,100);this.brightnessTolerance.setPrecision(1);this.brightnessTolerance.slider.setRange(0,1000);this.brightnessTolerance.setValue(10);this.brightnessTolerance.enabled=false;
   this.brightnessTolerance.toolTip='Relative luminance difference, measured against the brighter pixel. At or below this tolerance, use the weighted average. Between one and two times the tolerance, smoothly favor the brighter pixel; beyond that, use it alone. A zero strength still excludes a source. For stars, start near 10%. Inputs should be aligned with comparable backgrounds.';
   this.brightnessTolerance.onValueUpdated=function(v){self.tolerance=v/100;self.schedule();};
   this.haAmount=new NumericControl(this);this.haAmount.label.text='Ha strength (%):';
   this.haAmount.setRange(0,100);this.haAmount.setPrecision(1);this.haAmount.slider.setRange(0,1000);this.haAmount.setValue(50);this.haAmount.enabled=false;
   this.haAmount.toolTip='Adds positive Ha excess to red only. Zero preserves RGB exactly. Green and blue remain unchanged. A smooth highlight shoulder keeps added Ha within available red-channel headroom.';
   this.haAmount.onValueUpdated=function(v){self.haStrength=v/100;self.schedule();};
   this.haScale=new NumericControl(this);this.haScale.label.text='Ha signal scale:';
   this.haScale.setRange(0,5);this.haScale.setPrecision(3);this.haScale.slider.setRange(0,1000);this.haScale.setValue(1);this.haScale.enabled=false;
   this.haScale.toolTip='Scales Ha to a comparable red-channel signal level. Start at 1 and adjust while viewing the result. Inputs should share a comparable stretch stage.';
   this.haScale.onValueUpdated=function(v){self.haGain=v;self.schedule();};
   this.matchBackground=new CheckBox(this);this.matchBackground.text='Match Ha background to RGB red';this.matchBackground.checked=true;this.matchBackground.enabled=false;
   this.matchBackground.toolTip='Offsets scaled Ha to match the sampled median of RGB red. This is not continuum subtraction. Large emission-filled fields can bias the median; disable if backgrounds are already matched. Use registered images, preferably starless to avoid red stellar halos.';
   this.matchBackground.onCheck=function(v){self.haMatch=v;self.schedule();};
   this.haHelp=new Label(this);this.haHelp.wordWrapping=true;
   this.haHelp.text='HaRGB: select one RGB and one mono Ha image in either slot. Use registered images at a comparable stretch stage. Adds positive Ha excess to red; G/B stay unchanged. Starless inputs help avoid red star halos.';
   this.create=new PushButton(this);this.create.text='Create Blend';this.create.enabled=false;
   this.create.toolTip='Create a new full-resolution 32-bit floating-point blend. Sources are preserved.';
   this.create.onClick=function(){
      self.timer.stop();var win=null;self.enabled=false;
      try {SATRunProgress('Smart Image Blend — Creating blend',function(report){
         report(10,"Checking inputs");self.validate();var roles=self.haMode?self.haInputs():null;
         var im=self.sources[roles?roles.rgb:0].image;
         win=new ImageWindow(im.width,im.height,im.numberOfNominalChannels,32,true,im.isColor,self.haMode?'SmartHaRGB':'SmartImageBlend');
         var sum=self.weights[0]+self.weights[1];
         var pm=new PixelMath;
         pm.expression=SIBExpression(self.sources[0].fullId,self.sources[1].fullId,self.weights[0],self.weights[1],self.favorBright,self.tolerance,im.isColor);
         pm.symbols=self.favorBright?'sibYA,sibYB,sibD,sibT,sibW':'';
         pm.useSingleExpression=true;
         if(self.haMode){
            var rgbId=self.sources[roles.rgb].fullId,haId=self.sources[roles.ha].fullId,offset=self.haOffset(roles);
            var red=rgbId+'[0]',excess='max(0,'+self.haGain.toPrecision(17)+'*'+haId+'+('+offset.toPrecision(17)+')-'+red+')',headroom='max(0,1-'+red+')';
            pm.expression=red+'+'+headroom+'*(1-exp(-'+self.haStrength.toPrecision(17)+'*'+excess+'/max(1e-12,'+headroom+')))';
            pm.expression1=rgbId+'[1]';pm.expression2=rgbId+'[2]';pm.symbols='';pm.useSingleExpression=false;
         }
         pm.generateOutput=true;pm.singleThreaded=false;
         pm.use64BitWorkingImage=true;pm.rescale=false;pm.truncate=false;pm.createNewImage=false;
         report(40,"Processing full-resolution pixels");if(!pm.executeOn(win.mainView,false))throw new Error('Blend was cancelled or failed.');
         win.keywords=self.sources[roles?roles.rgb:0].window.keywords;
         report(95,"Opening output image");win.show();win=null;
         self.status.text='Full-resolution blend created. Adjust the strengths to create another.';
      });}catch(e){if(win)win.forceClose();self.fail(e);}
      finally{self.enabled=true;}
   };
   this.reset=new PushButton(this);this.reset.text='Reset';
   this.reset.onClick=function(){for(var j=0;j<2;++j){self.weights[j]=100;self.sliders[j].setValue(100);}self.favorBright=false;self.tolerance=0.10;self.mode.currentItem=0;self.haStrength=0.5;self.haGain=1;self.haMatch=true;self.haAmount.setValue(50);self.haScale.setValue(1);self.matchBackground.checked=true;self.updateMode();self.brightnessTolerance.setValue(10);self.brightnessTolerance.enabled=false;self.cache=[null,null];self.haBackgrounds=null;self.schedule();};
   this.closeButton=new PushButton(this);this.closeButton.text='Close';this.closeButton.onClick=function(){self.ok();};
   var buttons=new HorizontalSizer;buttons.spacing=8;buttons.add(this.reset);buttons.addStretch();buttons.add(this.create);buttons.add(this.closeButton);
   this.refresh=new PushButton(this);this.refresh.text='Refresh Preview';
   this.refresh.toolTip='Reload the selected source pixels and redraw the blended preview.';
   this.refresh.onClick=function(){
      for(var j=0;j<2;j++){var v=self.lists[j].currentView;self.sources[j]=v&&!v.isNull?v:null;}
      self.cache=[null,null];self.haBackgrounds=null;self.render();
   };
   buttons.add(this.refresh);
   // Keep preview and source selection visible; only adjustment controls scroll.
   var bounds=STScreenFit.bounds(this),previewHeight=Math.max(100,Math.min(330,Math.floor(bounds.height*0.40)));
   this.preview.setMinSize(280,previewHeight);this.preview.setMaxHeight(previewHeight);
   var controls=new VerticalSizer;controls.margin=6;controls.spacing=6;
   for(var r=0;r<2;r++)controls.add(this.sliders[r]);
   controls.add(this.brightnessTolerance);controls.add(this.haAmount);controls.add(this.haScale);controls.add(this.matchBackground);controls.add(this.haHelp);
   var settings=STScreenFit.scroll(this,controls,Math.min(760,bounds.width-40),Math.max(60,Math.min(230,bounds.height-previewHeight-240)));
   settings.setFixedHeight(Math.max(60,Math.min(230,bounds.height-previewHeight-240)));
   this.sizer=new VerticalSizer;this.sizer.margin=10;this.sizer.spacing=6;
   this.sizer.add(this.preview);this.sizer.add(this.status);
   for(var r=0;r<2;r++)this.sizer.add(this.rows[r]);
   this.sizer.add(modeRow);this.sizer.add(settings);this.sizer.add(buttons);
   this.userResizable=true;this.setMaxSize(bounds.width,bounds.height);this.adjustToContents();
   this.resize(Math.min(this.width,bounds.width),Math.min(this.height,bounds.height));
   this.onShow=function(){self.refresh.onClick();};
   this.cleanup=function(){self.timer.stop();for(var j=0;j<self.owned.length;++j)if(!self.owned[j].isNull)self.owned[j].forceClose();};
}
ImageBlendDialog.prototype=new Dialog;
var dialog=new ImageBlendDialog;
try {STScreenFit.execute(dialog);} finally {dialog.cleanup();}
