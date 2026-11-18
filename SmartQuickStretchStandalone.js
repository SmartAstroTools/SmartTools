// Standalone PixInsight script. Rename SmartQuickStretchStandalone.txt to SmartQuickStretchStandalone.js before running.
/* Smart Quick Stretch Standalone 0.2.31 — 2026-11-17
   Rename this file to SmartQuickStretchStandalone.js and run it in PixInsight.
   No SmartTools, SmartMaskEngine, trainer, JSON, or other companion files needed.
   The pjsr headers below belong to the standard PixInsight installation.
   All application helpers and analysis recipes are embedded in this file.
   Processing algorithms and defaults are retained from Quick Stretch 0.2.30.
   Standard PJSR imports are placed before all application code.
*/
#feature-id Utilities > Smart Quick Stretch Standalone
#feature-info Smart Quick Stretch Standalone 0.2.31: bundled analysis and SmartTools; no companion scripts.
#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>

/* Timed comparison: OPTIMIZED. Reports real Image Analysis elapsed time including setup and cleanup; excludes chooser interaction and final full-resolution output. */
/* Image Analysis acceleration 1.0: native preview paths, bulk JS fallback/scoring, 64 MiB recipe cache. */
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

/* October 12, 2026 build: paired-M42 reference calibration, bounded highlight tradeoff,
   brighter reference-like HDR candidates in existing slots; galaxy paths unchanged.
   Local tests use area-averaged FITS proxies; PixInsight runtime retest required. */
/* Smart Quick Stretch 0.2.2 — October 12, 2026.
   Adds STF-Style / Image Analysis starting chooser, palette selection,
   cancellable analysis progress, and full-resolution recipe replay.
   Analysis engine is bundled; no new dependencies. PixInsight retest required.
   Installation: rename SmartQuickStretchStandalone.txt to SmartQuickStretchStandalone.js; run in
   PixInsight. All required SmartTools / SmartMaskEngine code is bundled here.
   No external helper scripts are required. Existing suite files are unchanged.
   Select a floating-point grayscale or RGB main image, Continue, inspect the
   Quick chooser, then OK to create a separate full-resolution output image.
   Cancel creates no output. The original image is never processed in place.
   Controls and processing are extracted from current SmartStretch.txt v87,
   SmartTools.txt v18 and SmartMaskEngine.txt v22. Current default: aggression
   50, linear endpoints ON, Auto High Contrast ON, Faint Nebulosity OFF (.35),
   Auto Color/Brightness OFF (brightness .35, vibrance .25).
   Preview uses the same fitted half-size working-image construction. Native
   Apply retains preview-derived STF parameters, recalculates native extrema,
   uses the original-source faint guide, and preserves later pass order.
   Validated native paths are retained, with full exact JS fallback on failure.
   Source code is standalone; PixInsight runtime/GUI testing is outstanding.
   Trainer preference-file integration remains a future feature; automatic Image Analysis uses the trainer scoring engine.
*/
// 0.2.30: render finished analysis recipe directly; no automatic extra shadow lift
// or endpoint normalization; analysis uses the same 600x400 source reduction as Trainer.
var SQS_VERSION="0.2.31 Standalone";
// Bundled SmartTools.txt
/* SmartTools 0.5.1 — shared PixInsight PJSR utilities.
 * Embedded suite utilities.
 * Adds native selection-mask expressions and Color Mapper helpers for
 * SmartCurvesTransform.js; existing Stretch/Mask/Star functions are unchanged.
 */
var SmartTools = typeof SmartTools === "undefined" ? {} : SmartTools;

// Common display size for Smart Stretch, both Smart Mask dialogs and Star Stretch.
SmartTools.previewWidth=1280;
SmartTools.previewHeight=760;

SmartTools.now=function(){return new Date().getTime();};
SmartTools.elapsed=function(t){return ((SmartTools.now()-t)/1000).toFixed(2)+" s";};

SmartTools.percentile=function(a,p){
   if(!a.length)return 0;
   a.sort(function(x,y){return x-y;});
   return a[Math.max(0,Math.min(a.length-1,Math.round(p*(a.length-1))))];
};


SmartTools.configurePixelMath=function(p,bits){
   p.clearImageCacheAndExit=false;p.cacheGeneratedImages=false;
   p.generateOutput=true;p.singleThreaded=false;p.optimization=true;
   p.use64BitWorkingImage=bits!==32;p.createNewImage=false;
   p.rescale=false;p.truncate=true;p.truncateLower=0;p.truncateUpper=1;
   return p;
};


// Exact parameter preparation removes pow/asinh/clamp work from pixel loops.

// LUTs are opt-in per cell, with exact evaluation for steep/unsafe cells.
// Validate quarter/mid/three-quarter interpolation AND gain error: RGB scales
// amplify errors at low signal. This is empirical validation, not a proof.


// Shared box mean keeps the original clipped-edge summed-area behavior.
SmartTools.boxSignalMean=function(image,radius,signalAt)
{
      var W=image.width,H=image.height;
      var stride=W+1;
      var integral=new Array((W+1)*(H+1));
      for(var z=0;z<integral.length;++z)integral[z]=0;
      for(var y=0;y<H;++y)
      {
         var row=0;
         for(var x=0;x<W;++x)
         {
            row+=signalAt(image,x,y);
            integral[(y+1)*stride+(x+1)]=
               integral[y*stride+(x+1)]+row;
         }
      }
      var mean=new Image(W,H,1);
      for(var yy=0;yy<H;++yy)
         for(var xx=0;xx<W;++xx)
         {
            var x0=Math.max(0,xx-radius),x1=Math.min(W-1,xx+radius);
            var y0=Math.max(0,yy-radius),y1=Math.min(H-1,yy+radius);
            var A=integral[y0*stride+x0];
            var B=integral[y0*stride+(x1+1)];
            var C=integral[(y1+1)*stride+x0];
            var D=integral[(y1+1)*stride+(x1+1)];
            mean.setSample((D-B-C+A)/((x1-x0+1)*(y1-y0+1)),xx,yy,0);
         }
      return mean;
};


// Use the process default identity STF; do not assume View.stf row ordering.
// This changes display transfer only, never the committed image samples.


// Hidden native workspace, owned by one dialog. Never pool the external view.
// One slot per purpose bounds memory; shape/precision changes close old slots.
SmartTools.acquireWindow=function(pool,key,w,h,c,bits,color){
   var slot=pool[key];
   if(slot && (slot.width!=w || slot.height!=h || slot.channels!=c || slot.bits!=bits)){
      slot.window.forceClose();delete pool[key];slot=null;
   }
   if(!slot){
      var win=new ImageWindow(w,h,c,bits,true,color,"SmartStretch_"+key);
      try{win.hide();}catch(e){win.forceClose();throw e;}
      slot={window:win,width:w,height:h,channels:c,bits:bits};pool[key]=slot;
   }
   return slot.window;
};
SmartTools.closeWindowPool=function(pool){
   if(!pool)return;
   for(var key in pool)if(pool.hasOwnProperty(key)){
      try{pool[key].window.forceClose();}catch(e){}
      delete pool[key];
   }
};
// Nonuniform native LUT coordinate: fourth-root distance to the symmetry point.
// Dense knots around SP avoid the large errors of a uniform linear-signal LUT.
// Seven interior probes per cell gate the complete table; a failed table is
// never used. This is empirical validation, not a mathematical error proof.


// These helpers are for private, disposable windows only. The external target
// always keeps its ordinary Undo-enabled beginProcess()/endProcess() transaction.
SmartTools.beginPrivateProcess=function(view){
   if(typeof UndoFlag_NoSwapFile!="undefined")view.beginProcess(UndoFlag_NoSwapFile);
   else view.beginProcess();
};


// Piecewise uniform gain lookup: affine indexing within each segment.
// Refine near high curvature without a per-pixel nonlinear coordinate map.
// Seven probes per cell gate admission; native preflight/validation remain mandatory.


// Keep NumericControl's evaluate(), precision, range checks and slider mapping.
// Text commits only on blur; never connect onTextUpdated to processing.
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

/* Smart Curves additions: existing Stretch/Mask/Star entry points unchanged. */


// Source is an explicit original-image identifier, never the transformed target.
// All operations use the same 12% smooth edges / normalized RGB metric as Stretch.


// Explicit full rectangle/channel avoids dependence on current Image selections.
SmartTools.readPlane=function(im,ch){var a=[];
   if(typeof im.getSamples=="function")im.getSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)a.push(im.sample(x,y,ch));
   if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");return a;
};
SmartTools.writePlane=function(im,a,ch){if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");
   if(typeof im.setSamples=="function")im.setSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)im.setSample(a[y*im.width+x],x,y,ch);
};

// Bundled SmartMaskEngine.txt
/* Performance build 0.2.1: exact-checked bounded cache, bulk planes, two growth buffers. */


/*
 * SmartMaskEngine.txt
 * Shared Smart Mask detection engine for Smart Stretch and standalone Smart Mask.
 * Version 0.2.0
 *
 * Input images are expected to be RGB or grayscale PixInsight Image objects.
 * Returned masks are grayscale Image objects with values in [0,1].
 */

function SmartMaskEngine()
{
}

SmartMaskEngine.cache=null;
SmartMaskEngine.percentile = SmartTools.percentile;

// Array-backed detector buffers eliminate per-pixel native API crossings.
function SMEBuffer(w,h){if(typeof w=="object"){this.width=w.width;this.height=w.height;this.data=w.data.slice();}
   else{this.width=w;this.height=h;this.data=new Array(w*h);for(var i=0;i<this.data.length;i++)this.data[i]=0;}}


 // JS arrays are collected; cached planes remain owned by the cache.
SmartMaskEngine.boxMean=function(src,r){var W=src.width,H=src.height,stride=W+1,a=new Array((W+1)*(H+1));
   for(var i=0;i<a.length;i++)a[i]=0;
   for(var y=0;y<H;y++){var sum=0;for(var x=0;x<W;x++){sum+=src.data[y*W+x];a[(y+1)*stride+x+1]=a[y*stride+x+1]+sum;}}
   var out=new SMEBuffer(W,H);for(var y=0;y<H;y++)for(var x=0;x<W;x++){
      var x0=Math.max(0,x-r),x1=Math.min(W,x+r+1),y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
      out.data[y*W+x]=(a[y1*stride+x1]-a[y0*stride+x1]-a[y1*stride+x0]+a[y0*stride+x0])/((x1-x0)*(y1-y0));}return out;
};

SmartMaskEngine.prepare=function(src){var t=SmartTools.now(),W=src.width,H=src.height,C=src.numberOfChannels;
   var planes=[SmartTools.readPlane(src,0)];if(C>=3){planes.push(SmartTools.readPlane(src,1));planes.push(SmartTools.readPlane(src,2));}
   var lum=new SMEBuffer(W,H);for(var i=0;i<W*H;i++)lum.data[i]=C<3?planes[0][i]:.2126*planes[0][i]+.7152*planes[1][i]+.0722*planes[2][i];
   var cache=SmartMaskEngine.cache,hit=!!(cache&&cache.width==W&&cache.height==H);
   if(hit)for(var i=0;i<lum.data.length;i++)if(lum.data[i]!==cache.lum.data[i]){hit=false;break;}
   if(!hit)cache=SmartMaskEngine.cache={width:W,height:H,lum:lum,maps:{},stats:null,robust:null};
   console.writeln("[Smart Mask Perf] Bulk source / exact cache check: "+SmartTools.elapsed(t)+"; "+(hit?"HIT":"MISS")+"; pixels="+W*H);
   return cache;
};


/*
 * Structure-aware detection.
 *
 * Bright cores are deliberately compressed: once a pixel is confidently part
 * of the object, additional brightness contributes little additional mask
 * weight. Faint wisps are detected from broad/local-background residuals and
 * then admitted preferentially when connected to confident object structure.
 */
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
   var bg=prepared.stats.bg;
   var p50=prepared.stats.p50;
   var p70=prepared.stats.p70;
   var noise=Math.max(1.0e-5,Math.max((p70-bg)/1.45,(p50-bg)/0.75));

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
         var z=(sm-seedThreshold)/Math.max(noise,1.0e-5);
         var core=z>0 ? 1-Math.exp(-0.85*z) : 0;
         core=Math.min(0.82,core); // core is an anchor, not a dominant white blob

         // Local-background residuals recover diffuse structure even when its
         // absolute level is far below the bright core.
         var broadZ=(mm-Math.max(bg,lm))/Math.max(noise,1.0e-5);
         var broad=Math.max(0,Math.min(1,(broadZ+0.15)/(1.8-1.25*wisps)));
         var absoluteFaint=Math.max(0,Math.min(1,(mm-faintThreshold)/
            Math.max(noise*(2.4-1.2*wisps),1.0e-5)));
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

// Adaptive mode uses robust median/MAD background statistics. Legacy remains
// available as an exact baseline for visual A/B testing.
SmartMaskEngine.generate = function(src,options,progress)
{
   options=options||{};
   var t0=new Date().getTime(),t=t0;
   function mark(name)
   {
      var now=new Date().getTime();
      console.writeln("[Smart Mask] "+name+": "+((now-t)/1000).toFixed(3)+" s");
      t=now;
   }
   if(options.algorithm=="legacy")
   {
      var old=SmartMaskEngine.generateLegacy(src,options,progress);
      mark("Legacy detection");
      return old;
   }
   var result=SmartMaskEngine.generateLegacy(src,options,progress),prepared=SmartMaskEngine.cache;
   mark("Multiscale structure and connected-wisp detection");
   var W=src.width,H=src.height,step=Math.max(1,Math.ceil(Math.sqrt(W*H/50000))),stats=prepared.robust;
   if(!stats){var vals=[];for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step){var v=prepared.lum.data[y*W+x];if(isFinite(v))vals.push(v);}
      var median=SmartMaskEngine.percentile(vals,.5),dev=[];for(var i=0;i<vals.length;i++)dev.push(Math.abs(vals[i]-median));
      stats=prepared.robust={median:median,noise:Math.max(1e-5,1.4826*SmartMaskEngine.percentile(dev,.5)),bg:SmartMaskEngine.percentile(vals,.22),count:vals.length};}
   var median=stats.median,noise=stats.noise,bg=stats.bg;
   mark("Robust statistics cache");
   // Confidence gating: suppress isolated low-confidence background,
   // while retaining connected faint wisps already found by the detector.
   var threshold=Math.max(0.015,Math.min(0.11,0.035+0.015*
      (0.5-(options.sensitivity===undefined?0.55:options.sensitivity))));
   var mask=result.mask;
   var pixels=SmartTools.readPlane(mask,0);for(var i=0;i<pixels.length;i++)if(pixels[i]<threshold)pixels[i]=pixels[i]*pixels[i]/threshold;SmartTools.writePlane(mask,pixels,0);
   mark("Adaptive confidence cleanup");
   result.robustMedian=median;
   result.robustNoise=noise;
   result.background=bg;
   result.algorithm="adaptive";
   console.writeln("[Smart Mask] median="+median.toFixed(6)+
      " MADsigma="+noise.toFixed(6)+" background="+bg.toFixed(6)+
      " samples="+stats.count+" total="+((new Date().getTime()-t0)/1000).toFixed(3)+" s");
   return result;
};
function smoothStep01( t )
{
   t=Math.max(0,Math.min(1,t));
   return t*t*(3-2*t);
}
function percentileFromSortedArray( a, p )
{
   if ( a.length == 0 )
      return 0;

   var q = Math.max( 0, Math.min( 1, p ) )*(a.length-1);
   var i0 = Math.floor( q );
   var i1 = Math.min( a.length-1, i0+1 );
   var f = q-i0;
   return a[i0]*(1-f) + a[i1]*f;
}

/* SmartStretchAnalysis 0.1.0. Embedded stretch analysis.
   Analysis/stretch engine extracted from SmartStretchTrainer 0.5.28.
   Contains no launcher. QuickStretch uses the trainer equations and quality scoring. */

/* 0.5.31: Remove unavailable FITSKeyword.jsh include; FITSKeyword is a built-in PJSR class. */
/* 0.5.30: Phase 1 optional final Auto High Contrast (off/mild/full), persisted and replayed at native resolution. */
/* 0.5.29: M42 paired-reference preference for similar broadband HDR nebulae; galaxy scoring unchanged. */
/* 0.5.27: Persistent gradient results, broad/local checks, background/noise/color scoring, settings-only Blind labels, safe optional replay fields. */
/* 0.5.26: Phase progress, truly blind labels, no Undo UI, adaptive refinement range, identical-winner shortcut, advisory linear gradient check/correction handoff. */
/* 0.5.25: Default new-session Stars selection to Starless. */
/* 0.5.24: Remove optional reference-image list, display button and handler. */

var SST_TARGETS=["Mixed bright / faint nebula","Faint filaments / Spaghetti","Emission nebula","Reflection / dust nebula","Galaxy","Globular cluster","Open cluster / star field","Planetary nebula","Other"];
var SST_FAMILIES=["Quick STF","Conservative black MTF","Zero black MTF","Linked luminance MTF","Linked luminance asinh","Linked luminance log","Linked luminance gamma","Two-stage luminance MTF","Protected luminance MTF"];
var SST_TARGET_MEDIANS=[.12,.16,.20,.25,.30,.35,.40,.45,.50];

var SST_PALETTES=["Broadband RGB","SHO","HOO"];

function SSTDistribution(values){
 if(!values.length)return null;values.sort(function(a,b){return a-b;});
 var median=SSTPercentile(values,.5),d=[];for(var i=0;i<values.length;i++)d.push(Math.abs(values[i]-median));d.sort(function(a,b){return a-b;});
 return {count:values.length,min:values[0],max:values[values.length-1],median:median,robustSpreadSigma:1.4826*SSTPercentile(d,.5),p01:SSTPercentile(values,.01),p05:SSTPercentile(values,.05),p10:SSTPercentile(values,.10),p20:SSTPercentile(values,.20),p90:SSTPercentile(values,.90),p99:SSTPercentile(values,.99),p995:SSTPercentile(values,.995),p999:SSTPercentile(values,.999),p9999:SSTPercentile(values,.9999)};
}
function SSTDescribe(image,scope,limit,progress){
 var W=image.width,H=image.height,C=image.numberOfChannels;if(C!=1&&C!=3)throw new Error("Descriptor requires mono or RGB.");
 var step=Math.max(1,Math.ceil(Math.sqrt(W*H/(limit||200000)))),lum=[],planes=[],rawMin=[],rawMax=[],counts=[],samples=[],cells=[],cols=8,rows=6;
 for(var c=0;c<C;c++){planes.push([]);rawMin.push(Infinity);rawMax.push(-Infinity);counts.push({atOrBelowZero:0,nearSaturation:0,atOrAboveOne:0});}
 for(var i=0;i<cols*rows;i++)cells.push({index:i,column:i%cols,row:Math.floor(i/cols),values:[]});
 var anyNear=0,anyClipped=0,allZero=0;
 for(var y=0;y<H;y+=step){for(var x=0;x<W;x+=step){
  var xx=Math.min(W-1,x+Math.floor(step/2)),yy=Math.min(H-1,y+Math.floor(step/2)),v=[],near=false,clipped=false,zero=true;
  for(c=0;c<C;c++){var z=image.sample(xx,yy,c);if(!isFinite(z))throw new Error("Nonfinite image sample in measurements.");rawMin[c]=Math.min(rawMin[c],z);rawMax[c]=Math.max(rawMax[c],z);if(z<=0)counts[c].atOrBelowZero++;if(z>=.997){counts[c].nearSaturation++;near=true;}if(z>=1-1e-6){counts[c].atOrAboveOne++;clipped=true;}if(z>0)zero=false;v.push(SSTClamp(z,0,1));planes[c].push(v[c]);}
  if(near)anyNear++;if(clipped)anyClipped++;if(zero)allZero++;
  var signal=SSTY(v),index=Math.min(rows-1,Math.floor(yy*rows/H))*cols+Math.min(cols-1,Math.floor(xx*cols/W));lum.push(signal);cells[index].values.push(signal);samples.push({x:xx,y:yy,signal:signal});
 }if(progress&&y%(step*32)==0)progress(y/H);}
 var N=lum.length,distribution=SSTDistribution(lum),channels=[];
 for(c=0;c<C;c++)channels.push({statistics:SSTDistribution(planes[c]),rawMin:rawMin[c],rawMax:rawMax[c],atOrBelowZeroFraction:counts[c].atOrBelowZero/N,nearSaturationFraction:counts[c].nearSaturation/N,atOrAboveOneFraction:counts[c].atOrAboveOne/N});
 var regions=[],regionalMedians=[];for(i=0;i<cells.length;i++){var stats=SSTDistribution(cells[i].values);regions.push({index:i,column:cells[i].column,row:cells[i].row,statistics:stats});if(stats)regionalMedians.push(stats.median);}
 regionalMedians.sort(function(a,b){return a-b;});
 var bg=[],differences=[];for(i=0;i<samples.length;i++){var s=samples[i];if(s.signal<=distribution.p20){bg.push(s.signal);if(s.x<W-1){var next=[],valid=true;for(c=0;c<C;c++){var z=image.sample(s.x+1,s.y,c);if(!isFinite(z)){valid=false;break;}next.push(SSTClamp(z,0,1));}if(valid&&SSTY(next)<=distribution.p20)differences.push(s.signal-SSTY(next));}}}
 var background=SSTDistribution(bg),noise=SSTDistribution(differences),balance=null;
 if(C==3){var sum=channels[0].statistics.median+channels[1].statistics.median+channels[2].statistics.median;balance={channelMedianFractions:sum>1e-12?[channels[0].statistics.median/sum,channels[1].statistics.median/sum,channels[2].statistics.median/sum]:null,redMinusGreenMedian:channels[0].statistics.median-channels[1].statistics.median,blueMinusGreenMedian:channels[2].statistics.median-channels[1].statistics.median};}
 return {schema:"smart-stretch-image-descriptor-1",measurementVersion:1,scope:scope,width:W,height:H,channels:C,bitsPerSample:image.bitsPerSample,sampling:{method:"systematic cell-center samples from supplied image",step:step,sampleCount:N,sampleBudget:limit||200000,statisticsRange:"clamped to 0..1; raw extrema and clipping fractions are recorded separately",highlightPercentilesAreSampleEstimates:true},luminance:distribution,channelStatistics:channels,clipping:{nearSaturationThreshold:.997,clippedThreshold:1-1e-6,anyChannelNearSaturationFraction:anyNear/N,anyChannelClippedFraction:anyClipped/N,allChannelsAtOrBelowZeroFraction:allZero/N},background:{method:"lowest 20 percent of sampled luminance, not a sky-background mask",statistics:background},noise:{method:"robust sigma of adjacent horizontal luminance differences divided by sqrt(2), restricted to low-signal pairs",sigmaEstimate:noise&&noise.count>=16?noise.robustSpreadSigma/Math.sqrt(2):null,pairCount:noise?noise.count:0,caveat:"Heuristic; structure, gradients, correlated pixels and selection bias can affect this estimate."},spatial:{columns:cols,rows:rows,regions:regions,regionalMedianP10:SSTPercentile(regionalMedians,.10),regionalMedianP90:SSTPercentile(regionalMedians,.90)},rgbBalance:balance};
}


function SSTClamp(v,a,b){return Math.max(a,Math.min(b,v));}
function SSTPercentile(a,p){if(!a.length)return 0;var q=p*(a.length-1),i=Math.floor(q),f=q-i;return a[i]*(1-f)+a[Math.min(i+1,a.length-1)]*f;}
function SSTY(v){return v.length==1?v[0]:.2126*v[0]+.7152*v[1]+.0722*v[2];}
function SSTSampleStats(a){a.sort(function(x,y){return x-y;});var m=SSTPercentile(a,.5),d=[];for(var i=0;i<a.length;i++)d.push(Math.abs(a[i]-m));d.sort(function(x,y){return x-y;});return {median:m,sigma:1.3257*SSTPercentile(d,.5),min:a.length?a[0]:0,max:a.length?a[a.length-1]:0,p90:SSTPercentile(a,.9),p99:SSTPercentile(a,.99),count:a.length};}
function SSTMeasure(image){
 var C=image.numberOfChannels;if(C!=1&&C!=3)throw new Error("Use a grayscale or RGB image without alpha channels.");
 var a=[],lum=[],step=Math.max(1,Math.ceil(Math.sqrt(image.width*image.height/60000))),invalid=0;
 for(var c=0;c<C;c++)a.push([]);
 for(var y=0;y<image.height;y+=step)for(var x=0;x<image.width;x+=step){var v=[],valid=true;
  for(c=0;c<C;c++){var z=image.sample(x,y,c);if(!isFinite(z)){valid=false;break;}v.push(SSTClamp(z,0,1));}
  if(!valid){invalid++;continue;}for(c=0;c<C;c++)a[c].push(v[c]);lum.push(SSTY(v));
 }
 if(invalid||!lum.length)throw new Error("The statistical sample contains invalid values or is empty. Repair the source before training.");
 var stats={channels:[],luminance:SSTSampleStats(lum),sampleStep:step,width:image.width,height:image.height};
 for(c=0;c<C;c++)stats.channels.push(SSTSampleStats(a[c]));return stats;
}
function SSTMTF(x,m){if(x<=0)return 0;if(x>=1)return 1;return (1-m)*x/(m+(1-2*m)*x);}
function SSTMidtone(u,t){return SSTClamp((1-t)*u/(t+(1-2*t)*u),1e-8,1-1e-8);}
function SSTBlack(s,k){if(s.max-s.min<=1e-12||s.median>=.5)return 0;return Math.max(0,Math.min(s.median-1e-12,s.median-k*s.sigma));}
function SSTNormalized(v,b){return SSTClamp((v-b)/Math.max(1e-12,1-b),0,1);}
function SSTAsinh(x){return Math.log(x+Math.sqrt(x*x+1));}
function SSTShape(x,method,p){
 x=SSTClamp(x,0,1);if(x==0||x==1)return x;
 if(method=="asinh")return p<1e-8?x:SSTAsinh(p*x)/SSTAsinh(p);
 if(method=="log")return p<1e-8?x:Math.log(1+p*x)/Math.log(1+p);
 if(method=="gamma")return Math.pow(x,p);
 return SSTMTF(x,p);
}
function SSTSolvedShape(u,t,method){
 u=SSTClamp(u,1e-12,1-1e-12);
 if(method=="gamma")return SSTClamp(Math.log(t)/Math.log(u),.02,10);
 if(method=="mtf")return SSTMidtone(u,t);
 // Asinh/log are lifting curves only. Their finite parameter range is recorded.
 if(t<=u)return 0;
 var lo=0,hi=1e12;for(var i=0;i<90;i++){var m=(lo+hi)/2;if(SSTShape(u,method,m)<t)lo=m;else hi=m;}return (lo+hi)/2;
}
function SSTBuildRecipe(family,variant,stats){
 var t=SST_TARGET_MEDIANS[variant],p={id:"f"+family+"v"+variant,family:family,variant:variant,target:t,black:[],shape:[],method:"mtf",second:0,baseline:family==0&&variant==3};
 if(family<3){var k=family==0?2.8:4.5;
  for(var c=0;c<stats.channels.length;c++){var s=stats.channels[c],b=family==2?0:SSTBlack(s,k),m=.5;
   if(s.max-s.min>1e-12&&s.median<.5)m=SSTMidtone(SSTClamp(SSTNormalized(s.median,b),1e-12,1-1e-12),t);
   p.black.push(b);p.shape.push(m);
  }
 }else{var ls=stats.luminance,b=0,u=SSTClamp(ls.median,1e-12,1-1e-12);p.black=[b];
  p.method=family==4?"asinh":family==5?"log":family==6?"gamma":"mtf";
  if(family==7){var first=Math.min(t,.20);p.shape=[SSTSolvedShape(u,first,"mtf")];p.second=SSTMidtone(first,Math.min(.8,t+.10));}
  else if(family==8)p.shape=[SSTSolvedShape(SSTClamp(u/.7,1e-12,1-1e-12),Math.min(.95,t/.7),"mtf")];
  else p.shape=[SSTSolvedShape(u,t,p.method)];
 }return p;
}
// HDR parameters are fixed in source units and reused at native resolution.
function SSTHDRAssessment(source){
 var a={version:2,eligible:false,extendedCoreSamples:0,tailToMedian:0,
  tailToNebula:0,coreToNebula:0,coreFraction:0,reason:"No concentrated bright core"};
 if(!source)return a;
 if(source.structure&&source.structure.type=="starField"){a.reason="Dispersed stellar peaks; nebular HDR protection is inappropriate";return a;}
 var l=source.luminance,points=source.corePoints||[],bg=l.p20;
 var nebula=Math.max(1e-8,l.p90-bg),core=[];
 for(var i=0;i<points.length;i++)core.push(points[i].signal);core.sort(function(x,y){return x-y;});
 a.extendedCoreSamples=points.length;a.tailToMedian=l.p999/Math.max(1e-8,l.median);
 a.tailToNebula=Math.max(0,l.p999-bg)/nebula;
 a.coreToNebula=core.length?Math.max(0,SSTPercentile(core,.5)-bg)/nebula:0;
 var step=Math.max(1,Math.ceil(Math.sqrt(source.width*source.height/240000)));
 a.coreFraction=points.length/(Math.ceil(source.width/step)*Math.ceil(source.height/step));
 // Require spatial support, a small footprint AND strong separation from the
 // ordinary nebula. Broad signal and isolated bright stars are insufficient.
 a.eligible=points.length>=12&&a.coreFraction>=.0005&&a.coreFraction<=.035&&
  a.tailToMedian>=12&&a.tailToNebula>=10&&a.coreToNebula>=6;
 if(a.eligible)a.reason="Concentrated extended core far brighter than surrounding nebula";
 return a;
}
function SSTHDRRecipe(source,variant,group){
 var d=source.luminance,b=d.p05,span=Math.max(1e-8,d.p90-b);
 var knee=SSTClamp(b+span*(1.5+.5*(variant%3)),b+1e-7,.95);
 return {version:2,coreContrast:[.25,.50,.75][group%3],saturation:[0,.10,.20][Math.floor(group/3)],background:b,backgroundOutput:[.035,.06,.085][group%3],
  knee:knee,kneeOutput:[.36,.43,.50][variant%3],ceiling:[.88,.92,.96][Math.floor(variant/3)],
  lowShape:[1,3,8][Math.floor(variant/3)],highShape:Math.max(1,(1-knee)/Math.max(1e-8,knee-b))};
}
function SSTHDRValue(peak,h){
 if(peak<=h.background)return h.background>1e-12?h.backgroundOutput*peak/h.background:0;
 if(peak<=h.knee){var t=(peak-h.background)/(h.knee-h.background);
  return h.backgroundOutput+(h.kneeOutput-h.backgroundOutput)*SSTAsinh(h.lowShape*t)/SSTAsinh(h.lowShape);}
 var t=(peak-h.knee)/(1-h.knee);
 var q=Math.log(1+h.highShape*t)/Math.log(1+h.highShape);
 // Monotonic S curve expands central shoulder contrast without moving endpoints.
 var contrast=SSTOptional(h,"coreContrast",0);q+=contrast*q*(1-q)*(2*q-1);
 return h.kneeOutput+(h.ceiling-h.kneeOutput)*q;
}
var SST_GHS_REFERENCE={"version":1,"name":"M31 paired GHS reference","palette":"Broadband RGB","sourceStats":{"luminance":{"median":0.0031018661776557564,"p90":0.005163115330822767,"p99":0.020812958587780615},"red":{"median":0.003128099488094449,"p90":0.005142290610820055,"p99":0.021146257296204674},"green":{"median":0.0030975814443081617,"p90":0.005157549399882555,"p99":0.02075226977467537},"blue":{"median":0.0030975814443081617,"p90":0.005172808654606342,"p99":0.020172426477074623}},"curves":[[[0,0],[0.002609292743727565,0.02252821996808052],[0.002685587853193283,0.02505139261484146],[0.0027161058969795704,0.026141854003071785],[0.002731364918872714,0.026934053748846054],[0.0027466239407658577,0.027435149997472763],[0.0027618829626590014,0.027916600927710533],[0.002777141984552145,0.02841779589653015],[0.0027924010064452887,0.028919359669089317],[0.0028076600283384323,0.02944314479827881],[0.002822919050231576,0.029962625354528427],[0.0028381780721247196,0.03047950379550457],[0.0028534370940178633,0.030984096229076385],[0.002868696115911007,0.03148902207612991],[0.0028839551378041506,0.031979866325855255],[0.0028992141596972942,0.032485123723745346],[0.002914473181590438,0.03299075365066528],[0.0029297322034835815,0.03347673639655113],[0.002944991225376725,0.033955857157707214],[0.002960250247269869,0.03446175903081894],[0.0029755092691630125,0.03496812283992767],[0.002990768291056156,0.03544633835554123],[0.0030060273129493,0.035953763872385025],[0.0030212863348424435,0.03646162524819374],[0.003036545356735587,0.036955561488866806],[0.0030518043786287308,0.037435080856084824],[0.0030670634005218744,0.03793513774871826],[0.003082322422415018,0.03842977061867714],[0.0030975814443081617,0.038940101861953735],[0.0031128404662013054,0.03943559154868126],[0.003128099488094449,0.0399467796087265],[0.0031433585099875927,0.04045133292675018],[0.0031586175318807364,0.04095347225666046],[0.00317387655377388,0.041460633277893066],[0.0031891355756670237,0.041971515864133835],[0.0032043945975601673,0.04247386008501053],[0.003219653619453311,0.04299123212695122],[0.0032349126413464546,0.043491773307323456],[0.0032501716632395983,0.043991781771183014],[0.003265430685132742,0.0445067398250103],[0.0032806897070258856,0.04502211511135101],[0.0032959487289190292,0.045505356043577194],[0.003311207750812173,0.04600265249609947],[0.0033264667727053165,0.04655539616942406],[0.00334172579459846,0.047015439718961716],[0.003356984816491604,0.047494739294052124],[0.0033722438383847475,0.04803181812167168],[0.003387502860277891,0.048795994371175766],[0.003433279925957322,0.04996183328330517],[0.0034943160135298967,0.0519322045147419],[0.003570611122995615,0.05446580797433853],[0.003662165254354477,0.05759149417281151],[0.0037689784076064825,0.06150212697684765],[0.0038910505827516317,0.06579447537660599],[0.004028381779789925,0.07023651525378227],[0.004165713209658861,0.07531455904245377],[0.004333562217652798,0.08096367120742798],[0.0045014116913080215,0.08723824843764305],[0.004699778743088245,0.09420210123062134],[0.004943923093378544,0.10296247527003288],[0.005249103531241417,0.11401144415140152],[0.005615320056676865,0.12788307666778564],[0.0061036087572574615,0.14523915946483612],[0.006698710843920708,0.166754312813282],[0.0073701078072190285,0.19082769006490707],[0.008133058436214924,0.2181861251592636],[0.008957046084105968,0.24816512316465378],[0.009826810099184513,0.2784631550312042],[0.010925459675490856,0.3153327405452728],[0.013031205162405968,0.37303441762924194],[0.016952773556113243,0.4536142945289612],[0.021194782108068466,0.5141270756721497],[0.021324483677744865,0.5146758556365967],[0.021454185247421265,0.5164577960968018],[0.021576257422566414,0.5183060169219971],[0.021713588386774063,0.5205016434192657],[0.021850919350981712,0.5219271183013916],[0.02203402854502201,0.5252744555473328],[0.02217135950922966,0.5252744555473328],[0.02235446684062481,0.5282211005687714],[0.022537576034665108,0.5291674733161926],[0.022682536393404007,0.5308631658554077],[0.022812237963080406,0.5324550569057465],[0.022964827716350555,0.535591185092926],[0.023147936910390854,0.5366584658622742],[0.023254750296473503,0.536712646484375],[0.023392081260681152,0.5392871499061584],[0.0235751885920763,0.5409190058708191],[0.02371251955628395,0.5418338179588318],[0.0238498505204916,0.5434135794639587],[0.0240177009254694,0.5455150008201599],[0.024200808256864548,0.5478162169456482],[0.024399176239967346,0.5502006411552429],[0.024536507204174995,0.5505940020084381],[0.024658579379320145,0.5522347688674927],[0.024818798527121544,0.5542045831680298],[0.024963760748505592,0.5549816787242889],[0.02511635050177574,0.5567644834518433],[0.02523842267692089,0.5583820343017578],[0.02539101243019104,0.5587478280067444],[0.02553597278892994,0.5611801743507385],[0.025741970166563988,0.5621789693832397],[0.025871671736240387,0.5642120540142059],[0.026077669113874435,0.5657418370246887],[0.026291294023394585,0.5683932304382324],[0.026611734181642532,0.5705316364765167],[0.02689402550458908,0.5742942690849304],[0.02722209505736828,0.5769346356391907],[0.027496756985783577,0.5780178904533386],[0.027756160125136375,0.5812526345252991],[0.028122376650571823,0.5847738683223724],[0.02838941104710102,0.5869760811328888],[0.02877088636159897,0.5896678566932678],[0.029083695262670517,0.5925925970077515],[0.029404135420918465,0.5946627557277679],[0.029785610735416412,0.5975701212882996],[0.03016708604991436,0.6014637351036072],[0.030624857172369957,0.6054896116256714],[0.031158922240138054,0.6081466674804688],[0.03147173300385475,0.6124202013015747],[0.0319218747317791,0.6143088340759277],[0.0322880893945694,0.6171259880065918],[0.03309682011604309,0.6229831874370575],[0.03352406993508339,0.626475989818573],[0.033958952873945236,0.6294248998165131],[0.03450064733624458,0.6332480907440186],[0.03504997491836548,0.6376839876174927],[0.035889219492673874,0.6420231759548187],[0.03643854334950447,0.6457900404930115],[0.037064164876937866,0.6498396396636963],[0.03761348873376846,0.6530411243438721],[0.03849088400602341,0.6577531695365906],[0.039162278175354004,0.6614853143692017],[0.0398947112262249,0.6657004654407501],[0.04081788286566734,0.671909749507904],[0.04168001934885979,0.675804615020752],[0.04284733533859253,0.6812313795089722],[0.043793391436338425,0.6865459084510803],[0.04483100771903992,0.6905974447727203],[0.04583810269832611,0.6970981955528259],[0.04712748900055885,0.7006259858608246],[0.048622872680425644,0.7077180445194244],[0.04972152225673199,0.7123323976993561],[0.05136949568986893,0.719150960445404],[0.05274280905723572,0.7254174649715424],[0.05381093919277191,0.7293324172496796],[0.05590905621647835,0.7350305616855621],[0.05719081312417984,0.7408508062362671],[0.059632256627082825,0.7482816576957703],[0.06149385869503021,0.7540464401245117],[0.06336309015750885,0.7584114968776703],[0.06664377823472023,0.7676287591457367],[0.06923781335353851,0.7746245861053467],[0.0720302127301693,0.7807973325252533],[0.07533378899097443,0.7890539765357971],[0.0796520933508873,0.7979507148265839],[0.08274967595934868,0.8038201630115509],[0.0871519036591053,0.8117167353630066],[0.09284351766109467,0.8212714195251465],[0.09874112904071808,0.830305278301239],[0.10504310950636864,0.8389074206352234],[0.11425192654132843,0.8500688970088959],[0.12379644438624382,0.8600618243217468],[0.1365148425102234,0.8719634115695953],[0.15400931239128113,0.8854559361934662],[0.1759060025215149,0.8989369869232178],[0.2061493918299675,0.9135817289352417],[0.24892042577266693,0.9290153384208679],[0.3283054977655411,0.9484743773937225],[0.5827420353889465,0.9776662588119507],[1,1]],[[0,0],[0.002609292743727565,0.022583224810659885],[0.0026550698094069958,0.023915564641356468],[0.002685587853193283,0.02472110092639923],[0.0027008468750864267,0.02539527416229248],[0.0027161058969795704,0.025886664167046547],[0.002731364918872714,0.026386616751551628],[0.0027466239407658577,0.026869943365454674],[0.0027618829626590014,0.027363481000065804],[0.002777141984552145,0.027864964678883553],[0.0027924010064452887,0.028373507782816887],[0.0028076600283384323,0.02887294813990593],[0.002822919050231576,0.029371943324804306],[0.0028381780721247196,0.029861057177186012],[0.0028534370940178633,0.030364658683538437],[0.002868696115911007,0.03086416982114315],[0.0028839551378041506,0.03135988488793373],[0.0028992141596972942,0.0318647064268589],[0.002914473181590438,0.0323699414730072],[0.0029297322034835815,0.03287556767463684],[0.002944991225376725,0.0333816297352314],[0.002960250247269869,0.03388809412717819],[0.0029755092691630125,0.0343911275267601],[0.002990768291056156,0.03490229323506355],[0.0030060273129493,0.035405926406383514],[0.0030212863348424435,0.03590552508831024],[0.003036545356735587,0.03640594333410263],[0.0030518043786287308,0.03692302107810974],[0.0030670634005218744,0.03743240237236023],[0.003082322422415018,0.03794218599796295],[0.0030975814443081617,0.03845241665840149],[0.0031128404662013054,0.038947805762290955],[0.003128099488094449,0.03946357220411301],[0.0031433585099875927,0.03997055068612099],[0.0031586175318807364,0.040484167635440826],[0.00317387655377388,0.04099512845277786],[0.0031891355756670237,0.0414925143122673],[0.0032043945975601673,0.04201197996735573],[0.003219653619453311,0.04251931980252266],[0.0032349126413464546,0.04303336888551712],[0.0032501716632395983,0.04356326907873154],[0.003265430685132742,0.04406752064824104],[0.0032806897070258856,0.044593535363674164],[0.0032959487289190292,0.045116543769836426],[0.003311207750812173,0.045640673488378525],[0.0033264667727053165,0.046166688203811646],[0.00334172579459846,0.046700481325387955],[0.003356984816491604,0.04723416268825531],[0.0033722438383847475,0.04794786870479584],[0.0034180209040641785,0.04945959523320198],[0.0034943160135298967,0.051969561725854874],[0.003570611122995615,0.054887935519218445],[0.003662165254354477,0.057922231033444405],[0.0037689784076064825,0.06161772832274437],[0.0038910505827516317,0.0659935250878334],[0.004028381779789925,0.07067525386810303],[0.004180971998721361,0.07609738409519196],[0.004348821472376585,0.08184947073459625],[0.0045166704803705215,0.08797179162502289],[0.004715037997812033,0.09502581506967545],[0.004959182348102331,0.10390546172857285],[0.005264362785965204,0.11458920687437057],[0.005615320056676865,0.12754316627979279],[0.0060883499681949615,0.14475927501916885],[0.00668345158919692,0.16622325778007507],[0.0073853665962815285,0.1921650469303131],[0.008178835734724998,0.22106808423995972],[0.009018082171678543,0.2515282481908798],[0.009918364696204662,0.283600389957428],[0.011017014272511005,0.31886284053325653],[0.013092241249978542,0.3753397464752197],[0.016754405573010445,0.4479012191295624],[0.02078278735280037,0.5074751973152161],[0.020927748642861843,0.5092062950134277],[0.021087968721985817,0.5114211738109589],[0.021225299686193466,0.5129342377185822],[0.021339742466807365,0.5145370364189148],[0.021515220403671265,0.5164268910884857],[0.021606775000691414,0.5178080201148987],[0.021713588386774063,0.5189371109008789],[0.021881436929106712,0.5206736028194427],[0.02203402854502201,0.5226752161979675],[0.02224002406001091,0.5244766771793365],[0.02238498441874981,0.5268311500549316],[0.022552834823727608,0.5284886360168457],[0.022705424576997757,0.5303801894187927],[0.022873273119330406,0.5319690108299255],[0.022995345294475555,0.5335407257080078],[0.023178454488515854,0.5354852080345154],[0.023361561819911003,0.5369954109191895],[0.0234988946467638,0.5389030575752258],[0.02363622561097145,0.5404595732688904],[0.0237735565751791,0.5421000719070435],[0.02395666390657425,0.5432946979999542],[0.024170290678739548,0.5456850826740265],[0.024315251037478447,0.5474127233028412],[0.024444952607154846,0.5488517880439758],[0.024582283571362495,0.5504879653453827],[0.024727245792746544,0.5518802106380463],[0.024872206151485443,0.5532122254371643],[0.024971390143036842,0.5542183518409729],[0.02517738565802574,0.5563498139381409],[0.02534523606300354,0.5576997995376587],[0.02554360218346119,0.5600431561470032],[0.025734340772032738,0.5618155598640442],[0.025925077497959137,0.5637146830558777],[0.026108186691999435,0.565285861492157],[0.026413366198539734,0.5682394504547119],[0.02672617696225643,0.5713584125041962],[0.02699320949614048,0.5736321806907654],[0.027328908443450928,0.5765826106071472],[0.027679866179823875,0.5791295766830444],[0.028030823916196823,0.5826875865459442],[0.02838941104710102,0.58555006980896],[0.02875562757253647,0.5890644490718842],[0.029205767437815666,0.5925487279891968],[0.029495690017938614,0.5950984358787537],[0.02984664775431156,0.597853273153305],[0.03015182726085186,0.6007567346096039],[0.030678262934088707,0.6045960783958435],[0.031128404662013054,0.6079083383083344],[0.03151750937104225,0.6111133694648743],[0.0319829098880291,0.6146441698074341],[0.032585641369223595,0.6189096570014954],[0.03308156132698059,0.6224732398986816],[0.03353169932961464,0.6257989406585693],[0.033997099846601486,0.628751665353775],[0.03453116491436958,0.6325443983078003],[0.03508812189102173,0.6363192796707153],[0.035889219492673874,0.6414023041725159],[0.03643854334950447,0.6447623372077942],[0.037247274070978165,0.6499588489532471],[0.03813229501247406,0.6547891497612],[0.038811322301626205,0.6593088507652283],[0.03952086716890335,0.6631858646869659],[0.040337223559617996,0.6676423251628876],[0.04110780358314514,0.671575665473938],[0.042084380984306335,0.6762939989566803],[0.043366141617298126,0.6832928657531738],[0.04438849538564682,0.6878525614738464],[0.045281147584319115,0.6923091113567352],[0.046753643080592155,0.699005663394928],[0.0479896254837513,0.704216718673706],[0.04918745718896389,0.7094857394695282],[0.05054550990462303,0.7150554060935974],[0.05213245004415512,0.7215446531772614],[0.05401693657040596,0.7282931208610535],[0.05532158352434635,0.733081728219986],[0.05693903937935829,0.7385870516300201],[0.05918974615633488,0.7456770837306976],[0.06074616685509682,0.7506455183029175],[0.06353093683719635,0.7590869665145874],[0.06620126590132713,0.7663694024085999],[0.06923018395900726,0.7741796970367432],[0.0722285807132721,0.7815521359443665],[0.07559319213032722,0.7891429960727692],[0.07923247292637825,0.7965290546417236],[0.08274967223405838,0.8036179840564728],[0.0875944122672081,0.812566488981247],[0.09257648512721062,0.821204423904419],[0.09842069447040558,0.8296499848365784],[0.10540932416915894,0.8390064239501953],[0.11334401369094849,0.8488179445266724],[0.12307164072990417,0.8592025339603424],[0.1362554356455803,0.871427059173584],[0.15413901209831238,0.88531693816185],[0.1755855605006218,0.8986321985721588],[0.2057679146528244,0.9135012626647949],[0.24842450767755508,0.9289411008358002],[0.32848095893859863,0.9485529363155365],[0.6001373529434204,0.979263424873352],[1,1]],[[0,0],[0.0024872205685824156,0.01628697570413351],[0.00254825665615499,0.018149955198168755],[0.002563515678048134,0.018907809630036354],[0.002594033721834421,0.019670451059937477],[0.002609292743727565,0.020511165261268616],[0.0026245517656207085,0.021054835990071297],[0.002639810787513852,0.021581724286079407],[0.0026550698094069958,0.022197093814611435],[0.0026703288313001394,0.022725185379385948],[0.002685587853193283,0.023309560492634773],[0.0027008468750864267,0.02392776682972908],[0.0027161058969795704,0.02455723099410534],[0.002731364918872714,0.02514740638434887],[0.0027466239407658577,0.02576451376080513],[0.0027618829626590014,0.026340864598751068],[0.002777141984552145,0.02693244442343712],[0.0027924010064452887,0.02754327841103077],[0.0028076600283384323,0.0281046275049448],[0.002822919050231576,0.028633885085582733],[0.0028381780721247196,0.02925090678036213],[0.0028534370940178633,0.029779501259326935],[0.002868696115911007,0.030337337404489517],[0.0028839551378041506,0.03088819980621338],[0.0028992141596972942,0.031465865671634674],[0.002914473181590438,0.03204318881034851],[0.0029297322034835815,0.03254906088113785],[0.002944991225376725,0.03312372788786888],[0.002960250247269869,0.033695586025714874],[0.0029755092691630125,0.034264735877513885],[0.002990768291056156,0.03482934460043907],[0.0030060273129493,0.035337090492248535],[0.0030212863348424435,0.03590552508831024],[0.003036545356735587,0.036414071917533875],[0.0030518043786287308,0.03696456924080849],[0.0030670634005218744,0.037544287741184235],[0.003082322422415018,0.03806682303547859],[0.0030975814443081617,0.03863423690199852],[0.0031128404662013054,0.03918692097067833],[0.003128099488094449,0.03971041738986969],[0.0031433585099875927,0.04027366638183594],[0.0031586175318807364,0.04080864042043686],[0.00317387655377388,0.041308578103780746],[0.0031891355756670237,0.04187314957380295],[0.0032043945975601673,0.04238913580775261],[0.003219653619453311,0.04296233877539635],[0.0032349126413464546,0.0435297004878521],[0.0032501716632395983,0.04404439777135849],[0.003265430685132742,0.04461486265063286],[0.0032806897070258856,0.045132916420698166],[0.0032959487289190292,0.045765385031700134],[0.003311207750812173,0.04634714871644974],[0.0033264667727053165,0.04691941291093826],[0.00334172579459846,0.047511544078588486],[0.003356984816491604,0.048086803406476974],[0.0033722438383847475,0.048666179180145264],[0.003387502860277891,0.04928964003920555],[0.003402761882171035,0.049881938844919205],[0.0034180209040641785,0.0504101999104023],[0.003433279925957322,0.05104168504476547],[0.0034485389478504658,0.05186722055077553],[0.0034943160135298967,0.053156815469264984],[0.0035400930792093277,0.05453469604253769],[0.003616388188675046,0.05664091184735298],[0.0036926832981407642,0.059121400117874146],[0.0037689784076064825,0.062030892819166183],[0.003875791560858488,0.06508110463619232],[0.004013122990727425,0.06943468004465103],[0.004165713209658861,0.07487867772579193],[0.004333562217652798,0.08124643936753273],[0.0045166704803705215,0.08796004951000214],[0.004730296786874533,0.09548747539520264],[0.004974441137164831,0.10467994958162308],[0.005264362785965204,0.11495743691921234],[0.005600061267614365,0.1268959864974022],[0.0060883499681949615,0.14462275803089142],[0.006698710843920708,0.16701743006706238],[0.00746166193857789,0.1956232562661171],[0.008331426419317722,0.2294660210609436],[0.009170671924948692,0.25993612408638],[0.010086213238537312,0.2928996980190277],[0.01120012253522873,0.32882679998874664],[0.013168536126613617,0.3779202997684479],[0.016540780663490295,0.4437362551689148],[0.020248722285032272,0.49676959216594696],[0.02035553567111492,0.49973422288894653],[0.02046234905719757,0.5007196068763733],[0.02061493881046772,0.5021961331367493],[0.02075226977467537,0.5021961331367493],[0.02085908316075802,0.5070708692073822],[0.020981155335903168,0.5079739987850189],[0.021149003878235817,0.5092485547065735],[0.021286334842443466,0.5107247531414032],[0.021446555852890015,0.5131061375141144],[0.021583886817097664,0.513453483581543],[0.021713588386774063,0.5162724554538727],[0.021850919350981712,0.5174099206924438],[0.02201876789331436,0.5187265276908875],[0.022148470394313335,0.5203648209571838],[0.02227817289531231,0.5236830413341522],[0.02246128022670746,0.5247068703174591],[0.022720683366060257,0.5271143913269043],[0.022842755541205406,0.530123770236969],[0.023018235340714455,0.5307375490665436],[0.023178454488515854,0.5329349339008331],[0.023331044241786003,0.5360198318958282],[0.023422598838806152,0.5360198318958282],[0.0235751885920763,0.5362760126590729],[0.02369726076722145,0.5384103059768677],[0.02391088753938675,0.5400838851928711],[0.0240482185035944,0.5424932241439819],[0.024185549467802048,0.5434424877166748],[0.024353399872779846,0.5454943180084229],[0.024490730836987495,0.5465380549430847],[0.024673838168382645,0.547978401184082],[0.024887464940547943,0.5516447424888611],[0.025070572271943092,0.5529333651065826],[0.02529182843863964,0.555942565202713],[0.02553597278892994,0.5566048622131348],[0.025764858350157738,0.5595908164978027],[0.026031890884041786,0.5628265142440796],[0.026367589831352234,0.5663167536258698],[0.026634622365236282,0.5688503980636597],[0.02693980373442173,0.5702885985374451],[0.027306020259857178,0.5748759806156158],[0.027664607390761375,0.5768629908561707],[0.027954528108239174,0.5792286396026611],[0.02833600342273712,0.5836398601531982],[0.02874799817800522,0.5873146653175354],[0.029091324657201767,0.5895479917526245],[0.029465170577168465,0.59382763504982],[0.02984664775431156,0.5958242416381836],[0.03015182726085186,0.5983777642250061],[0.030670633539557457,0.6030631065368652],[0.031235218048095703,0.6062743067741394],[0.0317235067486763,0.6112193465232849],[0.0321202427148819,0.6133860647678375],[0.032593272626399994,0.6168836951255798],[0.03306629881262779,0.6201407313346863],[0.03353932872414589,0.6230553984642029],[0.034264132380485535,0.6276596784591675],[0.03508049249649048,0.6335209012031555],[0.035553522408008575,0.6361592411994934],[0.03629358485341072,0.6414161324501038],[0.036987870931625366,0.6462172269821167],[0.03766689449548721,0.6498099565505981],[0.03825436905026436,0.6519148647785187],[0.039093613624572754,0.6586722731590271],[0.03990234062075615,0.6634447574615479],[0.04092469625174999,0.6684811115264893],[0.042069124057888985,0.6752421259880066],[0.04313725605607033,0.6788309812545776],[0.04393072426319122,0.6841847002506256],[0.04499122500419617,0.6872169971466064],[0.04621194675564766,0.6948262155056],[0.047898069024086,0.7011322975158691],[0.04890516400337219,0.7070285677909851],[0.05057602748274803,0.7123003900051117],[0.051728084683418274,0.7173745334148407],[0.05367361009120941,0.7260006368160248],[0.05520714074373245,0.7306593060493469],[0.05696192756295204,0.7367370128631592],[0.059647515416145325,0.7445862889289856],[0.06227969750761986,0.7537001669406891],[0.06461432576179504,0.760009378194809],[0.06739909946918488,0.7675766944885254],[0.07064927369356155,0.7751603126525879],[0.07322804629802704,0.7815313637256622],[0.07680628448724747,0.7899821996688843],[0.08065919205546379,0.7982136309146881],[0.08545052260160446,0.8061972856521606],[0.09037918597459793,0.8150983154773712],[0.095826655626297,0.8239147067070007],[0.10143435001373291,0.8316717743873596],[0.10993362590670586,0.843000739812851],[0.119562067091465,0.8538680076599121],[0.13165484368801117,0.8655529320240021],[0.1500801146030426,0.8806940317153931],[0.17006942629814148,0.8941399455070496],[0.1990310549736023,0.9090061783790588],[0.23722438514232635,0.9241947531700134],[0.3188677728176117,0.945740282535553],[0.5614252090454102,0.9753478765487671],[1,1]]]};
function SSTGHSCurveValue(x,nodes){x=SSTClamp(x,0,1);var lo=0,hi=nodes.length-1;while(hi-lo>1){var mid=(lo+hi)>>1;if(x<nodes[mid][0])hi=mid;else lo=mid;}var a=nodes[lo],b=nodes[hi],t=(x-a[0])/Math.max(1e-12,b[0]-a[0]);return a[1]+t*(b[1]-a[1]);}
function SSTGHSReferenceMatch(s,palette){if(palette!="Broadband RGB")return false;var channels=s.channels||[],ref=SST_GHS_REFERENCE.sourceStats;
 if(channels.length!=3&&(!s.channelStatistics||s.channelStatistics.length!=3))return false;
 var actual=[s.luminance];for(var c=0;c<3;c++)actual.push(channels.length?channels[c]:s.channelStatistics[c].statistics);
 var expected=[ref.luminance,ref.red,ref.green,ref.blue],keys=["median","p90","p99"];
 for(var i=0;i<4;i++)for(var j=0;j<keys.length;j++){var k=keys[j];if(Math.abs(Math.log((actual[i][k]+1e-9)/(expected[i][k]+1e-9)))>.30)return false;}return true;}
function SSTGHSReferenceEligible(source,palette){var shape=source.structure;return !!shape&&(shape.type=="galaxy"||shape.axisRatio>=1.8&&shape.extendedFraction>=.004)&&SSTGHSReferenceMatch(source,palette);}
function SSTGHSReferenceSamples(image,source){if(!SSTGHSReferenceEligible(source,"Broadband RGB"))return null;
 var result=[],points=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++)points.push({x:Math.min(image.width-1,Math.floor((x+.5)*image.width/24)),y:Math.min(image.height-1,Math.floor((y+.5)*image.height/16))});
 var core=source.corePoints||[];for(var i=0;i<core.length;i+=Math.max(1,Math.ceil(core.length/64)))points.push(core[i]);
 for(i=0;i<points.length;i++){var pt=points[i],rgb=[];for(var c=0;c<3;c++)rgb.push(SSTGHSCurveValue(image.sample(pt.x,pt.y,c),SST_GHS_REFERENCE.curves[c]));result.push({x:pt.x,y:pt.y,rgb:rgb});}return result;}
function SSTGHSReferenceQuality(image,source){var samples=SSTOptional(source,"ghsReferenceSamples",null);if(SSTOptional(source,"palette","Broadband RGB")!="Broadband RGB"||!samples)return null;
 var sum=0;for(var i=0;i<samples.length;i++)for(var c=0;c<3;c++){var d=image.sample(samples[i].x,samples[i].y,c)-samples[i].rgb[c];sum+=d*d;}
 var rmse=Math.sqrt(sum/Math.max(1,3*samples.length));return {profile:"M31 paired GHS reference",sampleCount:samples.length,rgbRMSE:rmse,scoreAdjustment:100-1000*rmse};}
function SSTPixel(values,p){
 var v=[],i;for(i=0;i<values.length;i++){if(!isFinite(values[i]))throw new Error("Nonfinite source sample encountered.");v.push(SSTClamp(values[i],0,1));}
 var pedestal=SSTOptional(p,"sourcePedestal",null),sourceGain=SSTOptional(p,"sourceGain",null);if(pedestal)for(i=0;i<v.length;i++)v[i]=SSTClamp(SSTNormalized(v[i],pedestal[i])*(sourceGain?sourceGain[i]:1),0,1);
 var learned=SSTOptional(p,"referenceCurve",null);if(learned){for(i=0;i<v.length;i++)v[i]=SSTGHSCurveValue(v[i],learned.curves[i]);return v;}
 var h=SSTOptional(p,"hdr",null);
 if(h){var peak=0;for(i=0;i<v.length;i++)peak=Math.max(peak,v[i]);if(peak<=1e-12)return v;
  var mapped=SSTHDRValue(peak,h),gain=mapped/peak;for(i=0;i<v.length;i++)v[i]=v[i]*gain;
  var saturation=SSTOptional(h,"saturation",0);
  if(v.length==3&&saturation>0){var lum=SSTY(v),weight=SSTSmooth((peak-h.background)/Math.max(1e-8,h.knee-h.background));
   var amount=1+saturation*weight;
   // Bound the saturation factor, rather than clipping RGB: luminance stays fixed.
   for(i=0;i<3;i++){var delta=v[i]-lum;if(delta>0)amount=Math.min(amount,(h.ceiling-lum)/delta);else if(delta<0)amount=Math.min(amount,-lum/delta);}
   amount=Math.max(1,amount);for(i=0;i<3;i++)v[i]=lum+amount*(v[i]-lum);
  }return v;}
 if(p.selectiveMidtone!==undefined){var peak=0;for(i=0;i<v.length;i++)peak=Math.max(peak,v[i]);if(peak<=1e-12)return v;
  var knee=p.selectiveKnee,kneeOutput=SSTMTF(knee,p.selectiveMidtone),mapped;
  if(peak<=knee)mapped=SSTMTF(peak,p.selectiveMidtone);
  else{var q=Math.log(1+(peak-knee)/Math.max(1e-8,knee))/Math.log(1+(1-knee)/Math.max(1e-8,knee));mapped=kneeOutput+(p.selectiveCeiling-kneeOutput)*q;}
  var gain=mapped/peak;for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;}
 if(p.hdrShape!==undefined){var peak=0;for(i=0;i<v.length;i++)peak=Math.max(peak,v[i]);
  if(peak<=1e-12)return v;var mapped=.92*SSTShape(peak,"log",p.hdrShape),gain=mapped/peak;
  for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;}
 if(p.family<3){for(i=0;i<v.length;i++)v[i]=SSTMTF(SSTNormalized(v[i],p.black[i]),p.shape[i]);return v;}
 var y=SSTY(v);if(y<=1e-12)return v;
 var z=SSTShape(SSTNormalized(y,p.black[0]),p.method,p.shape[0]);
 if(p.family==7){var lift=SSTMTF(z,p.second),weight=4*z*(1-z);z=z+(lift-z)*weight;}
 if(p.family==8)z=y>=.7?y:.7*SSTMTF(y/.7,p.shape[0]);
 var mx=0;for(i=0;i<v.length;i++)mx=Math.max(mx,v[i]);
 if(SSTOptional(p,"shoGamutShoulder",false)){
  // Preserve RGB ratios while rolling projected peaks below the hard boundary.
  var projected=mx*z/y,mapped=projected>.90?.90+.095*(1-Math.exp(-(projected-.90)/.095)):projected;
  var gain=mapped/Math.max(mx,1e-12);for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;
 }
 if(SSTOptional(p,"luminanceGamut",false)){
  // Preserve the requested luminance; compress chroma only when RGB would
  // leave the display gamut. This avoids dark nuclei at channel saturation.
  var requested=SSTClamp(z,0,1),factor=requested/y,chroma=1;
  for(i=0;i<v.length;i++){var delta=v[i]*factor-requested;if(delta>0)chroma=Math.min(chroma,(1-requested)/delta);else if(delta<0)chroma=Math.min(chroma,-requested/delta);}
  chroma=SSTClamp(chroma,0,1);for(i=0;i<v.length;i++)v[i]=SSTClamp(requested+chroma*(v[i]*factor-requested),0,1);return v;
 }
 var gain=Math.min(z/y,1/Math.max(mx,1e-12));
 for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;
}

function SSTSmooth(t){t=SSTClamp(t,0,1);return t*t*(3-2*t);}
function SSTBoxMean(image,radius,signalAt)
{
      var W=image.width,H=image.height;
      var stride=W+1;
      var integral=new Array((W+1)*(H+1));
      for(var z=0;z<integral.length;++z)integral[z]=0;
      for(var y=0;y<H;++y)
      {
         var row=0;
         for(var x=0;x<W;++x)
         {
            row+=signalAt(image,x,y);
            integral[(y+1)*stride+(x+1)]=
               integral[y*stride+(x+1)]+row;
         }
      }
      var mean=new Image(W,H,1);
      for(var yy=0;yy<H;++yy)
         for(var xx=0;xx<W;++xx)
         {
            var x0=Math.max(0,xx-radius),x1=Math.min(W-1,xx+radius);
            var y0=Math.max(0,yy-radius),y1=Math.min(H-1,yy+radius);
            var A=integral[y0*stride+x0];
            var B=integral[y0*stride+(x1+1)];
            var C=integral[(y1+1)*stride+x0];
            var D=integral[(y1+1)*stride+(x1+1)];
            mean.setSample((D-B-C+A)/((x1-x0+1)*(y1-y0+1)),xx,yy,0);
         }
      return mean;
}

   function SSTContrastMap(src){var proxy=new Image(src),mean=null,second=null,map=null;
      var signal=function(im,x,y){return im.numberOfChannels<3?im.sample(x,y,0):.2126*im.sample(x,y,0)+.7152*im.sample(x,y,1)+.0722*im.sample(x,y,2);};
      try{if(proxy.width>640||proxy.height>380)proxy.resample(Math.min(640/proxy.width,380/proxy.height));
         var W=proxy.width,H=proxy.height;mean=SSTBoxMean(proxy,12,signal);
         second=SSTBoxMean(proxy,12,function(im,x,y){var v=signal(im,x,y);return v*v;});
         var deviations=[];for(var y=0;y<H;y+=4)for(var x=0;x<W;x+=4)deviations.push(Math.abs(signal(proxy,x,y)-.25*(signal(proxy,Math.max(0,x-1),y)+signal(proxy,Math.min(W-1,x+1),y)+signal(proxy,x,Math.max(0,y-1))+signal(proxy,x,Math.min(H-1,y+1)))));
         deviations.sort(function(a,b){return a-b;});var noise=Math.max(.0005,1.3257*SSTPercentile(deviations,.5));
         map=new Image(mean);
         for(var y=0;y<H;y++)for(var x=0;x<W;x++){
            var v=signal(proxy,x,y),m=mean.sample(x,y,0),detail=v-m,sd=Math.sqrt(Math.max(0,second.sample(x,y,0)-m*m));
            var lowContrast=1-SSTSmooth((sd/(m+.02)-.08)/.22);
            var confidence=SSTSmooth((Math.abs(detail)/noise-1)/2);
            var bright=proxy.numberOfChannels<3?v:Math.max(proxy.sample(x,y,0),proxy.sample(x,y,1),proxy.sample(x,y,2));
            var weight=lowContrast*confidence*(1-SSTSmooth((bright-.55)/.30))*SSTSmooth((m-.005)/.04);
            var target=v+Math.max(-.08,Math.min(.08,.75*weight*detail));
            var gain=v>1e-8?Math.max(0,Math.min(1/Math.max(1e-8,bright),target/v)):1;
            if(weight<=0||bright>=.85)gain=1;map.setSample(gain,x,y,0);
         }return map;
      }catch(e){if(map)map.free();throw e;}finally{proxy.free();if(mean)mean.free();if(second)second.free();}
   }
   function SSTMapGain(map,x,y,W,H){var px=Math.max(0,Math.min(map.width-1,(x+.5)*map.width/W-.5)),py=Math.max(0,Math.min(map.height-1,(y+.5)*map.height/H-.5));
      var ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(ix+1,map.width-1),jy=Math.min(iy+1,map.height-1),fx=px-ix,fy=py-iy;
      return (1-fy)*((1-fx)*map.sample(ix,iy,0)+fx*map.sample(jx,iy,0))+fy*((1-fx)*map.sample(ix,jy,0)+fx*map.sample(jx,jy,0));
   }

function SSTQuickFinish(image,p,progress){var out=null,map=null;
 function report(f,stage){if(progress)progress(f,stage);}
 try{
  if(p.linear){report(0,"Measuring full-resolution endpoints…");var lo=Infinity,hi=-Infinity;
   for(var c=0;c<image.numberOfChannels;c++){image.selectedChannel=c;lo=Math.min(lo,image.minimum());hi=Math.max(hi,image.maximum());}image.resetSelections();
   if(hi-lo>1e-12)for(var y=0;y<image.height;y++){for(var x=0;x<image.width;x++)for(c=0;c<image.numberOfChannels;c++)image.setSample(SSTClamp((image.sample(x,y,c)-lo)/(hi-lo),0,1),x,y,c);
    if(y%32==0)report(.4*(y+1)/image.height,"Applying linked endpoints…");}
  }
  if(p.contrast>0){report(.4,"Building contrast map…");map=SSTContrastMap(image);out=new Image(image);
   for(var y=0;y<image.height;y++){for(var x=0;x<image.width;x++){
    var maxv=0;for(var c=0;c<image.numberOfChannels;c++)maxv=Math.max(maxv,image.sample(x,y,c));
    var gain=maxv>=.85?1:Math.min(Math.max(0,1+p.contrast*(SSTMapGain(map,x,y,image.width,image.height)-1)),1/Math.max(1e-8,maxv));
    for(c=0;c<image.numberOfChannels;c++)out.setSample(image.sample(x,y,c)*gain,x,y,c);
   }if(y%32==0)report(.4+.6*(y+1)/image.height,"Applying full-resolution contrast…");}report(1,"Finishing adjustments complete");return out;
  }report(1,"Finishing adjustments complete");return image;
 }catch(e){if(out)out.free();throw e;}finally{if(map)map.free();}
}

function SSTCompactProtection(source,reference){
 if(!reference||!SSTOptional(reference,"compactSignal",false)||SSTHDRAssessment(reference).eligible)return null;
 var anchors=[],C=source.numberOfChannels,points=reference.signalPoints;
 for(var c=0;c<C;c++){var values=[];for(var i=0;i<points.length;i++)values.push(source.sample(points[i].x,points[i].y,c));values.sort(function(a,b){return a-b;});anchors.push(SSTPercentile(values,.90));}
 return {version:1,anchors:anchors,ceiling:.78};
}
function SSTProtectCompactRecipe(p,stats){
 var guard=SSTOptional(stats,"compactProtection",null);
 if(!guard||p.quick||p.family>1||SSTOptional(p,"hdr",null))return;
 if(guard.version!==1||!(guard.anchors instanceof Array)||guard.anchors.length!=stats.channels.length||guard.ceiling!==.78)throw new Error("Invalid compact protection measurements.");
 for(var gi=0;gi<guard.anchors.length;gi++)if(typeof guard.anchors[gi]!="number"||!isFinite(guard.anchors[gi])||guard.anchors[gi]<0||guard.anchors[gi]>1)throw new Error("Invalid compact signal anchor.");
 for(var c=0;c<p.shape.length;c++){
  var u=SSTNormalized(guard.anchors[c],p.black[c]),target=Math.pow(guard.ceiling,1/(p.finishGamma||1));
  if(u>0&&u<1)p.shape[c]=Math.max(p.shape[c],SSTMidtone(u,target));
 }
 p.compactProtected=true;
}
function SSTObjectQuality(values,compact){
 if(values.length<12)return null;
 var median=SSTPercentile(values,.5),p10=SSTPercentile(values,.10),range=SSTPercentile(values,.90)-p10;
 var washed=compact?(median>.85&&range<.15||p10>.90):(median>.94&&range<.08);
 // Soft compression cost begins before literal saturation: a bright,
 // narrow tonal range can look washed out despite no clipped pixels.
 var compression=compact?24*SSTClamp((median-.68)/.17,0,1)*SSTClamp((.20-range)/.20,0,1):0;
 return {median:median,p10:p10,p90MinusP10:range,washedOut:washed,compressionPenalty:compression,
  penalty:(washed?60+40*SSTClamp((median-.85)/.15,0,1):0)+compression};
}
function SSTEndpointSamples(source){
 var ctx=SST_ANALYSIS_CONTEXT;if(ctx&&ctx.source===source&&ctx.endpointSamples)return ctx.endpointSamples;
 var a=[],step=Math.max(1,Math.ceil(Math.sqrt(source.width*source.height/12000)));
 for(var y=0;y<source.height;y+=step)for(var x=0;x<source.width;x+=step)
  for(var c=0;c<source.numberOfChannels;c++)a.push(source.sample(x,y,c));if(ctx&&ctx.source===source)ctx.endpointSamples=a;return a;
}
function SSTEndpointValue(value,p){var e=SSTOptional(p,"endpoints",null);
 return e?SSTClamp((value-e.black)/(e.white-e.black),0,1):value;}
function SSTFitEndpoints(p,samples,C){
 if(p.quick||p.stellarCalibration||!samples)return;
 var values=[],luminance=[];
 for(var k=0;k<samples.length;k+=C){var v=SSTPixel(samples.slice(k,k+C),p);
  for(var c=0;c<C;c++){v[c]=Math.pow(v[c],p.finishGamma||1);values.push(v[c]);}luminance.push(SSTY(v));}
 values.sort(function(a,b){return a-b;});luminance.sort(function(a,b){return a-b;});
 var bg=SSTPercentile(luminance,.20),lo=SSTPercentile(values,.0001),hi=values[values.length-1],span=hi-bg;
 // Skip well-placed images, flat/no-signal images and deliberately protected HDR.
 if(span<.025||!(bg>.12||hi<.78&&bg>.035))return;
 var white=Math.min(1,hi+.30*span),black=Math.max(0,Math.min(lo,bg-.045*(white-bg)/.955));
 if(white-black<.04)return;
 p.endpoints={version:1,black:black,white:white,method:"linked sampled bounds with highlight margin and conservative background anchor"};
}
// Optional final local contrast; absent in legacy recipes means no added pass.
function SSTFinalContrast(image,p,progress){
 var strength=SSTOptional(p,"autoHighContrast",0);
 if(strength===0)return image;
 if(typeof strength!="number"||!isFinite(strength)||strength<0||strength>1)throw new Error("Invalid Auto High Contrast strength");
 return SSTQuickFinish(image,{linear:false,contrast:strength},progress);
}
// Source-aware chroma restraint preserves stretched luminance and detail.
function SSTColorGuardPixel(v,linearY,guard){
 if(!guard||v.length!=3)return v;
 var t=SSTClamp((linearY-guard.low)/Math.max(1e-12,guard.high-guard.low),0,1);t=t*t*(3-2*t);
 var mix=guard.backgroundStrength*(1-t),lum=SSTY(v),redExcess=SSTClamp((v[0]-Math.max(v[1],v[2]))/Math.max(1e-12,v[0]),0,1);
 var peak=Math.max(v[0],v[1],v[2]),highlight=SSTClamp((peak-.55)/.35,0,1);highlight=highlight*highlight*(3-2*highlight);
 var red=guard.redStrength*highlight*SSTClamp((redExcess-.10)/.35,0,1)*t;
 // Bright magenta (both red and blue above green) can reveal core channel imbalance.
 // Use luminance rather than a spatial mask; preserve detail and leave red-only signal alone.
 var magentaExcess=SSTClamp((Math.min(v[0],v[2])-v[1])/Math.max(1e-12,peak),0,1);
 var brightCore=SSTSmooth((lum-.65)/.17),magenta=.95*brightCore*SSTSmooth((magentaExcess-.03)/.12)*t;
 mix=1-(1-mix)*(1-red)*(1-magenta);
 return [lum+(v[0]-lum)*(1-mix),lum+(v[1]-lum)*(1-mix),lum+(v[2]-lum)*(1-mix)];
}
function SSTApplyColorGuard(image,source,p,progress){
 var guard=SSTOptional(p,"broadbandColorGuard",null);if(!guard||image.numberOfChannels!=3)return image;
 for(var y=0;y<image.height;y++){for(var x=0;x<image.width;x++){
  var v=[image.sample(x,y,0),image.sample(x,y,1),image.sample(x,y,2)];
  var linearY=.2126*source.sample(x,y,0)+.7152*source.sample(x,y,1)+.0722*source.sample(x,y,2);
  v=SSTColorGuardPixel(v,linearY,guard);for(var c=0;c<3;c++)image.setSample(v[c],x,y,c);
 }if(progress&&y%32==0)progress((y+1)/image.height,"Restraining broadband background color and red highlights…");}
 return image;
}
// Spatial hybrid: one RGB blend weight from the coherent linear core.
function SSTGalaxyCoreMask(source,reference){
 var points=reference.corePoints||[],best=null,peak=0,W=Math.max(1,source.width-1),H=Math.max(1,source.height-1),bg=reference.luminance.p20;
 for(var i=0;i<points.length;i++){var pt=points[i],y=source.numberOfChannels==1?source.sample(pt.x,pt.y,0):.2126*source.sample(pt.x,pt.y,0)+.7152*source.sample(pt.x,pt.y,1)+.0722*source.sample(pt.x,pt.y,2);if(y>peak){peak=y;best=pt;}}
 if(!best||points.length<6)return null;
 var selected=[],sum=0,cx=0,cy=0;
 for(i=0;i<points.length;i++){var pt=points[i],x=pt.x/W,y=pt.y/H;if(Math.pow(x-best.x/W,2)+Math.pow(y-best.y/H,2)>.18*.18)continue;
  var l=source.numberOfChannels==1?source.sample(pt.x,pt.y,0):.2126*source.sample(pt.x,pt.y,0)+.7152*source.sample(pt.x,pt.y,1)+.0722*source.sample(pt.x,pt.y,2);
  var weight=Math.sqrt(Math.max(0,l-bg));selected.push({x:x,y:y,w:weight});sum+=weight;cx+=weight*x;cy+=weight*y;}
 if(selected.length<6||sum<=0)return null;cx/=sum;cy/=sum;var xx=0,xy=0,yy=0;
 for(i=0;i<selected.length;i++){var q=selected[i],dx=q.x-cx,dy=q.y-cy;xx+=q.w*dx*dx;xy+=q.w*dx*dy;yy+=q.w*dy*dy;}
 xx=xx/sum+.000225;yy=yy/sum+.000225;xy/=sum;
 return {cx:cx,cy:cy,xx:xx,xy:xy,yy:yy};
}
function SSTHybridWeight(x,y,h){
 var m=h.mask,dx=x-m.cx,dy=y-m.cy,det=m.xx*m.yy-m.xy*m.xy;
 var d=(m.yy*dx*dx-2*m.xy*dx*dy+m.xx*dy*dy)/Math.max(1e-12,det)/(h.radius*h.radius);
 var t=SSTClamp((9-d)/8,0,1);return t*t*(3-2*t);
}

function SSTHybridBlend(a,b,weight){var out=[];for(var c=0;c<a.length;c++)out.push(a[c]*(1-weight)+b[c]*weight);return out;}
// Blend complete output images, including each recipe's finishing passes.

// Analysis-only acceleration context; released after each analysis run.
var SST_ANALYSIS_CONTEXT=null;
function SSTAnalysisPlanes(image){
 var a=[];for(var c=0;c<image.numberOfChannels;c++)a.push(SmartTools.readPlane(image,c));return a;
}
function SSTAnalysisReader(image){
 var planes=SSTAnalysisPlanes(image),W=image.width;
 return {width:W,height:image.height,numberOfChannels:image.numberOfChannels,bitsPerSample:image.bitsPerSample,
  sample:function(x,y,c){return planes[c][y*W+x];}};
}
function SSTAnalysisContext(source){
 this.source=source;this.planes=SSTAnalysisPlanes(source);this.entries=[];this.bytes=0;
 this.hits=0;this.nativeAttempts=0;this.nativeSuccess=0;this.nativeOff=false;this.bulkPixels=0;this.scoreMS=0;this.renderMS=0;
}


function SSTProcess(source,p,progress){
 var ctx=SST_ANALYSIS_CONTEXT;if(!ctx||ctx.source!==source)return SSTProcessUncached(source,p,progress);
 var key=JSON.stringify(p),hit=ctx.get(key);if(hit)return hit;
 var t=SmartTools.now(),out=SSTProcessUncached(source,p,progress);ctx.renderMS+=SmartTools.now()-t;
 try{ctx.put(key,out);return out;}catch(e){out.free();throw e;}
}
// Full-resolution acceleration. Small previews keep the exact JS reference path.
var SST_NATIVE_DISABLED=false,SST_NATIVE_MIN_PIXELS=250000;
function SSTNativeAvailable(source){var ctx=SST_ANALYSIS_CONTEXT,analysis=ctx&&ctx.source===source;
 return !SST_NATIVE_DISABLED&&!(analysis&&ctx.nativeOff)&&(analysis||source.width*source.height>=SST_NATIVE_MIN_PIXELS)&&typeof PixelMath!="undefined"&&typeof ImageWindow!="undefined";
}
function SSTNativeNumber(x){if(!isFinite(x))throw new Error("Nonfinite native constant");return Number(x).toPrecision(17);}
function SSTNativeCurveExpression(nodes,x,lo,hi){lo=lo||0;if(hi===undefined)hi=nodes.length-1;
 if(hi-lo==1){var a=nodes[lo],b=nodes[hi],slope=(b[1]-a[1])/(b[0]-a[0]);return "("+SSTNativeNumber(a[1])+"+("+x+"-"+SSTNativeNumber(a[0])+")*"+SSTNativeNumber(slope)+")";}
 var mid=(lo+hi)>>1;return "iif("+x+"<"+SSTNativeNumber(nodes[mid][0])+","+SSTNativeCurveExpression(nodes,x,lo,mid)+","+SSTNativeCurveExpression(nodes,x,mid,hi)+")";}
function SSTNativeFinishCode(p,C){var code="",names=["npR","npG","npB"],gamma=p.finishGamma||1,e=SSTOptional(p,"endpoints",null);
 for(var c=0;c<C;c++){var n=names[c];if(gamma!=1)code+=n+"=iif("+n+"<=0,0,exp(ln(max(1e-30,"+n+"))*"+SSTNativeNumber(gamma)+"));";
  if(e)code+=n+"=min(1,max(0,("+n+"-"+SSTNativeNumber(e.black)+")/"+SSTNativeNumber(e.white-e.black)+"));";}
 if(p.highlightShoulder!==undefined){var k=SSTNativeNumber(p.highlightShoulder);code+="npP="+(C==1?"npR":"max(npR,max(npG,npB))")+";npA=iif(npP>"+k+",("+k+"+(0.98-"+k+")*(1-exp(-(npP-"+k+")/(0.98-"+k+"))))/max(1e-30,npP),1);";for(c=0;c<C;c++)code+=names[c]+"="+names[c]+"*npA;";}
 if(p.objectLift){var h=p.objectLift,b=SSTNativeNumber(h.background),m=SSTNativeNumber(h.midtone);code+="npP="+(C==1?"npR":"max(npR,max(npG,npB))")+";npT=(npP-"+b+")/(1-"+b+");npA=iif(npP>"+b+",("+b+"+(1-"+b+")*(1-"+m+")*npT/("+m+"+(1-2*"+m+")*npT))/max(1e-30,npP),1);";for(c=0;c<C;c++)code+=names[c]+"="+names[c]+"*npA;";}
 var steps=SSTOptional(p,"finishRefinements",[]);
 for(var i=0;i<steps.length;i++){var h=steps[i],peak=C==1?"npR":"max(npR,max(npG,npB))",w=h.mode==0?"(1-npP)*(1-npP)":h.mode==1?"4*npP*(1-npP)":h.mode==3?"npP*npP":"1";
  code+="npP="+peak+";npA=1+"+SSTNativeNumber(h.strength)+"*(1-npP)*("+w+");";
  for(c=0;c<C;c++)code+=names[c]+"=min(1,max(0,"+names[c]+"*npA));";
 }if(C==3&&SSTOptional(p,"shoRedLift",0)>0)code+="npY=0.2126*npR+0.7152*npG+0.0722*npB;npR=npR+"+SSTNativeNumber(p.shoRedLift)+"*npR*(1-npR)*4*npY*(1-npY);";return code;}
function SSTNativeApply(view,common,C){var p=SmartTools.configurePixelMath(new PixelMath,64);p.symbols="npR,npG,npB,npP,npA,npT,npY,npC,npD,npH,npM";p.useSingleExpression=C==1;
 p.expression=common+"npR";if(C==3){p.expression1=common+"npG";p.expression2=common+"npB";}
 var t=SmartTools.now();if(!p.executeOn(view,false))throw new Error("Native PixelMath failed");console.writeln("[SST native] PixelMath execution="+SmartTools.elapsed(t));}
function SSTNativeValidate(image,expected){var vt=SmartTools.now(),maxError=0,count=0;
 for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(image.width-1,Math.floor((x+.5)*image.width/24)),yy=Math.min(image.height-1,Math.floor((y+.5)*image.height/16)),v=expected(xx,yy);
  for(var c=0;c<image.numberOfChannels;c++){var actual=image.sample(xx,yy,c);if(!isFinite(actual))throw new Error("Nonfinite native output");maxError=Math.max(maxError,Math.abs(actual-v[c]));count++;}}
 if(maxError>2e-7)throw new Error("Native pixel validation mismatch: "+maxError);console.writeln("[SST native] JS reference probes="+count+"; max error="+maxError+"; validation="+SmartTools.elapsed(vt));}
function SSTNativeReference(source,p,progress){if(!p.referenceCurve||p.quick||p.objectLift||p.highlightShoulder||p.shoRedLift)return null;
 var pool={},out=null,t=SmartTools.now();try{
  if(progress)progress(.02,"Copying source for native GHS curve…");var w=SmartTools.acquireWindow(pool,"GHSNative",source.width,source.height,3,64,true);
  SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(source);}finally{w.mainView.endProcess();}
  console.writeln("[SST native] GHS source copy="+SmartTools.elapsed(t));var names=["npR","npG","npB"],code="";
  for(var c=0;c<3;c++)code+=names[c]+"="+SSTNativeCurveExpression(p.referenceCurve.curves[c],"min(1,max(0,$T["+c+"]))")+";";
  code+=SSTNativeFinishCode(p,3);if(progress)progress(.15,"Applying native GHS curve and saved finishing…");SSTNativeApply(w.mainView,code,3);
  SSTNativeValidate(w.mainView.image,function(x,y){var v=[];for(var c=0;c<3;c++)v.push(source.sample(x,y,c));return SSTFinishedValues(SSTPixel(v,p),p);});
  if(progress)progress(.75,"Applying saved contrast and color restraint…");out=new Image(w.mainView.image);var enhanced=SSTFinalContrast(out,p);if(enhanced!==out){out.free();out=enhanced;}SSTApplyColorGuard(out,source,p);
  console.writeln("[SST native] GHS total="+SmartTools.elapsed(t));if(progress)progress(1,"Native GHS stretch complete");var result=out;out=null;return result;
 }finally{if(out)out.free();SmartTools.closeWindowPool(pool);}}
function SSTNativeBlend(source,p,progress){var pool={},out=null,temp=null,blend=p.recipeBlend,weights=SSTOptional(blend,"weights",[1-blend.amount,blend.amount]),samples=[],W=source.width,H=source.height,C=source.numberOfChannels;
 try{var target=null;
  for(var i=0;i<blend.recipes.length;i++){
   temp=SSTProcess(source,blend.recipes[i],function(f,stage){if(progress)progress(.8*(i+f)/blend.recipes.length,"Blend source "+(i+1)+": "+stage);});
   var probes=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++){var v=[];for(var c=0;c<C;c++)v.push(temp.sample(Math.min(W-1,Math.floor((x+.5)*W/24)),Math.min(H-1,Math.floor((y+.5)*H/16)),c));probes.push(v);}samples.push(probes);
   var w=SmartTools.acquireWindow(pool,i==0?"BlendTarget":"BlendInput",W,H,C,64,C==3);SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(temp);}finally{w.mainView.endProcess();}temp.free();temp=null;
   var pm=SmartTools.configurePixelMath(new PixelMath,64);pm.useSingleExpression=true;
   if(i==0){target=w;pm.expression="$T*"+SSTNativeNumber(weights[i]);}else pm.expression="$T+"+w.mainView.id+"*"+SSTNativeNumber(weights[i]);
   if(!pm.executeOn(target.mainView,false))throw new Error("Native image blend failed");
  }
  if(progress)progress(.85,"Applying native blend refinements…");var names=["npR","npG","npB"],code="";for(var c=0;c<C;c++)code+=names[c]+"=$T"+(C==1?"":"["+c+"]")+";";
  // Blend wrappers only apply finishRefinements, matching the JS blend path.
  code+=SSTNativeFinishCode({finishRefinements:SSTOptional(p,"finishRefinements",[])},C);SSTNativeApply(target.mainView,code,C);
  var probeIndex=0;SSTNativeValidate(target.mainView.image,function(){var v=[];for(var c=0;c<C;c++){var sum=0;for(var i=0;i<samples.length;i++)sum+=weights[i]*samples[i][probeIndex][c];v.push(sum);}probeIndex++;return SSTRefineFinished(v,p);});
  out=new Image(target.mainView.image);if(progress)progress(1,"Native image blend complete");var result=out;out=null;return result;
 }finally{if(out)out.free();if(temp)temp.free();SmartTools.closeWindowPool(pool);}}

// Compute shared RGB decisions once in a monochrome image, then use a short RGB/K pass.
function SSTNativeSingle(view,expression,symbols){var pm=SmartTools.configurePixelMath(new PixelMath,64);pm.useSingleExpression=true;pm.expression=expression;pm.symbols=symbols||"";
 var t=SmartTools.now();if(!pm.executeOn(view,false))throw new Error("Native shared RGB pass failed");console.writeln("[SST native shared] RGB/K apply="+SmartTools.elapsed(t));}
function SSTNativeScalarMap(view,pool,key,code,result){var allocation=SmartTools.now(),w=SmartTools.acquireWindow(pool,"SharedRGBGain",view.image.width,view.image.height,1,32,false),pm=SmartTools.configurePixelMath(new PixelMath,64);
 pm.useSingleExpression=true;pm.symbols="npR,npG,npB,npP,npA,npT,npY,npC,npD,npH,npM,npX,npI,npJ,npF,npV";pm.expression=code+result;pm.truncate=false;
 console.writeln("[SST native timing] "+key+" buffer/setup="+SmartTools.elapsed(allocation)+" | pixels="+(view.image.width*view.image.height)+" | map bits=32 | working bits=64 | map MiB="+(view.image.width*view.image.height*4/1048576).toFixed(2));var t=SmartTools.now();if(!pm.executeOn(w.mainView,false))throw new Error("Native scalar map failed");console.writeln("[SST native shared] "+key+" mono calculation="+SmartTools.elapsed(t));return w;}
function SSTNativeRefinementGainCode(steps,id){
 // For peak in [0,1], modes 0..3 and |strength|<=.75 each step stays in [0,1].
 // Accumulate the same sequential gains; preserve the original tiny-peak identity rule.
 var code="npM=max("+id+"[0],max("+id+"[1],"+id+"[2]));npP=npM;npA=1;";
 for(var i=0;i<steps.length;i++){var h=steps[i];if(h.mode%1||h.mode<0||h.mode>3||!isFinite(h.strength)||Math.abs(h.strength)>.75)return null;if(h.strength===0)continue;
  var w=h.mode==0?"npT*npT":h.mode==1?"4*npP*npT":h.mode==3?"npP*npP":"1";
  code+="npT=1-npP;npH=1+"+SSTNativeNumber(h.strength)+"*npT*("+w+");npA=npA*npH;npP=npP*npH;";
 }return code;
}
function SSTNativeFinishFast(view,p,C,pool){
 // SHO's channel-specific finishing remains on the validated general path.
 if(C!=3||SSTOptional(p,"shoRedLift",0)>0){SSTNativeApply(view,SSTNativeInputCode(C)+SSTNativeFinishCode(p,C),C);return;}
 var n=SSTNativeNumber,gamma=p.finishGamma||1,e=SSTOptional(p,"endpoints",null),expr="$T";
 if(gamma!=1)expr="iif($T<=0,0,exp(ln(max(1e-30,$T))*"+n(gamma)+"))";
 if(e&&(e.black!==0||e.white!==1))expr="min(1,max(0,("+expr+"-"+n(e.black)+")/"+n(e.white-e.black)+"))";
 if(expr!="$T")SSTNativeSingle(view,expr);
 var steps=SSTOptional(p,"finishRefinements",[]);if(!steps.length&&p.highlightShoulder===undefined&&!p.objectLift)return;
 var linked={finishRefinements:steps};if(p.highlightShoulder!==undefined)linked.highlightShoulder=p.highlightShoulder;if(p.objectLift)linked.objectLift=p.objectLift;
 var id=view.id,code="npM=max("+id+"[0],max("+id+"[1],"+id+"[2]));npR=npM;"+SSTNativeFinishCode(linked,1);
 var result="iif(npM<=1e-30,1,npR/max(1e-30,npM))",fast=p.highlightShoulder===undefined&&!p.objectLift?SSTNativeRefinementGainCode(steps,id):null;
 if(fast!==null){code=fast;result="iif(npM<=1e-30,1,npA)";console.writeln("[SST finishing] Bounded sequential gain path | refinements="+steps.length);}else console.writeln("[SST finishing] General linked gain path");
 var map=SSTNativeScalarMap(view,pool,"FinishGain",code,result);SSTNativeSingle(view,"$T*"+map.mainView.id);
}

function SSTNativeInputCode(C){return "npR=$T"+(C==1?"":"[0]")+";"+(C==3?"npG=$T[1];npB=$T[2];":"");}
function SSTNativeContrast(view,strength,pool,progress){if(!strength)return;var before=null,map=null,W=view.image.width,H=view.image.height,C=view.image.numberOfChannels,t=SmartTools.now();
 try{if(progress)progress("Building reduced Auto High Contrast map…");var ct=SmartTools.now();map=SSTContrastMap(view.image);console.writeln("[SST native timing] Contrast reduced map="+SmartTools.elapsed(ct)+" | map="+map.width+"x"+map.height);var probes=[];
  for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(W-1,Math.floor((x+.5)*W/24)),yy=Math.min(H-1,Math.floor((y+.5)*H/16)),v=[];for(var c=0;c<C;c++)v.push(view.image.sample(xx,yy,c));var peak=Math.max.apply(null,v),gain=peak>=.85?1:Math.min(Math.max(0,1+strength*(SSTMapGain(map,xx,yy,W,H)-1)),1/Math.max(1e-8,peak));probes.push(v.map(function(z){return z*gain;}));}
  var mw=SmartTools.acquireWindow(pool,"STFGain",map.width,map.height,1,64,false);SmartTools.beginPrivateProcess(mw.mainView);try{mw.mainView.image.assign(map);}finally{mw.mainView.endProcess();}
  var n=SSTNativeNumber,id=mw.mainView.id;
  var code="npX=min("+(map.width-1)+",max(0,(x()+0.5)*"+n(map.width/W)+"-0.5));npY=min("+(map.height-1)+",max(0,(y()+0.5)*"+n(map.height/H)+"-0.5));npI=floor(npX);npJ=floor(npY);npF=npX-npI;npV=npY-npJ;";
  code+="npM=(1-npV)*((1-npF)*pixel("+id+",npI,npJ)+npF*pixel("+id+",min(npI+1,"+(map.width-1)+"),npJ))+npV*((1-npF)*pixel("+id+",npI,min(npJ+1,"+(map.height-1)+"))+npF*pixel("+id+",min(npI+1,"+(map.width-1)+"),min(npJ+1,"+(map.height-1)+")));";
  code+="npP="+(C==1?"$T":"max($T[0],max($T[1],$T[2]))")+";$T*iif(npP>=0.85,1,min(max(0,1+"+n(strength)+"*(npM-1)),1/max(1e-8,npP)))";
  // RGB/K expressions evaluate per channel; compute interpolation only once in mono.
  var split=code.indexOf(";$T*iif");if(split<0)throw new Error("Missing contrast gain boundary");
  var shared=code.slice(0,split+1).replace(/\$T/g,view.id),gainExpr=code.slice(split+4);
  var gain=SSTNativeScalarMap(view,pool,"ContrastGain",shared,gainExpr);
  if(progress)progress("Applying native Auto High Contrast…");SSTNativeSingle(view,"$T*"+gain.mainView.id);var index=0;SSTNativeValidate(view.image,function(){return probes[index++];});console.writeln("[SST native STF] Contrast map + native apply="+SmartTools.elapsed(t));
 }finally{if(map)map.free();}}
function SSTNativeColorGuard(view,source,p,pool){var g=SSTOptional(p,"broadbandColorGuard",null);if(!g||source.numberOfChannels!=3)return;
 var W=source.width,H=source.height,expected=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(W-1,Math.floor((x+.5)*W/24)),yy=Math.min(H-1,Math.floor((y+.5)*H/16)),v=[],raw=[];for(var c=0;c<3;c++){v.push(view.image.sample(xx,yy,c));raw.push(source.sample(xx,yy,c));}expected.push(SSTColorGuardPixel(v,SSTY(raw),g));}
 var rawTime=SmartTools.now(),raw=SmartTools.acquireWindow(pool,"STFOriginal",W,H,3,64,true);SmartTools.beginPrivateProcess(raw.mainView);try{raw.mainView.image.assign(source);}finally{raw.mainView.endProcess();}
 console.writeln("[SST native timing] Color source buffer/copy="+SmartTools.elapsed(rawTime));var id=raw.mainView.id,n=SSTNativeNumber,code=SSTNativeInputCode(3);
 code+="npT=min(1,max(0,((0.2126*"+id+"[0]+0.7152*"+id+"[1]+0.0722*"+id+"[2])-"+n(g.low)+")/"+n(g.high-g.low)+"));npT=npT*npT*(3-2*npT);npY=0.2126*npR+0.7152*npG+0.0722*npB;npP=max(npR,max(npG,npB));";
 code+="npC="+n(g.backgroundStrength)+"*(1-npT);npD=(npR-max(npG,npB))/max(1e-12,npR);npH=min(1,max(0,(npP-0.55)/0.35));npH=npH*npH*(3-2*npH);npD="+n(g.redStrength)+"*npH*min(1,max(0,(npD-0.10)/0.35))*npT;";
 code+="npM=(min(npR,npB)-npG)/max(1e-12,npP);npH=min(1,max(0,(npY-0.65)/0.17));npH=npH*npH*(3-2*npH);npM=min(1,max(0,(npM-0.03)/0.12));npM=0.95*npH*npM*npM*(3-2*npM)*npT;npA=(1-npC)*(1-npD)*(1-npM);npR=npY+(npR-npY)*npA;npG=npY+(npG-npY)*npA;npB=npY+(npB-npY)*npA;";
 var cut=code.indexOf("npR=npY+");if(cut<0)throw new Error("Missing native color-gain boundary");
 var gainCode=code.slice(0,cut).replace(/\$T/g,view.id),mask=SSTNativeScalarMap(view,pool,"ColorGain",gainCode,"npA");
 var finalCode="npY=0.2126*$T[0]+0.7152*$T[1]+0.0722*$T[2];npY+($T-npY)*"+mask.mainView.id;
 SSTNativeSingle(view,finalCode,"npY");
 var index=0;SSTNativeValidate(view.image,function(){return expected[index++];});}
// Sequential final processing retained after the combined experiment showed no gain.
function SSTNativeFinalPasses(view,source,p,pool){SSTNativeContrast(view,SSTOptional(p,"autoHighContrast",0),pool);if(!p.quick)SSTNativeColorGuard(view,source,p,pool);}
function SSTNativeSTF(source,p,progress){if(typeof HistogramTransformation=="undefined"||p.family>=3||p.referenceCurve||p.hdr||p.selectiveMidtone!==undefined||p.hdrShape!==undefined)return null;
 var pool={},out=null,C=source.numberOfChannels,t=SmartTools.now();if(C!=1&&C!=3)return null;
 function report(f,s){if(progress)progress(f,s);}
 try{report(.02,"Copying source for native Image Analysis STF recipe…");var w=SmartTools.acquireWindow(pool,"STFRecipe",source.width,source.height,C,64,C==3);SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(source);}finally{w.mainView.endProcess();}
  console.writeln("[SST native STF] Source copy="+SmartTools.elapsed(t));var h=new HistogramTransformation,rows=[[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1]];
  for(var c=0;c<C;c++)rows[C==1?3:c]=[p.black[c],p.shape[c],1,0,1];h.H=rows;report(.10,"Applying native Image Analysis channel curves…");var st=SmartTools.now();if(!h.executeOn(w.mainView,false))throw new Error("Native recipe HistogramTransformation failed");console.writeln("[SST native STF] Channel transform="+SmartTools.elapsed(st));
  SSTNativeValidate(w.mainView.image,function(x,y){var v=[];for(var c=0;c<C;c++)v.push(source.sample(x,y,c));return SSTPixel(v,p);});
  if(p.quick){if(p.linear){report(.25,"Measuring native recipe linked endpoints…");var lo=Infinity,hi=-Infinity;for(c=0;c<C;c++){w.mainView.image.selectedChannel=c;lo=Math.min(lo,w.mainView.image.minimum());hi=Math.max(hi,w.mainView.image.maximum());}w.mainView.image.resetSelections();
    if(hi-lo>1e-12){var pm=SmartTools.configurePixelMath(new PixelMath,64);pm.useSingleExpression=true;pm.expression="($T-"+SSTNativeNumber(lo)+")/"+SSTNativeNumber(hi-lo);if(!pm.executeOn(w.mainView,false))throw new Error("Native recipe linked endpoints failed");}}
   report(.40,"Applying native recipe contrast…");SSTNativeContrast(w.mainView,p.contrast,pool,function(s){report(.45,s);});
  }
  report(.60,"Applying native saved finishing adjustments…");var probes=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(source.width-1,Math.floor((x+.5)*source.width/24)),yy=Math.min(source.height-1,Math.floor((y+.5)*source.height/16)),v=[];for(c=0;c<C;c++)v.push(w.mainView.image.sample(xx,yy,c));probes.push(SSTFinishedValues(v,p));}
  SSTNativeFinishFast(w.mainView,p,C,pool);var index=0;SSTNativeValidate(w.mainView.image,function(){return probes[index++];});
  report(.80,"Applying native final contrast and color protection…");SSTNativeFinalPasses(w.mainView,source,p,pool);
  var exportTime=SmartTools.now();out=new Image(w.mainView.image);console.writeln("[SST native timing] Recipe output copy="+SmartTools.elapsed(exportTime));console.writeln("[SST native STF] Recipe "+p.id+" total="+SmartTools.elapsed(t));report(1,"Native Image Analysis STF recipe complete");var result=out;out=null;return result;
 }finally{if(out)out.free();SmartTools.closeWindowPool(pool);}}

function SSTProcessRecipeBlend(source,p,progress){
 var blend=p.recipeBlend,weights=SSTOptional(blend,"weights",[1-blend.amount,blend.amount]),out=null,temp=null;
 try{for(var i=0;i<blend.recipes.length;i++){
   temp=SSTProcess(source,blend.recipes[i],function(f,stage){if(progress)progress(.8*(i+f)/blend.recipes.length,"Blend source "+(i+1)+": "+stage);});
   if(!out){out=temp;temp=null;for(var y=0;y<out.height;y++)for(var x=0;x<out.width;x++)for(var c=0;c<out.numberOfChannels;c++)out.setSample(out.sample(x,y,c)*weights[i],x,y,c);}
   else{for(var y=0;y<out.height;y++)for(var x=0;x<out.width;x++)for(var c=0;c<out.numberOfChannels;c++)out.setSample(out.sample(x,y,c)+temp.sample(x,y,c)*weights[i],x,y,c);temp.free();temp=null;}
  }
  for(var y=0;y<out.height;y++){for(var x=0;x<out.width;x++){var v=[];for(var c=0;c<out.numberOfChannels;c++)v.push(out.sample(x,y,c));v=SSTRefineFinished(v,p);for(c=0;c<v.length;c++)out.setSample(v[c],x,y,c);}
   if(progress&&y%32==0)progress(.8+.2*(y+1)/out.height,"Finishing finalist blend…");}
  var result=out;out=null;if(progress)progress(1,"Blend complete");return result;
 }finally{if(out)out.free();if(temp)temp.free();}
}
function SSTProcessUncached(source,p,progress){
 if(SSTNativeAvailable(source))try{if(SST_ANALYSIS_CONTEXT)SST_ANALYSIS_CONTEXT.nativeAttempts++;var nativeResult=p.recipeBlend?SSTNativeBlend(source,p,progress):SSTNativeReference(source,p,progress);if(!nativeResult)nativeResult=SSTNativeSTF(source,p,progress);if(nativeResult){if(SST_ANALYSIS_CONTEXT)SST_ANALYSIS_CONTEXT.nativeSuccess++;return nativeResult;}}
 catch(nativeError){if(SST_ANALYSIS_CONTEXT)SST_ANALYSIS_CONTEXT.nativeOff=true;console.warningln("[SST native] Rejected; exact JavaScript fallback: "+nativeError);if(progress)progress(0,"Native processing rejected; using exact JavaScript…");}
 if(SSTOptional(p,"recipeBlend",null))return SSTProcessRecipeBlend(source,p,progress);
 function report(f,stage){if(progress)progress(f,stage);}
 report(0,"Preparing full-resolution buffer…");
 var out=new Image(source);out.resetSelections();var C=source.numberOfChannels,hybrid=null /* disabled, including saved spatialHybrid recipes */,coreRecipe=null;
 var analysis=SST_ANALYSIS_CONTEXT&&SST_ANALYSIS_CONTEXT.source===source?SST_ANALYSIS_CONTEXT:null,bulk=null;
 if(analysis){bulk=[];for(var bc=0;bc<C;bc++)bulk.push(source.bitsPerSample==64?new Float64Array(source.width*source.height):new Float32Array(source.width*source.height));}
 try{for(var y=0;y<source.height;y++){for(var x=0;x<source.width;x++){var v=[],index=y*source.width+x;for(var c=0;c<C;c++)v.push(analysis?analysis.planes[c][index]:source.sample(x,y,c));var raw=v;v=SSTPixel(raw,p);if(!p.quick)v=SSTFinishedValues(v,p);
  /* Spatial core blending temporarily disabled.
  if(hybrid){var weight=SSTHybridWeight(x/Math.max(1,source.width-1),y/Math.max(1,source.height-1),hybrid);
   if(weight>0){var protectedValues=SSTFinishedValues(SSTPixel(raw,coreRecipe),coreRecipe);v=SSTHybridBlend(v,protectedValues,weight);}}
  */
  for(c=0;c<C;c++){if(bulk)bulk[c][index]=v[c];else out.setSample(v[c],x,y,c);}}
  if(y%32==0)report(.70*(y+1)/source.height,"Stretching pixels…");
 }if(bulk){for(var c=0;c<C;c++)SmartTools.writePlane(out,bulk[c],c);analysis.bulkPixels+=source.width*source.height;bulk=null;}
 if(!p.quick){var enhanced=SSTFinalContrast(out,p,function(f,stage){report(.70+(SSTOptional(p,"broadbandColorGuard",null)?.25:.30)*f,stage);});if(enhanced!==out){out.free();out=enhanced;}SSTApplyColorGuard(out,source,p,function(f,stage){report(.95+.05*f,stage);});report(1,"Stretch complete");return out;}report(.70,"Finishing stretch…");
 if(p.quick){var finished=SSTQuickFinish(out,p,function(f,stage){report(.70+.20*f,stage);});if(finished!==out){out.free();out=finished;}}
 report(.90,"Applying final brightness…");
 if(p.finishGamma!==undefined&&p.finishGamma!=1)for(var y=0;y<out.height;y++){for(var x=0;x<out.width;x++)for(var c=0;c<C;c++)out.setSample(Math.pow(SSTClamp(out.sample(x,y,c),0,1),p.finishGamma),x,y,c);
  if(y%32==0)report(.90+.10*(y+1)/out.height,"Applying final brightness…");}
 var endpoints=SSTOptional(p,"endpoints",null);
 if(endpoints)for(var ey=0;ey<out.height;ey++){for(var ex=0;ex<out.width;ex++)for(var ec=0;ec<C;ec++)out.setSample(SSTEndpointValue(out.sample(ex,ey,ec),p),ex,ey,ec);
  if(ey%32==0)report(.99,"Applying saved black/white endpoints…");}
 if(SSTOptional(p,"objectLift",null))for(var oy=0;oy<out.height;oy++){for(var ox=0;ox<out.width;ox++){var v=[];for(var oc=0;oc<C;oc++)v.push(out.sample(ox,oy,oc));v=SSTObjectLift(v,p);for(oc=0;oc<C;oc++)out.setSample(v[oc],ox,oy,oc);}
  if(oy%32==0)report(.99,"Balancing compact-object brightness…");}
 if(SSTOptional(p,"finishRefinements",null))for(var fy=0;fy<out.height;fy++){for(var fx=0;fx<out.width;fx++){var fv=[];for(var fc=0;fc<C;fc++)fv.push(out.sample(fx,fy,fc));fv=SSTRefineFinished(fv,p);for(fc=0;fc<C;fc++)out.setSample(fv[fc],fx,fy,fc);}
  if(fy%32==0)report(.995,"Applying bounded refinement…");}

 var enhanced=SSTFinalContrast(out,p,function(f,stage){report(.995+.005*f,stage);});if(enhanced!==out){out.free();out=enhanced;}
 report(1,"Stretch complete");return out;}catch(e){out.free();throw e;}
}
function SSTStellarRecipe(image,reference,v,group){
 var points=reference.structure.stellarPoints,peaks=[],C=image.numberOfChannels;
 for(var i=0;i<points.length;i++){var peak=0;for(var c=0;c<C;c++)peak=Math.max(peak,image.sample(points[i].x,points[i].y,c));peaks.push(peak);}
 peaks.sort(function(a,b){return a-b;});var bg=Math.max(0,reference.luminance.p20),anchor=Math.max(bg+1e-8,SSTPercentile(peaks,.5));
 return {version:2,coreContrast:0,saturation:0,background:bg,backgroundOutput:.001,
  knee:Math.min(.95,anchor),kneeOutput:.38+.035*v+.012*(group-4),ceiling:.92+.02*(group%3),lowShape:1+(group%3),highShape:Math.max(1,Math.min(1e12,(1-anchor)/Math.max(1e-8,anchor-bg)))};
}
var SST_M31_BLEND_REFERENCE={"stats":{"luminance":{"median":0.0026972964400891215,"sigma":6.212313622798327e-05,"min":0.0022021467147395014,"max":0.8018466792702674,"p90":0.005065306940721347,"p99":0.020417812772262855,"count":58200},"channels":[{"median":0.0027268388075754046,"sigma":6.640866149682551e-05,"min":0.0021760771051049232,"max":0.8674163818359375,"p90":0.005043172603473066,"p99":0.02087306844070567,"count":58200},{"median":0.0026912669418379664,"sigma":6.176420054398478e-05,"min":0.002207228448241949,"max":0.7704654932022095,"p90":0.005074908351525663,"p99":0.020439465586096058,"count":58200},{"median":0.0027022045105695724,"sigma":0.00012786527877906337,"min":0.0020692585967481136,"max":0.9196265339851379,"p90":0.005080703319981693,"p99":0.019771249815821693,"count":58200}]},"palette":"Broadband RGB","recipes":[{"id":"f4v1","family":4,"variant":1,"target":0.24942420922572076,"black":[0],"shape":[498.0383101643631],"method":"asinh","second":0,"baseline":false,"scenario":"Galaxy central shoulder lift","finishGamma":0.7577290330856016,"luminanceGamut":true,"finishRefinements":[{"mode":3,"strength":0.12}],"broadbandColorGuard":{"version":1,"low":0.0027594195763171047,"high":0.003007912121229038,"backgroundStrength":0.75,"redStrength":0.25},"autoHighContrast":0.5,"endpoints":{"version":1,"black":0.21206421333423514,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"},"duplicateUnresolved":false},{"id":"f7v4","family":7,"variant":4,"target":0.24942420922572076,"black":[0],"shape":[0.010702581654169818],"method":"mtf","second":0.2727272727272727,"baseline":false,"scenario":"Galaxy central shoulder lift","finishGamma":1.1533484606855668,"luminanceGamut":true,"finishRefinements":[{"mode":3,"strength":0.12}],"broadbandColorGuard":{"version":1,"low":0.0027594195763171047,"high":0.003007912121229038,"backgroundStrength":0.75,"redStrength":0.25},"autoHighContrast":0.5,"endpoints":{"version":1,"black":0.22019985089183414,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"},"duplicateUnresolved":false}]};
function SSTCandidates(stats,seed,source,target,preferenceModel,palette){
 palette=palette||"Broadband RGB";if(SST_PALETTES.indexOf(palette)<0)throw new Error("Unknown palette.");
 var names=["Restrained background","Balanced signal","Faint-signal emphasis","Highlight detail","Color preservation","Midtone contrast","Gentle stretch","Bright structure","Wide signal range"],a=[];
 var noise=stats.luminance.sigma/Math.max(1e-8,stats.luminance.median);
 var center=target=="Faint filaments / Spaghetti"?.30:target=="Galaxy"?.20:.25;
 center=SSTClamp(center-.025*SSTClamp(noise,0,2),.16,.30);
 var offsets=[-.09,0,.09,-.03,.02,.04,-.06,.06,-.01];
 var families=[1,3,4,8,0,7,6,5,2];

 var hdrSource=source?SSTQualitySource(source):null;
 var assessment=SSTHDRAssessment(hdrSource),hdrEligible=assessment.eligible;
 stats.hdrAssessment=assessment;stats.detectedStructure=hdrSource?SSTCopy(hdrSource.structure):null;
 var hybridMask=null; // Spatial hybrid temporarily disabled; skip mask calculation.
 // var hybridMask=source&&hdrEligible&&hdrSource.structure.type=="galaxy"?SSTGalaxyCoreMask(source,hdrSource):null;
 var protection=SSTCompactProtection(source,hdrSource);if(protection)stats.compactProtection=protection;
 for(var group=0;group<9;group++)for(var v=0;v<9;v++){
  var f=families[(group+v)%9],p=SSTBuildRecipe(f,v,stats);
  p.id="f"+f+"v"+v;p.scenario=names[group];
  // One untouched default Quick baseline is always present.
  if(f==0&&v==3){p=SSTBuildRecipe(0,3,stats);p.quick=true;p.linear=true;p.contrast=1;p.scenario="Current Quick baseline";}
  else{p.baseline=false;var desired=SSTClamp(center+offsets[group]+(v%3-1)*.035,.08,.48);
   p.finishGamma=SSTClamp(Math.log(desired)/Math.log(Math.max(.001,p.target)),.35,2.8);p.target=desired;}
  if(!p.quick&&(f==8||f==5)&&source){
   p.selectiveMidtone=SSTMidtone(Math.max(1e-8,stats.luminance.median),SSTClamp(.27+(v%3-1)*.035,.20,.36));
   p.selectiveKnee=SSTClamp(SSTMTF(.60,1-p.selectiveMidtone),1e-7,.9);p.selectiveCeiling=.90+(v%3)*.025;
   p.finishGamma=1;p.scenario="Faint signal + selective highlight shoulder";
  }
  if(hdrEligible&&!p.quick&&(hdrSource.structure&&hdrSource.structure.type=="galaxy"?v%3==0:v%3!=2)){
   delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;
   p.hdr=SSTHDRRecipe(hdrSource,v,group);if(hdrSource.structure.type=="extended"){p.hdr.kneeOutput=[.44,.52,.60][v%3];}p.finishGamma=1;p.scenario="Source-aware HDR balance";
  }
  // Reserve existing HDR slots for brighter reference-like choices, without adding rounds.
  // Galaxy recipes never enter this source-specific branch.
  if(p.hdr&&group>=6&&hdrSource.structure.type=="extended"&&palette=="Broadband RGB"&&stats.channels.length==3&&
     assessment.eligible&&assessment.tailToMedian>=50&&assessment.coreToNebula>=12&&assessment.coreFraction>=.004&&assessment.coreFraction<=.025&&
     Math.abs(Math.log(assessment.tailToMedian/337.70))/Math.log(8)+Math.abs(Math.log(assessment.coreToNebula/34.25))/Math.log(4)<=1.5){
   p.hdr.kneeOutput=[.62,.72,.82][v%3];p.hdr.ceiling=[.96,.97,.98][group-6];
   p.hdr.saturation=[.15,.25,.35][group-6];p.scenario="M42 reference: bright core with visible outer nebulosity";
  }
  if(preferenceModel&&!p.quick){var one=[p];SSTPersonalizeCandidates(one,stats,preferenceModel,group);p=one[0];}
  SSTProtectCompactRecipe(p,stats);
  if(protection&&!p.quick&&[3,4,7,8].indexOf(p.family)>=0)p.objectTarget=[.52,.59,.66][v%3];
  if(source&&!p.quick&&hdrSource.structure.type=="starField"){
   delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;delete p.objectTarget;delete p.objectLift;
   p.hdr=SSTStellarRecipe(source,hdrSource,v,group);p.finishGamma=1;p.stellarCalibration=true;p.scenario="Stellar brightness and color balance";
  }
  if(source&&!p.quick&&hdrSource.structure.type=="galaxy"&&p.family>=3&&!p.hdr)p.luminanceGamut=true;
  if(source&&!p.quick&&hdrSource.structure.type=="galaxy"&&!p.hdr&&v%3==1){p.finishRefinements=[{mode:3,strength:.12}];p.scenario="Galaxy central shoulder lift";}
  if(source&&!p.quick&&hdrSource.structure.type=="extended"&&hdrEligible&&!p.hdr){p.highlightShoulder=.88;p.scenario="Extended nebula with gentle peak protection";}
  if(palette=="SHO"&&!p.quick&&stats.channels.length==3){p.shoRedLift=[0,.08,.16][v%3];if(!p.hdr&&p.family>=3)p.luminanceGamut=true;}
  if(palette=="SHO"){
   SSTCalibrateSHO(p,stats);
   if(p.family==2&&!p.quick){for(var sc=0;sc<stats.channels.length;sc++){var st=stats.channels[sc],b=SSTBlack(st,5.5);p.black[sc]=b;p.shape[sc]=SSTMidtone(Math.max(1e-12,SSTNormalized(st.median,b)),SST_TARGET_MEDIANS[p.variant]);}p.scenario="SHO conservative channel backgrounds";}
  }
  if(source&&!p.quick)p.pendingPreparation=true;
  if(!p.quick&&palette=="Broadband RGB"&&stats.channels.length==3&&(!preferenceModel||!preferenceModel.examples.length)){
   var med=stats.luminance.median,sigma=Math.max(1e-12,stats.luminance.sigma);
   p.broadbandColorGuard={version:1,low:med+sigma,high:med+5*sigma,backgroundStrength:.75,redStrength:.25};
  }
  /* Spatial hybrid temporarily disabled: reported donut artifacts in galaxy dust lanes.
  if(hybridMask&&!p.quick&&v%3==2){
   delete p.hdr;delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;
   p.spatialHybrid={version:1,mask:SSTCopy(hybridMask),radius:[1,1.3,1.6][group%3],core:SSTHDRRecipe(hdrSource,0,group)};
   p.spatialHybrid.core.saturation=0;p.scenario="Spatial hybrid: conventional disk, protected core";
  }
  */
  if(!p.quick)p.autoHighContrast=[0,.5,1][v%3];
  if(group==1&&v==8&&source&&hdrSource.structure.type=="galaxy"&&!p.quick&&palette==SST_M31_BLEND_REFERENCE.palette&&stats.channels.length==3){
   var reference=SST_M31_BLEND_REFERENCE.stats,aLum=stats.luminance,bLum=reference.luminance;
   var distance=SSTDistance(aLum,bLum)+.5*Math.abs(Math.log((aLum.p99+1e-8)/(aLum.median+1e-8))-Math.log((bLum.p99+1e-8)/(bLum.median+1e-8)));
   if(distance<.35){p.recipeBlend={version:1,amount:.5,recipes:SSTCopy(SST_M31_BLEND_REFERENCE.recipes)};
    delete p.pendingPreparation;delete p.finishRefinements;delete p.spatialHybrid;delete p.hdr;delete p.endpoints;delete p.objectLift;delete p.objectTarget;
    p.scenario="50/50 blend of completed asinh and two-stage MTF results";}
  }
  if(source&&SSTGHSReferenceEligible(hdrSource,palette)&&SSTGHSReferenceMatch(stats,palette)&&group<3&&v==8){
   p={id:p.id,family:3,variant:v,target:.25,black:[0],shape:[.5],method:"mtf",second:0,baseline:false,quick:false,finishGamma:[1,.94,1.06][group],autoHighContrast:0,
    referenceCurve:{version:1,name:SST_GHS_REFERENCE.name,curves:SSTCopy(SST_GHS_REFERENCE.curves)},scenario:"Paired GHS reference"+(group?" — gentle brightness variation":" — measured match")};
  }
  if(palette=="SHO"&&SSTOptional(p,"sourceGain",null))p.autoHighContrast=Math.min(.25,SSTOptional(p,"autoHighContrast",0));
  a.push(p);
 }return a;
}
function SSTFinishedValues(v,p){
 var a=[];for(var c=0;c<v.length;c++)a.push(SSTEndpointValue(Math.pow(v[c],p.finishGamma||1),p));
 if(p.highlightShoulder!==undefined){var peak=Math.max.apply(null,a),k=p.highlightShoulder;if(peak>k){var mapped=k+(.98-k)*(1-Math.exp(-(peak-k)/(.98-k))),gain=mapped/peak;for(c=0;c<a.length;c++)a[c]*=gain;}}
 a=SSTRefineFinished(SSTObjectLift(a,p),p);
 if(a.length==3&&SSTOptional(p,"shoRedLift",0)>0){var lum=SSTY(a);a[0]+=p.shoRedLift*a[0]*(1-a[0])*4*lum*(1-lum);}
 return a;
}
function SSTObjectLift(v,p){
 var h=SSTOptional(p,"objectLift",null);if(!h)return v;
 var peak=0;for(var c=0;c<v.length;c++)peak=Math.max(peak,v[c]);if(peak<=h.background||peak<=1e-12)return v;
 var u=(peak-h.background)/(1-h.background),mapped=h.background+(1-h.background)*SSTMTF(u,h.midtone),gain=mapped/peak;
 for(c=0;c<v.length;c++)v[c]*=gain;return v;
}
// SHO linked curves must stretch emission above each channel's pedestal.
// Stretching the common raw offset compresses structure and hides color differences.
function SSTCalibrateSHO(p,stats){
 if(p.quick||p.family<3||p.hdr||p.referenceCurve||p.recipeBlend||stats.channels.length!=3)return;
 var corrected=SSTCopy(stats),pedestal=[],gains=[],lum=[],spreads=stats.channels.map(function(ch){return Math.max(1e-12,ch.sigma);}).sort(function(a,b){return a-b;}),common=spreads[1];
 for(var c=0;c<3;c++){var raw=stats.channels[c],b=SSTBlack(raw,2.8),gain=SSTClamp(common/Math.max(1e-12,raw.sigma),.05,20);pedestal.push(b);gains.push(gain);
  var ch=corrected.channels[c];for(var k in ch)if(["median","min","max","p90","p99"].indexOf(k)>=0)ch[k]=SSTClamp(SSTNormalized(raw[k],b)*gain,0,1);ch.sigma=gain*raw.sigma/Math.max(1e-12,1-b);lum.push(ch.median);}
 corrected.luminance.median=SSTY(lum);
 var solved=SSTBuildRecipe(p.family,p.variant,corrected);p.sourcePedestal=pedestal;p.sourceGain=gains;p.black=solved.black;p.shape=solved.shape;p.method=solved.method;p.second=solved.second;
 delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;delete p.objectTarget;delete p.objectLift;delete p.endpoints;
 p.finishGamma=SSTClamp(Math.log(SSTClamp(p.target,.12,.36))/Math.log(SST_TARGET_MEDIANS[p.variant]),.65,1.5);
 p.shoGamutShoulder=true;p.autoHighContrast=Math.min(.25,SSTOptional(p,"autoHighContrast",0));
 p.scenario="SHO channel-balanced signal with soft highlights";
}
function SSTSHOBlendPreference(session){
 if(SSTOptional(session,"palette","Broadband RGB")!="SHO")return null;
 var model=SSTOptional(session,"preferenceModel",null),best=null;if(!model)return null;
 for(var i=0;i<model.examples.length;i++){var e=model.examples[i];if(e.weight>=.5&&SSTOptional(e.recipe,"recipeBlend",null)&&(!best||e.weight>best.weight))best=e;}return best;
}
function SSTPrepareGrid(session,source,progress){
 var grid=SSTGrid(session),pending=false;
 for(var i=0;i<grid.length;i++)if(SSTOptional(grid[i],"pendingPreparation",false))pending=true;
 if(!pending)return;
 var samples=SSTEndpointSamples(source),probes=SSTPreviewSamples(source),reference=SSTQualitySource(source),accepted=[],C=source.numberOfChannels;
 var shoAnchor=null;if(SSTOptional(session,"palette","Broadband RGB")=="SHO"&&session.stage=="round")for(var ai=0;ai<grid.length;ai++)if(grid[ai].family==0&&!grid[ai].quick){shoAnchor=SSTCopy(grid[ai]);if(shoAnchor.pendingPreparation){SSTFitEndpoints(shoAnchor,samples,C);delete shoAnchor.pendingPreparation;}break;}
 for(i=0;i<grid.length;i++){var p=grid[i];if(progress)progress(i,grid.length);
  if(SSTOptional(p,"recipeBlend",null)){p.duplicateUnresolved=false;continue;}
  if(SSTOptional(p,"pendingPreparation",false)){
   SSTFitEndpoints(p,samples,C);
   var target=SSTOptional(p,"objectTarget",null);
   if(target!==null){var peaks=[],background=[];
    for(var k=0;k<samples.length;k+=C){var out=SSTFinishedValues(SSTPixel(samples.slice(k,k+C),p),p);background.push(SSTY(out));}
    background.sort(function(a,b){return a-b;});var bg=SSTPercentile(background,.20);
    for(k=0;k<reference.signalPoints.length;k++){var point=reference.signalPoints[k],v=[];for(var c=0;c<C;c++)v.push(source.sample(point.x,point.y,c));var out=SSTFinishedValues(SSTPixel(v,p),p);peaks.push(Math.max.apply(null,out));}
    peaks.sort(function(a,b){return a-b;});var anchor=SSTPercentile(peaks,.5);
    if(peaks.length>=12&&anchor>bg+1e-6&&anchor<target){var u=(anchor-bg)/(1-bg),t=(target-bg)/(1-bg);p.objectLift={version:1,background:bg,midtone:SSTMidtone(u,t)};}
   }
   delete p.pendingPreparation;
   if(shoAnchor&&p.family==7&&p.shoGamutShoulder){
    var linked=SSTCopy(p);p.recipeBlend={version:1,amount:.5,weights:[.5,.5],recipes:[SSTCopy(shoAnchor),linked]};
    p.scenario="SHO halfway: channel curves + soft linked stretch";
    var learned=SSTSHOBlendPreference(session);
    delete p.finishRefinements;delete p.spatialHybrid;delete p.hdr;delete p.objectLift;delete p.objectTarget;delete p.endpoints;
    if(learned){p.finishRefinements=SSTCopy(SSTOptional(learned.recipe,"finishRefinements",[]));p.preferenceGuided=true;p.preferenceSource=learned.sourceId;p.scenario="SHO blend with learned saturation and midtones";}
    p.duplicateUnresolved=false;continue;
   }
  }
  var signature=[];for(var k=0;k<probes.length;k+=C){var v=SSTFinishedValues(SSTPixel(probes.slice(k,k+C),p),p);for(var c=0;c<C;c++)signature.push(v[c]);}
  var duplicate=false;for(k=0;k<accepted.length;k++)if(SSTRegionDifference(signature,accepted[k],C)<.008){duplicate=true;break;}
  if(!p.quick)p.duplicateUnresolved=duplicate;accepted.push(signature);
 }
}
function SSTRegionDifference(a,b,C){
 var sum=0,regions=[],counts=[];for(var r=0;r<12;r++){regions[r]=0;counts[r]=0;}
 for(var k=0;k<a.length;k++){var d=a[k]-b[k],pixel=Math.floor(k/C),x=pixel%30,y=Math.floor(pixel/30),r=Math.min(2,Math.floor(y*3/20))*4+Math.min(3,Math.floor(x*4/30));sum+=d*d;regions[r]+=d*d;counts[r]++;}
 var local=0;for(r=0;r<12;r++)local=Math.max(local,Math.sqrt(regions[r]/Math.max(1,counts[r])));
 return Math.max(Math.sqrt(sum/Math.max(1,a.length)),local*.6);
}
// Portable lossless PNG encoder: no disk files, plugins or external encoders.


var SSTSourceCacheImage=null,SSTSourceCacheValue=null;
function SSTStructure(image,reference){
 // Measure spatial shape independently of the object's name and brightness.
 var scale=Math.max(1,Math.ceil(Math.max(image.width,image.height)/600)),W=Math.ceil(image.width/scale),H=Math.ceil(image.height/scale),N=W*H,C=image.numberOfChannels,a=[],sum=[],smooth=[],peaks=[],i,x,y;
 function at(xx,yy){return a[Math.max(0,Math.min(H-1,yy))*W+Math.max(0,Math.min(W-1,xx))];}
 for(y=0;y<H;y++)for(x=0;x<W;x++){var xx=Math.min(image.width-1,x*scale),yy=Math.min(image.height-1,y*scale);a.push(C==1?image.sample(xx,yy,0):.2126*image.sample(xx,yy,0)+.7152*image.sample(xx,yy,1)+.0722*image.sample(xx,yy,2));}
 for(i=0;i<(W+1)*(H+1);i++)sum[i]=0;
 for(y=0;y<H;y++)for(x=0;x<W;x++)sum[(y+1)*(W+1)+x+1]=a[y*W+x]+sum[y*(W+1)+x+1]+sum[(y+1)*(W+1)+x]-sum[y*(W+1)+x];
 function mean(xx,yy,r){var x0=Math.max(0,xx-r),x1=Math.min(W,xx+r+1),y0=Math.max(0,yy-r),y1=Math.min(H,yy+r+1);return (sum[y1*(W+1)+x1]-sum[y0*(W+1)+x1]-sum[y1*(W+1)+x0]+sum[y0*(W+1)+x0])/((x1-x0)*(y1-y0));}
 var sorted=a.slice().sort(function(u,v){return u-v;}),bg=SSTPercentile(sorted,.2),tail=Math.max(1e-10,SSTPercentile(sorted,.999)-bg),residual=[];
 for(y=0;y<H;y++)for(x=0;x<W;x++){smooth.push(mean(x,y,8));residual.push(Math.abs(at(x,y)-mean(x,y,1)));}
 residual.sort(function(u,v){return u-v;});var noise=SSTPercentile(residual,.5),cut=Math.max(noise*8,tail*.01);
 for(y=2;y<H-2;y++)for(x=2;x<W-2;x++){var v=at(x,y);if(v-bg<Math.max(noise*8,tail*.02)||v-mean(x,y,2)<cut)continue;var maximum=true;for(var dy=-2;dy<=2&&maximum;dy++)for(var dx=-2;dx<=2;dx++)if(at(x+dx,y+dy)>v){maximum=false;break;}if(maximum)peaks.push({x:x,y:y});}
 var ss=smooth.slice().sort(function(u,v){return u-v;}),threshold=bg+.15*Math.max(1e-10,SSTPercentile(ss,.999)-bg),seen=[],largest=[];
 for(i=0;i<N;i++){if(seen[i]||smooth[i]<=threshold)continue;var queue=[i];seen[i]=true;for(var q=0;q<queue.length;q++){var z=queue[q],zx=z%W,zy=Math.floor(z/W),neighbors=[];if(zx>0)neighbors.push(z-1);if(zx<W-1)neighbors.push(z+1);if(zy>0)neighbors.push(z-W);if(zy<H-1)neighbors.push(z+W);for(var k=0;k<neighbors.length;k++){var n=neighbors[k];if(!seen[n]&&smooth[n]>threshold){seen[n]=true;queue.push(n);}}}if(queue.length>largest.length)largest=queue;}
 var cx=0,cy=0;for(i=0;i<largest.length;i++){cx+=largest[i]%W;cy+=Math.floor(largest[i]/W);}cx/=Math.max(1,largest.length);cy/=Math.max(1,largest.length);
 var xx2=0,yy2=0,xy=0;for(i=0;i<largest.length;i++){x=largest[i]%W-cx;y=Math.floor(largest[i]/W)-cy;xx2+=x*x;yy2+=y*y;xy+=x*y;}var trace=xx2+yy2,delta=Math.sqrt((xx2-yy2)*(xx2-yy2)+4*xy*xy),axis=Math.sqrt((trace+delta)/Math.max(1e-8,trace-delta)),r=.15*Math.min(W,H),central=0;
 for(i=0;i<peaks.length;i++)if(Math.pow(peaks[i].x-cx,2)+Math.pow(peaks[i].y-cy,2)<r*r)central++;
 var concentration=central/Math.max(1,peaks.length)/(Math.PI*r*r/N),fraction=largest.length/N,type="extended";
 if(peaks.length>=100&&axis>=1.8&&fraction>=.004)type="galaxy";
 else if(peaks.length>=150&&concentration>=3&&axis<1.5&&fraction>=.004&&fraction<.035)type="cluster";
 else if(peaks.length>=100&&concentration<2&&fraction<.01)type="starField";
 var stellarPoints=[];for(i=0;i<peaks.length;i+=Math.max(1,Math.ceil(peaks.length/300)))stellarPoints.push({x:peaks[i].x*scale,y:peaks[i].y*scale});
 var diskPoints=[],outerPoints=[],regionStep=Math.max(1,Math.ceil(Math.sqrt(N/6000))),broadSpan=Math.max(1e-10,SSTPercentile(ss,.999)-bg);
 for(y=0;y<H;y+=regionStep)for(x=0;x<W;x+=regionStep){var excess=smooth[y*W+x]-bg;if(excess<Math.max(5*noise,broadSpan*.008))continue;var point={x:x*scale,y:y*scale};if(excess<broadSpan*.08)outerPoints.push(point);else if(excess<broadSpan*.65)diskPoints.push(point);}
 return {version:2,type:type,diskPoints:diskPoints,outerPoints:outerPoints,stellarPoints:stellarPoints,peakCount:peaks.length,centralConcentration:concentration,axisRatio:axis,extendedFraction:fraction};
}
function SSTQualitySource(image){
 if(SSTSourceCacheImage===image&&SSTSourceCacheValue)return SSTSourceCacheValue;
 var value=SSTQualitySourceUncached(image);value.backgroundPoints=SSTBackgroundPoints(image);value.channelHighlights=SSTChannelHighlightSource(image,value);value.structure=SSTStructure(image,value);value.ghsReferenceSamples=SSTGHSReferenceSamples(image,value);SSTSourceCacheImage=image;SSTSourceCacheValue=value;return value;
}
function SSTQualitySourceUncached(image){
 var d=SSTDescribe(image,"quality reference preview",12000),values=[],points=[],C=image.numberOfChannels,W=image.width,H=image.height;
 function yAt(x,y){return C==1?image.sample(x,y,0):.2126*image.sample(x,y,0)+.7152*image.sample(x,y,1)+.0722*image.sample(x,y,2);}
 var step=Math.max(1,Math.ceil(Math.sqrt(W*H/240000)));
 for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step)values.push(yAt(x,y));values.sort(function(a,b){return a-b;});
 var signalPoints=[],signalStep=Math.max(1,Math.ceil(Math.sqrt(W*H/24000))),low=SSTPercentile(values,.40),high=SSTPercentile(values,.90);
 var bg=d.background.statistics?d.background.statistics.median:0;
 low=Math.max(low,bg+Math.max(1e-7,3*(d.noise.sigmaEstimate||0)));
 for(var sy=1;sy<H-1;sy+=signalStep)for(var sx=1;sx<W-1;sx+=signalStep){var sv=yAt(sx,sy);if(sv<=low||sv>=high)continue;
  var support=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++)if(yAt(sx+dx,sy+dy)>low) support++;
  if(support>=6)signalPoints.push({x:sx,y:sy});
 }
 if(signalPoints.length<12||high<=bg+5*Math.max(1e-7,d.noise.sigmaEstimate||0)||high-bg<.08*Math.max(1e-8,d.luminance.p999-bg)){
  var objectLow=Math.max(d.luminance.p99,bg+8*Math.max(1e-7,d.noise.sigmaEstimate||0)),objectPoints=[];
  for(var oy=1;oy<H-1;oy+=signalStep)for(var ox=1;ox<W-1;ox+=signalStep){var ov=yAt(ox,oy);if(ov<=objectLow||ov>=d.luminance.p999)continue;
   var support=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++)if(yAt(ox+dx,oy+dy)>objectLow) support++;
   if(support>=6)objectPoints.push({x:ox,y:oy});}
  if(objectPoints.length>=12){signalPoints=objectPoints;d.compactSignal=true;}
 }
 // Detect a concentrated, pedestal-dominated object even when cropping
 // raises its occupancy above the old top-one-percent fallback. A coherent
 // 5x5 neighborhood rejects isolated stars; HDR eligibility remains separate.
 var tail=Math.max(0,d.luminance.p999-bg),objectThreshold=bg+.45*tail;
 if(!d.compactSignal&&tail>40*Math.max(1e-7,d.noise.sigmaEstimate||0)&&
    high-bg<.60*tail&&bg>3*tail){
  var coherent=[],tested=0;
  for(var cy=2;cy<H-2;cy+=signalStep)for(var cx=2;cx<W-2;cx+=signalStep){tested++;
   var cv=yAt(cx,cy);if(cv<=objectThreshold||cv>=d.luminance.p999)continue;
   var nearby=0;for(var yy=-2;yy<=2;yy++)for(var xx=-2;xx<=2;xx++)if(yAt(cx+xx,cy+yy)>objectThreshold)nearby++;
   if(nearby>=18)coherent.push({x:cx,y:cy});
  }
  var occupancy=coherent.length/Math.max(1,tested);
  if(coherent.length>=12&&occupancy>=.001&&occupancy<=.35){
   signalPoints=coherent;d.compactSignal=true;
   d.objectDetection={version:2,method:"coherent pedestal-dominated bright structure",occupancy:occupancy,threshold:objectThreshold};
  }
 }
 d.signalPoints=signalPoints;
 if(d.luminance.p999<3*Math.max(1e-8,d.luminance.median)){d.corePoints=[];d.coreMethod="No distinct high-dynamic-range core detected";return d;}
 var threshold=Math.max(SSTPercentile(values,.98),d.luminance.median+6*(d.noise.sigmaEstimate||0),d.luminance.median+.10*(d.luminance.p999-d.luminance.median));
 for(y=2;y<H-2;y+=step)for(x=2;x<W-2;x+=step){var v=yAt(x,y),sourcePeak=0;for(var cc=0;cc<C;cc++)sourcePeak=Math.max(sourcePeak,image.sample(x,y,cc));if(v<threshold||sourcePeak>=.997)continue;
  var neighbors=0;for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)if(yAt(x+dx,y+dy)>=threshold)neighbors++;
  if(neighbors>=13)points.push({x:x,y:y,signal:v});
 }
 // Select from extended bright regions, not isolated brightest-pixel samples.
 d.corePoints=points;d.coreThreshold=threshold;d.coreMethod="source top 2 percent; >=13/25 bright neighbors; source-saturated pixels excluded";
 return d;
}
// Each channel gets its own coherent bright-region samples. This catches
// red filaments even when green-dominated luminance has ample detail.
function SSTChannelHighlightSource(image,reference){
 var result=[],C=image.numberOfChannels,W=image.width,H=image.height,step=Math.max(1,Math.ceil(Math.sqrt(W*H/24000)));
 for(var c=0;c<C;c++){var values=[];
  for(var y=2;y<H-2;y+=step)for(var x=2;x<W-2;x+=step)values.push(image.sample(x,y,c));
  values.sort(function(a,b){return a-b;});var bg=SSTPercentile(values,.20),tail=SSTPercentile(values,.999),threshold=Math.max(SSTPercentile(values,.90),bg+.45*(tail-bg)),points=[];
  for(y=2;y<H-2;y+=step)for(x=2;x<W-2;x+=step){var v=image.sample(x,y,c);if(v<threshold||v>=.997)continue;
   var support=0;for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)if(image.sample(x+dx,y+dy,c)>=threshold)support++;
   if(support>=18)points.push({x:x,y:y,value:v});
  }
  var bright=points.map(function(p){return p.value;});bright.sort(function(a,b){return a-b;});
  result.push({points:points,sourceSpread:SSTPercentile(bright,.90)-SSTPercentile(bright,.10),threshold:threshold,background:bg});
 }return result;
}
function SSTChannelHighlightQuality(image,source){
 var refs=SSTOptional(source,"channelHighlights",[]),result=[],penalty=0,warning="";
 for(var c=0;c<refs.length;c++){var ref=refs[c],values=[],near=0,clipped=0;
  for(var i=0;i<ref.points.length;i++){var p=ref.points[i],v=image.sample(p.x,p.y,c);values.push(v);if(v>=.95)near++;if(v>=1-1e-6)clipped++;}
  values.sort(function(a,b){return a-b;});var n=values.length,median=SSTPercentile(values,.5),spread=SSTPercentile(values,.90)-SSTPercentile(values,.10),cost=0;
  var structured=n>=12&&ref.sourceSpread>Math.max(1e-7,3*(source.noise.sigmaEstimate||0));
  if(structured){cost=80*clipped/n+25*SSTClamp((median-.80)/.18,0,1)*SSTClamp((.12-spread)/.12,0,1);
   if(clipped/n>.02)warning=(refs.length==1?"Mono":["Red","Green","Blue"][c])+" highlights clipped";
   else if(median>.90&&spread<.045)warning=(refs.length==1?"Mono":["Red","Green","Blue"][c])+" highlight detail washed out";
  }
  penalty=Math.max(penalty,cost);result.push({channel:refs.length==1?"Mono":["R","G","B"][c],sampleCount:n,median:median,p90MinusP10:spread,nearMaximumFraction:n?near/n:0,clippedFraction:n?clipped/n:0,sourceSpread:ref.sourceSpread,structured:structured,penalty:cost});
 }return {channels:result,penalty:penalty,warning:warning};
}
function SSTRegionalQuality(image,source){
 if(!source.structure||["galaxy","extended"].indexOf(source.structure.type)<0)return null;
 function measure(points){var values=[],clip=0,details=[];for(var i=0;i<points.length;i++){var p=points[i],v=[],peak=0;for(var c=0;c<image.numberOfChannels;c++){var z=image.sample(p.x,p.y,c);v.push(z);peak=Math.max(peak,z);}var lum=SSTY(v);values.push(lum);if(peak>=1-1e-6)clip++;if(p.x+1<image.width){var next=[];for(c=0;c<image.numberOfChannels;c++)next.push(image.sample(p.x+1,p.y,c));details.push(Math.abs(lum-SSTY(next)));}}
 values.sort(function(a,b){return a-b;});details.sort(function(a,b){return a-b;});return {count:values.length,median:SSTPercentile(values,.5),spread:SSTPercentile(values,.9)-SSTPercentile(values,.1),clippedFraction:clip/Math.max(1,values.length),localContrast:SSTPercentile(details,.5)};}
 var core=measure(source.corePoints||[]),disk=measure(source.structure.diskPoints||[]),outer=measure(source.structure.outerPoints||[]),score=0;
 if(disk.count>=12)score+=18*SSTClamp(disk.spread/.22,0,1)+12*SSTClamp(disk.median/.35,0,1)-35*SSTClamp((disk.median-.85)/.12,0,1);
 if(outer.count>=12)score+=15*SSTClamp(outer.spread/.12,0,1)+10*SSTClamp(outer.localContrast/.008,0,1);
 if(core.count>=12)score+=10*SSTClamp(core.spread/.18,0,1)-60*core.clippedFraction;
 return {version:1,type:source.structure.type,core:core,diskOrNebula:disk,outskirts:outer,scoreAdjustment:score};
}
function SSTBackgroundPoints(image){
 var step=Math.max(1,Math.ceil(Math.sqrt(image.width*image.height/6000))),points=[],levels=[];
 for(var y=1;y<image.height-1;y+=step)for(var x=1;x<image.width-1;x+=step){var v=[];for(var c=0;c<image.numberOfChannels;c++)v.push(image.sample(x,y,c));points.push({x:x,y:y,level:SSTY(v)});levels.push(SSTY(v));}
 levels.sort(function(a,b){return a-b;});var limit=SSTPercentile(levels,.40);
 return points.filter(function(p){return p.level<=limit;});
}
function SSTBackgroundQuality(image,source){
 var points=SSTOptional(source,"backgroundPoints",[]),levels=[],differences=[],tiles={},colors=0;
 for(var i=0;i<points.length;i++){var p=points[i],v=[],next=[];for(var c=0;c<image.numberOfChannels;c++){v.push(image.sample(p.x,p.y,c));next.push(image.sample(p.x+1,p.y,c));}
  var lum=SSTY(v);levels.push(lum);differences.push(Math.abs(lum-SSTY(next)));
  var key=Math.floor(p.x*8/image.width)+":"+Math.floor(p.y*6/image.height);if(!Object.prototype.hasOwnProperty.call(tiles,key))tiles[key]=[];tiles[key].push(lum);
  if(v.length==3&&lum>.02){var peak=Math.max.apply(null,v),low=Math.min.apply(null,v);if((peak-low)/Math.max(1e-8,peak)>.80)colors++;}
 }
 levels.sort(function(a,b){return a-b;});differences.sort(function(a,b){return a-b;});var med=SSTPercentile(levels,.5),p90=SSTPercentile(levels,.90),tileMedians=[];
 for(var key in tiles)if(tiles[key].length>=4){tiles[key].sort(function(a,b){return a-b;});tileMedians.push(SSTPercentile(tiles[key],.5));}
 tileMedians.sort(function(a,b){return a-b;});var mottling=SSTPercentile(tileMedians,.9)-SSTPercentile(tileMedians,.1),noise=SSTPercentile(differences,.5)/(.67449*Math.sqrt(2));
 var broadband=SSTOptional(source,"palette","Broadband RGB")=="Broadband RGB",colorFraction=colors/Math.max(1,levels.length);
 var penalty=90*SSTClamp((med-.06)/.18,0,1)+70*SSTClamp((p90-.16)/.30,0,1)+50*SSTClamp((mottling-.025)/.12,0,1);
 if(broadband)penalty+=45*SSTClamp((colorFraction-.08)/.35,0,1);
 return {sampleCount:levels.length,median:med,p90:p90,mottling:mottling,noise:noise,colorfulBackgroundFraction:colorFraction,penalty:penalty};
}
// Calibrated from the user's paired M42 linear and preferred render, 2026-10-12.
// Deliberately excludes galaxies, clusters, stellar fields and narrowband palettes.
function SSTM42ReferencePreference(source,quality){
 var none={version:1,profile:"M42 paired reference",eligible:false,scoreAdjustment:0,distance:null,acceptedHighlightTradeoff:false};
 if(!source.structure||source.structure.type!="extended"||SSTOptional(source,"palette","Broadband RGB")!="Broadband RGB"||source.channels!=3)return none;
 var hdr=SSTHDRAssessment(source);
 if(!hdr.eligible||hdr.tailToMedian<50||hdr.coreToNebula<12||hdr.coreFraction<.004||hdr.coreFraction>.025)return none;
 // Broad source similarity gate: prevents teaching all extended objects this look.
 var sourceDistance=Math.abs(Math.log(hdr.tailToMedian/337.70))/Math.log(8)+Math.abs(Math.log(hdr.coreToNebula/34.25))/Math.log(4);
 if(sourceDistance>1.5)return none;
 var r=quality.regional,b=quality.backgroundQuality;
 if(!r||r.core.count<12||r.diskOrNebula.count<12||r.outskirts.count<12||b.sampleCount<24)return none;
 var actual=[b.median,r.core.median,r.core.spread,r.diskOrNebula.median,r.diskOrNebula.spread,r.outskirts.median,r.outskirts.spread];
 var target=[.10037,.88815,.20914,.81915,.19580,.46570,.38411];
 var tolerance=[.055,.16,.14,.20,.16,.20,.22],weights=[2,1,2,1,1,2,1],distance=0,total=0;
 for(var i=0;i<actual.length;i++){distance+=weights[i]*Math.min(3,Math.abs(actual[i]-target[i])/tolerance[i]);total+=weights[i];}
 distance/=total;
 var fit=SSTClamp(1-sourceDistance/1.5,0,1),adjustment=fit*(100-130*distance);
 // Accept only the reference's bounded highlight tradeoff with useful tonal spread.
 // Never excuse background/noise, all-channel washout or broad shadow clipping.
 var accepted=distance<.75&&r.core.spread>=.12&&r.diskOrNebula.spread>=.10&&
  r.core.clippedFraction<=.34&&quality.addedClipping<=.008&&quality.addedBlack<=.02&&
  b.median<=.16&&quality.noiseProminence<.08;
 if(accepted){adjustment+=fit*(2200*quality.addedClipping+160*r.core.clippedFraction+quality.channelHighlights.penalty);}
 return {version:1,profile:"M42 paired reference",eligible:true,sourceDistance:sourceDistance,distance:distance,scoreAdjustment:adjustment,acceptedHighlightTradeoff:accepted,referenceFeatures:target};
}
function SSTQuality(image,source){
 if(SST_ANALYSIS_CONTEXT)image=SSTAnalysisReader(image);
 var d=SSTDescribe(image,"candidate quality preview",12000),l=d.luminance,b=d.background.statistics;
 var clip=Math.max(0,d.clipping.anyChannelClippedFraction-source.clipping.anyChannelClippedFraction);
 var crushed=Math.max(0,d.clipping.allChannelsAtOrBelowZeroFraction-source.clipping.allChannelsAtOrBelowZeroFraction);
 var separation=Math.max(0,l.p90-l.p20),noise=d.noise.sigmaEstimate||0;
 var score=100-2200*clip-650*crushed-80*Math.max(0,(b?b.median:0)-.20)-50*Math.max(0,.015-l.p20);
 score+=12*Math.min(1,separation/.35)-20*Math.min(1,noise/Math.max(.02,separation));
 var stellar=source.structure&&source.structure.type=="starField";
 var points=stellar?[]:source.corePoints||[],coreValues=[],coreDetail=[],near=0,clipped=0;
 for(var i=0;i<points.length;i++){var p=points[i],v=[],maxv=0;
  for(var c=0;c<image.numberOfChannels;c++){var z=image.sample(p.x,p.y,c);v.push(z);maxv=Math.max(maxv,z);}
  coreValues.push(SSTY(v));
  if(p.x>0&&p.x<image.width-1&&p.y>0&&p.y<image.height-1){var neighbors=0;
   for(var axis=0;axis<4;axis++){var nv=[],nx=p.x+(axis==0?-1:axis==1?1:0),ny=p.y+(axis==2?-1:axis==3?1:0);
    for(var nc=0;nc<image.numberOfChannels;nc++)nv.push(image.sample(nx,ny,nc));neighbors+=SSTY(nv);}
   coreDetail.push(Math.abs(SSTY(v)-neighbors*.25));
  }
  if(maxv>=.97)near++;if(maxv>=1-1e-6)clipped++;
 }
 coreValues.sort(function(a,b){return a-b;});var core=null,warning="";
 if(points.length>=12){var range=SSTPercentile(coreValues,.90)-SSTPercentile(coreValues,.10),median=SSTPercentile(coreValues,.5),white=near/points.length;
  var compression=median>.75?SSTClamp((.045-range)/.045,0,1):0;
  core={count:points.length,median:median,p90MinusP10:range,nearWhiteFraction:white,clippedFraction:clipped/points.length,compressionPenalty:compression};
  // Brightness alone is not damage: penalize near-white values only when
  // the core also loses spread. Actual clipping remains strongly penalized.
  score-=35*white*compression+100*core.clippedFraction+30*compression;
  // For extended HDR cores, reward usable tonal spread rather than darkness.
  if(SSTHDRAssessment(source).eligible){
   coreDetail.sort(function(a,b){return a-b;});var detail=SSTPercentile(coreDetail,.75);
   core.localContrast=detail;score+=12*SSTClamp(detail/.02,0,1);
   score+=18*SSTClamp(range/.16,0,1);score-=45*SSTClamp((median-.82)/.16,0,1)*SSTClamp((.12-range)/.12,0,1);
   if(median>.88&&range<.06)warning="Bright core washed out";
  }
  if(core.clippedFraction>.02)warning="Bright-core clipping";
  else if(white>.20&&range<.06||median>.88&&range<.025)warning="Bright core washed out";
 }
 var signalValues=[],sp=stellar?source.structure.stellarPoints:source.signalPoints||[];
 for(var si=0;si<sp.length;si++){var sv=[];for(var sc=0;sc<image.numberOfChannels;sc++)sv.push(image.sample(sp[si].x,sp[si].y,sc));signalValues.push(SSTY(sv));}
 signalValues.sort(function(a,b){return a-b;});
 var galaxy=source.structure&&source.structure.type=="galaxy";
 var objectQuality=stellar||galaxy?null:SSTObjectQuality(signalValues,SSTOptional(source,"compactSignal",false));
 if(objectQuality){score-=objectQuality.penalty;if(objectQuality.washedOut&&!warning)warning="Object detail washed out";
  if(SSTOptional(source,"compactSignal",false))score+=12*SSTClamp(objectQuality.p90MinusP10/.25,0,1)-12*Math.min(1,separation/.35);
 }
 var channelQuality=SSTChannelHighlightQuality(image,source);score-=channelQuality.penalty;
 if(galaxy&&channelQuality.warning){var strong=false;for(var ch=0;ch<channelQuality.channels.length;ch++){var cq=channelQuality.channels[ch];if(cq.clippedFraction*cq.sampleCount>=3||cq.median>.9&&cq.p90MinusP10<.045)strong=true;}if(!strong)channelQuality.warning="";}
 if(!warning&&channelQuality.warning)warning=channelQuality.warning;
 var measuredSignal=signalValues.length>=12?SSTPercentile(signalValues,.5):l.p75===undefined?l.p90:l.p75;
 var background=b?b.median:l.p20,signalContrast=Math.max(0,measuredSignal-background);
 var visibility=SSTClamp(Math.min(measuredSignal/.18,signalContrast/.07),0,1);
 score+=22*visibility;score-=25*(1-visibility);
 var sky=SSTBackgroundQuality(image,source),skyPenalty=sky.sampleCount>=24?sky.penalty:0;
 var noiseProminence=sky.sampleCount>=24?sky.noise/Math.max(.01,signalContrast):noise/Math.max(.01,signalContrast);
 var noisePenalty=65*SSTClamp((noiseProminence-.015)/.15,0,1);score-=skyPenalty+noisePenalty;
 var stellarQuality=null;
 if(stellar){var whiteStars=0,spread=[];for(var st=0;st<sp.length;st++){var point=sp[st],peak=0,wings=0,count=0;for(var cc=0;cc<image.numberOfChannels;cc++)peak=Math.max(peak,image.sample(point.x,point.y,cc));if(peak>.96)whiteStars++;
  for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){if(!dx&&!dy)continue;var sx=point.x+dx,sy=point.y+dy;if(sx<0||sy<0||sx>=image.width||sy>=image.height)continue;var vv=[];for(cc=0;cc<image.numberOfChannels;cc++)vv.push(image.sample(sx,sy,cc));wings+=Math.max(0,SSTY(vv)-background);count++;}spread.push(wings/Math.max(1,count)/Math.max(.001,peak-background));}
  spread.sort(function(a,b){return a-b;});var whiteFraction=whiteStars/Math.max(1,sp.length),wingRatio=SSTPercentile(spread,.5);
  var starPenalty=100*whiteFraction+70*SSTClamp((wingRatio-.35)/.4,0,1)+100*SSTClamp(background/.06,0,1)+40*SSTClamp(noise/.012,0,1);score-=starPenalty;
  stellarQuality={nearWhiteFraction:whiteFraction,medianWingToPeak:wingRatio,penalty:starPenalty};if(whiteFraction>.15)warning="Too many near-white stellar cores";else if(background>.06||noise>.012)warning="Stellar background amplified";
 }
 var regional=SSTRegionalQuality(image,source);if(regional)score+=regional.scoreAdjustment;
 var palette=SSTOptional(source,"palette","Broadband RGB"),paletteQuality=null;
 if(palette=="SHO"&&image.numberOfChannels==3){var rp=source.structure?source.structure.diskPoints:[],reds=[],redClipped=0;for(var pi=0;pi<rp.length;pi++){var rv=image.sample(rp[pi].x,rp[pi].y,0);reds.push(rv);if(rv>=1-1e-6)redClipped++;}reds.sort(function(a,b){return a-b;});var redSpread=SSTPercentile(reds,.9)-SSTPercentile(reds,.1),fraction=redClipped/Math.max(1,reds.length),adjustment=reds.length>=12?4*SSTClamp(redSpread/.18,0,1)-40*fraction:0;score+=adjustment;paletteQuality={sampleCount:reds.length,redSpread:redSpread,redClippedFraction:fraction,scoreAdjustment:adjustment};}
 // Strong background amplification must not masquerade as recovered object detail.
 if(!warning&&sky.sampleCount>=24&&sky.median>.22)warning="Background amplified";
 if(!warning&&sky.sampleCount>=24&&sky.noise>.025&&noiseProminence>.15)warning="Background noise amplified";
 if(!warning&&palette=="Broadband RGB"&&sky.sampleCount>=24&&sky.colorfulBackgroundFraction>.40)warning="Background color oversaturation";
 // Mild stretches are valid alternatives when they retain structure.
 if(!warning&&visibility<.40)warning="Faint overall signal";
 if(!warning&&clip>.003)warning="Highlight clipping";
 // A dark background alone is not a hard warning: retain it as a score penalty.
 if(!warning&&crushed>.12)warning="Extensive shadow clipping";
 var preferred=SSTM42ReferencePreference(source,{regional:regional,backgroundQuality:sky,channelHighlights:channelQuality,addedClipping:clip,addedBlack:crushed,noiseProminence:noiseProminence});
 score+=preferred.scoreAdjustment;
 if(preferred.acceptedHighlightTradeoff&&(warning=="Bright-core clipping"||warning=="Highlight clipping"||/^(Red|Green|Blue) highlight detail washed out$/.test(warning)))warning="";
 var ghs=SSTGHSReferenceQuality(image,source);if(ghs){score+=ghs.scoreAdjustment;if(ghs.rgbRMSE<.025&&clip<.003&&crushed<.01&&(warning=="Faint overall signal"||warning=="Bright core washed out"))warning="";}
 var narrowbandQuality=null;
 if((palette=="SHO"||palette=="HOO")&&!stellar&&image.numberOfChannels==3){
  var chroma=[],hues=[],green=0,colored=0,hueBins=[];for(var hb=0;hb<12;hb++)hueBins.push(0);var nbPoints=source.signalPoints||[];
  for(var ni=0;ni<nbPoints.length;ni++){var pt=nbPoints[ni],rgb=[];for(var nc=0;nc<3;nc++)rgb.push(image.sample(pt.x,pt.y,nc));var peak=Math.max.apply(null,rgb),low=Math.min.apply(null,rgb);if(peak>.01)chroma.push((peak-low)/peak);
   if(peak>.05&&peak-low>.08*peak){var delta=peak-low,hue=peak==rgb[0]?(rgb[1]-rgb[2])/delta:peak==rgb[1]?2+(rgb[2]-rgb[0])/delta:4+(rgb[0]-rgb[1])/delta;hue=(hue+6)%6;hueBins[Math.min(11,Math.floor(hue*2))]++;colored++;if(rgb[1]>1.15*Math.max(rgb[0],rgb[2]))green++;}}
  chroma.sort(function(a,b){return a-b;});var saturation=chroma.length?SSTPercentile(chroma,.5):0;
  var regionMedian=regional&&regional.diskOrNebula?regional.diskOrNebula.median:measuredSignal;
  var flat=separation<.008,dim=measuredSignal<.24||regionMedian<.18||signalContrast<.07;
  var penalty=flat?180:0;penalty+=70*(1-SSTClamp(measuredSignal/.35,0,1))+90*(1-SSTClamp(regionMedian/.28,0,1));
  penalty+=chroma.length>=24?65*(1-SSTClamp(saturation/.18,0,1)):0;
  var greenFraction=green/Math.max(1,colored),dominantHueFraction=0,hueEntropy=0;
  for(var hb=0;hb<12;hb++){var fraction=hueBins[hb]/Math.max(1,colored);dominantHueFraction=Math.max(dominantHueFraction,fraction);if(fraction>0)hueEntropy-=fraction*Math.log(fraction)/Math.log(12);}
  var colorPenalty=0;if(palette=="SHO"&&chroma.length>=24){colorPenalty=80*SSTClamp((saturation-.70)/.25,0,1);if(colored>=24)colorPenalty+=85*SSTClamp((greenFraction-.40)/.45,0,1)+45*SSTClamp((dominantHueFraction-.65)/.30,0,1);}
  penalty+=colorPenalty;score-=penalty;
  if(palette=="SHO"&&colored>=24&&greenFraction>.65)warning="SHO green dominance";
  else if(palette=="SHO"&&saturation>.85&&dominantHueFraction>.75)warning="SHO color separation lost";
  else if(flat)warning="Nearly flat narrowband render";else if(dim&&!warning)warning="Narrowband signal too faint";
  else if(chroma.length>=24&&saturation<.035&&!warning)warning="Narrowband color collapsed";
  narrowbandQuality={medianSaturation:saturation,greenFraction:greenFraction,dominantHueFraction:dominantHueFraction,hueEntropy:hueEntropy,colorPenalty:colorPenalty,signalMedian:measuredSignal,regionMedian:regionMedian,flat:flat,penalty:penalty};
 }
 return {version:17,narrowbandQuality:narrowbandQuality,pairedGHSReference:ghs,referencePreference:preferred,backgroundQuality:sky,noiseProminence:noiseProminence,noisePenalty:noisePenalty,palette:palette,paletteQuality:paletteQuality,regional:regional,stellarQuality:stellarQuality,structure:source.structure?source.structure.type:"extended",channelHighlights:channelQuality,objectQuality:objectQuality,visibility:{eligible:visibility>=.40,adequacy:visibility,signalMedian:measuredSignal,signalAboveBackground:signalContrast,sampleCount:signalValues.length},score:score,warning:warning,addedClipping:clip,addedBlack:crushed,signalSeparation:separation,noiseEstimate:noise,backgroundMedian:b?b.median:null,brightCore:core};
}
function SSTDetectedStructure(reference){
 var shape=reference.structure?reference.structure.type:"extended";
 if(shape=="cluster")return "Detected structure: Globular-cluster-like concentration of stars — existing stretch protection retained";
 if(shape=="starField")return "Detected structure: Dispersed star field — nebular HDR protection disabled";
 if(shape=="galaxy")return "Detected structure: Elongated galaxy-like object — conventional, core-protected and spatial hybrid candidates";
 if(shape=="extended"&&reference.structure&&reference.structure.peakCount>=100&&!SSTHDRAssessment(reference).eligible)return "Detected structure: Extended nebulosity with bright knots — no concentrated HDR core detected";
 if(SSTHDRAssessment(reference).eligible)return "Detected structure: Concentrated bright core with faint surroundings — HDR protection enabled";
 if(SSTOptional(reference,"compactSignal",false))return "Detected structure: Concentrated bright nebular structure with faint surroundings — compact-object protection enabled";
 if((reference.signalPoints||[]).length<12)return "Detected structure: No clear extended object detected — general stretch comparison";
 var bg=reference.background.statistics?reference.background.statistics.median:0;
 if(reference.luminance.p90-bg<8*Math.max(1e-7,reference.noise.sigmaEstimate||0))return "Detected structure: Predominantly faint extended signal — no concentrated HDR core detected";
 return "Detected structure: Extended signal across the field — no concentrated HDR core detected";
}

function SSTDistance(a,b){
 return Math.abs(Math.log((a.median+1e-6)/(b.median+1e-6)))+Math.abs(Math.log((a.sigma+1e-6)/(b.sigma+1e-6)))+.5*Math.abs(a.p90-b.p90);
}

// PJSR warns on reads of missing properties, even in truthiness checks.
function SSTOptional(object,key,fallback){return object&&Object.prototype.hasOwnProperty.call(object,key)?object[key]:fallback;}
// Preference observations are relative choices, not absolute good/bad labels.
function SSTPreferenceVector(q){
 if(!q||!SSTOptional(q,"visibility",null))return null;
 var v=q.visibility,c=SSTOptional(q,"brightCore",null)||{median:0,p90MinusP10:0,nearWhiteFraction:0,clippedFraction:0};
 var a=[q.backgroundMedian/.15,v.signalMedian/.25,v.signalAboveBackground/.10,
  q.signalSeparation/.35,(c.median||0), (c.p90MinusP10||0)/.25,
  c.nearWhiteFraction||0,c.clippedFraction||0];
 for(var i=0;i<a.length;i++)if(!isFinite(a[i]))return null;return a;
}
function SSTPreferenceSimilarity(a,b){var d=0;for(var i=0;i<a.length;i++)d+=Math.pow(a[i]-b[i],2);return Math.exp(-d/a.length*2);}
// Learn from an explicit playoff favorite while the final comparison is pending.
// A completed comparison remains authoritative, including a trainer-side choice.
function SSTLearningRecipe(s){
 if(SSTOptional(s,"automatic",false))return null;
 if(s.stage=="complete")return SSTOptional(s,"finalWinner",null);
 if(s.stage!="compare"||!SSTOptional(s,"userFavorite",null))return null;
 var events=s.choices||[],e=events.length?events[events.length-1]:null;
 if(!e||e.stage!="playoff"||!e.indices||e.indices.length!=1||!e.offered||e.offered[e.indices[0]]!=s.userFavorite.id)return null;
 return s.userFavorite;
}
// Negative comments qualify a forced choice; they are not endorsements.
function SSTChoiceEvidence(note){
 var text=String(note||"").toLowerCase();
 if(/^(?:ugh+|ew+w*)[.!\s]*$|least offensive|all these crap|all\s+suck|all were bad|didn['’]?t like any|none.*(?:good|great)|all.*bad|most.*flat/.test(text))return 0;
 if(/flat|not very vibrant|overstretched|weird background/.test(text))return .35;
 if(/faint|slightly more faint/.test(text))return .7;
 return 1;
}
// Built-in profile derived from Don's explicit M42 choices, 2026-10-12.
var SST_BUILTIN_PREFERENCE={"target":"Mixed bright / faint nebula","palette":"Broadband RGB","starContent":"Starless","example":{"sourceId":"3996x3004x3:3348567308","weight":1,"stats":{"luminance":{"median":0.0007079677862813695,"sigma":0.00015639052045593864,"min":2.6452539935053207e-05,"max":0.9497080027222632,"p90":0.0020655037461733447,"p99":0.027036544657170872,"count":53200},"channels":[{"median":0.0007079718343447894,"sigma":0.00013864624186826405,"min":0.00010034407023340464,"max":0.9755080938339233,"p90":0.0018154269782826304,"p99":0.02880939789116384,"count":53200},{"median":0.0007064930978231132,"sigma":0.0001618849443853833,"min":4.9745167416404e-06,"max":0.9413036108016968,"p90":0.00211873766966164,"p99":0.026536255702376384,"count":53200},{"median":0.0007067514525260776,"sigma":0.00015922144773358014,"min":2.162903365388047e-05,"max":0.9569894671440125,"p90":0.002144800568930804,"p99":0.027275814432650865,"count":53200}]},"recipe":{"id":"f4v2","family":4,"variant":2,"target":0.18947748458735014,"black":[0],"shape":[4184.164208447592],"method":"asinh","second":0,"baseline":false,"scenario":"Extended nebula with gentle peak protection","finishGamma":1.0335813910617635,"preferenceGuided":true,"preferenceSource":"3996x3004x3:3348567308","highlightShoulder":0.88,"autoHighContrast":1,"endpoints":{"version":1,"black":0.039634730499995746,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"},"duplicateUnresolved":false},"rows":[{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"importance":1.5},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"importance":1.5},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8803902806093297,2.6530000481843947,5.311914699546992,0.40675665670718486,0.6536356085717678,0.8323771361565595,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6376141825616359,2.6312809490442275,5.621781098768115,0.39907844516634955,0.6466008065521718,0.8878617823505399,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8293628119677305,2.7513303629159926,5.634281689338386,0.474229162357535,0.681499387282133,0.7299757207822801,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6884518030981224,2.5013719509840007,5.2207521728128174,0.3300175753780775,0.6192414837658404,1.0269713299560546,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9182544958492119,2.7689946792364117,5.545104954317211,0.4540393881593434,0.688078660696745,0.7568089037799837,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6000273394485315,2.4690750503540038,5.272646616712212,0.35179565018756065,0.6107049225330352,0.9882881636333467,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7615322284350793,2.714996336817741,5.645192499391733,0.4131598173924857,0.6692579813301562,0.8553305792808534,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7566089516778787,2.5623078786611555,5.27085626913607,0.39179387040734304,0.6302215139865875,0.8732908693885801,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8793627070436876,2.652943883633614,5.313315648518504,0.40673484127862136,0.6536071085751056,0.8327181761455535,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6386224933067958,2.631448611831665,5.620687789618969,0.39900787456291065,0.6466097269237041,0.8877103286695487,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8287805527498325,2.749967510128021,5.631747946195303,0.47367259913682963,0.6811139894485474,0.7311329481935505,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6890413592159748,2.5022272219657893,5.222006016090511,0.33063130052260004,0.6194563613533973,1.0253610450744626,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9169331701795258,2.7682928313732145,5.5453323231637475,0.45358165915438126,0.6876791796743869,0.7577232663583757,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6013547029246887,2.4708485134124754,5.275089229144155,0.3521259673305921,0.6111097946763039,0.9868594189357767,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7615114181637763,2.714596874761581,5.644225059658289,0.4130659354822976,0.6690913396954536,0.8553801086044315,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.756629168689251,2.5629568625450134,5.2724484033286565,0.3918664524350847,0.630421896469593,0.8730738346052171,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8758944139232239,2.6527531977653505,5.31804137352854,0.4066444178836686,0.6535099456250668,0.8338810686349873,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6421387485762436,2.63181177341938,5.616321310684085,0.3992107728242877,0.64669370316267,0.8872591014289855,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8267974625229835,2.7453225910425183,5.62311028382182,0.4717735910858429,0.6800002728581429,0.7344148640537265,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6910272425462803,2.5049969139099124,5.22595142095536,0.3326428148380348,0.6201235015034676,1.019252788610459,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.912451484883825,2.7659065181016924,5.546089067928493,0.45202493296776536,0.6867361125528813,0.7611228494977955,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6058679354836544,2.4767295022726055,5.283021852456032,0.3532483236483168,0.6124899299442768,0.9833468289089207,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7614407558540504,2.713238687491417,5.640935584947467,0.4127466407452312,0.6685864703536033,0.8554784774351116,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7566978971262772,2.565163289761543,5.277861378714441,0.39211320021663404,0.6311030002951621,0.872196476073265,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.980244006305933,2.5280531563639634,4.849766881451009,0.3464900174830643,0.6224383056282997,0.845499108567239,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7282905598133803,2.499213354897499,5.155597547523676,0.34669973096762396,0.6142233064234257,0.904821834464073,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9425902092705171,2.629087474751472,5.158833372972904,0.4058362685799598,0.6505327951669693,0.7526058248853693,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7656518122752508,2.3836039042711255,4.810532042264938,0.28352112711327476,0.5899771453261375,1.042545444419385,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.028182546089093,2.6479405520677566,5.077577561035752,0.38627795432891177,0.6566460477143525,0.7815971307659164,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6801365498801073,2.353836666202545,4.864386840686201,0.30431172114866134,0.5830264077007771,1.007949652752876,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8583455930550895,2.577998154830933,5.157476997494698,0.3553765553644727,0.6360770095467567,0.8606201036214829,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8499103917429844,2.447914370775223,4.84492033932358,0.33475562944752846,0.6001343852609395,0.8862952026176458,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9792260686059794,2.527850731420517,4.8507877256423235,0.34647284532061645,0.6224064529418945,0.8458057260990146,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7293301594058673,2.4995051909685135,5.154767738312482,0.3464797558716369,0.614285724979639,0.9046648237180714,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9418547870218752,2.627588178300858,5.156188265219332,0.4053331964203291,0.6501111288428305,0.7534134353065496,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7663392141461373,2.3850353477716446,4.813079548209905,0.2837626718589244,0.5901679437935352,1.0409565901017195,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.0267224554916223,2.6468221455574037,5.076971680656076,0.3859354970651016,0.6562490122556686,0.7825588380622879,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6815107235809168,2.355389279580116,4.866207113578915,0.3047082429008825,0.583311549592018,1.0066703757834434,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8583110384444397,2.5775867082595827,5.156500212982298,0.3553097692574774,0.6359029010772705,0.8605641841316225,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8499425523430109,2.4484098918914796,4.846110901214183,0.33482232233541354,0.6002908720105886,0.8861841910171515,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9757691933512688,2.526957195973396,4.853739199906586,0.34610826110626985,0.6222981848061084,0.8468923729276665,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.732809967547655,2.500496796774864,5.152027040615677,0.34582760240350524,0.6144979218482971,0.9039233361434937,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9393199862887462,2.6219065733909606,5.1457864540442815,0.40363535919189464,0.6491026434242726,0.7566386957407008,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7688802192608516,2.3899099880456918,4.821454641222951,0.28552304304667947,0.5913480512857436,1.036190541172028,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.0217614650626978,2.645204461479187,5.0803689561039205,0.38475646525025403,0.6550277028024196,0.7854101605415358,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6864509210636218,2.35939399971962,4.868808617703617,0.30596988702586714,0.5843365283429622,1.0029464715838432,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8581900224039951,2.576187727594376,5.153184285379947,0.35508583748596056,0.6353181699216366,0.8603658134603505,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.850051762993137,2.4500944893598557,4.850158578909934,0.3350595625434605,0.6008594600647688,0.8857238853740697,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8450167716493211,2.164109123849869,4.142747652150691,0.24766644032001503,0.5294626443147659,1.0495835607600223,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6132940457041064,2.0824371099472043,4.286151706311851,0.23196823286839904,0.5114116945385934,1.1624790650892265,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7969711072891951,2.3118209282398223,4.584095659665763,0.2837285287993296,0.5700384584546089,0.9569934210157398,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6615362159013748,1.9229293023586271,3.815018932044506,0.19518010069940783,0.4716594537198543,1.2428917278790474,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8815984161396822,2.321790754914284,4.482079263076186,0.2741193970118253,0.5715539670109748,0.9958649786329268,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5766083209315935,1.9125085468411445,3.916358885705471,0.20430597865836977,0.46880488521456715,1.1980208461236963,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7313976862529913,2.1965889667749403,4.394375887557864,0.2452275818424564,0.5376568047404289,1.127438045759201,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7265952517936627,2.0556626179695128,4.049263667233288,0.2350271145701408,0.5034637279182672,1.0931854597139363,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.844042298540473,2.1638795547246934,4.143635439001024,0.24758097943408167,0.5294085963010787,1.0501358156466496,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6142004980991284,2.0826969852924346,4.285441716082394,0.2320653152951172,0.511484718248248,1.1619845637750625,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7963949465453625,2.3107392380475997,4.582255675300956,0.28333322363751284,0.5696377854645253,0.9576027066946038,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6621129994541407,1.9244622324585914,3.817986081965268,0.19555929465889943,0.47196788511276244,1.2415158611631396,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8803330677052339,2.3200083095788955,4.479521172389387,0.27381879983501795,0.5710714405179024,0.9962858537387846,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5778246174057324,1.9140716107606885,3.9184421007931225,0.20456982924682768,0.46927604316174976,1.1970819131970418,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7313754733055831,2.1959991038322446,4.392934549622237,0.2451962331005506,0.5375176852196455,1.1273124995660784,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7266179143637418,2.056303462052345,4.05083178358525,0.23505661013296678,0.5036173341214656,1.0934221590352067,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8407442458818356,2.163098599076271,4.1466301288679235,0.24732003190474855,0.5292247879564762,1.0518990709996228,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6173140070537727,2.0832898841381073,4.282253699764609,0.23237734426174853,0.5116785080403089,1.160305624008179,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7945322436342638,2.3070611127138134,4.575854416333138,0.2819805625200274,0.5680275223910809,0.9606001393675814,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6640393657237291,1.9292817335367203,3.827145285256207,0.19682850173690497,0.4734644574224949,1.2369518558073047,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8760490927249193,2.3139454976320266,4.4707901049926875,0.27290964588608074,0.5696448327183723,0.9974578721952443,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.58202751254042,1.9193810381174088,3.925411326482892,0.20567188614606874,0.4708587865322828,1.1945619445300122,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7312734735111396,2.1939941799402236,4.388075239583849,0.24508561297314505,0.5370446113944053,1.12677227739811,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7266950738032659,2.0584819673299792,4.056162307620049,0.23515680685979976,0.5041394177109002,1.094254558935166,0,0],"importance":0.125}],"absoluteRatings":[{"vector":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"value":-1},{"vector":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"value":-1},{"vector":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"value":1},{"vector":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"value":-1},{"vector":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"value":-1},{"vector":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"value":-1},{"vector":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"value":-1},{"vector":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"value":-1},{"vector":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"value":-1},{"vector":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"value":-1},{"vector":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"value":-1},{"vector":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"value":-1},{"vector":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"value":-1},{"vector":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"value":-1},{"vector":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"value":-1},{"vector":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"value":-1},{"vector":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"value":-1},{"vector":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"value":-1},{"vector":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"value":-1},{"vector":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"value":-1},{"vector":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"value":-1},{"vector":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"value":-1},{"vector":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"value":-1},{"vector":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"value":-1},{"vector":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"value":-1},{"vector":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"value":-1},{"vector":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"value":-1},{"vector":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"value":-1},{"vector":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"value":-1},{"vector":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"value":-1},{"vector":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"value":-1},{"vector":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"value":-1},{"vector":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"value":-1},{"vector":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"value":-1},{"vector":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"value":0.6},{"vector":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"value":-1},{"vector":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"value":-1},{"vector":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"value":-1},{"vector":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"value":-1},{"vector":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"value":-1},{"vector":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"value":-1},{"vector":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"value":-1},{"vector":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"value":-1},{"vector":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"value":-1},{"vector":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"value":-1},{"vector":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"value":-1},{"vector":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"value":-1},{"vector":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"value":-1},{"vector":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"value":-1},{"vector":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"value":-1},{"vector":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"value":-1},{"vector":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"value":0.8},{"vector":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"value":-1},{"vector":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"value":-1},{"vector":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"value":-1},{"vector":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"value":-1},{"vector":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"value":-1},{"vector":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"value":-1},{"vector":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"value":-1},{"vector":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"value":-1},{"vector":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"value":-1},{"vector":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"value":-1},{"vector":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"value":-1},{"vector":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"value":-1},{"vector":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"value":-0.5},{"vector":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"value":-1},{"vector":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"value":-1},{"vector":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"value":-1},{"vector":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"value":-1},{"vector":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1}]},"feedback":{"accepted":["f4v2","f4v5","f6v2"],"best":"f4v2","nearMiss":"f3v2","nearMissReason":"Red highlight detail washed out","origin":"Explicit user assessment of 0.5.34 initial grids and shortlist, 2026-10-12","completedSession":"SST-1791858315254-856952822","finalComparison":"same","retainedParentRefinements":9}};
var SST_BUILTIN_SHO_PREFERENCE={"target":"Emission nebula","palette":"SHO","starContent":"Starless","example":{"sourceId":"6233x4029x3:4209263392","weight":1,"stats":{"channels":[{"median":0.0016584860859438777,"sigma":4.134240048006177e-06,"min":0.0016410939861088991,"max":0.0017478804802522063,"p90":0.0016659205895848573,"p99":0.001674854791490361,"count":58200},{"median":0.0016553794266656041,"sigma":1.7396511108381676e-05,"min":0.0016008452512323856,"max":0.0019169432343915105,"p90":0.001689940714277327,"p99":0.0017166588187683372,"count":58200},{"median":0.0016564306570217013,"sigma":4.462117940420285e-06,"min":0.0016396548599004745,"max":0.001719861407764256,"p90":0.0016730912029743195,"p99":0.001691952069522813,"count":58200}],"luminance":{"median":0.0016562764329486526,"sigma":1.3501925322707827e-05,"min":0.0016123175854096188,"max":0.00186338194492273,"p90":0.0016829801918449812,"p99":0.0017037946623468304,"count":58200}},"recipe":{"id":"r0s2v3","family":7,"variant":5,"target":0.19479620060615924,"black":[0],"shape":[5.005482927071783e-05],"method":"mtf","second":0.2340425531914894,"baseline":false,"scenario":"Lift midtones","finishGamma":1.5,"shoRedLift":0.16,"luminanceGamut":true,"sourcePedestal":[0.0016469102138094605,0.0016066691955621355,0.0016439367267885245],"sourceGain":[1.0793078990592804,0.25649498986440034,1],"shoGamutShoulder":true,"autoHighContrast":1,"recipeBlend":{"version":1,"amount":0.5,"weights":[0.5,0.5],"recipes":[{"id":"f0v4","family":0,"variant":4,"target":0.15979620060615923,"black":[0.0016469102138094605,0.0016066691955621355,0.0016439367267885245],"shape":[2.7054507085001764e-05,0.00011383270431778906,2.9200020432734252e-05],"method":"mtf","second":0,"baseline":false,"scenario":"Restrained background","finishGamma":1.5231706358107882,"compactProtected":true,"shoRedLift":0.08,"autoHighContrast":0.5,"endpoints":{"version":1,"black":0,"white":0.870747281195712,"method":"linked sampled bounds with highlight margin and conservative background anchor"}},{"id":"f7v5","family":7,"variant":5,"target":0.19479620060615924,"black":[0],"shape":[5.005482927071783e-05],"method":"mtf","second":0.2340425531914894,"baseline":false,"scenario":"SHO channel-balanced signal with soft highlights","finishGamma":1.5,"shoRedLift":0.16,"luminanceGamut":true,"sourcePedestal":[0.0016469102138094605,0.0016066691955621355,0.0016439367267885245],"sourceGain":[1.0793078990592804,0.25649498986440034,1],"shoGamutShoulder":true,"autoHighContrast":1,"endpoints":{"version":1,"black":0,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"}}]},"duplicateUnresolved":false,"rootId":"f7v5","parentId":"r0s1v2","finishRefinements":[{"mode":0,"strength":-0.24},{"mode":0,"strength":-0.14},{"mode":1,"strength":0.08}]},"rows":[{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.9123997124930224,1.1315825801968575,1.4603568817526102,0.33053934223226156,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.8407600262363751,1.1723641170859336,1.6697702533602712,0.37911816157783784,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.5151474360426265,1.312433319401741,1.0083621444404127,0.23443928534473685,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.5723525229046743,0.8677057001948356,1.3107354661300776,0.2998629823178054,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.8063379459828139,1.3635779758810997,2.1994380207285285,0.500675346495424,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.6171803834637004,1.1084638653814793,0.34538908825814785,0.08048984171066952,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.9138419102430342,1.362682380324602,0.5359430854469538,0.12347917051570742,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.5483867202152808,0.8566816411554814,1.3191240225657823,0.29529588699596265,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.2886209297279516,1.4399524292230605,1.6669496784657238,0.38049329134225846,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.9737567538619039,1.6562441601037978,1.1799752694666388,0.27097844542946126,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.537978343506654,1.6200614332735537,1.743186067923903,0.40630726383413585,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.578696866095066,2.006401116764545,2.6479574927687635,0.6123355533787184,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.853993298649788,1.2547346487820148,0.3558466739803551,0.0828755632247242,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.5689866468111673,1.1578987348198888,0.5412668668329712,0.1250916102903231,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[0.5558526522467533,0.8463169958114624,1.2820135111585258,0.2877477333741528,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.4432863451838494,1.735813353908062,2.174603866994381,0.5004536794168609,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.267843457788229,1.4401279834508895,1.6985547719448806,0.3883362854259355,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.3641995281378427,1.6314492243051528,2.0323237685561177,0.4640911792976516,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.492025177896023,1.821479133915901,2.315660067945718,0.5345526307719094,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.4933218358655769,1.0453343712866308,0.3733531744182117,0.08535560716816351,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.3367985099554063,1.045789960503578,0.6092771363258359,0.1398370099501949,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[0.5560599342286586,0.865995981490612,1.3309000523835417,0.29819685914260996,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.454872665355603,1.8613803895950316,2.4711419759541746,0.5727668530549324,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[2.281726038654645,1.5751782816648483,0.5153566461801534,0.12081227925547557,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.5624934016962844,1.6805654241800307,1.8576734579056502,0.42355833007948734,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[2.6193206602334973,1.7511791518330573,0.44896688923239725,0.10329917982986991,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.6099469319482644,1.259215267020464,0.7331177696287633,0.16770237346036096,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[0.5574065954585871,0.8481147366225719,1.284176948368549,0.28826639130200654,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.501467422525088,1.7250468758225441,2.0604160557687283,0.47398000218868264,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.1848890192210675,1.6340557243943215,2.3078057821542024,0.5339991395047734,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.9138289300402005,1.3626902915239334,0.5359823337495329,0.12348823572014041,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.9931906329989433,1.78346836925745,1.4688849736452103,0.34473303661687027,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[2.7704447878400487,1.8552308813214302,0.4824100215435029,0.11018529298986708,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[2.3906755305727323,1.8146662378311156,0.9506522987186905,0.2207234341434071,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[0.5554063450743755,0.8265148005515336,1.2331774837672709,0.2787660489427192,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.4403844810426234,1.631067795109749,1.9170927662104376,0.437624727523327,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.6561351514160636,1.9609481785535812,2.4181677192598574,0.5680283452885492,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.5806850094596545,1.165165518090129,0.541886281035841,0.1252324958273341,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.6232325555781524,1.6077424678862093,1.5845073363482947,0.3673821378954818,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.5625368996759257,2.061277295851707,2.8093878901153793,0.6538036375624795,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[2.106882246275743,1.4890334818422795,0.5622603351920841,0.12841751410279958,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.6330734108487766,1.4220867881298065,1.1056068540513513,0.2543622697285243,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.5179801047941048,0.9300435327231884,0.04813867461681387,0.010806416272265577,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[0.9425304666062195,1.2127101325809955,1.6179796315431594,0.3670139589156423,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[0.87041002989312,1.3501963824748993,2.069875911347568,0.4751423191394126,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.3903400211582582,1.0743309650331736,0.600317380845547,0.13946697591883814,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.300862121562163,1.423291418594122,1.6069353641420603,0.371040076403107,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.0524277202586334,1.821495560443401,2.9750973207205527,0.6929887798786165,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[2.179634063541889,1.8030850900053979,1.238261629700661,0.28356117143971604,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[2.077956131776174,1.2655994708657263,0.04706447950005521,0.010610150441101427,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.5929386322398984,1.7334232348799703,1.9441501388400784,0.44664565904821696,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.3993725832402708,1.6402387614309788,2.001538028717041,0.4591517330706118,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.9261538240512215,1.4136229781389236,0.6448267092704768,0.14810106932946615,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.8894238273600736,1.8571172439336778,1.8086573687940843,0.4252394733258655,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.3416114602684974,1.774697797000408,2.424327302098274,0.5563319697311945,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[2.320011643052101,1.5401929260134697,0.370464850455523,0.08686117233378549,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.3588406043152013,0.830306585305929,0.03750555679202072,0.008477419492176619,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.2908371648192405,1.4713031634211537,1.7420021613240235,0.39671799040862477,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.4400022556583087,1.6623982383966442,1.9959922125041476,0.46200816940580086,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.414009977499644,1.1425734422445297,0.7354186393618584,0.16799824346942557,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.224179709980885,1.4181587677538394,1.7091273544132708,0.3952880902051925,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.3956814642250537,1.8518799486041067,2.536177675172686,0.586758963789259,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.9570572397609551,1.320121690762043,0.364718367263675,0.08486349277368625,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[2.2817268399596213,1.575177335882187,0.5153530797660355,0.12081140672564511,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.9477841320087512,1.5826973118543626,2.5350670816227794,0.5869011926054957,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.9227456693152586,1.6964305912852287,2.856957974240184,0.6711450268157888,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.740449937671423,1.395606927394867,2.378342411980033,0.5486688575233732,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.9985141780177753,1.7057208494484426,2.7665308565944433,0.643555147601877,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.6648125258684159,1.3881027785956859,2.4730381576865907,0.5781282265952655,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.8365014395018419,1.5923691004276275,2.726170591816306,0.634210340663365,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.827173062602679,1.4990416850328445,2.506844618678093,0.5817484690725804,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7782887485424677,1.5302437297344207,2.65817620152235,0.6213221572160721,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7558056575854619,1.5939712585568429,2.851219660013914,0.6715689422939504,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.6732618016799291,1.4224372888207435,2.546200519531965,0.5942582601189613,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.8007057876487572,1.6005810872793198,2.800394036725163,0.6556413338550501,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.6289696952501933,1.4178232748508452,2.601103644251823,0.6114674540894374,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7167798477162918,1.536889383292198,2.7670536866560567,0.6494637441047599,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7129596210767825,1.4828500432312488,2.6376856764629486,0.6190269877186845,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6858709778736035,1.5008710435152053,2.7233711419776077,0.6404853474617004,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6151178888082504,1.473508716571331,2.7610949582159514,0.6528845213856018,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6312093437910081,1.4377483999371528,2.6475569841563695,0.6229135490425993,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6962705725431442,1.5402599169194697,2.8062439334839584,0.6605384863606523,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6045644719998042,1.4331588584303856,2.6760504380762575,0.632464076912403,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6513849225789308,1.5032546683251855,2.7810592869445676,0.6560162719973497,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6498569493691125,1.4727558817744253,2.707104280382394,0.6386343584460873,0,0.0,0,0],"importance":0.125}]},"origin":"Completed Elephant SHO session; user and automatic final recipe matched"};
function SSTBuildPreferenceModel(dataset,target,stats,labels){
 var model={version:1,examples:[],confidence:0},seen={},sessions=dataset.sessions||[];
 for(var i=sessions.length-1;i>=0&&model.examples.length<12;i--){var s=sessions[i];
  var learningRecipe=SSTLearningRecipe(s);
  if(!learningRecipe||s.target!=target||!s.stats||s.stats.channels.length!=stats.channels.length)continue;
  var key=s.fingerprint||s.id;if(seen[key])continue;seen[key]=true;
  var known=SSTOptional(s,"dataLabels",{}),mismatch=false;
  if((SSTOptional(labels,"palette","Broadband RGB")=="SHO")!=(SSTOptional(s,"palette","Broadband RGB")=="SHO"))continue;
  for(var k in labels)if(labels[k]!="Unspecified"&&SSTOptional(known,k,"Unspecified")!="Unspecified"&&known[k]!=labels[k])mismatch=true;
  if(mismatch)continue;
  var a=stats.luminance,b=s.stats.luminance,d=SSTDistance(a,b);
  // Tail/median ratio helps distinguish compact bright cores from uniform faint signal.
  d+=.5*Math.abs(Math.log((a.p99+1e-8)/(a.median+1e-8))-Math.log((b.p99+1e-8)/(b.median+1e-8)));
  var weight=Math.exp(-d)*(s.stage=="compare"?.75:1);if(weight<.1)continue;
  var rows=[],events=s.choices||[],ratings=SSTOptional(s,"qualityRatings",{});
  for(var j=0;j<events.length;j++){var e=events[j],q=SSTOptional(ratings,(e.offered||[]).join("|"),null);
   if(!q||!e.indices||!e.indices.length||q.length!=e.offered.length)continue;
   // Pairwise evidence preserves alternatives hidden by an average feature vector.
   var evidence=SSTChoiceEvidence(SSTOptional(e,"note","")),alternatives=q.length-e.indices.length;
   if(alternatives<=0||evidence<=0)continue;
   var importance=(e.stage=="compare"?4:e.stage=="playoff"?3:1)*evidence/(alternatives*e.indices.length);
   for(var t=0;t<e.indices.length;t++){var selected=SSTPreferenceVector(q[e.indices[t]]);if(!selected)continue;
    for(var r=0;r<q.length;r++)if(e.indices.indexOf(r)<0){var vector=SSTPreferenceVector(q[r]);if(vector)rows.push({selected:selected,alternative:vector,importance:importance});}
   }
  }
  model.examples.push({sourceId:key,weight:weight,stats:SSTCopy(s.stats),recipe:SSTCopy(learningRecipe),rows:rows});
 }
 // Loaded evidence for the same source supersedes the built-in example.
 var builtins=[SST_BUILTIN_PREFERENCE,SST_BUILTIN_SHO_PREFERENCE];
 for(var bi=0;bi<builtins.length;bi++){var builtin=builtins[bi],prior=builtin.example;
 var duplicate=model.examples.some(function(e){return e.sourceId==prior.sourceId;});
 var star=SSTOptional(labels,"starContent","Unspecified");
 if(!duplicate&&model.examples.length<12&&target==builtin.target&&SSTOptional(labels,"palette","Broadband RGB")==builtin.palette&&
    (star=="Unspecified"||star==builtin.starContent)&&stats.channels.length==prior.stats.channels.length){
  var a=stats.luminance,b=prior.stats.luminance,d=SSTDistance(a,b);
  d+=.5*Math.abs(Math.log((a.p99+1e-8)/(a.median+1e-8))-Math.log((b.p99+1e-8)/(b.median+1e-8)));
  var w=prior.weight*Math.exp(-d);
  if(w>=.1){var example=SSTCopy(prior);example.weight=w;model.examples.push(example);}
 }
 }
 var evidence=0;for(i=0;i<model.examples.length;i++)evidence+=model.examples[i].weight;
 model.confidence=evidence/(evidence+4);return model;
}
// Strong local evidence can correct a heuristic recommendation. Transfer fades
// rapidly with both source mismatch and rendered-feature distance.
function SSTPreferenceLocalSimilarity(a,b){
 var d=0;for(var i=0;i<a.length;i++)d+=Math.pow(a[i]-b[i],2);
 return Math.exp(-d/.002);
}
function SSTPreferenceAdjustment(model,q){
 var vector=SSTPreferenceVector(q),sum=0,weight=0,localSum=0,localWeight=0;
 if(!vector||!model||!model.examples.length)return 0;
 for(var i=0;i<model.examples.length;i++){var e=model.examples[i],value=0,total=0,positive=0,negative=0,localEvidence=0;
  for(var j=0;j<e.rows.length;j++){var importance=e.rows[j].importance;
   value+=importance*(SSTPreferenceSimilarity(vector,e.rows[j].selected)-SSTPreferenceSimilarity(vector,e.rows[j].alternative));total+=importance;
   var p=SSTPreferenceLocalSimilarity(vector,e.rows[j].selected),n=SSTPreferenceLocalSimilarity(vector,e.rows[j].alternative);
   positive+=importance*p;negative+=importance*n;localEvidence+=importance*(p+n);
  }
  if(total){sum+=e.weight*value/total;weight+=e.weight;}
  if(e.weight>=.5&&localEvidence>.01){
   var relevance=SSTClamp((e.weight-.5)/.25,0,1),support=SSTClamp(localEvidence/.15,0,1);
   var vote=(positive-negative)/localEvidence;
   // Explicit acceptable/unacceptable assessments supersede forced-choice votes.
   var anchors=SSTOptional(e,"absoluteRatings",null);
   if(anchors&&anchors.length){var nearest=0,rating=0;
    for(var k=0;k<anchors.length;k++){var match=SSTPreferenceLocalSimilarity(vector,anchors[k].vector);
     if(match>nearest){nearest=match;rating=anchors[k].value;}}
    vote=rating;support=nearest;
   }
   localSum+=e.weight*relevance*support*vote;
   localWeight+=e.weight;
  }
 }
 var general=weight?12*model.confidence*SSTClamp(sum/weight,-1,1):0;
 // Do not override the major damage checks for newly clipped or washed-out cores.
 var object=SSTOptional(q,"objectQuality",null),core=SSTOptional(q,"brightCore",null);
 var damaged=(object&&object.washedOut)||(core&&core.clippedFraction>.01)||SSTOptional(q,"addedClipping",0)>.01;
 var local=localWeight?80*SSTClamp(localSum/Math.max(1,localWeight),-1,1):0;
 return general+(damaged?Math.min(0,local):local);
}
// Only classify acceptance when explicit ratings closely match this source/render.
function SSTKnownAcceptance(model,q){
 var vector=SSTPreferenceVector(q),match=0,value=0;
 if(!model||!vector)return "unknown";
 for(var i=0;i<model.examples.length;i++){var e=model.examples[i],anchors=SSTOptional(e,"absoluteRatings",null);
  if(e.weight<.5||!anchors)continue;
  for(var j=0;j<anchors.length;j++){var similarity=SSTPreferenceLocalSimilarity(vector,anchors[j].vector)*SSTClamp((e.weight-.5)/.25,0,1);
   if(similarity>match){match=similarity;value=anchors[j].value;}}}
 if(match<.5)return "unknown";
 return value>0?"accepted":value>-.75?"nearMiss":"rejected";
}
function SSTQualityOrder(a,b){
 function category(q){var acceptance=SSTOptional(q,"learnedAcceptance","unknown");return acceptance=="rejected"?3:q.warning||acceptance=="nearMiss"?2:0;}
 return category(a)-category(b)||b.score-a.score;
}
function SSTApplyPreferences(model,qualities){
 for(var i=0;i<qualities.length;i++){var q=qualities[i];q.heuristicScore=q.score;
  q.preferenceAdjustment=SSTPreferenceAdjustment(model,q);q.score+=q.preferenceAdjustment;q.preferenceVersion=3;q.learnedAcceptance=SSTKnownAcceptance(model,q);}
}
function SSTPersonalizeCandidates(candidates,stats,model,groupIndex){
 if(!model||!model.examples.length)return candidates;
 // Only one candidate per grid is biased; other families remain exploratory.
 var templates=model.examples.slice().sort(function(a,b){return b.weight-a.weight;});
 for(var group=0;group<Math.ceil(candidates.length/9);group++){var e=templates[(groupIndex===undefined?group:groupIndex)%templates.length],prior=e.recipe;
  if(SSTOptional(prior,"recipeBlend",null)||SSTOptional(prior,"quick",false)||[3,4].indexOf(prior.family)<0||SSTOptional(prior,"selectiveMidtone",null)!==null||SSTOptional(prior,"hdrShape",null)!==null)continue;
  for(var i=group*9;i<Math.min(candidates.length,group*9+9);i++){var p=candidates[i];if(p.family!=prior.family||p.quick||SSTOptional(p,"hdr",null))continue;
   var mix=Math.min(.35,model.confidence),old=e.stats.luminance.median,now=stats.luminance.median;
   if(old<=0||now<=0)break;
   var shape=prior.method=="mtf"?prior.shape[0]*now/old:prior.shape[0]*old/now;
   p.shape[0]=Math.exp((1-mix)*Math.log(p.shape[0])+mix*Math.log(SSTClamp(shape,1e-8,prior.method=="mtf"?1-1e-8:1e8)));
   p.black[0]=SSTClamp((1-mix)*p.black[0]+mix*prior.black[0]*now/old,0,now*.8);
   p.finishGamma=Math.exp((1-mix)*Math.log(p.finishGamma||1)+mix*Math.log(prior.finishGamma||1));
   p.preferenceGuided=true;p.preferenceSource=e.sourceId;break;
  }
 }return candidates;
}

function SSTLegacyGrid(session){if(session.stage=="final"||session.stage=="complete")return session.winners.slice();return session.candidates.slice(session.round*9,session.round*9+9);}


function SSTCopy(p){return JSON.parse(JSON.stringify(p));}
function SSTShuffle(a,seed){var state=seed>>>0;for(var i=a.length-1;i>0;i--){state=(1664525*state+1013904223)>>>0;var j=state%(i+1),p=a[i];a[i]=a[j];a[j]=p;}return a;}
function SSTRefineGrid(session,parent){
 var state=(session.seed+7919*(session.branch+1)+104729*(session.refineStep+1))>>>0;
 function random(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
 if(session.refineAlgorithm>=4)return SSTFinishedRefine(session,parent);
 if(session.refineAlgorithm==3)return SSTScenarioRefine(session,parent);
 var enhanced=session.refineAlgorithm==2,key=session.branch+":"+session.refineStep;
 var widen=enhanced&&session.refineWidths?session.refineWidths[key]||0:0;
 var amount=(enhanced?[.30,.18,.10]:[.12,.07,.035])[session.refineStep]*Math.pow(1.7,widen),grid=[SSTCopy(parent)];
 for(var i=1;i<9;i++){var p=SSTCopy(parent);p.id="r"+session.branch+"s"+session.refineStep+"v"+i;p.rootId=parent.rootId||parent.id;p.parentId=parent.id;p.baseline=false;
  var shared=(random()*2-1)*amount;
  if(enhanced){var direction=i%2?1:-1,magnitude=(Math.floor((i-1)/2)+1)/4;shared=direction*magnitude*amount;}
  for(var c=0;c<p.shape.length;c++){
   var delta=shared+(random()*2-1)*amount*.2,u=p.shape[c];
   if(p.method=="mtf"){var odds=(1-u)/Math.max(1e-12,u)*Math.exp(delta);p.shape[c]=SSTClamp(1/(1+odds),1e-8,1-1e-8);}
   else p.shape[c]=SSTClamp(u*Math.exp(delta),1e-8,1e12);
   var stats=p.family<3?session.stats.channels[c]:session.stats.luminance;
   // Never move a zero black point upward: preserve the chosen no-clipping intent.
   if(p.black[c]>0)p.black[c]=SSTClamp(p.black[c]+(random()*2-1)*stats.sigma*amount,0,Math.max(0,stats.median-1e-12));
  }
  if(p.second>0){var odds=(1-p.second)/p.second*Math.exp((random()*2-1)*amount);p.second=SSTClamp(1/(1+odds),1e-8,1-1e-8);}
  if(p.quick)p.contrast=SSTClamp(p.contrast+(random()*2-1)*amount,0,1.5);
  if(enhanced)p.finishGamma=SSTClamp((parent.finishGamma||1)*Math.exp(-shared*.55),.35,2.8);
  grid.push(p);
 }return SSTShuffle(grid,state);
}
// Version 4 refines the finished parent, retaining its calibrated pipeline.
function SSTFinishedRefine(s,parent){
 var width=s.refineAlgorithm==5?(s.refineWidths[s.branch+":"+s.refineStep]||0):0;
 var amount=[.24,.14,.08][s.refineStep]*Math.pow(1.7,width),g=[SSTCopy(parent)];
 var names=["Lift faint signal","Restrain faint signal","Lift midtones","Restrain midtones","Lift overall brightness","Restrain overall brightness","Lift highlights","Restrain highlights"];
 for(var i=1;i<9;i++){var p=SSTCopy(parent);p.id="r"+s.branch+"s"+s.refineStep+"v"+i;p.rootId=parent.rootId||parent.id;p.parentId=parent.id;p.baseline=false;p.scenario=names[i-1];
  p.finishRefinements=SSTOptional(p,"finishRefinements",[]).slice();
  p.finishRefinements.push({mode:Math.floor((i-1)/2),strength:(i%2?1:-1)*amount});g.push(p);
 }return g;
}
function SSTRefineFinished(v,p){
 var steps=SSTOptional(p,"finishRefinements",[]);
 for(var i=0;i<steps.length;i++){var peak=Math.max.apply(null,v);if(peak<=0)continue;
  var h=steps[i],weight=h.mode==0?(1-peak)*(1-peak):h.mode==1?4*peak*(1-peak):h.mode==3?peak*peak:1;
  var mapped=peak+h.strength*peak*(1-peak)*weight,gain=mapped/peak;
  for(var c=0;c<v.length;c++)v[c]=SSTClamp(v[c]*gain,0,1);
 }return v;
}
function SSTScenarioRefine(s,parent){
 var key=s.branch+":"+s.refineStep,w=s.refineWidths[key]||0,amount=[.32,.20,.12][s.refineStep]*Math.pow(1.7,w),g=[SSTCopy(parent)];
 var names=["Brighter faint signal","Darker background","Stronger midtones","Gentler midtones","Preserve shadows","Tighter black point","Highlight restraint","Highlight lift"];
 for(var i=1;i<9;i++){var p=SSTCopy(parent);p.id="r"+s.branch+"s"+s.refineStep+"v"+i;p.rootId=parent.rootId||parent.id;p.parentId=parent.id;p.baseline=false;p.scenario=names[i-1];
  var sign=i%2?1:-1;
  var h=SSTOptional(p,"hdr",null);
  var lift=SSTOptional(p,"objectLift",null);
  if(lift&&i<=2){var u=lift.midtone;lift.midtone=SSTClamp(1/(1+(1-u)/u*Math.exp(sign*amount)),1e-8,1-1e-8);}
  else if(h){
   if(i<=2)h.backgroundOutput=SSTClamp(h.backgroundOutput*Math.exp(sign*amount),.005,.16);
   else if(i<=4)h.kneeOutput=SSTClamp(h.kneeOutput+sign*amount*.18,.25,.70);
   else if(i<=6){if(h.version==2){h.coreContrast=SSTClamp(h.coreContrast+sign*amount*.5,0,.9);h.saturation=SSTClamp(h.saturation+sign*amount*.15,0,.35);}
    else h.lowShape=SSTClamp(h.lowShape*Math.exp(sign*amount),.1,40);}
   else h.ceiling=SSTClamp(h.ceiling+sign*amount*.10,Math.max(.75,h.kneeOutput+.05),.98);
  }
  else if(p.selectiveMidtone!==undefined&&i>=3&&i<=4){var u=p.selectiveMidtone;p.selectiveMidtone=SSTClamp(1/(1+(1-u)/u*Math.exp(sign*amount)),1e-8,1-1e-8);p.selectiveKnee=SSTClamp(SSTMTF(.60,1-p.selectiveMidtone),1e-7,.9);}
  else if(p.selectiveMidtone!==undefined&&i>=5&&i<=6)p.selectiveCeiling=SSTClamp(p.selectiveCeiling+sign*amount*.08,.72,.98);
  else if(p.hdrShape!==undefined&&i>=3&&i<=4)p.hdrShape=SSTClamp(p.hdrShape*Math.exp(sign*amount),0,1e12);
  else if(p.hdrShape!==undefined&&i>=5&&i<=6)p.finishGamma=SSTClamp((p.finishGamma||1)*Math.exp(sign*amount*.35),.35,2.8);
  else if(i<=2||i>=7)p.finishGamma=SSTClamp((p.finishGamma||1)*Math.exp(-sign*amount*(i>=7?-.6:1)),.35,2.8);
  else if(i<=4){for(var c=0;c<p.shape.length;c++){var u=p.shape[c];p.shape[c]=p.method=="mtf"?SSTClamp(1/(1+(1-u)/Math.max(1e-12,u)*Math.exp(sign*amount)),1e-8,1-1e-8):SSTClamp(u*Math.exp(sign*amount),1e-8,1e12);}}
  else{for(var c=0;c<p.black.length;c++){var t=p.family<3?s.stats.channels[c]:s.stats.luminance;p.black[c]=SSTClamp(p.black[c]-sign*t.sigma*amount,0,Math.max(0,t.median-1e-12));}}
  SSTProtectCompactRecipe(p,s.stats);g.push(p);
 }return g;
}
function SSTFinalistBlendGrid(originals){
 var g=originals.map(SSTCopy);if(originals.length<2)return g;
 function blend(id,recipes,weights,label){var p=SSTCopy(recipes[0]);p.id=id;p.rootId=id;p.baseline=false;p.quick=false;
  p.recipeBlend={version:1,amount:.5,recipes:recipes.map(SSTCopy),weights:weights};p.scenario=label;
  delete p.pendingPreparation;delete p.finishRefinements;delete p.spatialHybrid;delete p.hdr;delete p.objectLift;delete p.objectTarget;delete p.endpoints;return p;}
 if(originals.length==2){g.push(blend("blendAB",originals,[.5,.5],"50% A + 50% B"));return g;}
 var A=originals[0],B=originals[1],C=originals[2];
 g.push(blend("blendAB",[A,B],[.5,.5],"50% A + 50% B"),blend("blendAC",[A,C],[.5,.5],"50% A + 50% C"),blend("blendBC",[B,C],[.5,.5],"50% B + 50% C"));
 g.push(blend("blendABC_A",[A,B,C],[.5,.25,.25],"50% A + 25% B + 25% C"),blend("blendABC_B",[A,B,C],[.25,.5,.25],"25% A + 50% B + 25% C"),blend("blendABC_C",[A,B,C],[.25,.25,.5],"25% A + 25% B + 50% C"));return g;
}
function SSTGridKey(s){return s.stage+":"+SSTOptional(s,"round",0)+":"+(s.branch||0)+":"+(s.refineStep||0);}

function SSTGrid(s){if(s.flow!==2)return SSTLegacyGrid(s);
 var key=SSTGridKey(s);if(s.replacementGrids&&s.replacementGrids[key])return s.replacementGrids[key];
 if(s.stage=="round")return s.candidates.slice(s.round*9,s.round*9+9);
 if(s.stage=="shortlist")return s.winners.slice();
 if(s.stage=="blend")return SSTFinalistBlendGrid(s.blendSources);
 if(s.stage=="refine")return s.refineGrid;
 if(s.stage=="playoff")return s.refinedWinners.slice();
 if(s.stage=="compare")return [s.userFavorite,s.autoPath.finalWinner];
 return [s.finalWinner];
}


// Image math may differ by a few last bits across JavaScript runtimes.


function SSTPreviewSamples(image){var ctx=SST_ANALYSIS_CONTEXT;if(ctx&&ctx.source===image&&ctx.previewSamples)return ctx.previewSamples;var a=[];for(var y=0;y<20;y++)for(var x=0;x<30;x++)for(var c=0;c<image.numberOfChannels;c++)a.push(image.sample(Math.min(image.width-1,Math.floor((x+.5)*image.width/30)),Math.min(image.height-1,Math.floor((y+.5)*image.height/20)),c));if(ctx&&ctx.source===image)ctx.previewSamples=a;return a;}


function SmartStretchBusyDialog( parent )
{
   this.__base__ = Dialog;
   this.__base__();

   this.windowTitle = "Smart Stretch — Updating Image";
   this.userResizable = false;
   this.minWidth = 340;

   this.message_Label = new Label( this );
   this.message_Label.useRichText = true;
   this.message_Label.wordWrapping = true;
   this.message_Label.text =
      "<b>Updating image…</b><br/>Applying Smart Stretch to the full-resolution image. Please wait…";

   this.note_Label = new Label( this );
   this.note_Label.wordWrapping = true;
   this.note_Label.text = "Controls are locked until the update finishes.";

   // Paint our own progress bar: avoids relying on undocumented progress
   // widgets/constants on this version of PixInsight/PJSR.
   this.progressValue = 0;
   this.progress_Bar = new Control( this );
   this.progress_Bar.setMinSize( 320, 22 );
   var busy = this;
   this.progress_Bar.onPaint = function()
   {
      var g = new Graphics( this );
      try
      {
         var w=this.width, h=this.height;
         g.fillRect( 0, 0, w, h, new Brush( 0xff303030 ) );
         var fill=Math.round( w*Math.max( 0, Math.min( 100,
            busy.progressValue ) )/100 );
         if(fill>0)
            g.fillRect( 0, 0, fill, h, new Brush( 0xff3885c8 ) );
         g.pen=new Pen( 0xffaaaaaa, 1 );
         g.drawLine( 0, 0, w-1, 0 );
         g.drawLine( 0, h-1, w-1, h-1 );
         g.drawLine( 0, 0, 0, h-1 );
         g.drawLine( w-1, 0, w-1, h-1 );
      }
      finally { g.end(); }
   };
   this.progress_Label = new Label( this );
   this.progress_Label.text = "0%";

   this.setProgress = function( value, stage )
   {
      this.progressValue=Math.max( 0, Math.min( 100, value ) );
      this.progress_Label.text = Math.round( this.progressValue ) + "%";
      if(stage!=null && stage.length>0)
         this.note_Label.text=stage;
      this.progress_Bar.update();
      this.progress_Label.update();
   };

   this._stBody = new VerticalSizer;
   this._stBody.margin = 12;
   this._stBody.spacing = 8;
   this._stBody.add( this.message_Label );
   this._stBody.add( this.note_Label );
   this._stBody.add( this.progress_Bar );
   this._stBody.add( this.progress_Label );
   STScreenFit.adjust(this);

   this.onClose = function()
   {
   };
}
SmartStretchBusyDialog.prototype = new Dialog;
function SQSModel(working){var self=this;
 this.sourceWorkingImage=working;this.basicStretchFaintParameters=null;this.quickAnalysisRecipe=null;
 this.nativeQuickFaintWorkspace={};this.quickNebulosityGuide=null;
 this.quickNebulosityEnabled=false;this.quickNebulosityStrength=.35;
 this.quickAnalysisSource=null;this.shadowLiftEnabled=false;
 this.autoHighContrastEnabled=true;this.autoContrastCache=null;
 this.autoColorBrightnessEnabled=false;this.autoBrightnessStrength=.35;this.autoVibranceStrength=.25;
 this.autoColorBrightness_Button={text:""};this.autoHighContrast_Button={text:""};
 this.logApplyStage=function(name,t){console.writeln("[Smart Quick Stretch] "+name+": "+SmartTools.elapsed(t));};
   this.analyzeQuickFaintParameters=function(src){var C=src.numberOfChannels,n=C<3?1:3,result=[];
      var step=Math.max(1,Math.ceil(Math.sqrt(src.width*src.height/60000)));
      for(var c=0;c<n;c++){var values=[];
         for(var y=0;y<src.height;y+=step)for(var x=0;x<src.width;x+=step){var v=src.sample(x,y,c);if(isFinite(v))values.push(Math.max(0,Math.min(1,v)));}
         values.sort(function(a,b){return a-b;});var median=percentileFromSortedArray(values,.5),deviations=[];
         for(var i=0;i<values.length;i++)deviations.push(Math.abs(values[i]-median));deviations.sort(function(a,b){return a-b;});
         var sigma=1.3257*percentileFromSortedArray(deviations,.5),black=0,m=.5;
         if(values.length>0&&values[values.length-1]-values[0]>1e-12&&median<.5){
            black=Math.max(0,Math.min(median-1e-12,median-2.8*sigma));
            var normalized=Math.max(1e-12,Math.min(1-1e-12,(median-black)/(1-black))),target=.25;
            m=Math.max(1e-8,Math.min(1-1e-8,(1-target)*normalized/(target+(1-2*target)*normalized)));
         }result.push({black:black,midtones:m});
         console.writeln("[Smart Stretch Quick] STF-style channel="+c+" | median="+median+" | robust sigma="+sigma+" | black="+black+" | midtones="+m+" | white=1 | samples="+values.length);
      }return result;
   };

   this.quickFaintValue=function(v,p){var x=Math.max(0,Math.min(1,(v-p.black)/Math.max(1e-12,1-p.black)));
      if(x<=0)return 0;if(x>=1)return 1;return (1-p.midtones)*x/(p.midtones+(1-2*p.midtones)*x);
   };

   this.quickFaintPass=function(src,parameters){var out=new Image(src),C=src.numberOfChannels,params=parameters||self.basicStretchFaintParameters;
      if(params==null||params.length!=(C<3?1:3)){out.free();throw new Error("Missing STF-style Quick parameters; select Quick Stretch again");}
      try{for(var y=0;y<src.height;y++){for(var x=0;x<src.width;x++)for(var c=0;c<(C<3?1:3);c++)
         out.setSample(self.quickFaintValue(src.sample(x,y,c),params[c]),x,y,c);
         if(self.fullResolutionProgress&&y%32==0)self.fullResolutionProgress((y+1)/src.height);}
         return out;}catch(e){out.free();throw e;}
   };

   this.processNativeQuickFaint=function(src,borrowOutput){var pool=borrowOutput?self.nativeQuickFaintWorkspace:{},complete=false,t=SmartTools.now();
      var params=self.basicStretchFaintParameters,C=src.numberOfChannels;
      if(params==null||params.length!=(C<3?1:3))throw new Error("Missing STF-style Quick parameters");
      try{var w=SmartTools.acquireWindow(pool,"QuickSTF",src.width,src.height,C,src.bitsPerSample==64?64:32,C==3);
         SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);w.mainView.image.resetSelections();}finally{w.mainView.endProcess();}
         self.logApplyStage("Native Quick STF: source copy",t);t=SmartTools.now();
         var p=new HistogramTransformation;p.H=[[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1]];
         var rows=p.H;for(var c=0;c<params.length;c++)rows[C==1?3:c]=[params[c].black,params[c].midtones,1,0,1];p.H=rows;
         if(!p.executeOn(w.mainView,false))throw new Error("STF-style HistogramTransformation failed");
         self.logApplyStage("Native Quick STF: HistogramTransformation",t);t=SmartTools.now();var count=0,sum=0,maxError=0;
         for(var y=0;y<16;y++)for(var x=0;x<24;x++)for(var c=0;c<C;c++){
            var xx=Math.min(src.width-1,Math.floor((x+.5)*src.width/24)),yy=Math.min(src.height-1,Math.floor((y+.5)*src.height/16));
            var expected=self.quickFaintValue(src.sample(xx,yy,c),params[c]),actual=w.mainView.image.sample(xx,yy,c);
            if(!isFinite(actual))throw new Error("Nonfinite native STF-style result");var error=Math.abs(expected-actual);sum+=error;maxError=Math.max(maxError,error);count++;
         }console.writeln("[Smart Stretch Apply] Native Quick STF validation: samples="+count+" | mean error="+(sum/Math.max(1,count))+" | max error="+maxError);
         if(maxError>2e-7)throw new Error("Native STF-style numerical validation failed");self.logApplyStage("Native Quick STF: validation",t);
         var result=borrowOutput?w.mainView.image:new Image(w.mainView.image);complete=true;return result;
      }finally{if(!borrowOutput||!complete)SmartTools.closeWindowPool(pool);}
   };

   this.quickLinearLimits=function(src){var C=src.numberOfChannels,n=C<3?1:3,lo=Infinity,hi=-Infinity;
      try{src.resetSelections();for(var c=0;c<n;c++){src.selectedChannel=c;lo=Math.min(lo,src.minimum());hi=Math.max(hi,src.maximum());}}
      finally{src.resetSelections();}
      if(!isFinite(lo)||!isFinite(hi))throw new Error("Quick linear pass requires finite extrema");

      return {black:lo,white:hi,range:hi-lo};
   };

   this.quickLinearPass=function(src){var limits=self.quickLinearLimits(src),out=new Image(src),C=src.numberOfChannels;
      try{if(limits.range>1e-12)for(var y=0;y<src.height;y++){for(var x=0;x<src.width;x++)for(var c=0;c<(C<3?1:3);c++)
         out.setSample(Math.max(0,Math.min(1,(src.sample(x,y,c)-limits.black)/limits.range)),x,y,c);
         if(self.fullResolutionProgress&&y%32==0)self.fullResolutionProgress((y+1)/src.height);}
         return out;}catch(e){out.free();throw e;}
   };

   this.processNativeQuickLinear=function(src,borrowOutput){var t=SmartTools.now(),limits=self.quickLinearLimits(src),pool=borrowOutput?self.nativeQuickFaintWorkspace:{},complete=false;
      try{var w=SmartTools.acquireWindow(pool,"QuickLinear",src.width,src.height,src.numberOfChannels,src.bitsPerSample==64?64:32,src.numberOfChannels==3);
         SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);w.mainView.image.resetSelections();}finally{w.mainView.endProcess();}
         self.logApplyStage("Native Quick linear: extrema / source copy",t);t=SmartTools.now();
         if(limits.range>1e-12){var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;
            p.expression="($T-("+limits.black+"))/("+limits.range+")";
            if(!p.executeOn(w.mainView,false))throw new Error("Quick linear native pass failed");}
         self.logApplyStage("Native Quick linear: linked black / white transform",t);t=SmartTools.now();
         var maxError=0,count=0;for(var y=0;y<16;y++)for(var x=0;x<24;x++)for(var c=0;c<src.numberOfChannels;c++){
            var xx=Math.min(src.width-1,Math.floor((x+.5)*src.width/24)),yy=Math.min(src.height-1,Math.floor((y+.5)*src.height/16));
            var original=src.sample(xx,yy,c),expected=limits.range>1e-12?Math.max(0,Math.min(1,(original-limits.black)/limits.range)):original;
            var actual=w.mainView.image.sample(xx,yy,c);if(!isFinite(actual))throw new Error("Nonfinite native Quick linear result");
            maxError=Math.max(maxError,Math.abs(actual-expected));count++;
         }if(maxError>2e-7)throw new Error("Quick linear validation failed");
         console.writeln("[Smart Stretch Apply] Quick linear black="+limits.black+" | white="+limits.white+" | samples="+count+" | max error="+maxError);
         self.logApplyStage("Native Quick linear: validation",t);var result=borrowOutput?w.mainView.image:new Image(w.mainView.image);complete=true;return result;
      }finally{if(!borrowOutput||!complete)SmartTools.closeWindowPool(pool);}
   };

   this.quickAggressiveParameters=function(base,value){if(value==50)return base.map(function(p){return {black:p.black,midtones:p.midtones};});var factor=Math.pow(16,(Math.max(0,Math.min(100,value))-50)/50);
      return base.map(function(p){var gain=(1-p.midtones)/Math.max(1e-12,p.midtones)*factor;
         return {black:p.black,midtones:Math.max(1e-8,Math.min(1-1e-8,1/(1+gain)))};});
   };

   this.clearQuickNebulosityGuide=function(){
      if(self.quickNebulosityGuide){self.quickNebulosityGuide.free();self.quickNebulosityGuide=null;}
   };

   this.getQuickNebulosityGuide=function(){
      if(self.quickNebulosityGuide)return self.quickNebulosityGuide;
      if(!self.sourceWorkingImage)throw new Error("Faint Nebulosity needs the original working source");
      var proxy=new Image(self.sourceWorkingImage),mask=null;
      try{
         if(proxy.width>640||proxy.height>380)proxy.resample(Math.min(640/proxy.width,380/proxy.height));
         var detected=SmartMaskEngine.generate(proxy,{mode:"nebula",algorithm:"adaptive",sensitivity:.65,wisps:.70,suppressStars:true});
         mask=detected.mask;
         if(mask.width!=proxy.width||mask.height!=proxy.height)throw new Error("Faint Nebulosity guide geometry mismatch");
         self.quickNebulosityGuide=mask;mask=null;
         console.writeln("[Quick Nebulosity] Original-source guide: "+proxy.width+"x"+proxy.height+"; adaptive connected wisps; star suppression");
         return self.quickNebulosityGuide;
      }finally{if(mask)mask.free();proxy.free();}
   };

   this.quickNebulosityPixelGain=function(r,g,b,mask,strength){
      var y=.2126*r+.7152*g+.0722*b,bright=Math.max(r,g,b);
      if(strength<=0||mask<=0||y<=1e-8||bright>=.85)return 1;
      var weight=Math.max(0,Math.min(1,mask))*smoothStep01((y-.01)/.04)*
         (1-smoothStep01((y-.25)/.30))*(1-smoothStep01((bright-.55)/.30));
      var q=1+3*Math.max(0,Math.min(1,strength));
      var ratio=q/(1+(q-1)*y);
      return Math.max(1,Math.min(2,1/Math.max(1e-8,bright),1+weight*(ratio-1)));
   };

   this.quickNebulosityPass=function(src,strength,borrowOutput,forceJS){
      if(strength<=0)return borrowOutput?src:new Image(src);
      var map=self.getQuickNebulosityGuide(),C=src.numberOfChannels,W=src.width,H=src.height;
      if(C!=1&&C!=3)throw new Error("Faint Nebulosity supports grayscale or RGB images");
      var pool=borrowOutput?self.nativeQuickFaintWorkspace:{},out=null,nativeUsed=false,t=SmartTools.now();
      function gainAt(x,y){
         var r=src.sample(x,y,0),g=C==3?src.sample(x,y,1):r,b=C==3?src.sample(x,y,2):r;
         return self.quickNebulosityPixelGain(r,g,b,self.autoContrastMapGain(map,x,y,W,H),strength);
      }
      try{
         if(!forceJS&&W*H>1000000&&typeof PixelMath!="undefined")try{
            var work=SmartTools.acquireWindow(pool,"QuickNebulosity",W,H,C,src.bitsPerSample==64?64:32,C==3);
            var guide=SmartTools.acquireWindow(pool,"QuickNebulosityGuide",map.width,map.height,1,64,false);
            SmartTools.beginPrivateProcess(work.mainView);try{work.mainView.image.assign(src);work.mainView.image.resetSelections();}finally{work.mainView.endProcess();}
            SmartTools.beginPrivateProcess(guide.mainView);try{guide.mainView.image.assign(map);}finally{guide.mainView.endProcess();}
            var q=1+3*Math.max(0,Math.min(1,strength));
            var expression="nfX=min("+(map.width-1)+",max(0,(x()+0.5)*"+(map.width/W)+"-0.5));"+
               "nfY=min("+(map.height-1)+",max(0,(y()+0.5)*"+(map.height/H)+"-0.5));"+
               "nfI=floor(nfX);nfJ=floor(nfY);nfF=nfX-nfI;nfV=nfY-nfJ;"+
               "nfW=(1-nfV)*((1-nfF)*pixel("+guide.mainView.id+",nfI,nfJ)+nfF*pixel("+guide.mainView.id+",min(nfI+1,"+(map.width-1)+"),nfJ))+"+
               "nfV*((1-nfF)*pixel("+guide.mainView.id+",nfI,min(nfJ+1,"+(map.height-1)+"))+nfF*pixel("+guide.mainView.id+",min(nfI+1,"+(map.width-1)+"),min(nfJ+1,"+(map.height-1)+")));"+
               "nfL="+(C==3?"0.2126*$T[0]+0.7152*$T[1]+0.0722*$T[2]":"$T")+";"+
               "nfB="+(C==3?"max(max($T[0],$T[1]),$T[2])":"$T")+";"+
               "nfS=min(1,max(0,(nfL-0.01)/0.04));nfT=min(1,max(0,(nfL-0.25)/0.30));nfH=min(1,max(0,(nfB-0.55)/0.30));"+
               "nfW=min(1,max(0,nfW))*nfS*nfS*(3-2*nfS)*(1-nfT*nfT*(3-2*nfT))*(1-nfH*nfH*(3-2*nfH));"+
               "nfG=max(1,min(2,min(1/max(1e-8,nfB),1+nfW*("+q+"/(1+("+(q-1)+")*nfL)-1))));"+
               "$T*iif(nfL<=1e-8||nfB>=0.85,1,nfG)";
            var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;
            p.symbols="nfX,nfY,nfI,nfJ,nfF,nfV,nfW,nfL,nfB,nfS,nfT,nfH,nfG";p.expression=expression;
            if(!p.executeOn(work.mainView,false))throw new Error("Native Faint Nebulosity failed");
            var maxError=0;
            for(var yy=0;yy<16;yy++)for(var xx=0;xx<24;xx++){
               var x=Math.min(W-1,Math.floor((xx+.5)*W/24)),y=Math.min(H-1,Math.floor((yy+.5)*H/16)),gain=gainAt(x,y);
               for(var c=0;c<C;c++){var actual=work.mainView.image.sample(x,y,c);if(!isFinite(actual))throw new Error("Nonfinite Faint Nebulosity output");maxError=Math.max(maxError,Math.abs(actual-src.sample(x,y,c)*gain));}
            }
            if(maxError>2e-7)throw new Error("Faint Nebulosity native validation failed: "+maxError);
            out=borrowOutput?work.mainView.image:new Image(work.mainView.image);nativeUsed=true;
            console.writeln("[Quick Nebulosity] Native validation: "+(384*C)+" channel comparisons; max error="+maxError);
         }catch(e){console.warningln("[Quick Nebulosity] Native rejected; exact JavaScript fallback: "+e);}
         if(!out){out=new Image(src);
            for(var y=0;y<H;y++)for(var x=0;x<W;x++){
               var gain=gainAt(x,y);if(gain==1)continue;
               for(var c=0;c<C;c++)out.setSample(src.sample(x,y,c)*gain,x,y,c);
            }
            // A borrowed return must remain owned by its persistent window pool.
            if(borrowOutput){var js=SmartTools.acquireWindow(pool,"QuickNebulosityJS",W,H,C,src.bitsPerSample==64?64:32,C==3);
               SmartTools.beginPrivateProcess(js.mainView);try{js.mainView.image.assign(out);}finally{js.mainView.endProcess();}
               out.free();out=js.mainView.image;
            }
         }
         console.writeln("[Quick Nebulosity] "+(nativeUsed?"native":"JS")+"; strength="+strength+"; total="+SmartTools.elapsed(t));
         return out;
      }catch(e){if(out&&!borrowOutput)out.free();throw e;}
      finally{if(!borrowOutput)SmartTools.closeWindowPool(pool);}
   };

   this.analyzeAutoColorBrightness=function(src,brightness,vibrance){
      var values=[],C=src.numberOfChannels,step=Math.max(1,Math.ceil(Math.sqrt(src.width*src.height/60000)));
      for(var y=0;y<src.height;y+=step)for(var x=0;x<src.width;x+=step){
         var v=C==1?src.sample(x,y,0):.2126*src.sample(x,y,0)+.7152*src.sample(x,y,1)+.0722*src.sample(x,y,2);
         if(isFinite(v))values.push(Math.max(0,Math.min(1,v)));
      }
      values.sort(function(a,b){return a-b;});
      var median=percentileFromSortedArray(values,.5),target=Math.max(median,Math.min(.45,median+.10)),gain=1;
      if(median>1e-8&&median<.45)gain=Math.max(1,Math.min(2.5,target*(1-median)/(median*Math.max(1e-8,1-target))));
      return {median:median,target:target,gain:gain,brightness:Math.max(0,Math.min(1,brightness)),vibrance:Math.max(0,Math.min(1,vibrance)),samples:values.length};
   };

   this.autoColorBrightnessPixel=function(r,g,b,p){
      var y=.2126*r+.7152*g+.0722*b,maximum=Math.max(r,g,b);
      if(y<=1e-8||maximum>=.90)return [r,g,b];
      var protection=smoothStep01((y-.01)/.04)*(1-smoothStep01((maximum-.65)/.25));
      var ratio=p.gain/(1+(p.gain-1)*y);
      var lift=Math.max(1,Math.min(1/Math.max(1e-8,maximum),1+p.brightness*protection*(ratio-1)));
      r*=lift;g*=lift;b*=lift;y*=lift;maximum*=lift;
      var minimum=Math.min(r,g,b),saturation=maximum>1e-8?(maximum-minimum)/maximum:0;
      var colorProtection=smoothStep01((y-.01)/.04)*(1-smoothStep01((maximum-.65)/.25));
      var factor=1+p.vibrance*colorProtection*(1-saturation)*(1-saturation),limit=Infinity;
      var channels=[r,g,b];
      for(var c=0;c<3;c++){var d=channels[c]-y;
         if(d>1e-12)limit=Math.min(limit,(1-y)/d);
         else if(d< -1e-12)limit=Math.min(limit,y/(-d));
      }
      factor=Math.max(1,Math.min(factor,limit));
      return [y+(r-y)*factor,y+(g-y)*factor,y+(b-y)*factor];
   };

   this.applyAutoColorBrightness=function(src,brightness,vibrance,forceJS){
      if(brightness<=0&&vibrance<=0)return src;
      var C=src.numberOfChannels,W=src.width,H=src.height;
      if(C!=1&&C!=3)throw new Error("Auto Color & Brightness supports grayscale or RGB images");
      var p0=self.analyzeAutoColorBrightness(src,brightness,vibrance),out=null,pool={},t=SmartTools.now(),nativeUsed=false;
      function expectedAt(x,y){var r=src.sample(x,y,0),g=C==3?src.sample(x,y,1):r,b=C==3?src.sample(x,y,2):r;return self.autoColorBrightnessPixel(r,g,b,p0);}
      try{
         if(!forceJS&&W*H>1000000&&typeof PixelMath!="undefined")try{
            var work=SmartTools.acquireWindow(pool,"AutoColorBrightness",W,H,C,src.bitsPerSample==64?64:32,C==3);
            SmartTools.beginPrivateProcess(work.mainView);try{work.mainView.image.assign(src);work.mainView.image.resetSelections();}finally{work.mainView.endProcess();}
            var num=function(v){return Number(v).toPrecision(17);};
            var common="vbR="+(C==3?"$T[0]":"$T")+";vbG="+(C==3?"$T[1]":"$T")+";vbB="+(C==3?"$T[2]":"$T")+";"+
               "vbY=0.2126*vbR+0.7152*vbG+0.0722*vbB;vbM=max(max(vbR,vbG),vbB);"+
               "vbS=min(1,max(0,(vbY-0.01)/0.04));vbH=min(1,max(0,(vbM-0.65)/0.25));"+
               "vbP=vbS*vbS*(3-2*vbS)*(1-vbH*vbH*(3-2*vbH));"+
               "vbL=iif(vbY<=1e-8||vbM>=0.90,1,max(1,min(1/max(1e-8,vbM),1+"+num(p0.brightness)+"*vbP*("+num(p0.gain)+"/(1+("+num(p0.gain-1)+")*vbY)-1))));"+
               "vbR=vbR*vbL;vbG=vbG*vbL;vbB=vbB*vbL;vbY=vbY*vbL;vbM=vbM*vbL;"+
               "vbS=min(1,max(0,(vbY-0.01)/0.04));vbH=min(1,max(0,(vbM-0.65)/0.25));"+
               "vbP=vbS*vbS*(3-2*vbS)*(1-vbH*vbH*(3-2*vbH));"+
               "vbA=(vbM-min(min(vbR,vbG),vbB))/max(1e-8,vbM);"+
               "vbF=iif(vbY<=1e-8||vbM>=0.90,1,1+"+num(p0.vibrance)+"*vbP*(1-vbA)*(1-vbA));";
            var names=["vbR","vbG","vbB"];
            for(var c=0;c<3;c++)common+="vbD="+names[c]+"-vbY;vbF=max(1,min(vbF,iif(vbD>1e-12,(1-vbY)/max(1e-12,vbD),iif(vbD< -1e-12,vbY/max(1e-12,-vbD),1e12))));";
            common+="vbR=vbY+(vbR-vbY)*vbF;vbG=vbY+(vbG-vbY)*vbF;vbB=vbY+(vbB-vbY)*vbF;";
            var p=SmartTools.configurePixelMath(new PixelMath,64);
            p.symbols="vbR,vbG,vbB,vbY,vbM,vbS,vbH,vbP,vbL,vbA,vbF,vbD";p.useSingleExpression=C==1;
            p.expression=common+"vbR";if(C==3){p.expression1=common+"vbG";p.expression2=common+"vbB";}
            if(!p.executeOn(work.mainView,false))throw new Error("Native Auto Color & Brightness failed");
            var maxError=0;
            for(var yy=0;yy<16;yy++)for(var xx=0;xx<24;xx++){
               var x=Math.min(W-1,Math.floor((xx+.5)*W/24)),y=Math.min(H-1,Math.floor((yy+.5)*H/16)),expected=expectedAt(x,y);
               for(var c=0;c<C;c++){var actual=work.mainView.image.sample(x,y,c);if(!isFinite(actual))throw new Error("Nonfinite Auto Color & Brightness output");maxError=Math.max(maxError,Math.abs(actual-expected[c]));}
            }
            if(maxError>2e-7)throw new Error("Auto Color & Brightness native validation failed: "+maxError);
            out=new Image(work.mainView.image);nativeUsed=true;
            console.writeln("[Auto Color & Brightness] Native validation: "+(384*C)+" comparisons; max error="+maxError);
         }catch(e){console.warningln("[Auto Color & Brightness] Native rejected; exact JavaScript fallback: "+e);}
         if(!out){out=new Image(src);for(var y=0;y<H;y++)for(var x=0;x<W;x++){
            var pixel=expectedAt(x,y);for(var c=0;c<C;c++)out.setSample(pixel[c],x,y,c);
         }}
         console.writeln("[Auto Color & Brightness] "+(nativeUsed?"native":"JS")+"; median="+p0.median+"; target="+p0.target+"; gain="+p0.gain+"; brightness="+p0.brightness+"; vibrance="+p0.vibrance+"; total="+SmartTools.elapsed(t));
         return out;
      }catch(e){if(out)out.free();throw e;}finally{SmartTools.closeWindowPool(pool);}
   };

   this.autoContrastGainMap=function(src){var proxy=new Image(src),mean=null,second=null,map=null;
      var signal=function(im,x,y){return im.numberOfChannels<3?im.sample(x,y,0):.2126*im.sample(x,y,0)+.7152*im.sample(x,y,1)+.0722*im.sample(x,y,2);};
      try{if(proxy.width>640||proxy.height>380)proxy.resample(Math.min(640/proxy.width,380/proxy.height));
         var W=proxy.width,H=proxy.height;mean=SmartTools.boxSignalMean(proxy,12,signal);
         second=SmartTools.boxSignalMean(proxy,12,function(im,x,y){var v=signal(im,x,y);return v*v;});
         var deviations=[];for(var y=0;y<H;y+=4)for(var x=0;x<W;x+=4)deviations.push(Math.abs(signal(proxy,x,y)-.25*(signal(proxy,Math.max(0,x-1),y)+signal(proxy,Math.min(W-1,x+1),y)+signal(proxy,x,Math.max(0,y-1))+signal(proxy,x,Math.min(H-1,y+1)))));
         deviations.sort(function(a,b){return a-b;});var noise=Math.max(.0005,1.3257*percentileFromSortedArray(deviations,.5));
         map=new Image(mean);
         for(var y=0;y<H;y++)for(var x=0;x<W;x++){
            var v=signal(proxy,x,y),m=mean.sample(x,y,0),detail=v-m,sd=Math.sqrt(Math.max(0,second.sample(x,y,0)-m*m));
            var lowContrast=1-smoothStep01((sd/(m+.02)-.08)/.22);
            var confidence=smoothStep01((Math.abs(detail)/noise-1)/2);
            var bright=proxy.numberOfChannels<3?v:Math.max(proxy.sample(x,y,0),proxy.sample(x,y,1),proxy.sample(x,y,2));
            var weight=lowContrast*confidence*(1-smoothStep01((bright-.55)/.30))*smoothStep01((m-.005)/.04);
            var target=v+Math.max(-.08,Math.min(.08,.75*weight*detail));
            var gain=v>1e-8?Math.max(0,Math.min(1/Math.max(1e-8,bright),target/v)):1;
            if(weight<=0||bright>=.85)gain=1;map.setSample(gain,x,y,0);
         }return map;
      }catch(e){if(map)map.free();throw e;}finally{proxy.free();if(mean)mean.free();if(second)second.free();}
   };

   this.autoContrastMapGain=function(map,x,y,W,H){var px=Math.max(0,Math.min(map.width-1,(x+.5)*map.width/W-.5)),py=Math.max(0,Math.min(map.height-1,(y+.5)*map.height/H-.5));
      var ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(ix+1,map.width-1),jy=Math.min(iy+1,map.height-1),fx=px-ix,fy=py-iy;
      return (1-fy)*((1-fx)*map.sample(ix,iy,0)+fx*map.sample(jx,iy,0))+fy*((1-fx)*map.sample(ix,jy,0)+fx*map.sample(jx,jy,0));
   };

   this.applyAutoHighContrast=function(src,enabledOverride,forceJS){if(!(enabledOverride===undefined?self.autoHighContrastEnabled:enabledOverride))return src;
      var t=SmartTools.now(),map,pool={},out=null,C=src.numberOfChannels,cached=false;
      if(src.width*src.height<=1000000){var planes=[];for(var c=0;c<(C<3?1:3);c++)planes.push(SmartTools.readPlane(src,c));var cache=self.autoContrastCache,hit=!!(cache&&cache.W==src.width&&cache.H==src.height&&cache.C==C);
         if(hit)for(var c=0;c<planes.length&&hit;c++)for(var i=0;i<planes[c].length;i++)if(planes[c][i]!==cache.planes[c][i]){hit=false;break;}
         if(!hit){if(cache)cache.map.free();cache=self.autoContrastCache={W:src.width,H:src.height,C:C,planes:planes,map:self.autoContrastGainMap(src)};}
         map=cache.map;cached=true;console.writeln("[Smart Stretch Perf] Auto Contrast gain cache: "+(hit?"HIT":"MISS"));
      }else map=self.autoContrastGainMap(src);
      try{if(!forceJS&&src.width*src.height>1000000&&(C==1||C==3)&&typeof PixelMath!="undefined"){
            var w=SmartTools.acquireWindow(pool,"AutoContrast",src.width,src.height,C,src.bitsPerSample==64?64:32,C==3),g=SmartTools.acquireWindow(pool,"AutoContrastGain",map.width,map.height,1,64,false);
            SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);}finally{w.mainView.endProcess();}
            SmartTools.beginPrivateProcess(g.mainView);try{g.mainView.image.assign(map);}finally{g.mainView.endProcess();}
            var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;p.symbols="acX,acY,acI,acJ,acF,acV,acM";
            p.expression="acX=min("+(map.width-1)+",max(0,(x()+0.5)*"+(map.width/src.width)+"-0.5));acY=min("+(map.height-1)+",max(0,(y()+0.5)*"+(map.height/src.height)+"-0.5));acI=floor(acX);acJ=floor(acY);acF=acX-acI;acV=acY-acJ;acM="+(C==3?"max(max($T[0],$T[1]),$T[2])":"$T")+";"+
               "acX=(1-acV)*((1-acF)*pixel("+g.mainView.id+",acI,acJ)+acF*pixel("+g.mainView.id+",min(acI+1,"+(map.width-1)+"),acJ))+acV*((1-acF)*pixel("+g.mainView.id+",acI,min(acJ+1,"+(map.height-1)+"))+acF*pixel("+g.mainView.id+",min(acI+1,"+(map.width-1)+"),min(acJ+1,"+(map.height-1)+")));$T*iif(acM>=0.85,1,min(acX,1/max(1e-8,acM)))";
            if(!p.executeOn(w.mainView,false))throw new Error("Auto High Contrast native processing failed");out=new Image(w.mainView.image);
         }else{out=new Image(src);for(var y=0;y<src.height;y++)for(var x=0;x<src.width;x++){
            var maxv=C<3?src.sample(x,y,0):Math.max(src.sample(x,y,0),src.sample(x,y,1),src.sample(x,y,2));
            var gain=maxv>=.85?1:Math.min(self.autoContrastMapGain(map,x,y,src.width,src.height),1/Math.max(1e-8,maxv));
            for(var c=0;c<(C<3?1:3);c++)out.setSample(src.sample(x,y,c)*gain,x,y,c);
         }}
         var maxError=0;for(var y=0;y<16;y++)for(var x=0;x<24;x++){
            var xx=Math.min(src.width-1,Math.floor((x+.5)*src.width/24)),yy=Math.min(src.height-1,Math.floor((y+.5)*src.height/16));
            var maxv=C<3?src.sample(xx,yy,0):Math.max(src.sample(xx,yy,0),src.sample(xx,yy,1),src.sample(xx,yy,2));
            var gain=maxv>=.85?1:Math.min(self.autoContrastMapGain(map,xx,yy,src.width,src.height),1/Math.max(1e-8,maxv));
            for(var c=0;c<(C<3?1:3);c++){var actual=out.sample(xx,yy,c),error=Math.abs(actual-src.sample(xx,yy,c)*gain);if(!isFinite(actual))throw new Error("Nonfinite Auto Contrast result");maxError=Math.max(maxError,error);}
         }if(maxError>2e-7)throw new Error("Auto High Contrast validation failed");
         console.writeln("[Smart Stretch Auto Contrast] time="+((SmartTools.now()-t)/1000).toFixed(3)+" s | map="+map.width+"x"+map.height+" | max error="+maxError);return out;
      }catch(e){if(out)out.free();throw e;}finally{if(!cached)map.free();SmartTools.closeWindowPool(pool);}
   };

   this.analyzeQuickStartingRecipe=function(palette,parent){
      var benchmarkStart=SmartTools.now(),benchmarkOutcome="FAILED",benchmarkCount=0;
      var proxy=new Image(self.quickAnalysisSource||self.sourceWorkingImage),busy=new SmartStretchBusyDialog(parent||self),cancelled=false;
      var oldEnabled=parent?parent.enabled:true;
      busy.windowTitle="Quick Stretch — Image Analysis";
      busy.message_Label.text="<b>Building Image Analysis preview…</b>";
      busy.onClose=function(){cancelled=true;return true;};
      var cancel=STHoverAttach(new PushButton(busy),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){cancelled=true;};busy._stBody.add(cancel);
      function progress(done,total){if(cancelled)throw new Error("Quick Stretch analysis cancelled");busy.setProgress(100*done/total,"Evaluating stretch "+done+" of "+total);processEvents();if(cancelled)throw new Error("Quick Stretch analysis cancelled");}
      function rankGrid(session,reference,offset){
         SSTPrepareGrid(session,proxy);var grid=SSTGrid(session),best=null,bestQuality=null;
         for(var i=0;i<grid.length;i++){progress(offset+i,117);var image=null;
            try{image=SSTProcess(proxy,grid[i]);var scoreStart=SmartTools.now();var q=SSTQuality(image,reference);if(SST_ANALYSIS_CONTEXT)SST_ANALYSIS_CONTEXT.scoreMS+=SmartTools.now()-scoreStart;SSTApplyPreferences(preferenceModel,[q]);
               if(!isFinite(q.score))throw new Error("Invalid Image Analysis score");benchmarkCount++;
               if(!best||SSTQualityOrder(q,bestQuality)<0){best=SSTCopy(grid[i]);bestQuality=q;}
            }finally{if(image)image.free();}}
         return {recipe:best,quality:bestQuality};
      }
      try{if(parent)parent.enabled=false;STScreenFit.show(busy);processEvents();
         var scale=Math.min(1,600/proxy.width,400/proxy.height);if(scale<1)proxy.resample(scale);
         SST_ANALYSIS_CONTEXT=new SSTAnalysisContext(proxy);console.writeln("[Quick Stretch Analysis Fast] Native preview acceleration + bulk pixel access + bounded recipe cache enabled");
         var stats=SSTMeasure(proxy),reference=SSTQualitySource(proxy);reference.palette=palette;
         var target=self.quickTarget|| (reference.structure.type=="galaxy"?"Galaxy":reference.structure.type=="starField"?"Open cluster / star field":reference.structure.type=="cluster"?"Globular cluster":"Mixed bright / faint nebula");
         var preferenceModel=SSTBuildPreferenceModel({sessions:[]},target,stats,{palette:palette,starContent:"Unspecified"});
         var candidates=SSTCandidates(stats,20261012,proxy,target,preferenceModel,palette),best=null,groupResults=[];
         for(var group=0;group<9;group++){
            var session={flow:2,stage:"round",round:group,candidates:candidates,palette:palette,target:target,stats:stats,preferenceModel:preferenceModel};
            var result=rankGrid(session,reference,group*9);groupResults.push(result);
            if(!best||SSTQualityOrder(result.quality,best.quality)<0)best=result;
         }
         groupResults.sort(function(a,b){return SSTQualityOrder(a.quality,b.quality);});
         var blendSources=groupResults.slice(0,3).map(function(r){return r.recipe;});
         best=rankGrid({flow:2,stage:"blend",blendSources:blendSources},reference,81);
         for(var step=0;step<3;step++){
            var refine={flow:2,stage:"refine",refineAlgorithm:6,refineWidths:{},branch:0,refineStep:step,seed:20261012,stats:stats};
            refine.refineGrid=SSTRefineGrid(refine,best.recipe);best=rankGrid(refine,reference,90+9*step);
         }
         progress(117,117);console.writeln("[Quick Stretch Image Analysis] "+SSTDetectedStructure(reference)+" | method="+SST_FAMILIES[best.recipe.family]+" | score="+best.quality.score.toFixed(2)+" | warning="+(best.quality.warning||"none"));
         benchmarkOutcome="COMPLETED";
         return {recipe:best.recipe,quality:best.quality,description:SSTDetectedStructure(reference)};
      }catch(e){if(cancelled){benchmarkOutcome="CANCELLED";return null;}throw e;}
      finally{busy.hide();if(parent)parent.enabled=oldEnabled;
       if(SST_ANALYSIS_CONTEXT){var ctx=SST_ANALYSIS_CONTEXT;SST_ANALYSIS_CONTEXT=null;console.writeln("[Quick Stretch Analysis Fast] native="+ctx.nativeSuccess+"/"+ctx.nativeAttempts+"; recipe cache hits="+ctx.hits+"; bulk pixels="+ctx.bulkPixels+"; render ms (includes blends)="+ctx.renderMS+"; score ms="+ctx.scoreMS);ctx.free();}
       SSTSourceCacheImage=null;SSTSourceCacheValue=null;proxy.free();console.writeln("[Quick Stretch Benchmark] OPTIMIZED | Image Analysis wall time="+((SmartTools.now()-benchmarkStart)/1000).toFixed(3)+" s | status="+benchmarkOutcome+" | evaluated="+benchmarkCount+"/117 | palette="+palette);}
   };
   this.chooseQuickStartingVersion=function(){
      var d=new Dialog,bitmaps=[null,null],selected=-1,recipe=null,result=null;
      d.windowTitle="Quick Stretch — Choose starting version";
      var stf=null,linear=null,enhanced=null,nebulaImage=null,colorImage=null;
      try{
         var params=self.analyzeQuickFaintParameters(self.sourceWorkingImage);
         stf=self.quickFaintPass(self.sourceWorkingImage,params);linear=self.quickLinearPass(stf);
         if(self.quickNebulosityEnabled)nebulaImage=self.quickNebulosityPass(linear,self.quickNebulosityStrength,false,false);
         enhanced=self.applyAutoHighContrast(nebulaImage||linear,true);
         if(self.autoColorBrightnessEnabled)colorImage=self.applyAutoColorBrightness(enhanced,self.autoBrightnessStrength,self.autoVibranceStrength,false);
         bitmaps[0]=(colorImage||enhanced).render();
      }finally{if(colorImage&&colorImage!==enhanced)colorImage.free();if(enhanced&&enhanced!==(nebulaImage||linear))enhanced.free();if(nebulaImage)nebulaImage.free();if(linear)linear.free();if(stf)stf.free();}
      var row=new HorizontalSizer;row.spacing=12;var buttons=[],canvases=[];
      function select(i){selected=i;open.enabled=i==0||recipe!=null;for(var b=0;b<buttons.length;b++){buttons[b].text=(selected==b?"Selected: ":"Select ")+(b==0?"STF-Style":"Image Analysis");canvases[b].update();}}
      function addCard(i,title){
         var column=new VerticalSizer;column.spacing=6;
         var label=new Label(d);label.text=title;column.add(label);
         var canvas=new Control(d);var tileSize=STScreenFit.tileSize(d,560,340,2,1,300);canvas.setFixedSize(tileSize.width,tileSize.height);
         canvas.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(selected==i?0xff245580:0xff151515));var bitmap=bitmaps[i];if(bitmap){var scale=Math.min((this.width-8)/bitmap.width,(this.height-8)/bitmap.height);var ox=(this.width-scale*bitmap.width)/2,oy=(this.height-scale*bitmap.height)/2;g.scaleTransformation(scale);g.drawBitmap(Math.round(ox/scale),Math.round(oy/scale),bitmap);}}finally{g.end();}};
         canvas.onMousePress=function(){if(i==0||recipe)select(i);};column.add(canvas);canvases.push(canvas);
         var button=STHoverAttach(new PushButton(d),"Select this preview candidate for closer inspection or the next step.");button.text=STHoverCaption(button,"Select "+title,0);button.onClick=function(){if(i==0||recipe)select(i);};column.add(button);buttons.push(button);row.add(column);
      }
      addCard(0,"STF-Style");addCard(1,"Image Analysis");
      var notes=new Label(d);notes.wordWrapping=true;notes.text="Choose a starting image, then open it in QuickStretch for adjustments. OK in QuickStretch creates a new full-resolution image.";
      var palette=STHoverAttach(new ComboBox(d),"Choose the image channel mapping so analysis and stretch candidates can account for RGB, HOO, SHO or other palettes.");for(var pi=0;pi<SST_PALETTES.length;pi++)palette.addItem(SST_PALETTES[pi]);palette.currentItem=Math.max(0,SST_PALETTES.indexOf(self.quickPalette||"Broadband RGB"));
      palette.toolTip="Select the image's color palette before reanalyzing. Mono uses the same luminance analysis.";
      var targetChoice=new ComboBox(d);for(var ti=0;ti<SST_TARGETS.length;ti++)targetChoice.addItem(SST_TARGETS[ti]);targetChoice.currentItem=Math.max(0,SST_TARGETS.indexOf(self.quickTarget||SST_TARGETS[0]));targetChoice.toolTip="Target category used to build the Image Analysis stretch brackets.";
      var reanalyze=new PushButton(d);reanalyze.text=STHoverCaption(reanalyze,"Reanalyze",0);
      function analyze(){
         self.quickTarget=SST_TARGETS[targetChoice.currentItem];self.quickPalette=SST_PALETTES[palette.currentItem];
         var found=self.analyzeQuickStartingRecipe(self.quickPalette,d);if(!found)return false;
         var image=null;try{image=SSTProcess(self.sourceWorkingImage,found.recipe);var bitmap=image.render();recipe=found.recipe;bitmaps[1]=bitmap;}finally{if(image)image.free();}
         notes.text=found.description+(found.quality.warning?". Review: "+found.quality.warning:".")+" Choose either preview to open in QuickStretch.";canvases[1].update();if(selected==1)select(1);return true;
      }
      reanalyze.onClick=function(){try{if(!analyze())notes.text="Reanalysis cancelled; the previous preview is retained.";}catch(e){new MessageBox(String(e),"Quick Stretch",StdIcon_Error,StdButton_Ok).execute();}};
      var paletteRow=new HorizontalSizer;paletteRow.spacing=8;var paletteLabel=new Label(d);paletteLabel.text="Image Analysis palette:";paletteRow.add(paletteLabel);paletteRow.add(palette);var targetLabel=new Label(d);targetLabel.text="Target:";paletteRow.add(targetLabel);paletteRow.add(targetChoice);paletteRow.add(reanalyze);paletteRow.addStretch();
      var open=STHoverAttach(new PushButton(d),"Continue with the selected starting image and recipe.");open.text=STHoverCaption(open,"Open in QuickStretch",0);open.enabled=false;open.onClick=function(){if(selected<0)return;result={recipe:selected==1?SSTCopy(recipe):null};d.ok();};
      var cancel=STHoverAttach(new PushButton(d),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){d.cancel();};var action=new HorizontalSizer;action.spacing=8;action.addStretch();action.add(open);action.add(cancel);
      d._stBody=new VerticalSizer;d._stBody.margin=12;d._stBody.spacing=10;d._stBody.add(row);d._stBody.add(paletteRow);d._stBody.add(notes);d._stBody.add(action);d._stFooter=action;
      try{if(!analyze())return null;STScreenFit.adjust(d);STScreenFit.execute(d);return result;}
      catch(e){new MessageBox(String(e),"Quick Stretch comparison",StdIcon_Error,StdButton_Ok).execute();return null;}
      finally{bitmaps[0]=null;bitmaps[1]=null;}
   };

   this.chooseQuickStretch=function(a){var chosen=-1,bitmap=null,parameters=null,busy=false,closed=false,lastKey="",pool={},nativeUses=0;
      var nativeAvailable=typeof HistogramTransformation!="undefined"&&typeof PixelMath!="undefined";
      var timer=new Timer;timer.interval=.12;timer.periodic=false;
      var selectedStart=self.chooseQuickStartingVersion();if(!selectedStart)return -1;
      var analysisBase=selectedStart.recipe?SSTProcess(self.sourceWorkingImage,selectedStart.recipe):null;
      var src=analysisBase||self.sourceWorkingImage,base=self.analyzeQuickFaintParameters(src),d=new Dialog;
      if(analysisBase)for(var ab=0;ab<base.length;ab++)base[ab]={black:0,midtones:.5};
      d.windowTitle="Smart Quick Stretch "+SQS_VERSION+" — "+(analysisBase?"Image Analysis":"STF-Style");
      // Channel extrema are invariant under the monotonic STF curve: scan once.
      var extrema=[],C=src.numberOfChannels;
      try{src.resetSelections();for(var c=0;c<(C<3?1:3);c++){src.selectedChannel=c;extrema.push({min:src.minimum(),max:src.maximum()});}}
      finally{src.resetSelections();}
      var panel=new Control(d);STScreenFit.preview(panel,SmartTools.previewWidth,SmartTools.previewHeight,48,460,true);
      panel.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff000000));
         if(bitmap){var scale=Math.min(this.width/bitmap.width,this.height/bitmap.height);
            var x=Math.floor((this.width-scale*bitmap.width)/2),y=Math.floor((this.height-scale*bitmap.height)/2);
            g.scaleTransformation(scale);g.drawBitmap(Math.round(x/scale),Math.round(y/scale),bitmap);}
         }finally{g.end();}};
      var linear=new CheckBox(d);linear.text=STHoverCaption(linear,"Linear black / white",0);linear.checked=!analysisBase;
      linear.toolTip="Stretch the current preview's minimum to black and maximum to white. Full Apply recalculates full-resolution extrema.";
      var endpointTest=new CheckBox(d);endpointTest.text=STHoverCaption(endpointTest,"Gentle shadow lift — brighter faint detail",0);endpointTest.checked=false;
      endpointTest.toolTip="Increase faint, nonzero signal by up to 50%, fading smoothly to no change at peak brightness 0.65. Keeps RGB ratios, black and bright highlights unchanged. Optional; off by default so Image Analysis retains its finished recipe.";
      var recipeHasContrast=!!selectedStart.recipe;
      var highContrast=new CheckBox(d);highContrast.text=STHoverCaption(highContrast,recipeHasContrast?"Additional Auto High Contrast":"Auto High Contrast",0);highContrast.checked=!recipeHasContrast;
      highContrast.toolTip="Enhance eligible low-contrast structure in the preview and selected Quick Stretch workflow.";
      var nebula=new CheckBox(d);nebula.text=STHoverCaption(nebula,"Faint Nebulosity (experimental second pass)",0);nebula.checked=self.quickNebulosityEnabled;
      nebula.toolTip="Lift connected faint structure using the original reduced image; protects dark background, stars and highlights. Off by default.";
      var nebulaStrength=new NumericControl(d);nebulaStrength.label.text=STHoverCaption(nebulaStrength,"Faint Nebulosity Strength",2);
      nebulaStrength.setRange(0,1);nebulaStrength.slider.setRange(0,1000);nebulaStrength.setPrecision(2);
      nebulaStrength.setValue(self.quickNebulosityStrength);nebulaStrength.enabled=nebula.checked;
      SmartTools.configureNumericInput(nebulaStrength);
      var colorEnhance=new CheckBox(d);colorEnhance.text=STHoverCaption(colorEnhance,"Auto Color & Brightness (experimental)",0);
      colorEnhance.checked=self.autoColorBrightnessEnabled;
      colorEnhance.toolTip="Final protected midtone lift and luminance-preserving vibrance. Off by default; existing Quick passes are unchanged.";
      var brightnessStrength=new NumericControl(d);brightnessStrength.label.text=STHoverCaption(brightnessStrength,"Brightness Strength",2);
      brightnessStrength.setRange(0,1);brightnessStrength.slider.setRange(0,1000);brightnessStrength.setPrecision(2);brightnessStrength.setValue(self.autoBrightnessStrength);
      var vibranceStrength=new NumericControl(d);vibranceStrength.label.text=STHoverCaption(vibranceStrength,"Vibrance Strength",2);
      vibranceStrength.setRange(0,1);vibranceStrength.slider.setRange(0,1000);vibranceStrength.setPrecision(2);vibranceStrength.setValue(self.autoVibranceStrength);
      brightnessStrength.enabled=vibranceStrength.enabled=colorEnhance.checked;
      SmartTools.configureNumericInput(brightnessStrength);SmartTools.configureNumericInput(vibranceStrength);
      var colorRow=new HorizontalSizer;colorRow.spacing=10;colorRow.add(brightnessStrength,1);colorRow.add(vibranceStrength,1);
      var slider=STHoverAttach(new Slider(d),"Stretch aggressiveness: move left for a gentler starting stretch and right for a stronger one.");slider.setRange(0,100);slider.value=50;slider.tracking=true;
      slider.setFixedWidth(panel.width);slider.toolTip="Left: gentler stretch. Center: current STF-style stretch. Right: stronger stretch. Black points stay fixed.";
      slider.styleSheet="QSlider::handle:horizontal { image: none; border-image: none; width: 0.55em; margin: -0.45em 0; border: 1px solid palette(dark); border-radius: 2px; background: palette(button); }";
      var label=new Label(d);label.text="Stretch Aggressiveness: 50";
      function refresh(){timer.stop();if(busy||closed)return;var key=endpointTest.checked+":"+slider.value+":"+linear.checked+":"+nebula.checked+":"+nebulaStrength.value+":"+highContrast.checked+":"+colorEnhance.checked+":"+brightnessStrength.value+":"+vibranceStrength.value;if(key==lastKey)return;
         busy=true;var image=null,borrowed=false,start=SmartTools.now(),t=start,stretchTime=0,linearTime=0,renderTime=0;
         try{self.shadowLiftEnabled=endpointTest.checked;
            parameters=self.quickAggressiveParameters(base,slider.value);
            var lo=Infinity,hi=-Infinity;for(var c=0;c<extrema.length;c++){
               lo=Math.min(lo,self.quickFaintValue(extrema[c].min,parameters[c]));hi=Math.max(hi,self.quickFaintValue(extrema[c].max,parameters[c]));
            }var range=hi-lo;
            if(nativeAvailable&&(C==1||C==3))try{
               if(nativeUses>=16){SmartTools.closeWindowPool(pool);nativeUses=0;}nativeUses++;
               var w=SmartTools.acquireWindow(pool,"QuickChooser",src.width,src.height,C,64,C==3);
               SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);w.mainView.image.resetSelections();}finally{w.mainView.endProcess();}
               var h=new HistogramTransformation,rows=[[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1]];
               for(var c=0;c<parameters.length;c++)rows[C==1?3:c]=[parameters[c].black,parameters[c].midtones,1,0,1];h.H=rows;
               if(!h.executeOn(w.mainView,false))throw new Error("Chooser native STF failed");
               stretchTime=SmartTools.now()-t;t=SmartTools.now();
               if(linear.checked&&range>1e-12){var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;p.expression="($T-("+lo+"))/("+range+")";
                  if(!p.executeOn(w.mainView,false))throw new Error("Chooser native linear pass failed");}
               linearTime=SmartTools.now()-t;t=SmartTools.now();
               // Validate the displayed transform without another image scan.
               for(var yy=0;yy<6;yy++)for(var xx=0;xx<8;xx++)for(var c=0;c<C;c++){
                  var x=Math.min(src.width-1,Math.floor((xx+.5)*src.width/8)),y=Math.min(src.height-1,Math.floor((yy+.5)*src.height/6));
                  var expected=self.quickFaintValue(src.sample(x,y,c),parameters[c]);if(linear.checked&&range>1e-12)expected=Math.max(0,Math.min(1,(expected-lo)/range));
                  var actual=w.mainView.image.sample(x,y,c);if(!isFinite(actual)||Math.abs(actual-expected)>2e-7)throw new Error("Chooser native reference validation failed");
               }image=w.mainView.image;borrowed=true;
            }catch(e){nativeAvailable=false;console.warningln("[Quick Stretch Preview] Native fallback: "+e);}
            if(image==null){image=self.quickFaintPass(src,parameters);stretchTime=SmartTools.now()-t;t=SmartTools.now();
               if(linear.checked){var adjusted=self.quickLinearPass(image);image.free();image=adjusted;}
               linearTime=SmartTools.now()-t;t=SmartTools.now();}
            if(nebula.checked){var faintResult=self.quickNebulosityPass(image,nebulaStrength.value,false,false);if(!borrowed)image.free();image=faintResult;borrowed=false;}
            if(highContrast.checked){var enhanced=self.applyAutoHighContrast(image,true);if(!borrowed)image.free();image=enhanced;borrowed=false;}
            if(colorEnhance.checked){var colorResult=self.applyAutoColorBrightness(image,brightnessStrength.value,vibranceStrength.value,false);if(colorResult!==image){if(!borrowed)image.free();image=colorResult;borrowed=false;}}
            if(endpointTest.checked){var lifted=SQSShadowLift(image);if(!borrowed)image.free();image=lifted;borrowed=false;}
            bitmap=image.render();renderTime=SmartTools.now()-t;label.text="Stretch Aggressiveness: "+slider.value;lastKey=key;panel.update();
            console.writeln("[Quick Stretch Preview] "+(borrowed?"native":"JS")+" | stretch="+(stretchTime/1000).toFixed(3)+" s | linear="+(linearTime/1000).toFixed(3)+" s | validation/render="+(renderTime/1000).toFixed(3)+" s | total="+((SmartTools.now()-start)/1000).toFixed(3)+" s");
         }finally{if(image&&!borrowed)image.free();busy=false;}
      }
      timer.onTimeout=function(){refresh();};
      slider.onValueUpdated=function(){label.text="Stretch Aggressiveness: "+slider.value;timer.stop();if(!closed)timer.start();};
      linear.onCheck=highContrast.onCheck=endpointTest.onCheck=function(){refresh();};
      nebula.onCheck=function(){nebulaStrength.enabled=nebula.checked;refresh();};
      nebulaStrength.onValueUpdated=function(){timer.stop();if(!closed)timer.start();};
      colorEnhance.onCheck=function(){brightnessStrength.enabled=vibranceStrength.enabled=colorEnhance.checked;refresh();};
      brightnessStrength.onValueUpdated=vibranceStrength.onValueUpdated=function(){timer.stop();if(!closed)timer.start();};
      var stretchColumn=new VerticalSizer;stretchColumn.spacing=4;stretchColumn.add(label);stretchColumn.add(slider);
      var controls=new VerticalSizer;controls.spacing=6;controls.add(stretchColumn);controls.add(linear);controls.add(endpointTest);controls.add(nebula);controls.add(nebulaStrength);controls.add(highContrast);controls.add(colorEnhance);controls.add(colorRow);
      var ok=new PushButton(d);ok.text=STHoverCaption(ok,"OK",0);ok.onClick=function(){refresh();chosen=linear.checked?3:1;d.ok();};
      var reset=new PushButton(d);reset.text=STHoverCaption(reset,"Reset",0);reset.toolTip="Restore aggressiveness 50, linear black / white and Auto High Contrast enabled, Faint Nebulosity disabled (0.35); Auto Color & Brightness disabled (brightness 0.35, vibrance 0.25).";
      reset.onClick=function(){timer.stop();slider.value=50;linear.checked=!analysisBase;endpointTest.checked=false;highContrast.checked=!recipeHasContrast;nebula.checked=false;nebulaStrength.setValue(.35);nebulaStrength.enabled=false;colorEnhance.checked=false;brightnessStrength.setValue(.35);vibranceStrength.setValue(.25);brightnessStrength.enabled=vibranceStrength.enabled=false;refresh();};
      var cancel=STHoverAttach(new PushButton(d),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){timer.stop();d.cancel();};
      var buttons=new HorizontalSizer;buttons.spacing=6;buttons.add(reset);buttons.addStretch();buttons.add(ok);buttons.add(cancel);
      var info=new Label(d);info.text="STF-style RGB curves can clip shadows and change color balance. OK creates a new full-resolution image with these settings. The original is unchanged.";info.wordWrapping=true;
      d._stBody=new VerticalSizer;d._stBody.margin=10;d._stBody.spacing=8;d._stBody.add(panel);d._stBody.add(controls);d._stBody.add(info);d._stBody.add(buttons);d._stFooter=buttons;
      try{refresh();STScreenFit.adjust(d);STScreenFit.execute(d);if(chosen>=0){self.shadowLiftEnabled=endpointTest.checked;self.quickAnalysisRecipe=selectedStart.recipe?SSTCopy(selectedStart.recipe):null;self.basicStretchFaintParameters=parameters;self.quickNebulosityEnabled=nebula.checked;self.quickNebulosityStrength=nebulaStrength.value;self.autoColorBrightnessEnabled=colorEnhance.checked;self.autoBrightnessStrength=brightnessStrength.value;self.autoVibranceStrength=vibranceStrength.value;self.autoColorBrightness_Button.text=colorEnhance.checked?"Remove Color & Brightness":"Auto Color & Brightness";self.autoHighContrastEnabled=highContrast.checked;self.autoHighContrast_Button.text=highContrast.checked?"Remove High Contrast":"Auto High Contrast";}return chosen;}
      finally{closed=true;timer.stop();bitmap=null;if(analysisBase)analysisBase.free();var closeStart=SmartTools.now();SmartTools.closeWindowPool(pool);console.writeln("[Quick Stretch Preview] Close cleanup="+((SmartTools.now()-closeStart)/1000).toFixed(3)+" s");}
   };

 this.process=function(src,linear,forceJS,progress){var result=null,analysis=null,priorNativeDisabled=SST_NATIVE_DISABLED;SST_NATIVE_DISABLED=!!forceJS;
  function report(value,stage){if(progress)progress(value,stage);}
  var stageStarted=SmartTools.now(),stageName="Preparation";
  function stage(lo,hi,label){console.writeln("[Quick native timing] "+stageName+"="+SmartTools.elapsed(stageStarted));stageStarted=SmartTools.now();stageName=label;report(lo,label);self.fullResolutionProgress=function(f){report(lo+(hi-lo)*f,label);};}
  function replace(next){if(next!==result){if(result)result.free();result=next;}}
  try{
   console.writeln("[Smart Quick Stretch] Selected start mode="+(self.quickAnalysisRecipe?"Image Analysis":"STF-Style")+(self.quickAnalysisRecipe?" | recipe="+self.quickAnalysisRecipe.id+" | family="+SST_FAMILIES[self.quickAnalysisRecipe.family]+" | quick="+!!self.quickAnalysisRecipe.quick:""));
   console.writeln("[Smart Quick Stretch] Full image: "+(forceJS?"exact JS":"native where available"));
   report(2,forceJS?"Retrying full-resolution processing with exact JavaScript…":"Preparing full-resolution processing…");
   if(self.quickAnalysisRecipe){analysis=SSTProcess(src,self.quickAnalysisRecipe,function(f,label){report(2+38*f,"Image Analysis: "+label);});src=analysis;}
   var identity=!!self.basicStretchFaintParameters&&self.basicStretchFaintParameters.every(function(p){return p.black===0&&p.midtones===.5;});
   stage(self.quickAnalysisRecipe?40:3,60,identity?"Identity adjustment — retaining processed pixels…":"Applying full-resolution STF-style stretch…");
   if(identity){result=src;if(analysis===src)analysis=null;else result=new Image(src);console.writeln("[Smart Quick Stretch] Identity STF skipped; no redundant image copy");}
   else result=!forceJS&&typeof HistogramTransformation!="undefined"?self.processNativeQuickFaint(src,false):self.quickFaintPass(src);
   if(linear){stage(60,70,"Measuring and applying linked black/white endpoints…");replace(!forceJS&&typeof PixelMath!="undefined"?self.processNativeQuickLinear(result,false):self.quickLinearPass(result));}
   if(self.quickNebulosityEnabled){stage(70,80,"Building protection and lifting faint nebulosity…");replace(self.quickNebulosityPass(result,self.quickNebulosityStrength,false,forceJS));}
   if(self.autoHighContrastEnabled){stage(80,87,"Building and applying Auto High Contrast…");replace(self.applyAutoHighContrast(result,true,forceJS));}
   if(self.autoColorBrightnessEnabled){stage(87,94,"Applying Auto Color & Brightness…");replace(self.applyAutoColorBrightness(result,self.autoBrightnessStrength,self.autoVibranceStrength,forceJS));}
   if(self.shadowLiftEnabled){stage(94,95,"Gently lifting faint detail while protecting highlights…");replace(SQSShadowLift(result,function(f){report(94+f,"Gently lifting faint detail while protecting highlights…");}));}
   console.writeln("[Quick native timing] "+stageName+"="+SmartTools.elapsed(stageStarted));report(95,"Full-resolution processing complete…");return result;
  }catch(e){if(result)result.free();throw e;}finally{SST_NATIVE_DISABLED=priorNativeDisabled;self.fullResolutionProgress=null;if(analysis)analysis.free();}
 };
 this.dispose=function(){self.clearQuickNebulosityGuide();if(self.autoContrastCache){self.autoContrastCache.map.free();self.autoContrastCache=null;}SmartTools.closeWindowPool(self.nativeQuickFaintWorkspace);};
}
// Linked shadow gain: preserve black and RGB ratios; bright cores receive no lift.
function SQSHasGHSReference(p){if(!p)return false;if(p.referenceCurve)return true;if(p.recipeBlend)for(var i=0;i<p.recipeBlend.recipes.length;i++)if(SQSHasGHSReference(p.recipeBlend.recipes[i]))return true;return false;}
function SQSShadowLiftValues(v){var peak=Math.max.apply(null,v),gain=1+.50*(1-SSTSmooth((peak-.15)/.50));
 return v.map(function(x){return x*gain;});}
function SQSNativeShadowLift(source,progress){var pool={},out=null,C=source.numberOfChannels,t=SmartTools.now();
 try{if(progress)progress(.05);var w=SmartTools.acquireWindow(pool,"ShadowNative",source.width,source.height,C,64,C==3);
  SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(source);}finally{w.mainView.endProcess();}
  var id=w.mainView.id,peak=C==1?id:"max("+id+"[0],max("+id+"[1],"+id+"[2]))";
  var code="npP="+peak+";npT=min(1,max(0,(npP-0.15)/0.50));npA=1+0.50*(1-npT*npT*(3-2*npT));";
  if(progress)progress(.20);var gain=SSTNativeScalarMap(w.mainView,pool,"ShadowGain",code,"npA");SSTNativeSingle(w.mainView,"$T*"+gain.mainView.id);
  SSTNativeValidate(w.mainView.image,function(x,y){var v=[];for(var c=0;c<C;c++)v.push(source.sample(x,y,c));return SQSShadowLiftValues(v);});
  out=new Image(w.mainView.image);if(progress)progress(1);console.writeln("[Quick Shadow Lift] Native total="+SmartTools.elapsed(t));var result=out;out=null;return result;
 }finally{if(out)out.free();SmartTools.closeWindowPool(pool);}}
function SQSShadowLift(source,progress){if(SSTNativeAvailable(source))try{return SQSNativeShadowLift(source,progress);}catch(e){console.warningln("[Quick Shadow Lift] Native rejected; exact JS fallback: "+e);}
 var out=new Image(source),changed=0,total=source.width*source.height;
 try{for(var y=0;y<source.height;y++){for(var x=0;x<source.width;x++){var v=[];for(var c=0;c<source.numberOfChannels;c++)v.push(source.sample(x,y,c));
  var a=SQSShadowLiftValues(v);if(Math.abs(a[0]-v[0])>1e-7)changed++;for(c=0;c<a.length;c++)out.setSample(a[c],x,y,c);}
  if(progress&&y%32==0)progress((y+1)/source.height);}
  console.writeln("[Quick Shadow Lift] up to 50% linked gain; changed first-channel pixels="+(100*changed/Math.max(1,total)).toFixed(2)+"%; peak >= 0.65 unchanged");return out;
 }catch(e){out.free();throw e;}}
function SQSWorking(src){var maxW=1280,maxH=760,scale=Math.min(1,maxW/src.width,maxH/src.height),displayW=Math.max(1,Math.floor(src.width*scale)),displayH=Math.max(1,Math.floor(src.height*scale)),pw=Math.max(1,Math.floor(displayW/2)),ph=Math.max(1,Math.floor(displayH*pw/displayW));
 var out=new Image(src);try{if(pw!=src.width||ph!=src.height)out.resample(pw/src.width,ph/src.height);out.resetSelections();return out;}catch(e){out.free();throw e;}
}
function SQSSelect(){var d=new Dialog;d.windowTitle="Smart Quick Stretch — source and target";
 var label=new Label(d);label.text="Select a linear floating-point grayscale or RGB main image.";
 var views=STHoverAttach(new ViewList(d),"Choose an open source image to analyze or process.");views.getMainViews();var active=ImageWindow.activeWindow;if(!active.isNull)views.currentView=active.mainView;
 var targetChoice=new ComboBox(d);for(var ti=0;ti<SST_TARGETS.length;ti++)targetChoice.addItem(SST_TARGETS[ti]);targetChoice.currentItem=0;targetChoice.toolTip="Select the target type so Image Analysis uses the appropriate stretch brackets and learned preferences.";
 var paletteChoice=new ComboBox(d);for(var pi=0;pi<SST_PALETTES.length;pi++)paletteChoice.addItem(SST_PALETTES[pi]);paletteChoice.currentItem=0;paletteChoice.toolTip="Choose Broadband RGB, SHO, or HOO to match how your image channels were combined.";
 var targetLabel=new Label(d);targetLabel.text="Target type:";var paletteLabel=new Label(d);paletteLabel.text="Palette:";
 var ok=new PushButton(d);ok.text=STHoverCaption(ok,"Continue",0);ok.onClick=function(){if(views.currentView.isNull){new MessageBox("Select a main image.","Smart Quick Stretch",StdIcon_Error,StdButton_Ok).execute();return;}d.ok();};
 var cancel=STHoverAttach(new PushButton(d),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){d.cancel();};
 var row=new HorizontalSizer;row.spacing=6;row.addStretch();row.add(ok);row.add(cancel);
 d._stBody=new VerticalSizer;d._stBody.margin=10;d._stBody.spacing=8;d._stBody.add(label);d._stBody.add(views);d._stBody.add(targetLabel);d._stBody.add(targetChoice);d._stBody.add(paletteLabel);d._stBody.add(paletteChoice);d._stBody.add(row);d._stFooter=row;STScreenFit.adjust(d);return STScreenFit.execute(d)?{view:views.currentView,target:SST_TARGETS[targetChoice.currentItem],palette:SST_PALETTES[paletteChoice.currentItem]}:null;
}
function SQSMain(){console.writeln("[Smart Quick Stretch] Build "+SQS_VERSION+" | 32-bit gain-map experiment");var snapshot=null,working=null,model=null,out=null,window=null,busy=null;
 function progress(value,stage){if(busy){busy.setProgress(value,stage);processEvents();}}
 try{var selected=SQSSelect();if(!selected)return;var view=selected.view;if(!view||view.isNull)return;
  if(view.image.sampleType!=SampleType_Real)throw new Error("Convert the source to 32-bit or 64-bit floating point before running Smart Quick Stretch.");
  if(view.image.numberOfChannels!=1&&view.image.numberOfChannels!=3)throw new Error("Use grayscale or RGB without alpha channels.");
  snapshot=new Image(view.image);snapshot.resetSelections();working=SQSWorking(snapshot);model=new SQSModel(working);model.quickTarget=selected.target;model.quickPalette=selected.palette;model.quickAnalysisSource=snapshot;
  console.writeln("[Smart Quick Stretch] Target="+selected.target+" | palette="+selected.palette);
  var choice=model.chooseQuickStretch(null);if(choice<0)return;
  busy=new SmartStretchBusyDialog;busy.windowTitle="Smart Quick Stretch — Creating native image";
  busy.message_Label.text="<b>Creating your full-resolution image…</b><br/>The preview has closed. Processing continues below; please wait.";
  busy.onClose=function(){return false;};STScreenFit.adjust(busy);STScreenFit.show(busy);var fullStart=SmartTools.now();progress(0,"Preparing selected recipe…");
  try{out=model.process(snapshot,choice>=2,false,progress);}catch(nativeError){console.warningln("[Smart Quick Stretch] Native processing rejected; retrying exact JavaScript pipeline: "+nativeError);progress(1,"Native pass failed; retrying exact JavaScript…");out=model.process(snapshot,choice>=2,true,progress);}
  progress(95,"Creating full-resolution output window…");
  window=new ImageWindow(out.width,out.height,out.numberOfChannels,snapshot.bitsPerSample==64?64:32,true,out.numberOfChannels==3,"SmartQuickStretch");
  progress(97,"Copying the processed pixels to the output image…");
  SmartTools.beginPrivateProcess(window.mainView);try{window.mainView.image.assign(out);}finally{window.mainView.endProcess();}
  progress(99,"Displaying the output image…");
  window.show();window.zoomToFit();progress(100,"Native image created; releasing temporary images…");console.writeln("[Smart Quick Stretch] Created "+window.mainView.fullId+" from "+view.fullId+"; original unchanged.");window=null;
 }catch(e){if(busy)busy.hide();console.criticalln(String(e));new MessageBox(String(e),"Smart Quick Stretch",StdIcon_Error,StdButton_Ok).execute();}
 finally{try{progress(100,"Releasing temporary processing images…");if(window)window.forceClose();if(out)out.free();if(model)model.dispose();if(working)working.free();if(snapshot)snapshot.free();}finally{if(busy)busy.hide();if(typeof fullStart!="undefined")console.writeln("[Quick wall time] Accepted preview through output/cleanup="+SmartTools.elapsed(fullStart));}}
}
SQSMain();
