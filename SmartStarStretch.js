// Standalone PixInsight script. Rename SmartStarStretch.txt to SmartStarStretch.js before running.
/* Suite native zoom 1.0:. Fit / 1:1; original-resolution tiles at 50%+. */
#include <pjsr/SampleType.jsh>
/* Screen-fit layout update 1.0.1. */
/* 0.1.10: Preserve core brightness with lift-only highlight protection; stronger halo correction response. */
/* 0.1.6: Display-only +/- and mouse-wheel zoom, matching the other Smart Suite previews. */
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


/* 0.1.5: Strength 0-15, conservative Quick Stretch, smooth low-brightness halo correction. */
/* 0.1.4: Native New Instance/Apply icons; replace Create Stretched Image with Undo-enabled source Apply. */
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

/* 0.1.2: Remove SPCC UI/code; serialized coalesced previews and null-safe cleanup. Initial stretch equations unchanged from 0.1.1. */
/* Installation: download this .txt source and rename it to .js locally.
 */

/* Smart Star Stretch — PixInsight PJSR, v0.1.0
 * Standalone RGB/narrowband star stretch with non-destructive reference.
 * Apply modifies the source with native Undo.
 */
#feature-id Utilities > Smart Star Stretch
#feature-info Color-preserving star stretch with native Undo with source-calibrated stretch.
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
#include <pjsr/ButtonCodes.jsh>
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

#define VERSION "0.1.16"

function SmartStarStretchDialog(){
   this.__base__=Dialog;this.__base__();var self=this;
   this.windowTitle="Smart Star Stretch v"+VERSION;
   this.userResizable=true;
   this.magentaSteps=[];this.source=null;this.original=null;this.calibrated=null;this.previewWindow=null;
   this.lastResult=null;this.previewBitmap=null;this.previewBusy=false;this.previewPending=false;this.previewClosed=false;this.draggingSlider=null;
   this.previewTimer=new Timer;this.previewTimer.singleShot=true;this.previewTimer.interval=.08;
   this.previewTimer.onTimeout=function(){if(self.draggingSlider){self.previewPending=true;return;}if(!self.previewClosed)self.refresh();};
   this.queuePreview=function(){if(self.previewClosed||!self.calibrated)return;self.previewPending=true;if(self.draggingSlider){self.previewTimer.stop();return;}if(self.previewBusy)return;self.previewTimer.stop();self.previewTimer.interval=.08;self.previewTimer.start();};
   this.updateBusyControls=function(){var controls=[self.stretchCurve,self.newInstanceButton,self.sourceList,self.quickButton,self.magentaButton,self.applyButton,self.resetButton,self.refreshButton];for(var i=0;i<controls.length;i++)if(controls[i])controls[i].enabled=!self.previewBusy;};
   this.onClose=function(){if(self.previewBusy)return false;self.shutdown();return true;};
   this.sourceList=STHoverAttach(new ComboBox(this),"Choose the open RGB star image to stretch.");this.sourceList.addItem("Select RGB star image");
   var windows=ImageWindow.windows;
   for(var i=0;i<windows.length;i++)if(windows[i].mainView.image.numberOfChannels>=3)
      this.sourceList.addItem(windows[i].mainView.id);
   this.sourceList.onItemSelected=function(index){if(index>0)self.loadSource(self.sourceList.itemText(index));};
   this.status=new Label(this);this.status.wordWrapping=true;this.status.text="Select an RGB image to begin.";
   this.previewScroll=new ScrollBox(this);SmartTools.setPreviewSize(this.previewScroll);this.preview=this.previewScroll.viewport;this.previewZoom=new STPreviewZoom(this,this.previewScroll,function(){return self.previewBitmap;});
   this.preview.onPaint=function(x0,y0,x1,y1){
      var g=new Graphics(this);
      try{
         g.fillRect(0,0,this.width,this.height,new Brush(0xff17191d));
         if(self.previewBitmap){
            var bmp=self.previewBitmap;
            // Preview window is reduced to fit; center the resulting bitmap.
            self.previewZoom.paint(g);g.drawBitmap(0,0,bmp);self.previewZoom.nativeTiles.paint(g);
         }
      }finally{g.end();}
   };
   function slider(title,a,b,val,prec){
      var q=new NumericControl(self);q.label.text=STHoverCaption(q,title,2);q.setRange(a,b);
      q.slider.setRange(0,1000);q.setPrecision(prec||2);q.setValue(val);
      q.onValueUpdated=function(){self.queuePreview();};
      q.slider.onMousePress=function(x,y,button){if(button!=MouseButton_Left)return;self.draggingSlider=q.slider;self.previewTimer.stop();};
      q.slider.onMouseRelease=function(){if(self.draggingSlider===q.slider)self.draggingSlider=null;self.queuePreview();};
      q.slider.onMouseMove=function(x,y,buttons){if(self.draggingSlider===q.slider&&typeof buttons=="number"&&!(buttons&MouseButton_Left)){self.draggingSlider=null;self.queuePreview();}};
      SmartTools.configureNumericInput(q);
      return q;
   }
   this.stretchCurve=new ComboBox(this);this.stretchCurve.addItem("Star curve — rational");this.stretchCurve.addItem("Legacy — asinh");this.stretchCurve.currentItem=0;this.stretchCurve.toolTip="Rational: gain = 3 raised to Stretch Strength, matching the scalar curve shown in your reference. Uses linked luminance to preserve color. Legacy restores the previous asinh curve. Changing curve keeps the current strength.";this.stretchCurve.onItemSelected=function(){self.queuePreview();};
   this.strength=slider("Stretch Strength",0,15,5,1);this.strength.toolTip="Stretch amount from 0 to 15. Zero disables the stretch curve; other adjustments remain independent.";
   this.color=slider("Color Preservation",0,1,1,2);
   this.saturation=slider("Star Saturation",0,2,1,2);
   this.highlight=slider("Highlight Protection",0,1,.5,2);this.highlight.toolTip="Gently limit added stretch lift while retaining existing core brightness. Zero stretch no longer dims cores through this control.";
   this.black=slider("Background Suppression",0,.2,0,3);
   this.magenta=slider("Magenta Correction",0,1,.65,2);
   this.halo=slider("Halo Correction",0,1,0,2);this.halo.toolTip="Stronger suppression of faint star wings, up to 99% at maximum. Bright cores remain protected by the smooth brightness transition. Can also dim faint stars. Zero disables halo correction.";
   this.mode=STHoverAttach(new ComboBox(this),"Choose Auto/RGB, Broadband RGB or Narrowband stars to guide star-stretch calibration.");this.mode.addItem("Auto / RGB");this.mode.addItem("Broadband RGB");
   this.mode.addItem("Narrowband stars");
   this.quickButton=new PushButton(this);this.quickButton.text=STHoverCaption(this.quickButton,"Quick Stretch",0);
   this.quickButton.onClick=function(){self.quick();};
   this.magentaButton=new PushButton(this);this.magentaButton.text=STHoverCaption(this.magentaButton,"Correct Magenta Stars",0);
   this.magentaButton.onClick=function(){self.correctMagenta();};
   this.refreshButton=new PushButton(this);this.refreshButton.text=STHoverCaption(this.refreshButton,"Refresh Preview",0);
   this.refreshButton.onClick=function(){self.refresh();};
   this.newInstanceButton=new ToolButton(this);this.newInstanceButton.icon=this.scaledResource(":/process-interface/new-instance.png");this.newInstanceButton.setFixedSize(24,24);this.newInstanceButton.toolTip="New Instance — drag onto the workspace to save stretch settings and magenta corrections.";
   this.newInstanceButton.onMousePress=function(x,y,button){if(button!=MouseButton_Left||self.previewBusy||self.previewClosed)return;this.hasFocus=true;this.pushed=false;try{Parameters.set("sssState",JSON.stringify(self.captureInstance()));self.newInstance();}catch(e){new MessageBox(String(e),self.windowTitle,StdIcon_Error,StdButton_Ok).execute();}};
   this.applyButton=new ToolButton(this);this.applyButton.icon=this.scaledResource(":/process-interface/apply.png");this.applyButton.setFixedSize(24,24);this.applyButton.toolTip="Apply the star stretch to the source image at full resolution. PixInsight Undo is available.";
   this.applyButton.onClick=function(){self.apply();};
   this.resetButton=new PushButton(this);this.resetButton.text=STHoverCaption(this.resetButton,"Reset to Original",0);
   this.resetButton.onClick=function(){self.reset();};
   var left=new VerticalSizer;left.spacing=6;
   left.add(this.sourceList);left.add(this.mode);
   left.add(this.stretchCurve);left.add(this.strength);left.add(this.color);left.add(this.saturation);
   left.add(this.highlight);left.add(this.black);left.add(this.magenta);left.add(this.halo);
   left.add(this.quickButton);left.add(this.magentaButton);left.add(this.refreshButton);
   left.add(this.resetButton);left.add(this.status);
   var main=new HorizontalSizer;main.margin=10;main.spacing=10;
   var previewColumn=new VerticalSizer;previewColumn.spacing=4;previewColumn.add(this.previewScroll,100);previewColumn.add(this.previewZoom.row);main.add(STScreenFit.panel(this,left));main.add(previewColumn,100);var footer=new HorizontalSizer;footer.spacing=6;footer.add(this.newInstanceButton);footer.add(this.applyButton);footer.addStretch();this._stBody=new VerticalSizer;this._stBody.margin=6;this._stBody.spacing=6;this._stBody.add(main,100);this._stBody.add(footer);this._stFooter=footer;
   this.previewZoom.install();STScreenFit.adjust(this);
   var active=ImageWindow.activeWindow;
   if(active&&!active.isNull){for(var j=1;j<this.sourceList.numberOfItems;j++)
      if(this.sourceList.itemText(j)==active.mainView.id){this.sourceList.currentItem=j;this.loadSource(active.mainView.id);break;}}
}
SmartStarStretchDialog.prototype=new Dialog;
SmartStarStretchDialog.prototype.constructor=SmartStarStretchDialog;
function SSSCloseWindow(w){if(w&&!w.isNull)w.forceClose();}
SmartStarStretchDialog.prototype.closeTemp=function(){var w=this.previewWindow;this.previewWindow=null;this.previewBitmap=null;if(this.previewZoom)this.previewZoom.update();SSSCloseWindow(w);};
SmartStarStretchDialog.prototype.shutdown=function(){this.previewClosed=true;this.previewPending=false;this.previewTimer.stop();this.closeTemp();};
SmartStarStretchDialog.prototype.loadSource=function(id){
   if(this.previewBusy||this.previewClosed)return;
   var w=ImageWindow.windowById(id);
   if(!w||w.isNull||w.mainView.image.numberOfChannels<3){this.status.text="RGB image required";return;}
   this.magentaSteps=[];this.closeTemp();this.previewZoom.factor=1;this.previewScroll.horizontalScrollPosition=0;this.previewScroll.verticalScrollPosition=0;this.source=w;this.original=new Image(w.mainView.image);
   this.calibrated=new Image(this.original);
   this.lastResult=null;this.status.text="Original linear reference stored in memory. Source remains unchanged.";
   this.refresh();
};
// Shared RGB gain: retain color ratios and bound the brightest output channel.
function SSSAsinh(v){return Math.log(v+Math.sqrt(1+v*v));}
// Use a high percentile of peak RGB samples, rather than the much fainter
// majority of star-wing samples that drove the previous Quick Stretch too far.
function SSSStarLevel(im){
 var levels=[],step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/100000)));
 for(var y=0;y<im.height;y+=step)for(var x=0;x<im.width;x+=step){var v=Math.max(im.sample(x,y,0),im.sample(x,y,1),im.sample(x,y,2));if(isFinite(v)&&v>1e-10)levels.push(v);}
 if(!levels.length)throw new Error("No positive star signal in this image.");
 return Math.max(1e-10,SmartTools.percentile(levels,.999));
}
function SSSStretchValue(v,strength,curve){if(curve===0){var gain=Math.pow(3,Math.max(0,Math.min(15,strength)));return gain*v/(1+(gain-1)*v);}var k=Math.pow(10,strength*.32)-1;return k>1e-10?SSSAsinh(k*v)/SSSAsinh(k):v;}
function SSSProtectHighlight(z,v,hp){return z/(1+.25*hp*Math.max(0,z-v));}
function SSSHaloGain(p,amount){var u=SSSSmooth((p-.02)/.28);return 1-.99*Math.sqrt(Math.max(0,Math.min(1,amount)))*(1-u);}
function SSSQuickStrength(level,hp,curve){
 var lo=0,hi=15,target=.25;
 for(var i=0;i<48;i++){var m=(lo+hi)/2,z=SSSStretchValue(level,m,curve),out=SSSProtectHighlight(z,level,hp);if(out<target)lo=m;else hi=m;}
 return Math.max(0,Math.min(15,(lo+hi)/2));
}
var SSS_SYMBOLS="sssY,sssV,sssZ,sssRatio,sssPeak,sssGamut,sssP,sssU,sssHalo";
SmartStarStretchDialog.prototype.quick=function(){
 if(!this.calibrated)return;
 try{var level=SSSStarLevel(this.calibrated),hp=.35;
  this.highlight.setValue(hp);this.color.setValue(1);this.black.setValue(0);
  this.strength.setValue(SSSQuickStrength(level,hp,this.stretchCurve.currentItem));this.refresh();
  this.status.text="Gentle Quick Stretch calibrated to bright-star samples; strength "+this.strength.value.toFixed(1)+".";
 }catch(e){this.status.text="Quick Stretch failed: "+e;}
};
SmartStarStretchDialog.prototype.expression=function(){
 var k=Math.pow(10,Math.max(0,Math.min(15,this.strength.value))*.32)-1,cp=this.color.value,sat=this.saturation.value,hp=this.highlight.value,bg=this.black.value,halo=this.halo.value;
 var gain=Math.pow(3,Math.max(0,Math.min(15,this.strength.value)));
 var z=this.stretchCurve.currentItem===0?gain.toPrecision(17)+"*sssV/(1+"+(gain-1).toPrecision(17)+"*sssV)":k>1e-10?"ln("+k.toPrecision(17)+"*sssV+sqrt(1+"+(k*k).toPrecision(17)+"*sssV*sssV))/"+SSSAsinh(k).toPrecision(17):"sssV";
 // All channels receive the same halo gain, preserving their color ratios.
 // The halo operation is brightness-based: no hard mask edge or spatial ring.
 return "sssY=.2126*$T[0]+.7152*$T[1]+.0722*$T[2];sssV=max(0,sssY-"+bg.toPrecision(17)+");sssZ="+z+";sssZ=sssZ/(1+"+(.25*hp).toPrecision(17)+"*max(0,sssZ-sssV));sssRatio=sssZ/max(1e-12,sssY);sssPeak=sssY+"+(cp*sat).toPrecision(17)+"*(max($T[0],max($T[1],$T[2]))-sssY);sssGamut=max(1,sssPeak*sssRatio);sssP=min(1,max(0,sssPeak*sssRatio/sssGamut));sssU=min(1,max(0,(sssP-.02)/.28));sssHalo=1-"+(.99*Math.sqrt(halo)).toPrecision(17)+"*(1-sssU*sssU*(3-2*sssU));min(1,max(0,(sssY+"+(cp*sat).toPrecision(17)+"*($T-sssY))*sssRatio/sssGamut*sssHalo))";
};
SmartStarStretchDialog.prototype.makePreviewSource=function(){
   // Preserve native star cores through exactly the same processing as Apply.
   return SmartTools.copyWindow(this.calibrated,"SmartStar_Preview");
};
SmartStarStretchDialog.prototype.reducePreview=function(tmp){
   var displayWidth=Math.max(1,this.previewScroll.width-4);
   var displayHeight=Math.max(1,this.previewScroll.height-4);
   var factor=Math.max(1,Math.ceil(Math.max(tmp.mainView.image.width/displayWidth,
      tmp.mainView.image.height/displayHeight)));
   if(factor>1){var p=new IntegerResample;p.zoomFactor=-factor;
      if(!p.executeOn(tmp.mainView))throw new Error("Preview resample failed");}
};
SmartStarStretchDialog.prototype.refresh=function(){
   if(!this.calibrated||this.previewClosed)return;
   if(this.draggingSlider){this.previewPending=true;return;}
   if(this.previewBusy){this.previewPending=true;return;}
   this.previewTimer.stop();this.previewPending=false;this.previewBusy=true;this.updateBusyControls();var t=SmartTools.now(),tmp=null;
   try{
      tmp=this.makePreviewSource();SmartTools.pixelMath(tmp.mainView,this.expression(),SSS_SYMBOLS);this.reducePreview(tmp);
      var bitmap=tmp.mainView.image.render(),old=this.previewWindow;this.previewWindow=tmp;tmp=null;this.previewBitmap=bitmap;SSSCloseWindow(old);this.previewZoom.update();this.preview.update();
      console.writeln("[Smart Star Stretch] Preview: "+SmartTools.elapsed(t));
   }catch(e){this.status.text="Preview failed: "+e;console.warningln("[Smart Star Stretch] "+e);}
   finally{SSSCloseWindow(tmp);this.previewBusy=false;this.updateBusyControls();if(this.previewPending&&!this.previewClosed){this.previewTimer.interval=.01;this.previewTimer.start();}}
};
SmartStarStretchDialog.prototype.correctMagenta=function(){
   if(!this.calibrated||this.previewBusy)return;
   this.previewTimer.stop();this.previewBusy=true;this.updateBusyControls();
   // Selective magenta reduction: only pixels with R and B above G.
   // Correction acts on working reference, leaving original untouched.
   var t=SmartTools.now(),tmp=SmartTools.copyWindow(this.calibrated,"SmartStar_Magenta");
   try{
      var a=this.magenta.value.toFixed(5);
      var R="$T[0]",G="$T[1]",B="$T[2]";
      var m="min(1,max(0,(min("+R+","+B+")-"+G+")/max(0.02,min("+R+","+B+"))))";
      // Raise green toward the average of red/blue only where magenta is detected.
      var p=new PixelMath;p.useSingleExpression=false;
      p.expression="$T";
      p.expression1="min(1,$T+"+a+"*"+m+"*max(0,("+R+"+"+B+")/2-"+G+"))";
      p.expression2="$T";
      p.generateOutput=true;p.rescale=false;p.truncate=true;p.createNewImage=false;
      if(!p.executeOn(tmp.mainView))throw new Error("Magenta PixelMath failed");
      this.calibrated=new Image(tmp.mainView.image);this.magentaSteps.push(Number(a));
      this.status.text="Selective magenta correction applied to working copy ("+SmartTools.elapsed(t)+").";
      this.refresh();
   }catch(e){this.status.text="Magenta correction failed: "+e;}
   finally{SSSCloseWindow(tmp);this.previewBusy=false;this.updateBusyControls();this.queuePreview();}
};
SmartStarStretchDialog.prototype.apply=function(){
   if(!this.calibrated||this.previewBusy)return;this.previewTimer.stop();this.previewBusy=true;this.updateBusyControls();var t=SmartTools.now(),tmp=null;
   try{
      SATRunProgress('Smart Star Stretch — Applying',function(report){report(10,"Copying calibrated source");tmp=SmartTools.copyWindow(this.calibrated,"SmartStar_Stretched");
      report(30,"Stretching stars");SmartTools.pixelMath(tmp.mainView,this.expression(),SSS_SYMBOLS);
      if(!this.source||this.source.isNull)throw new Error("Source image has been closed.");
      var target=this.source.mainView;if(target.image.width!=this.original.width||target.image.height!=this.original.height||target.image.numberOfChannels!=this.original.numberOfChannels)throw new Error("Source geometry changed. Reload the source before applying.");
      report(80,"Writing the result");target.beginProcess();try{target.image.assign(tmp.mainView.image);}finally{target.endProcess();}
      this.original=new Image(target.image);this.calibrated=new Image(this.original);this.magentaSteps=[];this.previewPending=true;
      this.status.text="Star stretch applied to "+target.id+" (Undo available; "+SmartTools.elapsed(t)+").";
   }.bind(this));}catch(e){this.status.text="Apply failed: "+e;console.warningln("[Smart Star Stretch] "+e);}
   finally{SSSCloseWindow(tmp);this.previewBusy=false;this.updateBusyControls();if(this.previewPending)this.queuePreview();}
};
SmartStarStretchDialog.prototype.reset=function(){
   if(!this.original)return;
   this.calibrated=new Image(this.original);this.magentaSteps=[];
   this.status.text="Restored original linear reference.";this.refresh();
};
SmartStarStretchDialog.prototype.captureInstance=function(){if(!this.source||this.source.isNull||!this.calibrated)throw new Error("Select a source image first.");return {schema:1,viewId:this.source.mainView.id,strength:this.strength.value,stretchCurve:this.stretchCurve.currentItem,color:this.color.value,saturation:this.saturation.value,highlight:this.highlight.value,black:this.black.value,magenta:this.magenta.value,halo:this.halo.value,mode:this.mode.currentItem,magentaSteps:this.magentaSteps.slice()};};
SmartStarStretchDialog.prototype.restoreInstance=function(state,target){
 if(!state||state.schema!==1)throw new Error("Invalid Smart Star Stretch instance.");var ranges={strength:[0,100],color:[0,1],saturation:[0,2],highlight:[0,1],black:[0,.2],magenta:[0,1]};
 for(var key in ranges){var v=state[key];if(typeof v!="number"||!isFinite(v)||v<ranges[key][0]||v>ranges[key][1])throw new Error("Invalid star stretch setting: "+key);}
 if(state.halo!=null&&(typeof state.halo!="number"||!isFinite(state.halo)||state.halo<0||state.halo>1))throw new Error("Invalid halo correction setting.");
 if(state.stretchCurve!=null&&state.stretchCurve!==0&&state.stretchCurve!==1)throw new Error("Invalid stretch curve.");
 var steps=state.magentaSteps||[];if(!Array.isArray(steps)||steps.some(function(v){return typeof v!="number"||!isFinite(v)||v<0||v>1;}))throw new Error("Invalid magenta correction history.");
 var view=target||View.viewById(state.viewId);if(!view||view.isNull||view.isPreview)throw new Error("Select an RGB main image for this instance.");this.loadSource(view.id);if(!this.source||this.source.mainView.id!=view.id)throw new Error("Instance source could not be loaded.");
 for(var i=0;i<steps.length;i++){this.magenta.setValue(steps[i]);this.correctMagenta();if(this.magentaSteps.length!=i+1)throw new Error("Unable to restore magenta correction.");}
 this.stretchCurve.currentItem=state.stretchCurve==null?1:state.stretchCurve;
 for(key in ranges)this[key].setValue(key=="strength"?Math.min(15,state[key]):state[key]);this.halo.setValue(state.halo==null?0:state.halo);this.updateBusyControls();this.mode.currentItem=Math.max(0,Math.min(2,state.mode||0));this.previewTimer.stop();this.refresh();
};
function SSSSmooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}
function main(){console.show();var dlg=new SmartStarStretchDialog;try{var state=Parameters.has("sssState")?JSON.parse(Parameters.getString("sssState")):null,target=Parameters.isViewTarget?Parameters.targetView:null;if(state)dlg.restoreInstance(state,target);else if(target)dlg.loadSource(target.id);if(Parameters.isViewTarget)dlg.apply();else STScreenFit.execute(dlg);}catch(e){new MessageBox(String(e),"Smart Star Stretch",StdIcon_Error,StdButton_Ok).execute();}finally{dlg.shutdown();}}
main();
