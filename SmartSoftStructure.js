// Standalone PixInsight script. Rename SmartSoftStructure.txt to SmartSoftStructure.js before running.
/* Smart Soft Structure 0.1.1 - experimental spatial-scale finishing tool.
 * Rename SmartSoftStructure.txt to SmartSoftStructure.js. Standalone.
 * Use on stretched RGB/mono images in 0..1, starless data required.
 * Analysis uses an area-resampled guide (maximum 1200 pixels on either side).
 * Full-resolution output adds the interpolated luminance correction to the
 * original data; it does not replace full-resolution detail with the guide.
 * Fit view is a reduced overview. From 50% zoom, original-resolution tiles
 * are evaluated using the same per-pixel equation as output strips.
 * No claim is made about the processing used for the supplied reference image.
 */
#feature-id SmartSuite > Smart Soft Structure
#feature-info Smooth intermediate-scale transitions while retaining finer structure and broad contrast.
#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>

function SSSProgress(){
   var d=new Dialog;d.windowTitle='Smart Soft Structure - working';d.cancelled=false;d.started=Date.now();
   d.label=new Label(d);d.label.text='Preparing...';d.label.setMinWidth(430);
   d.bar=new Control(d);d.bar.setFixedSize(430,20);d.percent=0;
   d.bar.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff202020));g.fillRect(0,0,Math.round(this.width*d.percent/100),this.height,new Brush(0xff30a0d0));}finally{g.end();}};
   var cancel=new PushButton(d);cancel.text='Cancel';cancel.onClick=function(){d.cancelled=true;};
   d.onClose=function(){d.cancelled=true;return false;};d.sizer=new VerticalSizer;d.sizer.margin=12;d.sizer.spacing=8;d.sizer.add(d.label);d.sizer.add(d.bar);d.sizer.add(cancel);d.adjustToContents();
   d.report=function(percent,text){d.percent=percent;d.label.text=text+' | '+Math.floor(percent)+'% | '+((Date.now()-d.started)/1000).toFixed(1)+' s';d.bar.update();processEvents();if(d.cancelled)throw Error('Cancelled; no output was kept.');};return d;
}
function SSSDialog(){
   this.__base__=Dialog;this.__base__();var self=this;this.windowTitle='Smart Soft Structure 0.1.1';this.busy=false;this.closed=false;this.small=null;this.bitmap=null;
   function fail(e){new MessageBox(String(e),self.windowTitle,StdIcon_Error,StdButton_Ok).execute();}
   this.timer=new Timer;this.timer.interval=.25;this.timer.periodic=false;
   function schedule(){if(!self.busy&&!self.closed){self.timer.stop();self.timer.start();}}
   this.views=new ViewList(this);this.views.getMainViews();
   this.note=new Label(this);this.note.wordWrapping=true;this.note.text='Finishing tool for STRETCHED images. Starless data assumed. Smooths intermediate-scale transitions; fine texture and broad contrast have separate controls. Wheel zoom and drag-to-pan; 1:1 uses native source tiles.';
   this.canvas=new Control(this);STScreenFit.preview(this.canvas,1000,650,48,390);
   SSSInstallTiles(this);
   function numeric(text,min,max,value,tip){var c=new NumericControl(self);c.label.text=text;c.setRange(min,max);c.setPrecision(2);c.slider.setRange(0,1000);c.setValue(value);c.toolTip=tip;c.onValueUpdated=schedule;return c;}
   this.strength=numeric('Soft structure strength',0,1,.4,'Overall effect. Zero preserves original pixels exactly.');
   this.scale=numeric('Structure scale (% of short side)',.2,8,1.2,'Size of the intermediate structures to round. Larger values affect broader cloud transitions.');
   this.detail=numeric('Fine texture retention',0,1,1,'One retains the finest analysis-scale residual. Lower values soften it too. Fine details below the guide resolution are retained.');
   this.contrast=numeric('Broad structure contrast',0,1,.15,'Gently separate larger light and dark structures. High values can create halos; inspect at full resolution.');
   this.edges=numeric('Strong-edge protection',0,1,.65,'Reduce the effect around large intensity transitions to limit edge halos.');
   this.before=new CheckBox(this);this.before.text='Show original';this.before.onCheck=function(){self.retile(false);};
   this.status=new Label(this);this.status.wordWrapping=true;this.status.text='Select a stretched image and click Load / refresh.';
   this.params=function(){return {strength:self.strength.value,scale:self.scale.value,detail:self.detail.value,contrast:self.contrast.value,edges:self.edges.value,stars:false};};
   this.load=function(){self.timer.stop();var v=self.views.currentView;if(!v||v.isNull)throw Error('Select an open stretched image.');var im=v.image;if([1,3].indexOf(im.numberOfChannels)<0)throw Error('Use mono or RGB without alpha channels.');
      var small=new Image(im);try{var f=Math.min(1,1200/im.width,1200/im.height);if(f<1)small.resample(f);if(self.small)self.small.free();self.small=small;small=null;self.source=v;output.enabled=true;self.loadedWidth=im.width;self.loadedHeight=im.height;self.originalBitmap=self.small.render();}finally{if(small)small.free();}self.resetView();self.render();};
   this.render=function(){if(self.busy||!self.small)return;var out=null,p=self.params();
      self.tileTimer.stop();
      try{var model=SSSBuild(self.small,p),W=model.width,H=model.height,C=self.small.numberOfChannels;
         var planes=SSSNativeTile(self.small,new Rect(0,0,W,H),model,p,false);out=new Image(self.small);
         for(var c=0;c<C;c++)out.setSamples(planes[c],new Rect(0,0,W,H),c);
         self.bitmap=out.render();self.tileModel=model;self.renderParams=p;self.retile(true);
      }catch(e){self.clearTiles();self.tileModel=null;self.tileFailed=true;self.status.text=String(e);self.canvas.update();}
      finally{if(out)out.free();}
   };this.timer.onTimeout=this.render;
   this.create=function(){if(self.busy)return;self.timer.stop();self.tileTimer.stop();var progress=SSSProgress(),win=null,guide=null;self.busy=true;self.enabled=false;
      try{progress.show();progress.report(0,'Reading current source');var v=self.views.currentView;if(!v||v.isNull)throw Error('Select an open stretched image.');if(!self.source||self.source.id!=v.id||!self.small)throw Error('Load / refresh the selected image first.');var im=v.image,W=im.width,H=im.height,C=im.numberOfChannels;if(W!=self.loadedWidth||H!=self.loadedHeight)throw Error('Source geometry changed; Load / refresh first.');if([1,3].indexOf(C)<0)throw Error('Use mono or RGB without alpha channels.');
         var p=self.params();guide=new Image(im);var f=Math.min(1,1200/W,1200/H);if(f<1)guide.resample(f);var model=SSSBuild(guide,p,progress.report);guide.free();guide=null;
         win=new ImageWindow(W,H,C,32,true,C==3,'SmartSoftStructure');win.hide();var target=win.mainView;
         for(var y0=0;y0<H;y0+=32){var y1=Math.min(H,y0+32),rect=new Rect(0,y0,W,y1);
            var output=SSSNativeTile(im,rect,model,p,false);
            if(typeof UndoFlag_NoSwapFile!="undefined")target.beginProcess(UndoFlag_NoSwapFile);else target.beginProcess();try{for(c=0;c<C;c++)target.image.setSamples(output[c],rect,c);}finally{target.endProcess();}
            progress.report(30+65*y1/H,'Rendering full-resolution rows '+y1+' / '+H);
         }
         win.keywords=v.window.keywords;progress.report(98,'Finalizing new output');win.show();win.zoomToFit();win=null;self.status.text='New full-resolution output created. Original preserved. Review dust boundaries and halos at 1:1.';
      }catch(e){fail(e);}finally{if(guide)guide.free();if(win)win.forceClose();progress.hide();self.enabled=true;self.busy=false;self.retile(false);}
   };
   var reload=new PushButton(this);reload.text='Load / refresh';reload.onClick=function(){try{self.load();}catch(e){fail(e);}};
   var output=new PushButton(this);output.text='Create output';output.enabled=false;output.onClick=this.create;
   var close=new PushButton(this);close.text='Close';close.onClick=function(){if(!self.busy)self.ok();};
   var top=new HorizontalSizer;top.spacing=6;top.add(this.views,100);top.add(reload);
   var footer=new HorizontalSizer;footer.add(this.before);footer.addStretch();footer.add(output);footer.add(close);
   this._stBody=new VerticalSizer;this._stBody.margin=8;this._stBody.spacing=6;this._stBody.add(this.note);this._stBody.add(top);this._stBody.add(this.canvas,100);this._stBody.add(this.zoomRow);
   var items=[this.strength,this.scale,this.detail,this.contrast,this.edges,this.status];for(var i=0;i<items.length;i++)this._stBody.add(items[i]);this._stBody.add(footer);this._stFooter=footer;
   this.views.onViewSelected=function(){self.timer.stop();self.clearTiles();self.tileView=null;self.tileModel=null;self.originalBitmap=null;self.bitmap=null;if(self.small)self.small.free();self.small=null;self.source=null;output.enabled=false;self.canvas.update();self.status.text='Click Load / refresh to update the preview for this image.';};
   this.onClose=function(){return !self.busy;};this.dispose=function(){self.closed=true;self.timer.stop();self.clearTiles();self.tileView=null;self.tileModel=null;self.renderParams=null;self.originalBitmap=null;if(self.small)self.small.free();self.small=null;self.bitmap=null;};
   var active=ImageWindow.activeWindow;if(active&&!active.isNull)this.views.currentView=active.mainView;STScreenFit.adjust(this);
}
SSSDialog.prototype=new Dialog;


// Smart Soft Structure 0.1.0. Luminance corrections at separate spatial scales.
function SSSClamp(v,a,b){return Math.max(a,Math.min(b,v));}
function SSSSmooth(a,b,v){var t=SSSClamp((v-a)/Math.max(1e-12,b-a),0,1);return t*t*(3-2*t);}
function SSSMean(a,w,h,r){
   var tmp=new Float32Array(w*h),out=new Float32Array(w*h);
   for(var y=0;y<h;y++){
      var sum=0,left=0,right=Math.min(w-1,r);for(var x=0;x<=right;x++)sum+=a[y*w+x];
      for(x=0;x<w;x++){
         var lo=Math.max(0,x-r),hi=Math.min(w-1,x+r);
         while(left<lo)sum-=a[y*w+left++];while(right<hi)sum+=a[y*w+(++right)];
         tmp[y*w+x]=sum/(right-left+1);
      }
   }
   for(x=0;x<w;x++){
      sum=0;left=0;right=Math.min(h-1,r);for(y=0;y<=right;y++)sum+=tmp[y*w+x];
      for(y=0;y<h;y++){
         lo=Math.max(0,y-r);hi=Math.min(h-1,y+r);
         while(left<lo)sum-=tmp[(left++)*w+x];while(right<hi)sum+=tmp[(++right)*w+x];
         out[y*w+x]=sum/(right-left+1);
      }
   }return out;
}
function SSSBuild(image,p,report){
   var W=image.width,H=image.height,N=W*H,C=image.numberOfChannels,Y=new Float32Array(N);
   for(var y=0;y<H;y++)for(var x=0;x<W;x++){
      var i=y*W+x,v=C<3?image.sample(x,y,0):.2126*image.sample(x,y,0)+.7152*image.sample(x,y,1)+.0722*image.sample(x,y,2);
      if(!isFinite(v)||v<0||v>1)throw Error('Use a stretched image with finite samples in the range 0 to 1.');Y[i]=v;
   }
   if(report)report(12,'Separating fine texture');
   var radius=Math.max(1,Math.round(Math.min(W,H)*p.scale/100));
   var fineBase=SSSMean(Y,W,H,1),body=SSSMean(fineBase,W,H,radius),large=SSSMean(body,W,H,Math.max(2,3*radius));
   var mid=new Float32Array(N);for(i=0;i<N;i++)mid[i]=fineBase[i]-body[i];
   if(report)report(22,'Softening intermediate-scale transitions');
   var soft=SSSMean(SSSMean(mid,W,H,Math.max(1,Math.round(radius/2))),W,H,Math.max(1,Math.round(radius/2)));
   var delta=new Float32Array(N);
   for(i=0;i<N;i++){
      var edge=Math.abs(fineBase[i]-body[i])/Math.max(.015,body[i]);
      var protect=1-p.edges*SSSSmooth(.12,.6,edge);
      var fine=Y[i]-fineBase[i];
      var star=p.stars?1-SSSSmooth(.03,.18,Math.max(0,fine)/Math.max(.08,body[i])):1;
      var confidence=SSSSmooth(.003,.035,body[i])*(1-SSSSmooth(.85,1,Y[i]));
      delta[i]=p.strength*protect*star*confidence*((soft[i]-mid[i])+.35*p.contrast*(body[i]-large[i])-(1-p.detail)*fine);
   }
   if(report)report(30,'Structure model ready');
   return {width:W,height:H,delta:delta,luma:Y,body:body};
}
function SSSSample(a,w,h,x,y,W,H){
   var gx=SSSClamp((x+.5)*w/W-.5,0,w-1),gy=SSSClamp((y+.5)*h/H-.5,0,h-1);
   var ix=Math.floor(gx),iy=Math.floor(gy),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1),tx=gx-ix,ty=gy-iy;
   return (a[iy*w+ix]*(1-tx)+a[iy*w+jx]*tx)*(1-ty)+(a[jy*w+ix]*(1-tx)+a[jy*w+jx]*tx)*ty;
}
function SSSPixel(rgb,delta,guide,p){
   var Y=rgb.length<3?rgb[0]:.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
   // Protect compact bright features present at full resolution, even if the
   // reduced analysis softened their peaks. This is a heuristic, not a star mask.
   if(p.stars)delta*=1-SSSSmooth(.08,.5,Math.max(0,Y-guide)/Math.max(.08,guide));
   if(delta===0)return rgb.slice(0);
   var desired=SSSClamp(Y+delta,0,1),peak=Math.max.apply(Math,rgb);
   var gain=Y>1e-12?Math.min(desired/Y,peak>0?1/peak:1):1,out=[];
   for(var c=0;c<rgb.length;c++)out.push(SSSClamp(rgb[c]*gain,0,1));return out;
}

// Native source tile evaluation: shared by preview tiles and output strips.
// No filtering is done independently at tile edges; the global structure guide
// is sampled in full-image coordinates so neighboring tiles cannot form seams.
function SSSNativeTile(image,rect,model,p,before){
   var W=image.width,H=image.height,C=image.numberOfChannels,w=rect.x1-rect.x0,h=rect.y1-rect.y0,input=[],out=[];
   for(var c=0;c<C;c++){input[c]=new Float32Array(w*h);image.getSamples(input[c],rect,c);out[c]=new Float32Array(w*h);}
   for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var i=y*w+x,rgb=[];for(c=0;c<C;c++){var v=input[c][i];if(!isFinite(v)||v<0||v>1)throw Error('Source contains samples outside finite 0..1.');rgb.push(v);}
      var result=rgb;
      if(!before){var xx=rect.x0+x,yy=rect.y0+y;
         result=SSSPixel(rgb,SSSSample(model.delta,model.width,model.height,xx,yy,W,H),SSSSample(model.body,model.width,model.height,xx,yy,W,H),p);}
      for(c=0;c<C;c++)out[c][i]=result[c];
   }return out;
}
function SSSTileView(W,H,vw,vh){
   this.W=W;this.H=H;this.vw=vw;this.vh=vh;this.cx=W/2;this.cy=H/2;this.zoom=this.fit();
}
SSSTileView.prototype.fit=function(){return Math.min(1,this.vw/this.W,this.vh/this.H);};
SSSTileView.prototype.clamp=function(){
   this.zoom=SSSClamp(this.zoom,this.fit(),4);
   var hx=this.vw/(2*this.zoom),hy=this.vh/(2*this.zoom);
   this.cx=this.W<=2*hx?this.W/2:SSSClamp(this.cx,hx,this.W-hx);
   this.cy=this.H<=2*hy?this.H/2:SSSClamp(this.cy,hy,this.H-hy);
};
SSSTileView.prototype.at=function(x,y){return {x:this.cx+(x-this.vw/2)/this.zoom,y:this.cy+(y-this.vh/2)/this.zoom};};
SSSTileView.prototype.zoomAt=function(z,x,y){
   var point=this.at(x,y);this.zoom=SSSClamp(z,this.fit(),4);
   this.cx=point.x-(x-this.vw/2)/this.zoom;this.cy=point.y-(y-this.vh/2)/this.zoom;this.clamp();
};
SSSTileView.prototype.visible=function(size){
   var a=this.at(0,0),b=this.at(this.vw,this.vh),tiles=[];
   var x0=Math.max(0,Math.floor(a.x/size)),y0=Math.max(0,Math.floor(a.y/size));
   var x1=Math.min(Math.ceil(this.W/size),Math.ceil(b.x/size)),y1=Math.min(Math.ceil(this.H/size),Math.ceil(b.y/size));
   for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++)tiles.push({x:x*size,y:y*size,w:Math.min(size,this.W-x*size),h:Math.min(size,this.H-y*size)});
   return tiles;
};
function SSSInstallTiles(d){
   var canvas=d.canvas;d.tileView=null;d.tileCache={};d.tileLRU=[];d.tileBytes=0;d.tileQueue=[];d.tilePending={};d.tileRevision=0;d.tileFailed=false;d.tileModel=null;d.renderParams=null;
   d.tileTimer=new Timer;d.tileTimer.interval=.01;d.tileTimer.periodic=false;
   d.resetView=function(){if(d.source)d.tileView=new SSSTileView(d.loadedWidth,d.loadedHeight,canvas.width,canvas.height);};
   d.clearTiles=function(){d.tileTimer.stop();d.tileQueue=[];d.tilePending={};d.tileCache={};d.tileLRU=[];d.tileBytes=0;d.tileFailed=false;d.tileRevision++;};
   d.retile=function(clear){
      d.tileTimer.stop();d.tileQueue=[];d.tilePending={};d.tileFailed=false;
      if(clear)d.clearTiles();canvas.update();
   };
   d.touchTile=function(key){var i=d.tileLRU.indexOf(key);if(i>=0)d.tileLRU.splice(i,1);d.tileLRU.push(key);};
   d.tileTimer.onTimeout=function(){
      if(d.closed||d.busy||!d.tileQueue.length||!d.source||d.source.isNull)return;
      var job=d.tileQueue.shift();delete d.tilePending[job.key];if(job.revision!==d.tileRevision)return;
      var image=null;
      try{
         var source=d.source.image;if(source.width!==d.loadedWidth||source.height!==d.loadedHeight)throw Error('Source geometry changed; Load / refresh first.');
         var planes=SSSNativeTile(source,new Rect(job.x,job.y,job.x+job.w,job.y+job.h),d.tileModel,d.renderParams,job.before);
         image=new Image(job.w,job.h,source.numberOfChannels,source.colorSpace,32,SampleType_Real);
         for(var c=0;c<planes.length;c++)image.setSamples(planes[c],new Rect(0,0,job.w,job.h),c);
         var bitmap=image.render(),bytes=job.w*job.h*4;
         // Retain enough tiles for this viewport, up to a 256 MiB bitmap budget.
         var estimate=canvas.width*canvas.height/Math.max(.25,d.tileView.zoom*d.tileView.zoom)*4+8*1024*1024;
         var budget=Math.max(64*1024*1024,Math.min(256*1024*1024,estimate));
         while(d.tileBytes+bytes>budget&&d.tileLRU.length){var old=d.tileLRU.shift();if(d.tileCache[old]){d.tileBytes-=d.tileCache[old].bytes;delete d.tileCache[old];}}
         d.tileCache[job.key]={bitmap:bitmap,bytes:bytes};d.tileBytes+=bytes;d.touchTile(job.key);
      }catch(e){d.tileFailed=true;d.tileQueue=[];d.tilePending={};d.status.text='Native tile preview failed: '+String(e);}
      finally{if(image)image.free();}
      canvas.update();if(d.tileQueue.length&&!d.closed&&!d.busy)d.tileTimer.start();
   };
   canvas.onPaint=function(){
      var g=new Graphics(this);try{
         g.fillRect(0,0,this.width,this.height,new Brush(0xff161616));
         var v=d.tileView,overview=d.before.checked?d.originalBitmap:d.bitmap;if(!v||!overview)return;
         var ox=this.width/2-v.cx*v.zoom,oy=this.height/2-v.cy*v.zoom;
         g.drawScaledBitmap(new Rect(ox,oy,ox+v.W*v.zoom,oy+v.H*v.zoom),overview);
         var ready=0,visible=[];
         if(v.zoom>=.5&&d.tileModel&&!d.tileFailed){
            visible=v.visible(256);
            for(var i=0;i<visible.length;i++){
               var t=visible[i],key=d.tileRevision+'|'+(d.before.checked?'before':'after')+'|'+t.x+'|'+t.y,cached=d.tileCache[key];
               if(cached){
                  ready++;d.touchTile(key);
                  if(Math.abs(v.zoom-1)<1e-10)g.drawBitmap(Math.round(ox+t.x),Math.round(oy+t.y),cached.bitmap);
                  else g.drawScaledBitmap(new Rect(ox+t.x*v.zoom,oy+t.y*v.zoom,ox+(t.x+t.w)*v.zoom,oy+(t.y+t.h)*v.zoom),cached.bitmap);
               }else if(!d.tilePending[key]&&!d.busy){
                  t.key=key;t.before=d.before.checked;t.revision=d.tileRevision;d.tileQueue.push(t);d.tilePending[key]=true;
               }
            }
            if(d.tileQueue.length&&!d.busy)d.tileTimer.start();
         }
         if(!d.tileFailed&&!d.busy){
            var scale=(100*v.zoom).toFixed(0)+'%'+(Math.abs(v.zoom-1)<1e-10?' (1:1)':'');
            d.status.text=scale+(v.zoom>=.5?' | Native source tiles '+ready+'/'+visible.length:' | Overview; native tiles activate at 50% zoom')+(d.before.checked?' | Original':' | Processed')+' | Wheel zoom; drag to pan';
         }
      }finally{g.end();}
   };
   d.zoomView=function(z,x,y){if(!d.tileView||d.busy)return;d.tileView.zoomAt(z,x,y);d.retile(false);};
   canvas.onMouseWheel=function(x,y,delta){if(!delta||!d.tileView||d.busy)return;var old=d.tileView.zoom,z=old*(delta>0?1.5:1/1.5);if(old<1&&z>1||old>1&&z<1)z=1;d.zoomView(z,x,y);};
   canvas.onMousePress=function(x,y,button){if(button!==1||!d.tileView||d.busy)return;d.dragStart={x:x,y:y,cx:d.tileView.cx,cy:d.tileView.cy};};
   canvas.onMouseMove=function(x,y){if(!d.dragStart||!d.tileView||d.busy)return;var v=d.tileView,s=d.dragStart;v.cx=s.cx-(x-s.x)/v.zoom;v.cy=s.cy-(y-s.y)/v.zoom;v.clamp();d.retile(false);};
   canvas.onMouseRelease=function(){d.dragStart=null;};
   canvas.onResize=function(w,h){if(!d.tileView)return;d.tileView.vw=w;d.tileView.vh=h;d.tileView.clamp();d.retile(false);};
   canvas.toolTip='Mouse wheel zooms around the pointer. Drag with the left button to pan. 1:1 shows native source pixels. Below 50%, a reduced overview is used.';
   d.zoomRow=new HorizontalSizer;d.zoomRow.spacing=6;
   function button(text,fn){var b=new PushButton(d);b.text=text;b.onClick=fn;d.zoomRow.add(b);return b;}
   button('Fit',function(){if(!d.tileView||d.busy)return;d.resetView();d.retile(false);});
   button('1:1',function(){d.zoomView(1,canvas.width/2,canvas.height/2);});
   button('-',function(){if(d.tileView)d.zoomView(d.tileView.zoom/1.5,canvas.width/2,canvas.height/2);});
   button('+',function(){if(d.tileView)d.zoomView(d.tileView.zoom*1.5,canvas.width/2,canvas.height/2);});d.zoomRow.addStretch();
}

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

var sss=new SSSDialog;try{STScreenFit.execute(sss);}finally{sss.dispose();}
