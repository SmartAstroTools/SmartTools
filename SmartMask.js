// Standalone PixInsight script. Rename SmartMask.txt to SmartMask.js before running.
/* Screen-fit layout update 1.0.1. */
/* Hover-help update 2026-10-16. Processing algorithms and defaults retained. */
// Hover help only: helpers return their inputs and do not change processing settings.
var STHoverCaptions={"Auto": "Detect the target type automatically from image structure.", "Nebula": "Tune automatic mask detection for extended nebulosity.", "Galaxy": "Tune automatic mask detection for galaxy structure.", "Detection Sensitivity": "Higher values include weaker detected structure. Release the slider to rebuild the mask.", "Include Faint Wisps": "Include more faint structure connected to the detected object. Higher values may also include more background.", "Suppress stars during detection": "Reduce the influence of stars when identifying extended astronomical structures.", "Keep Inside": "Keep the existing mask inside the next lasso outline and remove it outside. Completed outlines accumulate.", "Subtract": "Remove the area inside the next lasso outline from the existing mask. Completed outlines accumulate.", "Clear Lasso Edits": "Remove all accumulated lasso edits and restore the underlying generated mask.", "Reset": "Restore the dialog controls to their starting values.", "Cancel": "Close this dialog without accepting its result, or stop the current operation when used in a progress window.", "Create Mask": "Create the mask from the current detection settings and lasso edits at the source image resolution.", "Zoom To Peak": "Zoom the histogram to its meaningful occupied signal range. This does not change image pixels or selection values.", "Center on SP": "Pan the histogram to the selected symmetry point while keeping the current zoom level.", "Reset Zoom": "Show the full histogram signal range from 0 to 1.", "Commit Symmetry Point": "Activate the selected SP for subsequent stretch previews. Selecting an SP alone does not commit it.", "RGB/K": "Use combined RGB brightness, or intensity for a monochrome image.", "R": "Use the red channel for histogram measurements and adjustments.", "G": "Use the green channel for histogram measurements and adjustments.", "B": "Use the blue channel for histogram measurements and adjustments.", "Low": "Lower signal boundary of the current selection. Values use the original normalized 0–1 signal scale.", "High": "Upper signal boundary of the current selection. Values use the original normalized 0–1 signal scale.", "Click range": "Half-width around the picked signal value. Larger values include a wider brightness range.", "Selection Mask": "Show or hide the magenta mask overlay. Hiding it does not turn off the processing mask.", "Inverse Selection": "Reverse the final mask, including lasso edits: selected pixels become protected and protected pixels become selected.", "Mask overlay strength": "Opacity of the magenta mask display. Changes the overlay only, not processing strength.", "Adaptive Symmetry-Stretch (AS)": "Stretch around a committed symmetry point. Click the image or histogram to choose an SP, then commit it.", "Signal": "Select pixels by brightness. Ctrl-click adds or removes ranges; Alt-click selects connected structure when supported.", "Color": "Select pixels with colors similar to the picked color. The histogram is locked while color selection is active.", "Color Tolerance": "Higher values include a wider range of colors around the picked color.", "Lasso": "Enable drawing mask-edit outlines on the preview. Use Keep Inside or Subtract to choose how each outline changes the mask.", "Smart Mask…": "Open automatic nebula/galaxy mask detection and refine its result with lasso edits.", "Intensity": "Raise or lower brightness within the active mask. This is separate from Stretch Factor and local-detail Contrast.", "Contrast": "Increase or reduce local detail contrast within the active mask.", "Stretch Factor": "Strength of the nonlinear stretch. Zero leaves the stretch contribution unchanged. Other adjustments remain independent.", "Local Intensity": "Choose the tonal neighborhood where the stretch is most influential. Midpoint 0.5 retains the established curve weighting.", "Protect Shadows": "Reduce adjustment strength in the darkest pixels. Higher values preserve more deep-shadow signal.", "Protect Highlights": "Reduce adjustment strength in the brightest pixels. Higher values protect bright cores and star highlights.", "Adaptive Boundary": "Limit local tonal changes near sensitive boundaries to reduce artifacts. Higher values increase boundary protection.", "Enable Reference-Aware HDR": "Use the original image as a reference to compress bright regions while retaining surrounding detail.", "HDR Strength": "How strongly the HDR pass compresses bright regions. Only used when Reference-Aware HDR is enabled.", "HDR Scale": "Spatial scale of detail used by the HDR pass. Only used when Reference-Aware HDR is enabled.", "Show Before": "Compare the original preview baseline with the current adjusted preview. Does not change saved settings.", "Update Stretch Preview": "Recalculate the reduced-resolution preview using the current adjustments without applying them to the source image.", "Quick Stretch": "Choose an automatic starting stretch, then refine its strength and finishing options.", "Auto Color & Brightness": "Toggle the optional color and brightness finishing pass.", "Auto High Contrast": "Apply automatic tonal-contrast finishing after the initial stretch.", "Additional Auto High Contrast": "Add another automatic contrast finishing pass to the starting recipe.", "Reset Stretch": "Reset stretch-related adjustments while retaining the current image baseline.", "Refresh Active View": "Reload the active PixInsight image and rebuild the working preview. Clears the previous adjustment history.", "Close": "Close this window. Previously created images are retained.", "Undo": "Restore the previous saved adjustment state.", "Redo": "Restore the next adjustment state after Undo.", "Analyze / Suggest": "Analyze image statistics and suggest settings for shadow clipping and tonal protection.", "Use dirty Apply (experimental)": "Apply only the affected image tiles when the operation is eligible; otherwise use the full-image processing path.", "Verify dirty Apply against full reference (slow)": "Compare experimental dirty Apply against a full-image reference. Adds processing time.", "Reanalyze palette": "Rebuild the Image Analysis starting preview for the selected channel palette.", "Open in QuickStretch": "Open the selected starting image and recipe in the Quick Stretch adjustment dialog.", "Linear black / white": "Apply linear endpoint adjustments to set the black and white levels of the initial stretch.", "Gentle shadow lift — brighter faint detail": "Add a gentle shadow lift to reveal faint structure in the selected starting recipe.", "Faint Nebulosity (experimental second pass)": "Apply an additional guided pass to reveal faint extended nebulosity.", "Faint Nebulosity Strength": "Strength of the optional faint-nebulosity pass. Higher values produce a stronger faint-signal lift.", "Auto Color & Brightness (experimental)": "Enable optional automatic brightness and color enhancement after stretching.", "Brightness Strength": "Amount of automatic brightness enhancement in the optional finishing pass.", "Vibrance Strength": "Amount of automatic color enhancement in the optional finishing pass.", "OK": "Accept the current settings and continue with the result.", "Continue": "Use the selected image and continue to the next dialog.", "Linked RGB correction": "Use linked RGB correction to keep channel corrections coordinated and reduce unintended color shifts.", "Exclude target from background measurement": "Exclude protected astronomical structures from the samples used to fit the background model.", "Also leave target pixels uncorrected": "Leave protected target pixels unchanged instead of interpolating correction beneath them.", "Show original (same display stretch)": "Compare the frozen original with the corrected preview using the same display stretch.", "Display stretch": "Apply a temporary stretch for preview visibility. Does not permanently stretch the corrected output.", "Show estimated fog/cloud mask": "Show the estimated diffuse-background excess as a colored overlay. It is a diagnostic estimate, not a direct measurement of atmospheric cloud.", "Fog mask sensitivity": "Higher values reveal weaker estimated background excess in the overlay. Does not change correction strength.", "Show target protection mask (yellow)": "Show or hide the target-protection overlay. Hiding it does not disable protection.", "Intensity (%)": "Strength of the fitted background correction. 0 leaves the image unchanged; 100 uses the full fitted correction.", "Load / freeze source": "Capture the selected linear source as the baseline for fitting and preview comparisons.", "Load source": "Capture the selected source as the baseline for correction.", "Load selected image": "Freeze the selected linear source as the baseline for gradient fitting and preview comparisons.", "Refresh references": "Refresh the list of open background-reference images and previews.", "Cancel correction": "Request cancellation of the current correction operation.", "Re-detect target mask": "Rebuild automatic target protection from the frozen source. Review and refine the new mask before correcting.", "Build gradient map / preview": "Fit the background model and prepare the corrected preview from the current samples, reference and masks.", "Create corrected image": "Create a separate full-resolution corrected image using the current model and Intensity setting.", "Save gradient JSON": "Save correction settings, measurements and diagnostic information as JSON for review or feedback.", "Start / resume": "Analyze the selected image and start training, or resume its saved session.", "Blind labels": "Hide recipe identities while comparing candidate images to reduce selection bias.", "Choose selected": "Record your selected candidate and advance one training step.", "None acceptable": "Skip an initial group without choosing a winner, or retain the current parent during refinement.", "Inspect selected": "Open an enlarged preview of the selected candidate for closer comparison.", "Explain choice": "Show the recommendation reasoning and available information for the current candidate.", "Restart Phase 2": "Keep the initial group winners and begin a new refinement session.", "Create native-size image": "Render the selected final recipe at the original source resolution as a new image.", "Load preference JSON": "Load previous preferences before starting a new training session.", "Save progress / preferences": "Save training progress, selections, comments and learned preference information as JSON.", "Send Training Data to Don": "Export the training JSON and open the upload page. Complete the file selection and upload in your browser.", "Correct Magenta Stars": "Apply selective magenta-star correction to the working copy. Source pixels remain unchanged.", "Refresh Preview": "Rebuild the preview from the current controls.", "Create Stretched Image": "Create a new full-resolution stretched star image. Leaves the original source unchanged.", "Reset to Original": "Reload the original star image and reset the working adjustments.", "Stretch Strength": "How strongly the stellar brightness distribution is stretched. Higher values reveal more faint stars.", "Color Preservation": "Amount of original star color retained during stretching.", "Star Saturation": "Star-color saturation multiplier. 1 retains the baseline saturation; lower values mute color and higher values intensify it.", "Highlight Protection": "Reduce excessive brightening of star highlights during stretching.", "Background Suppression": "Suppress residual dark background around the stars. Excessive values can remove faint stellar signal.", "Magenta Correction": "Strength of the selective reduction of unwanted magenta star color.", "+": "Zoom in on the image preview. Mouse wheel up also zooms in.", "−": "Zoom out of the image preview, down to fit-to-window. Mouse wheel down also zooms out."};
function STHoverExplain(text){var key=String(text).replace(/:+\s*$/,"").trim();
   if(STHoverCaptions[key])return STHoverCaptions[key];
   if(/^Select /.test(key)||/^Candidate /.test(key))return "Select this candidate preview. Use the confirmation control to continue with your choice.";
   if(/^Stretch Aggressiveness/.test(key))return "Choose how gentle or strong the initial stretch will be.";
   if(/^Remove Color/.test(key))return "Remove the optional color and brightness finishing pass.";
   return "";}
function STHoverAttach(control,text){if(text&&!control.toolTip)control.toolTip=text;return control;}
function STHoverNumericText(control,text,kind){if(kind===2)control.slider.toolTip=text;control.edit.toolTip=text;control.label.toolTip=text;return text;}
function STHoverCaption(control,text,kind){var help=control.toolTip||STHoverExplain(text);if(help){control.toolTip=help;if(kind)STHoverNumericText(control,help,kind);}return text;}

/* Performance release: shared detector cache/bulk pixel buffers and regenerate timings. */
/* Installation: download this .txt source and rename it to .js locally.
 */

/*
 * SmartMask.txt
 * Standalone PixInsight Smart Mask
 * Version 0.1.5
 *
 * Uses the same SmartMaskEngine.txt detection code embedded by Smart Stretch.
 * Create Mask produces a conventional full-resolution grayscale PixInsight
 * image window suitable for use as an image mask.
 */
#feature-id    Utilities > Smart Mask
#feature-info  Structure-aware nebula/galaxy mask generation with faint-wisp recovery.
#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
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

SmartTools.percentile=function(a,p){
   if(!a.length)return 0;
   a.sort(function(x,y){return x-y;});
   return a[Math.max(0,Math.min(a.length-1,Math.round(p*(a.length-1))))];
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

// Embedded SmartMaskEngine support.
function SmartMaskEngine()
{
}

SmartMaskEngine.cache=null;

SmartMaskEngine.percentile = SmartTools.percentile;

function SMEBuffer(w,h){if(typeof w=="object"){this.width=w.width;this.height=w.height;this.data=w.data.slice();}
   else{this.width=w;this.height=h;this.data=new Array(w*h);for(var i=0;i<this.data.length;i++)this.data[i]=0;}}

SmartMaskEngine.boxMean=function(src,r){var W=src.width,H=src.height,stride=W+1,a=new Array((W+1)*(H+1));
   for(var i=0;i<a.length;i++)a[i]=0;
   for(var y=0;y<H;y++){var sum=0;for(var x=0;x<W;x++){sum+=src.data[y*W+x];a[(y+1)*stride+x+1]=a[y*stride+x+1]+sum;}}
   var out=new SMEBuffer(W,H);for(var y=0;y<H;y++)for(var x=0;x<W;x++){
      var x0=Math.max(0,x-r),x1=Math.min(W,x+r+1),y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
      out.data[y*W+x]=(a[y1*stride+x1]-a[y0*stride+x1]-a[y1*stride+x0]+a[y0*stride+x0])/((x1-x0)*(y1-y0));}return out;
};

SmartMaskEngine.clearCache=function(){SmartMaskEngine.cache=null;};

SmartMaskEngine.prepare=function(src){var t=SmartTools.now(),W=src.width,H=src.height,C=src.numberOfChannels;
   var planes=[SmartTools.readPlane(src,0)];if(C>=3){planes.push(SmartTools.readPlane(src,1));planes.push(SmartTools.readPlane(src,2));}
   var lum=new SMEBuffer(W,H);for(var i=0;i<W*H;i++)lum.data[i]=C<3?planes[0][i]:.2126*planes[0][i]+.7152*planes[1][i]+.0722*planes[2][i];
   var cache=SmartMaskEngine.cache,hit=!!(cache&&cache.width==W&&cache.height==H);
   if(hit)for(var i=0;i<lum.data.length;i++)if(lum.data[i]!==cache.lum.data[i]){hit=false;break;}
   if(!hit)cache=SmartMaskEngine.cache={width:W,height:H,lum:lum,maps:{},stats:null,robust:null};
   console.writeln("[Smart Mask Perf] Bulk source / exact cache check: "+SmartTools.elapsed(t)+"; "+(hit?"HIT":"MISS")+"; pixels="+W*H);
   return cache;
};

SmartMaskEngine.generateLegacy = function(src,options,progress)
{
   var W=src.width,H=src.height;
   var sensitivity=Math.max(0,Math.min(1,options.sensitivity));
   var wisps=Math.max(0,Math.min(1,options.wisps));
   var suppressStars=options.suppressStars!==false;
   var mode=options.mode||"auto";

   function report(p,t){if(progress)progress(p,t);}

   report(2,"Building luminance map…");
   var prepared=SmartMaskEngine.prepare(src),lum=prepared.lum,prepStart=SmartTools.now();
   var samples=[],step=Math.max(1,Math.floor(Math.sqrt(W*H/60000)));
   for(var sy=0;sy<H;sy+=step)
      for(var sx=0;sx<W;sx+=step)samples.push(lum.sample(sx,sy,0));

   if(!prepared.stats)prepared.stats={bg:SmartMaskEngine.percentile(samples,0.22),p50:SmartMaskEngine.percentile(samples,0.50),p70:SmartMaskEngine.percentile(samples,0.70)};
   var adaptive=options.algorithm=="adaptive",floor=adaptive?1e-8:1e-5;
   var robust=adaptive?SmartMaskEngine.robustStats(prepared):null;
   var bg=adaptive?robust.bg:prepared.stats.bg;
   var p50=prepared.stats.p50;
   var p70=prepared.stats.p70;
   var noise=adaptive?robust.noise:Math.max(1.0e-5,Math.max((p70-bg)/1.45,(p50-bg)/0.75));

   if(mode=="auto")
   {
      var bright=0,thr=bg+4.2*noise,total=0;
      for(var ay=0;ay<H;ay+=3)for(var ax=0;ax<W;ax+=3)
      {++total;if(lum.sample(ax,ay,0)>thr)++bright;}
      mode=(bright/Math.max(1,total)<0.030)?"galaxy":"nebula";
   }

   report(12,"Measuring local and broad structure…");
   var map=prepared.maps[mode],mapHit=!!map;
   if(!map)map=prepared.maps[mode]={small:SmartMaskEngine.boxMean(lum,mode=="galaxy"?3:4),medium:SmartMaskEngine.boxMean(lum,mode=="galaxy"?10:14),large:SmartMaskEngine.boxMean(lum,mode=="galaxy"?24:38)};
   var small=map.small,medium=map.medium,large=map.large;
   console.writeln("[Smart Mask Perf] Statistics / multiscale maps: "+SmartTools.elapsed(prepStart)+"; "+(mapHit?"HIT":"MISS"));var stage=SmartTools.now();

   var seed=new SMEBuffer(W,H,1),candidate=new SMEBuffer(W,H,1);
   var seedThreshold=bg+noise*(3.2-1.8*sensitivity);
   var faintSigma=2.0-1.45*wisps; // 2 sigma down toward ~0.55 sigma
   var faintThreshold=bg+noise*faintSigma;

   report(30,"Finding object anchors and faint nebulosity…");
   for(var y=0;y<H;++y)
      for(var x=0;x<W;++x)
      {
         var v=lum.sample(x,y,0),sm=small.sample(x,y,0);
         var mm=medium.sample(x,y,0),lm=large.sample(x,y,0);

         // Core compression: saturating confidence rather than linear brightness.
         var z=(sm-seedThreshold)/Math.max(noise,floor);
         var core=z>0 ? 1-Math.exp(-0.85*z) : 0;
         core=Math.min(0.82,core); // core is an anchor, not a dominant white blob

         // Local-background residuals recover diffuse structure even when its
         // absolute level is far below the bright core.
         var broadZ=(mm-Math.max(bg,lm))/Math.max(noise,floor);
         var broad=Math.max(0,Math.min(1,(broadZ+0.15)/(1.8-1.25*wisps)));
         var absoluteFaint=Math.max(0,Math.min(1,(mm-faintThreshold)/
            Math.max(noise*(2.4-1.2*wisps),floor)));
         var filament=Math.max(0,Math.min(1,(sm-mm)/(2.2*noise)));

         var anchor=Math.max(core,0.70*broad);
         var faint=Math.max(absoluteFaint,0.65*broad,0.45*filament);

         if(suppressStars)
         {
            var spike=Math.max(0,(v-sm)/(3.5*noise));
            if(spike>0.7 && broad<0.35)
            {
               anchor*=0.18;
               faint*=0.25;
            }
         }
         seed.setSample(Math.max(0,Math.min(1,anchor)),x,y,0);
         candidate.setSample(Math.max(0,Math.min(1,faint)),x,y,0);
      }

   // Connected faint-structure growth. This is the important difference from
   // simply lowering a global threshold: faint signal is favored when it is
   // spatially connected to already-confident object structure.
   report(55,"Growing into connected faint wisps…");
   console.writeln("[Smart Mask Perf] Seeds / candidates: "+SmartTools.elapsed(stage));stage=SmartTools.now();
   var grow=new SMEBuffer(seed),spare=new SMEBuffer(seed);
   var iterations=Math.round(2+8*wisps);
   for(var it=0;it<iterations;++it)
   {
      var prev=grow,tmp=spare;for(var cp=0;cp<prev.data.length;cp++)tmp.data[cp]=prev.data[cp];grow=tmp;spare=prev;
      for(var gy=1;gy<H-1;++gy)
         for(var gx=1;gx<W-1;++gx)
         {
            var c=candidate.sample(gx,gy,0);
            if(c<=0.01)continue;
            var n=0;
            for(var dy=-1;dy<=1;++dy)
               for(var dx=-1;dx<=1;++dx)
                  if(dx!=0||dy!=0)n=Math.max(n,prev.sample(gx+dx,gy+dy,0));
            var propagated=n*c*(0.82+0.16*wisps);
            if(propagated>grow.sample(gx,gy,0))
               grow.setSample(propagated,gx,gy,0);
         }

   }

   console.writeln("[Smart Mask Perf] Connected growth: "+SmartTools.elapsed(stage)+"; iterations="+iterations+"; two buffers");stage=SmartTools.now();
   report(80,"Feathering Smart Mask…");
   var feather=SmartMaskEngine.boxMean(grow,mode=="galaxy"?2:3);
   var out=new SMEBuffer(W,H,1);
   for(var fy=0;fy<H;++fy)
      for(var fx=0;fx<W;++fx)
      {
         var m=Math.max(feather.sample(fx,fy,0),
                        0.55*candidate.sample(fx,fy,0)*grow.sample(fx,fy,0));
         // Lift genuine faint membership while keeping the compressed core.
         m=Math.pow(Math.max(0,Math.min(1,m)),0.78);
         out.setSample(Math.min(0.88,m),fx,fy,0);
      }

   lum.free();small.free();medium.free();large.free();
   seed.free();candidate.free();grow.free();feather.free();
   report(100,"Smart Mask ready");
   var mask=new Image(W,H,1);SmartTools.writePlane(mask,out.data,0);
   console.writeln("[Smart Mask Perf] Feather / bulk output: "+SmartTools.elapsed(stage));
   return {mask:mask,mode:mode,background:bg,noise:noise};
};

SmartMaskEngine.robustStats=function(prepared){
 if(prepared.robust)return prepared.robust;
 var W=prepared.width,H=prepared.height,a=prepared.lum.data,v=[],diff=[],step=Math.max(1,Math.ceil(Math.sqrt(W*H/50000)));
 for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step)v.push(a[y*W+x]);
 var cutoff=SmartMaskEngine.percentile(v,.60),bg=SmartMaskEngine.percentile(v,.22);
 for(y=0;y<H-1;y+=step)for(x=0;x<W-1;x+=step){var i=y*W+x;if(a[i]<=cutoff){if(a[i+1]<=cutoff)diff.push(a[i+1]-a[i]);if(a[i+W]<=cutoff)diff.push(a[i+W]-a[i]);}}
 var med=SmartMaskEngine.percentile(diff,.5),dev=[];for(var i=0;i<diff.length;i++)dev.push(Math.abs(diff[i]-med));
 return prepared.robust={bg:bg,median:SmartMaskEngine.percentile(v,.5),noise:Math.max(1e-8,1.4826*SmartMaskEngine.percentile(dev,.5)/Math.sqrt(2)),count:diff.length};
};

SmartMaskEngine.generate=function(src,options,progress){
 options=options||{};if(!options.algorithm)options.algorithm="adaptive";var result=SmartMaskEngine.generateLegacy(src,options,progress);
 result.algorithm=options.algorithm=="legacy"?"legacy":"adaptive";
 console.writeln("[Smart Mask] "+result.algorithm+" background="+result.background+" noise="+result.noise);
 return result;
};

#define VERSION "0.1.9"


function SmartMaskProgressDialog()
{
   this.__base__=Dialog;
   this.__base__();
   var self=this;
   this.windowTitle="Smart Mask — Processing";
   this.userResizable=false;
   this.progressValue=0;

   this.message=new Label(this);
   this.message.wordWrapping=true;
   this.message.text="Processing…";

   this.bar=new Control(this);
   this.bar.setFixedSize(390,24);
   this.bar.onPaint=function(x0,y0,x1,y1)
   {
      var g=new Graphics(this);
      try
      {
         g.fillRect(0,0,this.width,this.height,new Brush(0xff20252c));
         var w=Math.max(0,Math.min(this.width-2,
            Math.round((this.width-2)*self.progressValue/100)));
         if(w>0)g.fillRect(1,1,1+w,this.height-1,new Brush(0xff4f9fe8));
         g.pen=new Pen(0xff707984);
         g.drawLine(0,0,this.width-1,0);
         g.drawLine(0,this.height-1,this.width-1,this.height-1);
         g.drawLine(0,0,0,this.height-1);
         g.drawLine(this.width-1,0,this.width-1,this.height-1);
      }
      finally{g.end();}
   };

   this.percent=new Label(this);
   this.percent.text="0%";
   this.percent.textAlignment=TextAlign_HorzCenter;

   this._stBody=new VerticalSizer;
   this._stBody.margin=12;
   this._stBody.spacing=8;
   this._stBody.add(this.message);
   this._stBody.add(this.bar);
   this._stBody.add(this.percent);
   STScreenFit.adjust(this);

   this.setProgress=function(value,message)
   {
      self.progressValue=Math.max(0,Math.min(100,value));
      if(message!=null)self.message.text=message;
      self.percent.text=Math.round(self.progressValue)+"%";
      self.bar.update();
      processEvents();
   };

   // No Cancel button: processing is intentionally locked until completion.
   this.onClose=function(){SmartMaskEngine.clearCache();};
}
SmartMaskProgressDialog.prototype=new Dialog;

function SmartMaskStandaloneDialog()
{
   this.__base__=Dialog;
   this.__base__();
   var self=this;
   this.windowTitle="Smart Mask "+VERSION;
   this.userResizable=true;
   this.sourceView=ImageWindow.activeWindow.isNull ? null : ImageWindow.activeWindow.currentView;
   this.workingImage=null;
   this.maskImage=null;
   this.previewBitmap=null;
   this.previewDisplayX=0;this.previewDisplayY=0;
   this.previewSourceImage=null;
   this.mode="auto";
   this.baseDetectedMask=null;
   this.lassoMode="subtract";
   this.lassoDrawing=false;
   this.lassoPoints=[];
   this.progressDialog=null;
   this.processing=false;

   this.preview=new ScrollBox(this);
   this.preview.autoScroll=false;
   this.preview.frameStyle=FrameStyle_Box;
   SmartTools.setPreviewSize(this.preview);
   this.preview.viewport.onPaint=function(x0,y0,x1,y1)
   {
      var g=new Graphics(this);
      try
      {
         g.fillRect(x0,y0,x1,y1,new Brush(0xff101010));
         if(self.previewBitmap!=null)
            g.drawBitmap(self.previewDisplayX,self.previewDisplayY,self.previewBitmap);
         if(self.lassoDrawing && self.lassoPoints.length>0 &&
            self.previewBitmap!=null && self.maskImage!=null)
         {
            g.pen=new Pen(0xffffff00,2);
            var sx=self.previewBitmap.width/self.maskImage.width;
            var sy=self.previewBitmap.height/self.maskImage.height;
            for(var li=1;li<self.lassoPoints.length;++li)
               g.drawLine(
                  self.previewDisplayX+Math.round(self.lassoPoints[li-1].x*sx),
                  self.previewDisplayY+Math.round(self.lassoPoints[li-1].y*sy),
                  self.previewDisplayX+Math.round(self.lassoPoints[li].x*sx),
                  self.previewDisplayY+Math.round(self.lassoPoints[li].y*sy));
         }
      }finally{g.end();}
   };

   this.title=new Label(this);this.title.useRichText=true;
   this.title.text="<b>SMART MASK</b><br/><i>Create a conventional PixInsight mask image.</i>";
   this.detectGroup=new Control(this);
   this.auto_Radio=new RadioButton(this.detectGroup);this.auto_Radio.text=STHoverCaption(this.auto_Radio,"Auto",0);this.auto_Radio.checked=true;
   this.nebula_Radio=new RadioButton(this.detectGroup);this.nebula_Radio.text=STHoverCaption(this.nebula_Radio,"Nebula",0);
   this.galaxy_Radio=new RadioButton(this.detectGroup);this.galaxy_Radio.text=STHoverCaption(this.galaxy_Radio,"Galaxy",0);

   this.sensitivity=new NumericControl(this);this.sensitivity.label.text=STHoverCaption(this.sensitivity,"Detection Sensitivity",2);
   this.sensitivity.setRange(0,100);this.sensitivity.slider.setRange(0,100);
   this.sensitivity.setPrecision(0);this.sensitivity.setValue(55);
   this.wisps=new NumericControl(this);this.wisps.label.text=STHoverCaption(this.wisps,"Include Faint Wisps",2);
   this.wisps.setRange(0,100);this.wisps.slider.setRange(0,100);
   this.wisps.setPrecision(0);this.wisps.setValue(70);
   this.algorithm=STHoverAttach(new ComboBox(this),"Choose the automatic detection algorithm: Adaptive (MAD) or the legacy method.");
   this.algorithm.addItem("Adaptive (MAD)");
   this.algorithm.addItem("Legacy");
   this.algorithm.currentItem=0;
   this.stars=new CheckBox(this);this.stars.text=STHoverCaption(this.stars,"Suppress stars during detection",0);this.stars.checked=true;
   this.lassoGroup=new Control(this);
   this.lassoKeep=new RadioButton(this.lassoGroup);this.lassoKeep.text=STHoverCaption(this.lassoKeep,"Keep Inside",0);
   this.lassoSubtract=new RadioButton(this.lassoGroup);this.lassoSubtract.text=STHoverCaption(this.lassoSubtract,"Subtract",0);this.lassoSubtract.checked=true;
   this.lassoClear=new PushButton(this);this.lassoClear.text=STHoverCaption(this.lassoClear,"Clear Lasso Edits",0);
   this.status=new Label(this);this.status.wordWrapping=true;this.status.text="Ready.";
   this.reset=new PushButton(this);this.reset.text=STHoverCaption(this.reset,"Reset",0);
   this.cancel_Button=new PushButton(this);this.cancel_Button.text=STHoverCaption(this.cancel_Button,"Cancel",0);
   this.create_Button=new PushButton(this);this.create_Button.text=STHoverCaption(this.create_Button,"Create Mask",0);

   var modes=new HorizontalSizer;modes.spacing=8;modes.add(this.auto_Radio);
   modes.add(this.nebula_Radio);modes.add(this.galaxy_Radio);modes.addStretch();
   var controls=new VerticalSizer;controls.spacing=8;controls.add(this.title);
   this.detectGroup.sizer=modes;controls.add(this.detectGroup);controls.add(this.sensitivity);controls.add(this.wisps);
   controls.add(this.algorithm);controls.add(this.stars);
   var lm=new HorizontalSizer;lm.spacing=8;lm.add(this.lassoKeep);lm.add(this.lassoSubtract);lm.addStretch();
   this.lassoGroup.sizer=lm;controls.add(this.lassoGroup);controls.add(this.lassoClear);controls.add(this.status);controls.addStretch();controls.add(this.reset);
   var body=new HorizontalSizer;body.spacing=10;body.add(this.preview,100);body.add(STScreenFit.panel(this,controls));
   var bottom=new HorizontalSizer;bottom.spacing=8;bottom.addStretch();
   bottom.add(this.cancel_Button);bottom.add(this.create_Button);
   this._stBody=new VerticalSizer;this._stBody.margin=10;this._stBody.spacing=8;
   this._stBody.add(body,100);this._stBody.add(bottom);this._stFooter=bottom;

   this.showProgress=function(message)
   {
      self.processing=true;
      self.progressDialog=new SmartMaskProgressDialog;
      self.progressDialog.message.text=message;
      self.progressDialog.show();
      self.progressDialog.setProgress(0,message);
   };

   this.updateProgress=function(value,message)
   {
      if(self.progressDialog!=null)
         self.progressDialog.setProgress(value,message);
   };

   this.hideProgress=function()
   {
      if(self.progressDialog!=null)
      {
         self.progressDialog.hide();
         self.progressDialog=null;
         processEvents();
      }
      self.processing=false;
   };

   this.fit=function(img)
   {
      var vw=Math.max(1,self.preview.viewport.width-4),vh=Math.max(1,self.preview.viewport.height-4);
      var sc=Math.min(vw/img.width,vh/img.height),d=new Image(img);
      if(Math.abs(sc-1)>1e-6)d.resample(sc);
      self.previewBitmap=d.render();d.free();
      self.previewDisplayX=Math.max(0,Math.floor((self.preview.viewport.width-self.previewBitmap.width)/2));
      self.previewDisplayY=Math.max(0,Math.floor((self.preview.viewport.height-self.previewBitmap.height)/2));
      self.preview.viewport.update();
   };

   this.prepareWorking=function()
   {
      if(self.sourceView==null)return false;
      var src=self.sourceView.image;
      var scale=Math.min(1,1280/src.width,760/src.height);
      self.workingImage=new Image(src);
      if(scale<0.999999)self.workingImage.resample(scale);
      return true;
   };

   this.pointInLasso=function(x,y,p)
   {
      var inside=false;
      for(var i=0,j=p.length-1;i<p.length;j=i++)
      {
         var xi=p[i].x,yi=p[i].y,xj=p[j].x,yj=p[j].y;
         if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)==0?1e-12:(yj-yi))+xi))inside=!inside;
      }
      return inside;
   };
   this.rebuildMaskPreview=function()
   {
      var src=self.workingImage,W=src.width,H=src.height,C=src.numberOfChannels,d=new Image(src);
      for(var y=0;y<H;++y)for(var x=0;x<W;++x)
      {
         var m=self.maskImage.sample(x,y,0),a=.68*m;
         if(C>=3&&m>.005){d.setSample(d.sample(x,y,0)*(1-a)+a,x,y,0);
         d.setSample(d.sample(x,y,1)*(1-a),x,y,1);d.setSample(d.sample(x,y,2)*(1-a)+.72*a,x,y,2);}
      }
      if(self.previewSourceImage!=null)self.previewSourceImage.free();
      self.previewSourceImage=new Image(d);d.free();self.fit(self.previewSourceImage);
   };
   this.applyLasso=function()
   {
      if(self.maskImage==null||self.lassoPoints.length<3)return;
      var W=self.maskImage.width,H=self.maskImage.height,radius=Math.max(2,Math.min(W,H)*.015);
      var keep=new SMEBuffer(W,H),pixels=SmartTools.readPlane(self.maskImage,0);
      for(var y=0;y<H;++y)for(var x=0;x<W;++x){var inside=self.pointInLasso(x+.5,y+.5,self.lassoPoints);
         keep.data[y*W+x]=(self.lassoMode=="subtract"? !inside:inside)?1:0;}
      var soft=SmartMaskEngine.boxMean(keep,Math.ceil(radius));
      for(var i=0;i<pixels.length;i++){var t=Math.max(0,Math.min(1,soft.data[i]));pixels[i]*=t*t*(3-2*t);}
      SmartTools.writePlane(self.maskImage,pixels,0);
      self.lassoPoints=[];self.lassoDrawing=false;self.rebuildMaskPreview();
   };
   this.regenerate=function()
   {
      var perfStart=SmartTools.now();
      if(self.workingImage==null || self.processing)return;
      if(!self.auto_Radio.checked&&!self.nebula_Radio.checked&&!self.galaxy_Radio.checked)
      {self.auto_Radio.checked=true;self.mode="auto";}
      if(!self.lassoKeep.checked&&!self.lassoSubtract.checked)
      {self.lassoSubtract.checked=true;self.lassoMode="subtract";}
      self.showProgress("Analyzing image for Smart Mask…");
      try
      {
         var r=SmartMaskEngine.generate(self.workingImage,{
            mode:self.mode,sensitivity:self.sensitivity.value/100,
            wisps:self.wisps.value/100,suppressStars:self.stars.checked,
            algorithm:self.algorithm.currentItem==0?"adaptive":"legacy"
         },function(p,t)
         {
            self.status.text=t+" "+Math.round(p)+"%";
            self.updateProgress(p,t);
         });

         self.updateProgress(94,"Building Smart Mask preview…");
         if(self.maskImage!=null)self.maskImage.free();
         self.maskImage=r.mask;
         if(self.baseDetectedMask!=null)self.baseDetectedMask.free();
         self.baseDetectedMask=new Image(self.maskImage);
         self.lassoPoints=[];
         self.lassoDrawing=false;
         self.rebuildMaskPreview();
         self.updateProgress(100,"Smart Mask ready");
         self.status.text=(r.mode=="nebula"?"Nebula":"Galaxy")+
            " structure detected — "+(self.algorithm.currentItem==0?"Adaptive (MAD)":"Legacy")+" — drag preview to lasso refine.";
      }
      finally
      {
         console.writeln("[Smart Mask Perf] Regenerate total: "+SmartTools.elapsed(perfStart));self.hideProgress();
      }
   };

   this.lassoKeep.onCheck=function(v)
   {
      if(v){self.lassoSubtract.checked=false;self.lassoMode="keep";}
      else if(!self.lassoSubtract.checked)
      {self.lassoSubtract.checked=true;self.lassoMode="subtract";}
   };
   this.lassoSubtract.onCheck=function(v)
   {
      if(v){self.lassoKeep.checked=false;self.lassoMode="subtract";}
      else if(!self.lassoKeep.checked)
      {self.lassoSubtract.checked=true;self.lassoMode="subtract";}
   };
   this.lassoClear.onClick=function(){if(self.baseDetectedMask==null)return;if(self.maskImage!=null)self.maskImage.free();
      self.maskImage=new Image(self.baseDetectedMask);self.lassoPoints=[];self.rebuildMaskPreview();};
   this.preview.viewport.onMousePress=function(x,y,button,buttons,modifiers)
   {if(self.processing||self.maskImage==null||self.previewBitmap==null)return;var ix=(x-self.previewDisplayX)*self.maskImage.width/self.previewBitmap.width;
    var iy=(y-self.previewDisplayY)*self.maskImage.height/self.previewBitmap.height;if(ix<0||iy<0||ix>=self.maskImage.width||iy>=self.maskImage.height)return;
    self.lassoDrawing=true;self.lassoPoints=[{x:ix,y:iy}];};
   this.preview.viewport.onMouseMove=function(x,y,buttonState,modifiers)
   {if(!self.lassoDrawing)return;var ix=(x-self.previewDisplayX)*self.maskImage.width/self.previewBitmap.width;
    var iy=(y-self.previewDisplayY)*self.maskImage.height/self.previewBitmap.height;ix=Math.max(0,Math.min(self.maskImage.width-1,ix));iy=Math.max(0,Math.min(self.maskImage.height-1,iy));
    var n=self.lassoPoints.length;if(n==0||Math.abs(ix-self.lassoPoints[n-1].x)+Math.abs(iy-self.lassoPoints[n-1].y)>1.5)self.lassoPoints.push({x:ix,y:iy});self.preview.viewport.update();};
   this.preview.viewport.onMouseRelease=function(){if(self.lassoDrawing)self.applyLasso();};
   this.auto_Radio.onCheck=function(v)
   {
      if(v){self.nebula_Radio.checked=false;self.galaxy_Radio.checked=false;self.mode="auto";self.regenerate();}
      else if(!self.nebula_Radio.checked&&!self.galaxy_Radio.checked)
      {self.auto_Radio.checked=true;self.mode="auto";}
   };
   this.nebula_Radio.onCheck=function(v)
   {
      if(v){self.auto_Radio.checked=false;self.galaxy_Radio.checked=false;self.mode="nebula";self.regenerate();}
      else if(!self.auto_Radio.checked&&!self.galaxy_Radio.checked)
      {self.auto_Radio.checked=true;self.mode="auto";}
   };
   this.galaxy_Radio.onCheck=function(v)
   {
      if(v){self.auto_Radio.checked=false;self.nebula_Radio.checked=false;self.mode="galaxy";self.regenerate();}
      else if(!self.auto_Radio.checked&&!self.nebula_Radio.checked)
      {self.auto_Radio.checked=true;self.mode="auto";}
   };
   this.sensitivity.onValueUpdated=function(){self.status.text="Sensitivity: "+self.sensitivity.value.toFixed(0)+" (release slider to detect)";};
   this.sensitivity.slider.onMouseRelease=function(){self.regenerate();};
   this.wisps.onValueUpdated=function(){self.status.text="Faint Wisps: "+self.wisps.value.toFixed(0)+" (release slider to detect)";};
   this.wisps.slider.onMouseRelease=function(){self.regenerate();};
   SmartTools.configureNumericInput(this.sensitivity,function(){self.regenerate();});
   SmartTools.configureNumericInput(this.wisps,function(){self.regenerate();});
   this.algorithm.onItemSelected=function(index){self.algorithm.currentItem=index;self.regenerate();};
   this.stars.onCheck=function(){self.regenerate();};
   this.reset.onClick=function(){
      self.mode="auto";self.auto_Radio.checked=true;self.nebula_Radio.checked=false;self.galaxy_Radio.checked=false;
      self.lassoMode="subtract";self.lassoKeep.checked=false;self.lassoSubtract.checked=true;
      self.algorithm.currentItem=0;self.sensitivity.setValue(55);self.wisps.setValue(70);self.stars.checked=true;self.regenerate();};
   this.cancel_Button.onClick=function(){if(!self.processing)self.cancel();};

   this.create_Button.onClick=function()
   {
      if(self.sourceView==null || self.maskImage==null || self.processing)return;

      self.showProgress("Creating full-resolution mask from approved preview…");
      var fullMask=null;
      try
      {
         var src=self.sourceView.image;
         var W=src.width,H=src.height;
         var mw=self.maskImage.width,mh=self.maskImage.height;

         // Construct the destination at the exact source dimensions. This
         // avoids Image.resample() dimension rounding (for example 7777x5093).
         fullMask=new Image(W,H,1);

         for(var y=0;y<H;++y)
         {
            var sy=(H>1)?y*(mh-1)/(H-1):0;
            var y0=Math.floor(sy),y1=Math.min(mh-1,y0+1),fy=sy-y0;

            for(var x=0;x<W;++x)
            {
               var sx=(W>1)?x*(mw-1)/(W-1):0;
               var x0=Math.floor(sx),x1=Math.min(mw-1,x0+1),fx=sx-x0;

               // Bilinear interpolation preserves the approved soft mask.
               var a=self.maskImage.sample(x0,y0,0);
               var b=self.maskImage.sample(x1,y0,0);
               var c=self.maskImage.sample(x0,y1,0);
               var d=self.maskImage.sample(x1,y1,0);
               var top=a+(b-a)*fx;
               var bot=c+(d-c)*fx;
               fullMask.setSample(top+(bot-top)*fy,x,y,0);
            }

            if((y&31)==0)
            {
               var p=5+85*y/Math.max(1,H-1);
               self.status.text="Creating full-resolution mask… "+Math.round(p)+"%";
               self.updateProgress(p,"Mapping approved mask to exact source dimensions…");
            }
         }

         self.updateProgress(92,"Creating PixInsight mask image…");
         var id=self.sourceView.id+"_SmartMask";
         var win=new ImageWindow(W,H,1,32,true,false,id);
         win.mainView.beginProcess();
         win.mainView.image.assign(fullMask);
         win.mainView.endProcess();
         fullMask.free();
         fullMask=null;

         self.updateProgress(98,"Displaying mask image…");
         win.show();
         win.zoomToFit();
         self.updateProgress(100,"Mask created");
         self.status.text="Created "+win.mainView.id+" from approved Smart Mask";
      }
      finally
      {
         if(fullMask!=null)fullMask.free();
         self.hideProgress();
      }
      self.ok();
   };

   this.onShow=function(){if(self.prepareWorking())self.regenerate();};
   this.onResize=function(){if(self.previewSourceImage!=null)self.fit(self.previewSourceImage);};
   this.auto_Radio.checked=true;this.nebula_Radio.checked=false;this.galaxy_Radio.checked=false;this.mode="auto";
   this.lassoKeep.checked=false;this.lassoSubtract.checked=true;this.lassoMode="subtract";
   STScreenFit.adjust(this);
}
SmartMaskStandaloneDialog.prototype=new Dialog;

if(ImageWindow.activeWindow.isNull)
   (new MessageBox("Open an image before running Smart Mask.","Smart Mask",StdIcon_Error,StdButton_Ok)).execute();
else
   STScreenFit.execute(new SmartMaskStandaloneDialog);
